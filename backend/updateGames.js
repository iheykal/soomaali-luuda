require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');

async function updateExistingGames() {
  try {
    await mongoose.connect(process.env.CONNECTION_URI);
    console.log('Connected to MongoDB');

    const result = await Game.updateMany(
      { gameStarted: { $exists: false } },
      { $set: { gameStarted: false } }
    );

    console.log('Updated', result.modifiedCount, 'games');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

updateExistingGames();




