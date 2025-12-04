
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
  origin: '*',
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
    origin: "*",
    methods: ["GET", "POST"]
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
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${fullName}`,
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
      avatar: userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.username}`,
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
      avatar: userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.username}`,
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
      avatar: userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.username}`,
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

    const users = await User.find({}).select('-password -resetPasswordToken -resetPasswordExpires').sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        _id: user._id,
        username: user.username,
        phone: user.phone,
        email: user.email,
        balance: user.balance || 0,
        role: user.role,
        status: user.status,
        avatar: user.avatar,
        createdAt: user.createdAt,
        stats: user.stats || { gamesPlayed: 0, wins: 0 }
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
    const visitors = await VisitorAnalytics.find({}).sort({ lastActivity: -1 });

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
      avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
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

    const revenues = await Revenue.find(query).sort({ timestamp: -1 });

    // Enrich revenues with game details
    const enrichedRevenues = await Promise.all(revenues.map(async (rev) => {
      const game = await Game.findOne({ gameId: rev.gameId });
      let playersInfo = [];
      let winnerInfo = null;
      let stake = 0;

      if (game) {
        playersInfo = game.players.map(p => ({
          userId: p.userId,
          username: p.username,
          color: p.color
        }));
        const winningPlayer = game.players.find(p => rev.winnerId && p.userId === rev.winnerId);
        if (winningPlayer) {
          winnerInfo = {
            userId: winningPlayer.userId,
            username: winningPlayer.username,
            color: winningPlayer.color
          };
        }
        stake = game.stake;
      }

      return {
        ...rev.toObject(), // Convert Mongoose document to plain object
        players: playersInfo, // Directly include players array
        winner: winnerInfo,   // Directly include winner object
        stake: stake,         // Directly include stake
        gameDetails: {
          players: playersInfo,
          winner: winnerInfo,
          stake: stake,
          gameId: rev.gameId // Ensure gameId is present in gameDetails
        }
      };
    }));

    const withdrawals = await RevenueWithdrawal.find(query).sort({ timestamp: -1 });

    const totalRevenue = revenues.reduce((sum, rev) => sum + rev.amount, 0);
    const totalWithdrawn = withdrawals.reduce((sum, wd) => sum + wd.amount, 0);
    const netRevenue = totalRevenue - totalWithdrawn;

    res.json({
      success: true,
      totalRevenue,
      totalWithdrawn,
      netRevenue,
      history: enrichedRevenues, // <--- Send the enriched revenues
      withdrawals: withdrawals,
      filter: filter
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

    res.json({ success: true, game: plainState });
  } catch (e) {
    console.error('Force rejoin error:', e);
    res.status(500).json({ error: e.message || 'Failed to force rejoin' });
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
    const matchHistory = await Game.find({
      status: 'COMPLETED',
      'players.userId': userId
    }).sort({ updatedAt: -1 }).limit(50);

    // Format history
    const history = matchHistory.map(game => {
      // Find this user's player record in the game
      const userPlayer = game.players.find(p => p.userId === userId);
      if (!userPlayer) {
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
        // Winner gets 90% of pot (stake * 2), but subtract their original stake
        // Net gain = (stake * 2 * 0.9) - stake = stake * 0.8
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
      return res.status(400).json({ error: `You already have a pending ${pendingRequest.type.toLowerCase()} request. Please wait for it to be processed.` });
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

      // Try to find user with phone/username "610251014" for debugging
      const debugUser = await User.findOne({
        $or: [
          { username: '610251014' },
          { phone: '610251014' },
          { _id: '610251014' }
        ]
      });

      if (debugUser) {
        console.log(`🔍 DEBUG: Found user "610251014" in database:`, {
          _id: debugUser._id,
          username: debugUser.username,
          phone: debugUser.phone,
          role: debugUser.role
        });
      }

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

    if (user.role !== 'SUPER_ADMIN') {
      console.error(`❌ Admin request DENIED: User ${user.username} (${user._id}) has role "${user.role}", not SUPER_ADMIN`);
      console.error(`💡 Token info - userId: ${req.user.userId}, username: ${req.user.username}, tokenRole: ${req.user.role}`);
      console.error(`💡 Database info - _id: ${user._id}, username: ${user.username}, dbRole: ${user.role}`);
      return res.status(403).json({
        error: "Access denied. Super Admin only.",
        currentRole: user.role,
        userId: user._id,
        username: user.username,
        tokenRole: req.user.role,
        message: `Your account role is "${user.role}". To access admin features, your role must be "SUPER_ADMIN". Please contact an administrator to update your role, or log out and log back in if you were recently promoted.`
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
      adminComment: req.adminComment || ''
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
      isSuperAdmin: user.role === 'SUPER_ADMIN'
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

    if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: "Access denied. Super Admin only.",
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
      adminComment: request.adminComment || ''
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

          // Check if player has socketId - if they do, they're human and connected
          if (firstPlayer && firstPlayer.socketId) {
            // Player has socketId = human and connected = NO AUTO-ROLL
            console.log(`⏱️ Human player ${firstPlayer.color} (has socketId: ${firstPlayer.socketId}) waiting for manual roll - player must click to roll`);
            // NO AUTO-ROLL: Players must manually click the dice to roll
            // This gives players full control over when to start the game
          } else if (firstPlayer && !firstPlayer.socketId && (firstPlayer.isAI || firstPlayer.isDisconnected)) {
            // Only auto-roll if player has NO socketId AND is marked as AI/disconnected
            console.log(`🤖 First player ${firstPlayer.color} has no socketId and is AI/disconnected, scheduling auto-turn`);
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
          } else if (firstPlayer) {
            // Player exists but state is unclear - default to NO AUTO-ROLL for safety
            console.log(`⚠️ First player ${firstPlayer.color} state unclear (socketId: ${firstPlayer.socketId}, isAI: ${firstPlayer.isAI}, isDisconnected: ${firstPlayer.isDisconnected}) - defaulting to NO AUTO-ROLL`);
          } else {
            console.log(`⚠️ First player not found`);
          }
        }
      }, 200); // Increased delay to allow both players to be ready
    }
  } catch (error) {
    console.error('Error creating game:', error);
    const socket1 = io.sockets.sockets.get(player1.socketId);
    const socket2 = io.sockets.sockets.get(player2.socketId);
    if (socket1) socket1.emit('ERROR', { message: 'Failed to create game' });
    if (socket2) socket2.emit('ERROR', { message: 'Failed to create game' });
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

const humanPlayerTimers = new Map(); // gameId -> timer reference
const timerBroadcasts = new Map(); // gameId -> { intervalId, timeLeft } for countdown broadcast

// ===== AUTO-TURN TIMING CONSTANTS =====
// Centralized timing configuration for consistent game speed
const AUTO_TURN_DELAYS = {
  AI_ROLL: 1500,           // AI thinking time before rolling dice
  AI_MOVE: 1200,           // AI thinking time before selecting move
  AI_QUICK_MOVE: 200,      // Quick move immediately after roll (when in MOVING state)
  ANIMATION_WAIT: 500,     // Wait for frontend animation to complete
  STUCK_RECOVERY: 1000,    // Delay before recovering stuck game state
  NO_MOVES_DELAY: 1200     // Delay before auto-passing turn when no moves available
};


// ===== TIMER BROADCAST SYSTEM (Fix for Issue #1: Timer Synchronization) =====
// Broadcasts timer countdown every second to keep all clients in sync
const startTimerBroadcast = (gameId, initialTime, timerType = 'roll') => {
  stopTimerBroadcast(gameId); // Clear any existing broadcast

  let timeLeft = initialTime;
  console.log(`⏱️ Starting timer broadcast for game ${gameId}: ${initialTime}s (${timerType})`);

  const intervalId = setInterval(async () => {
    timeLeft--;

    if (timeLeft <= 0) {
      stopTimerBroadcast(gameId);
      return;
    }

    // Broadcast timer tick to all clients in the game room
    io.to(gameId).emit('TIMER_TICK', { timer: timeLeft });
  }, 1000); // Tick every second

  timerBroadcasts.set(gameId, { intervalId, timeLeft: initialTime });
};

const stopTimerBroadcast = (gameId) => {
  if (timerBroadcasts.has(gameId)) {
    const { intervalId } = timerBroadcasts.get(gameId);
    clearInterval(intervalId);
    timerBroadcasts.delete(gameId);
    console.log(`🛑 Stopped timer broadcast for game ${gameId}`);
  }
};

// ===== TIMER CLEANUP SYSTEM (Fix for Issue #3: Memory Leaks) =====
const clearAllTimersForGame = (gameId) => {
  // Clear setTimeout timers
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
    humanPlayerTimers.delete(gameId);
  }

  // Clear setInterval broadcasts
  stopTimerBroadcast(gameId);

  console.log(`🧹 Cleared all timers for game ${gameId}`);
};

// Graceful shutdown - clear all timers to prevent zombie processes
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, cleaning up timers...');
  humanPlayerTimers.forEach((timer, gameId) => {
    clearTimeout(timer);
  });
  timerBroadcasts.forEach(({ intervalId }, gameId) => {
    clearInterval(intervalId);
  });
  console.log('✅ All timers cleared');
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, cleaning up timers...');
  humanPlayerTimers.forEach((timer, gameId) => {
    clearTimeout(timer);
  });
  timerBroadcasts.forEach(({ intervalId }, gameId) => {
    clearInterval(intervalId);
  });
  console.log('✅ All timers cleared');
  process.exit(0);
});

const scheduleHumanPlayerAutoRoll = (gameId) => {
  // Clear any existing timer for this game to prevent duplicates
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
  }

  console.log(`🕒 Scheduling auto-roll for human player in game ${gameId} in 7 seconds.`);

  // START TIMER BROADCAST - Fix for Issue #1: Timer Synchronization
  startTimerBroadcast(gameId, 7, 'roll');

  const timer = setTimeout(async () => {
    console.log(`⏰ 7s Timer expired for game ${gameId}. Checking state before auto-roll.`);
    humanPlayerTimers.delete(gameId); // Remove timer from map once it executes

    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });

    if (!game || game.status !== 'ACTIVE' || game.turnState !== 'ROLLING') {
      console.log(`🏃 Skipping auto-roll. Game state is no longer valid (Status: ${game?.status}, Turn State: ${game?.turnState}).`);
      return;
    }

    try {
      console.log(`✅ Player is idle. Forcing auto-roll for game ${gameId}.`);
      const result = await gameEngine.handleAutoRoll(gameId, true); // force=true

      if (result && result.success) {
        const gameState = result.state;
        console.log(`✅ Auto-rolled for idle human in game ${gameId}. Dice: ${gameState.diceValue}`);
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });

        // If no legal moves OR only one legal move, wait for animation, then take the next step.
        if (gameState.legalMoves.length === 0) {
          console.log(`⏱️ No moves for auto-roll. Passing turn in 1.2s.`);
          setTimeout(async () => {
            const passTurnResult = await gameEngine.handlePassTurn(gameId);
            if (passTurnResult.success) {
              io.to(gameId).emit('GAME_STATE_UPDATE', { state: passTurnResult.state });
              const nextPlayer = passTurnResult.state.players[passTurnResult.state.currentPlayerIndex];
              if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                scheduleHumanPlayerAutoRoll(gameId);
              }
            }
          }, 1200);
        } else if (gameState.legalMoves.length === 1) {
          console.log(`⏱️ One legal move for auto-roll. Moving automatically in 1.2s.`);
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
        }
        // If there are multiple moves, the 18s auto-move timer will handle it
        else {
          scheduleHumanPlayerAutoMove(gameId);
        }
      } else {
        console.warn(`⚠️ Auto-roll for idle human in game ${gameId} failed:`, result?.message);
      }
    } catch (error) {
      console.error(`❌ Error during scheduled human auto-roll for game ${gameId}:`, error);
    }
  }, 7000); // 7-second timer for human players

  humanPlayerTimers.set(gameId, timer);
};

const scheduleHumanPlayerAutoMove = (gameId) => {
  // Clear any existing timer for this game
  if (humanPlayerTimers.has(gameId)) {
    clearTimeout(humanPlayerTimers.get(gameId));
  }

  console.log(`🕒 Scheduling auto-move for human player in game ${gameId} in 18 seconds.`);

  // START TIMER BROADCAST - Fix for Issue #1: Timer Synchronization
  startTimerBroadcast(gameId, 18, 'move');

  const timer = setTimeout(async () => {
    console.log(`⏰ 18s Timer expired for game ${gameId}. Checking state before auto-move.`);
    humanPlayerTimers.delete(gameId);

    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });

    // If game is over, or it's not the player's turn, or the player already moved, do nothing.
    if (!game || game.status !== 'ACTIVE' || game.turnState !== 'MOVING') {
      console.log(`🏃 Skipping auto-move for game ${gameId}. Game state is no longer valid for this action (Status: ${game?.status}, Turn State: ${game?.turnState}).`);
      return;
    }

    try {
      console.log(`✅ Player is idle. Forcing auto-move for game ${gameId}.`);
      const result = await gameEngine.handleAutoMove(gameId);

      if (result && result.success) {
        console.log(`✅ Auto-moved for idle human in game ${gameId}.`);
        const plainState = result.state; // Already a plain object
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

        // After the auto-move, the game state will have transitioned to the next turn.
        // Schedule the next timer.
        const nextPlayer = plainState.players[plainState.currentPlayerIndex];
        if (plainState.turnState === 'ROLLING') {
          if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
            console.log(`🤖 Auto-move passed turn to human ${nextPlayer.color}. Scheduling new auto-roll timer.`);
            scheduleHumanPlayerAutoRoll(gameId);
          } else if (nextPlayer) {
            console.log(`🤖 Auto-move passed turn to AI/bot ${nextPlayer.color}. Scheduling auto-turn.`);
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_MOVE);
          }
        }
      } else {
        console.warn(`⚠️ Auto-move for idle human in game ${gameId} failed.`, result?.message);
      }
    } catch (error) {
      console.error(`❌ Error during scheduled human auto-move for game ${gameId}:`, error);
    }
  }, 18000); // 18 seconds

  humanPlayerTimers.set(gameId, timer);
};


const scheduleAutoTurn = async (gameId, delay = AUTO_TURN_DELAYS.AI_ROLL) => {
  console.log(`🤖 scheduleAutoTurn called for game ${gameId}, delay=${delay}ms`);

  // CRITICAL: Before scheduling auto-turn, verify the player is actually AI or disconnected
  // This prevents auto-rolling for human players who just entered the game
  const Game = require('./models/Game');
  try {
    const game = await Game.findOne({ gameId });
    if (game && game.gameStarted && game.status === 'ACTIVE') {
      const currentPlayer = game.players[game.currentPlayerIndex];
      if (currentPlayer && currentPlayer.socketId && !currentPlayer.isAI && !currentPlayer.isDisconnected) {
        console.log(`🚫 BLOCKED: scheduleAutoTurn called for human player ${currentPlayer.color} with socketId ${currentPlayer.socketId} - cancelling auto-turn`);
        console.log(`🚫 Human players must manually click the dice to roll`);
        return; // Don't schedule auto-turn for human players
      }
    }
  } catch (err) {
    console.error(`❌ Error checking game state before scheduling auto-turn: ${err}`);
    // Continue with scheduling if check fails (safer to allow AI to play)
  }

  if (activeAutoTurns.has(gameId)) {
    console.log(`🤖 Auto-turn already scheduled for game ${gameId}, skipping`);
    return; // Prevent double scheduling
  }
  activeAutoTurns.add(gameId);

  setTimeout(async () => {
    console.log(`🤖 Executing scheduled auto-turn for game ${gameId}`);
    activeAutoTurns.delete(gameId);
    await runAutoTurn(gameId);
  }, delay);
};

const runAutoTurn = async (gameId) => {
  console.log(`🤖 runAutoTurn starting for game ${gameId}`);

  // Check if game has actually started before auto-playing
  const Game = require('./models/Game');
  const gameRecord = await Game.findOne({ gameId });

  if (!gameRecord || !gameRecord.gameStarted || gameRecord.status !== 'ACTIVE') {
    console.log(`⏸️ Skipping auto-turn for ${gameId} - game not started yet (gameStarted: ${gameRecord?.gameStarted}, status: ${gameRecord?.status})`);
    return;
  }

  console.log(`🤖 Game ${gameId} is active and started, turnState: ${gameRecord.turnState}`);

  // Get the current player from the database to verify their status
  const currentPlayerFromDb = gameRecord.players[gameRecord.currentPlayerIndex];
  if (!currentPlayerFromDb) {
    console.log(`⏸️ Skipping auto-turn for ${gameId} - no current player at index ${gameRecord.currentPlayerIndex}`);
    return;
  }

  console.log(`🤖 Current player: ${currentPlayerFromDb.color} (isAI: ${currentPlayerFromDb.isAI}, isDisconnected: ${currentPlayerFromDb.isDisconnected}, socketId: ${currentPlayerFromDb.socketId})`);

  // CRITICAL: Only auto-play if player is actually AI or disconnected
  // If player has a socketId, they are human and connected - NEVER auto-roll
  if (currentPlayerFromDb.socketId && !currentPlayerFromDb.isAI && !currentPlayerFromDb.isDisconnected) {
    console.log(`⏸️ Skipping auto-turn for ${gameId} - current player ${currentPlayerFromDb.color} is human and connected (has socketId: ${currentPlayerFromDb.socketId})`);
    return;
  }

  // Double-check: If player has socketId but is incorrectly marked as AI/disconnected, fix it and skip auto-roll
  if (currentPlayerFromDb.socketId && (currentPlayerFromDb.isAI || currentPlayerFromDb.isDisconnected)) {
    console.log(`🔧 FIXING: Player ${currentPlayerFromDb.color} has socketId (${currentPlayerFromDb.socketId}) but was incorrectly marked as AI/disconnected. Correcting...`);
    currentPlayerFromDb.isAI = false;
    currentPlayerFromDb.isDisconnected = false;
    await gameRecord.save();
    console.log(`⏸️ Skipping auto-turn - player is actually human and connected`);
    return;
  }

  console.log(`🤖 Auto-playing for ${currentPlayerFromDb.color} (isAI: ${currentPlayerFromDb.isAI}, isDisconnected: ${currentPlayerFromDb.isDisconnected})`);

  // 1. ROLL
  console.log(`🤖 Step 1: Attempting auto-roll for ${currentPlayerFromDb.color}`);
  let result = await gameEngine.handleAutoRoll(gameId);

  if (!result.success) {
    console.log(`🤖 Auto-roll failed (${result.message}), trying auto-move instead`);
    // Maybe it wasn't ROLLING state (already moved?), check if we need to Move
    result = await gameEngine.handleAutoMove(gameId);
  }

  if (result.success) {
    console.log(`🤖 Auto-turn completed successfully for ${currentPlayerFromDb.color}`);
    // Ensure state is a plain object
    const plainState = result.state.toObject ? result.state.toObject() : result.state;

    // Ensure dice value is a number
    if (plainState.diceValue !== null && plainState.diceValue !== undefined) {
      plainState.diceValue = Number(plainState.diceValue);
    }

    io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

    // CRITICAL FIX: Handle "No legal moves" scenario for auto-rolls
    // If no moves available, show the dice value for 1.2 seconds before passing turn (same as local game)
    if (plainState.legalMoves && plainState.legalMoves.length === 0 && plainState.diceValue !== null && plainState.turnState === 'MOVING') {
      console.log(`⏱️ [Auto-Turn] No moves available, showing dice value ${plainState.diceValue} for 1.2 seconds before passing turn`);
      setTimeout(async () => {
        const Game = require('./models/Game');
        const gameEngine = require('./logic/gameEngine');
        const game = await Game.findOne({ gameId });
        if (game && game.turnState === 'MOVING' && game.legalMoves.length === 0) {
          console.log(`🔄 [Auto-Turn] Passing turn after showing dice value`);
          // Clear diceValue and transition to next turn
          const nextPlayerIndex = gameEngine.getNextPlayerIndex(game, game.currentPlayerIndex, false);
          game.currentPlayerIndex = nextPlayerIndex;
          game.diceValue = null;
          game.turnState = 'ROLLING';
          game.legalMoves = [];

          const nextPlayer = game.players[nextPlayerIndex];
          game.message = `Waiting for ${nextPlayer?.color || 'player'}...`;

          console.log(`🔄 [Auto-Turn] Turn passed: nextPlayerIndex=${nextPlayerIndex}, nextPlayer=${nextPlayer?.color}`);
          await game.save();

          const updatedState = game.toObject ? game.toObject() : game;
          io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });

          // Schedule next player's turn if needed
          if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
          }
        }
      }, 1200);
      return; // Done with this turn sequence
    }

    // 2. IF Rolling succeeded AND moves are available, we are now in MOVING state. Schedule Move.
    //    IF Moving succeeded, we are now in ROLLING state (next turn).

    const game = result.state;

    // If we just rolled, we must move
    if (game.turnState === 'MOVING') {
      scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_QUICK_MOVE); // Wait a very short time before the bot moves
      return;
    }

    // If we just moved, turn ended. Check NEXT player from database
    if (game.turnState === 'ROLLING') {
      // Re-fetch game record to get updated player index
      const updatedGameRecord = await Game.findOne({ gameId });
      if (updatedGameRecord) {
        const nextPlayerIndex = updatedGameRecord.currentPlayerIndex;
        const nextPlayerFromDb = updatedGameRecord.players[nextPlayerIndex];
        if (nextPlayerFromDb && (nextPlayerFromDb.isAI || nextPlayerFromDb.isDisconnected)) {
          console.log(`🤖 Next player ${nextPlayerFromDb.color} is AI or disconnected, scheduling auto-turn`);
          scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL); // Next player is also bot/afk
        } else if (nextPlayerFromDb && !nextPlayerFromDb.isAI && !nextPlayerFromDb.isDisconnected) {
          console.log(`✅ Next player ${nextPlayerFromDb.color} is human and connected, starting 8s timer`);
          scheduleHumanPlayerAutoRoll(gameId);
        }
      }
    }
  }
};

const scheduleNextAction = async (gameId) => {
  try {
    console.log(`[SCHEDULE] Scheduling next action for game ${gameId}.`);
    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });

    if (!game) {
      console.log(`[SCHEDULE] Game ${gameId} not found. Aborting.`);
      return;
    }
    if (game.status !== 'ACTIVE') {
      console.log(`[SCHEDULE] Game ${gameId} is not active. Aborting.`);
      return;
    }
    if (game.turnState !== 'ROLLING') {
      console.log(`[SCHEDULE] Game ${gameId} is not in ROLLING state. Aborting schedule.`);
      return;
    }

    // Clear any existing timers for this game
    if (humanPlayerTimers.has(gameId)) {
      clearTimeout(humanPlayerTimers.get(gameId));
      humanPlayerTimers.delete(gameId);
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) {
      console.error(`[SCHEDULE] FATAL: Current player not found at index ${game.currentPlayerIndex} for game ${gameId}.`);
      return;
    }

    console.log(`[SCHEDULE] Current player is ${currentPlayer.color}.`);

    // Schedule next action
    if (currentPlayer.isAI || currentPlayer.isDisconnected) {
      console.log(`[SCHEDULE] Player is AI/Disconnected. Scheduling auto-turn.`);
      scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
    } else {
      console.log(`[SCHEDULE] Player is Human. Scheduling auto-roll timer.`);
      scheduleHumanPlayerAutoRoll(gameId);
    }

  } catch (error) {
    console.error(`[SCHEDULE] CRITICAL ERROR in scheduleNextAction for game ${gameId}:`, error);
    io.to(gameId).emit('ERROR', { message: 'A critical server error occurred while scheduling the next turn.' });
  }
};

// --- State Consistency Checker (Repairs stuck games) ---
// Fix for Issue #4: Reduced frequency from 5s to 30s to reduce database load
const runStateConsistencyChecker = () => {
  const CHECK_INTERVAL_MS = 30000; // every 30s (was 5s - 6x improvement)
  setInterval(async () => {
    try {
      const Game = require('./models/Game');
      const now = Date.now();
      const STALE_THRESHOLD_MS = 5000; // 5 seconds

      const activeGames = await Game.find({ status: 'ACTIVE' });
      for (const game of activeGames) {
        let changed = false;

        // Repair: MOVING state with missing diceValue (longer than threshold)
        if (game.turnState === 'MOVING' && (game.diceValue === null || game.diceValue === undefined)) {
          const updatedAtMs = new Date(game.updatedAt).getTime();
          if (updatedAtMs + STALE_THRESHOLD_MS < now) {
            console.log(`🔧 ConsistencyFix: Game ${game.gameId} stuck in MOVING with null diceValue. Resetting to ROLLING.`);
            game.turnState = 'ROLLING';
            game.diceValue = null;
            game.legalMoves = [];
            game.message = (game.message || '') + ' | Recovered from stale MOVING state';
            changed = true;
          }
        }

        // Repair: ROLLING state but a stray diceValue exists
        if (game.turnState === 'ROLLING' && game.diceValue !== null && game.diceValue !== undefined) {
          console.log(`🔧 ConsistencyFix: Game ${game.gameId} in ROLLING had stray diceValue. Clearing diceValue.`);
          game.diceValue = null;
          game.legalMoves = [];
          game.message = (game.message || '') + ' | Cleared stray diceValue';
          changed = true;
        }

        // Repair: player has socketId but flagged disconnected
        for (const player of game.players) {
          if (player.socketId && player.isDisconnected) {
            console.log(`🔧 ConsistencyFix: Player ${player.color} in game ${game.gameId} has socketId but isDisconnected=true. Fixing flag.`);
            player.isDisconnected = false;
            changed = true;
          }
        }

        if (changed) {
          await game.save();
          const plainState = game.toObject ? game.toObject() : game;
          console.log(`📤 ConsistencyFix: Emitting GAME_STATE_UPDATE for game ${game.gameId}`);
          try { io.to(game.gameId).emit('GAME_STATE_UPDATE', { state: plainState }); } catch (e) { console.warn('⚠️ Failed to emit GAME_STATE_UPDATE during consistency fix', e); }

          // Re-evaluate scheduling for this game
          try { scheduleNextAction(game.gameId); } catch (e) { console.warn('⚠️ Failed to scheduleNextAction after consistency fix', e); }
        }
      }
    } catch (err) {
      console.error('❌ State consistency checker error:', err);
    }
  }, CHECK_INTERVAL_MS);
};

// Start the consistency checker
runStateConsistencyChecker();

// =============================================================================
// CONNECTION HEALTH MONITORING & STUCK STATE DETECTION
// =============================================================================

// Track connection health for each socket
const connectionHealth = new Map(); // socketId -> { lastHeartbeat, lastActivity, gameId }

// Heartbeat monitoring - check every 10 seconds
setInterval(() => {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 20000; // 20 seconds without heartbeat = consider dead

  for (const [socketId, health] of connectionHealth.entries()) {
    const timeSinceHeartbeat = now - health.lastHeartbeat;

    if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`💔 Socket ${socketId} missed heartbeat (${Math.floor(timeSinceHeartbeat / 1000)}s), forcing disconnect`);

      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        // Trigger disconnect handler
        socket.disconnect(true);
      }

      connectionHealth.delete(socketId);
    }
  }
}, 10000); // Check every 10 seconds

// Stuck state detection - check every 60 seconds (reduced from 30s for less aggressiveness)
setInterval(async () => {
  try {
    const now = Date.now();

    const Game = require('./models/Game');
    const stuckGames = await Game.find({
      status: 'ACTIVE',
      turnState: { $ne: 'GAMEOVER' },
      updatedAt: { $lt: new Date(now - 300000) } // Find games inactive for at least 5 minutes (was 2 min)
    }).limit(10); // Process max 10 stuck games per check

    for (const game of stuckGames) {
      const timeSinceUpdate = Math.floor((now - game.updatedAt.getTime()) / 1000);
      console.log(`⚠️ Detected potentially stuck game ${game.gameId} - last update ${timeSinceUpdate}s ago`);

      // Check if current player is stuck
      const currentPlayer = game.players[game.currentPlayerIndex];
      if (!currentPlayer) continue;

      // Determine timeout based on player type
      // Human players get 10 minutes (more lenient), AI/disconnected get 5 minutes
      const HUMAN_STUCK_TIMEOUT = 600000;  // 10 minutes for human players (was 5 min)
      const AI_STUCK_TIMEOUT = 300000;     // 5 minutes for AI/disconnected players (was 2 min)

      const isHumanPlayer = currentPlayer.socketId && !currentPlayer.isAI && !currentPlayer.isDisconnected;
      const stuckTimeout = isHumanPlayer ? HUMAN_STUCK_TIMEOUT : AI_STUCK_TIMEOUT;
      const gameStuckTime = now - game.updatedAt.getTime();

      // Only force takeover if timeout exceeded
      if (gameStuckTime < stuckTimeout) {
        console.log(`⏳ Game ${game.gameId} inactive for ${timeSinceUpdate}s, but within ${isHumanPlayer ? 'human' : 'AI'} tolerance (${stuckTimeout / 1000}s)`);
        continue;
      }

      // Verify socket is truly disconnected before forcing bot takeover
      const socketExists = currentPlayer.socketId && io.sockets.sockets.has(currentPlayer.socketId);

      if (!socketExists) {
        console.log(`🤖 Forcing bot takeover for stuck player ${currentPlayer.color} in game ${game.gameId}`);
        console.log(`   Reason: Socket ${currentPlayer.socketId ? 'disconnected' : 'missing'}, inactive for ${timeSinceUpdate}s`);

        // Mark as disconnected and trigger auto-turn
        currentPlayer.isDisconnected = true;
        currentPlayer.socketId = null;
        await game.save();

        // Broadcast updated state
        const plainState = game.toObject ? game.toObject() : game;
        io.to(game.gameId).emit('GAME_STATE_UPDATE', { state: plainState });

        // Trigger auto-turn with stuck recovery delay
        scheduleAutoTurn(game.gameId, AUTO_TURN_DELAYS.STUCK_RECOVERY);
      } else {
        console.log(`✋ Skipping bot takeover for ${currentPlayer.color} in game ${game.gameId} - socket still connected despite ${timeSinceUpdate}s inactivity`);
      }
    }

    // Cleanup completed games older than 5 minutes
    const CLEANUP_THRESHOLD = 300000; // 5 minutes
    const oldGames = await Game.find({
      status: 'COMPLETED',
      updatedAt: { $lt: new Date(now - CLEANUP_THRESHOLD) }
    }).limit(20); // Cleanup max 20 games per check

    if (oldGames.length > 0) {
      const gameIds = oldGames.map(g => g.gameId);
      await Game.deleteMany({ gameId: { $in: gameIds } });
      console.log(`🧹 Cleaned up ${oldGames.length} completed games`);
    }

  } catch (error) {
    console.error('❌ Error in stuck state detection:', error);
  }
}, 60000); // Check every 60 seconds (was 30s, reduced aggressiveness)

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Initialize connection health tracking
  connectionHealth.set(socket.id, {
    lastHeartbeat: Date.now(),
    lastActivity: Date.now(),
    gameId: null
  });

  // Heartbeat handler - client should send this every 10 seconds
  socket.on('heartbeat', () => {
    const health = connectionHealth.get(socket.id);
    if (health) {
      health.lastHeartbeat = Date.now();
      health.lastActivity = Date.now();
    }
    // Send acknowledgment
    socket.emit('heartbeat_ack', { timestamp: Date.now() });
  });

  // Connection health check request
  socket.on('connection_health_check', () => {
    socket.emit('connection_health_response', {
      status: 'ok',
      timestamp: Date.now(),
      latency: 0  // Client will calculate actual latency
    });
  });

  // Track game association
  socket.on('track_game', ({ gameId }) => {
    const health = connectionHealth.get(socket.id);
    if (health) {
      health.gameId = gameId;
    }
  });

  // Update last activity on any event
  const originalEmit = socket.emit;
  socket.emit = function (...args) {
    const health = connectionHealth.get(socket.id);
    if (health) {
      health.lastActivity = Date.now();
    }
    return originalEmit.apply(socket, args);
  };

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    connectionHealth.delete(socket.id);
  });

  // --- USER REGISTRATION FOR NOTIFICATIONS ---
  socket.on('register_user', ({ userId }) => {
    if (userId) {
      socket.data.userId = userId; // Store userId for recovery logic
      const userRoom = `user_${userId}`;
      socket.join(userRoom);

      // Log all rooms this socket is in for debugging
      const rooms = Array.from(socket.rooms);
      console.log(`👤 User ${userId} registered for notifications in room: ${userRoom}`);
      console.log(`📋 Socket ${socket.id} is now in rooms: ${rooms.join(', ')}`);

      // Send confirmation back to client
      socket.emit('registration_confirmed', { userId, room: userRoom, socketId: socket.id });
    } else {
      console.warn(`⚠️ register_user called without userId from socket ${socket.id}`);
    }
  });

  // --- MATCH REQUEST CREATION ---
  socket.on('create_match_request', async ({ stake, userId, userName }) => {
    console.log(`🎮 Creating match request: User ${userName || userId}, Stake: $${stake}`);

    try {
      // --- FIX: Convert stake to number immediately for consistent type handling ---
      const numericStake = parseFloat(stake);

      // Validate stake
      if (!numericStake || numericStake <= 0 || isNaN(numericStake)) {
        socket.emit('ERROR', { message: 'Invalid stake amount' });
        return;
      }

      // Validate user
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('ERROR', { message: 'User not found' });
        return;
      }

      // Check if user is Super Admin
      if (user.role === 'SUPER_ADMIN') {
        socket.emit('ERROR', { message: 'Super Admin cannot create match requests' });
        return;
      }

      // Check balance
      if (user.balance < numericStake - 0.001) {
        socket.emit('ERROR', { message: 'Insufficient funds to create match request' });
        return;
      }

      // Generate unique request ID
      const requestId = crypto.randomBytes(8).toString('hex');
      const expiresAt = Date.now() + 120000; // 2 minutes

      // Create request object
      const request = {
        requestId,
        userId,
        userName: userName || user.username,
        stake: numericStake,
        socketId: socket.id,
        expiresAt,
        createdAt: Date.now()
      };

      // Store request
      activeMatchRequests.set(requestId, request);

      // Set expiration timer
      const timer = setTimeout(() => {
        console.log(`⏰ Match request ${requestId} expired`);
        activeMatchRequests.delete(requestId);
        requestTimers.delete(requestId);

        // Notify creator
        const creatorSocket = io.sockets.sockets.get(request.socketId);
        if (creatorSocket) {
          creatorSocket.emit('match_request_expired', { requestId });
        }

        // Broadcast removal
        io.emit('match_request_removed', { requestId });
      }, 120000); // 2 minutes

      requestTimers.set(requestId, timer);

      // Confirm creation to creator
      socket.emit('match_request_created', { requestId });

      // Broadcast new request to all clients EXCEPT creator
      const broadcastRequest = {
        requestId,
        userId,
        userName: userName || user.username,
        stake: numericStake,
        timeRemaining: 60
      };

      socket.broadcast.emit('new_match_request', { request: broadcastRequest });

      // 📲 SEND PUSH NOTIFICATIONS to eligible players
      try {
        // Find all users with sufficient balance who are not the creator or Super Admin
        const eligibleUsers = await User.find({
          _id: { $ne: userId }, // Not the creator
          role: { $ne: 'SUPER_ADMIN' }, // Not Super Admin
          balance: { $gte: numericStake }, // Has sufficient funds (using numeric type)
          pushSubscriptions: { $exists: true, $ne: [] } // Has push subscriptions
        });

        console.log(`📤 Found ${eligibleUsers.length} eligible users for push notification about match request (stake: $${numericStake})`);

        // Send push notification to each eligible user
        for (const eligibleUser of eligibleUsers) {
          const pushPayload = {
            title: '🎮 New Match Request!',
            body: `${userName || user.username} wants to play for $${numericStake}`,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            data: {
              type: 'match_request',
              requestId,
              stake: numericStake,
              userName: userName || user.username,
              url: '/multiplayer'
            }
          };

          await sendPushNotificationToUser(eligibleUser._id, pushPayload);
        }

        console.log(`✅ Push notifications sent for match request ${requestId} to ${eligibleUsers.length} eligible players`);
      } catch (pushError) {
        console.error('❌ Error sending push notifications for match request:', pushError);
        // Don't fail the request creation just because push failed
      }

      console.log(`✅ Match request ${requestId} created by ${userName || userId}, broadcasting to ${io.sockets.sockets.size - 1} other clients`);
    } catch (error) {
      console.error('❌ Error in create_match_request:', error);
      socket.emit('ERROR', { message: 'Failed to create match request: ' + error.message });
    }
  });

  // Accept a match request
  socket.on('accept_match_request', async ({ requestId, userId, userName }) => {
    console.log(`✋ Player ${userName || userId} accepting match request ${requestId}`);

    try {
      const request = activeMatchRequests.get(requestId);
      if (!request) {
        socket.emit('ERROR', { message: 'Match request no longer available' });
        return;
      }

      // Prevent self-acceptance
      if (request.userId === userId) {
        socket.emit('ERROR', { message: 'Cannot accept your own match request' });
        return;
      }

      // Validate acceptor
      const acceptor = await User.findById(userId);
      if (!acceptor) {
        socket.emit('ERROR', { message: 'User not found' });
        return;
      }

      if (acceptor.role === 'SUPER_ADMIN') {
        socket.emit('ERROR', { message: 'Super Admin cannot participate in games' });
        return;
      }

      if (acceptor.balance < request.stake - 0.001) {
        socket.emit('ERROR', { message: 'Insufficient funds' });
        return;
      }

      // Validate creator still has balance
      const creator = await User.findById(request.userId);
      if (!creator || creator.balance < request.stake - 0.001) {
        // Cancel request
        activeMatchRequests.delete(requestId);
        const timer = requestTimers.get(requestId);
        if (timer) {
          clearTimeout(timer);
          requestTimers.delete(requestId);
        }
        io.emit('match_request_removed', { requestId });
        socket.emit('ERROR', { message: 'Request creator no longer has sufficient funds' });
        return;
      }

      // Remove request from active list
      activeMatchRequests.delete(requestId);
      const timer = requestTimers.get(requestId);
      if (timer) {
        clearTimeout(timer);
        requestTimers.delete(requestId);
      }

      // Broadcast removal
      io.emit('match_request_accepted', { requestId, acceptorName: userName || acceptor.username });

      // Create the match
      console.log(`🎯 Creating match between ${request.userName} and ${userName || acceptor.username}`);
      await createMatch(
        { socketId: request.socketId, userId: request.userId, userName: request.userName },
        { socketId: socket.id, userId, userName: userName || acceptor.username },
        request.stake
      );

      console.log(`✅ Match request ${requestId} accepted, game created`);
    } catch (error) {
      console.error('Error in accept_match_request:', error);
      socket.emit('ERROR', { message: 'Failed to accept match request: ' + error.message });
    }
  });

  // Cancel own match request
  socket.on('cancel_match_request', async ({ requestId, userId }) => {
    console.log(`❌ Player ${userId} canceling match request ${requestId}`);

    try {
      const request = activeMatchRequests.get(requestId);
      if (!request) {
        socket.emit('ERROR', { message: 'Match request not found' });
        return;
      }

      // Verify ownership
      if (request.userId !== userId) {
        socket.emit('ERROR', { message: 'Cannot cancel another player\'s request' });
        return;
      }

      // Remove request
      activeMatchRequests.delete(requestId);
      const timer = requestTimers.get(requestId);
      if (timer) {
        clearTimeout(timer);
        requestTimers.delete(requestId);
      }

      // Broadcast cancellation
      io.emit('match_request_cancelled', { requestId });

      socket.emit('match_request_cancel_success', { requestId });
      console.log(`✅ Match request ${requestId} cancelled`);
    } catch (error) {
      console.error('Error in cancel_match_request:', error);
      socket.emit('ERROR', { message: 'Failed to cancel match request: ' + error.message });
    }
  });

  // Get all active match requests
  socket.on('get_active_requests', async ({ userId }) => {
    try {
      const user = await User.findById(userId);
      const userBalance = user ? user.balance : 0;

      const requests = Array.from(activeMatchRequests.values())
        .filter(req => req.userId !== userId) // Exclude own requests
        .map(req => ({
          ...req,
          canAccept: userBalance >= req.stake,
          timeRemaining: Math.max(0, Math.floor((req.expiresAt - Date.now()) / 1000))
        }));

      socket.emit('active_requests', { requests });
    } catch (error) {
      console.error('Error in get_active_requests:', error);
      socket.emit('ERROR', { message: 'Failed to get active requests' });
    }
  });

  // --- GAME EVENTS ---

  // Watch a game (Spectator Mode)
  socket.on('watch_game', async ({ gameId }) => {
    console.log(`👀 Client ${socket.id} watching game ${gameId}`);
    socket.join(gameId);

    // Send current state immediately
    const Game = require('./models/Game');
    try {
      const game = await Game.findOne({ gameId });
      if (game) {
        const gameState = game.toObject ? game.toObject() : game;
        socket.emit('GAME_STATE_UPDATE', { state: gameState });
        console.log(`📤 Sent initial state to spectator ${socket.id} for game ${gameId}`);
      } else {
        socket.emit('ERROR', { message: 'Game not found' });
      }
    } catch (error) {
      console.error('Error fetching game for spectator:', error);
      socket.emit('ERROR', { message: 'Failed to fetch game state' });
    }
  });

  socket.on('join_game', async ({ gameId, userId, playerColor }) => {
    console.log(`🎮 Player ${userId} joining game ${gameId} as ${playerColor}`);
    socket.join(gameId);
    socket.gameId = gameId; // Map socket to game for disconnect handling

    const result = await gameEngine.handleJoinGame(gameId, userId, playerColor, socket.id); // Pass socket.id

    if (result.success && result.state) {
      const game = result.state.toObject ? result.state.toObject() : result.state;
      const plainState = game.toObject ? game.toObject() : game;

      console.log(`✅ Sending GAME_STATE_UPDATE for game ${gameId} after join/rejoin.`);
      io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

      // After rejoining, check if it's an AI/disconnected player's turn and schedule an auto-turn if needed.
      if (game.status === 'ACTIVE' && game.gameStarted && game.turnState === 'ROLLING') {
        const currentPlayer = game.players[game.currentPlayerIndex];

        // Check if the rejoining player is the current player
        if (currentPlayer && currentPlayer.userId === userId) {
          // If the current player is the rejoining player, and they are now human and connected
          if (!currentPlayer.isAI && !currentPlayer.isDisconnected) {
            console.log(`✅ Post-rejoin check: Reconnected human player ${currentPlayer.color} is current player. Scheduling auto-roll timer.`);
            scheduleHumanPlayerAutoRoll(gameId);
          } else if (currentPlayer.isAI || currentPlayer.isDisconnected) {
            // If it's the rejoining player's turn but they are still AI/disconnected (shouldn't happen after handleJoinGame)
            console.log(`🤖 Post-rejoin check: Reconnected player ${currentPlayer.color} is current player, but still AI/disconnected. Scheduling auto-turn.`);
            scheduleAutoTurn(gameId, 1500);
          }
        } else if (currentPlayer && (currentPlayer.isAI || currentPlayer.isDisconnected)) {
          // If it's another player's turn and they are AI/disconnected
          console.log(`🤖 Post-rejoin check: Current player ${currentPlayer.color} is AI/disconnected (not the rejoining player). Scheduling auto-turn.`);
          scheduleAutoTurn(gameId, 1500);
        }
      }
    } else {
      socket.emit('ERROR', { message: result.message || 'Failed to join game.' });
    }
  });

  socket.on('roll_dice', async ({ gameId }) => {
    console.log(`🎲 Player ${socket.id} rolling dice in game ${gameId}`);

    if (!gameId) {
      console.error(`❌ roll_dice: Missing gameId from socket ${socket.id}`);
      socket.emit('ERROR', { message: 'Game ID is required' });
      return;
    }

    try {
      // Get current game state for debugging
      const Game = require('./models/Game');
      const currentGame = await Game.findOne({ gameId });

      if (!currentGame) {
        console.error(`❌ roll_dice: Game ${gameId} not found`);
        socket.emit('ERROR', { message: 'Game not found' });
        return;
      }

      if (currentGame) {
        const currentPlayer = currentGame.players[currentGame.currentPlayerIndex];
        console.log(`🎲 Game state before roll: turnState=${currentGame.turnState}, currentPlayer=${currentPlayer?.color}, isAI=${currentPlayer?.isAI}, socketId=${currentPlayer?.socketId}, requestSocket=${socket.id}, diceValue=${currentGame.diceValue}`);

        // Verify socket is in the game room
        const socketRooms = Array.from(socket.rooms);
        if (!socketRooms.includes(gameId)) {
          console.warn(`⚠️ Socket ${socket.id} not in game room ${gameId}, joining now...`);
          socket.join(gameId);
        }
      }

      // CRITICAL: Clear any pending auto-roll timer since player is rolling manually
      if (humanPlayerTimers.has(gameId)) {
        clearTimeout(humanPlayerTimers.get(gameId));
        humanPlayerTimers.delete(gameId);
        console.log(`🧹 Cleared pending auto-roll timer for game ${gameId} (player rolling manually)`);
      }

      // FIX: Player is actively rolling - clear isDisconnected flag to prevent bot takeover
      const Game = require('./models/Game');
      const gameBeforeRoll = await Game.findOne({ gameId });
      if (gameBeforeRoll) {
        const currentPlayer = gameBeforeRoll.players[gameBeforeRoll.currentPlayerIndex];
        if (currentPlayer && currentPlayer.socketId === socket.id && currentPlayer.isDisconnected) {
          console.log(`🔧 Player ${currentPlayer.color} is rolling dice - clearing isDisconnected flag`);
          await Game.updateOne(
            { gameId, 'players.socketId': socket.id },
            { $set: { 'players.$.isDisconnected': false } }
          );
        }
      }

      const result = await gameEngine.handleRollDice(gameId, socket.id);

      if (!result) {
        console.error(`❌ roll_dice: handleRollDice returned null/undefined for game ${gameId}`);
        socket.emit('ERROR', { message: 'Failed to roll dice' });
        return;
      }

      if (result.success) {
        console.log(`✅ Dice rolled successfully: ${result.state.diceValue}, sending update to game ${gameId}`);

        // Convert Mongoose document to plain object to ensure all fields are included
        const gameState = result.state.toObject ? result.state.toObject() : result.state;
        console.log(`📤 Sending GAME_STATE_UPDATE with diceValue: ${gameState.diceValue}, turnState: ${gameState.turnState}`);

        // Ensure the dice value is properly set before sending to clients
        if (gameState.diceValue !== null && gameState.diceValue !== undefined) {
          gameState.diceValue = Number(gameState.diceValue);
        }

        io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });

        // If human player has legal moves, start auto-move timer
        if (gameState.legalMoves && gameState.legalMoves.length > 0) {
          const currentPlayer = gameState.players[gameState.currentPlayerIndex];
          if (currentPlayer && !currentPlayer.isAI && !currentPlayer.isDisconnected) {
            console.log(`✅ Human player has legal moves. Starting 18s auto-move timer.`);
            scheduleHumanPlayerAutoMove(gameId);
          }
        }
        // If no moves available, show the dice value for 1.2 seconds before passing turn (same as local game)
        else if (gameState.legalMoves && gameState.legalMoves.length === 0 && gameState.diceValue !== null) {
          console.log(`⏱️ No moves available, showing dice value ${gameState.diceValue} for 1.2 seconds before passing turn (matching local game)`);

          // Clear any auto-move timer since we are handling it here
          if (humanPlayerTimers.has(gameId)) {
            clearTimeout(humanPlayerTimers.get(gameId));
            humanPlayerTimers.delete(gameId);
          }

          setTimeout(async () => {
            const Game = require('./models/Game');
            const gameEngine = require('./logic/gameEngine');
            const game = await Game.findOne({ gameId });
            if (game && game.turnState === 'MOVING' && game.legalMoves.length === 0) {
              console.log(`🔄 Passing turn after showing dice value (matching local game NEXT_TURN behavior)`);
              // Clear diceValue and transition to next turn (same as local game NEXT_TURN action)
              const nextPlayerIndex = gameEngine.getNextPlayerIndex(game, game.currentPlayerIndex, false);
              game.currentPlayerIndex = nextPlayerIndex;
              game.diceValue = null;
              game.turnState = 'ROLLING';
              game.legalMoves = [];

              const nextPlayer = game.players[nextPlayerIndex];
              game.message = `Waiting for ${nextPlayer?.username || nextPlayer?.color || 'player'}...`;

              console.log(`🔄 Turn passed: nextPlayerIndex=${nextPlayerIndex}, nextPlayer=${nextPlayer?.color}, turnState=${game.turnState}`);
              await game.save();

              const updatedState = game.toObject ? game.toObject() : game;
              console.log(`📤 Sending GAME_STATE_UPDATE after turn pass: currentPlayerIndex=${updatedState.currentPlayerIndex}, currentPlayer=${updatedState.players?.[updatedState.currentPlayerIndex]?.color}, turnState=${updatedState.turnState}`);
              io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });

              // Schedule next player's turn if needed (use nextPlayer from above)
              if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
                scheduleAutoTurn(gameId, 1500);
              } else if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                scheduleHumanPlayerAutoRoll(gameId);
              }
            }
          }, 1200); // Same delay as local game (1200ms)
        }

        // Check the next player from database, not from the state object
        const Game = require('./models/Game');
        const gameRecord = await Game.findOne({ gameId });
        if (gameRecord && result.state.turnState === 'ROLLING') {
          const nextPlayerIndex = gameRecord.currentPlayerIndex;
          const nextPlayerFromDb = gameRecord.players[nextPlayerIndex];

          if (nextPlayerFromDb) {
            console.log(`🔍 Next player after roll (from DB):`, {
              color: nextPlayerFromDb.color,
              isAI: nextPlayerFromDb.isAI,
              isDisconnected: nextPlayerFromDb.isDisconnected,
              socketId: nextPlayerFromDb.socketId
            });

            // Only schedule auto-turn if player is actually AI or disconnected
            if (nextPlayerFromDb.isAI || nextPlayerFromDb.isDisconnected) {
              console.log(`🤖 Scheduling auto turn for ${nextPlayerFromDb.color} (isAI: ${nextPlayerFromDb.isAI}, isDisconnected: ${nextPlayerFromDb.isDisconnected})`);
              scheduleAutoTurn(gameId);
            } else if (nextPlayerFromDb && !nextPlayerFromDb.isAI && !nextPlayerFromDb.isDisconnected) {
              // This handles the "roll again" case for humans
              console.log(`✅ Human player ${nextPlayerFromDb.color} gets to roll again. Starting 7s auto-roll timer.`);
              scheduleHumanPlayerAutoRoll(gameId);
            } else {
              console.log(`❓ Unexpected state for next player ${nextPlayerFromDb?.color} (isAI: ${nextPlayerFromDb?.isAI}, isDisconnected: ${nextPlayerFromDb?.isDisconnected})`);
            }
          }
        }
      }

      if (!result.success) {
        console.error(`❌ Roll dice failed:`, result.message);
        socket.emit('ERROR', { message: result.message || 'Failed to roll dice' });

        // Resync: If error is "Wait for animation" or "Not rolling state", send latest state
        // This helps if the client is out of sync (e.g. missed the roll event)
        if (result.message === 'Wait for animation' || result.message === 'Not rolling state') {
          console.log(`🔄 Resyncing client ${socket.id} with latest game state due to roll error`);
          const Game = require('./models/Game');
          const currentGame = await Game.findOne({ gameId });
          if (currentGame) {
            const gameState = currentGame.toObject ? currentGame.toObject() : currentGame;
            // Ensure diceValue is number
            if (gameState.diceValue !== null && gameState.diceValue !== undefined) {
              gameState.diceValue = Number(gameState.diceValue);
            }
            socket.emit('GAME_STATE_UPDATE', { state: gameState });
          }
        }
        return;
      }
    } catch (error) {
      console.error(`❌ Error in roll_dice handler:`, error);
      socket.emit('ERROR', { message: 'Error rolling dice: ' + error.message });
    }
  });

  socket.on('move_token', async ({ gameId, tokenId }) => {
    console.log(`🎯 Player ${socket.id} moving token ${tokenId} in game ${gameId}`);

    // Clear any pending human player timer when player moves
    if (humanPlayerTimers.has(gameId)) {
      clearTimeout(humanPlayerTimers.get(gameId));
      humanPlayerTimers.delete(gameId);
    }

    // FIX: Player is actively moving - clear isDisconnected flag to prevent bot takeover
    const Game = require('./models/Game');
    const gameBeforeMove = await Game.findOne({ gameId });
    if (gameBeforeMove) {
      const currentPlayer = gameBeforeMove.players[gameBeforeMove.currentPlayerIndex];
      if (currentPlayer && currentPlayer.socketId === socket.id && currentPlayer.isDisconnected) {
        console.log(`🔧 Player ${currentPlayer.color} is moving token - clearing isDisconnected flag`);
        await Game.updateOne(
          { gameId, 'players.socketId': socket.id },
          { $set: { 'players.$.isDisconnected': false } }
        );
      }
    }

    const result = await gameEngine.handleMoveToken(gameId, socket.id, tokenId);
    if (result.success) {
      // Ensure state is a plain object
      const plainState = result.state.toObject ? result.state.toObject() : result.state;
      console.log(`📤 Sending GAME_STATE_UPDATE after move with diceValue: ${plainState.diceValue}, turnState: ${plainState.turnState}, currentPlayerIndex: ${plainState.currentPlayerIndex}, currentPlayer: ${plainState.players?.[plainState.currentPlayerIndex]?.color}`);

      // --- NEW: Emit a specific event if a token was killed ---
      if (result.killedTokenId) {
        console.log(`💥 Emitting TOKEN_KILLED event for token: ${result.killedTokenId}`);
        // Broadcast to everyone in the game so they all hear the sound
        io.to(gameId).emit('TOKEN_KILLED', { killedTokenId: result.killedTokenId });
      }

      // Ensure turnState is ROLLING for next player
      if (plainState.turnState !== 'ROLLING' && plainState.diceValue === null) {
        console.log(`🔧 Fixing turnState: was ${plainState.turnState}, setting to ROLLING`);
        plainState.turnState = 'ROLLING';
      }

      io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

      // Emit win notification if settlement data is present
      if (result.settlementData) {
        console.log('🎉 Emitting win_notification with data:', result.settlementData);
        // Send notification directly to winner's socket
        const winnerPlayer = plainState.players.find(p => p.userId === result.settlementData.winnerId);
        if (winnerPlayer && winnerPlayer.socketId) {
          io.to(winnerPlayer.socketId).emit('win_notification', result.settlementData);
          console.log(`📢 Win notification sent to ${winnerPlayer.username} (${winnerPlayer.socketId})`);
        } else {
          // Fallback: broadcast to room (client will filter by winnerId)
          io.to(gameId).emit('win_notification', result.settlementData);
          console.log(`📢 Win notification broadcast to game room ${gameId}`);
        }
      }

      // Check the next player from database, not from the state object
      const Game = require('./models/Game');
      const gameRecord = await Game.findOne({ gameId });
      if (gameRecord && plainState.turnState === 'ROLLING') {
        const nextPlayerIndex = gameRecord.currentPlayerIndex;
        const nextPlayerFromDb = gameRecord.players[nextPlayerIndex];

        if (nextPlayerFromDb) {
          console.log(`🔍 Next player after move (from DB):`, {
            color: nextPlayerFromDb.color,
            isAI: nextPlayerFromDb.isAI,
            isDisconnected: nextPlayerFromDb.isDisconnected,
            socketId: nextPlayerFromDb.socketId
          });

          if (nextPlayerFromDb.isAI || nextPlayerFromDb.isDisconnected) {
            console.log(`🤖 Scheduling auto turn for ${nextPlayerFromDb.color} (isAI: ${nextPlayerFromDb.isAI}, isDisconnected: ${nextPlayerFromDb.isDisconnected})`);
            scheduleAutoTurn(gameId);
          } else if (nextPlayerFromDb && !nextPlayerFromDb.isAI && !nextPlayerFromDb.isDisconnected) {
            // This handles the "roll again" case for humans
            console.log(`✅ Next player ${nextPlayerFromDb.color} is human. Starting 7s auto-roll timer.`);
            scheduleHumanPlayerAutoRoll(gameId);
          } else {
            console.log(`❓ Unexpected state for next player ${nextPlayerFromDb?.color} (isAI: ${nextPlayerFromDb?.isAI}, isDisconnected: ${nextPlayerFromDb?.isDisconnected})`);
          }
        }
      }
    } else {
      console.error(`❌ Move token failed:`, result.message);
      socket.emit('ERROR', { message: result.message });
    }
  });

  // --- CHAT EVENTS ---

  // Handle chat messages
  socket.on('send_chat_message', async ({ gameId, userId, message }) => {
    console.log(`💬 Chat message in game ${gameId} from ${userId}: ${message}`);

    try {
      // Find the game to get player information
      const Game = require('./models/Game');
      const game = await Game.findOne({ gameId });

      if (!game) {
        console.error(`❌ Chat message failed: Game ${gameId} not found`);
        return;
      }

      // Find the player who sent the message
      const player = game.players.find(p => p.userId === userId);

      if (!player) {
        console.error(`❌ Chat message failed: Player ${userId} not found in game ${gameId}`);
        return;
      }

      // Broadcast the message to all players in the game room
      const chatData = {
        userId: userId,
        playerColor: player.color,
        playerName: player.username || player.userId,
        message: message,
        timestamp: Date.now()
      };

      // Emit to all players in the game room (including sender)
      io.to(gameId).emit('chat_message', chatData);
      console.log(`📤 Chat message broadcasted to game ${gameId}`);

    } catch (error) {
      console.error('❌ Error handling chat message:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('🔌 Client disconnected:', socket.id);

    // Remove from matchmaking queue
    removeFromQueue(socket.id);

    // Handle game disconnect
    if (socket.gameId) {
      // CRITICAL: Clear any pending timers for this game to prevent memory leaks and dangling actions
      clearAllTimersForGame(socket.gameId);
      console.log(`🧹 Cleared all timers for game ${socket.gameId} due to player disconnect.`);

      const result = await gameEngine.handleDisconnect(socket.gameId, socket.id);
      if (result) {
        // Ensure state is a plain object
        const plainState = result.state.toObject ? result.state.toObject() : result.state;
        io.to(socket.gameId).emit('GAME_STATE_UPDATE', { state: plainState });
        if (result.isCurrentTurn) {
          scheduleAutoTurn(socket.gameId, 1000);
        }
      }
    }
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Scheduled Task: Cleanup Stale Games (Every 6 Hours)
setInterval(async () => {
  try {
    const Game = require('./models/Game');
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
    const Game = require('./models/Game');

    // Update all ACTIVE games to mark players as disconnected
    const result = await Game.updateMany(
      { status: 'ACTIVE' },
      {
        $set: {
          'players.$[].isDisconnected': true,
          'players.$[].socketId': null
        }
      }
    );

    console.log(`✅ Startup cleanup complete: Marked players as disconnected in ${result.modifiedCount} active games. This ensures auto-turns will work if players don't reconnect.`);
  } catch (error) {
    console.error('❌ Startup cleanup failed:', error);
  }
};

// Start server after ensuring DB connection and performing startup cleanup.
(async () => {
  try {
    await ensureMongoConnect();
  } catch (err) {
    console.error('⚠️ ensureMongoConnect() error (non-fatal):', err && err.message ? err.message : err);
  }

  try {
    await performStartupCleanup();
    console.log('✅ Startup cleanup completed');
  } catch (err) {
    console.error('⚠️ Startup cleanup failed (non-critical):', err && err.message ? err.message : err);
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
