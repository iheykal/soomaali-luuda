/**
 * XP and Leveling System Utilities
 * Medium difficulty curve: XP Required = 500 × (Level ^ 1.5)
 */

/**
 * Calculate XP required to reach the next level
 * @param {number} currentLevel - Current player level
 * @returns {number} XP needed for next level
 */
function calculateXpForNextLevel(currentLevel) {
    return Math.floor(500 * Math.pow(currentLevel + 1, 1.5));
}

/**
 * Calculate total cumulative XP needed to reach a specific level
 * @param {number} targetLevel - Target level
 * @returns {number} Total XP needed from level 1
 */
function getTotalXpForLevel(targetLevel) {
    let total = 0;
    for (let level = 1; level < targetLevel; level++) {
        total += calculateXpForNextLevel(level);
    }
    return total;
}

/**
 * Determine player level from total XP
 * @param {number} totalXp - Player's cumulative XP
 * @returns {number} Calculated level
 */
function getLevelFromXp(totalXp) {
    let level = 1;
    let xpNeeded = 0;

    while (xpNeeded <= totalXp) {
        xpNeeded += calculateXpForNextLevel(level);
        if (xpNeeded <= totalXp) {
            level++;
        }
    }

    return level;
}

/**
 * Get rank/badge information based on level
 * @param {number} level - Player level
 * @returns {Object} Rank info with tier, title, and color
 */
function getRankInfo(level) {
    if (level >= 100) {
        return {
            tier: 'legend',
            title: 'Ludo God',
            color: '#A855F7', // Purple
            iconColor: 'text-purple-500',
            bgColor: 'from-purple-600 to-fuchsia-600'
        };
    } else if (level >= 50) {
        return {
            tier: 'diamond',
            title: 'Grandmaster',
            color: '#3B82F6', // Blue  
            iconColor: 'text-blue-500',
            bgColor: 'from-blue-600 to-cyan-600'
        };
    } else if (level >= 25) {
        return {
            tier: 'gold',
            title: 'Master',
            color: '#F59E0B', // Amber
            iconColor: 'text-amber-400',
            bgColor: 'from-amber-500 to-yellow-500'
        };
    } else if (level >= 10) {
        return {
            tier: 'silver',
            title: 'Challenger',
            color: '#94A3B8', // Slate
            iconColor: 'text-slate-400',
            bgColor: 'from-slate-400 to-slate-500'
        };
    } else {
        return {
            tier: 'bronze',
            title: 'Novice',
            color: '#92400E', // Brown
            iconColor: 'text-amber-700',
            bgColor: 'from-amber-700 to-amber-800'
        };
    }
}

/**
 * Award XP to a user and handle level-ups with gem rewards
 * @param {Object} user - Mongoose User document
 * @param {number} xpAmount - Amount of XP to award
 * @returns {Object} Result with levelsGained and gemsAwarded
 */
function awardXp(user, xpAmount) {
    const oldLevel = user.level || 1;
    const oldXp = user.xp || 0;

    // Add XP
    user.xp = oldXp + xpAmount;

    // Calculate new level
    const newLevel = getLevelFromXp(user.xp);
    const levelsGained = newLevel - oldLevel;

    // Award gems for level-ups (5 gems per level)
    const gemsAwarded = levelsGained * 5;
    if (gemsAwarded > 0) {
        user.gems = (user.gems || 0) + gemsAwarded;
        user.level = newLevel;
    }

    return {
        levelsGained,
        gemsAwarded,
        newLevel,
        newXp: user.xp
    };
}

/**
 * Get XP progress info for current level
 * @param {number} totalXp - Player's total XP
 * @param {number} level - Player's current level
 * @returns {Object} Progress info with current, needed, and percentage
 */
function getXpProgress(totalXp, level) {
    const xpForPreviousLevel = level > 1 ? getTotalXpForLevel(level) : 0;
    const xpForNextLevel = getTotalXpForLevel(level + 1);
    const xpInCurrentLevel = totalXp - xpForPreviousLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForPreviousLevel;
    const percentage = Math.floor((xpInCurrentLevel / xpNeededForNextLevel) * 100);

    return {
        current: xpInCurrentLevel,
        needed: xpNeededForNextLevel,
        percentage: Math.min(100, Math.max(0, percentage))
    };
}

module.exports = {
    calculateXpForNextLevel,
    getTotalXpForLevel,
    getLevelFromXp,
    getRankInfo,
    awardXp,
    getXpProgress
};
