const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const Revenue = require('../models/Revenue');
const FinancialRequest = require('../models/FinancialRequest');

/**
 * GET /api/admin/analytics/today
 * Get today's analytics from 12:00 AM to current time
 * - Money flow transactions
 * - Rake earnings
 * - Total deposits
 * - Amount played from deposits
 */
router.get('/today', async (req, res) => {
    try {
        // Calculate today's date range (00:00 to 23:59:59)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // 1. Money Flow Transactions (all financial requests today)
        const todayDeposits = await FinancialRequest.aggregate([
            {
                $match: {
                    type: 'DEPOSIT',
                    status: 'APPROVED',
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const todayWithdrawals = await FinancialRequest.aggregate([
            {
                $match: {
                    type: 'WITHDRAWAL',
                    status: 'APPROVED',
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // 2. Today's Rake (Revenue from games)
        const todayRake = await Revenue.aggregate([
            {
                $match: {
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRake: { $sum: '$amount' },
                    totalPot: { $sum: '$totalPot' },
                    gamesCount: { $sum: 1 }
                }
            }
        ]);

        // 3. Today's Games Played
        const todayGames = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfDay, $lte: endOfDay },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalGames: { $sum: 1 },
                    totalStake: { $sum: { $multiply: ['$stake', 2] } }
                }
            }
        ]);

        // Calculate metrics
        const deposits = todayDeposits[0] || { totalAmount: 0, count: 0 };
        const withdrawals = todayWithdrawals[0] || { totalAmount: 0, count: 0 };
        const rake = todayRake[0] || { totalRake: 0, totalPot: 0, gamesCount: 0 };
        const games = todayGames[0] || { totalGames: 0, totalStake: 0 };

        // Calculate how much of deposits is being played
        const depositPlayRate = deposits.totalAmount > 0
            ? (games.totalStake / deposits.totalAmount) * 100
            : 0;

        // Calculate net money flow
        const netFlow = deposits.totalAmount - withdrawals.totalAmount;

        res.json({
            success: true,
            timeRange: 'today',
            data: {
                // Money Flow
                moneyFlow: {
                    deposits: {
                        amount: deposits.totalAmount,
                        count: deposits.count
                    },
                    withdrawals: {
                        amount: withdrawals.totalAmount,
                        count: withdrawals.count
                    },
                    netFlow: netFlow,
                    totalTransactions: deposits.count + withdrawals.count
                },

                // Rake Earnings
                rake: {
                    totalEarned: rake.totalRake,
                    fromGamesCount: rake.gamesCount,
                    totalPotValue: rake.totalPot
                },

                // Gameplay Activity
                gameplay: {
                    totalGames: games.totalGames,
                    totalStaked: games.totalStake,
                    depositsPlayed: games.totalStake, // Amount from deposits that went into games
                    depositsPlayedPercentage: depositPlayRate.toFixed(2),
                    rakeFromDeposits: rake.totalRake // Rake earned from deposits being played
                }
            }
        });
    } catch (error) {
        console.error('Today analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch today analytics' });
    }
});

module.exports = router;
