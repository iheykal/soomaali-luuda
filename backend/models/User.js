
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: String, // Explicitly define _id as String to allow frontend-generated IDs (e.g., 'u123456')
  username: { type: String, required: true, unique: true },
  phone: { type: String, sparse: true, unique: true }, // Phone number for login - sparse allows multiple nulls
  password: { type: String, required: true }, 
  email: { type: String },
  balance: { type: Number, default: 100.00 },
  avatar: { type: String },
  role: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], default: 'USER' },
  status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 }
  }
}, { _id: false }); // Important: Disable auto-generated ObjectId to use our String _id

module.exports = mongoose.model('User', UserSchema);
