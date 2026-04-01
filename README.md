# Total Battle RSS Tracker

## Deploy in 4 steps

### 1. Run Supabase schema
- Go to supabase.com → your project → SQL Editor
- Paste the contents of `supabase-schema.sql` and click Run
- This creates the tables and seeds all 61 players

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/Parkes-Jamie/total-battle-rss.git
git push -u origin main
```

### 3. Deploy to Vercel
- Go to vercel.com → New Project
- Import your `total-battle-rss` GitHub repo
- No environment variables needed (keys are in the code)
- Click Deploy

### 4. Done
- Public view: `https://your-app.vercel.app/`
- Admin view: `https://your-app.vercel.app/admin`

## Usage
- `/` — read-only view for clan members, share this link freely
- `/admin` — your edit view, keep this URL private
- Edit button on each player row to update their weekly totals
- Day strip at the top — click to mark each resource as submitted for each day
- Reset Week button clears all totals at the start of each new week
- Report button generates plain text report to paste into clan chat
