import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface LoginProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
  onSwitchToResetPassword?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess, onSwitchToRegister, onSwitchToResetPassword }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    setPhone(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (phone.length < 7) {
      setError('Phone number must be at least 7 digits');
      return;
    }

    setLoading(true);

    try {
      // Send full number with country code
      const fullPhoneNumber = '+252' + phone;
      await login(fullPhoneNumber, password);
      setSuccess('Login Successful! Redirecting...');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your phone number and password.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Welcome Back
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">
              Phone Number
            </label>
            <div className="flex items-center bg-gray-50 border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500">
              <div className="flex items-center px-3 py-3 bg-gray-200 border-r border-gray-300">
                <span className="text-xl mr-2">🇸🇴</span>
                <span className="text-gray-800 font-medium">+252</span>
              </div>
              <input 
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={handlePhoneChange}
                className="flex-1 bg-gray-50 px-3 py-3 text-gray-900 outline-none"
                placeholder="Enter phone number"
                required
                disabled={loading}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
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
                className="text-sm text-gray-600 hover:text-cyan-600 underline"
              >
                Forgot Password?
              </button>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-3">
              <p className="text-red-700 text-sm text-center">{error}</p>
              {error.includes('Cannot connect to server') && (
                <p className="text-red-600 text-xs text-center mt-2">
                  💡 Make sure the backend server is running on port 5000
                </p>
              )}
            </div>
          )}

          {success && (
            <div className="bg-green-100 border border-green-300 rounded-lg p-3">
              <p className="text-green-700 text-sm text-center">{success}</p>
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
            className="text-gray-600 hover:text-cyan-600 text-sm underline"
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

