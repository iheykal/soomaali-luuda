require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function fixDuplicate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const phoneOrUsername = '610251014';

    // Find all users with this username/phone
    const users = await User.find({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });

    console.log(`📊 Found ${users.length} user(s) with username/phone: ${phoneOrUsername}\n`);

    // Find the user with role USER and phone starting with 'auto_'
    const userToDelete = users.find(user =>
      user.role === 'USER' && user.phone && user.phone.startsWith('auto_')
    );

    if (userToDelete) {
      console.log('🗑️  Deleting duplicate USER role entry:');
      console.log(`   ID: ${userToDelete._id}`);
      console.log(`   Username: ${userToDelete.username}`);
      console.log(`   Phone: ${userToDelete.phone}`);
      console.log(`   Role: ${userToDelete.role}`);
      console.log('');

      await User.deleteOne({ _id: userToDelete._id });
      console.log('✅ Duplicate user deleted successfully\n');
    } else {
      console.log('⚠️  No duplicate USER role entry found to delete\n');
    }

    // Verify the remaining user
    const remainingUser = await User.findOne({
      $or: [
        { username: phoneOrUsername },
        { phone: phoneOrUsername }
      ]
    });

    if (remainingUser) {
      console.log('📊 Remaining User Information:');
      console.log(`   ID: ${remainingUser._id}`);
      console.log(`   Username: ${remainingUser.username}`);
      console.log(`   Phone: ${remainingUser.phone}`);
      console.log(`   Role: ${remainingUser.role}`);
      console.log(`   Status: ${remainingUser.status}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDuplicate();



