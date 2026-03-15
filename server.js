'use strict';
const fs   = require('fs');
const path = require('path');

// Load .env (local dev only — Vercel uses dashboard env vars)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n')
    .forEach(l => {
      const m = l.match(/^([^#=\s]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
} catch {}

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const cron     = require('node-cron');
const { Readable } = require('stream');
const { ObjectId }  = require('mongodb');

const { initDB, users, news, votes, notifications, bucket } = require('./db');
const log  = require('./middleware/logger');
const auth = require('./middleware/auth');

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'jonatar-barta-secret';
const PROX_KM    = 5;
const PURGE_TTL  = 36 * 3600;
const DELETE_TTL = 3  * 3600;
const IS_VERCEL  = !!process.env.VERCEL;
const CREDS_FILE = path.join(__dirname, 'credentials.json');

// ── Grid 50×50 m ──────────────────────────────────────────────
const GRID_DLAT = 50 / 111000;
const GRID_DLON = 50 / (111000 * Math.cos(23.5 * Math.PI / 180));
function snapToCell(lat, lon) {
  const ci = Math.floor(lat / GRID_DLAT);
  const cj = Math.floor(lon / GRID_DLON);
  return { lat: (ci + 0.5) * GRID_DLAT, lon: (cj + 0.5) * GRID_DLON, key: `${ci}:${cj}` };
}

// ── Geo helpers ───────────────────────────────────────────────
function hav(la1, lo1, la2, lo2) {
  const R = 6371, r = d => d * Math.PI / 180;
  const a = Math.sin(r(la2-la1)/2)**2 + Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(r(lo2-lo1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function voteW(d)     { return Math.max(0.2, 1.0 - (d / PROX_KM) * 0.8); }
function uid()        { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function anonName(id) { return ['প্রতিবেদক','সংবাদদাতা','নাগরিক','জনতা','বার্তাবাহক'][id%5]+'_'+(1000+id); }
function nowSec()     { return Math.floor(Date.now()/1000); }

// ── Credentials ───────────────────────────────────────────────
function loadCreds()  { try { return JSON.parse(fs.readFileSync(CREDS_FILE,'utf8')); } catch { return []; } }
function normPhone(p) {
  const d = String(p||'').replace(/\D/g,'');
  if (d.startsWith('880') && d.length===13) return '0'+d.slice(3);
  if (d.length===11 && d.startsWith('01')) return d;
  return null;
}
function findCred(phone) {
  const n = normPhone(phone);
  return n ? (loadCreds().find(c => normPhone(c.phone)===n)||null) : null;
}

// ── Admin auth ────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const u = jwt.verify(h.slice(7), JWT_SECRET);
    if (!u.admin) return res.status(403).json({ error: 'Admin only' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── GridFS image helpers ──────────────────────────────────────
async function saveImgToGridFS(newsId, file, index) {
  const ext  = (path.extname(file.originalname)||'.jpg').toLowerCase();
  const name = `img_${index}${ext}`;
  const up   = bucket().openUploadStream(name, {
    metadata:    { newsId, index },
    contentType: file.mimetype,
  });
  await new Promise((resolve, reject) => {
    Readable.from(file.buffer).pipe(up);
    up.on('finish', resolve);
    up.on('error',  reject);
  });
  return { fileId: up.id.toString() };
}

async function deleteImgsForNews(newsId) {
  const files = await bucket().find({ 'metadata.newsId': newsId }).toArray();
  for (const f of files) { try { await bucket().delete(f._id); } catch {} }
}

function imgUrl(fileId) { return `/api/images/${fileId}`; }

// ── Vote score aggregation ────────────────────────────────────
async function withScores(rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const voteRows = await votes().find(
    { news_id: { $in: ids } },
    { projection: { news_id:1, type:1, weight:1 } }
  ).toArray();
  const vm = {};
  for (const v of voteRows) {
    if (!vm[v.news_id]) vm[v.news_id] = { real:0, fake:0, count:0 };
    if (v.type==='real') vm[v.news_id].real += v.weight;
    else                 vm[v.news_id].fake += v.weight;
    vm[v.news_id].count++;
  }
  return rows.map(n => {
    const v = vm[n.id] || { real:0, fake:0, count:0 };
    return { ...n, real_score:+v.real.toFixed(2), fake_score:+v.fake.toFixed(2), vote_count:v.count };
  });
}

// ── Multer ────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25*1024*1024, files: 10 },
  fileFilter: (_, f, cb) => cb(null, /^image\/(jpeg|jpg|png|webp|gif)$/.test(f.mimetype)),
});

// ── Express setup ─────────────────────────────────────────────
const app = express();
let _dbReady=false, _dbRes, _dbRej;
const _dbP = new Promise((r,j) => { _dbRes=r; _dbRej=j; });

// Wait for DB before handling any request
app.use(async (_q, res, next) => {
  if (_dbReady) return next();
  try { await _dbP; next(); }
  catch(e) { res.status(503).json({ error:'Database unavailable', detail:e.message }); }
});

app.use(express.json({ limit:'2mb' }));
app.use(log.middleware);

// Static files — works locally; on Vercel handled by @vercel/static builder
app.use(express.static(path.join(__dirname,'public'), {
  setHeaders(res,p) { if(p.endsWith('.html')||p.endsWith('.js')) res.set('Cache-Control','no-store'); },
}));

app.use('/api', (_q,res,next) => { res.set('Cache-Control','no-store'); next(); });

// ── IMAGE SERVE (GridFS) ──────────────────────────────────────
app.get('/api/images/:fileId', async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.fileId); }
  catch { return res.status(400).end(); }
  try {
    const files = await bucket().find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).end();
    res.set('Content-Type', files[0].contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    bucket().openDownloadStream(oid).pipe(res);
  } catch { res.status(404).end(); }
});

// ── REGISTER ──────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone||!password)   return res.status(400).json({ error:'ফোন নম্বর ও পাসওয়ার্ড দিন' });
  if (password.length < 6) return res.status(400).json({ error:'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে' });
  const np = normPhone(phone);
  if (!np) return res.status(400).json({ error:'সঠিক নম্বর দিন (01XXXXXXXXX)' });
  try {
    const hash    = await bcrypt.hash(password, 10);
    const count   = await users().countDocuments();
    const newId   = count + 1;
    const username = anonName(newId);
    await users().insertOne({ id:newId, phone:np, username, password_hash:hash, trust_score:1.0, banned:false, created_at:nowSec() });
    const isAdmin = !!(findCred(np)?.admin);
    const token   = jwt.sign({ id:newId, username, admin:isAdmin }, JWT_SECRET, { expiresIn:'30d' });
    log.info('REGISTER', np, 'id='+newId);
    res.json({ token, anon_id:newId, admin:isAdmin });
  } catch(e) {
    if (e.code===11000) return res.status(409).json({ error:'এই নম্বরটি ইতিমধ্যে নিবন্ধিত আছে' });
    log.error('REGISTER', e.message);
    res.status(500).json({ error:'সার্ভার ত্রুটি' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone||!password) return res.status(400).json({ error:'ফোন নম্বর ও পাসওয়ার্ড দিন' });
  const np = normPhone(phone);
  if (!np) return res.status(400).json({ error:'সঠিক নম্বর দিন (01XXXXXXXXX)' });
  const user = await users().findOne({ phone:np });
  if (!user)       return res.status(404).json({ error:'এই নম্বরে কোনো অ্যাকাউন্ট নেই — আগে নিবন্ধন করুন' });
  if (user.banned) return res.status(403).json({ error:'এই অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error:'পাসওয়ার্ড ভুল' });
  const isAdmin = !!(findCred(np)?.admin);
  const token   = jwt.sign({ id:user.id, username:user.username, admin:isAdmin }, JWT_SECRET, { expiresIn:'30d' });
  res.json({ token, anon_id:user.id, admin:isAdmin });
});

// ── POST NEWS ─────────────────────────────────────────────────
app.post('/api/news', auth, upload.array('images',10), async (req, res) => {
  const { title, description, lat, lon, links, user_lat, user_lon } = req.body;
  if (!title||!lat||!lon) return res.status(400).json({ error:'শিরোনাম, অবস্থান আবশ্যক' });
  const flat=parseFloat(lat), flon=parseFloat(lon), ulat=parseFloat(user_lat), ulon=parseFloat(user_lon);
  if (isNaN(flat)||isNaN(flon)||isNaN(ulat)||isNaN(ulon)) return res.status(400).json({ error:'অবৈধ স্থানাঙ্ক' });

  const cell = snapToCell(flat, flon);
  const slat=cell.lat, slon=cell.lon, ckey=cell.key;
  const pd = hav(ulat, ulon, slat, slon);
  if (pd > PROX_KM) return res.status(403).json({ error:`ঘর ${pd.toFixed(2)} কিমি দূরে (সীমা: ${PROX_KM} কিমি)` });

  const occupied = await news().findOne({ cell_key:ckey });
  if (occupied) return res.status(409).json({ error:'এই ঘরটি ইতিমধ্যে পূর্ণ — পাশের ঘর বেছে নিন' });

  const id=uid(), now=nowSec();
  const imgs = [];
  try {
    for (let i=0; i<(req.files||[]).length; i++) {
      const { fileId } = await saveImgToGridFS(id, req.files[i], i);
      imgs.push(imgUrl(fileId));
    }
  } catch(e) { return res.status(500).json({ error:'ছবি সংরক্ষণ ব্যর্থ' }); }

  const doc = {
    id, owner_id:req.user.id, username:req.user.username,
    title:title.trim(), description:(description||'').trim(),
    lat:slat, lon:slon, cell_key:ckey,
    links:(links||'').trim(),
    image_count:imgs.length, images:imgs, thumb:imgs[0]||'',
    created_at:now,
  };
  try { await news().insertOne(doc); }
  catch(e) { log.error('NEWS INSERT', e.message); return res.status(500).json({ error:'রেকর্ড সংরক্ষণ ব্যর্থ' }); }

  notifyNearby(id, doc.title, slat, slon, req.user.id).catch(()=>{});
  log.info('NEWS', id, `cell=${ckey} imgs=${imgs.length}`);
  res.json({ id, cell_key:ckey, image_count:imgs.length });
});

// ── REGION ────────────────────────────────────────────────────
app.get('/api/region', async (req, res) => {
  const flat=parseFloat(req.query.lat), flon=parseFloat(req.query.lon);
  if (isNaN(flat)||isNaN(flon)) return res.status(400).json({ error:'lat/lon required' });
  const dlat=0.09, dlon=0.10, cutoff=nowSec()-PURGE_TTL;
  const rows = await news().find({
    lat:        { $gte:flat-dlat, $lte:flat+dlat },
    lon:        { $gte:flon-dlon, $lte:flon+dlon },
    created_at: { $gt:cutoff },
  }, { projection:{ id:1,owner_id:1,lat:1,lon:1,cell_key:1,title:1,description:1,image_count:1,thumb:1,created_at:1 } })
    .sort({ created_at:-1 }).limit(2000).toArray();

  const scored  = await withScores(rows);
  const markers = scored.map(n => ({ id:n.id,lat:n.lat,lon:n.lon,cell_key:n.cell_key,thumb:n.thumb,title:n.title,real_score:n.real_score,fake_score:n.fake_score,created_at:n.created_at }));
  const feed    = [...scored].sort((a,b)=>(b.real_score-b.fake_score)-(a.real_score-a.fake_score)).slice(0,20);
  res.json({ markers, feed, total:scored.length, ts:Date.now() });
});

// ── NEARBY ────────────────────────────────────────────────────
app.get('/api/news/nearby', async (req, res) => {
  const flat=parseFloat(req.query.lat), flon=parseFloat(req.query.lon);
  if (isNaN(flat)||isNaN(flon)) return res.status(400).json({ error:'lat/lon required' });
  const rows = await news().find({
    lat: { $gte:flat-0.009, $lte:flat+0.009 },
    lon: { $gte:flon-0.010, $lte:flon+0.010 },
  }, { projection:{ id:1,lat:1,lon:1,cell_key:1 } }).limit(200).toArray();
  res.json(rows);
});

// ── MY NEWS ───────────────────────────────────────────────────
app.get('/api/my/news', auth, async (req, res) => {
  const rows = await news().find(
    { owner_id:req.user.id },
    { projection:{ id:1,title:1,lat:1,lon:1,thumb:1,image_count:1,created_at:1 } }
  ).sort({ created_at:-1 }).limit(50).toArray();
  res.json(await withScores(rows));
});

// ── NOTIFICATIONS ─────────────────────────────────────────────
async function notifyNearby(newsId, title, lat, lon, fromUserId) {
  const dlat=0.09, dlon=0.10;
  const owners = await news().distinct('owner_id', {
    lat:      { $gte:lat-dlat, $lte:lat+dlat },
    lon:      { $gte:lon-dlon, $lte:lon+dlon },
    owner_id: { $ne:fromUserId },
  });
  for (const owner_id of owners) {
    try { await notifications().insertOne({ user_id:owner_id, news_id:newsId, title, dist_km:0, seen:false, created_at:nowSec() }); } catch {}
  }
}

app.get('/api/notifications', auth, async (req, res) => {
  const notes = await notifications()
    .find({ user_id:req.user.id })
    .sort({ created_at:-1 }).limit(30).toArray();
  const mapped = notes.map(n => ({ id:n._id.toString(), news_id:n.news_id, title:n.title, dist_km:n.dist_km, seen:n.seen, created_at:n.created_at }));
  res.json({ notifications:mapped, unseen:mapped.filter(n=>!n.seen).length });
});

app.post('/api/notifications/seen', auth, async (req, res) => {
  await notifications().updateMany({ user_id:req.user.id }, { $set:{ seen:true } });
  res.json({ ok:true });
});

// ── NEWS DETAIL ───────────────────────────────────────────────
app.get('/api/news/:id', async (req, res) => {
  const row = await news().findOne({ id:req.params.id });
  if (!row) return res.status(404).json({ error:'সংবাদ পাওয়া যায়নি' });
  const vs = await votes().find({ news_id:req.params.id }, { projection:{ type:1,weight:1 } }).toArray();
  let real=0, fake=0;
  for (const v of vs) { if(v.type==='real') real+=v.weight; else fake+=v.weight; }
  const { _id:_, ...rest } = row;
  res.json({ ...rest, real_score:+real.toFixed(3), fake_score:+fake.toFixed(3), vote_count:vs.length, expires_at:row.created_at+PURGE_TTL });
});

// ── DELETE NEWS ───────────────────────────────────────────────
app.delete('/api/news/:id', auth, async (req, res) => {
  const { id } = req.params;
  const row = await news().findOne({ id }, { projection:{ owner_id:1,created_at:1 } });
  if (!row) return res.status(404).json({ error:'পাওয়া যায়নি' });
  if (row.owner_id!==req.user.id && !req.user.admin) return res.status(403).json({ error:'অনুমতি নেই' });
  if ((nowSec()-row.created_at)>DELETE_TTL && !req.user.admin) return res.status(403).json({ error:'মুছে ফেলার সময় শেষ' });
  await votes().deleteMany({ news_id:id });
  await news().deleteOne({ id });
  await deleteImgsForNews(id);
  log.info('DELETED', id);
  res.json({ deleted:true });
});

// ── VOTE ──────────────────────────────────────────────────────
app.post('/api/vote', auth, async (req, res) => {
  const { news_id, type, user_lat, user_lon } = req.body;
  if (!news_id||!['real','fake'].includes(type)) return res.status(400).json({ error:'অবৈধ ভোট' });
  const ulat=parseFloat(user_lat), ulon=parseFloat(user_lon);
  if (isNaN(ulat)||isNaN(ulon)) return res.status(400).json({ error:'GPS প্রয়োজন' });
  const n = await news().findOne({ id:news_id }, { projection:{ lat:1,lon:1 } });
  if (!n) return res.status(404).json({ error:'সংবাদ পাওয়া যায়নি' });
  const d = hav(ulat, ulon, n.lat, n.lon);
  if (d > PROX_KM) return res.status(403).json({ error:`${d.toFixed(2)} কিমি দূরে` });
  const w = voteW(d);
  try {
    await votes().updateOne(
      { news_id, user_id:req.user.id },
      { $set:{ type, weight:w, voted_at:nowSec() } },
      { upsert:true }
    );
  } catch { return res.status(500).json({ error:'ভোট সংরক্ষণ ব্যর্থ' }); }
  res.json({ ok:true, type, weight:+w.toFixed(2) });
});

// ── ADMIN ─────────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const [newsCount, userCount, voteCount, bannedCount] = await Promise.all([
    news().countDocuments(),
    users().countDocuments(),
    votes().countDocuments(),
    users().countDocuments({ banned:true }),
  ]);
  res.json({ news_count:newsCount, user_count:userCount, vote_count:voteCount, banned_count:bannedCount, version:'v17' });
});

app.get('/api/admin/news', adminAuth, async (req, res) => {
  const page  = Math.max(0, parseInt(req.query.page)||0);
  const limit = parseInt(req.query.limit)||30;
  const q     = req.query.q||'';
  const filter = q ? { title:{ $regex:q, $options:'i' } } : {};
  const rows  = await news().find(filter, { projection:{ id:1,owner_id:1,title:1,lat:1,lon:1,image_count:1,thumb:1,created_at:1 } })
    .sort({ created_at:-1 }).skip(page*limit).limit(limit).toArray();
  const total = await news().countDocuments(filter);
  res.json({ news:await withScores(rows), total, page, limit });
});

app.delete('/api/admin/news/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  await votes().deleteMany({ news_id:id });
  await news().deleteOne({ id });
  await deleteImgsForNews(id);
  log.info('ADMIN DELETED', id);
  res.json({ deleted:true });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const allUsers = await users().find({}, { projection:{ id:1,phone:1,username:1,trust_score:1,banned:1,created_at:1 } })
    .sort({ created_at:-1 }).toArray();
  const result = await Promise.all(allUsers.map(async u => ({
    id:u.id, username:u.username, trust_score:u.trust_score, banned:u.banned, created_at:u.created_at,
    phone:       u.phone ? u.phone.slice(0,4)+'****'+u.phone.slice(-2) : '—',
    news_count:  await news().countDocuments({ owner_id:u.id }),
  })));
  res.json(result);
});

app.post('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  const uid = parseInt(req.params.id);
  const { ban } = req.body;
  await users().updateOne({ id:uid }, { $set:{ banned:!!ban } });
  log.info('ADMIN', ban?'BANNED':'UNBANNED', 'uid', uid);
  res.json({ ok:true, banned:!!ban });
});

app.delete('/api/admin/users/:id/news', adminAuth, async (req, res) => {
  const uid  = parseInt(req.params.id);
  const rows = await news().find({ owner_id:uid }, { projection:{ id:1 } }).toArray();
  for (const { id } of rows) {
    await votes().deleteMany({ news_id:id });
    await news().deleteOne({ id });
    await deleteImgsForNews(id);
  }
  log.info('ADMIN PURGED news for uid', uid, rows.length, 'items');
  res.json({ deleted:rows.length });
});

// ── STATUS ────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const newsCount = await news().countDocuments();
  res.json({ news_count:newsCount, version:'v17', ok:true });
});

// ── REAPER (manual trigger on Vercel, cron on local) ─────────
async function runReaper() {
  const cutoff = nowSec() - PURGE_TTL;
  const stale  = await news().find({ created_at:{ $lt:cutoff } }, { projection:{ id:1 } }).toArray();
  if (!stale.length) return 0;
  for (const { id } of stale) {
    await votes().deleteMany({ news_id:id });
    await news().deleteOne({ id });
    await deleteImgsForNews(id);
  }
  await notifications().deleteMany({ created_at:{ $lt:cutoff } });
  log.info('REAPER: purged', stale.length);
  return stale.length;
}

// On Vercel: hit GET /api/reaper?secret=JWT_SECRET to trigger manually
// (set up as a Vercel Cron Job: https://vercel.com/docs/cron-jobs)
app.get('/api/reaper', async (req, res) => {
  if (req.query.secret !== JWT_SECRET) return res.status(401).json({ error:'Unauthorized' });
  try {
    const count = await runReaper();
    res.json({ ok:true, purged:count });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

if (!IS_VERCEL) {
  cron.schedule('*/15 * * * *', () => runReaper().catch(e => log.error('REAPER', e.message)));
}

// ── BOOT ──────────────────────────────────────────────────────
initDB()
  .then(() => {
    _dbReady = true; _dbRes();
    const creds = loadCreds();
    log.info(`Credentials: ${creds.length} accounts, ${creds.filter(c=>c.admin).length} admin(s)`);
    if (!IS_VERCEL) {
      app.listen(PORT, () => log.info('BD News Map v17 → http://localhost:'+PORT));
    } else {
      log.info('BD News Map v17 (MongoDB) running on Vercel');
    }
  })
  .catch(e => { console.error('FATAL DB INIT:', e); _dbRej(e); });

module.exports = app;
