const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const gameEngine = require('./logic/gameEngine');
const User = require('./models/User');
const FinancialRequest = require('./models/FinancialRequest');
const Revenue = require('./models/Revenue');
const RevenueWithdrawal = require('./models/RevenueWithdrawal');
const Game = require('./models/Game');
const { smartUserSync, smartUserLookup } = require('./utils/userSync');

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- DEBUGGING & CORS SETUP (MUST BE FIRST) ---

// 1. Temporary Logging Middleware to inspect incoming requests
app.use((req, res, next) => {
  // Log the origin header of every incoming request
  console.log(`[CORS DEBUG] Incoming Request Origin: ${req.headers.origin}`);
  next();
});

// 2. CORS Configuration
const allowedOrigins = [
  'https://soomaali-ludda.onrender.com', // Deployed frontend
  'http://localhost:5173',               // Common Vite dev port
  'http://localhost:3000',               // Common React dev port
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
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
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.100.32:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV ? "*" : socketOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
  allowEIO3: true, // Allow Engine.IO v3 clients
  pingTimeout: 60000, // Increase ping timeout for network connections
  pingInterval: 25000, // Increase ping interval
  upgradeTimeout: 10000, // Timeout for transport upgrade
  maxHttpBufferSize: 1e6 // 1MB max buffer size
});

app.use(express.json());

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

// Basic Rate Limiter Map (IP -> Timestamp)
const rateLimit = new Map();
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

// Database Connection
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

// Improved MongoDB connection with better error handling and resource limits
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxPoolSize: 10, // Limit connection pool for 512MB RAM (default is 100)
  minPoolSize: 1,
})
  .then(() => {
    console.log('✅ MongoDB Connected successfully');
    console.log('📊 Database:', MONGO_URI.includes('@') ? MONGO_URI.split('@')[1] : MONGO_URI);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('💡 Make sure MongoDB is running and CONNECTION_URI is correct');
    console.error('💡 For local MongoDB: mongodb://localhost:27017/ludo-master');
    console.error('💡 For MongoDB Atlas: Check your connection string in environment variables');
    // Don't exit - let the server start anyway (some features might work without DB)
  });

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

// --- GAME REJOIN ROUTES ---

// GET: Check if user has an active game
app.get('/api/game/check-active/:userId', async (req, res) => {
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
    
    // Validate phone number starts with 61
    if (!normalizedPhone.startsWith('61')) {
      return res.status(400).json({ error: 'Phone number must start with 61' });
    }

    if (normalizedPhone.length < 9) {
      return res.status(400).json({ error: 'Phone number must be at least 9 digits (61xxxxxxx)' });
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
        const withdrawals = await RevenueWithdrawal.find(query).sort({ timestamp: -1 });
        
        const totalRevenue = revenues.reduce((sum, rev) => sum + rev.amount, 0);
        const totalWithdrawn = withdrawals.reduce((sum, wd) => sum + wd.amount, 0);
        const netRevenue = totalRevenue - totalWithdrawn;

        res.json({ 
            success: true, 
            totalRevenue,
            totalWithdrawn,
            netRevenue,
            history: revenues,
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
            const isWinner = game.winners.includes(game.players.find(p => p.userId === userId)?.color);
            const opponent = game.players.find(p => p.userId !== userId);
            
            // Calculate amount won/lost
            // If winner: Won (Pot - Comm) - Stake = Net Gain (approx Stake * 0.8)
            // If loser: Lost Stake
            // For simplicity, we'll show the settlement amount or stake lost
            let amount = 0;
            if (isWinner) {
                amount = (game.stake * 2) * 0.9; // 90% of pot
            } else {
                amount = -game.stake;
            }

            return {
                gameId: game.gameId,
                date: game.updatedAt,
                opponentName: opponent?.username || 'Unknown',
                result: isWinner ? 'WON' : 'LOST',
                amount: amount,
                stake: game.stake
            };
        });

        res.json({
            success: true,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                stats: targetUser.stats,
                balance: targetUser.balance
            },
            history
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
    const { userName, type, amount, details } = req.body;
    
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
        
        // In a real app, we would trigger a notification here
        console.log(`✅ Request ${id} ${action}D by admin ${adminUser.username}. User ${user.username} new balance: $${user.balance}`);

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

// --- MATCHMAKING QUEUE ---
const matchmakingQueue = new Map(); // stake -> [{ socketId, userId, userName, timestamp }]

const findMatch = (stake, socketId, userId, userName) => {
  // First, clean up stale entries (older than 5 minutes) and refund them
  const now = Date.now();
  matchmakingQueue.forEach((players, stakeKey) => {
    const staleEntries = players.filter(p => now - p.timestamp >= 300000);
    staleEntries.forEach(async (stalePlayer) => {
      // Refund stale entries
      try {
        const user = await User.findById(stalePlayer.userId);
        if (user) {
          user.balance += stakeKey;
          await user.save();
          console.log(`💰 Refunded ${stakeKey} to ${user.username} (stale queue entry). New balance: ${user.balance}`);
        }
      } catch (error) {
        console.error('Error refunding stale queue entry:', error);
      }
    });
    
    const filtered = players.filter(p => now - p.timestamp < 300000);
    if (filtered.length === 0) {
      matchmakingQueue.delete(stakeKey);
    } else {
      matchmakingQueue.set(stakeKey, filtered);
    }
  });
  
  // Find a player with the same stake who is not the current player (by socketId)
  // Note: Same userId is allowed (same user in different tabs/browsers)
  const queueForStake = matchmakingQueue.get(stake) || [];
  console.log(`🔍 Checking queue for stake ${stake}: ${queueForStake.length} players waiting`);
  console.log(`🔍 Current player: ${userName || userId} (${socketId}), looking for opponent...`);
  
  // Find an opponent with different socketId (can be same userId)
  const matchIndex = queueForStake.findIndex(p => p.socketId !== socketId && p.socketId);
  
  if (matchIndex !== -1) {
    // Found a match!
    const opponent = queueForStake[matchIndex];
    // Remove opponent from queue
    queueForStake.splice(matchIndex, 1);
    if (queueForStake.length === 0) {
      matchmakingQueue.delete(stake);
    } else {
      matchmakingQueue.set(stake, queueForStake);
    }
    
    console.log(`✅ Match found in queue: ${opponent.userName || opponent.userId} (${opponent.socketId}) matched with ${userName || userId} (${socketId}) for stake ${stake}`);
    return opponent;
  }
  
  // No match found, add to queue
  const player = { socketId, userId, userName, timestamp: Date.now(), stake };
  if (!matchmakingQueue.has(stake)) {
    matchmakingQueue.set(stake, []);
  }
  matchmakingQueue.get(stake).push(player);
  
  const queueSize = matchmakingQueue.get(stake).length;
  console.log(`⏳ Player ${userName || userId} (${socketId}) added to queue for stake ${stake}. Queue size: ${queueSize}`);
  
  // If queue now has 2+ players, trigger immediate matchmaking check
  if (queueSize >= 2) {
    console.log(`🚀 Queue has ${queueSize} players, triggering immediate matchmaking check...`);
    // Use setImmediate to ensure this runs after current execution
    setImmediate(() => {
      processMatchmaking();
    });
  }
  
  return null;
};

// Periodic matchmaking check to handle race conditions
const processMatchmaking = async () => {
  let matchesFound = 0;
  matchmakingQueue.forEach((players, stake) => {
    // If there are 2 or more players with the same stake, match them
    if (players.length >= 2) {
      const player1 = players[0];
      const player2 = players[1];
      
      // Only match if they have different socketIds (can be same userId)
      const matchCondition = player1.socketId !== player2.socketId;
      if (matchCondition) {
        // Remove both from queue
        matchmakingQueue.set(stake, players.slice(2));
        if (matchmakingQueue.get(stake).length === 0) {
          matchmakingQueue.delete(stake);
        }
        
        console.log(`🔄 Periodic match found: ${player1.userName || player1.userId} (${player1.socketId}) matched with ${player2.userName || player2.userId} (${player2.socketId}) for stake ${stake}`);
        
        // Create match for both players
        createMatch(player1, player2, stake);
        matchesFound++;
      } else {
        console.log(`⚠️ Skipping match - same socketId detected: ${player1.socketId}`);
      }
    }
  });
  
  if (matchesFound > 0) {
    console.log(`✅ processMatchmaking: Found ${matchesFound} match(es)`);
  }
};

// Helper function to create a match between two players
const createMatch = async (player1, player2, stake) => {
  const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
  
  // Two-player game: First player = Green, Second player = Blue
  const hostColor = 'green';
  const guestColor = 'blue';
  
  console.log(`✅ Creating game ${gameId} for players: ${player1.userName || player1.userId} (Green) vs ${player2.userName || player2.userId} (Blue)`);
  
  try {
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
    
    // Get sockets
    const socket1 = io.sockets.sockets.get(player1.socketId);
    const socket2 = io.sockets.sockets.get(player2.socketId);
    
    if (!socket1 || !socket2) {
      console.error('❌ One or both sockets not found');
      return;
    }
    
    // Both players join the game room
    socket1.join(gameId);
    socket1.gameId = gameId;
    socket2.join(gameId);
    socket2.gameId = gameId;
    
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
    
    // Notify both players
    socket1.emit('match_found', {
      gameId,
      playerColor: hostColor,
      opponent: { userId: player2.userId, userName: player2.userName },
      stake
    });
    
    socket2.emit('match_found', {
      gameId,
      playerColor: guestColor,
      opponent: { userId: player1.userId, userName: player1.userName },
      stake
    });
    
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
              scheduleAutoTurn(gameId, 1500);
          } else if (firstPlayer) {
              // Player exists but state is unclear - default to NO AUTO-ROLL for safety
              console.log(`⚠️ First player ${firstPlayer.color} state unclear (socketId: ${firstPlayer.socketId}, isAI: ${firstPlayer.isAI}, isDisconnected: ${firstPlayer.isDisconnected}) - defaulting to NO AUTO-ROLL`);
          } else {
              console.log(`⚠️ First player not found`);
          }
        }
      }, 1000); // Increased delay to allow both players to be ready
    }
  } catch (error) {
    console.error(`❌ Error in createMatch for game ${gameId}:`, error);
  }
};

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Handle matchmaking
  socket.on('find_match', async ({ userId, userName, stake }) => {
    console.log(`🙋 Player ${userName || userId} looking for match with stake: ${stake}`);

    // Validate stake
    if (!stake || stake <= 0) {
      socket.emit('ERROR', { message: 'Invalid stake amount' });
      return;
    }

    // Use smart sync to prevent duplicate users and get correct user object
    const syncResult = await smartUserSync(userId, userName, 'find-match');
    if (!syncResult.success || !syncResult.user) {
        socket.emit('ERROR', { message: 'User account could not be verified. Please log in again.' });
        return;
    }
    const user = syncResult.user;

    // Check balance
    if (user.balance < stake) {
      socket.emit('ERROR', { message: 'Insufficient funds' });
      return;
    }

    // Deduct stake from balance immediately
    try {
      user.balance -= stake;
      await user.save();
      console.log(`💰 Deducted ${stake} from ${user.username}. New balance: ${user.balance}`);
    } catch (e) {
      console.error('Error deducting stake:', e);
      socket.emit('ERROR', { message: 'Could not deduct stake. Please try again.' });
      return;
    }
    
    // Pass the synced/verified user details to the matchmaking logic
    const opponent = findMatch(stake, socket.id, user._id, user.username);
    
    if (opponent) {
      // Match found! Create game
      createMatch(
        { socketId: socket.id, userId: user._id, userName: user.username },
        opponent,
        stake
      );
    } else {
      // No match yet, player is in queue
      socket.emit('in_queue', { message: 'Finding opponent...', stake });
    }
  });

  socket.on('cancel_matchmaking', ({ stake }) => {
    if (matchmakingQueue.has(stake)) {
      const queue = matchmakingQueue.get(stake);
      const playerIndex = queue.findIndex(p => p.socketId === socket.id);
      if (playerIndex > -1) {
        const player = queue[playerIndex];
        
        // Refund stake
        User.findById(player.userId).then(user => {
          if (user) {
            user.balance += stake;
            user.save().then(() => {
              console.log(`💰 Refunded ${stake} to ${user.username} after cancelling matchmaking.`);
            });
          }
        });

        queue.splice(playerIndex, 1);
        if (queue.length === 0) {
          matchmakingQueue.delete(stake);
        }
        console.log(`🚫 Player ${socket.id} cancelled matchmaking for stake ${stake}`);
        socket.emit(' matchmaking_cancelled', { message: 'Matchmaking cancelled' });
      }
    }
  });

  socket.on('rejoin_game_socket', async ({ gameId, userId, playerColor }) => {
    try {
        console.log(`↪️ Player ${userId} attempting to rejoin game ${gameId} with color ${playerColor}`);
        const Game = require('./models/Game');
        const game = await Game.findOne({ gameId });
        
        if (!game) {
            socket.emit('ERROR', { message: 'Game not found' });
            return;
        }

        const player = game.players.find(p => p.color === playerColor);
        if (!player) {
            socket.emit('ERROR', { message: 'Player not found in game' });
            return;
        }
        
        // Smart user sync: Ensure user exists and prevent duplicate creation
        const syncResult = await smartUserSync(userId, player.username, 'rejoin-socket');
        if (!syncResult.success) {
          socket.emit('ERROR', { message: 'User account could not be verified. Please log in again.' });
          return;
        }

        // Update player's socketId and disconnected status
        player.socketId = socket.id;
        player.isDisconnected = false;
        
        // Find if this player has another old socket connected and disconnect it
        const oldSocketId = game.players.find(p => p.userId === userId && p.socketId !== socket.id)?.socketId;
        if (oldSocketId) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                console.log(`🔌 Disconnecting old socket ${oldSocketId} for user ${userId}`);
                oldSocket.disconnect();
            }
        }
        
        await game.save();

        socket.join(gameId);
        socket.gameId = gameId;

        const plainState = game.toObject ? game.toObject() : game;
        
        io.to(gameId).emit('player_reconnected', { color: playerColor, socketId: socket.id });
        socket.emit('GAME_STATE_UPDATE', { state: plainState });
        
        console.log(`✅ Player ${userId} reconnected to game ${gameId} as ${playerColor}`);
    } catch (error) {
        console.error('Error rejoining game socket:', error);
        socket.emit('ERROR', { message: 'Failed to rejoin game' });
    }
  });

  // GAME LOGIC LISTENERS
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

        // If state is MOVING, start 20s timer for movement
        if (gameState.turnState === 'MOVING') {
             // Clear any existing timer first
             if (humanPlayerTimers.has(gameId)) {
                 clearTimeout(humanPlayerTimers.get(gameId));
                 humanPlayerTimers.delete(gameId);
             }
             scheduleHumanPlayerAutoMove(gameId);
        }

        // If no moves available, show the dice value for 1.2 seconds before passing turn (same as local game)
        if (gameState.legalMoves && gameState.legalMoves.length === 0 && gameState.diceValue !== null) {
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
              
              console.log(`🔄 Turn passed: nextPlayerIndex=${nextPlayerIndex}, nextPlayer=${nextPlayer?.color}`);
              await game.save();
              
              const updatedState = game.toObject ? game.toObject() : game;
              console.log(`📤 Sending GAME_STATE_UPDATE after turn pass: currentPlayerIndex=${updatedState.currentPlayerIndex}, currentPlayer=${updatedState.players?.[updatedState.currentPlayerIndex]?.color}, turnState=${updatedState.turnState}`);
              io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });
              
              // Schedule next player's turn if needed
              if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) {
                scheduleAutoTurn(gameId, 1500);
              } else if (nextPlayer) {
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
                    console.log(`✅ Next player ${nextPlayerFromDb.color} is human and connected - starting 8s timer`);
                    scheduleHumanPlayerAutoRoll(gameId);
                } else {
                    console.log(`❓ Unexpected state for next player ${nextPlayerFromDb?.color} (isAI: ${nextPlayerFromDb?.isAI}, isDisconnected: ${nextPlayerFromDb?.isDisconnected})`);
                }
            }
        }
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
    
    const result = await gameEngine.handleMoveToken(gameId, socket.id, tokenId);
    if (result.success) {
        // Ensure state is a plain object
        const plainState = result.state.toObject ? result.state.toObject() : result.state;
        console.log(`📤 Sending GAME_STATE_UPDATE after move with diceValue: ${plainState.diceValue}, turnState: ${plainState.turnState}, currentPlayerIndex: ${plainState.currentPlayerIndex}, currentPlayer: ${plainState.players?.[plainState.currentPlayerIndex]?.color}`);
        
        // Ensure turnState is ROLLING for next player
        if (plainState.turnState !== 'ROLLING' && plainState.diceValue === null) {
            console.log(`🔧 Fixing turnState: was ${plainState.turnState}, setting to ROLLING`);
            plainState.turnState = 'ROLLING';
        }
        
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
        
        // Check the next player from database, not from the state object
        const Game = require('./models/Game');
        const gameRecord = await Game.findOne({ gameId });
        if (gameRecord && result.state.turnState === 'ROLLING') {
            const nextPlayerIndex = gameRecord.currentPlayerIndex;
            const nextPlayerFromDb = gameRecord.players[nextPlayerIndex];
            
            if (nextPlayerFromDb) {
                console.log(`🔍 Next player after move (from DB):`, {
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
                    console.log(`✅ Next player ${nextPlayerFromDb.color} is human and connected - starting 8s timer`);
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

  socket.on('disconnect', async () => {
    // Check if player is in matchmaking queue and refund
    let refundedFromQueue = false;
    matchmakingQueue.forEach((players, stake) => {
      const playerIndex = players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const player = players[playerIndex];
        // Refund the stake (only if user exists in database)
        User.findById(player.userId).then(user => {
          if (user) {
            user.balance += stake;
            user.save().then(() => {
              console.log(`💰 Refunded ${stake} to ${user.username || player.userId} (disconnected from queue). New balance: ${user.balance}`);
            });
          } else {
            console.log(`⚠️ User ${player.userId} not found, skipping refund on disconnect (demo mode)`);
          }
        }).catch(err => console.error('Error refunding on disconnect:', err));
        refundedFromQueue = true;
      }
    });
    
    // Remove from matchmaking queue
    removeFromQueue(socket.id);
    
    // Handle game disconnect
    if (socket.gameId) {
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
    
    console.log('🔌 Client disconnected:', socket.id, refundedFromQueue ? '(refunded from queue)' : '');
  });
});

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

// Scheduled Task: Cleanup Stale Games (Every 6 Hours)
setInterval(async () => {
  try {
    const Game = require('./models/Game');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Find games that are 'ACTIVE' but haven't been updated in 24 hours
    const result = await Game.deleteMany({
      status: 'ACTIVE',
      updatedAt: { $lt: twentyFourHoursAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} stale active games`);
    }
  } catch (err) {
    console.error('Game cleanup error:', err);
  }
}, 6 * 60 * 60 * 1000);

// Run cleanup then start server
// Start server even if cleanup fails (non-blocking)
performStartupCleanup()
  .then(() => {
    console.log('✅ Startup cleanup completed');
  })
  .catch((err) => {
    console.error('⚠️ Startup cleanup failed (non-critical):', err.message);
    console.log('🔄 Continuing server startup...');
  })
  .finally(() => {
    // Always start the server, even if cleanup failed
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
  });

// Add detailed error logging middleware to capture unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    headers: req.headers,
  });
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});
