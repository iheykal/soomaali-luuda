// Force fix for superadmin access - direct database update
// Run: node force-superadmin-fix.js

import mongoose from 'mongoose';

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function forceSuperAdminFix() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(MONGO_URI);

    const { default: User } = await import('./backend/models/User.js');

    // Find user by username or phone
    const user = await User.findOne({
      $or: [
        { username: '610251014' },
        { phone: '610251014' }
      ]
    });

    if (!user) {
      console.log('❌ User 610251014 not found in database');
      return;
    }

    console.log('✅ Found user:', {
      id: user._id,
      username: user.username,
      phone: user.phone,
      currentRole: user.role
    });

    // Force set role to SUPER_ADMIN
    const oldRole = user.role;
    user.role = 'SUPER_ADMIN';
    await user.save();

    console.log(`✅ SUCCESS: Updated ${user.username} role from ${oldRole} to ${user.role}`);
    console.log('💡 Now log out and log back in to refresh your JWT token');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

forceSuperAdminFix();
