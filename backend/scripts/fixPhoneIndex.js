require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function fixPhoneIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    // Get the collection
    const collection = mongoose.connection.db.collection('users');
    
    // Drop existing phone index if it exists
    try {
      await collection.dropIndex('phone_1');
      console.log('✅ Dropped existing phone_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️  phone_1 index does not exist, skipping drop');
      } else {
        throw error;
      }
    }

    // Create sparse unique index on phone (allows multiple nulls)
    await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
    console.log('✅ Created sparse unique index on phone field\n');

    // Update users with null phone values
    const usersWithNullPhone = await User.find({ phone: null });
    console.log(`📝 Found ${usersWithNullPhone.length} users with null phone values\n`);

    let updated = 0;
    for (const user of usersWithNullPhone) {
      const newPhone = `auto_${user._id}`;
      await User.updateOne({ _id: user._id }, { $set: { phone: newPhone } });
      console.log(`   Updated ${user.username} (${user._id}) -> phone: ${newPhone}`);
      updated++;
    }

    if (updated > 0) {
      console.log(`\n✅ Updated ${updated} users with null phone values`);
    } else {
      console.log('✅ No users needed updating');
    }

    // Verify the fix
    console.log('\n🔍 Verifying fix...');
    const duplicateNullCheck = await User.countDocuments({ phone: null });
    if (duplicateNullCheck > 0) {
      console.log(`⚠️  Warning: ${duplicateNullCheck} users still have null phone (this is OK with sparse index)`);
    } else {
      console.log('✅ No users with null phone values');
    }

    // Try to create a test user with null phone to verify sparse index works
    try {
      const testUser = new User({
        _id: 'test_sparse_' + Date.now(),
        username: 'test_sparse_' + Date.now(),
        phone: null,
        password: 'test',
        balance: 0
      });
      await testUser.save();
      console.log('✅ Test: Sparse index allows null phone values');
      await User.deleteOne({ _id: testUser._id });
      console.log('✅ Cleaned up test user');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n🎉 Phone index fix completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPhoneIndex();



