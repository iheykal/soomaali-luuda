
import React, { useState, useEffect, useCallback } from 'react';
import type { Player, PlayerColor } from '../types';
import { PLAYER_TAILWIND_COLORS, PLAYER_COLORS } from '../lib/boardLayout';
import { useAuth } from '../context/AuthContext';
import { gameAPI } from '../services/gameAPI';
import RejoinGameBanner from './RejoinGameBanner';

interface GameSetupProps {
  onStartGame: (players: Player[]) => void;
  onEnterLobby: () => void;
  onRejoinGame?: (gameId: string, playerColor: string) => void;
  onEnterSuperAdmin?: () => void;
  onEnterWallet?: () => void;
  onInstall?: () => void;
  showInstallButton?: boolean;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStartGame, onEnterLobby, onRejoinGame, onEnterSuperAdmin, onEnterWallet, onInstall, showInstallButton }) => {
  const { user, logout } = useAuth();
  const [activeGameInfo, setActiveGameInfo] = useState<any>(null);
  const [showRejoinBanner, setShowRejoinBanner] = useState(false);
  const [checkingActiveGame, setCheckingActiveGame] = useState(true);
  
  // Debug: Log when onRejoinGame prop changes
  useEffect(() => {
    console.log('🔧 GameSetup: onRejoinGame prop:', typeof onRejoinGame, onRejoinGame ? 'defined' : 'undefined');
  }, [onRejoinGame]);

  const handleSignOut = () => {
    logout();
    window.location.reload(); // Reload to redirect to login
  };
  
  const [mode, setMode] = useState<'choice' | 'local_setup'>('choice');

  const checkForActiveGame = useCallback(async () => {
    setCheckingActiveGame(true);
    if (!user || !user.id) {
      setCheckingActiveGame(false);
      return;
    }

    const userId = user.id || user._id;
    if (!userId) {
      console.warn('⚠️ User object missing both id and _id');
      setCheckingActiveGame(false);
      return;
    }

    try {
      console.log('🔍 Checking for active game for user:', userId);
      const result = await gameAPI.checkActiveGame(userId);
      console.log('✅ API response for checkActiveGame:', JSON.stringify(result, null, 2));

      if (result.hasActiveGame && result.game && result.game.status === 'ACTIVE') {
        console.log('✅ Active game found:', result.game);
        setActiveGameInfo(result.game);
        setShowRejoinBanner(true);
      } else {
        if (result.hasActiveGame) {
          console.log(`ℹ️ Game found, but status is '${result.game.status}'. Not showing rejoin banner.`);
        } else {
          console.log('ℹ️ No active game found');
        }
        setActiveGameInfo(null);
        setShowRejoinBanner(false);
        // Fallback: if API returned nothing, check localStorage for a saved rejoin blob
        try {
          const saved = localStorage.getItem('ludo_rejoin');
          if (saved) {
            const parsed = JSON.parse(saved);
            // Only show rejoin if the saved playerId matches the current user (or no user id available)
            const savedPlayerMatch = !parsed.playerId || parsed.playerId === userId || parsed.sessionId;
            if (parsed.gameId && savedPlayerMatch) {
              console.log('🔁 Found local rejoin info, showing rejoin banner', parsed);
              setActiveGameInfo({
                gameId: parsed.gameId,
                playerColor: parsed.playerColor || 'green',
                isDisconnected: true,
                status: 'ACTIVE',
                stake: parsed.stake || 0,
                allPawnsHome: false,
                winners: []
              });
              setShowRejoinBanner(true);
            }
          }
        } catch (e) {
          console.warn('⚠️ Failed to parse local rejoin info', e);
        }
      }
    } catch (error) {
      console.error('Error checking for active game:', error);
      alert('Error checking for an active game. Please check your connection and try refreshing the page.');
      setShowRejoinBanner(false);
      setActiveGameInfo(null);
    } finally {
      setCheckingActiveGame(false);
    }
  }, [user]);

  // Check for active game when component mounts
  useEffect(() => {
    let isMounted = true;
    let autoRejoinTimer: NodeJS.Timeout | null = null;
    
    checkForActiveGame();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (autoRejoinTimer) {
        clearTimeout(autoRejoinTimer);
      }
    };
  }, [user, checkForActiveGame]);

  // Auto-attempt rejoin when an active disconnected game is detected
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (showRejoinBanner && activeGameInfo && activeGameInfo.isDisconnected) {
      // Delay auto-rejoin a little to allow UI to settle and network to stabilize
      timer = setTimeout(() => {
        console.log('🔁 Auto-attempting to rejoin detected active game', activeGameInfo.gameId);
        handleRejoin();
      }, 1500);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showRejoinBanner, activeGameInfo]);

  const handleRejoin = async () => {
    console.log('🎯 handleRejoin called!');
    console.log('📋 activeGameInfo:', activeGameInfo);
    console.log('👤 user:', user);
    
    if (!activeGameInfo || !user) {
      console.error('❌ Cannot rejoin: missing game info or user');
      alert('Cannot rejoin: User information is missing. Please login again.');
      return;
    }

    try {
      console.log('🔄 Attempting to rejoin game:', activeGameInfo.gameId);
      
      // Validate required game info
      if (!activeGameInfo.gameId || !activeGameInfo.playerColor) {
        throw new Error('Invalid game information');
      }
      
      // Use either id or _id
      const userId = user.id || user._id;
      if (!userId) {
        throw new Error('User ID is missing. Please login again.');
      }
      
      // Call rejoin API with username for auto-sync
      const result = await gameAPI.rejoinGame(activeGameInfo.gameId, userId, user.username);
      
      if (result.success) {
        console.log('✅ Rejoin successful, notifying parent component');
        console.log('📋 Rejoin result:', result);
        setShowRejoinBanner(false);
        // Clear persisted rejoin info (we just rejoined)
        try { localStorage.removeItem('ludo_rejoin'); } catch (e) { /* ignore */ }
        
        // Call the parent's rejoin handler if provided
        if (onRejoinGame) {
          console.log('🎯 Calling onRejoinGame with:', { gameId: result.gameId, playerColor: result.playerColor });
          onRejoinGame(result.gameId, result.playerColor);
        } else {
          // Fallback: reload the page to trigger socket reconnection
          console.log('⚠️ No rejoin handler provided, reloading page...');
          window.location.reload();
        }
      } else {
        throw new Error('Rejoin failed - server returned unsuccessful response');
      }
    } catch (error) {
      console.error('❌ Error rejoining game:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      alert(`Failed to rejoin game: ${errorMessage}\nPlease check your connection and try again.`);
    }
  };

  const handleDismissBanner = () => {
    setShowRejoinBanner(false);
  };
  
  // Default configuration: Red vs Yellow (Facing/Diagonal)
  const [playerConfig, setPlayerConfig] = useState<Record<PlayerColor, { active: boolean; isAI: boolean }>>({
    red: { active: true, isAI: false },
    green: { active: false, isAI: true },
    yellow: { active: true, isAI: true },
    blue: { active: false, isAI: true },
  });

  // Enforce Red vs Yellow default when entering setup
  useEffect(() => {
    if (mode === 'local_setup') {
        setPlayerConfig(prev => ({
            red: { ...prev.red, active: true, isAI: false },
            yellow: { ...prev.yellow, active: true, isAI: true },
            green: { ...prev.green, active: false, isAI: true },
            blue: { ...prev.blue, active: false, isAI: true }
        }));
    }
  }, [mode]);

  const randomizeColors = () => {
      // Enforce diagonal pairs so players always "face" each other
      const pairs: [PlayerColor, PlayerColor][] = [
          ['red', 'yellow'],
          ['green', 'blue']
      ];
      const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
      
      // Randomly decide which one is the AI (0 or 1)
      const aiIndex = Math.floor(Math.random() * 2);

      setPlayerConfig(prev => {
          const next = { ...prev };
          PLAYER_COLORS.forEach(c => {
              const pairIndex = selectedPair.indexOf(c);
              const isActive = pairIndex !== -1;
              next[c] = { 
                  active: isActive, 
                  // Ensure exactly one human and one computer if active
                  isAI: isActive ? (pairIndex === aiIndex) : true
              };
          });
          return next;
      });
  };

  const handleStart = () => {
    const players: Player[] = PLAYER_COLORS
      .filter(color => playerConfig[color].active)
      .map(color => ({
        color,
        isAI: playerConfig[color].isAI,
      }));
    
    if (players.length !== 2) {
        alert("Exactly 2 players are required.");
        return;
    }
    onStartGame(players);
  };

  const toggleActive = (color: PlayerColor) => {
    setPlayerConfig(prev => {
        // 1. If clicking an already active color, DO NOTHING. 
        // We enforce exactly 2 players, so you cannot turn one off directly.
        if (prev[color].active) return prev;

        // 2. If clicking an inactive color, we must activate it.
        // To maintain the count of 2, we must deactivate one of the currently active ones.
        // We remove the first active color found in the list (FIFO-ish) or random.
        
        const activeColors = PLAYER_COLORS.filter(c => prev[c].active);
        const next = { ...prev };
        
        // Deactivate the first currently active player
        if (activeColors.length > 0) {
             next[activeColors[0]].active = false;
        }
        
        // Activate the target
        next[color].active = true;
        return next;
    });
  };

  const toggleAI = (color: PlayerColor) => {
    setPlayerConfig(prev => ({
        ...prev,
        [color]: { ...prev[color], isAI: !prev[color].isAI }
    }));
  };

  // --- Local Game Setup View ---
  if (mode === 'local_setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-800 p-4">
        <div className="bg-slate-700 p-8 rounded-xl shadow-2xl w-full max-w-md">
          <div className="mb-6 text-center">
            <h2 className="block text-2xl font-medium mb-2 text-slate-200">2-Player Duel</h2>
            <p className="text-slate-400">Red vs Yellow (Diagonal). One Human vs One Computer.</p>
          </div>

          <div className="mb-6">
             <button 
                onClick={randomizeColors}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
             >
                <span className="text-xl">🎲</span>
                Randomize Setup
             </button>
          </div>

          <div className="mb-8">
            <label className="block text-lg font-medium mb-2 text-slate-300">Selected Players</label>
            <div className="space-y-3">
              {PLAYER_COLORS.map((color: PlayerColor) => {
                const config = playerConfig[color];
                return (
                <div 
                    key={color} 
                    onClick={() => toggleActive(color)}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all duration-300 cursor-pointer border ${config.active ? PLAYER_TAILWIND_COLORS[color].bg.replace(/-[0-9]+/, '-800') + ' border-slate-400 ring-1 ring-white/20' : 'bg-slate-800/50 border-transparent opacity-50 hover:opacity-80'}`}
                >
                  <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded-full border ${config.active ? 'bg-cyan-500 border-white' : 'border-slate-500'}`}>
                          {config.active && <div className="w-full h-full flex items-center justify-center text-xs text-black font-bold">✓</div>}
                      </div>
                      <span className={`font-bold text-lg capitalize ${config.active ? PLAYER_TAILWIND_COLORS[color].text.replace(/-[0-9]+/, '-300') : 'text-slate-400'}`}>
                          {color}
                      </span>
                  </div>
                  
                  {config.active && (
                    <div className="flex items-center space-x-2 animate-in fade-in zoom-in duration-300">
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleAI(color); }} 
                            className="px-3 py-1 bg-slate-900/50 hover:bg-slate-900 rounded-md text-sm min-w-[90px] text-center font-mono text-white shadow-sm z-10"
                        >
                        {config.isAI ? '🤖 Comp' : '🧑 Human'}
                        </button>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
          <button
            onClick={handleStart}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold text-2xl py-4 rounded-lg shadow-xl transition transform hover:scale-105"
          >
            Start Match
          </button>
          <div className="mt-6 text-center">
            <button
              onClick={() => setMode('choice')}
              className="text-slate-400 hover:text-white"
            >
              &larr; Back to Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Menu View ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-800 p-4 relative">
      {/* Conditionally render the Rejoin Game Banner */}
      {showRejoinBanner && activeGameInfo && (
        <RejoinGameBanner
          gameId={activeGameInfo.gameId}
          playerColor={activeGameInfo.playerColor}
          prize={(activeGameInfo.stake || 0) * 2 * 0.9}
          allPawnsHome={activeGameInfo.allPawnsHome}
          winners={activeGameInfo.winners}
          onRejoin={handleRejoin}
          onDismiss={handleDismissBanner}
        />
      )}
      
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10 shadow-sm">
           <div className="flex items-center gap-2">
               <img src="/icons/laddea.png" alt="Ludo Master" className="h-10 w-auto" />
           </div>
           
           {/* User Info Display */}
           {user && (
             <div className="flex items-center gap-4">
               <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700">
                 <div className="flex flex-col items-end">
                   <span className="text-sm font-bold text-white">{user.username}</span>
                   <span className="text-xs text-green-400 font-semibold">${user.balance?.toFixed(2) || '0.00'}</span>
                   {/* Debug: Show role */}
                   <span className="text-xs text-purple-400 font-semibold">Role: {user.role || 'N/A'}</span>
                 </div>
                 {user.avatar && (
                   <img 
                     src={user.avatar} 
                     alt={user.username} 
                     className="w-8 h-8 rounded-full border-2 border-slate-600"
                   />
                 )}
               </div>
             </div>
           )}
           
           <div className="flex items-center gap-2">
             {/* Wallet Button - Available to All Users */}
             {onEnterWallet && (
                 <button 
                     onClick={onEnterWallet}
                     className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 border border-green-500 transition-all duration-300 shadow-lg text-white font-bold mr-2 z-50"
                     title="My Wallet"
                 >
                     <span className="text-xl">💰</span>
                     <span className="text-sm">Wallet</span>
                 </button>
             )}

             {/* Super Admin Button */}
             {(() => {
                 // Debug: Log user role to console
                 if (user) {
                     console.log('🔍 User role check:', {
                         role: user.role,
                         isSuperAdmin: user.role === 'SUPER_ADMIN',
                         hasHandler: !!onEnterSuperAdmin,
                         userObject: user
                     });
                 }
                 
                 // Check for SUPER_ADMIN role (case-sensitive)
                 const isSuperAdmin = user?.role === 'SUPER_ADMIN';
                 
                 if (isSuperAdmin && onEnterSuperAdmin) {
                     return (
                         <button 
                             onClick={onEnterSuperAdmin}
                             className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 border border-purple-500 transition-all duration-300 shadow-lg text-white font-bold mr-2 z-50"
                             title="Super Admin Dashboard"
                         >
                             <span className="text-xl">⚡</span>
                             <span className="text-sm">Super Admin</span>
                         </button>
                     );
                 }
                 return null;
             })()}

             <button 
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 transition-all duration-300 shadow-lg text-red-400 hover:text-red-300"
                title="Sign Out"
             >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                 <span className="text-sm font-bold hidden sm:inline">Sign Out</span>
             </button>
           </div>
      </div>

      <img src="/icons/laddea.png" alt="Ludo Master Logo" className="w-48 h-auto mb-8 mt-20" />
      
      <div className="bg-slate-700 p-8 rounded-xl shadow-2xl w-full max-w-md text-center border border-slate-600">
        <p className="text-slate-300 mb-8 text-lg">Choose how you want to play.</p>
        <div className="space-y-4">
          {/* Always-visible Rejoin Button */}
          <button
            onClick={checkForActiveGame}
            disabled={checkingActiveGame}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold text-xl py-4 px-6 rounded-lg shadow-2xl transition-all transform hover:scale-105 border-2 border-orange-400 disabled:opacity-50"
          >
            {checkingActiveGame ? 'Checking for Game...' : '🔎 Check for Active Game to Rejoin'}
          </button>

          <button
            onClick={onEnterLobby}
            disabled={user?.balance === undefined || user.balance <= 0}
            className={`w-full flex items-center justify-center space-x-3 font-bold text-2xl py-4 rounded-lg shadow-xl transition transform hover:scale-105 border border-cyan-400/30 ${
                user?.balance !== undefined && user.balance > 0 
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white' 
                : 'bg-gray-600 cursor-not-allowed opacity-70 text-gray-300'
            }`}
          >
            <span className="text-3xl">🧑‍🤝‍🧑</span>
            <span>{user?.balance !== undefined && user.balance > 0 ? 'Multiplayer (Online)' : 'Insufficient Balance'}</span>
          </button>
           <button
            onClick={() => setMode('local_setup')}
            className="w-full bg-slate-600 hover:bg-slate-500 text-white font-bold text-xl py-3 rounded-lg shadow-lg transition transform hover:scale-105"
          >
            Local Game (2P)
          </button>
          {showInstallButton && onInstall && (
            <button
              onClick={onInstall}
              className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xl py-4 rounded-lg shadow-xl transition transform hover:scale-105 border-2 border-blue-400/50 mt-4"
            >
              <span className="text-2xl">⬇️</span>
              <span>Install App</span>
            </button>
          )}
          
          {/* Wallet Button - Available to All Users */}
          {onEnterWallet && (
            <button
              onClick={onEnterWallet}
              className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-xl py-4 rounded-lg shadow-xl transition transform hover:scale-105 border-2 border-green-400/50 mt-4"
            >
              <span className="text-2xl">💰</span>
              <span>My Wallet</span>
            </button>
          )}

          {/* Super Admin Button - Prominent in Main Menu */}
          {user?.role === 'SUPER_ADMIN' && onEnterSuperAdmin && (
            <button
              onClick={onEnterSuperAdmin}
              className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold text-xl py-4 rounded-lg shadow-xl transition transform hover:scale-105 border-2 border-purple-400/50 mt-4"
            >
              <span className="text-2xl">⚡</span>
              <span>Super Admin Dashboard</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameSetup;
