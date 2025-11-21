// Script to make a user SUPER_ADMIN
// Run with: node make-superadmin.js

import mongoose from 'mongoose';
import User from './backend/models/User.js';

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function makeSuperAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find user by username or phone
    const usernameOrPhone = '610251014';
    const user = await User.findOne({
      $or: [
        { username: usernameOrPhone },
        { phone: usernameOrPhone }
      ]
    });
    
    if (!user) {
      console.error('❌ User not found:', usernameOrPhone);
      process.exit(1);
    }
    
    console.log(`📋 Found user: ${user.username} (ID: ${user._id})`);
    console.log(`📋 Current role: ${user.role}`);
    
    // Update role to SUPER_ADMIN
    user.role = 'SUPER_ADMIN';
    await user.save();
    
    console.log(`✅ Successfully updated ${user.username} to SUPER_ADMIN`);
    console.log(`✅ User details:`, {
      id: user._id,
      username: user.username,
      role: user.role,
      balance: user.balance
    });
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

makeSuperAdmin();

