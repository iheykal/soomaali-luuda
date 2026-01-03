import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { adminAPI } from '../../services/adminAPI';
import type { AnalyticsTimeRange } from '../../types';

interface AnalyticsDashboardProps {
    userRole: string;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ userRole }) => {
    const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('30d');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [ggrData, setGgrData] = useState<any>(null);
    const [dauData, setDauData] = useState<any>(null);
    const [avgStakeData, setAvgStakeData] = useState<any>(null);
    const [retentionData, setRetentionData] = useState<any>(null);
    const [velocityData, setVelocityData] = useState<any>(null);
    const [overview, setOverview] = useState<any>(null);
    const [todayData, setTodayData] = useState<any>(null);
    const [churnData, setChurnData] = useState<any>(null);
    const [profitablePlayers, setProfitablePlayers] = useState<any[]>([]);

    useEffect(() => {
        if (userRole === 'SUPER_ADMIN') {
            fetchAnalytics();
            fetchTodayAnalytics();
        }
    }, [timeRange, userRole]);

    const fetchTodayAnalytics = async () => {
        try {
            const today = await adminAPI.getTodayAnalytics();
            setTodayData(today.data);
        } catch (err: any) {
            console.error('Today analytics fetch error:', err);
        }
    };

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);

        try {
            // Fetch all analytics data in parallel
            const [ggr, dau, avgStake, retention, velocity, overviewData, churn, profit] = await Promise.all([
                adminAPI.getGGRData(timeRange),
                adminAPI.getDAUData(timeRange),
                adminAPI.getAvgStakeData(timeRange),
                adminAPI.getRetentionData(timeRange),
                adminAPI.getMatchVelocityData(timeRange === '7d' ? '7d' : '30d'),
                adminAPI.getAnalyticsOverview(timeRange),
                adminAPI.getChurnData(timeRange),
                adminAPI.getProfitablePlayers(timeRange)
            ]);

            setGgrData(ggr);
            setDauData(dau);
            setAvgStakeData(avgStake);
            setRetentionData(retention);
            setVelocityData(velocity);
            setOverview(overviewData.overview);
            setChurnData(churn);
            setProfitablePlayers(profit.data || []);
        } catch (err: any) {
            console.error('Analytics fetch error:', err);
            setError(err.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const TimeRangeSelector = () => (
        <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as AnalyticsTimeRange[]).map((range) => (
                <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${timeRange === range
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                >
                    {range === '7d' && '7 Days'}
                    {range === '30d' && '30 Days'}
                    {range === '90d' && '90 Days'}
                    {range === 'all' && 'All Time'}
                </button>
            ))}
        </div>
    );

    const MetricCard = ({ title, value, subtitle, icon, gradient }: any) => (
        <div className={`bg-gradient-to-br ${gradient} p-6 rounded-xl shadow-md border-2`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">{icon}</span>
                <div className="text-right">
                    <p className="text-xs uppercase font-bold text-gray-600">{title}</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{value}</p>
                    {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
                </div>
            </div>
        </div>
    );

    if (loading && !overview) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <p className="text-red-800 font-medium">Error loading analytics: {error}</p>
                <button
                    onClick={fetchAnalytics}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Time Range Selector */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900">📊 Analytics Dashboard</h2>
                    <p className="text-sm text-gray-600 mt-1">Comprehensive platform performance metrics</p>
                </div>
                <TimeRangeSelector />
            </div>

            {/* Today's Activity Section */}
            {todayData && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 p-6 shadow-lg">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-black text-indigo-900 flex items-center gap-2">
                                <span className="text-2xl">⚡</span> Today's Activity
                            </h3>
                            <p className="text-sm text-indigo-600 mt-1">Real-time money flow (Midnight - Now)</p>
                        </div>
                        <button
                            onClick={fetchTodayAnalytics}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors"
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Deposits */}
                        <div className="bg-white rounded-xl p-5 shadow-md border-2 border-green-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">💵</span>
                                <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                                    {todayData.moneyFlow.deposits.count} txns
                                </span>
                            </div>
                            <p className="text-xs uppercase font-bold text-gray-600">Total Deposits</p>
                            <p className="text-3xl font-black text-green-600 mt-1">
                                ${todayData.moneyFlow.deposits.amount.toFixed(2)}
                            </p>
                        </div>

                        {/* Amount Played */}
                        <div className="bg-white rounded-xl p-5 shadow-md border-2 border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">🎮</span>
                                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                                    {todayData.gameplay.totalGames} games
                                </span>
                            </div>
                            <p className="text-xs uppercase font-bold text-gray-600">Amount Played</p>
                            <p className="text-3xl font-black text-blue-600 mt-1">
                                ${todayData.gameplay.totalStaked.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                {todayData.gameplay.depositsPlayedPercentage}% of deposits
                            </p>
                        </div>

                        {/* Rake Earned */}
                        <div className="bg-white rounded-xl p-5 shadow-md border-2 border-purple-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">💰</span>
                                <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                                    10% commission
                                </span>
                            </div>
                            <p className="text-xs uppercase font-bold text-gray-600">My Rake</p>
                            <p className="text-3xl font-black text-purple-600 mt-1">
                                ${todayData.rake.totalEarned.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                From {todayData.rake.fromGamesCount} games
                            </p>
                        </div>

                        {/* Net Money Flow */}
                        <div className="bg-white rounded-xl p-5 shadow-md border-2 border-orange-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">📈</span>
                                <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                                    {todayData.moneyFlow.totalTransactions} txns
                                </span>
                            </div>
                            <p className="text-xs uppercase font-bold text-gray-600">Net Flow</p>
                            <p className={`text-3xl font-black mt-1 ${todayData.moneyFlow.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {todayData.moneyFlow.netFlow >= 0 ? '+' : ''}${todayData.moneyFlow.netFlow.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                Deposits - Withdrawals
                            </p>
                        </div>
                    </div>

                    {/* Withdrawals Info */}
                    <div className="mt-4 bg-white rounded-lg p-4 border border-indigo-100">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-600">💸 Withdrawals: ${todayData.moneyFlow.withdrawals.amount.toFixed(2)}</span>
                            <span className="text-xs font-bold text-gray-600">{todayData.moneyFlow.withdrawals.count} requests</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Key Metrics Cards */}
            {overview && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard
                        title="GGR (Total)"
                        value={`$${overview.ggr.toFixed(2)}`}
                        subtitle={`${overview.revenueGames} games`}
                        icon="💰"
                        gradient="from-green-50 to-green-100 border-green-200"
                    />
                    <MetricCard
                        title="DAU"
                        value={overview.dau}
                        subtitle="Active players"
                        icon="👥"
                        gradient="from-blue-50 to-blue-100 border-blue-200"
                    />
                    <MetricCard
                        title="Avg. Stake"
                        value={`$${overview.avgStake.toFixed(2)}`}
                        subtitle="Per match"
                        icon="🎯"
                        gradient="from-purple-50 to-purple-100 border-purple-200"
                    />
                    <MetricCard
                        title="Total Games"
                        value={overview.totalGames}
                        subtitle="All matches"
                        icon="🎮"
                        gradient="from-yellow-50 to-yellow-100 border-yellow-200"
                    />
                    <MetricCard
                        title="Revenue Rate"
                        value={overview.totalGames > 0 ? `${((overview.revenueGames / overview.totalGames) * 100).toFixed(1)}%` : '0%'}
                        subtitle="Paid matches"
                        icon="📈"
                        gradient="from-pink-50 to-pink-100 border-pink-200"
                    />
                    <MetricCard
                        title="Playable Wallets"
                        value={overview.playableUsers || 0}
                        subtitle={`Total: $${(overview.playableBalance || 0).toFixed(2)}`}
                        icon="💳"
                        gradient="from-emerald-50 to-emerald-100 border-emerald-200"
                    />
                    {churnData && churnData.data && (
                        <MetricCard
                            title="Churn Rate"
                            value={`${churnData.data.percentageOfTotal.toFixed(1)}%`}
                            subtitle={`${churnData.data.churnedPlayers} one-timers`}
                            icon="⚠️"
                            gradient="from-red-50 to-red-100 border-red-200"
                        />
                    )}
                </div>
            )}

            {/* GGR Chart */}
            {ggrData && ggrData.data && ggrData.data.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Gross Gaming Revenue (GGR)</h3>
                            <p className="text-sm text-gray-600">Daily revenue from 10% commission</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Total: <span className="font-bold text-green-600">${ggrData.summary.total.toFixed(2)}</span></p>
                            <p className="text-xs text-gray-500">Avg: ${ggrData.summary.averageDaily.toFixed(2)}/day</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={ggrData.data}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                stroke="#6b7280"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                                formatter={(value: any) => [`$${value.toFixed(2)}`, 'Revenue']}
                            />
                            <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* DAU Chart */}
            {dauData && dauData.data && dauData.data.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Daily Active Users (DAU)</h3>
                            <p className="text-sm text-gray-600">Unique human players per day</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Peak: <span className="font-bold text-blue-600">{dauData.summary.peak}</span></p>
                            <p className="text-xs text-gray-500">Avg: {dauData.summary.average} users/day</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dauData.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                stroke="#6b7280"
                                style={{ fontSize: '12px' }}
                            />
                            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                                formatter={(value: any) => [value, 'Active Users']}
                            />
                            <Bar dataKey="activeUsers" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Average Stake Chart */}
                {avgStakeData && avgStakeData.data && avgStakeData.data.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Average Stake Trend</h3>
                            <p className="text-sm text-gray-600">Per match over time</p>
                            <p className="text-sm mt-2">Current: <span className="font-bold text-purple-600">${avgStakeData.summary.current.toFixed(2)}</span></p>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={avgStakeData.data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    stroke="#6b7280"
                                    style={{ fontSize: '11px' }}
                                />
                                <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                                    formatter={(value: any) => [`$${value.toFixed(2)}`, 'Avg Stake']}
                                />
                                <Line type="monotone" dataKey="averageStake" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Retention Rate Chart */}
                {retentionData && retentionData.data && retentionData.data.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Retention Rate</h3>
                            <p className="text-sm text-gray-600">% returning next day</p>
                            <p className="text-sm mt-2">Overall: <span className="font-bold text-orange-600">{retentionData.summary.overallRetention.toFixed(1)}%</span></p>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={retentionData.data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    stroke="#6b7280"
                                    style={{ fontSize: '11px' }}
                                />
                                <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} domain={[0, 100]} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                                    formatter={(value: any) => [`${value.toFixed(1)}%`, 'Retention']}
                                />
                                <Line type="monotone" dataKey="retentionRate" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Match Velocity Chart */}
            {velocityData && velocityData.data && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Match Velocity (24-Hour Breakdown)</h3>
                            <p className="text-sm text-gray-600">Matches started per hour</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Peak: <span className="font-bold text-indigo-600">{velocityData.summary.peakMatches} @ {velocityData.summary.peakHour}:00</span></p>
                            <p className="text-xs text-gray-500">Avg: {velocityData.summary.averagePerHour.toFixed(1)} matches/hour</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={velocityData.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="hour"
                                tickFormatter={(value) => `${value}:00`}
                                stroke="#6b7280"
                                style={{ fontSize: '11px' }}
                            />
                            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                                labelFormatter={(value) => `Hour: ${value}:00`}
                                formatter={(value: any) => [value, 'Matches']}
                            />
                            <Bar dataKey="matches" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Profitable Players Leaderboard */}
            {profitablePlayers && profitablePlayers.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white">
                        <h3 className="text-xl font-black flex items-center gap-2">
                            <span>🏆</span> Most Profitable Players ({timeRange === 'all' ? 'All Time' : timeRange})
                        </h3>
                        <p className="text-emerald-100 text-xs mt-1 font-medium opacity-80 decoration-indigo-300">Net Profit = Total Winnings - Total Losses (Matches only)</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Rank</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Player</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Matches</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Wins</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">Net Profit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {profitablePlayers.map((player, index) => (
                                    <tr key={player._id || index} className="hover:bg-gray-50/80 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm
                                                ${index === 0 ? 'bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-200' :
                                                    index === 1 ? 'bg-slate-300 text-slate-700 shadow-lg shadow-slate-100' :
                                                        index === 2 ? 'bg-amber-600 text-amber-50 shadow-lg shadow-amber-200' :
                                                            'bg-gray-100 text-gray-500'}`}>
                                                {index + 1}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">{player.username}</span>
                                                <span className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">ID: {player._id?.slice(-8) || 'SYSTEM'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-600">{player.totalGames || 0}</td>
                                        <td className="px-6 py-4 text-right font-bold text-blue-600">{player.wins || 0}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`text-sm font-black ${player.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {player.netProfit >= 0 ? '+' : ''}${player.netProfit.toFixed(2)}
                                                </span>
                                                <div className="h-1 w-12 bg-gray-100 rounded-full mt-1 overflow-hidden relative">
                                                    <div
                                                        className={`absolute inset-y-0 left-0 ${player.netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.min(100, (Math.abs(player.netProfit) / (profitablePlayers[0]?.netProfit || 1)) * 100)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && (!ggrData || !ggrData.data || ggrData.data.length === 0) && (
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                    <span className="text-6xl mb-4 block">📊</span>
                    <h3 className="text-xl font-bold text-gray-700 mb-2">No Analytics Data Yet</h3>
                    <p className="text-gray-600">Analytics will appear once games are played and revenue is generated.</p>
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
