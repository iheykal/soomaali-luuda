# Environment Setup Guide

## Environment Variables

This project requires environment variables to be set for both the frontend and backend.

### Root Directory (.env)

Create a `.env` file in the root directory with the following variables:

```env
NODE_ENV=production
CONNECTION_URI=mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo
JWT_SECRET=8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7
FRONTEND_URL=https://ludo-252.onrender.com
VITE_API_URL=/api
VITE_USE_REAL_API=true
```

### Backend Directory (backend/.env)

Create a `.env` file in the `backend` directory with:

```env
NODE_ENV=production
CONNECTION_URI=mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo
JWT_SECRET=8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7
FRONTEND_URL=https://ludo-252.onrender.com
PORT=5000
```

## Changes Made

1. **Backend Server (backend/server.js)**:
   - Updated to use `CONNECTION_URI` environment variable for MongoDB connection
   - Updated CORS to use `FRONTEND_URL` environment variable
   - Socket.IO CORS configured to use `FRONTEND_URL`

2. **Frontend Configuration (lib/apiConfig.ts)**:
   - Created centralized API configuration
   - Uses `VITE_API_URL` and `VITE_USE_REAL_API` environment variables
   - Automatically uses relative URLs in production mode

3. **Updated Files**:
   - `hooks/useGameLogic.ts` - Uses environment-based Socket.IO URL
   - `components/Wallet.tsx` - Uses centralized API URL
   - `components/admin/AdminDashboard.tsx` - Uses centralized API URL

## Production Deployment

For production deployment on Render.com or similar platforms:

1. Set all environment variables in your hosting platform's dashboard
2. Ensure `VITE_USE_REAL_API=true` is set
3. Ensure `VITE_API_URL=/api` for same-origin requests
4. Ensure `FRONTEND_URL` matches your frontend domain
5. Backend should use `CONNECTION_URI` for MongoDB Atlas connection

## Development

For local development, you can override the production settings:

```env
VITE_USE_REAL_API=false
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

