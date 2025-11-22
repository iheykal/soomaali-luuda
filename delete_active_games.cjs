require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');
const Game = require('./backend/models/Game');

// Override with the value we found in backend/.env if dotenv fails
const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function deleteActiveGames() {
  try {
    console.log('Connecting to MongoDB at:', MONGO_URI);
    // Increase timeout settings
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000, // Increase timeout to 30s
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB');

    // Find count before deletion
    const count = await Game.countDocuments({ status: 'ACTIVE' });
    console.log(`Found ${count} active games to delete.`);

    // Delete active games
    const result = await Game.deleteMany({ status: 'ACTIVE' });
    console.log(`Deleted ${result.deletedCount} active games.`);
    
    // Also delete WAITING games (in queue) just in case
    const waitingResult = await Game.deleteMany({ status: 'WAITING' });
    console.log(`Deleted ${waitingResult.deletedCount} waiting games.`);

    await mongoose.disconnect();
    console.log('Disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteActiveGames();



