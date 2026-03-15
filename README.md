# জনবার্তা — BD Hyperlocal Citizen News Map

No external database. Runs entirely on **Vercel KV** (Redis) + **Vercel Blob** (images).

## Stack

| Layer | Service |
|-------|---------|
| Data | Vercel KV (Redis) |
| Images | Vercel Blob |
| Auth | JWT (bcrypt + jsonwebtoken) |
| API | Express (serverless) |
| Frontend | Vanilla JS + Leaflet |

## KV Request Budget (per endpoint)

| Endpoint | KV ops |
|----------|--------|
| POST /api/login | 2 |
| GET /api/region | 5 (4 tile SMEMBERS + 1 MGET) |
| GET /api/news/:id | 1 |
| POST /api/news | 6 |
| POST /api/vote | 2 |
| GET /api/my/news | 2 |
| GET /api/notifications | 1 |

## Setup

### 1. Create Vercel project and storage

```bash
npm i -g vercel && vercel login && vercel
```

In Vercel Dashboard → Storage:
- **Create → KV Database** → link to project
- **Create → Blob Store** → link to project

This auto-injects `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `BLOB_READ_WRITE_TOKEN`.

### 2. Add remaining env vars

```
JWT_SECRET     = any-long-random-string
ADMIN_PHONES   = 01711111111,01722222222
```

### 3. Deploy

```bash
vercel --prod
```

### 4. Local dev

```bash
vercel env pull .env.local
npm install && npm run dev
```

## KV Data Model

```
user:phone:{phone}   → user id
user:{id}            → full user JSON
user:count           → auto-increment counter
news:{id}            → news JSON with embedded votes  (TTL: 36h)
cell:{cell_key}      → news id occupying this cell    (TTL: 36h)
region:{gi}:{gj}     → Set of news ids in geo-tile    (TTL: 48h)
owner:{user_id}      → Set of news ids by this user
notif:{user_id}      → List of up to 50 notifications (TTL: 7d)
stats:news_count     → integer
stats:vote_count     → integer
```

Votes are **embedded inside the news document** — no separate collection. Expiry is handled by KV TTLs — no cron job needed.
