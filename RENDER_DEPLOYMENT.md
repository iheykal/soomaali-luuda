# Render Deployment Guide

## Current Status
✅ **Frontend**: Deployed at `https://soomaali-ludda.onrender.com`
❌ **Backend**: Not deployed yet

## Step 1: Deploy Backend Service

1. Go to your Render Dashboard: https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `iheykal/soomaali-luuda`
4. Configure the backend service:

### Backend Configuration:
- **Name**: `soomaali-ludda-backend` (or any name you prefer)
- **Root Directory**: `backend`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Choose your plan (Free tier works for testing)

### Environment Variables for Backend:
Add these in the Render dashboard under "Environment":

```
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
CONNECTION_URI=your_mongodb_connection_string_here
JWT_SECRET=your_secure_jwt_secret_here
FRONTEND_URL=https://soomaali-ludda.onrender.com
```

**Important Notes:**
- `PORT=10000` - Render assigns a random port, but we'll use 10000 as default
- `CONNECTION_URI` - Your MongoDB Atlas connection string
- `JWT_SECRET` - A secure random string (change from default!)
- `FRONTEND_URL` - Your frontend URL for CORS

5. Click **"Create Web Service"**

6. Wait for deployment to complete. Note the backend URL (e.g., `https://soomaali-ludda-backend.onrender.com`)

## Step 2: Update Frontend Environment Variables

1. Go to your **Frontend Service** in Render Dashboard
2. Go to **"Environment"** tab
3. Add these environment variables:

```
VITE_API_URL=https://your-backend-url.onrender.com/api
VITE_SOCKET_URL=https://your-backend-url.onrender.com
VITE_USE_REAL_API=true
```

**Replace `your-backend-url.onrender.com` with your actual backend URL from Step 1.**

4. Click **"Save Changes"** - This will trigger a new deployment

## Step 3: Update Backend CORS Configuration

Make sure your backend's `FRONTEND_URL` environment variable matches your frontend URL:
```
FRONTEND_URL=https://soomaali-ludda.onrender.com
```

## Step 4: Verify Deployment

1. **Backend Health Check**: Visit `https://your-backend-url.onrender.com/api/health`
   - Should return: `{"status":"ok",...}`

2. **Frontend**: Visit `https://soomaali-ludda.onrender.com`
   - Should now connect to backend successfully

3. **Check Browser Console**: 
   - Open browser DevTools (F12)
   - Look for: `🔧 API Configuration: { API_URL: '...', SOCKET_URL: '...' }`
   - Should show your backend URLs, not localhost

## Troubleshooting

### Backend won't start
- Check MongoDB connection string is correct
- Verify all environment variables are set
- Check Render logs for errors

### Frontend can't connect to backend
- Verify `VITE_API_URL` is set correctly in frontend environment
- Check CORS settings in backend (`FRONTEND_URL` must match frontend domain)
- Verify backend is running (check health endpoint)

### CORS errors
- Ensure `FRONTEND_URL` in backend matches your frontend URL exactly
- Check that backend allows your frontend origin

## Quick Reference

### Backend Service:
- **Root Directory**: `backend`
- **Start Command**: `npm start`
- **Port**: Use `process.env.PORT` (Render assigns automatically)

### Frontend Service:
- **Root Directory**: (root)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**: `VITE_API_URL`, `VITE_SOCKET_URL`

## Cost Estimate (Free Tier)
- **Backend**: Free (with limitations)
- **Frontend**: Free (Static Site or Web Service)
- **Total**: $0/month (with Render free tier limitations)

