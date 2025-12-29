// ===== CURRENCY PRECISION HELPER =====
// Rounds a number to 2 decimal places to prevent floating-point precision errors
const roundCurrency = (value) => {
    return Math.round(value * 100) / 100;
};

// POST: Admin - Update user balance (DEPOSIT or WITHDRAWAL)
app.post('/api/admin/users/:id/balance', authenticateToken, async (req, res) => {
    try {
        const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-update-balance');
        const adminUser = lookupResult.success ? lookupResult.user : null;

        if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
        }

        const { id: targetUserId } = req.params;
        const { amount, type, comment } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        if (!['deposit', 'withdrawal'].includes(type?.toLowerCase())) {
            return res.status(400).json({ error: 'Type must be deposit or withdrawal' });
        }

        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ error: 'Target user not found' });
        }

        const amountNum = parseFloat(amount);

        if (type.toLowerCase() === 'deposit') {
            targetUser.balance = roundCurrency(targetUser.balance + amountNum);
            targetUser.transactions.push({
                type: 'admin_deposit',
                amount: amountNum,
                description: comment || `Admin deposit by ${adminUser.username}`,
                timestamp: new Date()
            });
            console.log(`✅ Admin ${adminUser.username} deposited $${amountNum} to ${targetUser.username}`);
        } else {
            if (targetUser.balance < amountNum) {
                return res.status(400).json({ error: 'Insufficient user balance for withdrawal' });
            }
            targetUser.balance = roundCurrency(targetUser.balance - amountNum);
            targetUser.transactions.push({
                type: 'admin_withdrawal',
                amount: -amountNum,
                description: comment || `Admin withdrawal by ${adminUser.username}`,
                timestamp: new Date()
            });
            console.log(`✅ Admin ${adminUser.username} withdrew $${amountNum} from ${targetUser.username}`);
        }

        await targetUser.save();

        res.json({
            success: true,
            message: `Balance updated successfully`,
            newBalance: targetUser.balance
        });

    } catch (error) {
        console.error('Admin balance update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update balance' });
    }
});

// GET: Visitor Analytics for SuperAdmin Dashboard
app.get('/api/admin/visitor-analytics', authenticateToken, async (req, res) => {
    try {
        const lookupResult = await smartUserLookup(req.user.userId, req.user.username, 'admin-visitor-analytics');
        const adminUser = lookupResult.success ? lookupResult.user : null;

        if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
        }

        // Get all visitors from last 48 hours (TTL handles cleanup)
        const visitors = await VisitorAnalytics.find({}).sort({ lastActivity: -1 });

        // Calculate statistics
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const totalVisitors = visitors.length;
        const authenticatedVisitors = visitors.filter(v => v.isAuthenticated).length;
        const anonymousVisitors = totalVisitors - authenticatedVisitors;
        const returningVisitors = visitors.filter(v => v.isReturning).length;

        // Top visitors by page views
        const topVisitors = visitors
            .filter(v => v.isAuthenticated)
            .sort((a, b) => b.pageViews - a.pageViews)
            .slice(0, 10)
            .map(v => ({
                username: v.username,
                userId: v.userId,
                pageViews: v.pageViews,
                lastActivity: v.lastActivity,
                isReturning: v.isReturning
            }));

        // Per-user visit frequency (group by userId)
        const userVisits = {};
        visitors.filter(v => v.userId).forEach(v => {
            const uid = v.userId.toString();
            if (!userVisits[uid]) {
                userVisits[uid] = {
                    username: v.username,
                    sessions: 0,
                    totalPageViews: 0,
                    lastVisit: v.lastActivity
                };
            }
            userVisits[uid].sessions += 1;
            userVisits[uid].totalPageViews += v.pageViews;
            if (new Date(v.lastActivity) > new Date(userVisits[uid].lastVisit)) {
                userVisits[uid].lastVisit = v.lastActivity;
            }
        });

        const perUserFrequency = Object.values(userVisits)
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 10);

        res.json({
            success: true,
            analytics: {
                totalVisitors,
                authenticatedVisitors,
                anonymousVisitors,
                returningVisitors,
                topVisitors,
                perUserFrequency,
                timeWindow: '48 hours'
            }
        });

    } catch (error) {
        console.error('Visitor analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch visitor analytics' });
    }
});
