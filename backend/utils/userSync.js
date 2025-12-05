// Improved user auto-sync utility to prevent duplicate user creation
// This ensures users are properly matched to their existing accounts

const User = require('../models/User');
const crypto = require('crypto');

/**
 * Smart user auto-sync that prevents duplicates and properly matches users
 * @param {string} userId - The user ID from frontend
 * @param {string} userName - The username from frontend
 * @param {string} context - Context for logging (e.g., 'game-rejoin', 'wallet-request')
 * @returns {Object} - { success: boolean, user: User, isNew: boolean }
 */
async function smartUserSync(userId, userName, context = 'unknown') {
  try {
    console.log(`🔄 [${context}] Starting smart sync for user ${userId} (${userName})`);

    // Step 1: Try to find by exact userId (most reliable)
    let user = await User.findById(userId);
    if (user) {
      console.log(`✅ [${context}] Found existing user by ID: ${user.username} (${user.role})`);
      return { success: true, user, isNew: false };
    }

    // Step 2: If not found by ID, try to find by username (real login credentials)
    // This handles cases where user logged in with username but auto-sync uses userId
    if (userName && userName !== `Player_${userId.slice(-6)}`) {
      user = await User.findOne({
        $or: [
          { username: userName },
          { phone: userName }
        ]
      });

      if (user) {
        console.log(`🔗 [${context}] Found existing user by username/phone: ${user.username} (${user.role})`);
        console.log(`   Updating user ID from ${user._id} to ${userId} to prevent future duplicates`);

        // Update the user ID to match the frontend ID (prevents future duplicates)
        // But be careful - only do this if the user doesn't already exist with this ID
        const existingUserWithId = await User.findById(userId);
        if (!existingUserWithId) {
          await User.updateOne(
            { _id: user._id },
            { $set: { _id: userId } }
          );
          user._id = userId; // Update in memory
          console.log(`✅ [${context}] User ID updated successfully`);
        }

        return { success: true, user, isNew: false };
      }
    }

    // Step 3: Check for existing auto-generated users that might match
    // Look for users with auto-generated phone numbers that could be the same person
    const autoUser = await User.findOne({
      phone: `auto_${userId}`,
      username: userName || `Player_${userId.slice(-6)}`
    });

    if (autoUser) {
      console.log(`🔄 [${context}] Found existing auto-user: ${autoUser.username}`);
      return { success: true, user: autoUser, isNew: false };
    }

    // Step 4: No existing user found, create new one
    console.log(`🆕 [${context}] Creating new user for ${userName} (${userId})`);

    const newUser = new User({
      _id: userId,
      username: userName || `Player_${userId.slice(-6)}`,
      phone: `auto_${userId}`, // Still use auto prefix but this should be unique now
      password: crypto.randomBytes(16).toString('hex'),
      balance: 100, // Default starting balance
      role: 'USER',
      status: 'Active',
      // avatar will be set via upload, not hardcoded
      stats: {
        gamesPlayed: 0,
        wins: 0
      }
    });

    await newUser.save();
    console.log(`✅ [${context}] New user created: ${newUser.username} (${newUser._id})`);

    return { success: true, user: newUser, isNew: true };

  } catch (error) {
    console.error(`❌ [${context}] Smart sync failed for user ${userId}:`, error.message);
    return { success: false, user: null, isNew: false, error: error.message };
  }
}

/**
 * Enhanced user lookup for admin operations that handles duplicates intelligently
 * @param {string} userId - User ID from token
 * @param {string} username - Username from token
 * @param {string} context - Context for logging
 * @returns {Object} - { success: boolean, user: User, usedFallback: boolean }
 */
async function smartUserLookup(userId, username, context = 'admin') {
  try {
    console.log(`🔍 [${context}] Smart lookup for ${userId} (${username})`);

    // Try exact ID match first
    let user = await User.findById(userId);
    if (user) {
      console.log(`✅ [${context}] Found by ID: ${user.username} (${user.role})`);
      return { success: true, user, usedFallback: false };
    }

    // Try username/phone match
    if (username) {
      user = await User.findOne({
        $or: [
          { username: username },
          { phone: username }
        ]
      });

      if (user) {
        console.log(`🔗 [${context}] Found by username fallback: ${user.username} (${user.role})`);
        return { success: true, user, usedFallback: true };
      }
    }

    // Try phone number patterns for auto-generated users
    if (username && /^\d+$/.test(username)) {
      user = await User.findOne({ phone: username });
      if (user) {
        console.log(`📞 [${context}] Found by phone number: ${user.username} (${user.role})`);
        return { success: true, user, usedFallback: true };
      }
    }

    console.log(`❌ [${context}] User not found after all lookup attempts`);
    return { success: false, user: null, usedFallback: false };

  } catch (error) {
    console.error(`❌ [${context}] Lookup failed:`, error.message);
    return { success: false, user: null, usedFallback: false, error: error.message };
  }
}

/**
 * Cleanup function to merge duplicate user records
 * This should be run periodically or on-demand
 */
async function cleanupDuplicateUsers() {
  try {
    console.log('🧹 Starting duplicate user cleanup...');

    const allUsers = await User.find({});
    const userMap = new Map();
    const duplicates = [];

    // Group users by potential duplicate criteria
    allUsers.forEach(user => {
      // Check for users with same base ID (ignoring auto_ prefix)
      const baseId = user._id.toString().replace(/^u/, '');
      const phoneBase = user.phone?.replace(/^auto_/, '');

      if (!userMap.has(baseId)) {
        userMap.set(baseId, []);
      }
      userMap.get(baseId).push(user);

      // Also check by username for duplicates
      if (user.username && !user.username.startsWith('Player_')) {
        const usernameKey = `name_${user.username}`;
        if (!userMap.has(usernameKey)) {
          userMap.set(usernameKey, []);
        }
        userMap.get(usernameKey).push(user);
      }
    });

    // Find actual duplicates (same username = same person)
    for (const [key, users] of userMap.entries()) {
      if (users.length > 1 && key.startsWith('name_')) {
        const username = key.replace('name_', '');
        console.log(`\n🔍 MERGING ACCOUNTS FOR USER: ${username}`);
        users.forEach((u, idx) => console.log(`   ${idx + 1}. Phone: ${u.phone} | Role: ${u.role} | Balance: $${u.balance} | ID: ${u._id}`));

        // Smart selection: Keep the best account
        const keepUser = users.reduce((best, current) => {
          // Priority 1: SUPER_ADMIN role
          if (current.role === 'SUPER_ADMIN' && best.role !== 'SUPER_ADMIN') return current;
          if (best.role === 'SUPER_ADMIN' && current.role !== 'SUPER_ADMIN') return best;

          // Priority 2: Higher balance
          if (current.balance > best.balance) return current;
          if (best.balance > current.balance) return best;

          // Priority 3: Real phone number (not auto-generated)
          const currentIsReal = current.phone && !current.phone.startsWith('auto_');
          const bestIsReal = best.phone && !best.phone.startsWith('auto_');
          if (currentIsReal && !bestIsReal) return current;
          if (bestIsReal && !currentIsReal) return best;

          // Priority 4: More recent creation
          return current.createdAt > best.createdAt ? current : best;
        });

        const toDelete = users.filter(u => u._id !== keepUser._id);

        console.log(`\n✅ KEEPING: ${keepUser.username} (${keepUser.phone}) - ${keepUser.role} - $${keepUser.balance}`);
        console.log(`🗑️  DELETING ${toDelete.length} duplicate account(s):`);

        // Actually delete duplicates
        for (const dup of toDelete) {
          await User.deleteOne({ _id: dup._id });
          console.log(`   ✅ Deleted: ${dup.username} (${dup.phone}) - $${dup.balance}`);
        }

        duplicates.push({ key, keep: keepUser, delete: toDelete });
      }
    }

    console.log(`\n📊 Cleanup Summary: Found ${duplicates.length} duplicate groups`);
    return duplicates;

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    return [];
  }
}

module.exports = {
  smartUserSync,
  smartUserLookup,
  cleanupDuplicateUsers
};
