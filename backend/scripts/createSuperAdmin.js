require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function createSuperAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const username = '610251014';
    const password = 'ilyaas321';
    
    // Save password as plain text (no hashing)
    console.log('💾 Saving password as plain text\n');

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { username: username },
        { phone: username }
      ]
    });

    if (user) {
      // Update existing user using updateOne and then refetch
      console.log(`📝 Updating existing user: ${username}`);
      const userId = user._id;
      
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            username: username,
            phone: username,
            password: password, // Plain text password
            role: 'SUPER_ADMIN',
            status: 'Active',
            balance: user.balance || 10000,
            avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
          }
        }
      );
      
      // Refetch the updated user by username/phone (more reliable)
      user = await User.findOne({
        $or: [
          { username: username },
          { phone: username }
        ]
      });
      
      if (!user) {
        throw new Error('Failed to retrieve updated user');
      }
      
      console.log(`✅ Updated user: ${username} to SUPER_ADMIN\n`);
    } else {
      // Create new user
      console.log(`➕ Creating new SUPER_ADMIN user: ${username}`);
      const userId = 'u' + Date.now().toString().slice(-6);
      
      user = new User({
        _id: userId,
        username: username,
        phone: username,
        password: password, // Plain text password
        balance: 10000, // High balance for super admin
        role: 'SUPER_ADMIN',
        status: 'Active',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        stats: {
          gamesPlayed: 0,
          wins: 0
        }
      });
      
      await user.save();
      console.log(`✅ Created SUPER_ADMIN user: ${username}\n`);
    }

    // Display user info (without password)
    const userInfo = user.toObject();
    delete userInfo.password;
    delete userInfo.resetPasswordToken;
    delete userInfo.resetPasswordExpires;
    
    console.log('📊 User Information:');
    console.log(`   Username: ${userInfo.username}`);
    console.log(`   Phone: ${userInfo.phone || 'N/A'}`);
    console.log(`   Role: ${userInfo.role}`);
    console.log(`   Status: ${userInfo.status}`);
    console.log(`   Balance: $${userInfo.balance}`);
    console.log(`   ID: ${userInfo._id}`);
    console.log(`\n✅ Login credentials:`);
    console.log(`   Username/Phone: ${username}`);
    console.log(`   Password: ${password}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createSuperAdmin();

