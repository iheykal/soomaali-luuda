require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function hashAllPasswords() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const users = await User.find();
    console.log(`📊 Found ${users.length} users\n`);

    let hashedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if password is already hashed
      if (user.password && user.password.startsWith('$2a$')) {
        console.log(`⏭️  Skipping ${user.username} - password already hashed`);
        skippedCount++;
        continue;
      }

      // Hash plain text password
      if (user.password) {
        console.log(`🔒 Hashing password for ${user.username}...`);
        user.password = await bcrypt.hash(user.password, 10);
        await user.save();
        hashedCount++;
        console.log(`✅ Hashed password for ${user.username}`);
      } else {
        console.log(`⚠️  User ${user.username} has no password`);
      }
    }

    console.log(`\n✅ Completed:`);
    console.log(`   - Hashed: ${hashedCount} passwords`);
    console.log(`   - Skipped: ${skippedCount} (already hashed)`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

hashAllPasswords();

