const mongoose = require('mongoose');
const User = require('./models/User');

async function findUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ludo');
    const user = await User.findOne({
      $or: [
        { username: '610251014' },
        { phone: '610251014' }
      ]
    });

    if (user) {
      console.log('User found:', {
        _id: user._id,
        username: user.username,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt
      });
    } else {
      console.log('User not found');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

findUser();



