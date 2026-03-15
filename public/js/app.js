/* ════════════════════════════════════════════
   জনবার্তা — BD Hyperlocal News Map — app.js
   ════════════════════════════════════════════ */

'use strict';

// ── GRID CONSTANTS ──────────────────────────
const GRID_DLAT = 50 / 111000;
const GRID_DLON = 50 / (111000 * Math.cos(23.5 * Math.PI / 180));

function snapToCell(lat, lon) {
  const ci = Math.floor(lat / GRID_DLAT);
  const cj = Math.floor(lon / GRID_DLON);
  return {
    lat: (ci + 0.5) * GRID_DLAT,
    lon: (cj + 0.5) * GRID_DLON,
    key: `${ci}:${cj}`
  };
}

// ── HAVERSINE ────────────────────────────────
function hav(lat1, lon1, lat2, lon2) {
  const R = 6371, r = d => d * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2
          + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function voteWeight(distKm) {
  return Math.max(0.2, 1.0 - (distKm / 5.0) * 0.8);
}

// ── GLOBAL STATE ─────────────────────────────
const S = {
  token: localStorage.getItem('jb_token'),
  anon_id: parseInt(localStorage.getItem('jb_aid')) || null,
  admin: localStorage.getItem('jb_admin') === '1',
  userLat: null, userLon: null,
  reportLat: null, reportLon: null,
  pinInRange: null,
  mapReady: false,
  activeTab: 'home',
  _authCb: null
};

// ── CACHE ────────────────────────────────────
const CACHE = {
  markers: [], feed: [], total: 0,
  lat: null, lon: null, ts: 0,
  STALE_MS: 5 * 60 * 1000,
  MOVE_KM: 3,
  fresh(lat, lon) {
    if (!this.ts) return false;
    if (Date.now() - this.ts > this.STALE_MS) return false;
    if (this.lat !== null && hav(lat, lon, this.lat, this.lon) > this.MOVE_KM) return false;
    return true;
  },
  async load(lat, lon) {
    if (this.fresh(lat, lon)) return;
    const data = await api(`/api/region?lat=${lat}&lon=${lon}`);
    this.markers = data.markers || [];
    this.feed = data.feed || [];
    this.total = data.total || 0;
    this.lat = lat; this.lon = lon;
    this.ts = Date.now();
  },
  invalidate() { this.ts = 0; }
};

// ── BOOKMARKS ────────────────────────────────
const BM = {
  _key: 'jb_bm11',
  _data() { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  _save(d) { localStorage.setItem(this._key, JSON.stringify(d)); },
  toggle(id, title) {
    const d = this._data();
    if (d[id]) { delete d[id]; this._save(d); return false; }
    d[id] = { id, title, ts: Date.now() }; this._save(d); return true;
  },
  has(id) { return !!this._data()[id]; },
  getAll() { return Object.values(this._data()).sort((a, b) => b.ts - a.ts); }
};

// ── I18N ─────────────────────────────────────
let LANG = localStorage.getItem('jb_lang') || 'bn';
const I18N = {
  bn: {
    home: 'হোম', map: 'মানচিত্র', explore: 'অন্বেষণ', notifs: 'বিজ্ঞপ্তি', account: 'অ্যাকাউন্ট',
    login: 'লগইন', register: 'নিবন্ধন', logout: 'লগআউট',
    phone: 'ফোন নম্বর', password: 'পাসওয়ার্ড',
    title: 'শিরোনাম', description: 'বিবরণ',
    reportNews: 'সংবাদ রিপোর্ট করুন', myReports: 'আমার রিপোর্ট',
    markRead: 'সব পড়া চিহ্নিত করুন',
    real: 'সত্য', fake: 'মিথ্যা',
    verified: 'যাচাইকৃত', suspicious: 'সন্দেহজনক', checking: 'যাচাই চলছে',
    noNews: 'এই এলাকায় কোনো সংবাদ নেই',
    loading: 'লোড হচ্ছে…',
    loginToVote: 'ভোট দিতে লগইন করুন',
    tooFar: 'সংবাদ থেকে ৫ কিমি-র বেশি দূরে',
    votedReal: '✅ সত্য হিসেবে ভোট দেওয়া হয়েছে',
    votedFake: '❌ মিথ্যা হিসেবে ভোট দেওয়া হয়েছে',
    pinTooFar: '⚠️ পিন আপনার অবস্থান থেকে ৫ কিমি-র বেশি দূরে',
    pinOk: '✅ পিন বৈধ অবস্থানে',
    cellTaken: '⚠️ এই সেলে ইতিমধ্যে একটি সংবাদ আছে',
    saved: '🔖 সংরক্ষিত', unsaved: '🗑️ সরানো হয়েছে',
    copied: '✅ কপি করা হয়েছে',
    deleted: '🗑️ মুছে ফেলা হয়েছে',
    posted: '✅ রিপোর্ট পোস্ট করা হয়েছে',
    timeAgo: (s) => {
      if (s < 60) return `${s}সে আগে`;
      if (s < 3600) return `${Math.floor(s/60)}মি আগে`;
      if (s < 86400) return `${Math.floor(s/3600)}ঘ আগে`;
      return `${Math.floor(s/86400)}দিন আগে`;
    },
    expiresIn: (s) => {
      if (s <= 0) return 'মেয়াদ শেষ';
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
      return `${h}ঘ ${m}মি বাকি`;
    }
  },
  en: {
    home: 'Home', map: 'Map', explore: 'Explore', notifs: 'Alerts', account: 'Account',
    login: 'Login', register: 'Register', logout: 'Logout',
    phone: 'Phone Number', password: 'Password',
    title: 'Title', description: 'Description',
    reportNews: 'Report News', myReports: 'My Reports',
    markRead: 'Mark All Read',
    real: 'Real', fake: 'Fake',
    verified: 'Verified', suspicious: 'Suspicious', checking: 'Checking',
    noNews: 'No news in this area',
    loading: 'Loading…',
    loginToVote: 'Login to vote',
    tooFar: 'More than 5km from news',
    votedReal: '✅ Voted as Real',
    votedFake: '❌ Voted as Fake',
    pinTooFar: '⚠️ Pin is more than 5km away',
    pinOk: '✅ Valid location',
    cellTaken: '⚠️ A news item already exists in this cell',
    saved: '🔖 Saved', unsaved: '🗑️ Removed',
    copied: '✅ Copied',
    deleted: '🗑️ Deleted',
    posted: '✅ Report posted',
    timeAgo: (s) => {
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s/60)}m ago`;
      if (s < 86400) return `${Math.floor(s/3600)}h ago`;
      return `${Math.floor(s/86400)}d ago`;
    },
    expiresIn: (s) => {
      if (s <= 0) return 'Expired';
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
      return `${h}h ${m}m left`;
    }
  }
};

function t(key) { return I18N[LANG][key] || key; }

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  });
}

// ── UTILITIES ────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function nowSec() { return Math.floor(Date.now() / 1000); }

function pct(item) {
  const tot = (item.real_score || 0) + (item.fake_score || 0);
  return tot > 0 ? Math.round((item.real_score / tot) * 100) : 50;
}

function statusLabel(p) {
  if (p >= 65) return { label: t('verified'), cls: 'real' };
  if (p <= 35) return { label: t('suspicious'), cls: 'fake' };
  return { label: t('checking'), cls: 'warn' };
}

function thumbHtml(item, size = 'list') {
  if (item.thumb) {
    const h = size === 'hero' ? 'hero-img' : size === 'mini' ? 'mini-thumb' : 'list-thumb';
    return `<img class="${h}" src="${esc(item.thumb)}" alt="" loading="lazy">`;
  }
  const emoji = '📰';
  if (size === 'hero') return `<div class="hero-img-placeholder">${emoji}</div>`;
  if (size === 'mini') return `<div class="mini-thumb-ph">${emoji}</div>`;
  return `<div class="list-thumb-ph">${emoji}</div>`;
}

function timeAgo(ts) {
  const s = Math.max(0, nowSec() - ts);
  return t('timeAgo')(s);
}

function distChip(item) {
  if (S.userLat === null) return '';
  const d = hav(S.userLat, S.userLon, item.lat, item.lon);
  const cls = d > 5 ? 'chip dist-far' : 'chip';
  const label = d < 1 ? `${Math.round(d*1000)}মি` : `${d.toFixed(1)}কিমি`;
  return `<span class="${cls}">📍 ${label}</span>`;
}

// ── API ──────────────────────────────────────
async function api(url, opts = {}) {
  if (S.token && !opts.headers) opts.headers = {};
  if (S.token) opts.headers['Authorization'] = 'Bearer ' + S.token;
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const err = ct.includes('json') ? await res.json() : { error: res.statusText };
    throw new Error(err.error || 'Request failed');
  }
  return ct.includes('json') ? res.json() : res.text();
}

// ── GPS ──────────────────────────────────────
async function gps() {
  if (S.userLat !== null) return { lat: S.userLat, lon: S.userLon };
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      S.userLat = 23.8103; S.userLon = 90.4125;
      resolve({ lat: S.userLat, lon: S.userLon });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => { S.userLat = p.coords.latitude; S.userLon = p.coords.longitude; resolve({ lat: S.userLat, lon: S.userLon }); },
      () => { S.userLat = 23.8103; S.userLon = 90.4125; resolve({ lat: S.userLat, lon: S.userLon }); },
      { timeout: 8000, enableHighAccuracy: true }
    );
  });
}

// ── TOAST ────────────────────────────────────
let _toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

// ── THEME / LANG ──────────────────────────────
function initTheme() {
  const th = localStorage.getItem('jb_theme') || 'dark';
  document.documentElement.dataset.theme = th;
  document.getElementById('theme-btn').textContent = th === 'dark' ? '☀️' : '🌙';
}

document.getElementById('theme-btn').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('jb_theme', next);
  document.getElementById('theme-btn').textContent = next === 'dark' ? '☀️' : '🌙';
};

document.getElementById('lang-btn').onclick = () => {
  LANG = LANG === 'bn' ? 'en' : 'bn';
  localStorage.setItem('jb_lang', LANG);
  document.getElementById('lang-btn').textContent = LANG === 'bn' ? 'EN' : 'বাং';
  applyI18n();
  renderQuranCard();
};

// ── QURAN VERSES ──────────────────────────────
const QURAN_VERSES = [
  { ar: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ', bn: 'নিশ্চয়ই আমরা আল্লাহর জন্য এবং নিশ্চয়ই আমরা তাঁর কাছে প্রত্যাবর্তনকারী।', en: 'Indeed, we belong to Allah, and indeed to Him we shall return.', ref: 'আল-বাকারা ২:১৫৬' },
  { ar: 'وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ', bn: 'বলুন, কাজ করতে থাকো; আল্লাহ তোমাদের কাজ দেখবেন।', en: 'Say: Work! Allah will see your deeds.', ref: 'আত-তাওবা ৯:১০৫' },
  { ar: 'يَا أَيُّهَا الَّذِينَ آمَنُوا كُونُوا قَوَّامِينَ بِالْقِسْطِ', bn: 'হে মুমিনগণ! ন্যায়বিচারে দৃঢ়ভাবে প্রতিষ্ঠিত থাকো।', en: 'O believers! Stand firmly for justice.', ref: 'আন-নিসা ৪:১৩৫' },
  { ar: 'وَلَا تَقْفُ مَا لَيْسَ لَكَ بِهِ عِلْمٌ', bn: 'যে বিষয়ে তোমার জ্ঞান নেই, তার পেছনে পড়ো না।', en: 'Do not pursue that of which you have no knowledge.', ref: 'আল-ইসরা ১৭:৩৬' },
  { ar: 'وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَى', bn: 'সৎকাজ ও তাকওয়ার ক্ষেত্রে পরস্পর সহযোগিতা করো।', en: 'Cooperate in righteousness and piety.', ref: 'আল-মায়িদা ৫:২' },
  { ar: 'إِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ', bn: 'নিশ্চয়ই আল্লাহ সৎকর্মশীলদের পুরস্কার নষ্ট করেন না।', en: 'Allah does not waste the reward of the doers of good.', ref: 'আত-তাওবা ৯:১২০' },
  { ar: 'وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ', bn: 'তোমরাই উপরে থাকবে, যদি তোমরা বিশ্বাসী হও।', en: 'You will be superior, if you are believers.', ref: 'আল-ইমরান ৩:১৩৯' }
];

function renderQuranCard() {
  const v = QURAN_VERSES[Math.floor(Math.random() * QURAN_VERSES.length)];
  document.getElementById('quran-card-wrap').innerHTML = `
    <div class="quran-card">
      <div class="quran-arabic">${esc(v.ar)}</div>
      <div class="quran-bn">${esc(LANG === 'en' ? v.en : v.bn)}</div>
      <div class="quran-ref">${esc(v.ref)}</div>
    </div>`;
}

// ── TABS ─────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === `screen-${tab}`));
  S.activeTab = tab;
  if (tab === 'home') { renderQuranCard(); loadHome(); }
  if (tab === 'map') initMap();
  if (tab === 'explore') loadExplore();
  if (tab === 'notif') loadNotifications();
  if (tab === 'user') renderUser();
}

// ── HOME ─────────────────────────────────────
async function loadHome(force = false) {
  if (force) CACHE.invalidate();
  try {
    const { lat, lon } = await gps();
    await CACHE.load(lat, lon);
    renderHome();
  } catch (e) {
    document.getElementById('home-content').innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠️</span><p>${esc(e.message)}</p></div>`;
  }
}

function renderHome() {
  const feed = CACHE.feed;
  if (!feed.length) {
    document.getElementById('home-content').innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><p>${t('noNews')}</p></div>`;
    return;
  }
  let html = '';
  const [top, ...rest] = feed;
  // Hero
  const ps = pct(top); const st = statusLabel(ps);
  html += `<div class="hero-card" onclick="openDetail('${esc(top.id)}')">
    ${thumbHtml(top, 'hero')}
    <div class="hero-body">
      <div class="score-bar-wrap"><div class="score-bar-fill" style="width:${ps}%"></div></div>
      <div class="card-title">${esc(top.title)}</div>
      <div class="card-meta">
        <span class="chip ${st.cls}">${st.label}</span>
        <span class="chip">⏱ ${timeAgo(top.created_at)}</span>
        ${distChip(top)}
      </div>
    </div>
  </div>`;

  // Grid of 4
  const grid = rest.slice(0, 4);
  if (grid.length) {
    html += '<div class="grid2">';
    grid.forEach(n => {
      const p2 = pct(n); const s2 = statusLabel(p2);
      html += `<div class="mini-card" onclick="openDetail('${esc(n.id)}')">
        ${thumbHtml(n, 'mini')}
        <div class="mini-body">
          <div class="mini-title">${esc(n.title)}</div>
          <div class="card-meta"><span class="chip ${s2.cls}">${s2.label}</span></div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // List
  const listItems = rest.slice(4);
  if (listItems.length) {
    html += `<div class="section-label">আরও সংবাদ</div>`;
    listItems.forEach(n => {
      const p3 = pct(n); const s3 = statusLabel(p3);
      html += `<div class="list-card" onclick="openDetail('${esc(n.id)}')">
        ${thumbHtml(n, 'list')}
        <div class="list-body">
          <div class="list-title">${esc(n.title)}</div>
          <div class="card-meta"><span class="chip ${s3.cls}">${s3.label}</span><span class="chip">⏱ ${timeAgo(n.created_at)}</span>${distChip(n)}</div>
        </div>
      </div>`;
    });
  }
  document.getElementById('home-content').innerHTML = html;
}

// Pull-to-refresh
let _pullStart = 0;
const homeScroll = document.getElementById('home-scroll');
homeScroll.addEventListener('touchstart', e => { _pullStart = e.touches[0].clientY; }, { passive: true });
homeScroll.addEventListener('touchend', e => {
  if (homeScroll.scrollTop === 0 && e.changedTouches[0].clientY - _pullStart > 80) loadHome(true);
}, { passive: true });

// ── MAP ──────────────────────────────────────
let MAP = null, markersLayer = null, userMarker = null;

async function initMap() {
  if (S.mapReady) { refreshMapMarkers(); return; }
  S.mapReady = true;
  const { lat, lon } = await gps();
  MAP = L.map('map', { zoomControl: false, attributionControl: false }).setView([lat, lon], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(MAP);
  L.control.zoom({ position: 'topright' }).addTo(MAP);
  markersLayer = L.layerGroup().addTo(MAP);
  setUserMarker(lat, lon);
  MAP.on('click', e => {
    if (MAP.getZoom() < 13) return;
    const cell = snapToCell(e.latlng.lat, e.latlng.lng);
    const item = CACHE.markers.find(m => m.cell_key === cell.key);
    if (item) showMapPanel(item);
  });
  await refreshMapMarkers();
}

function setUserMarker(lat, lon) {
  if (userMarker) userMarker.remove();
  const icon = L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  userMarker = L.marker([lat, lon], { icon }).addTo(MAP);
}

async function refreshMapMarkers() {
  if (!MAP) return;
  const { lat, lon } = await gps();
  await CACHE.load(lat, lon);
  markersLayer.clearLayers();
  CACHE.markers.forEach(m => {
    const p = pct(m);
    const cls = p >= 65 ? 'high-real' : p <= 35 ? 'high-fake' : '';
    const icon = L.divIcon({ className: '', html: `<div class="news-marker-icon ${cls}"></div>`, iconSize: [20, 20], iconAnchor: [10, 20] });
    L.marker([m.lat, m.lon], { icon }).addTo(markersLayer).on('click', () => showMapPanel(m));
  });
}

async function mapLocate() {
  S.userLat = null; S.userLon = null;
  const { lat, lon } = await gps();
  if (MAP) { MAP.setView([lat, lon], 15); setUserMarker(lat, lon); }
}

function showMapPanel(item) {
  const panel = document.getElementById('map-panel');
  const content = document.getElementById('map-panel-content');
  content.innerHTML = '<div class="spinner"></div>';
  panel.classList.add('open');
  api(`/api/news/${item.id}`).then(news => {
    _renderNewsDetail(content, news, true);
  }).catch(e => { content.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; });
}

function closeMapPanel() {
  document.getElementById('map-panel').classList.remove('open');
}

// ── EXPLORE ──────────────────────────────────
let _exploreAll = [];

async function loadExplore() {
  const list = document.getElementById('explore-list');
  try {
    const { lat, lon } = await gps();
    await CACHE.load(lat, lon);
    _exploreAll = [...CACHE.feed];
    renderExploreList(_exploreAll);
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><span>⚠️</span><p>${esc(e.message)}</p></div>`;
  }
}

function filterExplore(q) {
  const lower = q.toLowerCase();
  const filtered = q ? _exploreAll.filter(n => (n.title + ' ' + (n.description || '')).toLowerCase().includes(lower)) : _exploreAll;
  renderExploreList(filtered);
}

function renderExploreList(items) {
  if (!items.length) {
    document.getElementById('explore-list').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔍</span><p>${t('noNews')}</p></div>`;
    return;
  }
  let html = '';
  items.forEach(n => {
    const p = pct(n); const st = statusLabel(p);
    html += `<div class="list-card" onclick="openDetail('${esc(n.id)}')">
      ${thumbHtml(n)}
      <div class="list-body">
        <div class="list-title">${esc(n.title)}</div>
        <div class="card-meta"><span class="chip ${st.cls}">${st.label}</span><span class="chip">⏱ ${timeAgo(n.created_at)}</span>${distChip(n)}</div>
      </div>
    </div>`;
  });
  document.getElementById('explore-list').innerHTML = html;
}

// ── NOTIFICATIONS ─────────────────────────────
let _notifPollTimer;

async function loadNotifications() {
  if (!S.token) {
    document.getElementById('notif-list').innerHTML = `<div class="login-prompt"><div class="login-prompt-icon">🔔</div><h3>বিজ্ঞপ্তি দেখুন</h3><p>বিজ্ঞপ্তি পেতে লগইন করুন।</p><button class="btn-primary" onclick="openAuth()">লগইন করুন</button></div>`;
    return;
  }
  try {
    const data = await api('/api/notifications');
    renderNotifications(data.notifications || []);
    updateNotifBadge(data.unseen || 0);
  } catch (e) {
    document.getElementById('notif-list').innerHTML = `<p style="color:var(--red);padding:20px;text-align:center">${esc(e.message)}</p>`;
  }
}

function renderNotifications(items) {
  if (!items.length) {
    document.getElementById('notif-list').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔕</span><p>কোনো বিজ্ঞপ্তি নেই</p></div>`;
    return;
  }
  document.getElementById('notif-list').innerHTML = items.map(n => `
    <div class="notif-item ${n.seen ? '' : 'unseen'}" onclick="openDetail('${esc(n.news_id)}')">
      <div class="notif-dot ${n.seen ? 'seen' : ''}"></div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-meta">📍 ${n.dist_km.toFixed(1)} কিমি দূরে · ${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');
}

function updateNotifBadge(count) {
  const dot = document.getElementById('notif-dot');
  const navDot = document.getElementById('nav-notif-dot');
  if (count > 0) { dot.style.display = 'block'; navDot.style.display = 'block'; }
  else { dot.style.display = 'none'; navDot.style.display = 'none'; }
}

async function markAllRead() {
  if (!S.token) return;
  try {
    await api('/api/notifications/seen', { method: 'POST' });
    updateNotifBadge(0);
    loadNotifications();
  } catch (e) { toast(e.message, true); }
}

function pollNotifications() {
  clearInterval(_notifPollTimer);
  if (!S.token) return;
  const poll = async () => {
    try {
      const data = await api('/api/notifications');
      updateNotifBadge(data.unseen || 0);
    } catch {}
  };
  poll();
  _notifPollTimer = setInterval(poll, 90000);
}

// ── USER SCREEN ───────────────────────────────
function renderUser() {
  const el = document.getElementById('user-content');
  if (!S.token) {
    el.innerHTML = `
      <div class="login-prompt">
        <div class="login-prompt-icon">👤</div>
        <h3>স্বাগতম</h3>
        <p>রিপোর্ট করতে এবং ভোট দিতে অ্যাকাউন্ট প্রয়োজন।</p>
        <button class="btn-primary" onclick="openAuth()">লগইন করুন</button>
        <button class="btn-secondary" onclick="switchAuth('register');openAuth()">নিবন্ধন করুন</button>
      </div>
      <div class="sep"></div>
      ${donateHtml()}`;
    return;
  }
  const username = localStorage.getItem('jb_uname') || `ব্যবহারকারী_${S.anon_id}`;
  el.innerHTML = `
    <div class="user-avatar">👤</div>
    <div class="user-name">${esc(username)}</div>
    <div class="user-sub">ID: ${S.anon_id}</div>
    <button class="action-btn" onclick="openMyReports()"><span class="action-icon">📋</span> ${t('myReports')}</button>
    <button class="action-btn" onclick="openBookmarks()"><span class="action-icon">🔖</span> সংরক্ষিত সংবাদ</button>
    ${S.admin ? `<button class="action-btn" onclick="openAdmin()"><span class="action-icon">⚙️</span> অ্যাডমিন প্যানেল</button>` : ''}
    <button class="action-btn danger" onclick="doLogout()"><span class="action-icon">🚪</span> ${t('logout')}</button>
  `;
}

function donateHtml() {
  return `<div class="donate-section"><div class="donate-title">💚 সহায়তা করুন</div>
    <div class="donate-row"><div class="donate-logo">🌸</div><div class="donate-info"><div class="donate-name">bKash</div><div class="donate-num">01700000000</div></div><button class="copy-btn" onclick="copyNum('01700000000')">কপি</button></div>
    <div class="donate-row"><div class="donate-logo">🟠</div><div class="donate-info"><div class="donate-name">Nagad</div><div class="donate-num">01700000001</div></div><button class="copy-btn" onclick="copyNum('01700000001')">কপি</button></div>
    <div class="donate-row"><div class="donate-logo">🔵</div><div class="donate-info"><div class="donate-name">Rocket</div><div class="donate-num">01700000002</div></div><button class="copy-btn" onclick="copyNum('01700000002')">কপি</button></div>
  </div>`;
}

function copyNum(num) {
  navigator.clipboard?.writeText(num);
  toast(t('copied'));
}

// ── AUTH ─────────────────────────────────────
let _authMode = 'login';

function openAuth(cb) {
  if (cb) S._authCb = cb;
  document.getElementById('auth-overlay').classList.add('open');
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-phone').focus();
}

function closeAuth(e) { if (e.target.id === 'auth-overlay') closeOverlay('auth-overlay'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

function switchAuth(mode) {
  _authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-title').textContent = t(mode);
  document.getElementById('auth-submit').textContent = t(mode) + ' করুন';
  document.getElementById('auth-error').classList.remove('show');
}

async function doAuth() {
  const phone = document.getElementById('auth-phone').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.remove('show');

  if (!phone || !pass) { errEl.textContent = 'ফোন ও পাসওয়ার্ড প্রয়োজন'; errEl.classList.add('show'); return; }
  if (pass.length < 6) { errEl.textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = '…';

  try {
    const data = await api(`/api/${_authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password: pass })
    });
    S.token = data.token; S.anon_id = data.anon_id; S.admin = data.admin;
    localStorage.setItem('jb_token', data.token);
    localStorage.setItem('jb_aid', data.anon_id);
    localStorage.setItem('jb_admin', data.admin ? '1' : '0');
    if (data.username) localStorage.setItem('jb_uname', data.username);
    closeOverlay('auth-overlay');
    toast('✅ স্বাগতম!');
    pollNotifications();
    if (S._authCb) { S._authCb(); S._authCb = null; }
    renderUser();
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = t(_authMode) + ' করুন';
  }
}

function doLogout() {
  S.token = null; S.anon_id = null; S.admin = false;
  ['jb_token', 'jb_aid', 'jb_admin', 'jb_uname'].forEach(k => localStorage.removeItem(k));
  clearInterval(_notifPollTimer);
  updateNotifBadge(0);
  renderUser();
  toast('লগআউট হয়েছে');
}

// ── NEWS DETAIL ───────────────────────────────
async function openDetail(id) {
  const overlay = document.getElementById('detail-overlay');
  const body = document.getElementById('detail-body');
  body.innerHTML = '<div class="spinner"></div>';
  overlay.classList.add('open');
  try {
    const news = await api(`/api/news/${id}`);
    _renderNewsDetail(body, news, false);
  } catch (e) {
    body.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

function closeDetail(e) { if (e.target.id === 'detail-overlay') closeOverlay('detail-overlay'); }

function _renderNewsDetail(container, news, inMapPanel) {
  const p = pct(news); const st = statusLabel(p);
  const expSec = news.expires_at - nowSec();
  const isSaved = BM.has(news.id);
  const dist = S.userLat !== null ? hav(S.userLat, S.userLon, news.lat, news.lon) : null;
  const canVote = S.token && dist !== null && dist <= 5;
  const canDelete = S.token && (S.admin || (news.owner_id === S.anon_id && (nowSec() - news.created_at) < 10800));

  let imagesHtml = '';
  if (news.images && news.images.length) {
    imagesHtml = `<div class="detail-images">
      <div class="detail-img-scroll">${news.images.map(src => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div>
      ${news.images.length > 1 ? `<div class="img-count-badge">📷 ${news.images.length}</div>` : ''}
    </div>`;
  }

  let voteHint = '';
  if (!S.token) voteHint = t('loginToVote');
  else if (dist === null) voteHint = 'অবস্থান জানা নেই';
  else if (dist > 5) voteHint = `${t('tooFar')} (${dist.toFixed(1)}কিমি)`;

  let linksHtml = '';
  if (news.links) {
    const urls = news.links.split(/[\s,]+/).filter(Boolean);
    linksHtml = `<div class="links-section">🔗 উৎস: ${urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join(' ')}</div>`;
  }

  container.innerHTML = `
    ${imagesHtml}
    <div class="expiry-chip">⏳ ${t('expiresIn')(expSec)}</div>
    <div class="detail-title">${esc(news.title)}</div>
    <div class="card-meta" style="margin-bottom:12px">
      <span class="chip ${st.cls}">${st.label}</span>
      <span class="chip">⏱ ${timeAgo(news.created_at)}</span>
      ${dist !== null ? `<span class="chip ${dist > 5 ? 'dist-far' : ''}">📍 ${dist < 1 ? Math.round(dist*1000)+'মি' : dist.toFixed(1)+'কিমি'}</span>` : ''}
    </div>
    ${news.description ? `<div class="detail-desc">${esc(news.description)}</div>` : ''}
    <div class="truth-section">
      <div class="truth-label">
        <span>❌ ${t('fake')}: ${(news.fake_score||0).toFixed(1)}</span>
        <span><strong>${p}%</strong> ${t('real')}</span>
        <span>✅ ${t('real')}: ${(news.real_score||0).toFixed(1)}</span>
      </div>
      <div class="truth-bar"><div class="truth-fill" style="background:linear-gradient(90deg,var(--red) ${100-p}%,var(--green) ${100-p}%);width:100%"></div></div>
      <div class="vote-btns">
        <button class="vote-btn real ${news._myVote === 'real' ? 'active' : ''}" ${canVote?'':'disabled'} onclick="doVote('${esc(news.id)}','real',this.closest('.truth-section'))">✅ ${t('real')}</button>
        <button class="vote-btn fake ${news._myVote === 'fake' ? 'active' : ''}" ${canVote?'':'disabled'} onclick="doVote('${esc(news.id)}','fake',this.closest('.truth-section'))">❌ ${t('fake')}</button>
      </div>
      ${voteHint ? `<div class="vote-hint">${esc(voteHint)}</div>` : ''}
    </div>
    <div class="detail-actions">
      <button class="det-act-btn ${isSaved ? 'saved' : ''}" id="save-btn-${news.id}" onclick="toggleSave('${esc(news.id)}','${esc(news.title)}',this)">🔖 ${isSaved ? 'সংরক্ষিত' : 'সেভ'}</button>
      <button class="det-act-btn" onclick="shareNews('${esc(news.id)}','${esc(news.title)}')">📤 শেয়ার</button>
      <button class="det-act-btn" onclick="copyCoords(${news.lat},${news.lon})">📋 কোর্ড</button>
      ${canDelete ? `<button class="det-act-btn delete" onclick="deleteNews('${esc(news.id)}')">🗑️ মুছুন</button>` : ''}
    </div>
    ${linksHtml}
    <div class="coord-section">
      lat: ${news.lat.toFixed(6)} · lon: ${news.lon.toFixed(6)}<br>
      cell: ${esc(news.cell_key)} · ID: ${esc(news.id)}
    </div>
  `;
}

async function doVote(newsId, type, section) {
  if (!S.token) { openAuth(() => openDetail(newsId)); return; }
  const { lat, lon } = await gps();
  try {
    const res = await api('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news_id: newsId, type, user_lat: lat, user_lon: lon })
    });
    toast(type === 'real' ? t('votedReal') : t('votedFake'));
    // Refresh detail
    const news = await api(`/api/news/${newsId}`);
    const container = section?.closest('.sheet-body') || section?.closest('#map-panel-content');
    if (container) _renderNewsDetail(container, news, !!section?.closest('#map-panel-content'));
  } catch (e) { toast(e.message, true); }
}

function toggleSave(id, title, btn) {
  const saved = BM.toggle(id, title);
  btn.textContent = saved ? '🔖 সংরক্ষিত' : '🔖 সেভ';
  btn.classList.toggle('saved', saved);
  toast(saved ? t('saved') : t('unsaved'));
}

function shareNews(id, title) {
  const url = `${location.origin}?news=${id}`;
  if (navigator.share) { navigator.share({ title, url }); }
  else { navigator.clipboard?.writeText(url); toast(t('copied')); }
}

function copyCoords(lat, lon) {
  navigator.clipboard?.writeText(`${lat},${lon}`);
  toast(t('copied'));
}

async function deleteNews(id) {
  if (!confirm('এই সংবাদটি মুছে ফেলবেন?')) return;
  try {
    await api(`/api/news/${id}`, { method: 'DELETE' });
    CACHE.invalidate();
    closeOverlay('detail-overlay');
    closeMapPanel();
    toast(t('deleted'));
    loadHome(true);
    refreshMapMarkers();
  } catch (e) { toast(e.message, true); }
}

// ── REPORT ────────────────────────────────────
let reportMap = null, reportPin = null, _selectedImgs = [];

async function openReport() {
  if (!S.token) { openAuth(() => openReport()); return; }
  document.getElementById('report-overlay').classList.add('open');
  document.getElementById('report-error').classList.remove('show');
  document.getElementById('rep-title').value = '';
  document.getElementById('rep-desc').value = '';
  document.getElementById('rep-links').value = '';
  document.getElementById('rep-title-count').textContent = '0';
  document.getElementById('rep-desc-count').textContent = '0';
  document.getElementById('img-preview-grid').innerHTML = '';
  _selectedImgs = [];
  document.getElementById('rep-imgs').value = '';

  document.getElementById('rep-title').oninput = function() { document.getElementById('rep-title-count').textContent = this.value.length; };
  document.getElementById('rep-desc').oninput = function() { document.getElementById('rep-desc-count').textContent = this.value.length; };

  const { lat, lon } = await gps();
  S.reportLat = lat; S.reportLon = lon;

  setTimeout(() => {
    if (!reportMap) {
      reportMap = L.map('report-map', { zoomControl: false, attributionControl: false }).setView([lat, lon], 15);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(reportMap);
      reportMap.on('click', e => setReportPin(e.latlng.lat, e.latlng.lng));
    } else {
      reportMap.setView([lat, lon], 15);
      reportMap.invalidateSize();
    }
    setReportPin(lat, lon);
  }, 200);
}

function setReportPin(lat, lon) {
  const cell = snapToCell(lat, lon);
  S.reportLat = cell.lat; S.reportLon = cell.lon;
  const dist = S.userLat !== null ? hav(S.userLat, S.userLon, cell.lat, cell.lon) : 0;
  S.pinInRange = dist <= 5;
  const statusEl = document.getElementById('report-pin-status');
  if (!S.pinInRange) { statusEl.textContent = t('pinTooFar'); statusEl.style.color = 'var(--red)'; }
  else { statusEl.textContent = t('pinOk') + ` (${dist.toFixed(2)}কিমি) · Cell: ${cell.key}`; statusEl.style.color = 'var(--green)'; }

  if (reportPin) reportPin.remove();
  const icon = L.divIcon({ className: '', html: '<div class="news-marker-icon"></div>', iconSize: [20, 20], iconAnchor: [10, 20] });
  reportPin = L.marker([cell.lat, cell.lon], { icon }).addTo(reportMap);
}

function closeReport(e) { if (e.target.id === 'report-overlay') closeOverlay('report-overlay'); }

function handleImgSelect(input) {
  const files = Array.from(input.files);
  _selectedImgs = [..._selectedImgs, ...files].slice(0, 10);
  renderImgPreviews();
}

function renderImgPreviews() {
  const grid = document.getElementById('img-preview-grid');
  grid.innerHTML = _selectedImgs.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div class="img-preview-item">
      <img src="${url}" alt="">
      <button class="img-remove" onclick="removeImg(${i})">✕</button>
    </div>`;
  }).join('');
}

function removeImg(i) { _selectedImgs.splice(i, 1); renderImgPreviews(); }

async function submitReport() {
  const title = document.getElementById('rep-title').value.trim();
  const errEl = document.getElementById('report-error');
  errEl.classList.remove('show');

  if (!title) { errEl.textContent = 'শিরোনাম প্রয়োজন'; errEl.classList.add('show'); return; }
  if (!S.pinInRange) { errEl.textContent = t('pinTooFar'); errEl.classList.add('show'); return; }

  // Check cell availability
  try {
    const nearby = await api(`/api/news/nearby?lat=${S.reportLat}&lon=${S.reportLon}`);
    const cell = snapToCell(S.reportLat, S.reportLon);
    if (nearby.find(n => n.cell_key === cell.key)) {
      errEl.textContent = t('cellTaken'); errEl.classList.add('show'); return;
    }
  } catch {}

  const { lat, lon } = await gps();
  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', document.getElementById('rep-desc').value);
  fd.append('lat', S.reportLat);
  fd.append('lon', S.reportLon);
  fd.append('links', document.getElementById('rep-links').value);
  fd.append('user_lat', lat);
  fd.append('user_lon', lon);
  _selectedImgs.forEach(f => fd.append('images', f));

  const btn = document.getElementById('rep-submit');
  btn.disabled = true; btn.textContent = '⏳ পাঠানো হচ্ছে…';

  try {
    await api('/api/news', { method: 'POST', body: fd });
    CACHE.invalidate();
    closeOverlay('report-overlay');
    toast(t('posted'));
    loadHome(true);
    if (S.mapReady) refreshMapMarkers();
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = '📤 রিপোর্ট পাঠান';
  }
}

// ── MY REPORTS ────────────────────────────────
async function openMyReports() {
  document.getElementById('myreports-overlay').classList.add('open');
  document.getElementById('myreports-body').innerHTML = '<div class="spinner"></div>';
  try {
    const items = await api('/api/my/news');
    if (!items.length) { document.getElementById('myreports-body').innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><p>কোনো রিপোর্ট নেই</p></div>`; return; }
    let html = '';
    items.forEach(n => {
      const p = pct(n); const st = statusLabel(p);
      html += `<div class="list-card" onclick="openDetail('${esc(n.id)}')">
        ${thumbHtml(n)}
        <div class="list-body">
          <div class="list-title">${esc(n.title)}</div>
          <div class="card-meta"><span class="chip ${st.cls}">${st.label}</span><span class="chip">⏱ ${timeAgo(n.created_at)}</span></div>
        </div>
      </div>`;
    });
    document.getElementById('myreports-body').innerHTML = html;
  } catch (e) { document.getElementById('myreports-body').innerHTML = `<p style="color:var(--red);text-align:center;padding:20px">${esc(e.message)}</p>`; }
}

function closeMyReports(e) { if (e.target.id === 'myreports-overlay') closeOverlay('myreports-overlay'); }

// ── BOOKMARKS ─────────────────────────────────
function openBookmarks() {
  const bms = BM.getAll();
  const body = document.getElementById('myreports-body');
  document.getElementById('myreports-overlay').classList.add('open');
  document.querySelector('#myreports-overlay .sheet-title').textContent = '🔖 সংরক্ষিত সংবাদ';
  if (!bms.length) { body.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔖</span><p>কোনো সংরক্ষিত সংবাদ নেই</p></div>`; return; }
  body.innerHTML = bms.map(b => `
    <div class="list-card" onclick="openDetail('${esc(b.id)}')">
      <div class="list-thumb-ph">📰</div>
      <div class="list-body">
        <div class="list-title">${esc(b.title)}</div>
        <div class="card-meta"><span class="chip">⏱ ${timeAgo(Math.floor(b.ts/1000))}</span></div>
      </div>
    </div>`).join('');
}

// ── ADMIN ─────────────────────────────────────
let _adminTab = 'stats', _adminPage = 0;

async function openAdmin() {
  document.getElementById('admin-overlay').classList.add('open');
  loadAdminTab('stats');
}

function closeAdmin(e) { if (e.target.id === 'admin-overlay') closeOverlay('admin-overlay'); }

function switchAdminTab(tab) {
  _adminTab = tab; _adminPage = 0;
  ['stats', 'news', 'users'].forEach(t => {
    document.getElementById(`adm-tab-${t}`).classList.toggle('active', t === tab);
  });
  loadAdminTab(tab);
}

async function loadAdminTab(tab) {
  const el = document.getElementById('admin-content');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    if (tab === 'stats') {
      const data = await api('/api/admin/stats');
      el.innerHTML = `<div class="stat-grid">
        <div class="stat-card"><div class="stat-num">${data.news_count}</div><div class="stat-label">সংবাদ</div></div>
        <div class="stat-card"><div class="stat-num">${data.user_count}</div><div class="stat-label">ব্যবহারকারী</div></div>
        <div class="stat-card"><div class="stat-num">${data.vote_count}</div><div class="stat-label">ভোট</div></div>
        <div class="stat-card"><div class="stat-num">${data.banned_count}</div><div class="stat-label">নিষিদ্ধ</div></div>
      </div>
      <div class="coord-section">Version: ${esc(data.version || '1.0.0')}</div>`;
    } else if (tab === 'news') {
      const data = await api(`/api/admin/news?page=${_adminPage}&limit=20`);
      let html = '';
      (data.news || []).forEach(n => {
        html += `<div class="admin-row">
          <div class="admin-row-info">
            <div class="admin-row-title">${esc(n.title)}</div>
            <div class="admin-row-sub">${esc(n.username)} · ${timeAgo(n.created_at)}</div>
          </div>
          <button class="small-btn" onclick="openDetail('${esc(n.id)}')">보기</button>
          <button class="small-btn danger" onclick="adminDeleteNews('${esc(n.id)}')">🗑️</button>
        </div>`;
      });
      html += `<div class="pagination">
        ${_adminPage > 0 ? `<button class="page-btn" onclick="_adminPage--;loadAdminTab('news')">← আগে</button>` : ''}
        <span class="page-btn active">${_adminPage + 1}</span>
        ${(data.total > (_adminPage + 1) * 20) ? `<button class="page-btn" onclick="_adminPage++;loadAdminTab('news')">পরে →</button>` : ''}
      </div>`;
      el.innerHTML = html;
    } else if (tab === 'users') {
      const users = await api('/api/admin/users');
      el.innerHTML = users.map(u => `
        <div class="admin-row">
          <div class="admin-row-info">
            <div class="admin-row-title">${esc(u.username)}</div>
            <div class="admin-row-sub">${esc(u.phone)} · ${u.banned ? '🚫 নিষিদ্ধ' : '✅ সক্রিয়'}</div>
          </div>
          <button class="small-btn ${u.banned ? 'warn' : 'danger'}" onclick="adminToggleBan(${u.id},${!u.banned})">${u.banned ? 'আনব্যান' : 'ব্যান'}</button>
          <button class="small-btn danger" onclick="adminDeleteUserNews(${u.id})">🗑️ পোস্ট</button>
        </div>`).join('');
    }
  } catch (e) { el.innerHTML = `<p style="color:var(--red);text-align:center">${esc(e.message)}</p>`; }
}

async function adminDeleteNews(id) {
  if (!confirm('মুছে ফেলবেন?')) return;
  try { await api(`/api/admin/news/${id}`, { method: 'DELETE' }); CACHE.invalidate(); loadAdminTab('news'); toast(t('deleted')); }
  catch (e) { toast(e.message, true); }
}

async function adminToggleBan(id, ban) {
  try { await api(`/api/admin/users/${id}/ban`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ban}) }); loadAdminTab('users'); }
  catch (e) { toast(e.message, true); }
}

async function adminDeleteUserNews(id) {
  if (!confirm('এই ব্যবহারকারীর সব পোস্ট মুছবেন?')) return;
  try { const r = await api(`/api/admin/users/${id}/news`, { method: 'DELETE' }); CACHE.invalidate(); toast(`🗑️ ${r.deleted} পোস্ট মুছে ফেলা হয়েছে`); loadAdminTab('users'); }
  catch (e) { toast(e.message, true); }
}

// ── NOTIFICATION BUTTON ───────────────────────
document.getElementById('notif-btn').onclick = () => switchTab('notif');

// ── INIT ─────────────────────────────────────
async function init() {
  initTheme();
  applyI18n();
  document.getElementById('lang-btn').textContent = LANG === 'bn' ? 'EN' : 'বাং';
  renderQuranCard();
  // Hide loader after short delay
  setTimeout(() => { document.getElementById('loader').classList.add('hidden'); }, 1200);
  // Start GPS in background
  gps().then(() => {});
  // Load home
  await loadHome();
  // Poll notifications if logged in
  if (S.token) pollNotifications();
}

init();
