// db.js — MongoDB Atlas lazy connection
const { MongoClient } = require('mongodb');

let _client = null;

async function initDB() {
  if (_client) {
    try { await _client.db('admin').command({ ping: 1 }); return; } catch { _client = null; }
  }
  _client = new MongoClient(process.env.MONGO_URI, {
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 8000
  });
  await _client.connect();
}

function db() { return _client.db('janbarta'); }
function col(name) { return db().collection(name); }

async function ensureIndexes() {
  await col('users').createIndex({ phone: 1 }, { unique: true });
  await col('news').createIndex({ cell_key: 1 }, { unique: true, sparse: true });
  await col('news').createIndex({ lat: 1 });
  await col('news').createIndex({ lon: 1 });
  await col('news').createIndex({ created_at: -1 });
  await col('news').createIndex({ owner_id: 1 });
  await col('votes').createIndex({ news_id: 1, user_id: 1 }, { unique: true });
  await col('votes').createIndex({ news_id: 1 });
  await col('notifications').createIndex({ user_id: 1, created_at: -1 });
}

module.exports = { initDB, db, col, ensureIndexes };
