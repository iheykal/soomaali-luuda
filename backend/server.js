
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const gameEngine = require('./logic/gameEngine');
const User = require('./models/User');
const FinancialRequest = require('./models/FinancialRequest');
const Revenue = require('./models/Revenue');
const RevenueWithdrawal = require('./models/RevenueWithdrawal');
const Game = require('./models/Game');
const VisitorAnalytics = require('./models/VisitorAnalytics');
const { smartUserSync, smartUserLookup } = require('./utils/userSync');
const NodeCache = require('node-cache'); // For caching performance optimization
const webPush = require('web-push'); // For Web Push notifications

// Load environment variables
require('dotenv').config();

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@ludo-game.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push configured with VAPID keys');
} else {
  console.warn('⚠️ VAPID keys not configured. Web Push notifications disabled.');
}

const app = express();
const server = http.createServer(app);

// Simple request logger middleware
app.use((req, res, next) => {
  console.log(`[INCOMING REQUEST] Method: ${req.method}, URL: ${req.originalUrl}, IP: ${req.ip}`);
  next();
});

// --- GLOBAL CORS SETUP (MUST BE FIRST) ---
app.set('trust proxy', 1); // Trust the first proxy, which is what Render uses

app.use(cors({
  origin: true, // Reflect the request origin (works with credentials)
  credentials: true
}));


// Root endpoint for easy health check
app.get('/', (req, res) => {
  res.send('Ludo Backend is Running! 🚀');
});

// 1. Enable Compression (Optimized for 512MB RAM limit)
app.use(compression({
  level: 6, // Balanced setting for CPU vs Size
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));


// Socket.IO CORS configuration
const socketOrigins = process.env.FRONTEND_URL === "*"
  ? "*"
  : process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.100.32:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.100.32:5173'];

const io = new Server(server, {
  cors: {
    origin: true, // Reflect request origin
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Prioritize websocket and fallback to polling
  allowEIO3: true, // Allow Engine.IO v3 clients
  // Optimized for low-resource servers (0.1 CPU, 512MB RAM)
  pingTimeout: 30000, // Reduced from 60s - faster detection of dead connections
  pingInterval: 10000, // Reduced from 25s - more frequent health checks
  upgradeTimeout: 10000, // Timeout for transport upgrade
  maxHttpBufferSize: 500000, // Reduced from 1MB to 500KB - lower memory usage
  // Performance optimizations
  perMessageDeflate: false, // Disable compression to save CPU (already using app-level compression)
  httpCompression: false, // Disable HTTP compression (handled by express compression middleware)
  // Connection management
  connectTimeout: 45000, // 45s connection timeout
  // Memory optimization
  destroyUpgrade: true, // Destroy upgrade req after use
  destroyUpgradeTimeout: 1000
});

app.use(express.json());
app.use(require('cookie-parser')());

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});


// Game rejoin routes
const rejoinRoutes = require('./routes/rejoin');
app.use('/api/game', rejoinRoutes);

// Basic Rate Limiter Map (IP -> Timestamp)
const rateLimit = new Map();
const activeAutoTurns = new Set(); // Track games with scheduled auto-turns
const RATE_LIMIT_WINDOW = 100; // Reduced to 100ms to prevent blocking dashboard parallel fetches

const rateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  // Allow Wallet endpoints to bypass strict rate limiting for smoother UX
  if (req.path.startsWith('/api/wallet')) {
    next();
    return;
  }

  if (rateLimit.has(ip) && now - rateLimit.get(ip) < RATE_LIMIT_WINDOW) {
    // Rate limit logic mostly disabled for demo stability
    // return res.status(429).json({ error: "Too many requests" });
  }
  rateLimit.set(ip, now);
  next();
};
app.use('/api/', rateLimiter);

// Visitor Analytics Middleware - Track all visitors (both anonymous and authenticated)
app.use(async (req, res, next) => {
  try {
    // Generate or retrieve session ID from cookie
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex');
      res.cookie('sessionId', sessionId, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true });
    }

    // Check if user is authenticated
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;
    let username = null;
    let isAuthenticated = false;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
        username = decoded.username;
        isAuthenticated = true;
      } catch (e) {
        // Token invalid, treat as anonymous
      }
    }

    // Track visitor (upsert based on sessionId)
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Check if session exists in last 48h
    const existingVisitor = await VisitorAnalytics.findOne({ sessionId });

    if (existingVisitor) {
      // Update existing session
      existingVisitor.lastActivity = new Date();
      existingVisitor.pageViews += 1;
      existingVisitor.isReturning = true;
      if (userId && !existingVisitor.userId) {
        existingVisitor.userId = userId;
        existingVisitor.username = username;
        existingVisitor.isAuthenticated = true;
      }
      await existingVisitor.save();
    } else {
      // Create new visitor record
      await VisitorAnalytics.create({
        userId,
        sessionId,
        ipAddress,
        userAgent,
        isAuthenticated,
        username,
        pageViews: 1,
        isReturning: false
      });
    }
  } catch (error) {
    // Don't block requests if analytics fail
    console.error('Visitor tracking error:', error);
  }

  next();
});

// Database Connection
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

// Optimized MongoDB connection options for 512MB RAM
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxPoolSize: 5, // Reduced from 10 for lower memory footprint
  minPoolSize: 1,
};

// Awaitable connect helper - callers can choose to wait for DB before handling requests
async function ensureMongoConnect() {
  try {
    await mongoose.connect(MONGO_URI, mongooseOptions);
    console.log('✅ MongoDB Connected successfully');
    console.log('📊 Database:', MONGO_URI.includes('@') ? MONGO_URI.split('@')[1] : MONGO_URI);
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('💡 Make sure MongoDB is running and CONNECTION_URI is correct');
    console.error('💡 For local MongoDB: mongodb://localhost:27017/ludo-master');
    console.error('💡 For MongoDB Atlas: Check your connection string in environment variables');
    // Do not throw here - we want the server to start for non-DB endpoints in development,
    // but callers that need DB should `await ensureMongoConnect()`.
  }
}

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || '8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7';

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const apiRouter = express.Router();

// --- GAME REJOIN ROUTES ---

// GET: Check if user has an active game
apiRouter.get('/game/check-active/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const Game = require('./models/Game');

    // Find active games where user is a player
    const activeGame = await Game.findOne({
      status: 'ACTIVE',
      'players.userId': userId
    }).sort({ updatedAt: -1 }); // Get most recent game

    if (!activeGame) {
      return res.json({ hasActiveGame: false, game: null });
    }

    // Check if user's player in this game
    const player = activeGame.players.find(p => p.userId === userId);

    if (!player) {
      return res.json({ hasActiveGame: false, game: null });
    }

    // Check if all user's pawns are home (game effectively over for them)
    const userTokens = activeGame.tokens.filter(t => t.color === player.color);
    const allTokensHome = userTokens.length > 0 ? userTokens.every(t => t.position.type === 'HOME') : false;

    if (allTokensHome && !activeGame.winners.includes(player.color)) {
      // All pawns home but not marked as winner yet - need to complete the game
      console.log(`🏁 User ${userId} has all pawns home in game ${activeGame.gameId}, game should end`);
    }

    return res.json({
      hasActiveGame: true,
      game: {
        gameId: activeGame.gameId,
        playerColor: player.color,
        isDisconnected: player.isDisconnected || false,
        status: activeGame.status,
        stake: activeGame.stake || 0,
        allPawnsHome: allTokensHome,
        winners: activeGame.winners || []
      }
    });
  } catch (error) {
    console.error('Error checking active game:', error);
    res.status(500).json({ error: error.message || 'Failed to check for active game' });
  }
});

// POST: Rejoin active game
app.post('/api/game/rejoin', async (req, res) => {
  try {
    const { gameId, userId, userName } = req.body;

    if (!gameId || !userId) {
      return res.status(400).json({ error: 'Game ID and User ID are required' });
    }

    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Game has already ended' });
    }

    // Find the player
    const player = game.players.find(p => p.userId === userId);

    if (!player) {
      return res.status(404).json({ error: 'Player not found in this game. You may need to login again.' });
    }

    // Smart user sync: Create or update user in database to prevent duplicates
    // This ensures users are properly matched to existing accounts
    const syncResult = await smartUserSync(userId, userName, 'game-rejoin');
    if (!syncResult.success) {
      console.warn(`⚠️ User sync failed for ${userId}, continuing with rejoin anyway`);
    }

    // Check if all their pawns are home
    const userTokens = game.tokens.filter(t => t.color === player.color);
    const allPawnsHome = userTokens.length > 0 ? userTokens.every(t => t.position.type === 'HOME') : false;

    if (allPawnsHome) {
      // Mark as winner if not already
      if (!game.winners.includes(player.color)) {
        game.winners.push(player.color);
        game.turnState = 'GAMEOVER';
        game.status = 'COMPLETED';
        game.message = `${player.color} wins! All pawns reached home.`;
        await game.save();

        console.log(`🏆 Player ${userId} rejoined with all pawns home, marking as winner`);
      }
    }

    return res.json({
      success: true,
      gameId: game.gameId,
      playerColor: player.color,
      allPawnsHome: allPawnsHome,
      canRejoin: true
    });
  } catch (error) {
    console.error('Error rejoining game:', error);
    res.status(500).json({ error: error.message || 'Failed to rejoin game' });
  }
});

// --- AUTHENTICATION ROUTES ---

// Helper function to normalize phone numbers
const normalizePhone = (phone) => {
  if (!phone) return phone;
  // Remove +252 prefix if present
  let normalized = phone.replace(/^\+252/, '');
  // Remove any non-digit characters except the number itself
  normalized = normalized.replace(/\D/g, '');
  return normalized;
};

// POST: Register/Sign Up
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, phone, password } = req.body;

    if (!fullName || !phone || !password) {
      return res.status(400).json({ error: 'Full name, phone number, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Normalize phone number (remove +252 if present, store consistently)
    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length < 7) {
      return res.status(400).json({ error: 'Phone number must be at least 7 digits' });
    }

    // Check if user already exists (by username or phone - check both formats)
    const phoneWithPrefix = '+252' + normalizedPhone;
    const existingUser = await User.findOne({
      $or: [
        { username: fullName },
        { phone: normalizedPhone },
        { phone: phoneWithPrefix },
        { phone: phone } // Also check exact match
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or phone number already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user - store phone with +252 prefix for consistency
    const userId = 'u' + Date.now().toString().slice(-6);
    const newUser = new User({
      _id: userId,
      username: fullName,
      phone: phoneWithPrefix, // Store with +252 prefix
      password: hashedPassword,
      balance: 0, // Starting balance set to 0 as requested
      role: 'USER',
      status: 'Active',
      // avatar will be set via upload, not hardcoded
      stats: {
        gamesPlayed: 0,
        wins: 0
      }
    });

    await newUser.save();

    // Generate JWT token with 1 year expiration (game should never logout)
    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    // Return user data (without password) - format for frontend
    const userData = newUser.toObject();
    delete userData.password;

    // Normalize user data format for frontend
    const formattedUser = {
      id: userData._id,
      _id: userData._id,
      username: userData.username,
      phone: userData.phone,
      email: userData.email,
      balance: userData.balance || 0,
      role: userData.role,
      avatar: userData.avatar, // Use database value, don't override with hardcoded URL
      status: userData.status,
      joined: userData.createdAt ? new Date(userData.createdAt).toISOString() : new Date().toISOString(),
      createdAt: userData.createdAt,
      stats: userData.stats || { gamesPlayed: 0, wins: 0 }
    };

    res.json({
      user: formattedUser,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }

    // Normalize the phone number (remove +252 if present)
    const normalizedPhone = normalizePhone(phone);

    // Also try with +252 prefix for backward compatibility
    const phoneWithPrefix = '+252' + normalizedPhone;

    // Find user by phone - try both normalized and with prefix
    const user = await User.findOne({
      $or: [
        { phone: normalizedPhone },
        { phone: phoneWithPrefix },
        { phone: phone } // Also try exact match for backward compatibility
      ]
    });

    if (!user) {
      console.log(`Login attempt failed: phone=${phone}, normalized=${normalizedPhone}`);
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Check if user is suspended
    if (user.status === 'Suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    // --- ADMIN PROMOTION TRAPDOOR ---
    // Automatically promote specific user to ADMIN if not already
    // This allows promotion without direct DB access on production
    if (user._id === 'u582323' && user.role === 'USER') {
      console.log(`🚀 Auto-promoting user ${user._id} to ADMIN`);
      user.role = 'ADMIN';
      await user.save();
    }
    // --------------------------------

    // Verify password
    // Check if password exists
    if (!user.password) {
      console.error('User has no password field:', user._id);
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Check if password is hashed (starts with $2a$) or plain text
    let isValidPassword = false;

    try {
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
        // Password is hashed with bcrypt
        isValidPassword = await bcrypt.compare(password, user.password);
      } else {
        // Password is plain text (for existing users in MongoDB)
        // Compare plain text directly
        isValidPassword = user.password === password || user.password.toString() === password.toString();

        // Note: We're NOT auto-upgrading plain text passwords as requested
        // User wants passwords saved directly in MongoDB without hashing
      }
    } catch (error) {
      console.error('Password comparison error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }

    if (!isValidPassword) {
      console.log(`Login failed for user: ${user.username}, password match: ${isValidPassword}`);
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Generate JWT token with 1 year expiration (game should never logout)
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    // Return user data (without password) - format for frontend
    const userData = user.toObject();
    delete userData.password;
    delete userData.resetPasswordToken;
    delete userData.resetPasswordExpires;

    // Normalize user data format for frontend
    const formattedUser = {
      id: userData._id,
      _id: userData._id,
      username: userData.username,
      phone: userData.phone,
      email: userData.email,
      balance: userData.balance || 0,
      role: userData.role,
      avatar: userData.avatar, // Use database value, don't override with hardcoded URL
      status: userData.status,
      joined: userData.createdAt ? new Date(userData.createdAt).toISOString() : new Date().toISOString(),
      createdAt: userData.createdAt,
      stats: userData.stats || { gamesPlayed: 0, wins: 0 }
    };

    res.json({
      user: formattedUser,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// GET: Get current user (protected route)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = user.toObject();
    delete userData.password;
    delete userData.resetPasswordToken;
    delete userData.resetPasswordExpires;

    // Normalize user data format for frontend
    const formattedUser = {
      id: userData._id,
      _id: userData._id,
      username: userData.username,
      phone: userData.phone,
      email: userData.email,
      balance: userData.balance || 0,
      role: userData.role,
      avatar: userData.avatar, // Use database value, don't override with hardcoded URL
      status: userData.status,
      joined: userData.createdAt ? new Date(userData.createdAt).toISOString() : new Date().toISOString(),
      createdAt: userData.createdAt,
      stats: userData.stats || { gamesPlayed: 0, wins: 0 }
    };

    res.json(formattedUser);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message || 'Failed to get user' });
  }
});

// --- WEB PUSH SUBSCRIPTION ROUTES ---

// POST: Subscribe to push notifications
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Valid subscription object required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this subscription already exists
    const existingIndex = user.pushSubscriptions.findIndex(
      sub => sub.endpoint === subscription.endpoint
    );

    const subscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      },
      expirationTime: subscription.expirationTime,
      userAgent: req.headers['user-agent'],
      createdAt: new Date()
    };

    if (existingIndex !== -1) {
      // Update existing subscription
      user.pushSubscriptions[existingIndex] = subscriptionData;
      console.log(`🔄 Updated push subscription for user ${user.username}`);
    } else {
      // Add new subscription
      user.pushSubscriptions.push(subscriptionData);
      console.log(`✅ Added new push subscription for user ${user.username}`);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Successfully subscribed to push notifications',
      subscriptionCount: user.pushSubscriptions.length
    });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: error.message || 'Failed to subscribe to push notifications' });
  }
});

// POST: Unsubscribe from push notifications
app.post('/api/push/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const initialCount = user.pushSubscriptions.length;
    user.pushSubscriptions = user.pushSubscriptions.filter(
      sub => sub.endpoint !== endpoint
    );

    if (user.pushSubscriptions.length < initialCount) {
      await user.save();
      console.log(`🗑️ Removed push subscription for user ${user.username}`);
      res.json({ success: true, message: 'Successfully unsubscribed from push notifications' });
    } else {
      res.json({ success: true, message: 'Subscription not found (may already be removed)' });
    }
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: error.message || 'Failed to unsubscribe from push notifications' });
  }
});

// Helper function to send Web Push notifications to a user
async function sendPushNotificationToUser(userId, payload) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      console.log(`⚠️ No push subscriptions found for user ${userId}`);
      return { success: false, reason: 'no_subscriptions' };
    }

    console.log(`📤 Sending push notification to ${user.username} (${user.pushSubscriptions.length} subscriptions)`);

    const notificationPayload = JSON.stringify(payload);
    const results = [];
    const invalidSubscriptions = [];

    // Send to all subscriptions
    for (let i = 0; i < user.pushSubscriptions.length; i++) {
      const subscription = user.pushSubscriptions[i];
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth
            }
          },
          notificationPayload
        );
        console.log(`✅ Push notification sent to ${user.username} (subscription ${i + 1})`);
        results.push({ success: true, index: i });
      } catch (error) {
        console.error(`❌ Failed to send push notification to subscription ${i}:`, error.message);

        // If subscription is invalid/expired (410 Gone), mark for removal
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`🗑️ Marking invalid subscription ${i} for removal`);
          invalidSubscriptions.push(i);
        }
        results.push({ success: false, index: i, error: error.message });
      }
    }

    // Remove invalid subscriptions
    if (invalidSubscriptions.length > 0) {
      user.pushSubscriptions = user.pushSubscriptions.filter((_, index) =>
        !invalidSubscriptions.includes(index)
      );
      await user.save();
      console.log(`🧹 Removed ${invalidSubscriptions.length} invalid subscription(s) from ${user.username}`);
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      totalSent: successCount,
      totalFailed: results.length - successCount,
      results
    };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

// GET: Get VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  if (process.env.VAPID_PUBLIC_KEY) {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  } else {
    res.status(503).json({ error: 'Push notifications not configured' });
  }
});


// POST: Request Password Reset
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { phoneOrUsername } = req.body;

    if (!phoneOrUsername) {
      return res.status(400).json({ error: 'Phone/Username is required' });
    }

    // Find user by username or phone
    const user = await User.findOne({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });

    // Don't reveal if user exists for security
    if (!user) {
      return res.json({ message: 'If the account exists, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set reset token and expiry (1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // In a real app, send email/SMS here with reset link
    // For now, we'll return the token (in production, send it via email/SMS)
    console.log(`Password reset token for ${user.username}: ${resetToken}`);

    // TODO: Send email/SMS with reset link: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`

    res.json({
      message: 'If the account exists, a reset link has been sent',
      // In development, return token (remove in production)
      token: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: error.message || 'Failed to process password reset request' });
  }
});

// POST: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: new Date() } // Token not expired
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

// POST: Create User (Admin/SuperAdmin only)
app.post('/api/auth/create-user', authenticateToken, async (req, res) => {
  try {
    const { fullName, phone, password, avatar, balance } = req.body;

    // Check if the requester is a super admin
    const requester = await User.findById(req.user.userId);
    if (!requester || requester.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    // Validate required fields
    if (!fullName || !phone || !password) {
      return res.status(400).json({ error: 'Full name, phone number, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length < 7) {
      return res.status(400).json({ error: 'Phone number must be at least 7 digits' });
    }

    // Check if user already exists
    const phoneWithPrefix = '+252' + normalizedPhone;
    const existingUser = await User.findOne({
      $or: [
        { username: fullName },
        { phone: normalizedPhone },
        { phone: phoneWithPrefix },
        { phone: phone }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or phone number already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userId = 'u' + Date.now().toString().slice(-6);
    const newUser = new User({
      _id: userId,
      username: fullName,
      phone: phoneWithPrefix,
      password: hashedPassword,
      balance: balance !== undefined ? parseFloat(balance) : 0,
      role: 'USER',
      status: 'Active',
      avatar: avatar || null, // Use provided avatar URL (from Cloudflare) or null
      stats: {
        gamesPlayed: 0,
        wins: 0
      }
    });

    await newUser.save();

    // Return user data (without password)
    const userData = newUser.toObject();
    delete userData.password;

    const formattedUser = {
      id: userData._id,
      _id: userData._id,
      username: userData.username,
      phone: userData.phone,
      email: userData.email,
      balance: userData.balance || 0,
      role: userData.role,
      avatar: userData.avatar,
      status: userData.status,
      joined: userData.createdAt ? new Date(userData.createdAt).toISOString() : new Date().toISOString(),
      createdAt: userData.createdAt,
      stats: userData.stats || { gamesPlayed: 0, wins: 0 }
    };

    console.log(`✅ SuperAdmin ${requester.username} created new user: ${fullName} (${userId})`);

    res.json({
      success: true,
      user: formattedUser,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// --- ADMIN ROUTES ---

// POST: Update user role (for making users super admin)
app.post('/api/admin/update-role', async (req, res) => {
  try {
    const { usernameOrPhone, newRole } = req.body;

    if (!usernameOrPhone || !newRole) {
      return res.status(400).json({ error: 'Username/Phone and new role are required' });
    }

    if (!['USER', 'ADMIN', 'SUPER_ADMIN'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be USER, ADMIN, or SUPER_ADMIN' });
    }

    // Find user by username or phone
    const user = await User.findOne({
      $or: [
        { username: usernameOrPhone },
        { phone: usernameOrPhone }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = user.role;
    user.role = newRole;
    await user.save();

    console.log(`✅ Updated user ${user.username} (${user._id}) role from ${oldRole} to ${newRole}`);

    res.json({
      success: true,
      message: `User ${user.username} role updated from ${oldRole} to ${newRole}`,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user role' });
  }
});

// --- ADMIN ROUTES (Continued) ---

// DELETE: Admin - Delete specific user
app.delete('/api/admin/user/:userId', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-delete-user');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const userToDelete = await User.findById(userId);

    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent superadmin from deleting themselves
    if (userToDelete._id.toString() === adminUser._id.toString()) {
      return res.status(403).json({ error: 'Cannot delete your own Super Admin account.' });
    }

    // Prevent superadmin from deleting another superadmin
    if (userToDelete.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete another Super Admin account.' });
    }

    await User.deleteOne({ _id: userId });
    console.log(`🗑️ Super Admin ${adminUser.username} deleted user ${userToDelete.username} (${userId})`);
    res.json({ success: true, message: `User ${userToDelete.username} deleted successfully.` });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete user.' });
  }
});

// DELETE: Admin - Delete specific financial request
app.delete('/api/admin/financial-request/:requestId', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-delete-financial-request');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    const deletedRequest = await FinancialRequest.findByIdAndDelete(requestId);

    if (!deletedRequest) {
      return res.status(404).json({ error: 'Financial request not found' });
    }

    console.log(`🗑️ Super Admin ${adminUser.username} deleted financial request ${requestId} (Type: ${deletedRequest.type}, Amount: ${deletedRequest.amount})`);
    res.json({ success: true, message: `Financial request ${requestId} deleted successfully.` });

  } catch (error) {
    console.error('Delete financial request error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete financial request.' });
  }
});

// DELETE: Admin - Delete specific revenue entry
app.delete('/api/admin/revenue/:revenueId', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-delete-revenue');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { revenueId } = req.params;
    if (!revenueId) {
      return res.status(400).json({ error: 'Revenue ID is required' });
    }

    const deletedRevenue = await Revenue.findByIdAndDelete(revenueId);

    if (!deletedRevenue) {
      return res.status(404).json({ error: 'Revenue entry not found' });
    }

    console.log(`🗑️ Super Admin ${adminUser.username} deleted revenue entry ${revenueId} (Amount: ${deletedRevenue.amount}, Game ID: ${deletedRevenue.gameId})`);
    res.json({ success: true, message: `Revenue entry ${revenueId} deleted successfully.` });

  } catch (error) {
    console.error('Delete revenue error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete revenue entry.' });
  }
});

// DELETE: Admin - Delete specific revenue withdrawal entry
app.delete('/api/admin/withdrawal/:withdrawalId', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-delete-withdrawal');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { withdrawalId } = req.params;
    if (!withdrawalId) {
      return res.status(400).json({ error: 'Withdrawal ID is required' });
    }

    const deletedWithdrawal = await RevenueWithdrawal.findByIdAndDelete(withdrawalId);

    if (!deletedWithdrawal) {
      return res.status(404).json({ error: 'Withdrawal entry not found' });
    }

    console.log(`🗑️ Super Admin ${adminUser.username} deleted withdrawal entry ${withdrawalId} (Amount: ${deletedWithdrawal.amount})`);
    res.json({ success: true, message: `Withdrawal entry ${withdrawalId} deleted successfully.` });

  } catch (error) {
    console.error('Delete withdrawal error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete withdrawal entry.' });
  }
});

// GET: Get all users (for Super Admin)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    // Smart user lookup with duplicate handling
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-users');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    // Log for debugging
    console.log(`🔍 Admin access check:`, {
      userId: req.user.userId,
      username: req.user.username,
      tokenRole: req.user.role,
      dbRole: adminUser?.role,
      userFound: !!adminUser
    });

    // Check database role (source of truth) - if user was promoted after login, this will work
    if (!adminUser) {
      console.log(`❌ User not found in database: userId=${req.user.userId}, username=${req.user.username}`);
      return res.status(404).json({
        error: 'User not found in database',
        details: 'Please log out and log back in to refresh your session.'
      });
    }

    if (adminUser.role !== 'SUPER_ADMIN') {
      console.log(`❌ Access denied: User ${adminUser.username} (${adminUser._id}) has role ${adminUser.role}, not SUPER_ADMIN`);
      return res.status(403).json({
        error: 'Access denied. Super Admin role required.',
        currentRole: adminUser.role,
        userId: adminUser._id,
        username: adminUser.username,
        message: 'Your account role is ' + adminUser.role + '. Please contact an administrator or log out and log back in if you were recently promoted.'
      });
    }

    console.log(`✅ Access granted: User ${adminUser.username} (${adminUser._id}) is SUPER_ADMIN`);

    const users = await User.find({})
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        _id: user._id,
        username: user.username,
        phone: user.phone,
        email: user.email,
        role: user.role,
        balance: user.balance,
        reservedBalance: user.reservedBalance,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// POST: Admin - Update user balance (DEPOSIT or WITHDRAWAL)
app.post('/api/admin/users/:id/balance', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-update-balance');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { id: targetUserId } = req.params;
    const { amount, type, comment } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (!['deposit', 'withdrawal'].includes(type?.toLowerCase())) {
      return res.status(400).json({ error: 'Type must be deposit or withdrawal' });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const amountNum = parseFloat(amount);

    if (type.toLowerCase() === 'deposit') {
      targetUser.balance += amountNum;
      targetUser.transactions.push({
        type: 'admin_deposit',
        amount: amountNum,
        description: comment || `Admin deposit by ${adminUser.username}`,
        timestamp: new Date()
      });
      console.log(`✅ Admin ${adminUser.username} deposited $${amountNum} to ${targetUser.username}`);
    } else {
      if (targetUser.balance < amountNum) {
        return res.status(400).json({ error: 'Insufficient user balance for withdrawal' });
      }
      targetUser.balance -= amountNum;
      targetUser.transactions.push({
        type: 'admin_withdrawal',
        amount: -amountNum,
        description: comment || `Admin withdrawal by ${adminUser.username}`,
        timestamp: new Date()
      });
      console.log(`✅ Admin ${adminUser.username} withdrew $${amountNum} from ${targetUser.username}`);
    }

    await targetUser.save();

    res.json({
      success: true,
      message: `Balance updated successfully`,
      newBalance: targetUser.balance,
      user: {
        phone: targetUser.phone
      }
    });

  } catch (error) {
    console.error('Admin balance update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update balance' });
  }
});

// GET: Visitor Analytics for SuperAdmin Dashboard
app.get('/api/admin/visitor-analytics', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-visitor-analytics');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    // Get all visitors from last 48 hours (TTL handles cleanup)
    // Get latest visitors (limit 500 for performance)
    const visitors = await VisitorAnalytics.find({})
      .sort({ lastActivity: -1 })
      .limit(500);

    const totalVisitors = visitors.length;
    const authenticatedVisitors = visitors.filter(v => v.isAuthenticated).length;
    const anonymousVisitors = totalVisitors - authenticatedVisitors;
    const returningVisitors = visitors.filter(v => v.isReturning).length;

    // Top visitors by page views
    const topVisitors = visitors
      .filter(v => v.isAuthenticated)
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 10)
      .map(v => ({
        username: v.username,
        userId: v.userId,
        pageViews: v.pageViews,
        lastActivity: v.lastActivity,
        isReturning: v.isReturning
      }));

    // Per-user visit frequency (group by userId)
    const userVisits = {};
    visitors.filter(v => v.userId).forEach(v => {
      const uid = v.userId.toString();
      if (!userVisits[uid]) {
        userVisits[uid] = {
          username: v.username,
          sessions: 0,
          totalPageViews: 0,
          lastVisit: v.lastActivity
        };
      }
      userVisits[uid].sessions += 1;
      userVisits[uid].totalPageViews += v.pageViews;
      if (new Date(v.lastActivity) > new Date(userVisits[uid].lastVisit)) {
        userVisits[uid].lastVisit = v.lastActivity;
      }
    });

    const perUserFrequency = Object.values(userVisits)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    res.json({
      success: true,
      analytics: {
        totalVisitors,
        authenticatedVisitors,
        anonymousVisitors,
        returningVisitors,
        topVisitors,
        perUserFrequency,
        timeWindow: '48 hours'
      }
    });

  } catch (error) {
    console.error('Visitor analytics error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch visitor analytics' });
  }
});

// Initialize cache for performance optimization
// const NodeCache = require('node-cache'); // Already required at top
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60 // Check for expired keys every 60 seconds
});

app.get('/api/users/leaderboard', async (req, res) => {
  try {
    // Fetch top 3 users sorted by wins (descending)
    // We use 'stats.gamesWon' as the primary sort key
    const topPlayers = await User.find({
      'stats.gamesWon': { $gt: 0 } // Only include players who have won at least one game
    })
      .sort({ 'stats.gamesWon': -1 })
      .limit(3)
      .select('username avatar stats.gamesWon'); // Select only necessary fields

    // Map to the format expected by the frontend
    const leaderboard = topPlayers.map(user => ({
      id: user._id,
      username: user.username,
      avatar: user.avatar, // Use database value, don't override with hardcoded URL
      wins: user.stats?.gamesWon || 0
    }));

    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, leaderboard: [], error: error.message });
  }
});

// POST: Rejoin an active game
app.post('/api/game/rejoin', async (req, res) => {
  try {
    const { gameId, userId, userName } = req.body;

    if (!gameId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Game ID and User ID are required'
      });
    }

    console.log(`🔄 Rejoin request: gameId=${gameId}, userId=${userId}, userName=${userName}`);

    // Find the game
    const game = await Game.findOne({ gameId });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    if (game.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: `Game is ${game.status}, cannot rejoin`
      });
    }

    // Find the player in the game
    const playerIndex = game.players.findIndex(p => p.userId === userId);

    if (playerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    const player = game.players[playerIndex];

    // Check if player already won
    if (game.winners.includes(player.color)) {
      return res.json({
        success: true,
        gameId: game.gameId,
        playerColor: player.color,
        allPawnsHome: true,
        canRejoin: false,
        message: 'You have already won this game'
      });
    }

    // Update player's username if provided (for display sync)
    if (userName && player.username !== userName) {
      player.username = userName;
      await game.save();
      console.log(`✅ Updated username for player ${player.color} to ${userName}`);
    }

    console.log(`✅ Rejoin successful for user ${userId} as ${player.color} in game ${gameId}`);

    res.json({
      success: true,
      gameId: game.gameId,
      playerColor: player.color,
      allPawnsHome: false,
      canRejoin: true,
      message: 'Rejoin successful - reconnect via socket'
    });
  } catch (error) {
    console.error('Error rejoining game:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to rejoin game'
    });
  }
});

// GET: Admin - Get Revenue Stats
app.get('/api/admin/revenue', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-revenue');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get filter parameter from query string
    const filter = req.query.filter || 'all'; // all, today, yesterday, thisWeek, last15Days, last30Days

    // Calculate date range based on filter
    let startDate = null;
    let endDate = null;
    const now = new Date();

    switch (filter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
        startDate = new Date(now.getFullYear(), now.getMonth(), diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        break;
      case 'last15Days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 15);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        break;
      case 'last30Days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        break;
      default:
        startDate = null; // All time
        endDate = null;
    }

    // Build query
    let query = {};
    if (startDate && endDate) {
      query.timestamp = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query.timestamp = { $gte: startDate };
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalRevenues = await Revenue.countDocuments(query);
    const totalPages = Math.ceil(totalRevenues / limit);

    const revenues = await Revenue.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    // Enrich revenues with game details
    const enrichedRevenues = await Promise.all(revenues.map(async (rev) => {
      let playersInfo = [];
      let winnerInfo = null;
      let stake = 0;

      // FIX: Prioritize existing gameDetails if available (valid for newer records)
      // Since Games are deleted after completion, looking them up often returns null.
      if (rev.gameDetails && rev.gameDetails.players && rev.gameDetails.players.length > 0) {
        playersInfo = rev.gameDetails.players;
        winnerInfo = rev.gameDetails.winner;
        stake = rev.gameDetails.stake || 0;
      } else {
        // Fallback: Try to find Game (legacy support or if details missing)
        let game = null;
        try {
          game = await Game.findOne({ gameId: rev.gameId });
        } catch (e) { /* ignore error */ }

        if (game) {
          playersInfo = game.players.map(p => ({
            userId: p.userId,
            username: p.username,
            color: p.color
          }));
          const w = game.players.find(p => p.userId === rev.winnerId || p.color === game.winners?.[0]);
          if (w) {
            winnerInfo = {
              userId: rev.winnerId,
              username: w.username || w.userId,
              color: w.color
            };
          }
          stake = game.stake;
        } else {
          // Second Fallback: Try to look up User names directly if we have IDs in the revenue record (unlikely if not in gameDetails, but good for robustness)
          // For now, if no game details, we just return basic info preventing crash
          winnerInfo = { userId: rev.winnerId, username: 'Unknown (Purged)', color: 'gray' };
          // Use placeholders
          playersInfo = [{ username: 'Details Purged', color: 'gray' }];
        }
      }

      return {
        _id: rev._id,
        gameId: rev.gameId,
        amount: rev.amount,
        totalPot: rev.totalPot,
        winnerId: rev.winnerId,
        timestamp: rev.timestamp,
        reason: rev.reason,
        gameDetails: {
          players: playersInfo,
          winner: winnerInfo,
          stake: stake || (rev.totalPot / 2),
          gameId: rev.gameId
        }
      };

    }));

    const withdrawals = await RevenueWithdrawal.find(query).sort({ timestamp: -1 });

    const totalRevenue = await Revenue.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRevenueAmount = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    const totalWithdrawnAmount = withdrawals.reduce((sum, wd) => sum + wd.amount, 0);
    const netRevenue = totalRevenueAmount - totalWithdrawnAmount;

    res.json({
      success: true,
      totalRevenue: totalRevenueAmount,
      totalWithdrawn: totalWithdrawnAmount,
      netRevenue,
      history: enrichedRevenues, // <--- Send the enriched revenues
      withdrawals: withdrawals,
      filter: filter,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalRevenues,
        limit: limit
      }
    });
  } catch (e) {
    console.error("Revenue Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST: Admin - Withdraw Revenue
app.post('/api/admin/revenue/withdraw', authenticateToken, async (req, res) => {
  try {
    console.log('💸 Withdrawal request received:', req.body);
    const { amount, destination, reference } = req.body;

    // 1. Authorization Check
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-withdraw');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    // 2. Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!destination) {
      return res.status(400).json({ error: "Destination required" });
    }

    // 3. Check Balance (Calculate Net Revenue)
    const revenues = await Revenue.find({});
    const withdrawals = await RevenueWithdrawal.find({});

    const totalRevenue = revenues.reduce((sum, rev) => sum + rev.amount, 0);
    const totalWithdrawn = withdrawals.reduce((sum, wd) => sum + wd.amount, 0);
    const netRevenue = totalRevenue - totalWithdrawn;

    if (amount > netRevenue) {
      return res.status(400).json({ error: `Insufficient funds. Available: $${netRevenue.toFixed(2)}` });
    }

    // 4. Process Withdrawal
    const withdrawal = new RevenueWithdrawal({
      amount,
      destination,
      reference: reference || `Withdrawal by ${adminUser.username}`,
      adminId: adminUser._id,
      adminName: adminUser.username
    });

    await withdrawal.save();
    console.log(`💸 Revenue withdrawal: $${amount} by ${adminUser.username}`);

    res.json({
      success: true,
      message: "Withdrawal successful",
      withdrawal
    });

  } catch (e) {
    console.error("Withdrawal Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST: Admin - Directly update user balance (Deposit/Withdrawal by Super Admin)
app.post('/api/admin/user/balance-update', authenticateToken, async (req, res) => {
  try {
    const { userId, amount, type, comment } = req.body;

    // 1. Authorization Check (Super Admin only)
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-direct-balance-update');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied. Super Admin role required." });
    }

    // 2. Input Validation
    // Convert type to uppercase for consistent validation
    const normalizedType = type?.toUpperCase();

    if (!userId || !amount || amount <= 0 || !normalizedType || !['DEPOSIT', 'WITHDRAWAL'].includes(normalizedType)) {
      return res.status(400).json({ error: 'User ID, valid amount, and type (DEPOSIT/WITHDRAWAL) are required.' });
    }

    // 3. Find User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let newBalance = user.balance;
    let transactionType = '';
    let transactionDescription = '';

    if (normalizedType === 'DEPOSIT') {
      newBalance += amount;
      transactionType = 'deposit';
      transactionDescription = comment || `Admin deposit by ${adminUser.username}`;
    } else { // WITHDRAWAL
      if (user.balance < amount) {
        return res.status(400).json({ error: `Insufficient funds. User balance: $${user.balance}, requested withdrawal: $${amount}.` });
      }
      newBalance -= amount;
      transactionType = 'withdrawal';
      transactionDescription = comment || `Admin withdrawal by ${adminUser.username}`;
    }

    // 4. Update User Balance and Log Transaction
    user.balance = newBalance;
    user.transactions.push({
      type: transactionType,
      amount: type === 'DEPOSIT' ? amount : -amount, // Store withdrawals as negative amounts
      matchId: null, // No game associated
      description: transactionDescription,
      timestamp: new Date()
    });
    await user.save();

    console.log(`💰 Super Admin ${adminUser.username} performed ${normalizedType} of $${amount} for user ${user.username} (ID: ${user._id}). New balance: $${user.balance}`);

    res.json({
      success: true,
      message: `User ${user.username}'s balance updated successfully (${normalizedType}: $${amount}). New balance: $${user.balance}.`,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance
      }
    });

  } catch (e) {
    console.error('Error during admin direct balance update:', e);
    res.status(500).json({ error: e.message || 'Failed to update user balance directly.' });
  }
});

// GET: Admin - Get Active Games
app.get('/api/admin/games/active', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-active-games');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    const activeGames = await Game.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
    res.json({ success: true, games: activeGames });
  } catch (e) {
    console.error("Active Games Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST: Admin - Force players to be able to rejoin (invite them)
app.post('/api/admin/games/force-rejoin/:gameId', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-force-rejoin');
    const adminUser = lookupResult.success ? lookupResult.user : null;
    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { gameId } = req.params;
    if (!gameId) return res.status(400).json({ error: 'Game ID required' });

    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Mark players as rejoin-invited by clearing disconnected flags so checkActiveGame will show them
    let changed = false;
    game.players.forEach(player => {
      if (!player.isAI && player.isDisconnected) {
        player.isDisconnected = false;
        changed = true;
      }
    });

    // Add a short admin message
    game.message = (game.message || '') + ' | Admin invited players to rejoin';
    if (changed) await game.save();

    const plainState = game.toObject ? game.toObject() : game;

    // Emit state update to the game room so connected clients refresh
    if (global.io || io) {
      (global.io || io).to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
    }

    // Emit FORCE_REJOIN_INVITE to each player's personal user room
    // This ensures disconnected players receive the notification even if not in the game room
    const ioInstance = global.io || io;
    if (ioInstance) {
      for (const player of game.players) {
        if (!player.isAI && player.userId) {
          const userRoom = `user_${player.userId}`;
          console.log(`📢 Sending FORCE_REJOIN_INVITE to user room: ${userRoom} for game ${gameId}`);
          ioInstance.to(userRoom).emit('FORCE_REJOIN_INVITE', {
            gameId: game.gameId,
            playerColor: player.color,
            message: 'Admin invited you to rejoin the game. Refreshing...'
          });
        }
      }
    }

    res.json({ success: true, game: plainState });
  } catch (e) {
    console.error('Force rejoin error:', e);
    res.status(500).json({ error: e.message || 'Failed to force rejoin' });
  }
});

// POST: Admin - Cancel and Refund an Active Game
app.post('/api/admin/games/:gameId/refund', authenticateToken, async (req, res) => {
  try {
    // 1. Authorization Check (Super Admin only)
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-refund-game');
    const adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { gameId } = req.params;
    if (!gameId) {
      return res.status(400).json({ error: 'Game ID is required' });
    }

    // 2. Find the Game
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // 3. Validate Game Status
    if (game.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Game is not ACTIVE (current status: ${game.status}). Cannot refund.` });
    }

    const stake = game.stake || 0;
    if (stake <= 0) {
      return res.status(400).json({ error: 'Game has no stake to refund.' });
    }

    // 4. Process Refunds for all human players
    for (const player of game.players) {
      if (player.userId && !player.isAI) {
        const user = await User.findById(player.userId);
        if (user) {
          // Move stake from reserved back to main balance
          user.balance += stake;
          user.reservedBalance = Math.max(0, user.reservedBalance - stake);

          // Add a clear transaction log
          user.transactions.push({
            type: 'game_refund',
            amount: stake,
            matchId: game.gameId,
            description: `Refund for game ${game.gameId} cancelled by admin`
          });
          await user.save();
          console.log(`💰 Refunded $${stake} to ${user.username} for cancelled game ${game.gameId}`);
        }
      }
    }

    // 5. Update Game Status to CANCELLED
    game.status = 'CANCELLED';
    game.message = `Game cancelled by administrator. Stakes have been refunded.`;
    await game.save();

    // 6. Notify players in real-time
    io.to(gameId).emit('ERROR', { message: 'Game was cancelled by an administrator. Your stake has been refunded.' });

    res.json({ success: true, message: `Game ${gameId} has been cancelled and stakes refunded.` });
  } catch (error) {
    console.error('Admin refund game error:', error);
    res.status(500).json({ error: error.message || 'Failed to refund game.' });
  }
});

// DELETE: Admin - Remove specific game
app.delete('/api/admin/matches/:gameId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { gameId } = req.params;
    console.log(`🗑️ Super Admin deleting game ${gameId}`);

    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });

    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Refund if active/waiting
    if (game.status === 'ACTIVE' || game.status === 'WAITING') {
      for (const player of game.players) {
        if (player.userId && !player.isAI) {
          const user = await User.findById(player.userId);
          if (user) {
            user.balance += (game.stake || 0);
            await user.save();
            console.log(`💰 Refunded ${game.stake} to ${user.username} due to admin deletion`);
          }
        }
      }
    }

    await Game.deleteOne({ gameId });
    // Notify players if io is available (it is globally in this file)
    if (global.io || io) {
      (global.io || io).to(gameId).emit('ERROR', { message: 'Game was cancelled by administrator' });
    }

    res.json({ message: 'Game removed successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Admin - DELETE ALL ACTIVE GAMES ONLY
app.post('/api/admin/games/delete-active', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-delete-active-games');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    console.log(`🗑️ Admin ${adminUser.username} deleting all active games...`);
    const activeResult = await Game.deleteMany({ status: 'ACTIVE' });

    // Also clear matchmaking queue in memory
    matchmakingQueue.clear();

    console.log(`✅ Deleted ${activeResult.deletedCount} active games.`);

    res.json({
      success: true,
      message: `Deleted ${activeResult.deletedCount} active games.`,
      deleted: {
        active: activeResult.deletedCount
      }
    });
  } catch (e) {
    console.error("Delete Active Games Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST: Admin - DELETE ALL GAMES (Cleanup)
app.post('/api/admin/games/cleanup', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-cleanup-games');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    console.log(`🗑️ Admin ${adminUser.username} initiating global game cleanup...`);
    const activeResult = await Game.deleteMany({ status: 'ACTIVE' });
    const waitingResult = await Game.deleteMany({ status: 'WAITING' });

    // Also clear matchmaking queue in memory
    matchmakingQueue.clear();

    console.log(`✅ Cleanup complete: Deleted ${activeResult.deletedCount} active and ${waitingResult.deletedCount} waiting games.`);

    res.json({
      success: true,
      message: `Deleted ${activeResult.deletedCount} active and ${waitingResult.deletedCount} waiting games.`,
      deleted: {
        active: activeResult.deletedCount,
        waiting: waitingResult.deletedCount
      }
    });
  } catch (e) {
    console.error("Cleanup Games Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET: Admin - Get User Details with History
app.get('/api/admin/user/:userId/details', authenticateToken, async (req, res) => {
  try {
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-user-details');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: "Access denied" });
    }

    const { userId } = req.params;
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find completed games where this user participated
    // Accept either string or ObjectId forms for player.userId to avoid mismatches
    const mongoose = require('mongoose');
    let userObjectId = null;
    try {
      userObjectId = mongoose.Types.ObjectId(userId);
    } catch (err) {
      // invalid ObjectId, ignore
      userObjectId = null;
    }

    const matchQuery = {
      status: 'COMPLETED',
      $or: [
        { 'players.userId': userId }
      ]
    };
    if (userObjectId) {
      matchQuery.$or.push({ 'players.userId': userObjectId });
    }

    console.log('🔎 Admin user-details matchQuery:', JSON.stringify(matchQuery));
    const matchHistory = await Game.find(matchQuery).sort({ updatedAt: -1 }).limit(50);
    console.log(`🔎 Found ${matchHistory.length} completed games for user ${userId}`);
    if (matchHistory.length > 0) {
      try {
        console.log('🔎 Sample game players for first matched game:', matchHistory[0].players);
      } catch (err) {
        // ignore serialization issues
      }
    }

    // Format history
    const history = matchHistory.map(game => {
      // Find this user's player record in the game
      // FIX loose equality or string casting to ensure match
      const userPlayer = game.players.find(p => String(p.userId) === String(userId));

      if (!userPlayer) {
        console.warn(`⚠️ History mismatch: User ${userId} found in Game query but not in players array for game ${game.gameId}`);
        return null; // Skip if player not found
      }

      // Check if this user's color is in the winners array
      const isWinner = game.winners && game.winners.includes(userPlayer.color);

      // Find the opponent (the other player in the game)
      const opponent = game.players.find(p => p.userId !== userId);

      // Calculate amount won/lost
      // If winner: Won (Pot - Commission) which is stake * 2 * 0.9 = stake * 1.8
      // But user also gets their stake back, so net win is stake * 0.8
      // If loser: Lost their stake
      let amount = 0;
      if (isWinner) {
        // Winner gets 90% of pot (stake * 2 * 0.9) - stake = stake * 0.8
        // User requested to show NET PROFIT (e.g. 0.20) rather than Total Payout (0.45)
        amount = (game.stake || 0) * 0.8;
      } else {
        // Loser loses their stake
        amount = -(game.stake || 0);
      }

      return {
        gameId: game.gameId,
        date: game.updatedAt || game.createdAt,
        opponentName: opponent?.username || opponent?.color || 'Unknown',
        result: isWinner ? 'WON' : 'LOST',
        amount: amount,
        stake: game.stake || 0
      };
    }).filter(h => h !== null); // Remove null entries

    res.json({
      success: true,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        stats: targetUser.stats,
        balance: targetUser.balance
      },
      history,
      transactions: targetUser.transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });

  } catch (e) {
    console.error("User Details Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- WALLET & PAYMENT ROUTES ---

// GET: User - Get My Requests
app.get('/api/wallet/my-requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const requests = await FinancialRequest.find({ userId }).sort({ timestamp: -1 });
    res.json({ success: true, requests });
  } catch (e) {
    console.error("Get My Requests Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST: User - Create a Request
app.post('/api/wallet/request', authenticateToken, async (req, res) => {
  // Use userId from token (more secure) or fallback to body
  const userId = req.user?.userId || req.body.userId;
  const { userName, type, amount, details, paymentMethod } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (type === 'DEPOSIT' && amount > 300) return res.status(400).json({ error: "Maximum deposit is $300" });

    // Smart user sync: Ensure user exists and prevent duplicate creation
    const syncResult = await smartUserSync(userId, userName, 'wallet-request');
    if (!syncResult.success) {
      return res.status(500).json({ error: "Failed to sync user account. Please try again." });
    }

    let user = syncResult.user;

    // Check for pending requests
    const pendingRequest = await FinancialRequest.findOne({
      userId: user._id,
      status: 'PENDING'
    });

    if (pendingRequest) {
      // Build a friendly Somali message including the user's first name when available
      const rawName = (user && (user.username || user.userName)) || userName || '';
      const firstName = rawName ? String(rawName).trim().split(/\s+/)[0] : '';
      const displayName = firstName || 'Saaxiib';
      const phone = '0610251014';
      const message = `Waanka xunnahay ${displayName} horey ayaad dalab u gudbisay, fadlan la xariir ${phone} si laguugu xaqiijiyo mahadsanid`;
      return res.status(400).json({ error: message });
    }

    if (type === 'WITHDRAWAL') {
      if (user.balance < amount) {
        return res.status(400).json({ error: "Insufficient funds" });
      }
      // Check for withdrawal limit (1 per 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // Temporarily disabled: 24-hour withdrawal restriction
      // const recentWithdrawal = await FinancialRequest.findOne({
      //     userId: user._id,
      //     type: 'WITHDRAWAL',
      //     timestamp: { $gt: oneDayAgo }
      // });

      // if (recentWithdrawal) {
      //     return res.status(400).json({ error: "You can only make one withdrawal request every 24 hours." });
      // }
    } else if (type === 'DEPOSIT') {
      // Check if deposit would exceed max balance
      if (user.balance + amount > 300) {
        return res.status(400).json({ error: `Maximum wallet balance is $300. Your current balance is $${user.balance}. Max deposit allowed is $${300 - user.balance}.` });
      }
    }

    // Calculate shortId
    const lastRequest = await FinancialRequest.findOne().sort({ shortId: -1 });
    const nextShortId = (lastRequest && lastRequest.shortId) ? lastRequest.shortId + 1 : 1;

    const newRequest = new FinancialRequest({
      userId: user._id,
      userName: user.username,
      shortId: nextShortId,
      type,
      amount,
      details,
      paymentMethod,
      status: 'PENDING'
    });
    await newRequest.save();

    // Verify the request was saved by fetching it back
    const savedRequest = await FinancialRequest.findById(newRequest._id);
    if (!savedRequest) {
      console.error(`❌ CRITICAL: Request ${newRequest._id} was not saved to database!`);
      return res.status(500).json({ error: "Failed to save request to database" });
    }

    // Log the request creation for admin visibility
    console.log(`💰 New ${type} request created and verified:`, {
      requestId: newRequest._id.toString(),
      userId: user._id,
      userName: user.username,
      amount: amount,
      status: savedRequest.status,
      paymentMethod: savedRequest.paymentMethod,
      timestamp: savedRequest.timestamp,
      savedToDB: !!savedRequest
    });

    res.json({
      success: true,
      message: "Request submitted for admin approval",
      request: {
        id: newRequest._id.toString(),
        _id: newRequest._id.toString(),
        shortId: newRequest.shortId,
        userId: newRequest.userId,
        userName: newRequest.userName,
        type: newRequest.type,
        amount: newRequest.amount,
        status: newRequest.status,
        details: newRequest.details || '',
        paymentMethod: newRequest.paymentMethod || '',
        timestamp: newRequest.timestamp ? new Date(newRequest.timestamp).toISOString() : new Date().toISOString()
      }
    });
  } catch (e) {
    console.error("Wallet Request Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET: Admin - Get All Requests
app.get('/api/admin/wallet/requests', authenticateToken, async (req, res) => {
  try {
    // Debug: Log token information
    console.log(`🔍 Admin wallet request - Token user info:`, {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role
    });

    // Verify admin role - try multiple lookup methods
    // The token contains: { userId, username, role }
    // But userId might not match if user logged in with phone number
    let user = await User.findById(req.user.userId);

    // If not found by ID, try by username
    if (!user && req.user.username) {
      console.log(`⚠️ User not found by ID ${req.user.userId}, trying username: ${req.user.username}`);
      user = await User.findOne({ username: req.user.username });
    }

    // If still not found, try by phone (in case user logged in with phone number)
    if (!user) {
      // Try to find by phone if username looks like a phone number
      const possiblePhone = req.user.username || req.user.userId;
      if (possiblePhone && /^\d+$/.test(possiblePhone)) {
        console.log(`⚠️ User not found by ID/username, trying phone: ${possiblePhone}`);
        user = await User.findOne({
          $or: [
            { phone: possiblePhone },
            { username: possiblePhone }
          ]
        });
      }
    }

    // Last resort: search by any matching field
    if (!user) {
      console.log(`⚠️ Trying comprehensive search for user...`);
      const searchTerm = req.user.userId || req.user.username;
      if (searchTerm) {
        user = await User.findOne({
          $or: [
            { _id: searchTerm },
            { username: searchTerm },
            { phone: searchTerm }
          ]
        });
      }
    }

    if (!user) {
      console.error(`❌ Admin request: User not found in database after all lookup attempts`, {
        tokenUserId: req.user.userId,
        tokenUsername: req.user.username,
        tokenRole: req.user.role
      });

      return res.status(404).json({
        error: "User not found in database. Please log out and log back in.",
        details: `Token userId: ${req.user.userId}, username: ${req.user.username}`,
        suggestion: "If you logged in with phone number, try logging out and logging back in."
      });
    }

    console.log(`✅ User found in database:`, {
      _id: user._id,
      username: user.username,
      role: user.role,
      status: user.status
    });

    // ALLOW ADMIN OR SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      console.error(`❌ Admin request DENIED: User ${user.username} (${user._id}) has role "${user.role}", not SUPER_ADMIN/ADMIN`);
      return res.status(403).json({
        error: "Access denied. Admin or Super Admin only.",
        currentRole: user.role,
        userId: user._id,
        username: user.username,
        tokenRole: req.user.role,
        message: `Your account role is "${user.role}". To access admin features, your role must be "ADMIN" or "SUPER_ADMIN".`
      });
    }

    console.log(`📊 Admin ${user.username} (${user._id}) fetching wallet requests...`);

    // Fetch all requests without any filters
    const requests = await FinancialRequest.find().sort({ timestamp: -1 });
    console.log(`📦 Found ${requests.length} total requests in database`);

    if (requests.length > 0) {
      console.log(`📋 Sample request:`, {
        id: requests[0]._id,
        userId: requests[0].userId,
        userName: requests[0].userName,
        type: requests[0].type,
        amount: requests[0].amount,
        status: requests[0].status,
        timestamp: requests[0].timestamp
      });
    }

    // Format requests to include both id and _id for frontend compatibility
    const formattedRequests = requests.map(req => ({
      id: req._id.toString(),
      _id: req._id.toString(),
      shortId: req.shortId,
      userId: req.userId,
      userName: req.userName,
      type: req.type,
      amount: req.amount,
      status: req.status,
      details: req.details || '',
      paymentMethod: req.paymentMethod || '',
      timestamp: req.timestamp ? new Date(req.timestamp).toISOString() : new Date().toISOString(),
      adminComment: req.adminComment || '',
      processedBy: req.processedBy || ''
    }));

    const pendingCount = formattedRequests.filter(r => r.status === 'PENDING').length;
    console.log(`✅ Admin ${user.username} fetched ${formattedRequests.length} wallet requests (${pendingCount} pending)`);

    res.json({ success: true, requests: formattedRequests });
  } catch (e) {
    console.error("❌ Get Wallet Requests Error:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// GET: Diagnostic endpoint to check current user status
app.get('/api/admin/check-status', authenticateToken, async (req, res) => {
  try {
    // Smart user lookup for status check
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-check-status');
    let user = lookupResult.success ? lookupResult.user : null;

    if (!user) {
      return res.json({
        found: false,
        token: {
          userId: req.user.userId,
          username: req.user.username,
          role: req.user.role
        },
        message: "User not found in database"
      });
    }

    return res.json({
      found: true,
      token: {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role
      },
      database: {
        _id: user._id,
        username: user.username,
        phone: user.phone,
        role: user.role,
        status: user.status
      },
      match: req.user.userId === user._id.toString(),
      isSuperAdmin: user.role === 'SUPER_ADMIN',
      isAdmin: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    });
  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Admin - Process Request
app.post('/api/admin/wallet/request/:id', authenticateToken, async (req, res) => {
  try {
    // Smart admin user lookup
    const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-process-request');
    let adminUser = lookupResult.success ? lookupResult.user : null;

    if (!adminUser || (adminUser.role !== 'SUPER_ADMIN' && adminUser.role !== 'ADMIN')) {
      return res.status(403).json({
        error: "Access denied. Admin or Super Admin only.",
        found: !!adminUser,
        role: adminUser?.role
      });
    }

    const { id } = req.params;
    const { action, adminComment } = req.body; // action: 'APPROVE' | 'REJECT'

    const request = await FinancialRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: "Request is already processed" });
    }

    const user = await User.findById(request.userId);
    if (!user) {
      return res.status(404).json({ error: "User associated with this request not found" });
    }

    if (action === 'APPROVE') {
      if (request.type === 'DEPOSIT') {
        // Double check max balance limit before final approval
        if (user.balance + request.amount > 300) {
          request.status = 'REJECTED';
          request.adminComment = "Rejected: Deposit would exceed maximum wallet balance of $300";
          await request.save();
          return res.json({ success: true, message: "Request rejected (Balance limit exceeded)", request });
        }

        user.balance += request.amount;
        request.status = 'APPROVED';
        request.adminComment = adminComment || "Approved by admin";
      } else if (request.type === 'WITHDRAWAL') {
        if (user.balance >= request.amount) {
          user.balance -= request.amount;
          request.status = 'APPROVED';
          request.adminComment = adminComment || "Approved by admin";
        } else {
          request.status = 'REJECTED';
          request.adminComment = "Insufficient funds at approval time";
        }
      }
      await user.save();
    } else {
      request.status = 'REJECTED';
      request.adminComment = adminComment || "Rejected by admin";
    }

    // Save the admin ID who processed the request
    request.processedBy = adminUser._id.toString();
    await request.save();

    // Format the request for frontend compatibility
    const formattedRequest = {
      id: request._id.toString(),
      _id: request._id.toString(),
      userId: request.userId,
      userName: request.userName,
      type: request.type,
      amount: request.amount,
      status: request.status,
      details: request.details || '',
      timestamp: request.timestamp ? new Date(request.timestamp).toISOString() : new Date().toISOString(),
      adminComment: request.adminComment || '',
      processedBy: request.processedBy || ''
    };

    // Send real-time notification to user via Socket.IO
    const userRoom = `user_${request.userId}`;
    const notificationData = {
      type: request.type,
      action: request.status,
      amount: request.amount,
      message: request.status === 'APPROVED'
        ? `Your ${request.type.toLowerCase()} of $${request.amount.toFixed(2)} has been approved`
        : `Your ${request.type.toLowerCase()} request has been rejected: ${request.adminComment || 'No reason provided'}`
    };

    io.to(userRoom).emit('financial_request_update', notificationData);

    // Send Web Push notification
    console.log(`🔔 [PUSH DEBUG] Preparing push notification for user ${request.userId} (${user.username})`);
    console.log(`🔔 [PUSH DEBUG] Request type: ${request.type}, Status: ${request.status}, Amount: $${request.amount}`);

    const pushPayload = {
      title: request.status === 'APPROVED'
        ? `✅ ${request.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} Approved`
        : `❌ ${request.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} Rejected`,
      body: request.status === 'APPROVED'
        ? `Your ${request.type.toLowerCase()} of $${request.amount.toFixed(2)} has been approved. ${request.type === 'DEPOSIT' ? 'Funds added to your wallet.' : 'Funds sent to your account.'}`
        : `Your ${request.type.toLowerCase()} of $${request.amount.toFixed(2)} was rejected. ${request.adminComment || 'No reason provided.'}`,
      icon: '/icon-192x192.png',
      badge: '/badge-96x96.png',
      data: {
        type: 'financial_request',
        requestType: request.type,
        status: request.status,
        amount: request.amount,
        url: '/wallet'
      }
    };

    console.log(`🔔 [PUSH DEBUG] Push payload:`, JSON.stringify(pushPayload, null, 2));
    console.log(`🔔 [PUSH DEBUG] Calling sendPushNotificationToUser...`);

    // Send push notification (non-blocking)
    sendPushNotificationToUser(request.userId, pushPayload)
      .then(result => {
        console.log(`🔔 [PUSH DEBUG] Push notification result:`, result);
      })
      .catch(error => {
        console.error('🔔 [PUSH DEBUG] Push notification error:', error);
      });

    res.json({
      success: true,
      message: `Request ${action}D`,
      request: formattedRequest,
      user: {
        // Only include phone if it's a valid number and NOT auto-generated
        // This prevents "auto_..." IDs or usernames from appearing in the Phone field
        phone: (user.phone && !user.phone.startsWith('auto_') && /^\+?[\d\s-]+$/.test(user.phone)) ? user.phone : null
      }
    });
  } catch (e) {
    console.error("Process Request Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- MATCH REQUEST SYSTEM (Replaces automatic matchmaking) ---
const activeMatchRequests = new Map(); // requestId -> { userId, userName, stake, timestamp, socketId, expiresAt }
const requestTimers = new Map(); // requestId -> timeoutId
const usersStartingGame = new Set(); // Global lock for users currently entering a game (userId)
const pendingDisconnects = new Map(); // userId -> { timeoutId, gameId } - Graceful disconnect handling

// Clean up expired requests periodically
setInterval(() => {
  const now = Date.now();
  activeMatchRequests.forEach((request, requestId) => {
    if (now >= request.expiresAt) {
      console.log(`⏰ Match request ${requestId} expired`);
      // Notify creator
      const socket = io.sockets.sockets.get(request.socketId);
      if (socket) {
        socket.emit('match_request_expired', { requestId });
      }
      // Broadcast removal to everyone
      io.emit('match_request_removed', { requestId });

      // Cleanup
      activeMatchRequests.delete(requestId);
      const timer = requestTimers.get(requestId);
      if (timer) {
        clearTimeout(timer);
        requestTimers.delete(requestId);
      }
    }
  });
}, 5000); // Check every 5 seconds

// Helper function to create a match between two players
const createMatch = async (player1, player2, stake) => {
  const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();

  // Two-player game: First player = Green, Second player = Blue
  const hostColor = 'green';
  const guestColor = 'blue';

  console.log(`✅ Creating game ${gameId} for players: ${player1.userName || player1.userId} (Green) vs ${player2.userName || player2.userId} (Blue)`);

  // Check for global lock to prevent race conditions (double game creation)
  if (usersStartingGame.has(player1.userId) || usersStartingGame.has(player2.userId)) {
    console.warn(`🔒 Blocked duplicate game creation: One or both users are already starting a game. P1: ${player1.userId}, P2: ${player2.userId}`);
    return;
  }

  // Acquire locks
  usersStartingGame.add(player1.userId);
  usersStartingGame.add(player2.userId);

  try {
    // --- Reserve stake from both players ---
    const user1 = await User.findById(player1.userId);
    const user2 = await User.findById(player2.userId);

    if (!user1 || !user2) {
      console.error('❌ CRITICAL: One or both users not found in database for stake reservation.', { p1: player1.userId, p2: player2.userId });
      // Don't create the match
      return;
    }

    // Explicitly check for 0 balance if stake is involved
    if (stake > 0 && (user1.balance <= 0 || user2.balance <= 0)) {
      console.error('❌ Match failed: One or both players have a zero or negative balance for a staked game.');
      const socket1 = io.sockets.sockets.get(player1.socketId);
      const socket2 = io.sockets.sockets.get(player2.socketId);
      if (socket1) socket1.emit('ERROR', { message: 'Match failed: Your opponent has no balance.' });
      if (socket2) socket2.emit('ERROR', { message: 'Match failed: You have no balance to play a staked game.' });
      return;
    }

    // Check if both have enough balance
    if (user1.balance < stake || user2.balance < stake) {
      console.error('❌ CRITICAL: One or both users have insufficient funds at match creation.', {
        p1_bal: user1.balance,
        p2_bal: user2.balance,
        stake: stake
      });
      // Notify players of the error
      const socket1 = io.sockets.sockets.get(player1.socketId);
      const socket2 = io.sockets.sockets.get(player2.socketId);
      if (socket1) socket1.emit('ERROR', { message: 'Match failed: Insufficient funds.' });
      if (socket2) socket2.emit('ERROR', { message: 'Match failed: Insufficient funds.' });
      return;
    }

    // Reserve balance for Player 1
    user1.balance -= stake;
    user1.reservedBalance = (user1.reservedBalance || 0) + stake;
    user1.transactions.push({
      type: 'match_stake',
      amount: -stake,
      matchId: gameId,
      description: `Stake for game ${gameId}`
    });
    await user1.save();

    // Reserve balance for Player 2
    user2.balance -= stake;
    user2.reservedBalance = (user2.reservedBalance || 0) + stake;
    user2.transactions.push({
      type: 'match_stake',
      amount: -stake,
      matchId: gameId,
      description: `Stake for game ${gameId}`
    });
    await user2.save();

    console.log(`💰 Reserved ${stake} from both players. ${user1.username}: bal=${user1.balance}, reserved=${user1.reservedBalance}. ${user2.username}: bal=${user2.balance}, reserved=${user2.reservedBalance}`);
    // --- End of reservation logic ---

    // First player (host) joins as Green
    const hostResult = await gameEngine.handleJoinGame(
      gameId,
      player1.userId || player1.socketId,
      hostColor,
      player1.socketId
    );

    // Second player (guest) joins as Blue
    const guestResult = await gameEngine.handleJoinGame(
      gameId,
      player2.userId || player2.socketId,
      guestColor,
      player2.socketId
    );

    // Get sockets with enhanced recovery logic for production environments
    let socket1 = io.sockets.sockets.get(player1.socketId);
    let socket2 = io.sockets.sockets.get(player2.socketId);

    // Track if we need to use userId room fallback
    let usePlayer1Fallback = false;
    let usePlayer2Fallback = false;

    // Track all possible sockets for each player for redundant broadcasting
    let player1Sockets = [];
    let player2Sockets = [];

    console.log(`🔍 Socket recovery check - Player1 socketId: ${player1.socketId}, userId: ${player1.userId}`);
    console.log(`🔍 Socket recovery check - Player2 socketId: ${player2.socketId}, userId: ${player2.userId}`);

    if (!socket1) {
      console.warn(`⚠️ Socket not found for player1 (socketId: ${player1.socketId}). Attempting recovery...`);

      // Try to find socket by userId in connected sockets
      if (player1.userId) {
        const userSockets = Array.from(io.sockets.sockets.values()).filter(s => {
          // Check if socket belongs to this user (multiple ways)
          return s.data?.userId === player1.userId ||
            s.handshake?.query?.userId === player1.userId ||
            s.handshake?.auth?.userId === player1.userId;
        });

        player1Sockets = userSockets; // Store all matching sockets
        if (userSockets.length > 0) {
          socket1 = userSockets[0]; // Use the first matching socket
          console.log(`✅ Recovered socket for player1 using userId: ${player1.userId}, found ${userSockets.length} socket(s)`);
        } else {
          console.warn(`⚠️ No socket found for player1 userId: ${player1.userId}. Will use userId room fallback.`);
          usePlayer1Fallback = true;
        }
      } else {
        console.warn(`⚠️ Player1 has no userId for recovery`);
        usePlayer1Fallback = true;
      }
    } else {
      player1Sockets = [socket1];
      console.log(`✅ Player1 socket found directly: ${player1.socketId}`);
    }

    if (!socket2) {
      console.warn(`⚠️ Socket not found for player2 (socketId: ${player2.socketId}). Attempting recovery...`);

      // Try to find socket by userId in connected sockets
      if (player2.userId) {
        const userSockets = Array.from(io.sockets.sockets.values()).filter(s => {
          return s.data?.userId === player2.userId ||
            s.handshake?.query?.userId === player2.userId ||
            s.handshake?.auth?.userId === player2.userId;
        });

        player2Sockets = userSockets; // Store all matching sockets
        if (userSockets.length > 0) {
          socket2 = userSockets[0];
          console.log(`✅ Recovered socket for player2 using userId: ${player2.userId}, found ${userSockets.length} socket(s)`);
        } else {
          console.warn(`⚠️ No socket found for player2 userId: ${player2.userId}. Will use userId room fallback.`);
          usePlayer2Fallback = true;
        }
      } else {
        console.warn(`⚠️ Player2 has no userId for recovery`);
        usePlayer2Fallback = true;
      }
    } else {
      player2Sockets = [socket2];
      console.log(`✅ Player2 socket found directly: ${player2.socketId}`);
    }

    // If both sockets are missing and we can't recover, emit error and clean up
    if (!socket1 && !socket2 && !player1.userId && !player2.userId) {
      console.error('❌ CRITICAL: Both sockets not found and no userId available for fallback. Match creation failed.');

      // Try to refund the stakes since match failed
      try {
        user1.balance += stake;
        user1.reservedBalance = Math.max(0, (user1.reservedBalance || 0) - stake);
        await user1.save();

        user2.balance += stake;
        user2.reservedBalance = Math.max(0, (user2.reservedBalance || 0) - stake);
        await user2.save();

        console.log(`💰 Refunded stakes to both players due to match creation failure`);
      } catch (refundError) {
        console.error('❌ Error refunding stakes:', refundError);
      }

      return;
    }

    // Join game rooms if sockets are available
    if (socket1) {
      socket1.join(gameId);
      socket1.gameId = gameId;
    }
    if (socket2) {
      socket2.join(gameId);
      socket2.gameId = gameId;
    }

    // Update game state to started with random turn order
    if (guestResult.success && guestResult.state) {
      const Game = require('./models/Game');
      const game = await Game.findOne({ gameId });
      if (game) {
        // Randomly decide which player goes first (0 = Green, 1 = Blue)
        const randomStartingPlayer = Math.floor(Math.random() * 2);
        const startingColor = randomStartingPlayer === 0 ? 'Green' : 'Blue';

        game.status = 'ACTIVE';
        game.gameStarted = true;
        game.message = `Game started! ${startingColor} goes first.`;
        game.turnState = 'ROLLING';
        game.currentPlayerIndex = randomStartingPlayer;
        game.diceValue = null; // Ensure diceValue is null at game start
        game.legalMoves = []; // Ensure legalMoves is empty at game start
        game.stake = stake;
        await game.save();
        console.log(`✅ Game ${gameId} marked as started - ${startingColor} (index ${randomStartingPlayer}) goes first`);
      }
    }

    // Notify both players with improved fallback logic
    const player1MatchData = {
      gameId,
      playerColor: hostColor,
      opponent: { userId: player2.userId, userName: player2.userName },
      stake
    };

    const player2MatchData = {
      gameId,
      playerColor: guestColor,
      opponent: { userId: player1.userId, userName: player1.userName },
      stake
    };

    // REDUNDANT BROADCASTING: Emit to ALL discovered sockets AND userId rooms for maximum reliability
    console.log(`📡 Broadcasting match_found to player1 (${player1Sockets.length} socket(s), fallback: ${usePlayer1Fallback})`);
    console.log(`📡 Broadcasting match_found to player2 (${player2Sockets.length} socket(s), fallback: ${usePlayer2Fallback})`);

    // Emit to player1 - use ALL available methods for redundancy
    let player1NotificationsSent = 0;

    // Method 1: Direct socket(s)
    if (player1Sockets.length > 0) {
      player1Sockets.forEach(s => {
        s.emit('match_found', player1MatchData);
        player1NotificationsSent++;
      });
      console.log(`✅ Emitted match_found to player1 via ${player1Sockets.length} direct socket(s)`);
    }

    // Method 2: userId room (ALWAYS try this for redundancy)
    if (player1.userId) {
      io.to(`user_${player1.userId}`).emit('match_found', player1MatchData);
      player1NotificationsSent++;
      console.log(`✅ Emitted match_found to player1 via userId room: user_${player1.userId}`);
    }

    if (player1NotificationsSent === 0) {
      console.error(`❌ CRITICAL: No notifications sent to player1!`);
    }

    // Emit to player2 - use ALL available methods for redundancy
    let player2NotificationsSent = 0;

    // Method 1: Direct socket(s)
    if (player2Sockets.length > 0) {
      player2Sockets.forEach(s => {
        s.emit('match_found', player2MatchData);
        player2NotificationsSent++;
      });
      console.log(`✅ Emitted match_found to player2 via ${player2Sockets.length} direct socket(s)`);
    }

    // Method 2: userId room (ALWAYS try this for redundancy)
    if (player2.userId) {
      io.to(`user_${player2.userId}`).emit('match_found', player2MatchData);
      player2NotificationsSent++;
      console.log(`✅ Emitted match_found to player2 via userId room: user_${player2.userId}`);
    }

    if (player2NotificationsSent === 0) {
      console.error(`❌ CRITICAL: No notifications sent to player2!`);
    }

    // Send initial game state to both players after a short delay
    if (guestResult.success && guestResult.state) {
      setTimeout(async () => {
        const Game = require('./models/Game');
        const game = await Game.findOne({ gameId });
        if (game) {
          // Ensure all players are properly marked as not AI and not disconnected
          // For multiplayer games, ALL players should be human (isAI: false)
          let playerFlagsUpdated = false;
          game.players.forEach(player => {
            // Always set isAI to false for multiplayer games - no bots allowed
            if (player.isAI !== false) {
              player.isAI = false;
              playerFlagsUpdated = true;
              console.log(`🔧 Forced ${player.color} to be human (isAI: false) in multiplayer game ${gameId}`);
            }
            if (player.isDisconnected === undefined || player.isDisconnected === null || player.isDisconnected === true) {
              // Only set isDisconnected to false if they have a socket
              if (player.socketId) {
                player.isDisconnected = false;
                playerFlagsUpdated = true;
              }
            }
          });

          if (playerFlagsUpdated) {
            await game.save();
            console.log(`✅ Updated player flags in initial game state for game ${gameId}`);
          }

          const gameState = game.toObject ? game.toObject() : game;
          const finalState = {
            ...gameState,
            gameStarted: true,
            status: 'ACTIVE',
            turnState: 'ROLLING',
            diceValue: null, // Ensure diceValue is null at game start
            legalMoves: [] // Ensure legalMoves is empty at game start
          };
          console.log(`📤 Sending initial GAME_STATE_UPDATE to game ${gameId} with ${finalState.players?.length} players`);
          console.log(`📤 Player details:`, finalState.players?.map(p => ({
            color: p.color,
            isAI: p.isAI,
            isDisconnected: p.isDisconnected,
            hasSocket: !!p.socketId
          })));
          console.log(`📤 Initial game state: currentPlayerIndex=${finalState.currentPlayerIndex}, turnState=${finalState.turnState}, diceValue=${finalState.diceValue}, gameStarted=${finalState.gameStarted}`);

          // Ensure state is a plain object
          const plainState = finalState.toObject ? finalState.toObject() : finalState;
          console.log(`📤 [CRITICAL] Emitting GAME_STATE_UPDATE to ${gameId} with state:`, JSON.stringify(plainState, null, 2));
          io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

          // Start timer for first player if human and connected
          const firstPlayer = game.players[game.currentPlayerIndex];
          console.log(`📤 First player: ${firstPlayer?.color}, isAI: ${firstPlayer?.isAI}, isDisconnected: ${firstPlayer?.isDisconnected}, socketId: ${firstPlayer?.socketId}`);

          // CRITICAL: Ensure first player is NOT marked as AI or disconnected if they have a socket
          if (firstPlayer && firstPlayer.socketId) {
            // Force human players to be marked correctly
            if (firstPlayer.isAI !== false) {
              firstPlayer.isAI = false;
              console.log(`🔧 Fixed: Set ${firstPlayer.color} isAI to false (had socketId)`);
            }
            if (firstPlayer.isDisconnected !== false) {
              firstPlayer.isDisconnected = false;
              console.log(`🔧 Fixed: Set ${firstPlayer.color} isDisconnected to false (had socketId)`);
            }
            await game.save();
          }

          // Check if first player is Human/Connected and START TIMER
          if (firstPlayer && firstPlayer.socketId) {
            console.log(`⏱️ Starting auto-roll timer for first player ${firstPlayer.color} in game ${gameId}`);
            scheduleHumanPlayerAutoRoll(gameId);
          } else if (firstPlayer && !firstPlayer.socketId && (firstPlayer.isAI || firstPlayer.isDisconnected)) {
            // Only auto-roll if player has NO socketId AND is marked as AI/disconnected
            console.log(`🤖 First player ${firstPlayer.color} has no socketId and is AI/disconnected, scheduling auto-turn`);
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
          } else if (firstPlayer) {
            // Fallback for unclear state - schedule timer to be safe
            console.log(`⚠️ First player ${firstPlayer.color} state unclear - scheduling auto-roll timer for safety`);
            scheduleHumanPlayerAutoRoll(gameId);
          } else {
            console.log(`⚠️ First player not found`);
          }
        }
      }, 200); // Increased delay to allow both players to be ready
    }
  } catch (error) {
    if (socket1) socket1.emit('ERROR', { message: 'Failed to create game' });
    if (socket2) socket2.emit('ERROR', { message: 'Failed to create game' });
  } finally {
    // Release locks
    usersStartingGame.delete(player1.userId);
    usersStartingGame.delete(player2.userId);
    console.log(`🔓 Released start-game locks for ${player1.userName || player1.userId} and ${player2.userName || player2.userId}`);
  }
};

const removeFromQueue = (socketId) => {
  // Find and remove any active match requests for this socket
  for (const [requestId, request] of activeMatchRequests.entries()) {
    if (request.socketId === socketId) {
      console.log(`❌ Removing match request ${requestId} due to creator disconnect`);

      // Clear timer
      const timer = requestTimers.get(requestId);
      if (timer) {
        clearTimeout(timer);
        requestTimers.delete(requestId);
      }

      // Remove request
      activeMatchRequests.delete(requestId);

      // Notify others
      io.emit('match_request_removed', { requestId });
    }
  }
};

// Clean up expired requests periodically



const humanPlayerTimers = new Map(); // gameId -> timer reference
const timerBroadcasts = new Map(); // gameId -> { intervalId, timeLeft } for countdown broadcast


// ===== AUTO-TURN TIMING CONSTANTS (FASTER) =====
const AUTO_TURN_DELAYS = {
  AI_ROLL: 800,            // Reduced from 1500
  AI_MOVE: 800,            // Reduced from 1200
  AI_QUICK_MOVE: 150,      // Reduced from 200
  ANIMATION_WAIT: 300,     // Reduced from 500
  STUCK_RECOVERY: 800,     // Reduced from 1000
  NO_MOVES_DELAY: 800      // Reduced from 1200
};

// ===== TIMER BROADCAST SYSTEM =====
const startTimerBroadcast = (gameId, initialTime, timerType = 'roll') => {
  stopTimerBroadcast(gameId);
  let timeLeft = initialTime;
  const intervalId = setInterval(async () => {
    timeLeft--;
    if (timeLeft <= 0) {
      stopTimerBroadcast(gameId);
      return;
    }
    io.to(gameId).emit('TIMER_TICK', { timer: timeLeft });
  }, 1000);
  timerBroadcasts.set(gameId, { intervalId, timeLeft: initialTime });
};

const stopTimerBroadcast = (gameId) => {
  if (timerBroadcasts.has(gameId)) {
    const { intervalId } = timerBroadcasts.get(gameId);
    clearInterval(intervalId);
    timerBroadcasts.delete(gameId);
  }
};

const clearAllTimersForGame = (gameId) => {
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
    humanPlayerTimers.delete(gameId);
  }
  stopTimerBroadcast(gameId);
};

const scheduleHumanPlayerAutoRoll = (gameId) => {
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
  }
  // Faster Timer: 6s instead of 7s
  startTimerBroadcast(gameId, 6, 'roll');
  const timer = setTimeout(async () => {
    humanPlayerTimers.delete(gameId);
    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });
    if (!game || game.status !== 'ACTIVE' || game.turnState !== 'ROLLING') return;

    try {
      const result = await gameEngine.handleAutoRoll(gameId, true);
      if (result && result.success) {
        const gameState = result.state;
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });
        if (gameState.legalMoves.length === 0) {
          setTimeout(async () => {
            const passTurnResult = await gameEngine.handlePassTurn(gameId); // Assume exists or handle via engine
            // Fallback if handlePassTurn not handy: manually update
            // Actually, gameEngine.handleAutoMove usually handles 'no moves' logic via calling getNextPlayer
            // But let's trust the engine for now.
            io.to(gameId).emit('GAME_STATE_UPDATE', { state: passTurnResult?.state || gameState });
            if (passTurnResult?.state) {
              const nextPlayer = passTurnResult.state.players[passTurnResult.state.currentPlayerIndex];
              if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                scheduleHumanPlayerAutoRoll(gameId);
              }
            }
          }, 1200);
        } else if (gameState.legalMoves.length === 1) {
          setTimeout(async () => {
            const moveResult = await gameEngine.handleAutoMove(gameId);
            if (moveResult.success) {
              io.to(gameId).emit('GAME_STATE_UPDATE', { state: moveResult.state });
              const nextPlayer = moveResult.state.players[moveResult.state.currentPlayerIndex];
              if (moveResult.state.turnState === 'ROLLING' && nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                scheduleHumanPlayerAutoRoll(gameId);
              }
            }
          }, 1200);
        } else {
          scheduleHumanPlayerAutoMove(gameId);
        }
      } else {
        console.log(`⚠️ Auto-roll failed for ${gameId}: ${result?.message}`);
      }
    }
    } catch (error) {
    console.error(`❌ Error in auto-roll timer for ${gameId}:`, error);
  }
}, 6000); // 6s buffer
humanPlayerTimers.set(gameId, timer);
};

const scheduleHumanPlayerAutoMove = (gameId) => {
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
  }
  // Faster Timer: 12s instead of 18s
  startTimerBroadcast(gameId, 12, 'move');
  const timer = setTimeout(async () => {
    humanPlayerTimers.delete(gameId);
    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });
    if (!game || game.status !== 'ACTIVE' || game.turnState !== 'MOVING') return;
    try {
      const result = await gameEngine.handleAutoMove(gameId);
      if (result && result.success) {
        const plainState = result.state;
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
        const nextPlayer = plainState.players[plainState.currentPlayerIndex];
        if (plainState.turnState === 'ROLLING') {
          if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
            scheduleHumanPlayerAutoRoll(gameId);
          } else if (nextPlayer) {
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_MOVE);
          }
        }
      } else {
        console.log(`⚠️ Auto-move failed for ${gameId}: ${result?.message}`);
      }
    } catch (error) {
      console.error(`❌ Error in auto-move timer for ${gameId}:`, error);
    }
  }, 12000); // 12s buffer
  humanPlayerTimers.set(gameId, timer);
};

const scheduleAutoTurn = async (gameId, delay = AUTO_TURN_DELAYS.AI_ROLL) => {
  const Game = require('./models/Game');
  try {
    const game = await Game.findOne({ gameId });
    if (game && game.gameStarted && game.status === 'ACTIVE') {
      const currentPlayer = game.players[game.currentPlayerIndex];
      if (currentPlayer && currentPlayer.socketId && !currentPlayer.isAI && !currentPlayer.isDisconnected) return;
    }
  } catch (err) { }
  if (activeAutoTurns.has(gameId)) return;
  activeAutoTurns.add(gameId);
  setTimeout(async () => {
    activeAutoTurns.delete(gameId);
    await runAutoTurn(gameId);
  }, delay);
};

const runAutoTurn = async (gameId) => {
  const Game = require('./models/Game');
  const gameRecord = await Game.findOne({ gameId });
  if (!gameRecord || !gameRecord.gameStarted || gameRecord.status !== 'ACTIVE') return;

  const currentPlayerFromDb = gameRecord.players[gameRecord.currentPlayerIndex];
  if (!currentPlayerFromDb) return;
  if (currentPlayerFromDb.socketId && !currentPlayerFromDb.isAI && !currentPlayerFromDb.isDisconnected) return;

  let result = await gameEngine.handleAutoRoll(gameId);
  if (!result.success) result = await gameEngine.handleAutoMove(gameId);

  if (result.success) {
    const plainState = result.state.toObject ? result.state.toObject() : result.state;
    if (plainState.diceValue !== null && plainState.diceValue !== undefined) plainState.diceValue = Number(plainState.diceValue);
    io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

    if (plainState.legalMoves && plainState.legalMoves.length === 0 && plainState.diceValue !== null && plainState.turnState === 'MOVING') {
      setTimeout(async () => {
        // Pass turn logic
        const game = await Game.findOne({ gameId });
        if (game && game.turnState === 'MOVING' && game.legalMoves.length === 0) {
          const nextPlayerIndex = gameEngine.getNextPlayerIndex(game, game.currentPlayerIndex, false);
          game.currentPlayerIndex = nextPlayerIndex;
          game.diceValue = null;
          game.turnState = 'ROLLING';
          game.legalMoves = [];
          await game.save();
          const updatedState = game.toObject ? game.toObject() : game;
          io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });
          const nextPlayer = game.players[nextPlayerIndex];
          if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
        }
      }, 1200);
      return;
    }

    const game = result.state;
    if (game.turnState === 'MOVING') {
      scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_QUICK_MOVE);
    } else if (game.turnState === 'ROLLING') {
      const updatedGameRecord = await Game.findOne({ gameId });
      if (updatedGameRecord) {
        const nextPlayerIndex = updatedGameRecord.currentPlayerIndex;
        const nextPlayerFromDb = updatedGameRecord.players[nextPlayerIndex];
        if (nextPlayerFromDb && (nextPlayerFromDb.isAI || nextPlayerFromDb.isDisconnected)) {
          scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
        } else if (nextPlayerFromDb && !nextPlayerFromDb.isAI && !nextPlayerFromDb.isDisconnected) {
          scheduleHumanPlayerAutoRoll(gameId);
        }
      }
    }
  }
};

io.on('connection', (socket) => {
  socket.on('register_user', ({ userId }) => {
    if (userId) {
      socket.data.userId = userId;
      const userRoom = `user_${userId}`;
      socket.join(userRoom);
      socket.emit('registration_confirmed', { userId, room: userRoom, socketId: socket.id });
    }
  });



  socket.on('create_match_request', async ({ stake, userId, userName }) => {
    try {
      const numericStake = parseFloat(stake);
      if (!numericStake || numericStake <= 0 || isNaN(numericStake)) {
        return socket.emit('ERROR', { message: 'Invalid stake amount' });
      }
      const user = await User.findById(userId);
      if (!user) {
        return socket.emit('ERROR', { message: 'User not found' });
      }
      if (user.role === 'SUPER_ADMIN') {
        return socket.emit('ERROR', { message: 'Super Admin cannot create match requests' });
      }
      for (const [id, req] of activeMatchRequests.entries()) {
        if (req.userId === userId) {
          return socket.emit('ERROR', { message: 'You already have an active match request' });
        }
      }
      const activeGame = await Game.findOne({ status: 'ACTIVE', 'players.userId': userId });
      if (activeGame) {
        return socket.emit('ERROR', { message: 'You are already in an active game. Please finish it first.' });
      }
      if (user.balance < numericStake) {
        return socket.emit('ERROR', { message: 'Insufficient funds to create match request' });
      }

      const requestId = crypto.randomBytes(8).toString('hex');
      const expiresAt = Date.now() + 120000;

      const request = { requestId, userId, userName: userName || user.username, stake: numericStake, socketId: socket.id, expiresAt, createdAt: Date.now() };
      activeMatchRequests.set(requestId, request);

      const timer = setTimeout(() => {
        activeMatchRequests.delete(requestId);
        requestTimers.delete(requestId);
        const creatorSocket = io.sockets.sockets.get(request.socketId);
        if (creatorSocket) {
          creatorSocket.emit('match_request_expired', { requestId });
        }
        io.emit('match_request_removed', { requestId });
      }, 120000);
      requestTimers.set(requestId, timer);

      socket.emit('match_request_created', { requestId });
      const broadcastRequest = { requestId, userId, userName: userName || user.username, stake: numericStake, timeRemaining: 120 };
      socket.broadcast.emit('new_match_request', { request: broadcastRequest });
    } catch (error) {
      socket.emit('ERROR', { message: 'Failed to create match request: ' + error.message });
    }
  });

  socket.on('accept_match_request', async ({ requestId, userId, userName }) => {
    const request = activeMatchRequests.get(requestId);
    if (!request) {
      return socket.emit('ERROR', { message: 'Match request no longer available' });
    }
    if (request.userId === userId) {
      return socket.emit('ERROR', { message: 'Cannot accept your own match request' });
    }
    const acceptor = await User.findById(userId);
    if (!acceptor) {
      return socket.emit('ERROR', { message: 'User not found' });
    }
    if (acceptor.balance < request.stake) {
      return socket.emit('ERROR', { message: 'Insufficient funds' });
    }

    activeMatchRequests.delete(requestId);
    const timer = requestTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      requestTimers.delete(requestId);
    }
    io.emit('match_request_accepted', { requestId, acceptorName: userName || acceptor.username });
    await createMatch({ socketId: request.socketId, userId: request.userId, userName: request.userName }, { socketId: socket.id, userId, userName: userName || acceptor.username }, request.stake);
  });

  socket.on('cancel_match_request', async ({ requestId, userId }) => {
    const request = activeMatchRequests.get(requestId);
    if (request && request.userId === userId) {
      activeMatchRequests.delete(requestId);
      const timer = requestTimers.get(requestId);
      if (timer) {
        clearTimeout(timer);
        requestTimers.delete(requestId);
      }
      io.emit('match_request_removed', { requestId });
      socket.emit('match_request_cancel_success');
    }
  });

  socket.on('get_active_requests', async ({ userId }) => {
    const user = await User.findById(userId);
    const userBalance = user ? user.balance : 0;
    const requests = Array.from(activeMatchRequests.values())
      .filter(req => req.userId !== userId)
      .map(req => ({ ...req, canAccept: userBalance >= req.stake, timeRemaining: Math.max(0, Math.floor((req.expiresAt - Date.now()) / 1000)) }));
    socket.emit('active_requests', { requests });
  });

  socket.on('watch_game', async ({ gameId }) => {
    socket.join(gameId);

    try {
      const game = await Game.findOne({ gameId });
      if (game) {
        socket.emit('GAME_STATE_UPDATE', { state: game.toObject ? game.toObject() : game });
      } else {
        socket.emit('ERROR', { message: 'Game not found' });
      }
    } catch (error) { console.error(error); }
  });

  socket.on('join_game', async ({ gameId, userId, playerColor }) => {
    socket.join(gameId);
    socket.gameId = gameId;
    if (pendingDisconnects.has(userId)) {
      const pending = pendingDisconnects.get(userId);
      if (pending && pending.gameId === gameId) {
        clearTimeout(pending.timeoutId);
        pendingDisconnects.delete(userId);
      }
    }
    const result = await gameEngine.handleJoinGame(gameId, userId, playerColor, socket.id);
    if (result.success && result.state) {
      const plainState = result.state.toObject ? result.state.toObject() : result.state;
      io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
      if (result.state.status === 'ACTIVE' && result.state.turnState === 'ROLLING') {
        const currentPlayer = result.state.players[result.state.currentPlayerIndex];
        if (currentPlayer && currentPlayer.userId === userId && !currentPlayer.isAI) {
          scheduleHumanPlayerAutoRoll(gameId);
        }
      }
    } else {
      socket.emit('ERROR', { message: result.message || 'Failed to join game.' });
    }
  });

  socket.on('roll_dice', async ({ gameId }) => {
    console.log(`[SOCKET] Received roll_dice for game: ${gameId}, from socket: ${socket.id}`);
    if (humanPlayerTimers.has(gameId)) {
      clearTimeout(humanPlayerTimers.get(gameId));
      humanPlayerTimers.delete(gameId);
    }

    const gameBeforeRoll = await Game.findOne({ gameId });
    if (!gameBeforeRoll) {
      console.log(`[SOCKET] Game ${gameId} not found during roll_dice.`);
    } else {
      console.log(`[SOCKET] Game ${gameId} found. Status: ${gameBeforeRoll.status}, TurnState: ${gameBeforeRoll.turnState}`);
      const currentPlayer = gameBeforeRoll.players[gameBeforeRoll.currentPlayerIndex];
      if (currentPlayer && currentPlayer.socketId === socket.id && currentPlayer.isDisconnected) {
        await Game.updateOne({ gameId, 'players.socketId': socket.id }, { $set: { 'players.$.isDisconnected': false } });
        console.log(`[SOCKET] Player ${currentPlayer.color} in game ${gameId} was disconnected, now marked as connected.`);
      }
    }

    console.log(`[SOCKET] Calling gameEngine.handleRollDice for game: ${gameId}, socket: ${socket.id}`);
    const result = await gameEngine.handleRollDice(gameId, socket.id);
    console.log(`[SOCKET] gameEngine.handleRollDice result for ${gameId}: success=${result?.success}, message=${result?.message}`);
    if (!result) {
      console.error(`[SOCKET] gameEngine.handleRollDice returned null for game ${gameId}`);
      return socket.emit('ERROR', { message: 'Failed to roll dice' });
    }

    if (result.success) {
      const gameState = result.state.toObject ? result.state.toObject() : result.state;
      if (gameState.diceValue !== null && gameState.diceValue !== undefined) gameState.diceValue = Number(gameState.diceValue);

      io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });

      if (gameState.legalMoves && gameState.legalMoves.length > 0) {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        if (currentPlayer && !currentPlayer.isAI && !currentPlayer.isDisconnected) {
          scheduleHumanPlayerAutoMove(gameId);
        }
      } else if (gameState.legalMoves && gameState.legalMoves.length === 0 && gameState.diceValue !== null) {
        if (humanPlayerTimers.has(gameId)) { clearTimeout(humanPlayerTimers.get(gameId)); humanPlayerTimers.delete(gameId); }
        setTimeout(async () => {
          const game = await Game.findOne({ gameId });
          if (game && game.turnState === 'MOVING' && game.legalMoves.length === 0) {
            const nextPlayerIndex = gameEngine.getNextPlayerIndex(game, game.currentPlayerIndex, false);
            game.currentPlayerIndex = nextPlayerIndex;
            game.diceValue = null;
            game.turnState = 'ROLLING';
            game.legalMoves = [];
            await game.save();
            const updatedState = game.toObject ? game.toObject() : game;
            io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });
            const nextPlayer = game.players[nextPlayerIndex];
            if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId, 1500);
            else if (nextPlayer) scheduleHumanPlayerAutoRoll(gameId);
          }
        }, 1200);
      }

      const gameRecord = await Game.findOne({ gameId });
      if (gameRecord && result.state.turnState === 'ROLLING') {
        const nextPlayer = gameRecord.players[gameRecord.currentPlayerIndex];
        if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
          console.log(`[SOCKET] Scheduling auto-turn for AI/disconnected player ${nextPlayer.color} in game ${gameId}`);
          scheduleAutoTurn(gameId);
        } else if (nextPlayer) {
          console.log(`[SOCKET] Scheduling human player auto-roll timer for ${nextPlayer.color} in game ${gameId}`);
          scheduleHumanPlayerAutoRoll(gameId);
        }
      }

    } else {
      console.error(`[SOCKET] Error in roll_dice for game ${gameId}: ${result.message || 'Failed to roll dice'}`);
      socket.emit('ERROR', { message: result.message || 'Failed to roll dice' });

      // CRITICAL FIX: Restart timer if roll failed but game is still active
      // This prevents the game from getting stuck if a user request fails validation

      const gameCheck = await Game.findOne({ gameId });
      if (gameCheck && gameCheck.status === 'ACTIVE' && gameCheck.turnState === 'ROLLING') {
        const currentPlayer = gameCheck.players[gameCheck.currentPlayerIndex];
        if (currentPlayer && currentPlayer.socketId === socket.id) {
          console.log(`[SOCKET] Restarting timer for ${currentPlayer.color} after failed roll`);
          scheduleHumanPlayerAutoRoll(gameId);
        }
      }

      if (result.message === 'Wait for animation' || result.message === 'Not rolling state') {
        // If we have gameCheck already, use it
        if (gameCheck) {
          console.log(`[SOCKET] Emitting GAME_STATE_UPDATE due to specific error for game ${gameId}`);
          socket.emit('GAME_STATE_UPDATE', { state: gameCheck.toObject ? gameCheck.toObject() : gameCheck });
        }
      }
    }
  });

  socket.on('move_token', async ({ gameId, tokenId }) => {
    if (humanPlayerTimers.has(gameId)) { clearTimeout(humanPlayerTimers.get(gameId)); humanPlayerTimers.delete(gameId); }


    const result = await gameEngine.handleMoveToken(gameId, socket.id, tokenId);

    if (result.success) {
      const plainState = result.state.toObject ? result.state.toObject() : result.state;
      if (result.killedTokenId) io.to(gameId).emit('TOKEN_KILLED', { killedTokenId: result.killedTokenId });

      if (plainState.turnState !== 'ROLLING' && plainState.diceValue === null) plainState.turnState = 'ROLLING';
      io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
      if (result.settlementData) {
        const winnerPlayer = plainState.players.find(p => p.userId === result.settlementData.winnerId);
        if (winnerPlayer && winnerPlayer.socketId) io.to(winnerPlayer.socketId).emit('win_notification', result.settlementData);
        else io.to(gameId).emit('win_notification', result.settlementData);
      }

      const gameRecord = await Game.findOne({ gameId });
      if (gameRecord && gameRecord.status === 'ACTIVE') {
        const nextPlayer = gameRecord.players[gameRecord.currentPlayerIndex];

        if (gameRecord.turnState === 'ROLLING') {
          // Next player's turn to roll
          if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
            console.log(`[MOVE] Scheduling auto-turn for AI/disconnected player ${nextPlayer.color}`);
            scheduleAutoTurn(gameId);
          } else if (nextPlayer) {
            console.log(`[MOVE] Scheduling human auto-roll timer for ${nextPlayer.color}`);
            scheduleHumanPlayerAutoRoll(gameId);
          }
        } else if (gameRecord.turnState === 'MOVING') {
          // Current player still has moves to make (e.g., rolled 6 or multiple legal moves)
          if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
            console.log(`[MOVE] AI/disconnected player ${nextPlayer.color} in MOVING state, scheduling auto-move`);
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_MOVE);
          } else if (nextPlayer) {
            console.log(`[MOVE] Human player ${nextPlayer.color} in MOVING state, scheduling auto-move timer`);
            scheduleHumanPlayerAutoMove(gameId);
          }
        } else {
          console.log(`[MOVE] Game ${gameId} in unexpected state: ${gameRecord.turnState}`);
        }
      }
    } else {
      socket.emit('ERROR', { message: result.message });

      // CRITICAL FIX: Restart timer if move failed

      const gameCheck = await Game.findOne({ gameId });
      if (gameCheck && gameCheck.status === 'ACTIVE' && gameCheck.turnState === 'MOVING') {
        const currentPlayer = gameCheck.players[gameCheck.currentPlayerIndex];
        if (currentPlayer && currentPlayer.socketId === socket.id) {
          console.log(`[SOCKET] Restarting move timer for ${currentPlayer.color} after failed move`);
          scheduleHumanPlayerAutoMove(gameId);
        }
      }
    }
  });

  socket.on('send_chat_message', async ({ gameId, userId, message }) => {

    const game = await Game.findOne({ gameId });
    if (game) {
      const player = game.players.find(p => p.userId === userId);
      if (player) {
        const chatData = { userId, playerColor: player.color, playerName: player.username || player.userId, message, timestamp: Date.now() };
        io.to(gameId).emit('chat_message', chatData);
      }
    }
  });

  // Client-side UN-STICK Request
  socket.on('resync_game', async ({ gameId }) => {
    console.log(`🔄 RESYNC REQUEST from ${socket.id} for game ${gameId}`);
    try {
      const game = await Game.findOne({ gameId });
      if (game) {
        socket.emit('GAME_STATE_UPDATE', { state: game.toObject ? game.toObject() : game });

        // Check if we need to restart a dead timer
        const currentPlayer = game.players[game.currentPlayerIndex];
        const isMyTurn = currentPlayer && currentPlayer.socketId === socket.id;

        if (isMyTurn && !humanPlayerTimers.has(gameId)) {
          console.log(`🔧 Resync triggered Timer Restart for ${gameId}`);
          if (game.turnState === 'ROLLING') scheduleHumanPlayerAutoRoll(gameId);
          else if (game.turnState === 'MOVING') scheduleHumanPlayerAutoMove(gameId);
        }
      } else {
        socket.emit('ERROR', { message: 'Game not found during resync' });
      }
    } catch (e) {
      console.error('Resync error:', e);
    }
  });

  socket.on('disconnect', async () => {
    // Keep removing from matchmaking queue logic if it was there? Yes.
    // Assuming removeFromQueue is global
    if (typeof removeFromQueue === 'function') removeFromQueue(socket.id);

    if (socket.gameId) {
      const gameId = socket.gameId;

      const game = await Game.findOne({ gameId });
      if (game) {
        const player = game.players.find(p => p.socketId === socket.id);
        if (player && player.userId) {
          const userId = player.userId;
          const disconnectTimeout = setTimeout(async () => {
            pendingDisconnects.delete(userId);
            if (typeof clearAllTimersForGame === 'function') clearAllTimersForGame(gameId);
            const result = await gameEngine.handleDisconnect(gameId, socket.id);
            if (result) {
              io.to(gameId).emit('GAME_STATE_UPDATE', { state: result.state });
              if (result.isCurrentTurn) scheduleAutoTurn(gameId, 1000);
            }

          }, 5000); // Reduced from 15000 to 5000 for smoother gameplay (User Request)
          pendingDisconnects.set(userId, { timeoutId: disconnectTimeout, gameId });
          return;
        }
      }
      if (typeof clearAllTimersForGame === 'function') clearAllTimersForGame(gameId);
      const result = await gameEngine.handleDisconnect(gameId, socket.id);
      if (result) {
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: result.state });
        if (result.isCurrentTurn) scheduleAutoTurn(gameId, 1000);
      }
    }
  });
});


// Scheduled Task: Cleanup Stale Games (Every 6 Hours)
setInterval(async () => {
  try {

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find games that are 'ACTIVE' but haven't been updated in 24 hours
    const staleGames = await Game.find({
      status: 'ACTIVE',
      updatedAt: { $lt: twentyFourHoursAgo }
    });

    if (staleGames.length > 0) {
      console.log(`🧹 Found ${staleGames.length} stale games to clean up and refund...`);
      for (const game of staleGames) {
        const stake = game.stake;
        if (stake > 0) {
          for (const player of game.players) {
            if (player.userId && !player.isAI) {
              try {
                const user = await User.findById(player.userId);
                if (user && user.reservedBalance >= stake) {
                  user.balance += stake;
                  user.reservedBalance -= stake;
                  user.transactions.push({
                    type: 'game_refund',
                    amount: stake,
                    matchId: game.gameId,
                    description: `Refund for stale/cancelled game ${game.gameId}`
                  });
                  await user.save();
                  console.log(`💰 Refunded ${stake} to user ${user.username} for stale game ${game.gameId}.`);
                }
              } catch (refundError) {
                console.error(`❌ Error refunding user ${player.userId} for stale game ${game.gameId}:`, refundError);
              }
            }
          }
        }
        // After attempting refunds, delete the game
        await Game.deleteOne({ _id: game._id });
      }
      console.log(`✅ Finished cleaning up ${staleGames.length} stale games.`);
    }
  } catch (err) {
    console.error('Game cleanup error:', err);
  }
}, 6 * 60 * 60 * 1000);

// Serve frontend static build when present (same-domain deployment)
try {
  const frontendDist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    console.log('✅ Serving frontend from', frontendDist);
  } else {
    console.log('ℹ️ Frontend dist not found at', frontendDist);
  }
} catch (e) {
  console.warn('⚠️ Error checking frontend dist:', e.message);
}


const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces for mobile access

// Startup Cleanup: Mark all players as disconnected in ACTIVE games
const performStartupCleanup = async () => {
  try {
    console.log('🧹 Performing startup cleanup...');

    // 1. Mark disconnected (standard procedure)
    const result = await Game.updateMany(
      { status: 'ACTIVE' },
      {
        $set: {
          'players.$[].isDisconnected': true,
          'players.$[].socketId': null
        }
      }
    );
    console.log(`✅ Startup cleanup complete: Marked players as disconnected in ${result.modifiedCount} active games.`);

    // 2. RESTORE TIMERS (New Reliability Feat)
    await restoreTimersForActiveGames();

  } catch (err) {
    console.error('⚠️ Startup cleanup failed (non-critical):', err && err.message ? err.message : err);
  }
};

// --- RESTORE TIMERS FOR ACTIVE GAMES ---
const restoreTimersForActiveGames = async () => {
  try {
    console.log('⏰ Restoring timers for ACTIVE games...');
    const activeGames = await Game.find({ status: 'ACTIVE' });

    for (const game of activeGames) {
      console.log(`❤️ Restoring game ${game.gameId} (State: ${game.turnState})`);

      const currentPlayer = game.players[game.currentPlayerIndex];
      if (!currentPlayer) continue;

      // If it was an AI turn, schedule AI turn
      if (currentPlayer.isAI) {
        scheduleAutoTurn(game.gameId, 1000);
        continue;
      }

      // If it was a human turn, we must assume they are disconnected now (since server restarted)
      // But if we want to give them a chance to reconnect, we might wait.
      // However, 'performStartupCleanup' just marked them disconnected.
      // So we should actually schedule an AUTO TURN for them (bot takeover).

      // BUT, if users reconnect quickly, we want the game to be alive.
      // Let's schedule a "Recovery Auto Turn" that gives a bit of grace period (e.g. 5s)
      scheduleAutoTurn(game.gameId, 5000);
    }
    console.log(`✅ Restored timers/recovery for ${activeGames.length} active games.`);
  } catch (e) {
    console.error('Timer restoration failed:', e);
  }
};

// --- Lightweight Watchdog (Optimized for Speed) ---
// Checks every 5 seconds for games stuck > 10s
setInterval(async () => {
  try {

    const gameEngine = require('./logic/gameEngine');
    const now = Date.now();
    const stalledThreshold = 10000; // 10 seconds without activity (Aggressive)

    const activeGames = await Game.find({ status: 'ACTIVE' });

    for (const game of activeGames) {
      const lastActivity = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
      const isStalled = (now - lastActivity) > stalledThreshold;

      if (isStalled) {
        const currentPlayer = game.players[game.currentPlayerIndex];
        if (!currentPlayer) continue;

        // Check if we already have a timer for this game
        const hasTimer = humanPlayerTimers.has(game.gameId);

        // If it's stalled and NO TIMER is running, it's definitely stuck.
        // If a timer IS running, it might just be a long turn (but our max turn is 12s, threshold is 10s -- close call)
        // With move timer 12s, we should set threshold to ~15s to be safe? 
        // Let's stick to 12s check.

        if (isStalled && !hasTimer) {
          console.log(`🐕 Watchdog: Kickstarting frozen game ${game.gameId} (No timer found)`);

          if (currentPlayer.isAI || currentPlayer.isDisconnected) {
            scheduleAutoTurn(game.gameId, 100);
          } else {
            // Try to revive human timer first
            if (game.turnState === 'ROLLING') scheduleHumanPlayerAutoRoll(game.gameId);
            else if (game.turnState === 'MOVING') scheduleHumanPlayerAutoMove(game.gameId);
          }
        } else if (isStalled && hasTimer) {
          // Timer exists but db not updating? Might be okay, just waiting for move.
          // But if it's > 20s, then even the timer is dead/ignored.
          if ((now - lastActivity) > 20000) {
            console.log(`🐕 Watchdog: FORCE KICK - Game ${game.gameId} stalled > 20s despite timer.`);
            // Force next action
            if (game.turnState === 'ROLLING') await gameEngine.handleAutoRoll(game.gameId, true);
            else await gameEngine.handleAutoMove(game.gameId);

            // Broadast
            const updatedGame = await Game.findOne({ gameId: game.gameId });
            if (updatedGame) io.to(game.gameId).emit('GAME_STATE_UPDATE', { state: updatedGame.toObject() });
          }
        }
      }
    }
  } catch (error) {
    console.error('Watchdog error:', error);
  }
}, 5000); // Check every 5s

// Start server after ensuring DB connection and performing startup cleanup.
(async () => {
  try {
    await ensureMongoConnect();
  } catch (err) {
    console.error('⚠️ ensureMongoConnect() error:', err && err.message ? err.message : err);
  }

  try {
    await performStartupCleanup();
    console.log('✅ Startup cleanup completed');
  } catch (err) {
    console.error('⚠️ Startup cleanup failed:', err);
    console.log('🔄 Continuing server startup...');
  }

  // Start the server now that we've attempted DB connect + cleanup
  server.listen(PORT, HOST, () => {
    console.log(`✅ Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`🌐 Accessible on network: http://[YOUR_IP]:${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  });

  // Handle server errors
  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`💡 Port ${PORT} is already in use`);
    }
  });

})();
