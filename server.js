// server.js — জনবার্তা API Server (Vercel Serverless)
'use strict';

const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { ObjectId, GridFSBucket } = require('mongodb');
const path       = require('path');

const { initDB, col, db } = require('./db');
const { authMiddleware, optionalAuth } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DB middleware ────────────────────────────
app.use(async (req, res, next) => {
  try { await initDB(); next(); } catch (e) { res.status(503).json({ error: 'DB connection failed' }); }
});

// ── MULTER ────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Invalid file type'), ok);
  }
});

// ── HELPERS ───────────────────────────────────
const GRID_DLAT = 50 / 111000;
const GRID_DLON = 50 / (111000 * Math.cos(23.5 * Math.PI / 180));

function snapToCell(lat, lon) {
  const ci = Math.floor(lat / GRID_DLAT);
  const cj = Math.floor(lon / GRID_DLON);
  return { lat: (ci + 0.5) * GRID_DLAT, lon: (cj + 0.5) * GRID_DLON, key: `${ci}:${cj}` };
}

function hav(lat1, lon1, lat2, lon2) {
  const R = 6371, r = d => d * Math.PI / 180;
  const a = Math.sin(r(lat2-lat1)/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(r(lon2-lon1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function voteWeight(distKm) { return Math.max(0.2, 1.0 - (distKm / 5.0) * 0.8); }

const PREFIXES = ['প্রতিবেদক','সংবাদদাতা','নাগরিক','জনতা','বার্তাবাহক'];
function anonName(id) { return PREFIXES[id % 5] + '_' + (1000 + id); }

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('880') && d.length === 13) return '0' + d.slice(3);
  if (d.length === 11 && d.startsWith('01')) return d;
  return null;
}

function nowSec() { return Math.floor(Date.now() / 1000); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function maskPhone(p) {
  if (!p || p.length < 8) return p;
  return p.slice(0, 4) + '****' + p.slice(-2);
}

const VERSION = '1.0.0';

// ── STORE IMAGE IN GRIDFS ─────────────────────
async function storeImage(buffer, mimetype, newsId, index) {
  const bucket = new GridFSBucket(db(), { bucketName: 'images' });
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(`img_${newsId}_${index}`, {
      metadata: { newsId, index },
      contentType: mimetype
    });
    uploadStream.on('finish', () => resolve(uploadStream.id.toString()));
    uploadStream.on('error', reject);
    uploadStream.end(buffer);
  });
}

async function deleteNewsImages(newsId) {
  const bucket = new GridFSBucket(db(), { bucketName: 'images' });
  const files = await bucket.find({ 'metadata.newsId': newsId }).toArray();
  for (const f of files) {
    try { await bucket.delete(f._id); } catch {}
  }
}

// ── AGGREGATE VOTES ───────────────────────────
async function aggregateVotes(newsIds) {
  if (!newsIds.length) return {};
  const votes = await col('votes').find({ news_id: { $in: newsIds } }).toArray();
  const map = {};
  for (const v of votes) {
    if (!map[v.news_id]) map[v.news_id] = { real_score: 0, fake_score: 0, vote_count: 0 };
    map[v.news_id].vote_count++;
    if (v.type === 'real') map[v.news_id].real_score += v.weight;
    else map[v.news_id].fake_score += v.weight;
  }
  return map;
}

// ══════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════

// ── STATUS ────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const news_count = await col('news').countDocuments();
  res.json({ ok: true, news_count, version: VERSION });
});

// ── AUTH ─────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body;
    const phone = normPhone(rawPhone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password minimum 6 characters' });

    const existing = await col('users').findOne({ phone });
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const count = await col('users').countDocuments();
    const id = count + 1;
    const username = anonName(id);
    const password_hash = await bcrypt.hash(password, 10);
    const adminPhones = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim());
    const isAdmin = adminPhones.includes(phone);

    await col('users').insertOne({ id, phone, username, password_hash, trust_score: 1.0, banned: false, admin: isAdmin, created_at: nowSec() });

    const token = jwt.sign({ id, username, admin: isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, anon_id: id, username, admin: isAdmin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body;
    const phone = normPhone(rawPhone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone number' });

    const user = await col('users').findOne({ phone });
    if (!user) return res.status(401).json({ error: 'Phone or password incorrect' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Phone or password incorrect' });

    const adminPhones = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim());
    const isAdmin = adminPhones.includes(phone) || user.admin;
    const token = jwt.sign({ id: user.id, username: user.username, admin: isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, anon_id: user.id, username: user.username, admin: isAdmin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST NEWS ─────────────────────────────────
app.post('/api/news', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, lat: rawLat, lon: rawLon, links, user_lat, user_lon } = req.body;
    if (!title || title.length > 120) return res.status(400).json({ error: 'Title required (max 120 chars)' });

    const lat = parseFloat(rawLat), lon = parseFloat(rawLon);
    const uLat = parseFloat(user_lat), uLon = parseFloat(user_lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'Invalid coordinates' });

    const cell = snapToCell(lat, lon);
    const dist = (!isNaN(uLat) && !isNaN(uLon)) ? hav(uLat, uLon, cell.lat, cell.lon) : 0;
    if (dist > 5) return res.status(403).json({ error: 'Must be within 5km to post' });

    // Check cell uniqueness
    const cutoff = nowSec() - 36 * 3600;
    const existing = await col('news').findOne({ cell_key: cell.key, created_at: { $gt: cutoff } });
    if (existing) return res.status(409).json({ error: 'Cell already occupied' });

    const id = uid();
    const user = await col('users').findOne({ id: req.user.id });
    if (!user || user.banned) return res.status(403).json({ error: 'Account banned' });

    // Upload images
    const imageUrls = [];
    for (let i = 0; i < (req.files || []).length; i++) {
      const f = req.files[i];
      const fileId = await storeImage(f.buffer, f.mimetype, id, i);
      imageUrls.push(`/api/images/${fileId}`);
    }

    const newsDoc = {
      id, owner_id: req.user.id, username: user.username,
      title: title.trim(), description: (description || '').slice(0, 1000),
      lat: cell.lat, lon: cell.lon, cell_key: cell.key,
      links: links || '', image_count: imageUrls.length,
      images: imageUrls, thumb: imageUrls[0] || null,
      created_at: nowSec()
    };
    await col('news').insertOne(newsDoc);

    // Notifications: find other users with news in 10km bbox
    try {
      const dlat = 0.09, dlon = 0.10;
      const nearbyNews = await col('news').find({
        lat: { $gte: cell.lat - dlat, $lte: cell.lat + dlat },
        lon: { $gte: cell.lon - dlon, $lte: cell.lon + dlon },
        owner_id: { $ne: req.user.id },
        created_at: { $gt: cutoff }
      }, { projection: { owner_id: 1, lat: 1, lon: 1 } }).toArray();

      const ownerSet = [...new Set(nearbyNews.map(n => n.owner_id))];
      if (ownerSet.length) {
        const notifs = ownerSet.map(uid => ({
          user_id: uid, news_id: id, title: title.slice(0, 80),
          dist_km: hav(cell.lat, cell.lon, nearbyNews.find(n => n.owner_id === uid).lat, nearbyNews.find(n => n.owner_id === uid).lon),
          seen: false, created_at: nowSec()
        }));
        await col('notifications').insertMany(notifs);
      }
    } catch {}

    res.json({ id, cell_key: cell.key, image_count: imageUrls.length });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Cell already occupied' });
    res.status(500).json({ error: e.message });
  }
});

// ── GET REGION ────────────────────────────────
app.get('/api/region', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 23.8103;
    const lon = parseFloat(req.query.lon) || 90.4125;
    const dlat = 0.09, dlon = 0.10;
    const cutoff = nowSec() - 36 * 3600;

    const rows = await col('news').find({
      lat: { $gte: lat - dlat, $lte: lat + dlat },
      lon: { $gte: lon - dlon, $lte: lon + dlon },
      created_at: { $gt: cutoff }
    }).sort({ created_at: -1 }).limit(2000).toArray();

    const ids = rows.map(r => r.id);
    const votesMap = await aggregateVotes(ids);

    const enriched = rows.map(r => ({
      ...r, _id: undefined,
      real_score: votesMap[r.id]?.real_score || 0,
      fake_score: votesMap[r.id]?.fake_score || 0,
      vote_count: votesMap[r.id]?.vote_count || 0,
      expires_at: r.created_at + 36 * 3600
    }));

    const markers = enriched.map(r => ({
      id: r.id, lat: r.lat, lon: r.lon, cell_key: r.cell_key,
      thumb: r.thumb, title: r.title,
      real_score: r.real_score, fake_score: r.fake_score, created_at: r.created_at
    }));

    const feed = [...enriched].sort((a, b) => (b.real_score - b.fake_score) - (a.real_score - a.fake_score)).slice(0, 20);

    res.json({ markers, feed, total: rows.length, ts: nowSec() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NEARBY (for cell check) ───────────────────
app.get('/api/news/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    const dlat = 0.09, dlon = 0.10;
    const cutoff = nowSec() - 36 * 3600;
    const rows = await col('news').find({
      lat: { $gte: lat - dlat, $lte: lat + dlat },
      lon: { $gte: lon - dlon, $lte: lon + dlon },
      created_at: { $gt: cutoff }
    }, { projection: { id: 1, lat: 1, lon: 1, cell_key: 1 } }).toArray();
    res.json(rows.map(r => ({ id: r.id, lat: r.lat, lon: r.lon, cell_key: r.cell_key })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET SINGLE NEWS ───────────────────────────
app.get('/api/news/:id', optionalAuth, async (req, res) => {
  try {
    const cutoff = nowSec() - 36 * 3600;
    const news = await col('news').findOne({ id: req.params.id, created_at: { $gt: cutoff } });
    if (!news) return res.status(404).json({ error: 'News not found or expired' });

    const votes = await col('votes').find({ news_id: news.id }).toArray();
    let real_score = 0, fake_score = 0;
    let myVote = null;
    for (const v of votes) {
      if (v.type === 'real') real_score += v.weight;
      else fake_score += v.weight;
      if (req.user && v.user_id === req.user.id) myVote = v.type;
    }

    res.json({ ...news, _id: undefined, real_score, fake_score, vote_count: votes.length, expires_at: news.created_at + 36 * 3600, _myVote: myVote });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE NEWS ───────────────────────────────
app.delete('/api/news/:id', authMiddleware, async (req, res) => {
  try {
    const news = await col('news').findOne({ id: req.params.id });
    if (!news) return res.status(404).json({ error: 'News not found' });

    const isOwner = news.owner_id === req.user.id;
    const withinTime = (nowSec() - news.created_at) < 10800;
    if (!req.user.admin && !(isOwner && withinTime)) return res.status(403).json({ error: 'Cannot delete this news' });

    await col('news').deleteOne({ id: req.params.id });
    await col('votes').deleteMany({ news_id: req.params.id });
    await col('notifications').deleteMany({ news_id: req.params.id });
    await deleteNewsImages(req.params.id);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VOTE ──────────────────────────────────────
app.post('/api/vote', authMiddleware, async (req, res) => {
  try {
    const { news_id, type, user_lat, user_lon } = req.body;
    if (!['real','fake'].includes(type)) return res.status(400).json({ error: 'Invalid vote type' });

    const cutoff = nowSec() - 36 * 3600;
    const news = await col('news').findOne({ id: news_id, created_at: { $gt: cutoff } });
    if (!news) return res.status(404).json({ error: 'News not found or expired' });

    const uLat = parseFloat(user_lat), uLon = parseFloat(user_lon);
    const dist = (!isNaN(uLat) && !isNaN(uLon)) ? hav(uLat, uLon, news.lat, news.lon) : 999;
    if (dist > 5) return res.status(403).json({ error: 'Must be within 5km to vote' });

    const weight = voteWeight(dist);
    await col('votes').updateOne(
      { news_id, user_id: req.user.id },
      { $set: { news_id, user_id: req.user.id, type, weight, voted_at: nowSec() } },
      { upsert: true }
    );

    res.json({ ok: true, type, weight });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MY NEWS ───────────────────────────────────
app.get('/api/my/news', authMiddleware, async (req, res) => {
  try {
    const cutoff = nowSec() - 36 * 3600;
    const rows = await col('news').find({ owner_id: req.user.id, created_at: { $gt: cutoff } }).sort({ created_at: -1 }).toArray();
    const ids = rows.map(r => r.id);
    const votesMap = await aggregateVotes(ids);
    res.json(rows.map(r => ({ ...r, _id: undefined, real_score: votesMap[r.id]?.real_score || 0, fake_score: votesMap[r.id]?.fake_score || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATIONS ─────────────────────────────
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await col('notifications').find({ user_id: req.user.id }).sort({ created_at: -1 }).limit(50).toArray();
    const unseen = notifications.filter(n => !n.seen).length;
    res.json({ notifications: notifications.map(n => ({ ...n, _id: undefined })), unseen });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/seen', authMiddleware, async (req, res) => {
  try {
    await col('notifications').updateMany({ user_id: req.user.id, seen: false }, { $set: { seen: true } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── IMAGES ────────────────────────────────────
app.get('/api/images/:fileId', async (req, res) => {
  try {
    const bucket = new GridFSBucket(db(), { bucketName: 'images' });
    const id = new ObjectId(req.params.fileId);
    const files = await bucket.find({ _id: id }).toArray();
    if (!files.length) return res.status(404).json({ error: 'Image not found' });

    res.setHeader('Content-Type', files[0].contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    bucket.openDownloadStream(id).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REAPER ────────────────────────────────────
app.get('/api/reaper', async (req, res) => {
  try {
    if (req.query.secret !== process.env.JWT_SECRET) return res.status(403).json({ error: 'Forbidden' });
    const cutoff = nowSec() - 36 * 3600;
    const expired = await col('news').find({ created_at: { $lte: cutoff } }, { projection: { id: 1 } }).toArray();
    const ids = expired.map(n => n.id);
    if (ids.length) {
      await col('news').deleteMany({ id: { $in: ids } });
      await col('votes').deleteMany({ news_id: { $in: ids } });
      await col('notifications').deleteMany({ news_id: { $in: ids } });
      for (const id of ids) await deleteNewsImages(id);
    }
    res.json({ ok: true, purged: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════

function adminOnly(req, res, next) {
  if (!req.user?.admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [news_count, user_count, vote_count, banned_count] = await Promise.all([
      col('news').countDocuments(),
      col('users').countDocuments(),
      col('votes').countDocuments(),
      col('users').countDocuments({ banned: true })
    ]);
    res.json({ news_count, user_count, vote_count, banned_count, version: '1.0.0' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/news', authMiddleware, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 30;
    const q = req.query.q || '';
    const filter = q ? { title: { $regex: q, $options: 'i' } } : {};
    const [news, total] = await Promise.all([
      col('news').find(filter).sort({ created_at: -1 }).skip(page * limit).limit(limit).toArray(),
      col('news').countDocuments(filter)
    ]);
    res.json({ news: news.map(n => ({ ...n, _id: undefined })), total, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/news/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    await col('news').deleteOne({ id });
    await col('votes').deleteMany({ news_id: id });
    await col('notifications').deleteMany({ news_id: id });
    await deleteNewsImages(id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await col('users').find({}).sort({ created_at: -1 }).limit(200).toArray();
    res.json(users.map(u => ({ id: u.id, username: u.username, phone: maskPhone(u.phone), banned: u.banned, created_at: u.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function maskPhone(p) {
  if (!p || p.length < 8) return p;
  return p.slice(0, 4) + '****' + p.slice(-2);
}

app.post('/api/admin/users/:id/ban', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await col('users').updateOne({ id }, { $set: { banned: !!req.body.ban } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id/news', authMiddleware, adminOnly, async (req, res) => {
  try {
    const owner_id = parseInt(req.params.id);
    const rows = await col('news').find({ owner_id }, { projection: { id: 1 } }).toArray();
    const ids = rows.map(r => r.id);
    if (ids.length) {
      await col('news').deleteMany({ owner_id });
      await col('votes').deleteMany({ news_id: { $in: ids } });
      await col('notifications').deleteMany({ news_id: { $in: ids } });
      for (const id of ids) await deleteNewsImages(id);
    }
    res.json({ deleted: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── VERCEL EXPORT ─────────────────────────────
module.exports = app;
