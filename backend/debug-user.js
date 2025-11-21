const mongoose = require('mongoose');
const User = require('./models/User');

async function debugUser() {
  try {
    console.log('🔍 Starting user debug...');
    
    // Use the same connection string as server.js
    const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';
    console.log(`🔗 Connecting to: ${MONGO_URI.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
    
    // Connect to MongoDB with retry logic
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await mongoose.connect(MONGO_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 5000,
        });
        console.log('✅ Connected to MongoDB');
        break;
      } catch (err) {
        console.error(`❌ Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Retrying in ${RETRY_DELAY / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } else {
          throw new Error(`Failed to connect after ${MAX_RETRIES} attempts: ${err.message}`);
        }
      }
    }
    
    const userId = '691a421554469a7dd48dd71b';
    const username = '610251014';
    
    console.log(`\n📋 Checking user ID: ${userId}`);
    console.log(`📋 Checking username: ${username}`);
    
    // Check if user exists with the given ID
    console.log('\n🔍 Searching by ID...');
    const userById = await User.findById(userId);
    console.log('User by ID:', userById ? {
      _id: userById._id,
      username: userById.username,
      balance: userById.balance,
      createdAt: userById.createdAt
    } : 'NOT FOUND');
    
    // Check if user exists with the given username
    console.log('\n🔍 Searching by username...');
    const userByUsername = await User.findOne({ username });
    console.log('User by username:', userByUsername ? {
      _id: userByUsername._id,
      username: userByUsername.username,
      balance: userByUsername.balance,
      createdAt: userByUsername.createdAt
    } : 'NOT FOUND');
    
    // List all users to see what format is used
    console.log('\n📊 All users in database:');
    const allUsers = await User.find({}).select('_id username balance createdAt');
    console.log('Total users:', allUsers.length);
    allUsers.forEach(user => {
      console.log(`- ID: ${user._id} | Username: ${user.username} | Balance: ${user.balance}`);
    });
    
    // Check ID format analysis
    console.log('\n🔍 ID format analysis:');
    console.log(`- Provided ID: ${userId}`);
    console.log(`- Length: ${userId.length}`);
    console.log(`- Is ObjectId format: ${/^[0-9a-fA-F]{24}$/.test(userId)}`);
    console.log(`- Is custom String format: ${userId.startsWith('u')}`);
    console.log(`- Expected format: String starting with 'u' (e.g., 'u123456')`);
    
    await mongoose.disconnect();
    console.log('\n✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugUser();
