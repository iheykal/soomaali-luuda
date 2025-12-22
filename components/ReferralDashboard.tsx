import React, { useState, useEffect } from 'react';
import { Copy, Check, Users, DollarSign, Gift, Share2, QrCode, X } from 'lucide-react';
import { getReferralStats, getReferralEarnings } from '../services/referralAPI';

interface ReferralStats {
    code: string;
    shareUrl: string;
    totalEarnings: number;
    referredCount: number;
    referredUsers: Array<{
        _id: string;
        username: string;
        createdAt: string;
        stats: { gamesPlayed: number };
    }>;
}

interface ReferralEarning {
    _id: string;
    amount: number;
    referred: { username: string };
    gameId: string;
    createdAt: string;
}

const ReferralDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [earnings, setEarnings] = useState<ReferralEarning[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [statsData, earningsData] = await Promise.all([
                getReferralStats(),
                getReferralEarnings(1, 10)
            ]);
            setStats(statsData);
            setEarnings(earningsData.earnings || []);
            setError(null);
        } catch (error) {
            console.error('Error loading referral data:', error);
            setError('Failed to load referral data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!stats?.code) return;

        try {
            // Copy just the referral code, not the full URL
            await navigator.clipboard.writeText(stats.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            console.log('✅ Copied to clipboard:', stats.code);
        } catch (err) {
            // Fallback for older browsers
            try {
                const textArea = document.createElement('textarea');
                textArea.value = stats.code;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                console.log('✅ Copied to clipboard (fallback):', stats.code);
            } catch (fallbackErr) {
                console.error('Failed to copy:', fallbackErr);
                alert('Failed to copy. Your code: ' + stats.code);
            }
        }
    };

    const handleShare = async () => {
        if (!stats) return;

        const shareData = {
            title: 'Join me on Ludo!',
            text: `Use my referral code: ${stats.code} to sign up 🎲`,
            url: stats.shareUrl
        };

        // Try native share API (mobile)
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                console.log('Share cancelled');
            }
        } else {
            handleCopy();
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-slate-900 bg-opacity-95 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">Error</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                    <p className="text-red-400">{error}</p>
                    <button
                        onClick={() => { setLoading(true); loadData(); }}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!stats) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-95 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 my-auto">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Gift className="text-cyan-500" size={28} />
                        Referral Dashboard
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Somali Explanation Banner */}
                <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 rounded-xl p-6 text-white">
                    <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <span className="text-2xl">💰</span>
                        Kasamee Lacag - Qeybtaan!
                    </h3>
                    <div className="space-y-3 text-white/95">
                        <p className="flex items-start gap-2">
                            <span className="text-xl">✨</span>
                            <span>
                                <strong>Lacag adigoon dhiganin!</strong> Si fudud linkigaga qof walba u dir.
                            </span>
                        </p>
                        <p className="flex items-start gap-2">
                            <span className="text-xl">🎯</span>
                            <span>
                                Qofkii iska diiwaan galiya linkigaga, <strong className="text-yellow-300">waxaad heli doontaa 4%</strong> ciyaar walba uu dheelo!
                            </span>
                        </p>
                        <p className="flex items-start gap-2">
                            <span className="text-xl">🔄</span>
                            <span>
                                <strong className="text-yellow-300">Ma ahan hal ciyaar</strong> - waa ciyaar walbo oo uu ciyaaro! Lacag joogto ah!
                            </span>
                        </p>

                    </div>
                </div>

                {/* Referral Code Card */}
                <div className="bg-gradient-to-r from-cyan-600 to-purple-600 rounded-xl p-6 text-center">
                    <p className="text-white text-sm mb-2">Your Referral Code</p>
                    <p className="text-white text-3xl font-bold mb-4 font-mono tracking-wider">{stats.code}</p>
                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 bg-white  text-cyan-900 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                        >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                            {copied ? 'Copied!' : 'Copy Code'}
                        </button>
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-2 bg-white bg-opacity-20 text-white px-4 py-2 rounded-lg font-semibold hover:bg-opacity-30 transition-colors"
                        >
                            <Share2 size={18} />
                            Share
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700 rounded-xl p-4 text-center">
                        <DollarSign className="text-green-500 mx-auto mb-2" size={32} />
                        <p className="text-2xl font-bold text-white">${(stats.totalEarnings ?? 0).toFixed(2)}</p>
                        <p className="text-gray-400 text-sm">Total Earnings</p>
                    </div>
                    <div className="bg-slate-700 rounded-xl p-4 text-center">
                        <Users className="text-blue-500 mx-auto mb-2" size={32} />
                        <p className="text-2xl font-bold text-white">{stats.referredCount ?? 0}</p>
                        <p className="text-gray-400 text-sm">Dadka aad keentay</p>
                    </div>
                </div>

                {/* Share Options */}
                <div className="bg-slate-700 rounded-xl p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Share2 size={18} />
                        Quick Share
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Join me on Ludo! Use my code: ${stats.code}\n${stats.shareUrl}`)}`)}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                            WhatsApp
                        </button>
                        <button
                            onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on Ludo! Use my code: ${stats.code}`)}& url=${encodeURIComponent(stats.shareUrl)}`)}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                            Twitter
                        </button>
                        <button
                            onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(stats.shareUrl)}&text=${encodeURIComponent(`Join me on Ludo! Code: ${stats.code}`)}`)}
                            className="bg-blue-400 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                            Telegram
                        </button>
                    </div>
                </div>

                {/* Recent Earnings */}
                <div className="bg-slate-700 rounded-xl p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <DollarSign className="text-green-500" size={20} />
                        Lacagaha aad samaysay
                    </h3>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                        {earnings.length > 0 ? (
                            earnings.map((earning) => (
                                <div key={earning._id} className="bg-gradient-to-r from-slate-600 to-slate-700 p-4 rounded-xl border border-slate-500 hover:border-cyan-500 transition-all hover:shadow-lg hover:shadow-cyan-500/20">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <Users className="text-cyan-400" size={18} />
                                            <p className="text-white font-semibold">{earning.referred.username}</p>
                                        </div>
                                        <div className="bg-green-500/20 px-3 py-1 rounded-full">
                                            <p className="text-green-400 font-bold text-sm">+${earning.amount.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-400 text-xs flex items-center gap-1">
                                        <span>📅</span>
                                        {new Date(earning.createdAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-400 text-center py-4">No earnings yet. Share your code to get started!</p>
                        )}
                    </div>
                </div>

                {/* Referred Users */}
                {stats.referredUsers.length > 0 && (
                    <div className="bg-slate-700 rounded-xl p-4">
                        <h3 className="text-white font-semibold mb-3">Your Referrals</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {stats.referredUsers.map((user) => (
                                <div key={user._id} className="flex justify-between items-center bg-slate-600 p-3 rounded-lg">
                                    <div>
                                        <p className="text-white font-medium">{user.username}</p>
                                        <p className="text-gray-400 text-xs">{user.stats.gamesPlayed} games played</p>
                                    </div>
                                    <p className="text-cyan-500 text-sm">
                                        Joined {new Date(user.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReferralDashboard;
