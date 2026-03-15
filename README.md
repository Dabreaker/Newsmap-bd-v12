# জনবার্তা — BD Hyperlocal Citizen News Map

Hyperlocal citizen news reporting app for Bangladesh. Users physically near an event can pin and report news on a map, and nearby users vote on whether it is real or fake.

## File Structure

```
/
├── server.js              ← Express API, all routes, module.exports = app
├── db.js                  ← MongoDB Atlas lazy connection
├── middleware/
│   └── auth.js            ← JWT middleware
├── public/
│   ├── index.html         ← SPA shell + all CSS
│   └── js/
│       └── app.js         ← All frontend logic
├── package.json
├── vercel.json
└── README.md
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file (or set in Vercel dashboard):
```
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/
JWT_SECRET=your-very-long-random-secret-string
ADMIN_PHONES=01711111111,01722222222
```

### 3. MongoDB Atlas
- Create a free cluster at mongodb.com/atlas
- Get the connection string for `MONGO_URI`
- Indexes are created automatically on first run

### 4. Local Development
```bash
npm run dev
# Runs on http://localhost:3000
```

### 5. Deploy to Vercel
```bash
npm i -g vercel
vercel
# Follow prompts, set env vars in Vercel dashboard
```

### 6. Auto-expiry (Reaper)
Set up a cron job (e.g. cron-job.org) to hit every 15 minutes:
```
GET https://your-app.vercel.app/api/reaper?secret=YOUR_JWT_SECRET
```

## Key Features
- 50×50m cell grid — one news per cell
- 5km radius restriction for posting and voting
- Vote weight by distance (1.0 at 0km → 0.2 at 5km)
- 36-hour news expiry
- Anonymous usernames (Bengali)
- GridFS image storage
- JWT auth with phone number
- Bengali/English toggle
- Dark/Light theme
- Local bookmarks
- Admin panel

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/register | - | Register with phone+password |
| POST | /api/login | - | Login |
| POST | /api/news | ✓ | Post news (multipart) |
| GET | /api/region | - | Get news in ~10km area |
| GET | /api/news/nearby | - | Get nearby news cell keys |
| GET | /api/news/:id | - | Get single news |
| DELETE | /api/news/:id | ✓ | Delete news |
| POST | /api/vote | ✓ | Vote real/fake |
| GET | /api/my/news | ✓ | My reports |
| GET | /api/notifications | ✓ | Get notifications |
| POST | /api/notifications/seen | ✓ | Mark all read |
| GET | /api/images/:fileId | - | Serve image |
| GET | /api/reaper | - | Delete expired news |
| GET | /api/admin/stats | admin | Stats |
| GET | /api/admin/news | admin | List all news |
| DELETE | /api/admin/news/:id | admin | Delete news |
| GET | /api/admin/users | admin | List users |
| POST | /api/admin/users/:id/ban | admin | Ban/unban |
| DELETE | /api/admin/users/:id/news | admin | Delete user's posts |
