# Ludo Game - Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the `backend/` directory:
   ```env
   # MongoDB Connection
   CONNECTION_URI=mongodb://localhost:27017/ludo-master
   # OR for MongoDB Atlas:
   # CONNECTION_URI=mongodb+srv://username:password@cluster.mongodb.net/ludo?retryWrites=true&w=majority

   # JWT Secret (change this in production!)
   JWT_SECRET=8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7

   # Frontend URL (for CORS - optional in development)
   # FRONTEND_URL=http://localhost:3000

   # Server Port (default: 5000)
   PORT=5000
   ```

4. **Start the backend server:**
   ```bash
   npm start
   ```

   You should see:
   ```
   ✅ MongoDB Connected successfully
   Server running on http://0.0.0.0:5000
   ```

5. **Test the backend:**
   Open your browser and visit: `http://localhost:5000/health`
   You should see a JSON response with status information.

### Frontend Setup

1. **Navigate to root directory:**
   ```bash
   cd ..
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The frontend will start on `http://localhost:3000` (or another port if 3000 is busy).

4. **Open in browser:**
   Navigate to `http://localhost:3000`

## 🔧 Configuration

### API URL Configuration

The application automatically detects the backend URL based on:
1. Environment variable `VITE_API_URL` (if set)
2. Current hostname (if accessed via network IP, uses that IP)
3. Default: `http://localhost:5000/api`

### Socket.IO Configuration

Socket.IO URL is automatically configured based on:
1. Environment variable `VITE_SOCKET_URL` (if set)
2. Current hostname (if accessed via network IP, uses that IP)
3. Default: `http://localhost:5000`

### Network Access (Mobile/Remote Devices)

If you want to access the game from other devices on your network:

1. **Find your local IP address:**
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`

2. **Start backend with network access:**
   The backend is already configured to listen on `0.0.0.0`, so it's accessible from network.

3. **Access from mobile device:**
   - Frontend: `http://YOUR_IP:3000`
   - Backend: `http://YOUR_IP:5000`
   - The frontend will automatically detect the network IP and connect to the backend on the same IP.

## 🐛 Troubleshooting

### Backend Issues

**MongoDB Connection Error:**
- Make sure MongoDB is running (if using local MongoDB)
- Check your `CONNECTION_URI` in `.env` file
- For MongoDB Atlas, ensure your IP is whitelisted
- Check backend logs for specific error messages

**Port Already in Use:**
- Change `PORT` in `.env` file
- Or stop the process using port 5000

**CORS Errors:**
- In development, CORS allows all origins by default
- If issues persist, check `FRONTEND_URL` in backend `.env`

### Frontend Issues

**Cannot Connect to Backend:**
- Ensure backend is running on port 5000
- Check browser console for connection errors
- Verify `API_URL` in browser console (should show correct backend URL)
- Try accessing `http://localhost:5000/health` directly in browser

**Socket.IO Connection Failed:**
- Ensure backend is running
- Check `SOCKET_URL` in browser console
- Verify backend Socket.IO CORS settings
- Check browser console for Socket.IO connection errors

**Login/Register Fails:**
- Check backend logs for errors
- Verify MongoDB connection
- Check browser console for API errors
- Ensure backend is accessible (try `/health` endpoint)

### Common Error Messages

**"Cannot connect to server. Please ensure the backend is running on port 5000":**
- Backend is not running or not accessible
- Solution: Start the backend server

**"MongoDB Connection Error":**
- MongoDB is not running or connection string is wrong
- Solution: Check MongoDB connection and `.env` file

**"CORS: Origin not allowed":**
- Frontend URL doesn't match backend CORS settings
- Solution: In development, this shouldn't happen. Check `FRONTEND_URL` in backend `.env`

## 📝 Environment Variables Reference

### Backend (.env in `backend/` directory)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CONNECTION_URI` | MongoDB connection string | `mongodb://localhost:27017/ludo-master` | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Random string | Yes |
| `PORT` | Backend server port | `5000` | No |
| `FRONTEND_URL` | Frontend URL for CORS | `*` (all) in dev | No |
| `NODE_ENV` | Environment mode | `development` | No |

### Frontend (optional .env in root directory)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | Auto-detected |
| `VITE_SOCKET_URL` | Socket.IO server URL | Auto-detected |
| `VITE_USE_REAL_API` | Use same origin for API | `false` |

## 🎮 Game Features

- **Local Play**: Play against AI or with friends on the same device
- **Multiplayer**: Online multiplayer with matchmaking
- **Authentication**: User registration and login
- **Wallet System**: Deposit/withdraw funds (admin approval required)
- **Admin Dashboard**: Manage users, games, and transactions

## 🔒 Security Notes

- Change `JWT_SECRET` in production
- Use strong passwords for MongoDB
- Enable authentication in MongoDB for production
- Use HTTPS in production
- Set proper `FRONTEND_URL` in production

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Check backend logs for errors
3. Verify all environment variables are set correctly
4. Ensure MongoDB is running and accessible
5. Check network connectivity if using remote MongoDB

## ✅ Verification Checklist

After setup, verify:
- [ ] Backend starts without errors
- [ ] MongoDB connection successful
- [ ] Frontend starts without errors
- [ ] Can access `http://localhost:5000/health`
- [ ] Can register a new user
- [ ] Can login with registered user
- [ ] Can start a local game
- [ ] Can enter multiplayer lobby
- [ ] Socket.IO connects successfully (check browser console)

