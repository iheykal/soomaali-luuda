// Database inspection script to check user roles and admin access
// Run: node db-inspect.js

import mongoose from 'mongoose';

// Use the provided MongoDB Atlas connection
const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function inspectDatabase() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    console.log('📍 Connection URI:', MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB successfully');

    // Import User model
    const { default: User } = await import('./backend/models/User.js');

    // Get all users
    const allUsers = await User.find({})
      .select('username phone email role status balance createdAt _id')
      .sort({ createdAt: -1 });

    console.log(`\n📊 TOTAL USERS IN DATABASE: ${allUsers.length}\n`);

    // Display all users
    console.log('👥 ALL USERS:');
    console.log('='.repeat(80));
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone})`);
      console.log(`   Role: ${user.role} | Status: ${user.status} | Balance: $${user.balance || 0}`);
      console.log(`   ID: ${user._id} | Created: ${user.createdAt?.toLocaleDateString()}`);
      console.log('');
    });

    // Check specifically for admin roles
    const adminUsers = allUsers.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN');
    console.log(`👑 ADMIN USERS (${adminUsers.length}):`);
    console.log('='.repeat(40));
    adminUsers.forEach(user => {
      console.log(`✅ ${user.username} (${user.phone}): ${user.role}`);
    });

    // Check specifically for user 610251014
    const targetUser = allUsers.find(u => u.username === '610251014' || u.phone === '610251014');
    console.log(`\n🎯 USER 610251014:`);
    console.log('='.repeat(30));
    if (targetUser) {
      console.log(`✅ FOUND:`);
      console.log(`   Username: ${targetUser.username}`);
      console.log(`   Phone: ${targetUser.phone}`);
      console.log(`   Role: ${targetUser.role}`);
      console.log(`   Status: ${targetUser.status}`);
      console.log(`   Balance: $${targetUser.balance || 0}`);
      console.log(`   ID: ${targetUser._id}`);
      console.log(`   Created: ${targetUser.createdAt?.toLocaleString()}`);

      if (targetUser.role !== 'SUPER_ADMIN') {
        console.log(`\n⚠️  ISSUE FOUND: User has role "${targetUser.role}" but needs "SUPER_ADMIN"`);
        console.log('🔧 Fixing role to SUPER_ADMIN...');

        targetUser.role = 'SUPER_ADMIN';
        await targetUser.save();

        console.log('✅ Role updated successfully!');
      } else {
        console.log('\n✅ User already has SUPER_ADMIN role in database');
      }
    } else {
      console.log('❌ User 610251014 not found in database');
    }

    // Check for any users with role issues
    const regularUsers = allUsers.filter(u => u.role === 'USER');
    if (regularUsers.length > 0) {
      console.log(`\n👤 REGULAR USERS (${regularUsers.length}):`);
      regularUsers.forEach(user => {
        console.log(`   ${user.username} (${user.phone})`);
      });
    }

    console.log('\n🎉 DATABASE INSPECTION COMPLETE');
    console.log('💡 If you\'re still getting admin access denied, log out and log back in to refresh your JWT token');

  } catch (error) {
    console.error('❌ Database connection/inspection failed:');
    console.error('Error:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running or not accessible');
      console.log('   - Make sure MongoDB service is running');
      console.log('   - Check if you\'re using MongoDB Atlas (cloud) instead of local');
      console.log('   - Verify CONNECTION_URI environment variable');
    }
  } finally {
    try {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

inspectDatabase();
