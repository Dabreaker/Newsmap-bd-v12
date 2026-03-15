'use strict';
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

let _client = null;
let _db     = null;
let _bucket = null;

const col           = n => _db.collection(n);
const users         = () => col('users');
const news          = () => col('news');
const votes         = () => col('votes');
const notifications = () => col('notifications');
const bucket        = () => _bucket;

async function initDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI env var not set — add it in Vercel Dashboard → Settings → Environment Variables');

  if (_client) {
    // Reuse existing connection (warm Lambda)
    try { await _client.db('admin').command({ ping: 1 }); return true; } catch { _client = null; }
  }

  _client = new MongoClient(uri, {
    maxPoolSize:              3,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS:         8000,
    socketTimeoutMS:          20000,
  });
  await _client.connect();
  _db     = _client.db('bdnewsmap');
  _bucket = new GridFSBucket(_db, { bucketName: 'newsImages' });

  await Promise.all([
    users().createIndex({ phone:    1 }, { unique: true }),
    users().createIndex({ username: 1 }, { unique: true, collation: { locale:'en', strength:2 } }),
    news().createIndex({ cell_key:   1 }, { unique: true, sparse: true }),
    news().createIndex({ lat:        1 }),
    news().createIndex({ lon:        1 }),
    news().createIndex({ created_at: -1 }),
    news().createIndex({ owner_id:   1 }),
    votes().createIndex({ news_id: 1, user_id: 1 }, { unique: true }),
    votes().createIndex({ news_id: 1 }),
    notifications().createIndex({ user_id:    1 }),
    notifications().createIndex({ created_at: -1 }),
  ]);

  console.log('[DB] Connected to MongoDB Atlas');
  return true;
}

module.exports = { initDB, users, news, votes, notifications, bucket, ObjectId };
