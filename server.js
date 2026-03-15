'use strict';
const fs=require('fs'),path=require('path');
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^([^#=\s]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();});}catch{}

const express =require('express');
const jwt     =require('jsonwebtoken');
const bcrypt  =require('bcryptjs');
const multer  =require('multer');
const cron    =require('node-cron');
const {initDB,dbGet,dbAll,dbRun,DATA_ROOT}=require('./db');
const log =require('./middleware/logger');
const auth=require('./middleware/auth');

const PORT      =process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||'jonatar-barta-secret';
const PROX_KM   =5;
const PURGE_TTL =36*3600;
const DELETE_TTL=3*3600;
const MAX_BYTES=10*1024*1024*1024;
const IS_VERCEL=!!process.env.VERCEL;

// ── 50×50m Grid ───────────────────────────────────────────────
// Fixed ref latitude 23.5° (center of Bangladesh) keeps dlon consistent
const GRID_DLAT = 50 / 111000;
const GRID_DLON = 50 / (111000 * Math.cos(23.5 * Math.PI / 180));
function snapToCell(lat, lon) {
  const ci = Math.floor(lat / GRID_DLAT);
  const cj = Math.floor(lon / GRID_DLON);
  return {
    lat: (ci + 0.5) * GRID_DLAT,
    lon: (cj + 0.5) * GRID_DLON,
    key: `${ci}:${cj}`,
  };
}
const NEWS_DATA=path.join(DATA_ROOT,'news_data');
const LOGS_DIR=path.join(IS_VERCEL?'/tmp':__dirname,'logs');
const CREDS_FILE=path.join(__dirname,'credentials.json');
[NEWS_DATA,LOGS_DIR].forEach(d=>{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});});

// ── Credentials ───────────────────────────────────────────────
function loadCreds(){try{return JSON.parse(fs.readFileSync(CREDS_FILE,'utf8'));}catch{return[];}}
function normPhone(p){const d=String(p||'').replace(/\D/g,'');if(d.startsWith('880')&&d.length===13)return'0'+d.slice(3);if(d.length===11&&d.startsWith('01'))return d;return null;}
function findCred(phone){const n=normPhone(phone);if(!n)return null;return loadCreds().find(c=>normPhone(c.phone)===n)||null;}

// ── Admin middleware ──────────────────────────────────────────
function adminAuth(req,res,next){
  const h=req.headers.authorization;
  if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'No token'});
  try{const u=jwt.verify(h.slice(7),JWT_SECRET);if(!u.admin)return res.status(403).json({error:'Admin only'});req.user=u;next();}
  catch{res.status(401).json({error:'Invalid token'});}
}

// ── Geo ───────────────────────────────────────────────────────
function hav(la1,lo1,la2,lo2){const R=6371,r=d=>d*Math.PI/180;const a=Math.sin(r(la2-la1)/2)**2+Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(r(lo2-lo1)/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function voteW(d){return Math.max(0.2,1.0-(d/PROX_KM)*0.8);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function anonName(id){return['প্রতিবেদক','সংবাদদাতা','নাগরিক','জনতা','বার্তাবাহক'][id%5]+'_'+(1000+id);}

// ── Storage ───────────────────────────────────────────────────
function dirSize(dir){if(!fs.existsSync(dir))return 0;let t=0;for(const f of fs.readdirSync(dir,{withFileTypes:true})){const fp=path.join(dir,f.name);t+=f.isDirectory()?dirSize(fp):fs.statSync(fp).size;}return t;}
function newsDir(id){return path.join(NEWS_DATA,id);}
function metaFile(id){return path.join(NEWS_DATA,id,'meta.json');}
function writeMeta(id,d){const nd=newsDir(id);if(!fs.existsSync(nd))fs.mkdirSync(nd,{recursive:true});fs.writeFileSync(metaFile(id),JSON.stringify(d,null,2),'utf8');}
function readMeta(id){const p=metaFile(id);if(!fs.existsSync(p))return null;try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}
function listImgs(id){const d=newsDir(id);if(!fs.existsSync(d))return[];return fs.readdirSync(d).filter(f=>/\.(jpg|jpeg|png|webp|gif)$/i.test(f)).sort().map(f=>`/news_data/${id}/${f}`);}
function delNewsDir(id){const d=newsDir(id);if(fs.existsSync(d))try{fs.rmSync(d,{recursive:true,force:true});}catch{}}

// ── Batch scores ──────────────────────────────────────────────
function withScores(rows){
  if(!rows.length)return[];
  const votes=dbAll(`SELECT news_id,type,weight FROM votes WHERE news_id IN (${rows.map(()=>'?').join(',')})`,rows.map(r=>r.id));
  const vm={};for(const v of votes){if(!vm[v.news_id])vm[v.news_id]={real:0,fake:0,count:0};if(v.type==='real')vm[v.news_id].real+=+v.weight;else vm[v.news_id].fake+=+v.weight;vm[v.news_id].count++;}
  return rows.map(n=>{const v=vm[n.id]||{real:0,fake:0,count:0};return{...n,real_score:+v.real.toFixed(2),fake_score:+v.fake.toFixed(2),vote_count:v.count};});
}

// ── Multer ────────────────────────────────────────────────────
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:10},fileFilter:(_,f,cb)=>cb(null,/^image\/(jpeg|jpg|png|webp|gif)$/.test(f.mimetype))});
function saveImgs(id,files){
  const d=newsDir(id);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  return(files||[]).map((f,i)=>{const ext=(path.extname(f.originalname)||'.jpg').toLowerCase();const name=`img_${i}${ext}`;fs.writeFileSync(path.join(d,name),f.buffer);return`/news_data/${id}/${name}`;});
}

// ── Express ───────────────────────────────────────────────────
const app=express();
let _dbReady=false,_dbRes,_dbRej;const _dbP=new Promise((r,j)=>{_dbRes=r;_dbRej=j;});
app.use(async(_q,res,next)=>{if(_dbReady)return next();try{await _dbP;next();}catch(e){res.status(503).json({error:'Database unavailable',detail:e.message});}});
app.use(express.json({limit:'2mb'}));
app.use(log.middleware);
app.use(express.static(path.join(__dirname,'public'),{setHeaders(res,p){if(p.endsWith('.html')||p.endsWith('.js'))res.set('Cache-Control','no-store');}}));
app.use('/news_data',express.static(NEWS_DATA,{maxAge:'5m'}));
app.use('/api',(_q,res,next)=>{res.set('Cache-Control','no-store');next();});

// ── REGISTER ──────────────────────────────────────────────────
app.post('/api/register',async(req,res)=>{
  const{phone,password}=req.body;
  if(!phone||!password)return res.status(400).json({error:'ফোন নম্বর ও পাসওয়ার্ড দিন'});
  if(password.length<6)return res.status(400).json({error:'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে'});
  const np=normPhone(phone);if(!np)return res.status(400).json({error:'সঠিক নম্বর দিন (01XXXXXXXXX)'});
  const existing=dbGet('SELECT id FROM users WHERE phone=?',[np]);
  if(existing)return res.status(409).json({error:'এই নম্বরটি ইতিমধ্যে নিবন্ধিত আছে'});
  const hash=await bcrypt.hash(password,10);
  const tmp='u_'+np.slice(-6)+'_'+Date.now().toString(36);
  dbRun('INSERT INTO users (phone,username,password_hash) VALUES (?,?,?)',[np,tmp,hash]);
  let user=dbGet('SELECT * FROM users WHERE phone=?',[np]);
  dbRun('UPDATE users SET username=? WHERE id=?',[anonName(user.id),user.id]);
  user=dbGet('SELECT * FROM users WHERE phone=?',[np]);
  const cred=findCred(np);const isAdmin=!!(cred&&cred.admin);
  const token=jwt.sign({id:user.id,username:user.username,admin:isAdmin},JWT_SECRET,{expiresIn:'30d'});
  log.info('REGISTER',np,'id='+user.id);
  res.json({token,anon_id:user.id,admin:isAdmin});
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login',async(req,res)=>{
  const{phone,password}=req.body;
  if(!phone||!password)return res.status(400).json({error:'ফোন নম্বর ও পাসওয়ার্ড দিন'});
  const np=normPhone(phone);if(!np)return res.status(400).json({error:'সঠিক নম্বর দিন (01XXXXXXXXX)'});
  const user=dbGet('SELECT * FROM users WHERE phone=?',[np]);
  if(!user)return res.status(404).json({error:'এই নম্বরে কোনো অ্যাকাউন্ট নেই — আগে নিবন্ধন করুন'});
  if(user.banned)return res.status(403).json({error:'এই অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে'});
  const ok=await bcrypt.compare(password,user.password_hash);
  if(!ok)return res.status(401).json({error:'পাসওয়ার্ড ভুল'});
  const cred=findCred(np);const isAdmin=!!(cred&&cred.admin);
  const token=jwt.sign({id:user.id,username:user.username,admin:isAdmin},JWT_SECRET,{expiresIn:'30d'});
  res.json({token,anon_id:user.id,admin:isAdmin});
});

// ── POST NEWS ─────────────────────────────────────────────────
app.post('/api/news',auth,upload.array('images',10),(req,res)=>{
  const{title,description,lat,lon,links,user_lat,user_lon}=req.body;
  if(!title||!lat||!lon)return res.status(400).json({error:'শিরোনাম, অবস্থান আবশ্যক'});
  const flat=parseFloat(lat),flon=parseFloat(lon),ulat=parseFloat(user_lat),ulon=parseFloat(user_lon);
  if(isNaN(flat)||isNaN(flon)||isNaN(ulat)||isNaN(ulon))return res.status(400).json({error:'অবৈধ স্থানাঙ্ক'});

  // Snap pin to 50×50m grid cell center
  const cell=snapToCell(flat,flon);
  const slat=cell.lat,slon=cell.lon,ckey=cell.key;

  // Must be within 5km of the snapped cell center
  const pd=hav(ulat,ulon,slat,slon);
  if(pd>PROX_KM)return res.status(403).json({error:`ঘর ${pd.toFixed(2)} কিমি দূরে (সীমা: ${PROX_KM} কিমি)`});
  if(dirSize(NEWS_DATA)>=MAX_BYTES)return res.status(507).json({error:'স্টোরেজ সীমা পূর্ণ'});

  // One news per cell — enforced at DB level (UNIQUE cell_key) and checked here for a clean error
  const occupied=dbGet('SELECT id FROM news WHERE cell_key=?',[ckey]);
  if(occupied)return res.status(409).json({error:'এই ঘরটি ইতিমধ্যে পূর্ণ — পাশের ঘর বেছে নিন'});

  const id=uid(),now=Math.floor(Date.now()/1000);
  let imgs=[];try{imgs=saveImgs(id,req.files||[]);}catch(e){return res.status(500).json({error:'ছবি সংরক্ষণ ব্যর্থ'});}
  const meta={id,owner_id:req.user.id,username:req.user.username,title:title.trim(),description:(description||'').trim(),lat:slat,lon:slon,cell_key:ckey,links:(links||'').trim(),image_count:imgs.length,images:imgs,thumb:imgs[0]||'',created_at:now};
  try{writeMeta(id,meta);}catch(e){return res.status(500).json({error:'রেকর্ড সংরক্ষণ ব্যর্থ'});}
  try{dbRun(`INSERT INTO news(id,owner_id,title,description,lat,lon,cell_key,links,image_count,thumb,created_at)VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[id,req.user.id,meta.title,meta.description,slat,slon,ckey,meta.links,imgs.length,imgs[0]||'',now]);}catch(e){log.error('DB INSERT',e.message);}
  notifyNearby(id,meta.title,slat,slon,req.user.id);
  log.info('NEWS',id,`cell=${ckey} imgs=${imgs.length}`);
  res.json({id,cell_key:ckey,image_count:imgs.length});
});

// ── REGION — 10km×10km ────────────────────────────────────────
app.get('/api/region',(req,res)=>{
  const flat=parseFloat(req.query.lat),flon=parseFloat(req.query.lon);
  if(isNaN(flat)||isNaN(flon))return res.status(400).json({error:'lat/lon required'});
  const dlat=0.09,dlon=0.10,cutoff=Math.floor(Date.now()/1000)-PURGE_TTL;
  const rows=dbAll(`SELECT id,owner_id,lat,lon,cell_key,title,description,image_count,thumb,created_at FROM news WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND created_at>? ORDER BY created_at DESC LIMIT 2000`,[flat-dlat,flat+dlat,flon-dlon,flon+dlon,cutoff]);
  const scored=withScores(rows);
  const markers=scored.map(n=>({id:n.id,lat:n.lat,lon:n.lon,cell_key:n.cell_key,thumb:n.thumb,title:n.title,real_score:n.real_score,fake_score:n.fake_score,created_at:n.created_at}));
  const feed=[...scored].sort((a,b)=>(b.real_score-b.fake_score)-(a.real_score-a.fake_score)).slice(0,20);
  res.json({markers,feed,total:scored.length,ts:Date.now()});
});

// ── NEARBY — small bbox for cell check ───────────────────────
app.get('/api/news/nearby',(req,res)=>{
  const flat=parseFloat(req.query.lat),flon=parseFloat(req.query.lon);
  if(isNaN(flat)||isNaN(flon))return res.status(400).json({error:'lat/lon required'});
  res.json(dbAll(`SELECT id,lat,lon,cell_key FROM news WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 200`,[flat-0.009,flat+0.009,flon-0.010,flon+0.010]));
});

// ── MY NEWS ───────────────────────────────────────────────────
app.get('/api/my/news',auth,(req,res)=>{
  const rows=dbAll(`SELECT id,title,lat,lon,thumb,image_count,created_at FROM news WHERE owner_id=? ORDER BY created_at DESC LIMIT 50`,[req.user.id]);
  res.json(withScores(rows));
});

// ── NOTIFICATIONS ─────────────────────────────────────────────
function notifyNearby(newsId,title,lat,lon,fromUserId){
  try{
    const dlat=0.09,dlon=0.10;
    const owners=dbAll(`SELECT DISTINCT owner_id FROM news WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND owner_id!=?`,[lat-dlat,lat+dlat,lon-dlon,lon+dlon,fromUserId]);
    for(const{owner_id}of owners){try{dbRun('INSERT INTO notifications(user_id,news_id,title,dist_km)VALUES(?,?,?,0)',[owner_id,newsId,title]);}catch{}}
  }catch(e){log.warn('notify',e.message);}
}
app.get('/api/notifications',auth,(req,res)=>{
  const notes=dbAll(`SELECT id,news_id,title,dist_km,seen,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30`,[req.user.id]);
  res.json({notifications:notes,unseen:notes.filter(n=>!n.seen).length});
});
app.post('/api/notifications/seen',auth,(req,res)=>{
  dbRun('UPDATE notifications SET seen=1 WHERE user_id=?',[req.user.id]);
  res.json({ok:true});
});

// ── NEWS DETAIL ───────────────────────────────────────────────
app.get('/api/news/:id',(req,res)=>{
  const{id}=req.params;const meta=readMeta(id);
  const expires_at=meta?(meta.created_at+PURGE_TTL):null;
  if(meta){const vs=dbAll('SELECT type,weight FROM votes WHERE news_id=?',[id]);let real=0,fake=0,cnt=0;for(const v of vs){cnt++;if(v.type==='real')real+=+v.weight;else fake+=+v.weight;}const imgs=listImgs(id);return res.json({...meta,images:imgs,image_count:imgs.length,real_score:+real.toFixed(3),fake_score:+fake.toFixed(3),vote_count:cnt,expires_at});}
  const row=dbGet(`SELECT n.* FROM news n WHERE n.id=?`,[id]);
  if(!row)return res.status(404).json({error:'সংবাদ পাওয়া যায়নি'});
  const vs=dbAll('SELECT type,weight FROM votes WHERE news_id=?',[id]);let real=0,fake=0,cnt=0;for(const v of vs){cnt++;if(v.type==='real')real+=+v.weight;else fake+=+v.weight;}
  const imgs=listImgs(id);
  res.json({...row,description:row.description||'',links:row.links||'',images:imgs,image_count:imgs.length,real_score:+real.toFixed(3),fake_score:+fake.toFixed(3),vote_count:cnt,expires_at:row.created_at+PURGE_TTL});
});

// ── DELETE ────────────────────────────────────────────────────
app.delete('/api/news/:id',auth,(req,res)=>{
  const{id}=req.params;const meta=readMeta(id);const row=!meta?dbGet('SELECT owner_id,created_at FROM news WHERE id=?',[id]):null;
  const ownerId=meta?meta.owner_id:row?.owner_id;const createdAt=meta?meta.created_at:row?.created_at;
  if(!ownerId)return res.status(404).json({error:'পাওয়া যায়নি'});
  if(ownerId!==req.user.id&&!req.user.admin)return res.status(403).json({error:'অনুমতি নেই'});
  if((Math.floor(Date.now()/1000)-createdAt)>DELETE_TTL&&!req.user.admin)return res.status(403).json({error:'মুছে ফেলার সময় শেষ'});
  try{dbRun('DELETE FROM news WHERE id=?',[id]);}catch{}try{dbRun('DELETE FROM votes WHERE news_id=?',[id]);}catch{}
  delNewsDir(id);log.info('DELETED',id);res.json({deleted:true});
});

// ── VOTE ──────────────────────────────────────────────────────
app.post('/api/vote',auth,(req,res)=>{
  const{news_id,type,user_lat,user_lon}=req.body;
  if(!news_id||!['real','fake'].includes(type))return res.status(400).json({error:'অবৈধ ভোট'});
  const ulat=parseFloat(user_lat),ulon=parseFloat(user_lon);if(isNaN(ulat)||isNaN(ulon))return res.status(400).json({error:'GPS প্রয়োজন'});
  const news=dbGet('SELECT lat,lon FROM news WHERE id=?',[news_id]);if(!news)return res.status(404).json({error:'সংবাদ পাওয়া যায়নি'});
  const d=hav(ulat,ulon,+news.lat,+news.lon);if(d>PROX_KM)return res.status(403).json({error:`${d.toFixed(2)} কিমি দূরে`});
  try{dbRun(`INSERT INTO votes(news_id,user_id,type,weight)VALUES(?,?,?,?)ON CONFLICT(news_id,user_id)DO UPDATE SET type=excluded.type,weight=excluded.weight,voted_at=strftime('%s','now')`,[news_id,req.user.id,type,voteW(d)]);}catch{return res.status(500).json({error:'ভোট সংরক্ষণ ব্যর্থ'});}
  res.json({ok:true,type,weight:+voteW(d).toFixed(2)});
});

// ══════════════════════════════════════════════════════════════
// ADMIN API
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/stats',adminAuth,(req,res)=>{
  const used=dirSize(NEWS_DATA);
  res.json({
    storage_used_gb:+(used/1e9).toFixed(3),storage_max_gb:10,storage_pct:+((used/MAX_BYTES)*100).toFixed(1),
    news_count:dbAll('SELECT COUNT(*) as c FROM news')[0]?.c||0,
    user_count:dbAll('SELECT COUNT(*) as c FROM users')[0]?.c||0,
    vote_count:dbAll('SELECT COUNT(*) as c FROM votes')[0]?.c||0,
    banned_count:dbAll('SELECT COUNT(*) as c FROM users WHERE banned=1')[0]?.c||0,
    version:'v16',
  });
});

app.get('/api/admin/news',adminAuth,(req,res)=>{
  const page=Math.max(0,parseInt(req.query.page)||0),limit=parseInt(req.query.limit)||30,q=req.query.q||'';
  const rows=q
    ?dbAll(`SELECT id,owner_id,title,lat,lon,image_count,thumb,created_at FROM news WHERE title LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,['%'+q+'%',limit,page*limit])
    :dbAll(`SELECT id,owner_id,title,lat,lon,image_count,thumb,created_at FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?`,[limit,page*limit]);
  res.json({news:withScores(rows),total:dbAll('SELECT COUNT(*) as c FROM news')[0]?.c||0,page,limit});
});

app.delete('/api/admin/news/:id',adminAuth,(req,res)=>{
  const{id}=req.params;
  try{dbRun('DELETE FROM votes WHERE news_id=?',[id]);}catch{}try{dbRun('DELETE FROM news WHERE id=?',[id]);}catch{}
  delNewsDir(id);log.info('ADMIN DELETED',id);res.json({deleted:true});
});

app.get('/api/admin/users',adminAuth,(req,res)=>{
  const users=dbAll('SELECT id,phone,username,trust_score,banned,created_at FROM users ORDER BY created_at DESC');
  res.json(users.map(u=>({...u,phone:u.phone?u.phone.slice(0,4)+'****'+u.phone.slice(-2):'—',news_count:dbAll('SELECT COUNT(*) as c FROM news WHERE owner_id=?',[u.id])[0]?.c||0})));
});

app.post('/api/admin/users/:id/ban',adminAuth,(req,res)=>{
  const uid=parseInt(req.params.id);const{ban}=req.body;
  dbRun('UPDATE users SET banned=? WHERE id=?',[ban?1:0,uid]);
  log.info('ADMIN',ban?'BANNED':'UNBANNED','uid',uid);res.json({ok:true,banned:!!ban});
});

app.delete('/api/admin/users/:id/news',adminAuth,(req,res)=>{
  const uid=parseInt(req.params.id);const rows=dbAll('SELECT id FROM news WHERE owner_id=?',[uid]);
  for(const{id}of rows){try{dbRun('DELETE FROM votes WHERE news_id=?',[id]);}catch{}try{dbRun('DELETE FROM news WHERE id=?',[id]);}catch{}delNewsDir(id);}
  log.info('ADMIN PURGED news for uid',uid,rows.length,'items');res.json({deleted:rows.length});
});

app.get('/api/status',(req,res)=>{
  const used=dirSize(NEWS_DATA);
  res.json({storage_used_gb:+(used/1e9).toFixed(3),storage_max_gb:10,storage_pct:+((used/MAX_BYTES)*100).toFixed(1),news_count:dbAll('SELECT COUNT(*) as c FROM news')[0]?.c||0,version:'v16'});
});

// ── REAPER ────────────────────────────────────────────────────
if(!IS_VERCEL){
  cron.schedule('*/15 * * * *',()=>{
    const cutoff=Math.floor(Date.now()/1000)-PURGE_TTL;
    const stale=dbAll('SELECT id FROM news WHERE created_at<?',[cutoff]);
    if(!stale.length)return;
    for(const{id}of stale){try{dbRun('DELETE FROM votes WHERE news_id=?',[id]);}catch{}try{dbRun('DELETE FROM news WHERE id=?',[id]);}catch{}delNewsDir(id);}
    try{dbRun('DELETE FROM notifications WHERE created_at<?',[cutoff]);}catch{}
    log.info('REAPER: purged '+stale.length);
  });
}

// ── BOOT ──────────────────────────────────────────────────────
initDB().then(()=>{
  _dbReady=true;_dbRes();
  if(fs.existsSync(NEWS_DATA)){let r=0;for(const id of fs.readdirSync(NEWS_DATA)){const m=readMeta(id);if(!m)continue;if(!dbGet('SELECT id FROM news WHERE id=?',[m.id])){const cell=snapToCell(m.lat,m.lon);try{dbRun(`INSERT INTO news(id,owner_id,title,description,lat,lon,cell_key,links,image_count,thumb,created_at)VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[m.id,m.owner_id,m.title,m.description||'',cell.lat,cell.lon,m.cell_key||cell.key,m.links||'',m.image_count||0,(m.images||[])[0]||'',m.created_at]);r++;}catch(e){log.error('REBUILD',id,e.message);}}}if(r)log.info(`Boot: rebuilt ${r}`);}
  const creds=loadCreds();log.info(`Credentials: ${creds.length} accounts, ${creds.filter(c=>c.admin).length} admin(s)`);
  if(!IS_VERCEL){app.listen(PORT,()=>{log.info('BD News Map v16 → http://localhost:'+PORT);log.info('Storage: '+(dirSize(NEWS_DATA)/1e6).toFixed(1)+' MB');});}
  else log.info('BD News Map v16 on Vercel');
}).catch(e=>{console.error('FATAL DB INIT:',e);_dbRej(e);});

module.exports=app;
