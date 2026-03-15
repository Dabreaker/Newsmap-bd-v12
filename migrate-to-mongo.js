/**
 * migrate-to-mongo.js
 * Migrates data from the old SQLite (sql.js) newsmap.db to MongoDB.
 * Run once: node migrate-to-mongo.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// Load .env
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n').forEach(l => {
      const m = l.match(/^([^#=\s]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
} catch {}

const initSqlJs    = require('sql.js');
const { MongoClient, GridFSBucket } = require('mongodb');
const { Readable } = require('stream');

const DB_FILE  = path.join(__dirname, 'newsmap.db');
const NEWS_DIR = path.join(__dirname, 'news_data');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bdnewsmap';

async function main() {
  if (!fs.existsSync(DB_FILE)) { console.error('newsmap.db not found — nothing to migrate'); process.exit(1); }

  // --- Open SQLite ---
  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f) });
  const sqlDb = new SQL.Database(fs.readFileSync(DB_FILE));
  const sqlAll = (q, p = []) => { const rows = [], s = sqlDb.prepare(q); s.bind(p); while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; };

  // --- Open MongoDB ---
  const client = new MongoClient(MONGO_URI, { maxPoolSize: 5 });
  await client.connect();
  const db     = client.db();
  const bucket = new GridFSBucket(db, { bucketName: 'newsImages' });

  const usersCol  = db.collection('users');
  const newsCol   = db.collection('news');
  const votesCol  = db.collection('votes');
  const notifsCol = db.collection('notifications');

  // Indexes
  await usersCol.createIndex({ phone: 1 }, { unique: true });
  await newsCol.createIndex({ cell_key: 1 }, { unique: true, sparse: true });
  await votesCol.createIndex({ news_id: 1, user_id: 1 }, { unique: true });

  // --- Migrate users ---
  const sqlUsers = sqlAll('SELECT * FROM users');
  let uMigrated = 0;
  for (const u of sqlUsers) {
    try {
      await usersCol.updateOne({ id: u.id }, { $setOnInsert: { id: u.id, phone: u.phone, username: u.username, password_hash: u.password_hash, trust_score: u.trust_score, banned: !!u.banned, created_at: u.created_at } }, { upsert: true });
      uMigrated++;
    } catch {}
  }
  console.log(`Users migrated: ${uMigrated}/${sqlUsers.length}`);

  // --- Migrate news + images ---
  const sqlNews = sqlAll('SELECT * FROM news');
  let nMigrated = 0;
  for (const n of sqlNews) {
    const newsDir = path.join(NEWS_DIR, n.id);
    const images  = [];

    // Upload images to GridFS
    if (fs.existsSync(newsDir)) {
      const imgFiles = fs.readdirSync(newsDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f)).sort();
      for (let i = 0; i < imgFiles.length; i++) {
        const imgPath = path.join(newsDir, imgFiles[i]);
        const ext     = path.extname(imgFiles[i]).toLowerCase();
        const mime    = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
        try {
          const uploadStream = bucket.openUploadStream(`img_${i}${ext}`, { metadata: { newsId: n.id, index: i }, contentType: mime });
          await new Promise((resolve, reject) => {
            fs.createReadStream(imgPath).pipe(uploadStream);
            uploadStream.on('finish', resolve);
            uploadStream.on('error', reject);
          });
          images.push(`/api/images/${uploadStream.id}`);
        } catch (e) { console.warn('  img upload failed:', imgPath, e.message); }
      }
    }

    try {
      await newsCol.updateOne(
        { id: n.id },
        { $setOnInsert: { id: n.id, owner_id: n.owner_id, username: '', title: n.title, description: n.description || '', lat: n.lat, lon: n.lon, cell_key: n.cell_key, links: n.links || '', image_count: images.length, images, thumb: images[0] || '', created_at: n.created_at } },
        { upsert: true }
      );
      nMigrated++;
    } catch (e) { console.warn('  news upsert failed:', n.id, e.message); }
  }
  console.log(`News migrated: ${nMigrated}/${sqlNews.length}`);

  // --- Migrate votes ---
  const sqlVotes = sqlAll('SELECT * FROM votes');
  let vMigrated = 0;
  for (const v of sqlVotes) {
    try {
      await votesCol.updateOne({ news_id: v.news_id, user_id: v.user_id }, { $setOnInsert: { news_id: v.news_id, user_id: v.user_id, type: v.type, weight: v.weight, voted_at: v.voted_at } }, { upsert: true });
      vMigrated++;
    } catch {}
  }
  console.log(`Votes migrated: ${vMigrated}/${sqlVotes.length}`);

  // --- Migrate notifications ---
  const sqlNotifs = sqlAll('SELECT * FROM notifications');
  let notifMigrated = 0;
  for (const n of sqlNotifs) {
    try {
      await notifsCol.insertOne({ user_id: n.user_id, news_id: n.news_id, title: n.title, dist_km: n.dist_km, seen: !!n.seen, created_at: n.created_at });
      notifMigrated++;
    } catch {}
  }
  console.log(`Notifications migrated: ${notifMigrated}/${sqlNotifs.length}`);

  await client.close();
  console.log('\nMigration complete!');
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1); });
