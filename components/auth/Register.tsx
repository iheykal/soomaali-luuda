import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface RegisterProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    setNumber(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    if (!number.trim()) {
      setError('Phone number is required');
      return;
    }

    if (number.length < 7) {
      setError('Phone number must be at least 7 digits');
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
      setSuccess('Registration successful! Redirecting...');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Create Account
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">
              Full Name *
            </label>
            <input 
              type="text" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter your full name"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">
              Phone Number *
            </label>
            <div className="flex items-center bg-gray-50 border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500">
              <div className="flex items-center px-3 py-3 bg-gray-200 border-r border-gray-300">
                <span className="text-xl mr-2">🇸🇴</span>
                <span className="text-gray-800 font-medium">+252</span>
              </div>
              <input 
                type="tel"
                inputMode="numeric"
                value={number}
                onChange={handlePhoneChange}
                className="flex-1 bg-gray-50 px-3 py-3 text-gray-900 outline-none"
                placeholder="Enter phone number"
                required
                disabled={loading}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">Password *</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Enter password (min 6 characters)"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-gray-600 text-sm font-bold mb-2">Confirm Password *</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Confirm your password"
              required
              minLength={6}
              disabled={loading}
            />
          </div>
          
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
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={onSwitchToLogin}
            className="text-gray-600 hover:text-cyan-600 text-sm underline"
          >
            Already have an account? Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;

