// store.js — Vercel KV data layer
// Key schema:
//   user:phone:{phone}        → user id (string)
//   user:{id}                 → full user object (JSON)
//   user:count                → integer counter
//   news:{id}                 → full news object (JSON) with embedded votes map
//   cell:{cell_key}           → news id (string) — cell occupancy index
//   region:{gi}:{gj}          → Set of news ids in that geo-tile
//   owner:{user_id}           → Set of news ids by this user
//   notif:{user_id}           → List of notification objects (JSON, capped at 50)

// A "geo-tile" groups cells into ~50km² buckets for region queries.
// REGION_TILE = 0.45 degrees (~50km). One tile covers ~2500 cells.
// On GET /api/region we read exactly the 4 surrounding tiles = 4 KV gets.

'use strict';

const { kv } = require('@vercel/kv');

// ── TILE HELPERS ─────────────────────────────
const TILE = 0.45;
function tileKey(lat, lon) {
  return `region:${Math.floor(lat / TILE)}:${Math.floor(lon / TILE)}`;
}
function surroundingTiles(lat, lon) {
  const keys = new Set();
  for (let dlat = -TILE; dlat <= TILE; dlat += TILE) {
    for (let dlon = -TILE; dlon <= TILE; dlon += TILE) {
      keys.add(tileKey(lat + dlat, lon + dlon));
    }
  }
  return [...keys];
}

// ── USER ──────────────────────────────────────
async function getUserByPhone(phone) {
  const id = await kv.get(`user:phone:${phone}`);
  if (!id) return null;
  return kv.get(`user:${id}`);
}

async function getUserById(id) {
  return kv.get(`user:${id}`);
}

async function createUser(userData) {
  // Atomic-ish: increment counter, store user + phone index
  const id = await kv.incr('user:count');
  const user = { ...userData, id };
  await Promise.all([
    kv.set(`user:${id}`, user),
    kv.set(`user:phone:${userData.phone}`, id)
  ]);
  return user;
}

async function updateUser(id, patch) {
  const user = await getUserById(id);
  if (!user) return null;
  const updated = { ...user, ...patch };
  await kv.set(`user:${id}`, updated);
  return updated;
}

async function getAllUsers(limit = 200) {
  const count = (await kv.get('user:count')) || 0;
  const ids = Array.from({ length: Math.min(count, limit) }, (_, i) => `user:${count - i}`);
  if (!ids.length) return [];
  const users = await kv.mget(...ids);
  return users.filter(Boolean);
}

// ── NEWS ──────────────────────────────────────
// News object shape stored in KV:
// { id, owner_id, username, title, description, lat, lon, cell_key,
//   links, images, thumb, created_at,
//   votes: { [user_id]: { type, weight, voted_at } }   ← embedded!
// }
// Embedding votes eliminates a separate votes collection entirely.
// real_score / fake_score are computed on read, never stored.

function computeScores(news) {
  const votes = news.votes || {};
  let real_score = 0, fake_score = 0, vote_count = 0;
  for (const v of Object.values(votes)) {
    vote_count++;
    if (v.type === 'real') real_score += v.weight;
    else fake_score += v.weight;
  }
  return { real_score, fake_score, vote_count };
}

function enrichNews(news, myUserId = null) {
  if (!news) return null;
  const scores = computeScores(news);
  return {
    ...news,
    votes: undefined,   // strip embedded votes from response
    ...scores,
    expires_at: news.created_at + 36 * 3600,
    _myVote: myUserId && news.votes?.[myUserId]?.type || null
  };
}

async function getNews(id) {
  return kv.get(`news:${id}`);
}

async function getManyNews(ids) {
  if (!ids.length) return [];
  const keys = ids.map(id => `news:${id}`);
  const results = await kv.mget(...keys);
  return results.filter(Boolean);
}

async function createNews(newsData) {
  const news = { ...newsData, votes: {} };
  const tile = tileKey(news.lat, news.lon);
  const ttl = 36 * 3600 + 300; // 36h + 5min buffer

  await Promise.all([
    kv.set(`news:${news.id}`, news, { ex: ttl }),
    kv.set(`cell:${news.cell_key}`, news.id, { ex: ttl }),
    kv.sadd(tile, news.id),
    kv.sadd(`owner:${news.owner_id}`, news.id)
  ]);
  // Set tile TTL to max 48h (tiles outlive individual news)
  await kv.expire(tile, 48 * 3600);
  return news;
}

async function deleteNews(newsId, news) {
  // news object passed in to avoid extra get
  const tile = tileKey(news.lat, news.lon);
  await Promise.all([
    kv.del(`news:${newsId}`),
    kv.del(`cell:${news.cell_key}`),
    kv.srem(tile, newsId),
    kv.srem(`owner:${news.owner_id}`, newsId)
  ]);
}

async function getCellOccupant(cellKey) {
  return kv.get(`cell:${cellKey}`);
}

async function getRegionNews(lat, lon) {
  const tiles = surroundingTiles(lat, lon);
  // Batch: one SMEMBERS per tile (4 total)
  const sets = await Promise.all(tiles.map(t => kv.smembers(t)));
  const allIds = [...new Set(sets.flat().filter(Boolean))];
  if (!allIds.length) return [];
  const items = await getManyNews(allIds);
  const cutoff = nowSec() - 36 * 3600;
  return items.filter(n => n && n.created_at > cutoff);
}

async function getOwnerNews(userId) {
  const ids = await kv.smembers(`owner:${userId}`);
  if (!ids.length) return [];
  const items = await getManyNews(ids);
  const cutoff = nowSec() - 36 * 3600;
  return items.filter(n => n && n.created_at > cutoff).sort((a, b) => b.created_at - a.created_at);
}

// ── VOTES (embedded in news) ──────────────────
async function upsertVote(newsId, userId, type, weight) {
  const news = await getNews(newsId);
  if (!news) return null;
  news.votes = news.votes || {};
  news.votes[userId] = { type, weight, voted_at: nowSec() };
  const ttlLeft = (news.created_at + 36 * 3600) - nowSec();
  if (ttlLeft > 0) await kv.set(`news:${newsId}`, news, { ex: ttlLeft + 300 });
  return { type, weight };
}

// ── NOTIFICATIONS ─────────────────────────────
// Stored as a single JSON list per user (capped at 50, prepend new)
async function getNotifications(userId) {
  const data = await kv.get(`notif:${userId}`);
  return data || [];
}

async function addNotification(userId, notif) {
  const existing = await getNotifications(userId);
  const updated = [notif, ...existing].slice(0, 50);
  await kv.set(`notif:${userId}`, updated, { ex: 7 * 24 * 3600 }); // 7 day TTL
}

async function markNotificationsSeen(userId) {
  const notifs = await getNotifications(userId);
  const updated = notifs.map(n => ({ ...n, seen: true }));
  await kv.set(`notif:${userId}`, updated, { ex: 7 * 24 * 3600 });
}

// ── UTILS ─────────────────────────────────────
function nowSec() { return Math.floor(Date.now() / 1000); }

// ── ADMIN STATS ───────────────────────────────
async function getStats() {
  const user_count = (await kv.get('user:count')) || 0;
  // Scan tiles for live news (approximation — full scan not practical in Redis)
  // Instead return a stored counter we maintain
  const news_count = (await kv.get('stats:news_count')) || 0;
  const vote_count = (await kv.get('stats:vote_count')) || 0;
  return { user_count, news_count, vote_count };
}

async function incrStat(key, by = 1) {
  await kv.incrby(`stats:${key}`, by);
}
async function decrStat(key, by = 1) {
  await kv.decrby(`stats:${key}`, by);
}

module.exports = {
  getUserByPhone, getUserById, createUser, updateUser, getAllUsers,
  getNews, getManyNews, createNews, deleteNews, getCellOccupant,
  getRegionNews, getOwnerNews, enrichNews,
  upsertVote,
  getNotifications, addNotification, markNotificationsSeen,
  getStats, incrStat, decrStat,
  tileKey, surroundingTiles, computeScores, nowSec
};
