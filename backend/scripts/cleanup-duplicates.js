require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { cleanupDuplicateUsers } = require('../utils/userSync');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function main() {
  try {
    console.log('🧹 Starting database cleanup for duplicate users...\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Run the cleanup
    const duplicates = await cleanupDuplicateUsers();

    if (duplicates.length === 0) {
      console.log('✅ No duplicate users found - database is clean!');
      return;
    }

    console.log(`\n🔧 Found ${duplicates.length} groups of duplicate users`);
    console.log('⚠️  To actually delete duplicates, uncomment the deletion code in userSync.js');
    console.log('   This script currently only identifies duplicates for safety');

    // Show summary
    console.log('\n📊 Cleanup Summary:');
    duplicates.forEach((group, index) => {
      console.log(`${index + 1}. ${group.key}: Keeping ${group.keep.username}, would delete ${group.delete.length} duplicates`);
    });

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
