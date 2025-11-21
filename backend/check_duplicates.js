require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function checkDuplicates() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const phoneOrUsername = '610251014';

    // Find all users with this username/phone
    const users = await User.find({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });

    console.log(`📊 Found ${users.length} user(s) with username/phone: ${phoneOrUsername}\n`);

    users.forEach((user, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Phone: ${user.phone}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log('');
    });

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDuplicates();


