import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { validateReferralCode } from '../../services/referralAPI';
import { Check, X } from 'lucide-react';

interface RegisterProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referrerName, setReferrerName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  // Check for referral code in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      setReferralCode(refCode.toUpperCase());
      validateCode(refCode);
    }
  }, []);

  const validateCode = async (code: string) => {
    if (!code || code.length < 6) {
      setReferralValid(null);
      setReferrerName('');
      return;
    }

    try {
      const result = await validateReferralCode(code);
      setReferralValid(result.valid);
      setReferrerName(result.valid ? result.referrerName : '');
    } catch (err) {
      setReferralValid(false);
      setReferrerName('');
    }
  };

  const handleReferralCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Smart URL parsing: Extract code from pasted URLs
    // Example: "http://localhost:5173/signup?ref=SOM-LUDO-ABC123" -> "SOM-LUDO-ABC123"
    if (value.includes('?ref=') || value.includes('&ref=')) {
      const match = value.match(/[?&]ref=([^&\s]+)/);
      if (match && match[1]) {
        value = match[1];
      }
    } else if (value.includes('http') || value.includes('signup')) {
      // Handle other URL formats - extract any SOM-LUDO-XXXXX pattern
      const match = value.match(/SOM-LUDO-[A-Z0-9]+/i);
      if (match) {
        value = match[0];
      }
    }

    // Convert to uppercase and remove whitespace
    const code = value.toUpperCase().trim();
    setReferralCode(code);

    // Debounce validation
    if (code.length >= 6) {
      setTimeout(() => validateCode(code), 500);
    } else {
      setReferralValid(null);
      setReferrerName('');
    }
  };

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
      // Pass referral code to backend (even if empty, backend handles it)
      await register(fullName, fullPhoneNumber, password, referralCode || undefined);
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
              Geli Magacaaga
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
              geli numberkaaga
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
            <label className="block text-gray-600 text-sm font-bold mb-2">Ku Celi passwordkaga markale</label>
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

          {/* Referral Code - Optional */}
          <div>
            <label className="block text-gray-600 text-sm  mb-2">
              Have a Referral Code? <span className="text-gray-500 text-xs">(Optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={referralCode}
                onChange={handleReferralCodeChange}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData.getData('text');
                  // Create synthetic event with parsed value
                  const syntheticEvent = {
                    target: { value: pastedText }
                  } as React.ChangeEvent<HTMLInputElement>;
                  handleReferralCodeChange(syntheticEvent);
                }}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 pr-10 text-gray-900 font-mono uppercase focus:ring-2 focus:ring-cyan-500 outline-none"
                placeholder="e.g., SOM-LUDO-ABC123"
                disabled={loading}
              />
              {referralValid === true && (
                <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500" size={20} />
              )}
              {referralValid === false && (
                <X className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500" size={20} />
              )}
            </div>
            {referralValid && referrerName && (
              <p className="text-green-600 text-sm mt-1">
                ✓ Referred by: <strong>{referrerName}</strong>
              </p>
            )}
            {referralValid === false && referralCode.length >= 6 && (
              <p className="text-red-600 text-sm mt-1">Invalid referral code</p>
            )}
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
            {loading ? 'Creating Account...' : 'Sameyso'}
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

