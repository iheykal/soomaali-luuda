
import React, { useState } from 'react';
import { storage } from '../lib/storage';
import type { User } from '../types';

interface AuthProps {
    onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        try {
            if (isRegistering) {
                const user = storage.register(username, password);
                onLogin(user);
            } else {
                const user = storage.login(username, password);
                if (user) {
                    onLogin(user);
                } else {
                    setError('Invalid credentials');
                }
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-700">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">
                {isRegistering ? 'Create Account' : 'Welcome Back'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-slate-400 text-sm font-bold mb-2">Username</label>
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="block text-slate-400 text-sm font-bold mb-2">Password</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                        required
                    />
                </div>
                
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                
                <button 
                    type="submit" 
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition-transform transform active:scale-95"
                >
                    {isRegistering ? 'Sign Up' : 'Login'}
                </button>
            </form>
            
            <div className="mt-6 text-center">
                <button 
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-slate-400 hover:text-white text-sm underline"
                >
                    {isRegistering ? 'Already have an account? Login' : 'Need an account? Sign Up'}
                </button>
            </div>
            
            <div className="mt-4 text-center">
                 <p className="text-xs text-slate-600">Demo Admin: admin / 123</p>
            </div>
        </div>
    );
};

export default Auth;
