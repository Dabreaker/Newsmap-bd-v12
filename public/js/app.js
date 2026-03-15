'use strict';
// জনবার্তা

// ══════════════════════════════════════════════════════════════
// I18N — English / Bengali
// ══════════════════════════════════════════════════════════════
const I18N={
  bn:{
    home:'হোম',map:'মানচিত্র',explore:'অন্বেষণ',notif:'বিজ্ঞপ্তি',
    notif_short:'বিজ্ঞপ্তি',account:'আমার অ্যাকাউন্ট',report:'সংবাদ রিপোর্ট',
    report_short:'রিপোর্ট',me:'আমি',login_sub:'লগইন বা নিবন্ধন করুন',
    phone:'ফোন নম্বর',password:'পাসওয়ার্ড',enter:'লগইন করুন',
    auth_hint:'যেকেউ নিবন্ধন করতে পারবেন',
    register:'নিবন্ধন করুন',have_account:'ইতিমধ্যে অ্যাকাউন্ট আছে?',no_account:'নতুন ব্যবহারকারী?',
    title:'শিরোনাম *',desc:'বিবরণ',publish:'প্রকাশ করুন',
    pull_refresh:'টেনে ধরুন রিফ্রেশ করতে',tagline:'সত্য সংবাদ · সত্যিকার মানুষ',
    explore_sub:'আশেপাশের সব সংবাদ',notif_sub:'আশেপাশের নতুন সংবাদ',
    verified:'✓ যাচাইকৃত',suspicious:'⚠ সন্দেহজনক',checking:'◉ যাচাই চলছে',
    nearby:'আপনার কাছাকাছি',recent:'সাম্প্রতিক সংবাদ',more:'আরো সংবাদ',
    no_news:'আশেপাশে এখনো কোনো সংবাদ নেই।',report_first:'আপনিই প্রথম রিপোর্ট করুন!',
    login_to_vote:'ভোট দিতে লগইন করুন',enable_loc:'লোকেশন চালু করুন',
    saved:'সংরক্ষণ হয়েছে ✓',unsaved:'সংরক্ষণ সরানো হয়েছে',
    truth:'% সত্যতা',votes:'ভোট',km:'কিমি',
    ago_s:'সে',ago_m:'মি',ago_h:'ঘ',ago_d:'দিন',
    bismillah:'পরম করুণাময়ের নামে শুরু',
    help:'সহযোগিতা করুন',help_msg:'এই অ্যাপটি সত্যিকারে কার্যকরভাবে রিলিজ করতে আপনাদের সাহায্য প্রয়োজন।',
    copy:'কপি',copied:'কপি হয়েছে',logout:'লগআউট',
    bookmarks:'সংরক্ষিত সংবাদ',no_bookmarks:'এখনো কিছু সংরক্ষণ করেননি।',
    history:'আমার সংবাদ',no_history:'আপনি এখনো কোনো সংবাদ পোস্ট করেননি।',
    notif_empty:'কোনো বিজ্ঞপ্তি নেই।',mark_seen:'সব পড়া হয়েছে ✓',
    zoom_hint:'জুম করুন — সংবাদ দেখতে (জুম ১৩+)',
  },
  en:{
    home:'Home',map:'Map',explore:'Explore',notif:'Notifications',
    notif_short:'Notifs',account:'My Account',report:'Report News',
    report_short:'Report',me:'Me',login_sub:'Login or register',
    phone:'Phone Number',password:'Password',enter:'Login',
    auth_hint:'Anyone can register',
    register:'Register',have_account:'Already have an account?',no_account:'New user?',
    title:'Title *',desc:'Description',publish:'Publish',
    pull_refresh:'Pull down to refresh',tagline:'True News · Real People',
    explore_sub:'All news nearby',notif_sub:'New news nearby',
    verified:'✓ Verified',suspicious:'⚠ Suspicious',checking:'◉ Checking',
    nearby:'Near You',recent:'Recent News',more:'More News',
    no_news:'No news in your area yet.',report_first:'Be the first to report!',
    login_to_vote:'Login to vote',enable_loc:'Enable location',
    saved:'Saved ✓',unsaved:'Removed from saved',
    truth:'% truth',votes:'votes',km:'km',
    ago_s:'s',ago_m:'m',ago_h:'h',ago_d:'d',
    bismillah:'In the name of God, the Most Gracious',
    help:'Support Us',help_msg:'We need your help to properly launch this app.',
    copy:'Copy',copied:'Copied',logout:'Logout',
    bookmarks:'Saved News',no_bookmarks:'Nothing saved yet.',
    history:'My Reports',no_history:'You have not posted any news yet.',
    notif_empty:'No notifications yet.',mark_seen:'Mark all read',
    zoom_hint:'Zoom in to see news (zoom 13+)',
  }
};
let LANG=localStorage.getItem('jb_lang')||'bn';
function t(k){return(I18N[LANG]||I18N.bn)[k]||k;}
function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.getElementById('bismillah-text').textContent=t('bismillah');
  document.querySelectorAll('[data-i18n-sub]').forEach(el=>{el.textContent=t(el.dataset.i18nSub);});
  document.getElementById('lang-btn').textContent=LANG==='bn'?'EN':'বাং';
  document.getElementById('explore-search').placeholder=LANG==='bn'?'সংবাদ খুঁজুন…':'Search news…';
}
function toggleLang(){
  LANG=LANG==='bn'?'en':'bn';
  localStorage.setItem('jb_lang',LANG);
  applyI18n();
  loadHome();loadExplore();
}

// ── THEME ─────────────────────────────────────────────────────
let THEME=localStorage.getItem('jb_theme')||'dark';
function applyTheme(){
  document.documentElement.setAttribute('data-theme',THEME);
  document.getElementById('theme-btn').textContent=THEME==='dark'?'🌙':'☀️';
}
function toggleTheme(){
  THEME=THEME==='dark'?'light':'dark';
  localStorage.setItem('jb_theme',THEME);
  applyTheme();
}

// ── VERSES ────────────────────────────────────────────────────
const VERSES=[
  {bn:'নিশ্চয়ই কষ্টের সাথে স্বস্তি আছে।',en:'Verily with hardship comes ease.',ref:'94:5'},
  {bn:'যে আল্লাহর উপর ভরসা করে, আল্লাহই তার জন্য যথেষ্ট।',en:'Whoever relies on Allah — He is sufficient.',ref:'65:3'},
  {bn:'আল্লাহ কাউকে তার সাধ্যের বাইরে বোঝা চাপিয়ে দেন না।',en:'Allah does not burden a soul beyond its capacity.',ref:'2:286'},
  {bn:'সত্য এসেছে এবং মিথ্যা বিলুপ্ত হয়েছে।',en:'Truth has come and falsehood has perished.',ref:'17:81'},
  {bn:'আল্লাহর স্মরণেই অন্তর প্রশান্তি পায়।',en:'In the remembrance of Allah do hearts find rest.',ref:'13:28'},
  {bn:'নিশ্চয়ই আল্লাহ ধৈর্যশীলদের সাথে আছেন।',en:'Allah is with the patient.',ref:'2:153'},
  {bn:'তোমরা আমাকে ডাকো, আমি তোমাদের ডাকে সাড়া দেব।',en:'Call upon Me and I will respond to you.',ref:'40:60'},
];
function showVerse(id){
  const el=document.getElementById(id);if(!el)return;
  const v=VERSES[Math.floor(Math.random()*VERSES.length)];
  el.innerHTML=`<div class="vtext">${LANG==='en'?v.en:v.bn}</div><div class="vref">${v.ref}</div>`;
}

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
const S={token:null,anon_id:null,admin:false,userLat:null,userLon:null,reportLat:null,reportLon:null,pinInRange:null,mapReady:false,activeTab:'home',_authCb:null};
(()=>{try{const t=localStorage.getItem('jb_token'),a=localStorage.getItem('jb_aid'),ad=localStorage.getItem('jb_admin');if(t&&a){S.token=t;S.anon_id=parseInt(a)||null;S.admin=ad==='1';}}catch{}})();

// ── BOOKMARKS ─────────────────────────────────────────────────
const BM={_k:'jb_bm11',load(){try{return JSON.parse(localStorage.getItem(this._k)||'{}');}catch{return{};}},save(d){try{localStorage.setItem(this._k,JSON.stringify(d));}catch{}},has(id){return!!this.load()[id];},toggle(id,title){const d=this.load();if(d[id])delete d[id];else d[id]={id,title,ts:Date.now()};this.save(d);return!!d[id];},getAll(){return Object.values(this.load()).sort((a,b)=>b.ts-a.ts);}};

// ── CACHE ─────────────────────────────────────────────────────
const CACHE={markers:[],feed:[],total:0,lat:null,lon:null,ts:0,STALE_MS:5*60*1000,MOVE_KM:3,
  fresh(lat,lon){if(!this.lat||Date.now()-this.ts>this.STALE_MS)return false;return hav(lat,lon,this.lat,this.lon)<=this.MOVE_KM;},
  async load(lat,lon){if(this.fresh(lat,lon))return true;const d=await api('GET',`/api/region?lat=${lat}&lon=${lon}`);if(d.error||!d.markers)return false;this.markers=d.markers;this.feed=d.feed;this.total=d.total||d.markers.length;this.lat=lat;this.lon=lon;this.ts=Date.now();const b=document.getElementById('home-badge');if(b){b.textContent=`📍 ${this.total}`;b.style.display=this.total?'block':'none';}return true;},
  invalidate(){this.ts=0;}};

// ── MAP FILTER ────────────────────────────────────────────────
let MAP_FILTER='all'; // all | real | fake
function setMapFilter(f){
  MAP_FILTER=f;
  ['all','real','fake'].forEach(x=>document.getElementById('mf-'+x)?.classList.toggle('on',x===f));
  if(MAP)NM._apply(CACHE.markers,MAP.getZoom());
}

// ── GEOHASH ───────────────────────────────────────────────────
(()=>{const B='0123456789bcdefghjkmnpqrstuvwxyz';function enc(lat,lon,p){let i=0,b=0,e=true,h='';let la=-90,La=90,lo=-180,Lo=180;while(h.length<p){if(e){const m=(lo+Lo)/2;if(lon>m){i=(i<<1)|1;lo=m;}else{i<<=1;Lo=m;}}else{const m=(la+La)/2;if(lat>m){i=(i<<1)|1;la=m;}else{i<<=1;La=m;}}e=!e;if(++b===5){h+=B[i];b=0;i=0;}}return h;}window._gh={enc};})();

// ── GRID — 50×50m, matches server exactly ────────────────────
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

// ── UTILS ─────────────────────────────────────────────────────
function hav(la1,lo1,la2,lo2){const R=6371,r=d=>d*Math.PI/180;const a=Math.sin(r(la2-la1)/2)**2+Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(r(lo2-lo1)/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
// mkPin replaced by mkSqPin (fixed square, no zoom scaling)
function rt(u){const d=Math.floor(Date.now()/1000)-u;if(d<60)return d+t('ago_s');if(d<3600)return Math.floor(d/60)+t('ago_m');if(d<86400)return Math.floor(d/3600)+t('ago_h');return Math.floor(d/86400)+t('ago_d');}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function pct(n){const tot=+n.real_score+(+n.fake_score);return tot>0?Math.round((+n.real_score/tot)*100):50;}
function fmtExpiry(expires_at){if(!expires_at)return'';const rem=expires_at-Math.floor(Date.now()/1000);if(rem<=0)return'মেয়াদ শেষ';const h=Math.floor(rem/3600),m=Math.floor((rem%3600)/60);return h>0?`${h}ঘ ${m}মি বাকি`:`${m}মি বাকি`;}

// ── API ───────────────────────────────────────────────────────
async function api(method,url,body,isForm){
  const o={method,headers:{}};
  if(S.token)o.headers['Authorization']='Bearer '+S.token;
  if(body){if(isForm)o.body=body;else{o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}}
  try{
    const r=await fetch(url,o);const ct=r.headers.get('content-type')||'';
    if(!ct.includes('application/json'))return{error:'Server error ('+r.status+')'};
    const d=await r.json();d._status=r.status;
    if(r.status===401&&S.token){S.token=null;S.anon_id=null;S.admin=false;try{localStorage.removeItem('jb_token');localStorage.removeItem('jb_aid');localStorage.removeItem('jb_admin');}catch{}renderUser();toast(t('enter')+' — '+t('login_sub'),true);openAuth();}
    return d;
  }catch{return{error:'নেটওয়ার্ক ত্রুটি'};}
}

// ── TOAST ─────────────────────────────────────────────────────
let _tt;
function toast(msg,err){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show'+(err?' err':'');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),3500);}

// ── GPS ───────────────────────────────────────────────────────
function gps(){return new Promise(res=>{if(S.userLat!==null)return res({lat:S.userLat,lon:S.userLon});if(!navigator.geolocation){S.userLat=23.8103;S.userLon=90.4125;return res({lat:23.8103,lon:90.4125});}navigator.geolocation.getCurrentPosition(p=>{S.userLat=p.coords.latitude;S.userLon=p.coords.longitude;res({lat:S.userLat,lon:S.userLon});},()=>{if(!S.userLat){S.userLat=23.8103;S.userLon=90.4125;}res({lat:S.userLat,lon:S.userLon});},{enableHighAccuracy:true,timeout:8000,maximumAge:60000});});}

// ── TABS ──────────────────────────────────────────────────────
function switchTab(name){
  if(name==='report'&&!S.token){S._authCb=()=>switchTab('report');openAuth();return;}
  if(name==='admin'&&!S.admin){toast('Admin only',true);return;}
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tbb,.dn-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  const el=document.getElementById('screen-'+name);if(el)el.classList.add('active');
  S.activeTab=name;
  if(name!=='map')closeMapCard();
  if(name==='home'){showVerse('vh');loadHome();}
  if(name==='map')  initMap();
  if(name==='explore'){loadExplore();}
  if(name==='notify') loadNotifications();
  if(name==='user')   renderUser();
  if(name==='report') initReportMap();
  if(name==='admin')  loadAdmin();
}

// ── MARKER MANAGER — geo-accurate 50×50m blocks, scale with zoom ──
// Layer order per cell (bottom → top):
//   1. imageOverlay  — photo fills cell, interactive:false (no click handling)
//   2. border rect   — colored stroke + faint fill, interactive:false
//   3. hit rect      — fully transparent, interactive:true, captures all taps
// This guarantees clicks always fire on mobile regardless of overlay type.
const NM={markers:{},_busy:false,
  reset(){
    Object.values(this.markers).forEach(m=>{
      if(MAP){
        if(m.img)MAP.removeLayer(m.img);
        if(m.border)MAP.removeLayer(m.border);
        if(m.hit)MAP.removeLayer(m.hit);
        if(m.lbl)MAP.removeLayer(m.lbl);
      }
    });
    this.markers={};
  },
  async update(center,zoom){if(this._busy)return;this._busy=true;try{await CACHE.load(center.lat,center.lng);this._apply(CACHE.markers,zoom);}finally{this._busy=false;}},
  _apply(data,zoom){
    const seen=new Set();
    if(zoom<=12){
      this.reset();
      const el=document.getElementById('map-info');
      if(el)el.textContent=t('zoom_hint');
      return;
    }
    const filtered=data.filter(n=>{
      if(MAP_FILTER==='real')return(+n.real_score)>(+n.fake_score);
      if(MAP_FILTER==='fake')return(+n.fake_score)>(+n.real_score);
      return true;
    });
    filtered.forEach(n=>{
      seen.add(n.id);
      const clat=+n.lat, clon=+n.lon;
      const diff=(+n.real_score)-(+n.fake_score);
      const col=diff>2?'#00d496':diff<-2?'#ff4b6e':'#4c7bff';
      const bounds=[
        [clat-GRID_DLAT/2, clon-GRID_DLON/2],
        [clat+GRID_DLAT/2, clon+GRID_DLON/2]
      ];
      if(!this.markers[n.id]){
        // 1. Photo layer (bottom) — non-interactive, just visual
        let img=null;
        if(n.thumb){
          img=L.imageOverlay(n.thumb,bounds,{
            opacity:1,interactive:false,crossOrigin:'anonymous',className:'nm-cell-img',
          }).addTo(MAP);
        } else {
          // No photo — emoji label centered in cell
          const icon=L.divIcon({
            html:`<div style="font-size:20px;line-height:1;pointer-events:none;text-align:center;">📰</div>`,
            iconSize:[24,24],iconAnchor:[12,12],className:'',
          });
          img=L.marker([clat,clon],{icon,interactive:false,keyboard:false}).addTo(MAP);
        }
        // 2. Border rect — colored stroke, non-interactive
        const border=L.rectangle(bounds,{
          color:col,weight:2,opacity:0.9,
          fillColor:col,fillOpacity:n.thumb?0:0.18,
          interactive:false,
        }).addTo(MAP);
        // 3. Hit rect — fully transparent, ONLY this captures clicks/taps
        const hit=L.rectangle(bounds,{
          color:'transparent',weight:0,
          fillColor:'transparent',fillOpacity:0,
          interactive:true,
        }).addTo(MAP);
        hit.on('click',e=>{L.DomEvent.stopPropagation(e);openModal(n.id);});
        this.markers[n.id]={img,border,hit,lbl:null,col,thumb:n.thumb||''};
      } else {
        const m=this.markers[n.id];
        if(col!==m.col){
          m.border.setStyle({color:col,fillColor:col});
          m.col=col;
        }
        if(n.thumb&&n.thumb!==m.thumb){
          if(m.img&&m.img.setUrl)m.img.setUrl(n.thumb);
          m.thumb=n.thumb;
        }
      }
    });
    Object.entries(this.markers).forEach(([id,m])=>{
      if(!seen.has(id)){
        if(MAP){
          if(m.img)MAP.removeLayer(m.img);
          if(m.border)MAP.removeLayer(m.border);
          if(m.hit)MAP.removeLayer(m.hit);
          if(m.lbl)MAP.removeLayer(m.lbl);
        }
        delete this.markers[id];
      }
    });
    const el=document.getElementById('map-info');
    if(el)el.textContent=`📡 ${Object.keys(this.markers).length} / ${data.length}`;
  }
};

// ── MAIN MAP ──────────────────────────────────────────────────
let MAP=null,uCircle=null,uDot=null,_mpd=null;
async function initMap(){
  if(S.mapReady){setTimeout(()=>{if(MAP){MAP.invalidateSize();trigLoad();}},80);return;}
  S.mapReady=true;
  const{lat,lon}=await gps();
  MAP=L.map('map',{zoomControl:false,preferCanvas:true,tap:true}).setView([lat,lon],16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OSM',maxZoom:21,keepBuffer:2,updateWhenIdle:false,updateWhenZooming:false}).addTo(MAP);
  L.control.zoom({position:'bottomright'}).addTo(MAP);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{MAP.invalidateSize();drawUser(lat,lon);trigLoad();}));
  MAP.on('moveend',()=>{clearTimeout(_mpd);_mpd=setTimeout(trigLoad,400);});
  MAP.on('zoomend',()=>{if(MAP)NM._apply(CACHE.markers,MAP.getZoom());});
}
function trigLoad(){if(MAP)NM.update(MAP.getCenter(),MAP.getZoom());}
function forceMapRefresh(){CACHE.invalidate();if(MAP)NM.update(MAP.getCenter(),MAP.getZoom());toast('🔄 Refreshed');}
function drawUser(lat,lon){
  if(uCircle){uCircle.remove();uDot&&uDot.remove();}
  uCircle=L.circle([lat,lon],{radius:5000,color:'#00d496',weight:1.5,opacity:.4,dashArray:'6 5',fillColor:'#00d496',fillOpacity:.03,interactive:false}).addTo(MAP);
  uDot=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2.5,fillColor:'#4c7bff',fillOpacity:1,interactive:false}).addTo(MAP);
}
function locateMe(){if(!MAP)return;S.userLat=null;gps().then(({lat,lon})=>{MAP.flyTo([lat,lon],17,{duration:0.8});drawUser(lat,lon);toast('📍 Updated');});}

// ── REPORT MAP ────────────────────────────────────────────────
let RMAP=null,rPinGroup=null,rMapReady=false;
async function initReportMap(){
  if(rMapReady)return;rMapReady=true;
  const{lat,lon}=await gps();
  RMAP=L.map('report-map',{zoomControl:true,tap:true}).setView([lat,lon],17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21,attribution:'&copy; OSM'}).addTo(RMAP);
  L.circle([lat,lon],{radius:5000,color:'#00d496',weight:1.5,opacity:.6,dashArray:'7 5',fillColor:'#00d496',fillOpacity:.04,interactive:false}).addTo(RMAP);
  L.circleMarker([lat,lon],{radius:9,color:'#fff',weight:2.5,fillColor:'#4c7bff',fillOpacity:1,interactive:false}).addTo(RMAP);
  rPinGroup=L.layerGroup().addTo(RMAP);
  const hint=document.getElementById('rmap-hint'),st=document.getElementById('rmap-st');
  RMAP.on('click',async e=>{
    const cell=snapToCell(e.latlng.lat,e.latlng.lng);
    const slat=cell.lat,slon=cell.lon;
    const dist=hav(lat,lon,slat,slon),inRange=dist<=5;
    S.reportLat=slat;S.reportLon=slon;S.pinInRange=inRange;
    rPinGroup.clearLayers();
    // Show exact 50×50m grid cell
    L.rectangle([[slat-GRID_DLAT/2,slon-GRID_DLON/2],[slat+GRID_DLAT/2,slon+GRID_DLON/2]],{color:inRange?'#00d496':'#ff4b6e',weight:2,dashArray:'5 4',fillColor:inRange?'#00d496':'#ff4b6e',fillOpacity:0.15}).addTo(rPinGroup);
    L.circleMarker([slat,slon],{radius:4,color:'#fff',weight:2,fillColor:inRange?'#00d496':'#ff4b6e',fillOpacity:1}).addTo(rPinGroup);
    hint.style.display='none';st.style.display='block';
    if(!inRange){st.textContent=`${dist.toFixed(2)} ${t('km')} — ৫ কিমি সীমার বাইরে ✗`;st.className='rst-bad';return;}
    st.textContent='পরীক্ষা করছি…';st.className='';
    await CACHE.load(lat,lon);
    const occ=CACHE.markers.some(n=>{const c=snapToCell(+n.lat,+n.lon);return c.key===cell.key;});
    if(occ){st.textContent='এই ঘর পূর্ণ — পাশের ঘর বেছে নিন ⚠';st.className='rst-cell';S.pinInRange=false;}
    else{st.textContent=`${dist.toFixed(2)} ${t('km')} — ঘর খালি ✓`;st.className='rst-ok';}
  });
  setTimeout(()=>RMAP.invalidateSize(),120);
}
function prevImgs(input){const p=document.getElementById('img-prev');p.innerHTML='';[...input.files].slice(0,10).forEach(f=>{const i=document.createElement('img');i.src=URL.createObjectURL(f);p.appendChild(i);});}

async function submitReport(){
  if(!S.token){openAuth();return;}
  const title=document.getElementById('r-title').value.trim(),desc=document.getElementById('r-desc').value.trim(),links=document.getElementById('r-links').value.trim(),imgs=document.getElementById('r-images').files;
  if(!title){toast(t('title')+' আবশ্যক',true);return;}
  if(!S.reportLat){toast('মানচিত্রে পিন করুন',true);return;}
  if(S.pinInRange===false){toast('পিন সীমার বাইরে বা ঘর পূর্ণ',true);return;}
  const btn=document.getElementById('submit-btn');if(btn.disabled)return;
  btn.disabled=true;btn.textContent='প্রকাশ হচ্ছে…';
  const fd=new FormData();fd.append('title',title);fd.append('description',desc);fd.append('lat',S.reportLat);fd.append('lon',S.reportLon);fd.append('links',links);fd.append('user_lat',S.userLat??S.reportLat);fd.append('user_lon',S.userLon??S.reportLon);[...imgs].forEach(f=>fd.append('images',f));
  const r=await api('POST','/api/news',fd,true);
  btn.disabled=false;btn.textContent=t('publish');
  if(r.error){toast('ত্রুটি: '+r.error,true);return;}
  toast('সংবাদ প্রকাশিত হয়েছে ✓');CACHE.invalidate();
  ['r-title','r-desc','r-links'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('r-images').value='';document.getElementById('img-prev').innerHTML='';
  const st=document.getElementById('rmap-st');if(st){st.style.display='none';st.className='';}
  document.getElementById('rmap-hint').style.display='block';
  S.reportLat=null;S.reportLon=null;S.pinInRange=null;
  if(rPinGroup)rPinGroup.clearLayers();
  rMapReady=false;if(RMAP){RMAP.remove();RMAP=null;}rPinGroup=null;
  NM.reset();S.mapReady=false;
  switchTab('home');
}

// ── DONATION ──────────────────────────────────────────────────
function donationHTML(){return`<div class="donate-card glass"><div class="dc-head"><span style="font-size:22px">🤲</span><div><div style="font-weight:800;font-size:15px;color:var(--gold)">${t('help')}</div><div style="font-size:11px;color:var(--muted);margin-top:1px">জনবার্তা</div></div></div><p class="dc-msg">${t('help_msg')}</p><div class="dc-methods"><div class="dc-method" onclick="copyNum('bKash')"><div class="dc-logo" style="background:#E2136E">bK</div><div class="dc-info"><div class="dc-label">bKash</div><div class="dc-num">01710552580</div></div><div>📋</div></div><div class="dc-method" onclick="copyNum('Nagad')"><div class="dc-logo" style="background:#F7941D">Ng</div><div class="dc-info"><div class="dc-label">Nagad</div><div class="dc-num">01710552580</div></div><div>📋</div></div><div class="dc-method" onclick="copyNum('Rocket')"><div class="dc-logo" style="background:#8B1DB8">Rk</div><div class="dc-info"><div class="dc-label">Rocket</div><div class="dc-num">01710552580</div></div><div>📋</div></div></div><div class="dc-footer">সংবাদ হোক দালাল মুক্ত — BD News Map</div></div>`;}
function copyNum(svc){const n='01710552580';navigator.clipboard.writeText(n).then(()=>toast(svc+' '+t('copied')+': '+n)).catch(()=>toast(n));}

// ── HOME ──────────────────────────────────────────────────────
async function loadHome(force=false){
  if(force)CACHE.invalidate();
  const el=document.getElementById('home-content');el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const{lat,lon}=await gps();await CACHE.load(lat,lon);
  const feed=CACHE.feed;
  if(!feed.length){el.innerHTML=`<div class="empty"><div class="ei">🗺️</div><p>${t('no_news')}<br>${t('report_first')}</p></div>${donationHTML()}`;return;}
  const bc=n=>+n.real_score>+n.fake_score?'breal':+n.fake_score>+n.real_score?'bfake':'bneu';
  const bt=n=>+n.real_score>+n.fake_score?t('verified'):+n.fake_score>+n.real_score?t('suspicious'):t('checking');
  const hero=feed[0],rest=feed.slice(1,5),later=feed.slice(5);
  el.innerHTML=`
    <div class="slabel">${t('nearby')}</div>
    <div class="hcard glass" onclick="openModal('${hero.id}')">
      ${hero.thumb?`<img class="h-img" src="${esc(hero.thumb)}" loading="lazy" onerror="this.style.display='none'">`:`<div class="h-noimg">📰</div>`}
      <div class="h-body"><span class="hbadge ${bc(hero)}">${bt(hero)}</span>
      <div class="htitle">${esc(hero.title)}</div>
      <div class="hmeta"><span>${rt(hero.created_at)}</span><span>${hav(lat,lon,+hero.lat,+hero.lon).toFixed(1)} ${t('km')}</span><span>${hero.vote_count||0} ${t('votes')}</span></div>
      <div class="tbw"><div class="tb" style="width:${pct(hero)}%"></div></div></div>
    </div>
    ${rest.length?`<div class="slabel" style="margin-top:16px">${t('recent')}</div>
    <div class="crow">${rest.map(n=>`<div class="mcard glass" onclick="openModal('${n.id}')">
      ${n.thumb?`<img class="m-img" src="${esc(n.thumb)}" loading="lazy" onerror="this.style.display='none'">`:`<div class="m-noimg">📰</div>`}
      <div class="m-body"><div class="m-title">${esc(n.title)}</div>
      <div class="m-meta"><span class="sp ${+n.real_score>+n.fake_score?'sp-r':'sp-f'}">${pct(n)}${t('truth')}</span><span>${hav(lat,lon,+n.lat,+n.lon).toFixed(1)}${t('km')}</span></div></div>
    </div>`).join('')}</div>`:``}
    ${later.length?`<div class="slabel" style="margin-top:16px">${t('more')}</div>
    ${later.map(n=>`<div class="lcard glass" onclick="openModal('${n.id}')">
      ${n.thumb?`<img class="l-img" src="${esc(n.thumb)}" loading="lazy" onerror="this.style.display='none'">`:`<div class="l-noimg">📰</div>`}
      <div class="l-body"><div class="l-title">${esc(n.title)}</div><div class="l-meta">${rt(n.created_at)} · ${hav(lat,lon,+n.lat,+n.lon).toFixed(1)} ${t('km')}</div></div>
      <div class="l-sc ${+n.real_score>+n.fake_score?'sc-r':'sc-f'}">${pct(n)}%</div>
    </div>`).join('')}`:``}
    ${donationHTML()}`;
}

// PTR
function initPTR(){const sc=document.getElementById('screen-home');if(!sc||sc._ptr)return;sc._ptr=true;let sy=0,pulling=false;sc.addEventListener('touchstart',e=>{if(sc.scrollTop===0){sy=e.touches[0].clientY;pulling=true;}},{passive:true});sc.addEventListener('touchmove',e=>{if(!pulling)return;const dy=e.touches[0].clientY-sy;const bar=document.getElementById('ptr-bar');if(dy>30)bar.style.display='block';},{passive:true});sc.addEventListener('touchend',e=>{const dy=e.changedTouches[0].clientY-sy;document.getElementById('ptr-bar').style.display='none';pulling=false;if(dy>80)loadHome(true);},{passive:true});}

// ── EXPLORE ───────────────────────────────────────────────────
let _exploreAll=[];
async function loadExplore(){
  const el=document.getElementById('explore-content');el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const{lat,lon}=await gps();await CACHE.load(lat,lon);
  _exploreAll=CACHE.feed;renderExploreList(_exploreAll,lat,lon);
}
function renderExploreList(list,lat,lon){
  const el=document.getElementById('explore-content');
  if(!list.length){el.innerHTML=`<div class="empty"><div class="ei">🔍</div><p>কিছু পাওয়া যায়নি।</p></div>`;return;}
  el.innerHTML=list.map(n=>`<div class="lcard glass" onclick="openModal('${n.id}')">
    ${n.thumb?`<img class="l-img" src="${esc(n.thumb)}" loading="lazy" onerror="this.style.display='none'">`:`<div class="l-noimg">📰</div>`}
    <div class="l-body"><div class="l-title">${esc(n.title)}</div><div class="l-meta">${rt(n.created_at)} · ${hav(lat||23.8,lon||90.4,+n.lat,+n.lon).toFixed(1)} ${t('km')}</div></div>
    <div class="l-sc ${+n.real_score>+n.fake_score?'sc-r':'sc-f'}">${pct(n)}%</div>
  </div>`).join('');
}
function filterExplore(q){const lat=S.userLat,lon=S.userLon;if(!q.trim()){renderExploreList(_exploreAll,lat,lon);return;}const lq=q.toLowerCase();renderExploreList(_exploreAll.filter(n=>n.title.toLowerCase().includes(lq)||(n.description||'').toLowerCase().includes(lq)),lat,lon);}

// ── NOTIFICATIONS ─────────────────────────────────────────────
async function loadNotifications(){
  if(!S.token){document.getElementById('notify-content').innerHTML=`<div class="empty"><p>${t('login_sub')}</p><button class="btn-p" style="margin-top:10px;max-width:200px" onclick="openAuth()">Login</button></div>`;return;}
  const el=document.getElementById('notify-content');el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const d=await api('GET','/api/notifications');
  if(d.error){el.innerHTML=`<div class="empty"><p>${esc(d.error)}</p></div>`;return;}
  updateNotifBadge(d.unseen||0);
  if(!d.notifications.length){el.innerHTML=`<div class="empty"><div class="ei">🔔</div><p>${t('notif_empty')}</p></div>`;return;}
  el.innerHTML=d.notifications.map(n=>`<div class="notif-item glass" onclick="openModal('${n.news_id}')">
    <div class="notif-dot ${n.seen?'seen':''}"></div>
    <div><div class="notif-title">${esc(n.title)}</div><div class="notif-meta">${rt(n.created_at)}</div></div>
  </div>`).join('');
}
async function markAllSeen(){
  if(!S.token)return;await api('POST','/api/notifications/seen');
  updateNotifBadge(0);loadNotifications();toast(t('mark_seen'));
}
function updateNotifBadge(n){
  const badge=document.getElementById('notif-badge'),tb=document.getElementById('tb-notif-dot'),dn=document.getElementById('dn-notif-dot');
  if(badge){badge.textContent=n>0?n:'';badge.style.display=n>0?'flex':'none';}
  if(tb){tb.style.display=n>0?'block':'none';}
  if(dn){dn.style.display=n>0?'block':'none';}
}
async function pollNotifications(){if(!S.token)return;const d=await api('GET','/api/notifications');if(!d.error)updateNotifBadge(d.unseen||0);}

// ── MAP CARD OVERLAY (shown over the map, not a separate screen) ──
async function openMapCard(newsId){
  const panel=document.getElementById('map-card-panel');
  const ct=document.getElementById('map-card-content');
  if(!panel||!ct)return openModal(newsId); // fallback
  ct.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  panel.classList.add('open');
  const n=await api('GET','/api/news/'+newsId);
  if(n.error){ct.innerHTML=`<div class="empty"><p>${esc(n.error)}</p></div>`;return;}
  _renderNewsDetail(ct,n);
}
function closeMapCard(){
  const panel=document.getElementById('map-card-panel');
  if(panel)panel.classList.remove('open');
}

// ── MODAL (used from home/explore/notif tabs) ─────────────────
async function openModal(newsId){
  const ol=document.getElementById('modal-overlay'),ct=document.getElementById('modal-content');
  ct.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';ol.classList.add('open');document.body.style.overflow='hidden';
  const n=await api('GET','/api/news/'+newsId);
  if(n.error){ct.innerHTML=`<div class="empty"><p>${esc(n.error)}</p></div>`;return;}
  _renderNewsDetail(ct,n);
}

function _renderNewsDetail(ct,n){
  const newsId=n.id;
  const dist=S.userLat!=null?hav(S.userLat,S.userLon,+n.lat,+n.lon):null;
  const canVote=S.token&&dist!=null&&dist<=5;
  const real=+(n.real_score||0),fake=+(n.fake_score||0),tot=real+fake,p=tot>0?Math.round((real/tot)*100):50;
  const imgs=Array.isArray(n.images)?n.images:[];
  const isOwner=S.anon_id&&n.owner_id&&Number(n.owner_id)===Number(S.anon_id);
  const ageS=Math.floor(Date.now()/1000)-(+n.created_at||0),canDel=(isOwner&&ageS<10800)||S.admin;
  const rawLinks=(n.links||'').trim();
  const linksHTML=rawLinks?rawLinks.split(/[\s,]+/).filter(Boolean).map(l=>`<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//,'').slice(0,45))}</a>`).join(''):'';
  const isBm=BM.has(newsId);const coords=`${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}`;
  const expiry=fmtExpiry(n.expires_at);
  ct.innerHTML=`
    ${imgs.length?`<div class="mcar">${imgs.map((s,i)=>`<div class="mslide"><img src="${esc(s)}" loading="lazy" style="width:100%;height:210px;object-fit:cover;border-radius:11px;display:block" onerror="this.closest('.mslide').style.display='none'">${imgs.length>1?`<div class="mcar-n">${i+1}/${imgs.length}</div>`:''}</div>`).join('')}</div>`:`<div class="noimgph">📷 ছবি নেই</div>`}
    <div class="modal-actions">
      <button class="mac-btn" id="bm-btn-${newsId}" onclick="toggleBM('${newsId}','${esc(n.title)}')" style="color:var(--gold)">${isBm?'🔖 '+t('saved'):'🏷️ Save'}</button>
      <button class="mac-btn" onclick="shareNews('${newsId}','${esc(n.title)}')" style="color:var(--accent)">📤 Share</button>
      <button class="mac-btn" onclick="copyCoords('${coords}')" style="color:var(--green)">📌 ${t('copy')}</button>
    </div>
    ${expiry?`<div class="expire-bar">⏱ <span>${expiry}</span></div>`:''}
    <div class="mtitle">${esc(n.title)}</div>
    <div class="mchips">
      <span class="mchip">🕐 ${rt(+n.created_at)}</span>
      ${dist!=null?`<span class="mchip ${dist>5?'mchip-w':''}">${dist>5?'🔴':'🟢'} ${dist.toFixed(2)} ${t('km')}</span>`:''}
    </div>
    ${n.description?`<div class="mdesc">${esc(n.description)}</div>`:''}
    <div class="tbox">
      <div class="tbls"><span class="tbf">❌ ${fake.toFixed(1)}</span><span class="tbr">✓ ${real.toFixed(1)}</span></div>
      <div class="tbw"><div class="tb" style="width:${p}%"></div></div>
      <div class="tbpct">${p}${t('truth')} · ${n.vote_count||0} ${t('votes')}</div>
    </div>
    <div class="vrow">
      <button class="bvote bvr" onclick="castVote('${n.id}','real')" ${!canVote?'disabled':''}>${t('verified')}</button>
      <button class="bvote bvf" onclick="castVote('${n.id}','fake')" ${!canVote?'disabled':''}>${t('suspicious')}</button>
    </div>
    <div class="vhint">${!S.token?t('login_to_vote'):dist==null?t('enable_loc'):dist>5?`${dist.toFixed(1)} ${t('km')} দূরে (সীমার বাইরে)`:`${dist.toFixed(2)} ${t('km')} — ভোট দেওয়া যাবে ✓`}</div>
    ${linksHTML?`<div style="margin-bottom:11px"><div class="dlbl" style="margin-bottom:4px">📎 সূত্র</div><div class="mlinks">${linksHTML}</div></div>`:''}
    <div class="dgrid">
      <div class="ditem"><div class="dlbl">স্থানাঙ্ক</div><div class="dval" onclick="copyCoords('${coords}')" style="cursor:pointer;font-size:11px">${coords}</div></div>
      <div class="ditem"><div class="dlbl">৫০মি জোন</div><div class="dval" style="font-size:10px;word-break:break-all">${n.gh_cell||'—'}</div></div>
    </div>
    ${canDel?`<button class="bdel" onclick="delNews('${n.id}')">${S.admin&&!isOwner?'🛡 Admin':'🗑'} মুছুন${!S.admin?` (${Math.max(0,Math.round((10800-ageS)/60))} মিনিট)`:''}</button>`:''}`;
}
function closeModal(e){if(e.target===document.getElementById('modal-overlay')){document.getElementById('modal-overlay').classList.remove('open');document.body.style.overflow='';}}
function toggleBM(id,title){const s=BM.toggle(id,title);const btn=document.getElementById('bm-btn-'+id);if(btn)btn.innerHTML=s?`🔖 ${t('saved')}`:`🏷️ Save`;toast(s?t('saved'):t('unsaved'));}
function shareNews(id,title){const url=`${location.origin}/#news/${id}`;if(navigator.share){navigator.share({title:title||'জনবার্তা',url}).catch(()=>{});}else{navigator.clipboard.writeText(url).then(()=>toast('Link copied')).catch(()=>toast(url));}}
function copyCoords(c){navigator.clipboard.writeText(c).then(()=>toast(t('copied')+': '+c)).catch(()=>toast(c));}
async function castVote(nid,type){if(!S.token){openAuth();return;}if(S.userLat==null){toast(t('enable_loc'),true);return;}const r=await api('POST','/api/vote',{news_id:nid,type,user_lat:S.userLat,user_lon:S.userLon});if(r.error){toast(r.error,true);return;}toast(`✓ (weight: ${r.weight})`);CACHE.invalidate();if(S.activeTab==='map')openModal(nid);else openModal(nid);}
async function delNews(nid){if(!confirm('মুছে ফেলবেন?'))return;const r=await api('DELETE','/api/news/'+nid);if(r.error){toast(r.error,true);return;}document.getElementById('modal-overlay').classList.remove('open');document.body.style.overflow='';closeMapCard();const m=NM.markers[nid];if(m){if(MAP&&m.layer)MAP.removeLayer(m.layer);delete NM.markers[nid];}CACHE.invalidate();toast('মুছে ফেলা হয়েছে');loadHome(true);}

// ── AUTH ──────────────────────────────────────────────────────
let _authMode='login'; // 'login' | 'register'
function openAuth(mode='login'){_authMode=mode;_setAuthMode(mode);document.getElementById('auth-overlay').classList.add('open');}
function closeAuth(){document.getElementById('auth-overlay').classList.remove('open');S._authCb=null;}
function closeAuthBg(e){if(e.target===document.getElementById('auth-overlay'))closeAuth();}
function _setAuthMode(mode){
  _authMode=mode;
  const isReg=mode==='register';
  document.getElementById('auth-btn').textContent=isReg?t('register'):t('enter');
  const sub=document.getElementById('auth-mode-sub');
  if(sub)sub.textContent=isReg?t('register'):t('enter');
  document.getElementById('auth-toggle-text').innerHTML=isReg
    ?`${t('have_account')} <a href="javascript:void(0)" onclick="_setAuthMode('login')" style="color:var(--accent);font-weight:700">${t('enter')}</a>`
    :`${t('no_account')} <a href="javascript:void(0)" onclick="_setAuthMode('register')" style="color:var(--accent);font-weight:700">${t('register')}</a>`;
}
async function doAuth(e){
  if(e)e.preventDefault();
  if(_authMode==='register'){doRegister();return;}
  const phone=document.getElementById('a-phone').value.trim(),password=document.getElementById('a-pass').value;
  if(!phone||!password){toast(t('phone')+' ও '+t('password')+' দিন',true);return;}
  const btn=document.getElementById('auth-btn');btn.disabled=true;btn.textContent='যাচাই করছি…';
  const r=await api('POST','/api/login',{phone,password});
  btn.disabled=false;btn.textContent=t('enter');
  if(r.error){toast(r.error,true);return;}
  _authSuccess(r);
}
async function doRegister(){
  const phone=document.getElementById('a-phone').value.trim(),password=document.getElementById('a-pass').value;
  if(!phone||!password){toast(t('phone')+' ও '+t('password')+' দিন',true);return;}
  if(password.length<6){toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর',true);return;}
  const btn=document.getElementById('auth-btn');btn.disabled=true;btn.textContent='নিবন্ধন হচ্ছে…';
  const r=await api('POST','/api/register',{phone,password});
  btn.disabled=false;btn.textContent=t('register');
  if(r.error){toast(r.error,true);return;}
  _authSuccess(r);
}
function _authSuccess(r){
  S.token=r.token;S.anon_id=r.anon_id||null;S.admin=!!r.admin;
  try{localStorage.setItem('jb_token',r.token);localStorage.setItem('jb_aid',String(r.anon_id||''));localStorage.setItem('jb_admin',r.admin?'1':'0');}catch{}
  toast('✓ সফল');closeAuth();renderUser();
  if(S.admin)showAdminBtn();
  if(S._authCb){const cb=S._authCb;S._authCb=null;cb();}
  pollNotifications();
}

// ── USER TAB ──────────────────────────────────────────────────
function renderUser(){
  const el=document.getElementById('user-content');
  if(!S.token){el.innerHTML=`<div class="empty"><div class="ei">🔐</div><p>${t('login_sub')}</p><button class="btn-p" style="margin-top:10px;max-width:200px" onclick="openAuth()">${t('enter')}</button></div>${donationHTML()}`;return;}
  const bms=BM.getAll();
  el.innerHTML=`
    <div class="uhero"><div class="uav">👤</div><div class="uname">익명 সদস্য${S.admin?' 🛡':''}</div><div class="usub">আপনার পরিচয় গোপন আছে</div></div>
    <div style="padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-p" style="flex:1;min-width:120px;background:var(--glass);border:1px solid var(--border);font-size:13px;color:var(--text)" onclick="loadHistory()">${t('history')}</button>
      ${S.admin?`<button class="btn-p" style="flex:1;min-width:120px;background:linear-gradient(135deg,#f5c842,#c08010);font-size:13px" onclick="switchTab('admin')">⚙️ Admin Panel</button>`:''}
      <button class="btn-p" style="flex:1;min-width:120px;background:rgba(255,75,110,.15);border:1px solid var(--red);color:var(--red);font-size:13px" onclick="logout()">${t('logout')}</button>
    </div>
    <div id="history-section" style="padding:0 16px 8px"></div>
    <div style="padding:0 16px 8px">
      <div class="slabel" style="margin-bottom:10px">🔖 ${t('bookmarks')} (${bms.length})</div>
      ${bms.length?bms.map(b=>`<div class="lcard glass" onclick="openModal('${b.id}')">
        <div class="l-noimg">🔖</div>
        <div class="l-body"><div class="l-title">${esc(b.title)}</div><div class="l-meta">${rt(b.ts/1000)}</div></div>
        <button style="font-size:18px;padding:4px 8px;color:var(--muted)" onclick="event.stopPropagation();BM.toggle('${b.id}','');renderUser()">✕</button>
      </div>`).join(''):`<div style="text-align:center;padding:20px;font-size:12px;color:var(--muted)">${t('no_bookmarks')}</div>`}
    </div>
    ${donationHTML()}`;
}
async function loadHistory(){
  const el=document.getElementById('history-section');if(!el)return;
  el.innerHTML='<div class="slabel" style="margin-bottom:10px">📰 '+t('history')+'</div><div class="sp-box"><b></b><b></b><b></b></div>';
  const d=await api('GET','/api/my/news');
  if(d.error||!d.length){el.innerHTML=`<div class="slabel" style="margin-bottom:8px">📰 ${t('history')}</div><div style="text-align:center;padding:16px;font-size:12px;color:var(--muted)">${t('no_history')}</div>`;return;}
  el.innerHTML=`<div class="slabel" style="margin-bottom:10px">📰 ${t('history')} (${d.length})</div>`+d.map(n=>`<div class="hist-card glass" onclick="openModal('${n.id}')">
    ${n.thumb?`<img src="${esc(n.thumb)}" style="width:50px;height:50px;object-fit:cover;border-radius:9px;flex-shrink:0" loading="lazy">`:`<div class="hist-thumb">📰</div>`}
    <div class="hist-info"><div class="hist-title">${esc(n.title)}</div><div class="hist-meta">${rt(n.created_at)} · ${n.real_score}✓ ${n.fake_score}✗</div></div>
  </div>`).join('');
}
function showAdminBtn(){const nav=document.getElementById('desktop-nav');if(!nav||nav.querySelector('[data-tab="admin"]'))return;const btn=document.createElement('button');btn.className='dn-btn';btn.dataset.tab='admin';btn.onclick=()=>switchTab('admin');btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Admin Panel';nav.appendChild(btn);}
function logout(){S.token=null;S.anon_id=null;S.admin=false;try{localStorage.removeItem('jb_token');localStorage.removeItem('jb_aid');localStorage.removeItem('jb_admin');}catch{}renderUser();updateNotifBadge(0);toast(t('logout'));}

// ══════════════════════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════════════════════
let _admTab='stats',_admPage=0,_admQ='';

async function loadAdmin(){
  if(!S.admin){document.getElementById('admin-content').innerHTML='<div class="empty"><p>Admin only</p></div>';return;}
  renderAdminShell();
  loadAdmStats();
}

function renderAdminShell(){
  const el=document.getElementById('admin-content');
  el.innerHTML=`
    <div class="adm-tabs">
      <button class="adm-tab on" id="at-stats" onclick="admSwitchTab('stats')">📊 Stats</button>
      <button class="adm-tab" id="at-news" onclick="admSwitchTab('news')">📰 News</button>
      <button class="adm-tab" id="at-users" onclick="admSwitchTab('users')">👥 Users</button>
    </div>
    <div id="adm-body"></div>`;
}

function admSwitchTab(tab){
  _admTab=tab;_admPage=0;_admQ='';
  ['stats','news','users'].forEach(t=>document.getElementById('at-'+t)?.classList.toggle('on',t===tab));
  if(tab==='stats')loadAdmStats();
  if(tab==='news')loadAdmNews();
  if(tab==='users')loadAdmUsers();
}

async function loadAdmStats(){
  const el=document.getElementById('adm-body');el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const d=await api('GET','/api/admin/stats');if(d.error){el.innerHTML=`<p style="color:var(--red)">${esc(d.error)}</p>`;return;}
  el.innerHTML=`
    <div class="adm-stat-grid">
      <div class="adm-stat"><div class="adm-stat-val">${d.news_count}</div><div class="adm-stat-lbl">📰 News</div></div>
      <div class="adm-stat"><div class="adm-stat-val">${d.user_count}</div><div class="adm-stat-lbl">👥 Users</div></div>
      <div class="adm-stat"><div class="adm-stat-val">${d.vote_count}</div><div class="adm-stat-lbl">🗳 Votes</div></div>
      <div class="adm-stat"><div class="adm-stat-val" style="color:var(--red)">${d.banned_count}</div><div class="adm-stat-lbl">🚫 Banned</div></div>
    </div>
    <div class="adm-stat glass" style="text-align:left;margin-bottom:12px">
      <div class="adm-stat-lbl" style="margin-bottom:6px">💾 Storage</div>
      <div style="font-size:20px;font-weight:800">${d.news_count} <span style="font-size:13px;color:var(--muted)">active news</span></div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Vercel Blob Storage</div>
    </div>
    <div style="text-align:center;font-size:11px;color:var(--muted)">জনবার্তা ${d.version}</div>`;
}

async function loadAdmNews(q='',page=0){
  _admQ=q;_admPage=page;
  const el=document.getElementById('adm-body');if(!page)el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const ulat=S.userLat||23.8103,ulon=S.userLon||90.4125;const url=`/api/admin/news?page=${page}&limit=30&lat=${ulat}&lon=${ulon}${q?'&q='+encodeURIComponent(q):''}`;
  const d=await api('GET',url);if(d.error){el.innerHTML=`<p style="color:var(--red)">${esc(d.error)}</p>`;return;}
  const rows=d.news;
  if(!page){
    el.innerHTML=`<div class="adm-search"><div class="search-wrap"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="search-inp" placeholder="Search news title…" oninput="loadAdmNews(this.value,0)" autocomplete="off" value="${esc(q)}"></div></div><div id="adm-news-list"></div>`;
  }
  const list=document.getElementById('adm-news-list');
  if(!list)return;
  if(!rows.length&&!page){list.innerHTML='<div class="empty"><p>No news found.</p></div>';return;}
  list.innerHTML+=(rows||[]).map(n=>`<div class="adm-row">
    ${n.thumb?`<img src="${esc(n.thumb)}" style="width:40px;height:40px;object-fit:cover;border-radius:7px;flex-shrink:0">`:'<div style="width:40px;height:40px;border-radius:7px;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">📰</div>'}
    <div class="adm-row-info"><div class="adm-row-title">${esc(n.title)}</div><div class="adm-row-meta">uid:${n.owner_id} · ${+n.real_score}✓ ${+n.fake_score}✗ · ${n.vote_count}v</div></div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      <button class="adm-btn" onclick="openModal('${n.id}')">👁</button>
      <button class="adm-btn adm-del" onclick="admDelNews('${n.id}',this)">🗑</button>
    </div>
  </div>`).join('');
  if(rows.length===30){const btn=document.createElement('button');btn.className='btn-p';btn.style.cssText='margin-top:10px;background:var(--glass);border:1px solid var(--border);color:var(--text);font-size:13px';btn.textContent='Load More';btn.onclick=()=>loadAdmNews(_admQ,_admPage+1);list.appendChild(btn);}
}

async function admDelNews(id,btn){
  if(!confirm('Delete this news?'))return;btn.disabled=true;
  const r=await api('DELETE','/api/admin/news/'+id);
  if(r.error){toast(r.error,true);btn.disabled=false;return;}
  btn.closest('.adm-row').remove();CACHE.invalidate();toast('Deleted ✓');
}

async function loadAdmUsers(){
  const el=document.getElementById('adm-body');el.innerHTML='<div class="sp-box"><b></b><b></b><b></b></div>';
  const d=await api('GET','/api/admin/users');if(d.error){el.innerHTML=`<p style="color:var(--red)">${esc(d.error)}</p>`;return;}
  if(!d.length){el.innerHTML='<div class="empty"><p>No users yet.</p></div>';return;}
  el.innerHTML=d.map(u=>`<div class="adm-row" id="urow-${u.id}">
    <div style="font-size:24px;flex-shrink:0">${u.banned?'🚫':'👤'}</div>
    <div class="adm-row-info">
      <div class="adm-row-title">${esc(u.username)} ${u.banned?'<span style="color:var(--red);font-size:10px">[BANNED]</span>':''}</div>
      <div class="adm-row-meta">${esc(u.phone)} · ${u.news_count} posts · id:${u.id}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      ${u.banned
        ?`<button class="adm-btn adm-unban" onclick="admBan(${u.id},false,this)">Unban</button>`
        :`<button class="adm-btn adm-ban" onclick="admBan(${u.id},true,this)">Ban</button>`}
      <button class="adm-btn adm-purge" onclick="admPurgeUser(${u.id},this)">Del posts</button>
    </div>
  </div>`).join('');
}

async function admBan(uid,ban,btn){
  btn.disabled=true;
  const r=await api('POST',`/api/admin/users/${uid}/ban`,{ban});
  if(r.error){toast(r.error,true);btn.disabled=false;return;}
  toast(ban?`User ${uid} banned`:`User ${uid} unbanned`);loadAdmUsers();
}
async function admPurgeUser(uid,btn){
  if(!confirm(`Delete ALL news by user ${uid}?`))return;btn.disabled=true;
  const r=await api('DELETE',`/api/admin/users/${uid}/news`);
  if(r.error){toast(r.error,true);btn.disabled=false;return;}
  CACHE.invalidate();toast(`Deleted ${r.deleted} posts`);loadAdmUsers();
}

// ── BOOT ──────────────────────────────────────────────────────
(async function init(){
  applyTheme();applyI18n();
  // Show desktop nav on wide screens
  if(window.innerWidth>=900)document.getElementById('desktop-nav').style.display='flex';
  gps();showVerse('vh');loadHome();renderUser();initPTR();
  if(S.admin)showAdminBtn();
  // Poll notifications every 90s
  if(S.token){pollNotifications();setInterval(pollNotifications,90000);}
})();
