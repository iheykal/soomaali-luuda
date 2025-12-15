const mongoose = require('mongoose');

const VisitorAnalyticsSchema = new mongoose.Schema({
    // User identification
    userId: { type: String, ref: 'User', default: null }, // String to support custom IDs like 'u12345'
    sessionId: { type: String, required: true, index: true }, // Unique session identifier

    // Visitor info
    ipAddress: { type: String },
    userAgent: { type: String },
    isAuthenticated: { type: Boolean, default: false },
    username: { type: String }, // Store username for quick access

    // Activity tracking
    visitedAt: { type: Date, default: Date.now, index: true },
    lastActivity: { type: Date, default: Date.now },
    pageViews: { type: Number, default: 1 },

    // Analytics
    isReturning: { type: Boolean, default: false }, // Has visited before in last 48h

    // Auto-cleanup after 48 hours using TTL index
    expireAt: { type: Date, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000), index: true }
});

// TTL Index - MongoDB automatically deletes documents after expireAt
VisitorAnalyticsSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for efficient queries
VisitorAnalyticsSchema.index({ isAuthenticated: 1, visitedAt: -1 });
VisitorAnalyticsSchema.index({ userId: 1, visitedAt: -1 });

module.exports = mongoose.model('VisitorAnalytics', VisitorAnalyticsSchema);
