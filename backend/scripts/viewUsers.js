require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function viewUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const users = await User.find().select('-password -resetPasswordToken -resetPasswordExpires');
    
    console.log(`📊 Found ${users.length} users in MongoDB:\n`);
    
    if (users.length === 0) {
      console.log('No users found in database.');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. Username: ${user.username}`);
        if (user.phone) console.log(`   Phone: ${user.phone}`);
        if (user.email) console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.status}`);
        console.log(`   Balance: $${user.balance || 0}`);
        console.log(`   ID: ${user._id}`);
        console.log('');
      });
    }

    // Also check for users with hashed passwords
    const usersWithPassword = await User.find().select('username password');
    console.log('\n🔐 Password Status:');
    usersWithPassword.forEach(user => {
      const isHashed = user.password && user.password.startsWith('$2a$');
      console.log(`   ${user.username}: ${isHashed ? '✅ Hashed (bcrypt)' : '⚠️ Plain text'}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

viewUsers();

