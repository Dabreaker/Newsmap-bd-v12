# BD News Map — Vercel + MongoDB Atlas

## Deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

## Required environment variables (Vercel Dashboard → Settings → Environment Variables)

| Variable | Example value |
|---|---|
| `MONGO_URI` | `mongodb+srv://togoabbalagi:mdmahimislam1234567890@togoabbalagi.dlrktny.mongodb.net/bdnewsmap?retryWrites=true&w=majority&appName=Togoabbalagi` |
| `JWT_SECRET` | any long random string |
| `ADMIN_PHONES` | `01710552580` (comma-separated for multiple admins) |

## Purge old news (runs automatically when called)
```
GET https://your-app.vercel.app/api/reaper?secret=YOUR_JWT_SECRET
```
