require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function updateSuperAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const phoneOrUsername = '610251014';
    const password = 'ilyaas321';
    
    // Find user by phone or username
    const user = await User.findOne({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });

    if (!user) {
      console.log('❌ User not found. Creating new user...');
      const userId = 'u' + Date.now().toString().slice(-6);
      const newUser = new User({
        _id: userId,
        username: phoneOrUsername,
        phone: phoneOrUsername,
        password: password, // Plain text
        balance: 0,
        role: 'SUPER_ADMIN',
        status: 'Active',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phoneOrUsername}`,
        stats: { gamesPlayed: 0, wins: 0 }
      });
      await newUser.save();
      console.log('✅ Created new SUPER_ADMIN user\n');
      await mongoose.disconnect();
      return;
    }

    console.log(`📝 Found user: ${user.username || user.phone} (ID: ${user._id})`);
    console.log(`   Current role: ${user.role}\n`);

    // Update using phone/username (more reliable than _id)
    const result = await User.updateOne(
      {
        $or: [
          { username: phoneOrUsername },
          { phone: phoneOrUsername }
        ]
      },
      {
        $set: {
          role: 'SUPER_ADMIN',
          password: password, // Plain text password
          username: phoneOrUsername,
          phone: phoneOrUsername,
          balance: 0,
          status: 'Active'
        }
      }
    );

    console.log(`📊 Update result:`, result);
    
    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      console.log('✅ User updated successfully\n');
    } else {
      console.log('⚠️  No changes made\n');
    }

    // Fetch updated user
    const updatedUser = await User.findOne({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });
    
    if (updatedUser) {
      console.log('\n📊 Updated User Information:');
      console.log(`   Username: ${updatedUser.username}`);
      console.log(`   Phone: ${updatedUser.phone || 'N/A'}`);
      console.log(`   Role: ${updatedUser.role}`);
      console.log(`   Status: ${updatedUser.status}`);
      console.log(`   Balance: $${updatedUser.balance || 0}`);
      console.log(`   ID: ${updatedUser._id}`);
      console.log(`\n✅ Login credentials:`);
      console.log(`   Username/Phone: ${phoneOrUsername}`);
      console.log(`   Password: ${password}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateSuperAdmin();

