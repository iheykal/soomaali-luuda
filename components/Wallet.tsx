import React, { useState, useEffect } from 'react';
import type { User, FinancialRequest } from '../types';
import { walletAPI } from '../services/walletAPI';
import { useAuth } from '../context/AuthContext';

interface WalletProps {
  user: User;
  onClose: () => void;
}

const Wallet: React.FC<WalletProps> = ({ user, onClose }) => {
  const [amount, setAmount] = useState('');
  const [myRequests, setMyRequests] = useState<FinancialRequest[]>([]);
  const [tab, setTab] = useState<'action' | 'history'>('action');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the refreshUser function from auth context to update the global user state
  const { refreshUser } = useAuth();

  // Deposit-specific fields, initialized with user data
  const [fullName, setFullName] = useState(user.username || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phone || '');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both requests and latest user data
      const [requestsData] = await Promise.all([
        walletAPI.getMyRequests(),
        refreshUser(), // Refresh the global user state
      ]);

      if (requestsData.success) {
        setMyRequests(requestsData.requests);
      }
    } catch (err: any) {
      console.error('Error fetching wallet data:', err);
      setError(err.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRequest = async (type: 'DEPOSIT' | 'WITHDRAWAL') => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    if (type === 'DEPOSIT') {
      if (!fullName.trim() || !phoneNumber.trim()) {
        setError('Full Name and Phone Number are required for deposits.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      await walletAPI.createRequest(type, val, {
        userId: user.id,
        userName: user.username,
        fullName,
        phoneNumber,
      });

      alert('Request submitted successfully! Admin will process it shortly.');
      setAmount('');
      // Refresh all data
      await fetchData();
    } catch (err: any) {
      console.error('Error creating request:', err);
      setError(err.message || 'Failed to submit request.');
      alert(`Error: ${err.message || 'Failed to submit request.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden">
        <div className="bg-slate-900 p-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">My Wallet</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="p-6 text-center bg-gradient-to-br from-slate-800 to-slate-900">
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-1">Current Balance</p>
          {loading && myRequests.length === 0 ? (
            <div className="flex items-center justify-center mt-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            </div>
          ) : (
            <p className="text-4xl font-black text-white">${(user.balance || 0).toFixed(2)}</p>
          )}
        </div>

        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setTab('action')}
            className={`flex-1 py-3 font-bold text-sm transition-colors ${tab === 'action' ? 'bg-slate-700 text-cyan-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Actions
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-3 font-bold text-sm transition-colors ${tab === 'history' ? 'bg-slate-700 text-cyan-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            History
          </button>
        </div>

        <div className="p-6 min-h-[250px]">
          {error && <div className="text-red-400 text-center text-sm mb-4 p-2 bg-red-500/10 rounded border border-red-500/20">{error}</div>}
          
          {tab === 'action' ? (
            <div className="space-y-6">
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 mb-4">
                <p className="text-xs text-amber-400 mb-2 font-semibold">⚠️ Security Check</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Verify Full Name"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Verify Phone Number"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Amount ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-white text-xl font-bold focus:ring-2 focus:ring-cyan-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1 text-right">Min: $1 | Max Deposit: $300</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleRequest('DEPOSIT')}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95 disabled:opacity-50 shadow-lg shadow-green-900/20"
                >
                  {loading ? '...' : 'Deposit'}
                </button>
                <button
                  onClick={() => handleRequest('WITHDRAWAL')}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95 disabled:opacity-50 shadow-lg shadow-red-900/20"
                >
                  {loading ? '...' : 'Withdraw'}
                </button>
              </div>
              <div className="text-xs text-slate-500 text-center leading-relaxed border-t border-slate-700 pt-4">
                <p>Submit a request to deposit or withdraw funds.</p>
                <p>Admin will review and approve shortly.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto max-h-[350px] custom-scrollbar pr-2">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
                  <p className="text-slate-400 text-sm">Loading requests...</p>
                </div>
              ) : myRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-slate-400 text-sm mb-1">No requests found</p>
                  <p className="text-slate-500 text-xs">Submit a deposit or withdrawal request to see it here</p>
                </div>
              ) : (
                myRequests.map(req => {
                  const isDeposit = req.type === 'DEPOSIT';
                  const statusColors = {
                    'APPROVED': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: '✓' },
                    'REJECTED': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', icon: '✗' },
                    'PENDING': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: '⏳' }
                  };
                  const statusStyle = statusColors[req.status as keyof typeof statusColors] || statusColors.PENDING;

                  return (
                    <div
                      key={req.id || req._id}
                      className={`relative overflow-hidden rounded-xl border-2 ${statusStyle.border} ${statusStyle.bg} p-4 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}
                    >
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isDeposit ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              <span className="text-2xl">{isDeposit ? '💰' : '💸'}</span>
                            </div>
                            <div>
                              <p className={`text-sm font-bold uppercase tracking-wider ${isDeposit ? 'text-green-400' : 'text-red-400'}`}>{req.type}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{new Date(req.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-white mb-1">${req.amount.toFixed(2)}</p>
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${statusStyle.text} ${statusStyle.bg} border ${statusStyle.border}`}>
                              <span>{statusStyle.icon}</span>
                              {req.status}
                            </span>
                          </div>
                        </div>
                        {req.adminComment && (
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <p className="text-xs text-slate-400 flex items-start gap-2"><span className="text-cyan-400 mt-0.5">💬</span><span className="italic">{req.adminComment}</span></p>
                          </div>
                        )}
                        {req.details && !req.adminComment && (
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <p className="text-xs text-slate-500 truncate" title={req.details}>{req.details}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
