// Fix the duplicate ID issue manually
// This handles the case where multiple documents have the same _id

import mongoose from 'mongoose';

const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function fixDuplicateIds() {
  try {
    console.log('🔧 Fixing duplicate _id issue...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    const { default: User } = await import('./backend/models/User.js');

    console.log('📊 Finding all users...');
    const allUsers = await User.find({}).sort({ createdAt: -1 });

    console.log(`Found ${allUsers.length} total user documents\n`);

    // Group by _id to find true duplicates
    const idGroups = {};
    allUsers.forEach(user => {
      const id = user._id.toString();
      if (!idGroups[id]) {
        idGroups[id] = [];
      }
      idGroups[id].push(user);
    });

    console.log('🔍 Checking for duplicate _id values...\n');

    for (const [userId, users] of Object.entries(idGroups)) {
      if (users.length > 1) {
        console.log(`❌ CRITICAL: Found ${users.length} documents with same _id: ${userId}`);
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. Username: ${user.username} | Phone: ${user.phone} | Role: ${user.role} | Balance: $${user.balance}`);
        });

        // For the problematic user 691a421554469a7dd48dd71b
        if (userId === '691a421554469a7dd48dd71b') {
          console.log('\n🎯 Fixing user 610251014 duplicate _id issue...');

          // Sort by balance (keep higher balance) and creation date
          const sorted = users.sort((a, b) => {
            // Higher balance first
            if (a.balance !== b.balance) {
              return b.balance - a.balance;
            }
            // More recent creation first
            return new Date(b.createdAt) - new Date(a.createdAt);
          });

          const keepUser = sorted[0];
          const deleteUsers = sorted.slice(1);

          console.log(`✅ KEEPING: ${keepUser.username} (${keepUser.phone}) - $${keepUser.balance} - Role: ${keepUser.role}`);
          console.log(`🗑️  DELETING ${deleteUsers.length} duplicate(s):`);

          // Delete duplicates by searching for the exact combination
          for (const dup of deleteUsers) {
            console.log(`   Deleting: ${dup.username} (${dup.phone}) - $${dup.balance}`);

            // Use findOneAndDelete with multiple criteria to ensure we delete the right document
            const deleteResult = await User.findOneAndDelete({
              _id: dup._id,
              phone: dup.phone,
              balance: dup.balance
            });

            if (deleteResult) {
              console.log(`   ✅ Successfully deleted duplicate`);
            } else {
              console.log(`   ❌ Failed to delete duplicate`);
            }
          }
        }

        console.log('');
      }
    }

    // Show final state
    console.log('📊 FINAL DATABASE STATE:');
    const finalUsers = await User.find({}).select('username phone role balance _id').sort({ createdAt: -1 });

    console.log(`Total users: ${finalUsers.length}`);
    finalUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone}) - ${user.role} - $${user.balance} - ID: ${user._id}`);
    });

    // Verify the fix
    const adminUser = finalUsers.find(u => u.username === '610251014' && u.role === 'SUPER_ADMIN');
    if (adminUser) {
      console.log(`\n✅ SUCCESS: User 610251014 has single SUPER_ADMIN account with $${adminUser.balance}`);
    } else {
      console.log('\n❌ Issue: Could not find SUPER_ADMIN user 610251014');
    }

  } catch (error) {
    console.error('❌ Error fixing duplicates:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixDuplicateIds();
