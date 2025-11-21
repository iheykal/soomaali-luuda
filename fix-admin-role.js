// Fix the specific admin role issue
// The user has duplicate records - one with SUPER_ADMIN and one with USER role
// They are logged in with the USER role account, so we need to update that one

import mongoose from 'mongoose';

const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function fixAdminRole() {
  const { default: User } = await import('./backend/models/User.js');
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    // The problem: User is logged in with USER role account but needs SUPER_ADMIN
    // From the database output, user ID 691a421554469a7dd48dd71b has two records:
    // 1. SUPER_ADMIN with phone "610251014"
    // 2. USER with phone "auto_691a421554469a7dd48dd71b"

    console.log('🎯 Finding the USER role account that needs to be updated...');

    // Find the USER role account (this is what the user is logged in with)
    const userAccount = await User.findOne({
      phone: 'auto_691a421554469a7dd48dd71b',
      role: 'USER'
    });

    if (!userAccount) {
      console.log('❌ USER role account not found');
      return;
    }

    console.log('✅ Found USER role account:');
    console.log(`   Username: ${userAccount.username}`);
    console.log(`   Phone: ${userAccount.phone}`);
    console.log(`   Role: ${userAccount.role}`);
    console.log(`   Balance: $${userAccount.balance}`);
    console.log(`   ID: ${userAccount._id}`);

    // Update this account to SUPER_ADMIN
    userAccount.role = 'SUPER_ADMIN';
    await userAccount.save();

    console.log('\n✅ SUCCESS: Updated USER account to SUPER_ADMIN');
    console.log(`   New role: ${userAccount.role}`);

    // Verify the change
    const updatedUser = await User.findById(userAccount._id);
    if (updatedUser) {
      console.log('\n📊 Verification:');
      console.log(`   Username: ${updatedUser.username}`);
      console.log(`   Phone: ${updatedUser.phone}`);
      console.log(`   Role: ${updatedUser.role} ✅`);
      console.log(`   Balance: $${updatedUser.balance}`);
    }

    console.log('\n🎉 FIX COMPLETE!');
    console.log('💡 Now log out and log back in to refresh your JWT token');
    console.log('   Your account will now have SUPER_ADMIN privileges');

  } catch (error) {
    console.error('❌ Error fixing admin role:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixAdminRole();
