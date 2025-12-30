const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const Revenue = require('../models/Revenue');

/**
 * Analytics Routes for SuperAdmin Dashboard
 * All routes require authentication and SUPER_ADMIN role (handled in server.js)
 */

/**
 * Helper function to calculate date ranges
 */
function getDateRange(timeRange) {
    const now = new Date();
    let startDate = null;

    switch (timeRange) {
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        case 'all':
        default:
            startDate = new Date(0); // Beginning of time
            break;
    }

    return { startDate, endDate: now };
}

/**
 * GET /api/admin/analytics/ggr
 * Get Gross Gaming Revenue (GGR) over time
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/ggr', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        console.log(`[GGR DEBUG] Range: ${timeRange}, Start: ${startDate}, End: ${endDate}`);

        // Aggregate revenue by day
        const ggrData = await Revenue.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$timestamp' },
                        month: { $month: '$timestamp' },
                        day: { $dayOfMonth: '$timestamp' }
                    },
                    totalRevenue: { $sum: '$amount' },
                    gamesCount: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: {
                        $dateFromParts: {
                            year: '$_id.year',
                            month: '$_id.month',
                            day: '$_id.day'
                        }
                    },
                    revenue: '$totalRevenue',
                    gamesCount: '$gamesCount'
                }
            }
        ]);

        console.log(`[GGR DEBUG] Found ${ggrData.length} records.`);

        // Calculate total and average
        const totalRevenue = ggrData.reduce((sum, day) => sum + day.revenue, 0);
        const averageDaily = ggrData.length > 0 ? totalRevenue / ggrData.length : 0;

        res.json({
            success: true,
            timeRange,
            data: ggrData,
            summary: {
                total: totalRevenue,
                averageDaily,
                daysCount: ggrData.length
            }
        });
    } catch (error) {
        console.error('GGR analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch GGR data' });
    }
});

/**
 * GET /api/admin/analytics/dau
 * Get Daily Active Users (DAU) statistics
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/dau', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Aggregate unique active users per day from games
        const dauData = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $unwind: '$players'
            },
            {
                $match: {
                    'players.isAI': false // Only count human players
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                        userId: '$players.userId'
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: '$_id.year',
                        month: '$_id.month',
                        day: '$_id.day'
                    },
                    uniqueUsers: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: {
                        $dateFromParts: {
                            year: '$_id.year',
                            month: '$_id.month',
                            day: '$_id.day'
                        }
                    },
                    activeUsers: '$uniqueUsers'
                }
            }
        ]);

        // Calculate peak and average
        const peak = dauData.length > 0 ? Math.max(...dauData.map(d => d.activeUsers)) : 0;
        const average = dauData.length > 0 ? dauData.reduce((sum, d) => sum + d.activeUsers, 0) / dauData.length : 0;

        res.json({
            success: true,
            timeRange,
            data: dauData,
            summary: {
                peak,
                average: Math.round(average),
                daysCount: dauData.length
            }
        });
    } catch (error) {
        console.error('DAU analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch DAU data' });
    }
});

/**
 * GET /api/admin/analytics/avg-stake
 * Get average stake per match over time
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/avg-stake', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Aggregate average stake by day
        const avgStakeData = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['ACTIVE', 'COMPLETED'] },
                    stake: { $gt: 0 } // Only include paid games
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    averageStake: { $avg: '$stake' },
                    totalStake: { $sum: '$stake' },
                    gamesCount: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: {
                        $dateFromParts: {
                            year: '$_id.year',
                            month: '$_id.month',
                            day: '$_id.day'
                        }
                    },
                    averageStake: '$averageStake',
                    totalStake: '$totalStake',
                    gamesCount: '$gamesCount'
                }
            }
        ]);

        // Calculate overall average
        const overallAverage = avgStakeData.length > 0
            ? avgStakeData.reduce((sum, d) => sum + d.totalStake, 0) / avgStakeData.reduce((sum, d) => sum + d.gamesCount, 0)
            : 0;

        res.json({
            success: true,
            timeRange,
            data: avgStakeData,
            summary: {
                current: overallAverage,
                daysCount: avgStakeData.length
            }
        });
    } catch (error) {
        console.error('Average stake analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch average stake data' });
    }
});

/**
 * GET /api/admin/analytics/retention
 * Calculate retention rate (% of users who return the next day)
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/retention', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Get all users who played during the time range
        const activeUsers = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $unwind: '$players'
            },
            {
                $match: {
                    'players.isAI': false
                }
            },
            {
                $group: {
                    _id: '$players.userId',
                    firstPlay: { $min: '$createdAt' },
                    playDates: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } }
                }
            }
        ]);

        // Calculate retention by checking if users returned next day
        const retentionByDate = {};

        for (const user of activeUsers) {
            const sortedDates = user.playDates.sort();

            for (let i = 0; i < sortedDates.length - 1; i++) {
                const currentDate = new Date(sortedDates[i]);
                const nextDay = new Date(currentDate);
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDayStr = nextDay.toISOString().split('T')[0];

                const dateKey = sortedDates[i];
                if (!retentionByDate[dateKey]) {
                    retentionByDate[dateKey] = { total: 0, returned: 0 };
                }
                retentionByDate[dateKey].total++;

                if (sortedDates.includes(nextDayStr)) {
                    retentionByDate[dateKey].returned++;
                }
            }
        }

        // Format data for chart
        const retentionData = Object.entries(retentionByDate)
            .map(([date, stats]) => ({
                date: new Date(date),
                retentionRate: stats.total > 0 ? (stats.returned / stats.total) * 100 : 0,
                totalUsers: stats.total,
                returnedUsers: stats.returned
            }))
            .sort((a, b) => a.date - b.date);

        // Calculate overall retention rate
        const totalUsers = activeUsers.length;
        const overallRetention = retentionData.length > 0
            ? retentionData.reduce((sum, d) => sum + d.retentionRate, 0) / retentionData.length
            : 0;

        res.json({
            success: true,
            timeRange,
            data: retentionData,
            summary: {
                overallRetention: Math.round(overallRetention * 10) / 10,
                totalUsers,
                daysCount: retentionData.length
            }
        });
    } catch (error) {
        console.error('Retention analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch retention data' });
    }
});

/**
 * GET /api/admin/analytics/match-velocity
 * Get matches started per hour (24-hour breakdown)
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/match-velocity', async (req, res) => {
    try {
        const { timeRange = '7d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Aggregate matches by hour of day
        const velocityData = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $group: {
                    _id: { $hour: '$createdAt' },
                    matchCount: { $sum: 1 }
                }
            },
            {
                $sort: { '_id': 1 }
            },
            {
                $project: {
                    _id: 0,
                    hour: '$_id',
                    matches: '$matchCount'
                }
            }
        ]);

        // Ensure we have data for all 24 hours (fill gaps with 0)
        const allHours = Array.from({ length: 24 }, (_, i) => {
            const existing = velocityData.find(d => d.hour === i);
            return {
                hour: i,
                matches: existing ? existing.matches : 0
            };
        });

        // Calculate peak hour and average
        const peakHour = allHours.reduce((max, curr) => curr.matches > max.matches ? curr : max, allHours[0]);
        const totalMatches = allHours.reduce((sum, h) => sum + h.matches, 0);
        const averagePerHour = totalMatches / 24;

        res.json({
            success: true,
            timeRange,
            data: allHours,
            summary: {
                peakHour: peakHour.hour,
                peakMatches: peakHour.matches,
                averagePerHour: Math.round(averagePerHour * 10) / 10,
                totalMatches
            }
        });
    } catch (error) {
        console.error('Match velocity analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch match velocity data' });
    }
});

/**
 * GET /api/admin/analytics/overview
 * Get all key metrics in one call for dashboard summary
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/overview', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Run all aggregations in parallel for better performance
        const [ggrResult, dauResult, avgStakeResult, gamesResult] = await Promise.all([
            // Total GGR
            Revenue.aggregate([
                {
                    $match: {
                        timestamp: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$amount' },
                        gamesCount: { $sum: 1 }
                    }
                }
            ]),

            // Unique active users
            Game.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate },
                        status: { $in: ['ACTIVE', 'COMPLETED'] }
                    }
                },
                {
                    $unwind: '$players'
                },
                {
                    $match: {
                        'players.isAI': false
                    }
                },
                {
                    $group: {
                        _id: '$players.userId'
                    }
                },
                {
                    $count: 'totalUsers'
                }
            ]),

            // Average stake
            Game.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate },
                        status: { $in: ['ACTIVE', 'COMPLETED'] },
                        stake: { $gt: 0 }
                    }
                },
                {
                    $group: {
                        _id: null,
                        averageStake: { $avg: '$stake' },
                        totalStake: { $sum: '$stake' },
                        gamesCount: { $sum: 1 }
                    }
                }
            ]),

            // Total games
            Game.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate },
                status: { $in: ['ACTIVE', 'COMPLETED'] }
            })
        ]);

        const overview = {
            ggr: ggrResult[0]?.totalRevenue || 0,
            dau: dauResult[0]?.totalUsers || 0,
            avgStake: avgStakeResult[0]?.averageStake || 0,
            totalGames: gamesResult,
            revenueGames: ggrResult[0]?.gamesCount || 0
        };

        res.json({
            success: true,
            timeRange,
            overview
        });
    } catch (error) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch analytics overview' });
    }
});

/**
 * GET /api/admin/analytics/churn
 * Calculate churn rate (% of players who played once and never returned)
 * Query params: timeRange (7d, 30d, 90d, all)
 */
router.get('/churn', async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const { startDate, endDate } = getDateRange(timeRange);

        // Get all users who played during the time range with their play dates
        const allPlayers = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $unwind: '$players'
            },
            {
                $match: {
                    'players.isAI': false
                }
            },
            {
                $group: {
                    _id: '$players.userId',
                    playDates: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
                    totalGames: { $sum: 1 }
                }
            }
        ]);

        // Filter to find one-time players (played on exactly one date)
        const oneTimePlayers = allPlayers.filter(player => player.playDates.length === 1);

        // Of those one-time players, find how many never came back
        // (In this context, "never came back" means they only have 1 unique play date)
        const churnedPlayers = oneTimePlayers.length; // All one-time players are considered churned
        const totalOneTimePlayers = oneTimePlayers.length;

        // Calculate overall churn rate
        const churnRate = totalOneTimePlayers > 0
            ? (churnedPlayers / totalOneTimePlayers) * 100
            : 0;

        // Get total unique players for context
        const totalPlayers = allPlayers.length;

        res.json({
            success: true,
            timeRange,
            data: {
                churnRate: Math.round(churnRate * 10) / 10, // Round to 1 decimal
                churnedPlayers,
                totalOneTimePlayers,
                totalPlayers,
                percentageOfTotal: totalPlayers > 0
                    ? Math.round((churnedPlayers / totalPlayers) * 1000) / 10
                    : 0
            }
        });
    } catch (error) {
        console.error('Churn analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch churn data' });
    }
});

module.exports = router;
