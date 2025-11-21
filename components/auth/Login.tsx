import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface LoginProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
  onSwitchToResetPassword?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess, onSwitchToRegister, onSwitchToResetPassword }) => {
  const [phone, setPhone] = useState('61');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    // Ensure it starts with 61
    if (value === '' || value.startsWith('61')) {
      setPhone(value);
    } else if (value.length > 0 && !value.startsWith('61')) {
      // If user types something else, prepend 61
      setPhone('61' + value.replace(/^61/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate phone number
    if (!phone.startsWith('61')) {
      setError('Phone number must start with 61');
      return;
    }

    if (phone.length < 9) {
      setError('Phone number must be at least 9 digits (61xxxxxxx)');
      return;
    }

    setLoading(true);

    try {
      // Send full number with country code
      const fullPhoneNumber = '+252' + phone;
      await login(fullPhoneNumber, password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">
          Welcome Back
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">
              Phone Number
            </label>
            <div className="flex items-center bg-slate-900 border border-slate-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500">
              <div className="flex items-center px-3 py-3 bg-slate-800 border-r border-slate-600">
                <span className="text-xl mr-2">🇸🇴</span>
                <span className="text-white font-medium">+252</span>
              </div>
              <input 
                type="text" 
                value={phone}
                onChange={handlePhoneChange}
                className="flex-1 bg-slate-900 px-3 py-3 text-white outline-none"
                placeholder="61xxxxxxx"
                required
                disabled={loading}
              />
            </div>
            <p className="text-slate-500 text-xs mt-1">Enter number starting with 61</p>
          </div>
          
          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter your password"
              required
              disabled={loading}
            />
          </div>
          
          {onSwitchToResetPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onSwitchToResetPassword();
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300 underline"
              >
                Forgot Password?
              </button>
            </div>
          )}
          
          {error && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
              {error.includes('Cannot connect to server') && (
                <p className="text-red-300 text-xs text-center mt-2">
                  💡 Make sure the backend server is running on port 5000
                </p>
              )}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={onSwitchToRegister}
            className="text-slate-400 hover:text-white text-sm underline"
          >
            Need an account? Sign Up
          </button>
        </div>
        
        <div className="mt-4 text-center">
        </div>
      </div>
    </div>
  );
};

export default Login;

