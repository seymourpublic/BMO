# Split Deployment Guide - Vercel + Railway

Deploy BMO with frontend on Vercel and backend on Railway.

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Vercel (Free)  │ ──────→ │ Railway ($5/mo)  │
│                 │         │                  │
│  React Frontend │  HTTPS  │  Express Backend │
│  Static Files   │ Request │  API + TTS       │
│  CDN Optimized  │         │  API Keys        │
└─────────────────┘         └──────────────────┘
```

---

## Part 1: Deploy Backend to Railway

### Step 1: Push Code to GitHub

```bash
# In your project folder
git add .
git commit -m "Split deployment setup"
git push origin main
```

### Step 2: Deploy to Railway

1. Go to **railway.app**
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your **bmo-companion** repo
5. Railway auto-detects and builds

### Step 3: Add Environment Variables in Railway

Settings → Variables → Add:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key
FISH_AUDIO_API_KEY=FAK-your-actual-key
FRONTEND_URL=https://your-app.vercel.app
```

**Note:** You'll update `FRONTEND_URL` after Vercel deployment

### Step 4: Get Railway URL

1. Settings → Domains
2. Click **"Generate Domain"**
3. Copy URL: `https://bmo-ai-assistant.up.railway.app`
4. **Save this URL** - you'll need it for Vercel!

### Step 5: Verify Backend

Test the health endpoint:
```
https://your-railway-url.railway.app/health
```

Should return:
```json
{"status":"ok","message":"BMO backend is running!"}
```

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Install Vercel CLI (Optional)

```bash
npm i -g vercel
```

### Step 2: Deploy via GitHub (Recommended)

1. Go to **vercel.com**
2. Sign in with GitHub
3. Click **"New Project"**
4. **Import** your GitHub repository
5. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Step 3: Add Environment Variable

Before deploying, add:

**Settings → Environment Variables:**
```
VITE_BACKEND_URL=https://your-railway-url.up.railway.app
```

**Use your actual Railway URL from Part 1, Step 4!**

### Step 4: Deploy

Click **"Deploy"**

Vercel will:
1. Install dependencies
2. Build your React app
3. Deploy to CDN
4. Give you a URL: `https://bmo-companion.vercel.app`

---

## Part 3: Connect Frontend and Backend

### Step 1: Update Railway with Vercel URL

Go back to Railway:

1. **Settings → Variables**
2. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://your-actual-app.vercel.app
   ```
3. Railway auto-redeploys

### Step 2: Test the Connection

1. Open your Vercel URL: `https://your-app.vercel.app`
2. BMO should load
3. Try talking to BMO
4. Check browser console (F12) for errors

---

## Environment Variables Summary

### Railway (Backend):
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
FISH_AUDIO_API_KEY=FAK-xxxxx
FRONTEND_URL=https://bmo-companion.vercel.app
```

### Vercel (Frontend):
```env
VITE_BACKEND_URL=https://bmo-ai-assistant.up.railway.app
```

### Local Development (.env):
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
FISH_AUDIO_API_KEY=FAK-xxxxx
# No VITE_BACKEND_URL needed - defaults to localhost:3001
```

---

## Local Development

**Terminal 1 - Backend:**
```bash
node server.js
# Runs on http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Runs on http://localhost:5173
# Automatically calls localhost:3001
```

---

## Troubleshooting

### CORS Errors

**Error:** "Access-Control-Allow-Origin"

**Fix:**
1. Check `FRONTEND_URL` in Railway matches your Vercel URL exactly
2. Make sure Railway redeployed after adding the variable
3. Check browser console for the actual origin being blocked

### API Not Found (404)

**Error:** "Cannot GET /api/chat"

**Fix:**
1. Check `VITE_BACKEND_URL` in Vercel settings
2. Make sure Railway backend is running (check Railway logs)
3. Test Railway health endpoint: `https://your-railway.app/health`

### Environment Variables Not Working

**Fix Vercel:**
1. Make sure variable name starts with `VITE_`
2. Redeploy after adding variables
3. Check in Vercel → Settings → Environment Variables

**Fix Railway:**
1. Variables don't need prefix
2. Check Railway → Settings → Variables
3. Railway auto-redeploys on variable change

### Voice Not Working

**Check:**
1. `FISH_AUDIO_API_KEY` is set in Railway (not Vercel!)
2. API key is valid at https://fish.audio/app/api-keys/
3. Check Railway logs for TTS errors

---

## Updating Your Deployment

### Update Frontend:

```bash
git add src/
git commit -m "Update frontend"
git push
# Vercel auto-deploys!
```

### Update Backend:

```bash
git add server.js
git commit -m "Update backend"
git push
# Railway auto-deploys!
```

---

## Cost Breakdown

### Vercel:
- **Free tier:** 100GB bandwidth/month
- **Cost:** $0 (for personal projects)

### Railway:
- **Backend only:** ~$5/month
- **No frontend serving costs**

**Total: ~$5/month** (vs $7 for Railway-only)

---

## Monitoring

### Check Backend Status:
```
https://your-railway.railway.app/health
```

### Check Frontend:
```
https://your-app.vercel.app
```

### Railway Logs:
Railway Dashboard → Deployments → Click deployment → View logs

### Vercel Logs:
Vercel Dashboard → Deployments → Click deployment → Function Logs

---

## URLs You Need

Save these URLs:

**Railway Backend:**
```
https://bmo-ai-assistant.up.railway.app
```

**Vercel Frontend:**
```
https://bmo-companion.vercel.app
```

**Use these URLs in your environment variables!**

---

## Quick Checklist

Before going live:

- [ ] Backend deployed to Railway
- [ ] Railway environment variables set (API keys + FRONTEND_URL)
- [ ] Railway health endpoint works
- [ ] Frontend deployed to Vercel  
- [ ] Vercel environment variable set (VITE_BACKEND_URL)
- [ ] Can access Vercel URL
- [ ] BMO loads and responds
- [ ] Voice works
- [ ] No CORS errors in console

---

## Next Steps

After successful deployment:

1. **Share your Vercel URL** with Erica! 💕
2. **Monitor usage** in Railway and Vercel dashboards
3. **Set up custom domain** (optional):
   - Vercel: Settings → Domains → Add Domain
   - Update Railway FRONTEND_URL to custom domain

---

## Support

**Issues?**
- Check browser console (F12) for frontend errors
- Check Railway logs for backend errors
- Verify all environment variables are set correctly

**Still stuck?**
- Railway Discord: discord.gg/railway
- Vercel Discord: vercel.com/discord

---

Ready to deploy! Follow Part 1, then Part 2, then Part 3. BMO will be live! 🚀
