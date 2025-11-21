// Fix duplicate user records issue
// Run: node fix-duplicate-users.js

import mongoose from 'mongoose';

const MONGO_URI = process.env.CONNECTION_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function fixDuplicateUsers() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    const { default: User } = await import('./backend/models/User.js');

    console.log('📊 Finding all users...');
    const allUsers = await User.find({}).sort({ createdAt: -1 });

    // Group users by ID to find duplicates
    const userGroups = {};
    allUsers.forEach(user => {
      const id = user._id.toString();
      if (!userGroups[id]) {
        userGroups[id] = [];
      }
      userGroups[id].push(user);
    });

    console.log('\n🔍 Checking for duplicate user IDs...\n');

    let duplicatesFound = false;
    for (const [userId, users] of Object.entries(userGroups)) {
      if (users.length > 1) {
        duplicatesFound = true;
        console.log(`❌ DUPLICATE ID FOUND: ${userId}`);
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. Username: ${user.username} | Phone: ${user.phone} | Role: ${user.role} | Balance: $${user.balance}`);
        });

        // For the specific user 691a421554469a7dd48dd71b, we want to keep SUPER_ADMIN and remove USER
        if (userId === '691a421554469a7dd48dd71b') {
          console.log('\n🎯 Fixing user 610251014 duplicate records...');

          // Find SUPER_ADMIN and USER versions
          const superAdminUser = users.find(u => u.role === 'SUPER_ADMIN');
          const userRoleUser = users.find(u => u.role === 'USER');

          if (superAdminUser && userRoleUser) {
            console.log('   ✅ Found SUPER_ADMIN version (keeping)');
            console.log('   ❌ Found USER version (will update to SUPER_ADMIN)');

            // Update the USER role account to SUPER_ADMIN
            userRoleUser.role = 'SUPER_ADMIN';
            await userRoleUser.save();

            console.log('   ✅ Updated USER account to SUPER_ADMIN role');
            console.log('   💰 USER account balance: $' + userRoleUser.balance);
            console.log('   💰 SUPER_ADMIN account balance: $' + superAdminUser.balance);

            // Optionally merge balances if needed
            if (userRoleUser.balance > superAdminUser.balance) {
              console.log('   🔄 Transferring higher balance to SUPER_ADMIN account...');
              superAdminUser.balance = userRoleUser.balance;
              await superAdminUser.save();
              console.log('   ✅ Balance updated to $' + superAdminUser.balance);
            }
          }
        }

        console.log('');
      }
    }

    if (!duplicatesFound) {
      console.log('✅ No duplicate user IDs found');
    }

    // Show final state
    console.log('\n📊 FINAL USER STATE:');
    const finalUsers = await User.find({}).select('username phone role balance _id').sort({ createdAt: -1 });

    finalUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.phone}) - ${user.role} - $${user.balance} - ID: ${user._id}`);
    });

    // Check specifically for user 610251014
    const adminUser = finalUsers.find(u => u.username === '610251014' && u.role === 'SUPER_ADMIN');
    if (adminUser) {
      console.log(`\n✅ SUCCESS: User 610251014 is now SUPER_ADMIN with balance $${adminUser.balance}`);
      console.log('💡 Now log out and log back in to refresh your JWT token with SUPER_ADMIN role');
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

fixDuplicateUsers();
