# BD News Map v17 — MongoDB + Vercel

## Deploy to Vercel (step by step)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Go into the project folder
```bash
cd bd-news-map-v17
```

### 4. Deploy
```bash
vercel
```
Answer the prompts:
- Set up and deploy? → **Y**
- Which scope? → pick your account
- Link to existing project? → **N** (first time)
- Project name? → `bd-news-map` (or anything)
- In which directory is your code located? → `.` (just press Enter)

### 5. Set environment variables on Vercel
After the first deploy, go to:
**Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these two:

| Name | Value |
|------|-------|
| `MONGO_URI` | `mongodb+srv://togoabbalagi:mdmahimislam1234567890@togoabbalagi.dlrktny.mongodb.net/bdnewsmap?retryWrites=true&w=majority&appName=Togoabbalagi` |
| `JWT_SECRET` | any long random string, e.g. `bd-news-super-secret-2024` |

### 6. Redeploy to apply env vars
```bash
vercel --prod
```

Your app is now live at the URL Vercel gives you.

---

## Local development
```bash
npm install
npm run dev
```
Uses the `.env` file automatically (Atlas URI already set there).

---

## Manual image purge on Vercel (no cron)
Hit this URL to purge old news (replace SECRET with your JWT_SECRET):
```
GET https://your-app.vercel.app/api/reaper?secret=YOUR_JWT_SECRET
```
You can set this up as a free Vercel Cron Job in `vercel.json`.
