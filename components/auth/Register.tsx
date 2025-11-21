import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface RegisterProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [number, setNumber] = useState('61');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    // Ensure it starts with 61
    if (value === '' || value.startsWith('61')) {
      setNumber(value);
    } else if (value.length > 0 && !value.startsWith('61')) {
      // If user types something else, prepend 61
      setNumber('61' + value.replace(/^61/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    if (!number.trim()) {
      setError('Phone number is required');
      return;
    }

    if (!number.startsWith('61')) {
      setError('Phone number must start with 61');
      return;
    }

    if (number.length < 9) {
      setError('Phone number must be at least 9 digits (61xxxxxxx)');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Send full number with country code
      const fullPhoneNumber = '+252' + number;
      await register(fullName, fullPhoneNumber, password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">
          Create Account
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">
              Full Name *
            </label>
            <input 
              type="text" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter your full name"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">
              Phone Number *
            </label>
            <div className="flex items-center bg-slate-900 border border-slate-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500">
              <div className="flex items-center px-3 py-3 bg-slate-800 border-r border-slate-600">
                <span className="text-xl mr-2">🇸🇴</span>
                <span className="text-white font-medium">+252</span>
              </div>
              <input 
                type="text" 
                value={number}
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
            <label className="block text-slate-400 text-sm font-bold mb-2">Password *</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter password (min 6 characters)"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm font-bold mb-2">Confirm Password *</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Confirm your password"
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          
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
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={onSwitchToLogin}
            className="text-slate-400 hover:text-white text-sm underline"
          >
            Already have an account? Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;

