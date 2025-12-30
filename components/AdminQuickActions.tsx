import React, { useState, useRef } from 'react';
import { adminAPI } from '../services/adminAPI';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import TransactionReceipt from './TransactionReceipt';
import html2canvas from 'html2canvas';
import type { FinancialRequest } from '../types';

interface QuickUser {
    userId: string;
    username: string;
    phone: string;
    balance: number;
    avatar?: string;
    role: string;
}

const AdminQuickActions: React.FC = () => {
    const { user: authUser } = useAuth();
    const [searchId, setSearchId] = useState('');
    const [user, setUser] = useState<QuickUser | null>(null);
    const [candidates, setCandidates] = useState<QuickUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Confirmation Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ type: 'DEPOSIT' | 'WITHDRAWAL', amount: number } | null>(null);

    // Receipt state
    const receiptRef = useRef<HTMLDivElement>(null);
    const [receiptData, setReceiptData] = useState<{ req: FinancialRequest, user: { username: string, phone?: string } } | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchId.trim()) return;

        setLoading(true);
        setUser(null);
        setCandidates([]);

        try {
            const response = await adminAPI.getQuickUserInfo(searchId.trim());

            if (response.success) {
                if (response.user) {
                    // Exact or single match
                    setUser(response.user);
                    toast.success('User found');
                } else if (response.matches && response.matches.length > 0) {
                    // Multiple matches found
                    setCandidates(response.matches);
                    toast.success(`Found ${response.matches.length} matches`);
                } else {
                    toast.error('User not found');
                }
            } else {
                toast.error('User not found');
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Error searching user');
        } finally {
            setLoading(false);
        }
    };

    const selectCandidate = (selectedUser: QuickUser) => {
        setUser(selectedUser);
        setCandidates([]);
        toast.success(`Selected ${selectedUser.username}`);
    };

    const downloadReceipt = async (req: FinancialRequest, userName: string, userPhone?: string) => {
        // Set up receipt data for rendering
        setReceiptData({
            req,
            user: {
                username: userName,
                phone: userPhone
            }
        });

        // Wait for render
        setTimeout(async () => {
            if (receiptRef.current) {
                try {
                    const canvas = await html2canvas(receiptRef.current, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        logging: false
                    });

                    const image = canvas.toDataURL("image/png");
                    const link = document.createElement('a');
                    link.href = image;
                    link.download = `Ludo-Receipt-${req.type}-${req.shortId || Date.now()}.png`;
                    link.click();

                    toast.success('Receipt downloaded!');
                } catch (err) {
                    console.error('Receipt generation failed:', err);
                    toast.error('Failed to generate receipt');
                } finally {
                    setReceiptData(null);
                }
            }
        }, 100);
    };

    const handleTransaction = async (type: 'DEPOSIT' | 'WITHDRAWAL') => {
        if (!user || !amount || parseFloat(amount) <= 0) {
            toast.error('Invalid amount');
            return;
        }

        // Show confirmation modal instead of window.confirm
        setConfirmAction({ type, amount: parseFloat(amount) });
        setShowConfirmModal(true);
    };

    const executeTransaction = async () => {
        if (!user || !confirmAction) return;

        const { type, amount: transactionAmount } = confirmAction;
        setShowConfirmModal(false);
        setActionLoading(true);
        try {
            // Pass the authenticated admin's ID for proper tracking
            const adminId = authUser?.id || authUser?._id || 'admin_quick_action';
            const response = await adminAPI.performQuickTransaction(user.userId, type, transactionAmount, adminId);

            if (response.success) {
                toast.success(`${type} Successful! New Balance: $${response.newBalance.toFixed(2)}`);
                // Update local state
                setUser({ ...user, balance: response.newBalance });
                setAmount('');
                setConfirmAction(null);

                // Auto-generate receipt if request data is returned
                if (response.request) {
                    const receiptRequest: FinancialRequest = {
                        id: response.request.id,
                        _id: response.request.id,
                        shortId: response.request.shortId,
                        userId: user.userId,
                        userName: response.request.userName,
                        type: response.request.type,
                        amount: response.request.amount,
                        status: response.request.status as 'PENDING' | 'APPROVED' | 'REJECTED',
                        timestamp: response.request.timestamp,
                        approverName: response.request.approverName
                    };

                    downloadReceipt(receiptRequest, user.username, user.phone);
                }
            } else {
                toast.error(response.error || 'Transaction failed');
            }
        } catch (error) {
            console.error('Transaction error:', error);
            toast.error('Transaction failed');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <>
            <div className="w-full max-w-4xl mx-auto mb-6 p-4 bg-slate-800/90 backdrop-blur border border-purple-500/30 rounded-xl shadow-xl">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⚡</span>
                        <h3 className="text-white font-bold text-lg">Quick Admin Actions</h3>
                    </div>

                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="flex-1 w-full md:w-auto flex gap-2">
                        <input
                            type="text"
                            placeholder="Search by User ID or Phone..."
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                        >
                            {loading ? '🔍...' : '🔍 Search'}
                        </button>
                    </form>
                </div>

                {/* Candidates List (Multiple Matches) */}
                {candidates.length > 0 && !user && (
                    <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 animate-fadeIn">
                        <h4 className="text-slate-300 text-sm font-bold mb-3 uppercase tracking-wider">Select a user ({candidates.length} matches):</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {candidates.map((candidate) => (
                                <button
                                    key={candidate.userId}
                                    onClick={() => selectCandidate(candidate)}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-purple-500 transition-all text-left group"
                                >
                                    <img
                                        src={candidate.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.userId}`}
                                        alt="Avatar"
                                        className="w-10 h-10 rounded-full border border-slate-500 group-hover:border-purple-400"
                                    />
                                    <div>
                                        <p className="text-white font-bold text-sm group-hover:text-purple-300 transition-colors">{candidate.username}</p>
                                        <p className="text-slate-400 text-xs font-mono">{candidate.phone}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-300 group-hover:bg-purple-900 group-hover:text-purple-100 transition-colors">Select</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Selected User Result Area */}
                {user && (
                    <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 animate-fadeIn">
                        <div className="flex flex-col md:flex-row gap-6 items-center">

                            {/* User Info */}
                            <div className="flex items-center gap-4 flex-1">
                                <img
                                    src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.userId}`}
                                    alt="Avatar"
                                    className="w-16 h-16 rounded-full border-2 border-purple-500"
                                />
                                <div>
                                    <h4 className="text-xl font-bold text-white">{user.username} <span className="text-xs px-2 py-0.5 bg-slate-700 rounded-full text-slate-300">{user.role}</span></h4>
                                    <p className="text-slate-400 text-sm font-mono">{user.phone}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-green-400 font-bold text-lg">${user.balance.toFixed(2)}</span>
                                        <span className="text-xs text-slate-500">Current Balance</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Area */}
                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto p-3 bg-slate-800 rounded-lg border border-slate-700">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-32 bg-slate-900 border border-slate-600 rounded-lg pl-6 pr-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                                    />
                                </div>

                                <button
                                    onClick={() => handleTransaction('DEPOSIT')}
                                    disabled={actionLoading}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg hover:shadow-green-500/20 transition-all disabled:opacity-50"
                                >
                                    + Deposit
                                </button>

                                <button
                                    onClick={() => handleTransaction('WITHDRAWAL')}
                                    disabled={actionLoading}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg hover:shadow-red-500/20 transition-all disabled:opacity-50"
                                >
                                    - Withdraw
                                </button>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && confirmAction && user && (
                <div
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => {
                        setShowConfirmModal(false);
                        setConfirmAction(null);
                    }}
                >
                    <div
                        className={`bg-gradient-to-br ${confirmAction.type === 'DEPOSIT' ? 'from-green-500 via-green-600 to-emerald-600' : 'from-red-500 via-red-600 to-rose-600'} rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in duration-300`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-center">
                            {/* Icon */}
                            <div className="bg-white/20 backdrop-blur-sm rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                                <span className="text-6xl">
                                    {confirmAction.type === 'DEPOSIT' ? '💵' : '💸'}
                                </span>
                            </div>

                            {/* Title */}
                            <h2 className="text-3xl font-bold text-white mb-4">
                                {confirmAction.type === 'DEPOSIT' ? 'Dhigasho' : 'Bixiso'}
                            </h2>

                            {/* Message in Somali */}
                            <p className="text-xl text-white/95 mb-2 leading-relaxed">
                                {confirmAction.type === 'DEPOSIT'
                                    ? `Mahubtaa inaad lacag u dhigto`
                                    : `Mahubtaa inaad lacag u bixiso`}
                            </p>

                            {/* Amount and User */}
                            <div className="bg-white/10 rounded-xl p-4 mb-6 backdrop-blur-sm">
                                <p className="text-4xl font-black text-white mb-2">
                                    ${confirmAction.amount.toFixed(2)}
                                </p>
                                <p className="text-lg text-white/90">
                                    {user.username}
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                {/* MAYA (No) Button */}
                                <button
                                    onClick={() => {
                                        setShowConfirmModal(false);
                                        setConfirmAction(null);
                                    }}
                                    className="flex-1 bg-white/20 hover:bg-white/30 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105 border-2 border-white/30"
                                >
                                    MAYA
                                </button>

                                {/* HAA (Yes) Button */}
                                <button
                                    onClick={executeTransaction}
                                    disabled={actionLoading}
                                    className="flex-1 bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {actionLoading ? '⏳...' : 'HAA'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden Receipt Template for Generation */}
            <div className="fixed left-[-9999px] top-0">
                {receiptData && (
                    <TransactionReceipt
                        ref={receiptRef}
                        request={receiptData.req}
                        userName={receiptData.user.username}
                        userPhone={receiptData.user.phone}
                    />
                )}
            </div>
        </>
    );
};

export default AdminQuickActions;

