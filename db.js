'use strict';
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

let _client = null;
let _db     = null;
let _bucket = null;

// ── Collections ───────────────────────────────────────────────
const col           = name => _db.collection(name);
const users         = () => col('users');
const news          = () => col('news');
const votes         = () => col('votes');
const notifications = () => col('notifications');
const bucket        = () => _bucket;

// ── Connect + indexes ─────────────────────────────────────────
async function initDB() {
  _client = new MongoClient(MONGO_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });
  await _client.connect();
  _db     = _client.db('bdnewsmap');
  _bucket = new GridFSBucket(_db, { bucketName: 'newsImages' });

  // users
  await users().createIndex({ phone:    1 }, { unique: true });
  await users().createIndex({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

  // news
  await news().createIndex({ cell_key:   1 }, { unique: true, sparse: true });
  await news().createIndex({ lat:        1 });
  await news().createIndex({ lon:        1 });
  await news().createIndex({ created_at: -1 });
  await news().createIndex({ owner_id:   1 });

  // votes
  await votes().createIndex({ news_id: 1, user_id: 1 }, { unique: true });
  await votes().createIndex({ news_id: 1 });

  // notifications
  await notifications().createIndex({ user_id:    1 });
  await notifications().createIndex({ created_at: -1 });

  console.log('[DB] MongoDB connected');
  return true;
}

async function closeDB() {
  if (_client) await _client.close();
}

module.exports = { initDB, closeDB, users, news, votes, notifications, bucket, ObjectId };
