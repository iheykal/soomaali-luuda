const crypto = require('crypto');
const User = require('../models/User');

/**
 * Generate a unique referral code in format: LUDO-XXXXXX
 * @returns {Promise<string>} Unique referral code
 */
async function generateUniqueReferralCode() {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        // Generate 6 random alphanumeric characters
        const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const code = `SOM-LUDO-${randomPart}`;

        // Check if code already exists
        const existing = await User.findOne({ referralCode: code });

        if (!existing) {
            return code;
        }

        attempts++;
    }

    // Fallback to timestamp-based code if random generation fails
    const timestamp = Date.now().toString(36).toUpperCase();
    return `SOM-LUDO-${timestamp}`;
}

/**
 * Validate a referral code and return the referrer
 * @param {string} code - The referral code to validate
 * @returns {Promise<Object|null>} Referrer user object or null if invalid
 */
async function validateReferralCode(code) {
    if (!code || typeof code !== 'string') {
        return null;
    }

    // Normalize code (uppercase, trim)
    const normalizedCode = code.trim().toUpperCase();

    // Find user with this referral code
    const referrer = await User.findOne({ referralCode: normalizedCode });

    return referrer;
}

/**
 * Check if user can be referred by referrer (prevent self-referral, circular refs)
 * @param {string} userId - User being referred
 * @param {string} referrerId - User doing the referring
 * @returns {boolean} True if referral is valid
 */
function canBeReferred(userId, referrerId) {
    // Cannot refer yourself
    if (userId === referrerId) {
        return false;
    }

    // Additional checks can be added here (e.g., prevent circular referrals)

    return true;
}

module.exports = {
    generateUniqueReferralCode,
    validateReferralCode,
    canBeReferred
};
