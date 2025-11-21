// Script to check all users in database
// Run: node check-database-users.js

import mongoose from 'mongoose';

// Connect to MongoDB
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function checkDatabaseUsers() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(MONGO_URI);

    const { default: User } = await import('./backend/models/User.js');

    console.log('📊 Getting all users...');
    const users = await User.find({}).select('username phone role status _id').sort({ createdAt: -1 });

    console.log(`\n✅ Found ${users.length} users in database:\n`);

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone}) - Role: ${user.role} - Status: ${user.status} - ID: ${user._id}`);
    });

    // Check specifically for admin users
    const adminUsers = users.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN');
    console.log(`\n👑 Admin users: ${adminUsers.length}`);
    adminUsers.forEach(user => {
      console.log(`   - ${user.username}: ${user.role}`);
    });

    // Check for user 610251014 specifically
    const targetUser = users.find(u => u.username === '610251014' || u.phone === '610251014');
    if (targetUser) {
      console.log(`\n🎯 User 610251014 found:`);
      console.log(`   Username: ${targetUser.username}`);
      console.log(`   Phone: ${targetUser.phone}`);
      console.log(`   Role: ${targetUser.role}`);
      console.log(`   Status: ${targetUser.status}`);
      console.log(`   ID: ${targetUser._id}`);
    } else {
      console.log(`\n❌ User 610251014 not found in database`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkDatabaseUsers();
