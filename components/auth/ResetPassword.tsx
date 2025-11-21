import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

interface ResetPasswordProps {
  token?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ token: urlToken, onSuccess, onCancel }) => {
  const [step, setStep] = useState<'request' | 'reset'>(urlToken ? 'reset' : 'request');
  const [phoneOrUsername, setPhoneOrUsername] = useState('');
  const [token, setToken] = useState(urlToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { requestPasswordReset, resetPassword } = useAuth();

  useEffect(() => {
    // Check if token is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      setStep('reset');
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await requestPasswordReset(phoneOrUsername);
      setMessage('Password reset link has been sent to your email/phone. Please check your messages.');
      setPhoneOrUsername('');
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!token) {
      setError('Reset token is required');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(token, newPassword);
      setMessage('Password has been reset successfully! Redirecting to login...');
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Token may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'request') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">
            Reset Password
          </h2>
          
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm font-bold mb-2">
                Phone Number or Username
              </label>
              <input 
                type="text" 
                value={phoneOrUsername}
                onChange={(e) => setPhoneOrUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                placeholder="Enter phone or username"
                required
                disabled={loading}
              />
            </div>
            
            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-lg p-3">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {message && (
              <div className="bg-green-900/50 border border-green-600 rounded-lg p-3">
                <p className="text-green-400 text-sm text-center">{message}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button 
              onClick={onCancel}
              className="text-slate-400 hover:text-white text-sm underline"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">
          Set New Password
        </h2>
        
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">Reset Token</label>
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter reset token"
              required
              disabled={loading || !!urlToken}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">New Password</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter new password (min 6 characters)"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">Confirm New Password</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Confirm new password"
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {message && (
            <div className="bg-green-900/50 border border-green-600 rounded-lg p-3">
              <p className="text-green-400 text-sm text-center">{message}</p>
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={onCancel}
            className="text-slate-400 hover:text-white text-sm underline"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

