// Quick script to check user role
const mongoose = require('mongoose');
const User = require('./backend/models/User');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function checkUser() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    const user = await User.findOne({
      $or: [
        { username: '610251014' },
        { phone: '610251014' }
      ]
    });
    
    if (user) {
      console.log('✅ User found:');
      console.log('   ID:', user._id);
      console.log('   Username:', user.username);
      console.log('   Role:', user.role);
      console.log('   Status:', user.status);
    } else {
      console.log('❌ User not found');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkUser();

