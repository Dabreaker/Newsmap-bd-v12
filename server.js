'use strict';
const express      = require('express');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const multer       = require('multer');
const path         = require('path');
const { Readable } = require('stream');
const { ObjectId } = require('mongodb');
const { initDB, users, news, votes, notifications, bucket } = require('./db');
const auth = require('./middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'bd-secret';
const PROX_KM    = 5;
const PURGE_TTL  = 36 * 3600;
const DELETE_TTL = 3  * 3600;

// ── Grid 50×50 m ──────────────────────────────────────────────
const GRID_DLAT = 50 / 111000;
const GRID_DLON = 50 / (111000 * Math.cos(23.5 * Math.PI / 180));
function snapToCell(lat, lon) {
  const ci = Math.floor(lat / GRID_DLAT), cj = Math.floor(lon / GRID_DLON);
  return { lat: (ci+0.5)*GRID_DLAT, lon: (cj+0.5)*GRID_DLON, key: `${ci}:${cj}` };
}

// ── Helpers ───────────────────────────────────────────────────
function hav(la1,lo1,la2,lo2) {
  const R=6371, r=d=>d*Math.PI/180;
  const a=Math.sin(r(la2-la1)/2)**2+Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(r(lo2-lo1)/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function voteW(d)     { return Math.max(0.2, 1.0-(d/PROX_KM)*0.8); }
function uid()        { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function nowSec()     { return Math.floor(Date.now()/1000); }
function anonName(id) { return ['প্রতিবেদক','সংবাদদাতা','নাগরিক','জনতা','বার্তাবাহক'][id%5]+'_'+(1000+id); }
function normPhone(p) {
  const d=String(p||'').replace(/\D/g,'');
  if(d.startsWith('880')&&d.length===13) return '0'+d.slice(3);
  if(d.length===11&&d.startsWith('01')) return d;
  return null;
}

// Admin credentials — set ADMIN_PHONES=01711111111,01722222222 in Vercel env
function isAdminPhone(np) {
  const list = (process.env.ADMIN_PHONES||'').split(',').map(s=>s.trim()).filter(Boolean);
  return list.includes(np);
}

function adminAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h||!h.startsWith('Bearer ')) return res.status(401).json({ error:'No token' });
  try { const u=jwt.verify(h.slice(7),JWT_SECRET); if(!u.admin) return res.status(403).json({error:'Admin only'}); req.user=u; next(); }
  catch { res.status(401).json({error:'Invalid token'}); }
}

// ── GridFS image helpers ──────────────────────────────────────
async function saveImg(newsId, file, index) {
  const ext  = (path.extname(file.originalname)||'.jpg').toLowerCase();
  const up   = bucket().openUploadStream(`img_${index}${ext}`, { metadata:{ newsId, index }, contentType:file.mimetype });
  await new Promise((res,rej) => { Readable.from(file.buffer).pipe(up); up.on('finish',res); up.on('error',rej); });
  return `/api/images/${up.id}`;
}
async function deleteImgs(newsId) {
  const files = await bucket().find({ 'metadata.newsId':newsId }).toArray();
  for(const f of files) try{ await bucket().delete(f._id); }catch{}
}

// ── Vote scores ───────────────────────────────────────────────
async function withScores(rows) {
  if(!rows.length) return [];
  const voteRows = await votes().find({ news_id:{$in:rows.map(r=>r.id)} },{projection:{news_id:1,type:1,weight:1}}).toArray();
  const vm={};
  for(const v of voteRows) {
    if(!vm[v.news_id]) vm[v.news_id]={real:0,fake:0,count:0};
    v.type==='real' ? vm[v.news_id].real+=v.weight : vm[v.news_id].fake+=v.weight;
    vm[v.news_id].count++;
  }
  return rows.map(n=>{ const v=vm[n.id]||{real:0,fake:0,count:0}; return{...n,real_score:+v.real.toFixed(2),fake_score:+v.fake.toFixed(2),vote_count:v.count}; });
}

// ── Multer ────────────────────────────────────────────────────
const upload = multer({ storage:multer.memoryStorage(), limits:{fileSize:25*1024*1024,files:10}, fileFilter:(_,f,cb)=>cb(null,/^image\/(jpeg|jpg|png|webp|gif)$/.test(f.mimetype)) });

// ── App ───────────────────────────────────────────────────────
const app = express();

// DB middleware — connect (or reuse) before every request
app.use(async (_,res,next) => {
  try { await initDB(); next(); }
  catch(e) { console.error('[DB]', e.message); res.status(503).json({ error:'Database unavailable', detail:e.message }); }
});

app.use(express.json({ limit:'2mb' }));
app.use((_,res,next) => { res.set('Cache-Control','no-store'); next(); });

// ── IMAGES ────────────────────────────────────────────────────
app.get('/api/images/:fileId', async (req,res) => {
  let oid; try { oid=new ObjectId(req.params.fileId); } catch { return res.status(400).end(); }
  try {
    const [file] = await bucket().find({_id:oid}).toArray();
    if(!file) return res.status(404).end();
    res.set('Content-Type', file.contentType||'image/jpeg');
    res.set('Cache-Control','public, max-age=86400');
    bucket().openDownloadStream(oid).pipe(res);
  } catch { res.status(404).end(); }
});

// ── REGISTER ─────────────────────────────────────────────────
app.post('/api/register', async (req,res) => {
  const {phone,password} = req.body;
  if(!phone||!password)   return res.status(400).json({error:'ফোন নম্বর ও পাসওয়ার্ড দিন'});
  if(password.length < 6) return res.status(400).json({error:'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর'});
  const np = normPhone(phone); if(!np) return res.status(400).json({error:'সঠিক নম্বর দিন (01XXXXXXXXX)'});
  try {
    const count = await users().countDocuments();
    const newId = count+1;
    const hash  = await bcrypt.hash(password,10);
    await users().insertOne({id:newId,phone:np,username:anonName(newId),password_hash:hash,trust_score:1.0,banned:false,created_at:nowSec()});
    const isAdmin = isAdminPhone(np);
    const token   = jwt.sign({id:newId,username:anonName(newId),admin:isAdmin},JWT_SECRET,{expiresIn:'30d'});
    res.json({token,anon_id:newId,admin:isAdmin});
  } catch(e) {
    if(e.code===11000) return res.status(409).json({error:'এই নম্বর ইতিমধ্যে নিবন্ধিত'});
    console.error('[REGISTER]',e.message); res.status(500).json({error:'সার্ভার ত্রুটি'});
  }
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login', async (req,res) => {
  const {phone,password} = req.body;
  if(!phone||!password) return res.status(400).json({error:'ফোন নম্বর ও পাসওয়ার্ড দিন'});
  const np = normPhone(phone); if(!np) return res.status(400).json({error:'সঠিক নম্বর দিন'});
  const user = await users().findOne({phone:np});
  if(!user)       return res.status(404).json({error:'অ্যাকাউন্ট নেই — নিবন্ধন করুন'});
  if(user.banned) return res.status(403).json({error:'অ্যাকাউন্ট নিষিদ্ধ'});
  if(!await bcrypt.compare(password,user.password_hash)) return res.status(401).json({error:'পাসওয়ার্ড ভুল'});
  const isAdmin = isAdminPhone(np);
  const token   = jwt.sign({id:user.id,username:user.username,admin:isAdmin},JWT_SECRET,{expiresIn:'30d'});
  res.json({token,anon_id:user.id,admin:isAdmin});
});

// ── POST NEWS ─────────────────────────────────────────────────
app.post('/api/news', auth, upload.array('images',10), async (req,res) => {
  const {title,description,lat,lon,links,user_lat,user_lon} = req.body;
  if(!title||!lat||!lon) return res.status(400).json({error:'শিরোনাম, অবস্থান আবশ্যক'});
  const flat=parseFloat(lat),flon=parseFloat(lon),ulat=parseFloat(user_lat),ulon=parseFloat(user_lon);
  if([flat,flon,ulat,ulon].some(isNaN)) return res.status(400).json({error:'অবৈধ স্থানাঙ্ক'});

  const cell=snapToCell(flat,flon), ckey=cell.key;
  const pd=hav(ulat,ulon,cell.lat,cell.lon);
  if(pd>PROX_KM) return res.status(403).json({error:`ঘর ${pd.toFixed(2)} কিমি দূরে (সীমা: ${PROX_KM} কিমি)`});
  if(await news().findOne({cell_key:ckey})) return res.status(409).json({error:'এই ঘর পূর্ণ — পাশের ঘর বেছে নিন'});

  const id=uid(), imgs=[];
  try { for(let i=0;i<(req.files||[]).length;i++) imgs.push(await saveImg(id,req.files[i],i)); }
  catch { return res.status(500).json({error:'ছবি সংরক্ষণ ব্যর্থ'}); }

  const doc={id,owner_id:req.user.id,username:req.user.username,title:title.trim(),description:(description||'').trim(),lat:cell.lat,lon:cell.lon,cell_key:ckey,links:(links||'').trim(),image_count:imgs.length,images:imgs,thumb:imgs[0]||'',created_at:nowSec()};
  try { await news().insertOne(doc); } catch(e) { return res.status(500).json({error:'রেকর্ড সংরক্ষণ ব্যর্থ'}); }

  // fire-and-forget notifications
  news().distinct('owner_id',{lat:{$gte:cell.lat-0.09,$lte:cell.lat+0.09},lon:{$gte:cell.lon-0.10,$lte:cell.lon+0.10},owner_id:{$ne:req.user.id}})
    .then(owners => owners.forEach(uid => notifications().insertOne({user_id:uid,news_id:id,title:doc.title,dist_km:0,seen:false,created_at:nowSec()}).catch(()=>{})))
    .catch(()=>{});

  res.json({id,cell_key:ckey,image_count:imgs.length});
});

// ── REGION ────────────────────────────────────────────────────
app.get('/api/region', async (req,res) => {
  const flat=parseFloat(req.query.lat),flon=parseFloat(req.query.lon);
  if(isNaN(flat)||isNaN(flon)) return res.status(400).json({error:'lat/lon required'});
  const rows = await news().find({
    lat:{$gte:flat-0.09,$lte:flat+0.09},lon:{$gte:flon-0.10,$lte:flon+0.10},created_at:{$gt:nowSec()-PURGE_TTL}
  },{projection:{id:1,owner_id:1,lat:1,lon:1,cell_key:1,title:1,description:1,image_count:1,thumb:1,created_at:1}})
    .sort({created_at:-1}).limit(2000).toArray();
  const scored  = await withScores(rows);
  const markers = scored.map(n=>({id:n.id,lat:n.lat,lon:n.lon,cell_key:n.cell_key,thumb:n.thumb,title:n.title,real_score:n.real_score,fake_score:n.fake_score,created_at:n.created_at}));
  const feed    = [...scored].sort((a,b)=>(b.real_score-b.fake_score)-(a.real_score-a.fake_score)).slice(0,20);
  res.json({markers,feed,total:scored.length,ts:Date.now()});
});

// ── NEARBY ────────────────────────────────────────────────────
app.get('/api/news/nearby', async (req,res) => {
  const flat=parseFloat(req.query.lat),flon=parseFloat(req.query.lon);
  if(isNaN(flat)||isNaN(flon)) return res.status(400).json({error:'lat/lon required'});
  res.json(await news().find({lat:{$gte:flat-0.009,$lte:flat+0.009},lon:{$gte:flon-0.010,$lte:flon+0.010}},{projection:{id:1,lat:1,lon:1,cell_key:1}}).limit(200).toArray());
});

// ── MY NEWS ───────────────────────────────────────────────────
app.get('/api/my/news', auth, async (req,res) => {
  const rows = await news().find({owner_id:req.user.id},{projection:{id:1,title:1,lat:1,lon:1,thumb:1,image_count:1,created_at:1}}).sort({created_at:-1}).limit(50).toArray();
  res.json(await withScores(rows));
});

// ── NOTIFICATIONS ─────────────────────────────────────────────
app.get('/api/notifications', auth, async (req,res) => {
  const notes = await notifications().find({user_id:req.user.id}).sort({created_at:-1}).limit(30).toArray();
  const mapped = notes.map(n=>({id:n._id.toString(),news_id:n.news_id,title:n.title,dist_km:n.dist_km,seen:n.seen,created_at:n.created_at}));
  res.json({notifications:mapped,unseen:mapped.filter(n=>!n.seen).length});
});
app.post('/api/notifications/seen', auth, async (req,res) => {
  await notifications().updateMany({user_id:req.user.id},{$set:{seen:true}});
  res.json({ok:true});
});

// ── NEWS DETAIL ───────────────────────────────────────────────
app.get('/api/news/:id', async (req,res) => {
  const row = await news().findOne({id:req.params.id});
  if(!row) return res.status(404).json({error:'সংবাদ পাওয়া যায়নি'});
  const vs = await votes().find({news_id:req.params.id},{projection:{type:1,weight:1}}).toArray();
  let real=0,fake=0; for(const v of vs) v.type==='real'?real+=v.weight:fake+=v.weight;
  const {_id:_,...rest}=row;
  res.json({...rest,real_score:+real.toFixed(3),fake_score:+fake.toFixed(3),vote_count:vs.length,expires_at:row.created_at+PURGE_TTL});
});

// ── DELETE NEWS ───────────────────────────────────────────────
app.delete('/api/news/:id', auth, async (req,res) => {
  const row = await news().findOne({id:req.params.id},{projection:{owner_id:1,created_at:1}});
  if(!row) return res.status(404).json({error:'পাওয়া যায়নি'});
  if(row.owner_id!==req.user.id&&!req.user.admin) return res.status(403).json({error:'অনুমতি নেই'});
  if((nowSec()-row.created_at)>DELETE_TTL&&!req.user.admin) return res.status(403).json({error:'মুছে ফেলার সময় শেষ'});
  await Promise.all([votes().deleteMany({news_id:req.params.id}),news().deleteOne({id:req.params.id}),deleteImgs(req.params.id)]);
  res.json({deleted:true});
});

// ── VOTE ──────────────────────────────────────────────────────
app.post('/api/vote', auth, async (req,res) => {
  const {news_id,type,user_lat,user_lon}=req.body;
  if(!news_id||!['real','fake'].includes(type)) return res.status(400).json({error:'অবৈধ ভোট'});
  const ulat=parseFloat(user_lat),ulon=parseFloat(user_lon);
  if(isNaN(ulat)||isNaN(ulon)) return res.status(400).json({error:'GPS প্রয়োজন'});
  const n=await news().findOne({id:news_id},{projection:{lat:1,lon:1}});
  if(!n) return res.status(404).json({error:'সংবাদ পাওয়া যায়নি'});
  const d=hav(ulat,ulon,n.lat,n.lon);
  if(d>PROX_KM) return res.status(403).json({error:`${d.toFixed(2)} কিমি দূরে`});
  const w=voteW(d);
  try { await votes().updateOne({news_id,user_id:req.user.id},{$set:{type,weight:w,voted_at:nowSec()}},{upsert:true}); }
  catch { return res.status(500).json({error:'ভোট সংরক্ষণ ব্যর্থ'}); }
  res.json({ok:true,type,weight:+w.toFixed(2)});
});

// ── STATUS ────────────────────────────────────────────────────
app.get('/api/status', async (_,res) => {
  res.json({ok:true,news_count:await news().countDocuments(),version:'v17'});
});

// ── REAPER (call via Vercel Cron or manually) ─────────────────
app.get('/api/reaper', async (req,res) => {
  if(req.query.secret!==JWT_SECRET) return res.status(401).json({error:'Unauthorized'});
  const cutoff=nowSec()-PURGE_TTL;
  const stale=await news().find({created_at:{$lt:cutoff}},{projection:{id:1}}).toArray();
  for(const {id} of stale) await Promise.all([votes().deleteMany({news_id:id}),news().deleteOne({id}),deleteImgs(id)]);
  await notifications().deleteMany({created_at:{$lt:cutoff}});
  res.json({ok:true,purged:stale.length});
});

// ── ADMIN ─────────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (_,res) => {
  const [newsCount,userCount,voteCount,bannedCount]=await Promise.all([news().countDocuments(),users().countDocuments(),votes().countDocuments(),users().countDocuments({banned:true})]);
  res.json({news_count:newsCount,user_count:userCount,vote_count:voteCount,banned_count:bannedCount,version:'v17'});
});
app.get('/api/admin/news', adminAuth, async (req,res) => {
  const page=Math.max(0,parseInt(req.query.page)||0),limit=parseInt(req.query.limit)||30,q=req.query.q||'';
  const filter=q?{title:{$regex:q,$options:'i'}}:{};
  const [rows,total]=await Promise.all([
    news().find(filter,{projection:{id:1,owner_id:1,title:1,lat:1,lon:1,image_count:1,thumb:1,created_at:1}}).sort({created_at:-1}).skip(page*limit).limit(limit).toArray(),
    news().countDocuments(filter)
  ]);
  res.json({news:await withScores(rows),total,page,limit});
});
app.delete('/api/admin/news/:id', adminAuth, async (req,res) => {
  const {id}=req.params;
  await Promise.all([votes().deleteMany({news_id:id}),news().deleteOne({id}),deleteImgs(id)]);
  res.json({deleted:true});
});
app.get('/api/admin/users', adminAuth, async (_,res) => {
  const all=await users().find({},{projection:{id:1,phone:1,username:1,trust_score:1,banned:1,created_at:1}}).sort({created_at:-1}).toArray();
  res.json(await Promise.all(all.map(async u=>({id:u.id,username:u.username,trust_score:u.trust_score,banned:u.banned,created_at:u.created_at,phone:u.phone?u.phone.slice(0,4)+'****'+u.phone.slice(-2):'—',news_count:await news().countDocuments({owner_id:u.id})}))));
});
app.post('/api/admin/users/:id/ban', adminAuth, async (req,res) => {
  await users().updateOne({id:parseInt(req.params.id)},{$set:{banned:!!req.body.ban}});
  res.json({ok:true,banned:!!req.body.ban});
});
app.delete('/api/admin/users/:id/news', adminAuth, async (req,res) => {
  const uid=parseInt(req.params.id);
  const rows=await news().find({owner_id:uid},{projection:{id:1}}).toArray();
  for(const {id} of rows) await Promise.all([votes().deleteMany({news_id:id}),news().deleteOne({id}),deleteImgs(id)]);
  res.json({deleted:rows.length});
});

module.exports = app;
