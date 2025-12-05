require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Use environment variable or default
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://maandhisecorporate_db_user:rnXK7f9eVEve8R0Q@cluster0.dggtyvj.mongodb.net/maandhise?appName=Cluster0';

async function createSuperAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📊 Database:', MONGO_URI.includes('@') ? MONGO_URI.split('@')[1].split('?')[0] : MONGO_URI);

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('✅ Connected to MongoDB successfully\n');

    // Check if user already exists by phone
    const phoneWithPrefix = '+252613273911';
    const existingUser = await User.findOne({
      $or: [
        { phone: '613273911' },
        { phone: phoneWithPrefix }
      ]
    });

    if (existingUser) {
      console.log('👤 Found existing user:', existingUser._id);
      console.log('   Current username:', existingUser.username || 'NONE');
      console.log('   Current phone:', existingUser.phone);
      console.log('   Current role:', existingUser.role);

      // Update using updateOne to avoid validation issues
      await User.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            username: 'Admin',
            phone: phoneWithPrefix,
            password: 'maandhise11',
            role: 'SUPER_ADMIN',
            status: 'Active',
            avatar: null
          }
        }
      );

      console.log('\n✅ Updated existing user to SUPER_ADMIN');
      console.log('📱 Phone: +252613273911');
      console.log('👤 Username: Admin');
      console.log('🔑 Password: maandhise11');
      console.log('🎭 Role: SUPER_ADMIN');
    } else {
      console.log('🆕 Creating new SUPER_ADMIN user...');

      // Create new user
      const userId = 'u' + Date.now().toString().slice(-6);
      const newUser = new User({
        _id: userId,
        username: 'Admin',
        phone: phoneWithPrefix,
        password: 'maandhise11',
        balance: 0,
        role: 'SUPER_ADMIN',
        status: 'Active',
        avatar: null,
        stats: {
          gamesPlayed: 0,
          wins: 0
        }
      });

      await newUser.save();

      console.log('✅ SuperAdmin created successfully!');
      console.log('📱 Phone: +252613273911');
      console.log('👤 Username: Admin');
      console.log('🔑 Password: maandhise11');
      console.log('🎭 Role: SUPER_ADMIN');
      console.log('🆔 ID:', userId);
    }

    console.log('\n🎉 You can now login with:');
    console.log('   Phone: 613273911');
    console.log('   Password: maandhise11');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createSuperAdmin();
