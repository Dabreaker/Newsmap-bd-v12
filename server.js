// server.js — জনবার্তা API (Vercel KV + Blob, no MongoDB)
'use strict';

const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const { put, del: blobDel } = require('@vercel/blob');

const store = require('./store');
const { authMiddleware, optionalAuth } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function maskPhone(p) { if (!p || p.length < 8) return p; return p.slice(0,4)+'****'+p.slice(-2); }
const nowSec = store.nowSec;

// ── BLOB IMAGE UPLOAD ─────────────────────────
async function uploadImages(files, newsId) {
  if (!files || !files.length) return [];
  const results = await Promise.all(files.map((f, i) =>
    put(`news/${newsId}/${i}.${f.mimetype.split('/')[1]}`, f.buffer, {
      access: 'public', contentType: f.mimetype, addRandomSuffix: false
    })
  ));
  return results.map(r => r.url);
}

async function deleteImages(urls) {
  if (!urls || !urls.length) return;
  await Promise.all(urls.map(url => blobDel(url).catch(() => {})));
}

// ══════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════

app.get('/api/status', async (req, res) => {
  try {
    const stats = await store.getStats();
    res.json({ ok: true, news_count: stats.news_count, version: '1.0.0' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REGISTER — 2 KV writes ────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body;
    const phone = normPhone(rawPhone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password minimum 6 characters' });

    const existing = await store.getUserByPhone(phone);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const adminPhones = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim());
    const user = await store.createUser({ phone, password_hash, trust_score: 1.0, banned: false, created_at: nowSec() });
    const username = anonName(user.id);
    const isAdmin = adminPhones.includes(phone);
    await store.updateUser(user.id, { username, admin: isAdmin });

    const token = jwt.sign({ id: user.id, username, admin: isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, anon_id: user.id, username, admin: isAdmin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LOGIN — 2 KV reads ────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body;
    const phone = normPhone(rawPhone);
    if (!phone) return res.status(400).json({ error: 'Invalid phone number' });

    const user = await store.getUserByPhone(phone);
    if (!user) return res.status(401).json({ error: 'Phone or password incorrect' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Phone or password incorrect' });

    const adminPhones = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim());
    const isAdmin = adminPhones.includes(phone) || !!user.admin;
    const token = jwt.sign({ id: user.id, username: user.username, admin: isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, anon_id: user.id, username: user.username, admin: isAdmin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST NEWS — ~6 KV ops ─────────────────────
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

    const [occupant, user] = await Promise.all([
      store.getCellOccupant(cell.key),
      store.getUserById(req.user.id)
    ]);
    if (occupant) return res.status(409).json({ error: 'Cell already occupied' });
    if (!user || user.banned) return res.status(403).json({ error: 'Account banned' });

    const id = uid();
    const imageUrls = await uploadImages(req.files, id);

    await store.createNews({
      id, owner_id: req.user.id, username: user.username,
      title: title.trim(), description: (description || '').slice(0, 1000),
      lat: cell.lat, lon: cell.lon, cell_key: cell.key,
      links: links || '', images: imageUrls, thumb: imageUrls[0] || null,
      created_at: nowSec()
    });
    await store.incrStat('news_count');

    // Notifications (best-effort, non-blocking)
    store.getRegionNews(cell.lat, cell.lon).then(regionNews => {
      const ownerSet = [...new Set(regionNews.filter(n => n.owner_id !== req.user.id).map(n => n.owner_id))];
      return Promise.all(ownerSet.map(oid => {
        const ref = regionNews.find(n => n.owner_id === oid);
        return store.addNotification(oid, {
          news_id: id, title: title.slice(0, 80),
          dist_km: parseFloat(hav(cell.lat, cell.lon, ref.lat, ref.lon).toFixed(2)),
          seen: false, created_at: nowSec()
        });
      }));
    }).catch(() => {});

    res.json({ id, cell_key: cell.key, image_count: imageUrls.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET REGION — 5 KV ops (4 tile SMEMBERS + 1 MGET) ──
app.get('/api/region', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 23.8103;
    const lon = parseFloat(req.query.lon) || 90.4125;
    const rows = await store.getRegionNews(lat, lon);
    const enriched = rows.map(n => store.enrichNews(n));
    const markers = enriched.map(n => ({
      id: n.id, lat: n.lat, lon: n.lon, cell_key: n.cell_key,
      thumb: n.thumb, title: n.title,
      real_score: n.real_score, fake_score: n.fake_score, created_at: n.created_at
    }));
    const feed = [...enriched].sort((a,b)=>(b.real_score-b.fake_score)-(a.real_score-a.fake_score)).slice(0,20);
    res.json({ markers, feed, total: rows.length, ts: nowSec() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NEARBY — same 5 KV ops ────────────────────
app.get('/api/news/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    const rows = await store.getRegionNews(lat, lon);
    res.json(rows.map(n => ({ id: n.id, lat: n.lat, lon: n.lon, cell_key: n.cell_key })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET SINGLE NEWS — 1 KV get ────────────────
app.get('/api/news/:id', optionalAuth, async (req, res) => {
  try {
    const raw = await store.getNews(req.params.id);
    if (!raw) return res.status(404).json({ error: 'News not found or expired' });
    if (raw.created_at <= nowSec() - 36 * 3600) return res.status(404).json({ error: 'News expired' });
    res.json(store.enrichNews(raw, req.user?.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE NEWS — 1 GET + 4 DEL/SREM ─────────
app.delete('/api/news/:id', authMiddleware, async (req, res) => {
  try {
    const news = await store.getNews(req.params.id);
    if (!news) return res.status(404).json({ error: 'News not found' });
    const isOwner = news.owner_id === req.user.id;
    const withinTime = (nowSec() - news.created_at) < 10800;
    if (!req.user.admin && !(isOwner && withinTime)) return res.status(403).json({ error: 'Cannot delete' });
    await Promise.all([store.deleteNews(req.params.id, news), deleteImages(news.images || [])]);
    await store.decrStat('news_count');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VOTE — 1 GET + 1 SET ──────────────────────
app.post('/api/vote', authMiddleware, async (req, res) => {
  try {
    const { news_id, type, user_lat, user_lon } = req.body;
    if (!['real','fake'].includes(type)) return res.status(400).json({ error: 'Invalid vote type' });
    const news = await store.getNews(news_id);
    if (!news || news.created_at <= nowSec() - 36 * 3600) return res.status(404).json({ error: 'News not found or expired' });
    const uLat = parseFloat(user_lat), uLon = parseFloat(user_lon);
    const dist = (!isNaN(uLat) && !isNaN(uLon)) ? hav(uLat, uLon, news.lat, news.lon) : 999;
    if (dist > 5) return res.status(403).json({ error: 'Must be within 5km to vote' });
    const weight = voteWeight(dist);
    const isNewVote = !news.votes?.[req.user.id];
    await store.upsertVote(news_id, req.user.id, type, weight);
    if (isNewVote) await store.incrStat('vote_count');
    res.json({ ok: true, type, weight });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MY NEWS — 2 KV ops ────────────────────────
app.get('/api/my/news', authMiddleware, async (req, res) => {
  try {
    const rows = await store.getOwnerNews(req.user.id);
    res.json(rows.map(n => store.enrichNews(n)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATIONS — 1 KV get ──────────────────
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await store.getNotifications(req.user.id);
    res.json({ notifications, unseen: notifications.filter(n => !n.seen).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/seen', authMiddleware, async (req, res) => {
  try {
    await store.markNotificationsSeen(req.user.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REAPER — KV TTLs handle expiry automatically ──
app.get('/api/reaper', async (req, res) => {
  if (req.query.secret !== process.env.JWT_SECRET) return res.status(403).json({ error: 'Forbidden' });
  res.json({ ok: true, note: 'KV TTLs auto-expire news keys. No manual purge needed.' });
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
    const stats = await store.getStats();
    res.json({ ...stats, banned_count: 0, version: '1.0.0' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/news', authMiddleware, adminOnly, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 23.8103;
    const lon = parseFloat(req.query.lon) || 90.4125;
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 30;
    const q = (req.query.q || '').toLowerCase();
    let rows = await store.getRegionNews(lat, lon);
    if (q) rows = rows.filter(n => n.title?.toLowerCase().includes(q));
    rows.sort((a,b) => b.created_at - a.created_at);
    const news = rows.slice(page * limit, (page+1) * limit).map(n => store.enrichNews(n));
    res.json({ news, total: rows.length, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/news/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const news = await store.getNews(req.params.id);
    if (!news) return res.status(404).json({ error: 'Not found' });
    await Promise.all([store.deleteNews(req.params.id, news), deleteImages(news.images||[])]);
    await store.decrStat('news_count');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await store.getAllUsers(200);
    res.json(users.map(u => ({ id: u.id, username: u.username, phone: maskPhone(u.phone), banned: !!u.banned, created_at: u.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/ban', authMiddleware, adminOnly, async (req, res) => {
  try {
    await store.updateUser(parseInt(req.params.id), { banned: !!req.body.ban });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id/news', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await store.getOwnerNews(parseInt(req.params.id));
    await Promise.all(rows.map(n => Promise.all([store.deleteNews(n.id, n), deleteImages(n.images||[])])));
    if (rows.length) await store.decrStat('news_count', rows.length);
    res.json({ deleted: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA FALLBACK ──────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
