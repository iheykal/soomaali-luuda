import React, { useState } from 'react';
import { Gem, Plus, TrendingUp, DollarSign, User } from 'lucide-react';
import { adminAPI } from '../services/adminAPI';

interface GemsManagementProps {
    onClose?: () => void;
}

const GemsManagement: React.FC<GemsManagementProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'deposit' | 'history'>('deposit');
    const [formData, setFormData] = useState({
        userId: '',
        gemAmount: '',
        comment: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [userGemData, setUserGemData] = useState<any>(null);

    // Fetch user gem data
    const fetchUserGems = async (userId: string) => {
        try {
            const response = await fetch(`/api/admin/gems/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            setUserGemData(data);
        } catch (error) {
            console.error('Error fetching user gems:', error);
        }
    };

    // Handle gem deposit
    const handleDepositGems = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const gemAmount = parseInt(formData.gemAmount);
            if (isNaN(gemAmount) || gemAmount <= 0) {
                setMessage({ type: 'error', text: 'Please enter a valid gem amount' });
                setLoading(false);
                return;
            }

            const response = await fetch('/api/admin/deposit-gems', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    userId: formData.userId,
                    gemAmount: gemAmount,
                    comment: formData.comment
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setMessage({ type: 'success', text: `Successfully deposited ${gemAmount} gems` });
                setFormData({ ...formData, gemAmount: '', comment: '' });
                // Refresh user gem data
                fetchUserGems(formData.userId);
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to deposit gems' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An error occurred while depositing gems' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-purple-800 to-indigo-800 p-6 rounded-t-2xl border-b border-purple-600 z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                                <Gem className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">Gems Management</h2>
                                <p className="text-purple-200 text-sm">Manage re-roll gems for users (1 gem = $0.01)</p>
                            </div>
                        </div>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="text-purple-200 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-purple-600 bg-purple-800/50">
                    <button
                        onClick={() => setActiveTab('deposit')}
                        className={`flex-1 py-4 px-6 font-semibold transition-all ${activeTab === 'deposit'
                                ? 'bg-purple-700 text-white border-b-2 border-pink-500'
                                : 'text-purple-300 hover:text-white hover:bg-purple-700/50'
                            }`}
                    >
                        <Plus className="w-5 h-5 inline mr-2" />
                        Deposit Gems
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-4 px-6 font-semibold transition-all ${activeTab === 'history'
                                ? 'bg-purple-700 text-white border-b-2 border-pink-500'
                                : 'text-purple-300 hover:text-white hover:bg-purple-700/50'
                            }`}
                    >
                        <TrendingUp className="w-5 h-5 inline mr-2" />
                        Transaction History
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {message && (
                        <div
                            className={`mb-6 p-4 rounded-lg ${message.type === 'success'
                                    ? 'bg-green-500/20 border border-green-500 text-green-100'
                                    : 'bg-red-500/20 border border-red-500 text-red-100'
                                }`}
                        >
                            {message.text}
                        </div>
                    )}

                    {activeTab === 'deposit' && (
                        <form onSubmit={handleDepositGems} className="space-y-6">
                            <div>
                                <label className="block text-purple-200 font-semibold mb-2">
                                    <User className="w-4 h-4 inline mr-2" />
                                    User ID
                                </label>
                                <input
                                    type="text"
                                    value={formData.userId}
                                    onChange={(e) => {
                                        setFormData({ ...formData, userId: e.target.value });
                                        if (e.target.value.length > 6) {
                                            fetchUserGems(e.target.value);
                                        }
                                    }}
                                    placeholder="Enter user ID"
                                    className="w-full px-4 py-3 bg-purple-900/50 border border-purple-600 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    required
                                />
                            </div>

                            {userGemData && (
                                <div className="p-4 bg-purple-800/50 rounded-lg border border-purple-600">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-200 text-sm">Current User</p>
                                            <p className="text-white font-bold text-lg">{userGemData.username}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-purple-200 text-sm">Current Gems</p>
                                            <p className="text-pink-400 font-bold text-2xl flex items-center justify-end gap-1">
                                                <Gem className="w-5 h-5" />
                                                {userGemData.gems}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-purple-200 font-semibold mb-2">
                                    <Gem className="w-4 h-4 inline mr-2" />
                                    Gem Amount
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={formData.gemAmount}
                                        onChange={(e) => setFormData({ ...formData, gemAmount: e.target.value })}
                                        placeholder="Enter number of gems"
                                        min="1"
                                        className="w-full px-4 py-3 bg-purple-900/50 border border-purple-600 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                        required
                                    />
                                    {formData.gemAmount && (
                                        <div className="mt-2 text-sm text-purple-300 flex items-center gap-2">
                                            <DollarSign className="w-4 h-4" />
                                            Equivalent: ${(parseFloat(formData.gemAmount) * 0.01).toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-purple-200 font-semibold mb-2">
                                    Comment (Optional)
                                </label>
                                <textarea
                                    value={formData.comment}
                                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                                    placeholder="Add a note about this deposit..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-purple-900/50 border border-purple-600 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Plus className="w-5 h-5" />
                                        Deposit Gems
                                    </span>
                                )}
                            </button>
                        </form>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            {userGemData && userGemData.transactions && userGemData.transactions.length > 0 ? (
                                userGemData.transactions.map((transaction: any, index: number) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-purple-800/30 border border-purple-600 rounded-lg hover:bg-purple-800/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`p-2 rounded-lg ${transaction.type === 'gem_purchase'
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : 'bg-red-500/20 text-red-400'
                                                        }`}
                                                >
                                                    <Gem className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-white font-semibold">
                                                        {transaction.type === 'gem_purchase' ? 'Deposit' : 'Used for Re-roll'}
                                                    </p>
                                                    <p className="text-purple-300 text-sm">{transaction.description}</p>
                                                    <p className="text-purple-400 text-xs mt-1">
                                                        {new Date(transaction.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`text-lg font-bold ${transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                                                }`}>
                                                {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-purple-300">
                                    <Gem className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p>No transaction history available</p>
                                    <p className="text-sm mt-2">Enter a user ID in the Deposit tab to view their history</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GemsManagement;
