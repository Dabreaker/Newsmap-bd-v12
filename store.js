// store.js — Vercel Blob-only storage
// Layout:
//   db/users.json        → { [id]: userObj, _phone: { [phone]: id }, _count: N }
//   db/news/{id}.json    → newsObj (with embedded votes)
//   db/cells.json        → { [cell_key]: news_id }  (active cell index)
//   db/owner/{uid}.json  → [news_id, ...]
//   db/notif/{uid}.json  → [notifObj, ...]  (capped 50)
//   db/stats.json        → { news_count, vote_count }

'use strict';

const { put, head, del, list } = require('@vercel/blob');

const BASE = 'db';
const TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

// ── LOW-LEVEL ─────────────────────────────────
async function readJSON(path) {
  try {
    const url = await getUrl(path);
    if (!url) return null;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function writeJSON(path, data) {
  const body = JSON.stringify(data);
  await put(`${BASE}/${path}`, body, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    token: TOKEN()
  });
}

// Cache blob URLs per process lifetime (warm lambdas reuse this)
const _urlCache = {};
async function getUrl(path) {
  const key = `${BASE}/${path}`;
  if (_urlCache[key]) return _urlCache[key];
  try {
    const info = await head(key, { token: TOKEN() });
    _urlCache[key] = info.url;
    return info.url;
  } catch { return null; }
}

function bustUrl(path) {
  delete _urlCache[`${BASE}/${path}`];
}

// ── USERS ─────────────────────────────────────
async function getUsers() {
  return (await readJSON('users.json')) || { _phone: {}, _count: 0 };
}

async function saveUsers(data) {
  bustUrl('users.json');
  await writeJSON('users.json', data);
}

async function getUserByPhone(phone) {
  const data = await getUsers();
  const id = data._phone[phone];
  if (!id) return null;
  return data[id] || null;
}

async function getUserById(id) {
  const data = await getUsers();
  return data[id] || null;
}

async function createUser(userData) {
  const data = await getUsers();
  data._count = (data._count || 0) + 1;
  const id = data._count;
  const user = { ...userData, id };
  data[id] = user;
  data._phone[userData.phone] = id;
  await saveUsers(data);
  return user;
}

async function updateUser(id, patch) {
  const data = await getUsers();
  if (!data[id]) return null;
  data[id] = { ...data[id], ...patch };
  await saveUsers(data);
  return data[id];
}

async function getAllUsers(limit = 200) {
  const data = await getUsers();
  return Object.values(data)
    .filter(v => v && typeof v === 'object' && v.id)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

// ── NEWS ──────────────────────────────────────
async function getNews(id) {
  return readJSON(`news/${id}.json`);
}

async function createNews(newsData) {
  const news = { ...newsData, votes: {} };
  bustUrl(`news/${news.id}.json`);
  await writeJSON(`news/${news.id}.json`, news);
  // Update cell index
  await updateCells(cells => { cells[news.cell_key] = news.id; return cells; });
  // Update owner index
  await updateOwnerIndex(news.owner_id, ids => {
    if (!ids.includes(news.id)) ids.unshift(news.id);
    return ids.slice(0, 200);
  });
  return news;
}

async function deleteNews(id, news) {
  bustUrl(`news/${id}.json`);
  await Promise.all([
    del(`${BASE}/news/${id}.json`, { token: TOKEN() }).catch(() => {}),
    updateCells(cells => { delete cells[news.cell_key]; return cells; }),
    updateOwnerIndex(news.owner_id, ids => ids.filter(i => i !== id))
  ]);
}

async function getRegionNews(lat, lon) {
  // List all news blobs in db/news/ prefix and fetch non-expired ones
  // This is the main query — Blob list is paginated but fast for <1000 files
  const cutoff = nowSec() - 36 * 3600;
  const dlat = 0.09, dlon = 0.10;

  const { blobs } = await list({ prefix: `${BASE}/news/`, token: TOKEN() });
  if (!blobs.length) return [];

  // Batch fetch all news in parallel (Blob CDN is fast)
  const items = await Promise.all(
    blobs.map(b => fetch(b.url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null))
  );

  return items.filter(n =>
    n &&
    n.created_at > cutoff &&
    Math.abs(n.lat - lat) <= dlat &&
    Math.abs(n.lon - lon) <= dlon
  );
}

async function getOwnerNews(userId) {
  const ids = await readJSON(`owner/${userId}.json`) || [];
  const cutoff = nowSec() - 36 * 3600;
  const items = await Promise.all(ids.map(id => getNews(id)));
  return items.filter(n => n && n.created_at > cutoff).sort((a, b) => b.created_at - a.created_at);
}

// ── CELLS ─────────────────────────────────────
async function getCellOccupant(cellKey) {
  const cells = await readJSON('cells.json') || {};
  const newsId = cells[cellKey];
  if (!newsId) return null;
  // Verify news still exists and not expired
  const news = await getNews(newsId);
  if (!news || news.created_at <= nowSec() - 36 * 3600) {
    // Stale entry — clean it up
    await updateCells(c => { delete c[cellKey]; return c; });
    return null;
  }
  return newsId;
}

async function updateCells(fn) {
  bustUrl('cells.json');
  const cells = (await readJSON('cells.json')) || {};
  await writeJSON('cells.json', fn(cells));
}

async function updateOwnerIndex(userId, fn) {
  bustUrl(`owner/${userId}.json`);
  const ids = (await readJSON(`owner/${userId}.json`)) || [];
  await writeJSON(`owner/${userId}.json`, fn(ids));
}

// ── VOTES (embedded in news doc) ─────────────
async function upsertVote(newsId, userId, type, weight) {
  const news = await getNews(newsId);
  if (!news) return null;
  news.votes = news.votes || {};
  news.votes[String(userId)] = { type, weight, voted_at: nowSec() };
  bustUrl(`news/${newsId}.json`);
  await writeJSON(`news/${newsId}.json`, news);
  return { type, weight };
}

// ── SCORES ────────────────────────────────────
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
    votes: undefined,
    ...scores,
    expires_at: news.created_at + 36 * 3600,
    _myVote: myUserId && news.votes?.[String(myUserId)]?.type || null
  };
}

// ── NOTIFICATIONS ─────────────────────────────
async function getNotifications(userId) {
  return (await readJSON(`notif/${userId}.json`)) || [];
}

async function addNotification(userId, notif) {
  bustUrl(`notif/${userId}.json`);
  const existing = await getNotifications(userId);
  await writeJSON(`notif/${userId}.json`, [notif, ...existing].slice(0, 50));
}

async function markNotificationsSeen(userId) {
  bustUrl(`notif/${userId}.json`);
  const notifs = await getNotifications(userId);
  await writeJSON(`notif/${userId}.json`, notifs.map(n => ({ ...n, seen: true })));
}

// ── STATS ─────────────────────────────────────
async function getStats() {
  return (await readJSON('stats.json')) || { news_count: 0, vote_count: 0 };
}

async function incrStat(key, by = 1) {
  bustUrl('stats.json');
  const stats = await getStats();
  stats[key] = (stats[key] || 0) + by;
  await writeJSON('stats.json', stats);
}

async function decrStat(key, by = 1) {
  bustUrl('stats.json');
  const stats = await getStats();
  stats[key] = Math.max(0, (stats[key] || 0) - by);
  await writeJSON('stats.json', stats);
}

function nowSec() { return Math.floor(Date.now() / 1000); }

module.exports = {
  getUserByPhone, getUserById, createUser, updateUser, getAllUsers,
  getNews, createNews, deleteNews, getCellOccupant, getRegionNews, getOwnerNews,
  upsertVote, computeScores, enrichNews,
  getNotifications, addNotification, markNotificationsSeen,
  getStats, incrStat, decrStat,
  nowSec
};
