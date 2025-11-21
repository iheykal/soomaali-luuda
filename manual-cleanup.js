// Manual cleanup of duplicate users
// Run: node manual-cleanup.js

import mongoose from 'mongoose';

const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function manualCleanup() {
  try {
    console.log('🧹 Starting manual cleanup...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    const { default: User } = await import('./backend/models/User.js');

    console.log('📊 Current database state:');
    const allUsers = await User.find({}).sort({ createdAt: -1 });

    // Display current state
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone}) - ${user.role} - $${user.balance} - ID: ${user._id}`);
    });

    console.log('\n🔍 Analyzing duplicates...');

    // Find users with same username
    const userGroups = {};
    allUsers.forEach(user => {
      if (!userGroups[user.username]) {
        userGroups[user.username] = [];
      }
      userGroups[user.username].push(user);
    });

    for (const [username, users] of Object.entries(userGroups)) {
      if (users.length > 1) {
        console.log(`\n⚠️  DUPLICATE USERNAME: ${username}`);
        users.forEach((user, idx) => {
          console.log(`   ${idx + 1}. Phone: ${user.phone} | Role: ${user.role} | Balance: $${user.balance} | ID: ${user._id}`);
        });

        // For 610251014, keep the one with higher balance and SUPER_ADMIN role
        if (username === '610251014') {
          console.log('\n🎯 Fixing 610251014 duplicates...');

          // Sort by priority: SUPER_ADMIN > higher balance > real phone (not auto_)
          const sorted = users.sort((a, b) => {
            // SUPER_ADMIN first
            if (a.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN') return -1;
            if (b.role === 'SUPER_ADMIN' && a.role !== 'SUPER_ADMIN') return 1;

            // Higher balance first
            if (a.balance !== b.balance) return b.balance - a.balance;

            // Real phone number first (not auto_)
            const aIsReal = a.phone && !a.phone.startsWith('auto_');
            const bIsReal = b.phone && !b.phone.startsWith('auto_');
            if (aIsReal && !bIsReal) return -1;
            if (bIsReal && !aIsReal) return 1;

            return 0;
          });

          const keepUser = sorted[0];
          const deleteUsers = sorted.slice(1);

          console.log(`✅ KEEPING: ${keepUser.username} (${keepUser.phone}) - ${keepUser.role} - $${keepUser.balance}`);

          // Delete duplicates one by one
          for (const dup of deleteUsers) {
            console.log(`🗑️  DELETING: ${dup.username} (${dup.phone}) - $${dup.balance}`);
            try {
              await User.findByIdAndDelete(dup._id);
              console.log('   ✅ Deleted successfully');
            } catch (deleteError) {
              console.log('   ❌ Delete failed:', deleteError.message);
            }
          }
        }
      }
    }

    console.log('\n📊 FINAL STATE AFTER CLEANUP:');
    const finalUsers = await User.find({}).sort({ createdAt: -1 });

    finalUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone}) - ${user.role} - $${user.balance} - ID: ${user._id}`);
    });

    // Count super admins
    const superAdmins = finalUsers.filter(u => u.role === 'SUPER_ADMIN');
    console.log(`\n👑 SUPER_ADMIN count: ${superAdmins.length}`);

    if (superAdmins.length > 1) {
      console.log('⚠️  Still multiple super admins found!');
    } else if (superAdmins.length === 1) {
      console.log('✅ Perfect: Exactly 1 super admin');
    } else {
      console.log('❌ Error: No super admin found!');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

manualCleanup();
