require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

// Set a global timeout for the entire operation
const TIMEOUT = 15000; // 15 seconds max

async function deleteActiveGames() {
  const timeoutId = setTimeout(() => {
    console.error('❌ Operation timed out after 15 seconds');
    process.exit(1);
  }, TIMEOUT);

  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 URI:', MONGO_URI.includes('@') ? MONGO_URI.split('@')[1] : MONGO_URI);
    
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    clearTimeout(timeoutId);
    console.log('✅ Connected to MongoDB');

    // Use direct MongoDB operations with timeout
    const db = mongoose.connection.db;
    const gamesCollection = db.collection('games');
    
    // Count before deletion
    const activeCount = await gamesCollection.countDocuments({ status: 'ACTIVE' });
    const waitingCount = await gamesCollection.countDocuments({ status: 'WAITING' });
    console.log(`📊 Found ${activeCount} active games and ${waitingCount} waiting games`);

    // Delete active games
    const activeResult = await gamesCollection.deleteMany({ status: 'ACTIVE' });
    console.log(`✅ Deleted ${activeResult.deletedCount} active games`);

    // Delete waiting games
    const waitingResult = await gamesCollection.deleteMany({ status: 'WAITING' });
    console.log(`✅ Deleted ${waitingResult.deletedCount} waiting games`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    console.log(`\n🎉 Cleanup complete! Total deleted: ${activeResult.deletedCount + waitingResult.deletedCount} games`);
    process.exit(0);
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

deleteActiveGames();



