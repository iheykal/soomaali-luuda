
import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/GameBoard';
import Dice from './components/Dice';
import GameSetup from './components/GameSetup';
import PlayerInfo from './components/PlayerInfo';
import GameOverModal from './components/GameOverModal';
import { useGameLogic } from './hooks/useGameLogic';
import MultiplayerLobby from './components/MultiplayerLobby';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ResetPassword from './components/auth/ResetPassword';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Player, PlayerColor, MultiplayerGame } from './types';
import { debugService } from './services/debugService';
import DebugConsole from './components/DebugConsole';


import SuperAdminDashboard from './components/superadmin/SuperAdminDashboard';
import Wallet from './components/Wallet';

type View = 'setup' | 'game' | 'multiplayer-lobby' | 'login' | 'register' | 'reset-password' | 'superadmin' | 'wallet';

interface MultiplayerConfig {
  gameId: string;
  localPlayerColor: PlayerColor;
  sessionId: string;
  playerId: string;
}



const AppContent: React.FC = () => {
  const [multiplayerConfig, setMultiplayerConfig] = useState<MultiplayerConfig | null>(null);
  const { state, startGame, handleRollDice, handleMoveToken, handleAnimationComplete, isMyTurn, setState } = useGameLogic(multiplayerConfig || undefined);
  const { gameStarted, players, currentPlayerIndex, turnState, winners, timer } = state;
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const [view, setView] = useState<View>('login');
  const [showSuperAdminOverlay, setShowSuperAdminOverlay] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false); // New state for rejoining status

  // Render Super Admin Overlay
  const renderSuperAdminOverlay = () => {
      if (!showSuperAdminOverlay) return null;
      return (
          <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
              <div className="w-full h-full overflow-auto">
                   <SuperAdminDashboard onExit={() => setShowSuperAdminOverlay(false)} />
              </div>
          </div>
      );
  };

  // Effect to listen for multiplayer game state updates from another tab
  useEffect(() => {
    if (!multiplayerConfig) {
        console.log('No multiplayer config, skipping broadcast channel setup');
        return;
    }

    console.log('Setting up broadcast channel for game:', multiplayerConfig.gameId);
    const channel = new BroadcastChannel(`ludo-game-${multiplayerConfig.gameId}`);

    const handleMessage = (event: MessageEvent) => {
        const { type, payload } = event.data;
        console.log('📡 Broadcast message received:', type, 'from session:', payload?.sessionId, 'local session:', multiplayerConfig.sessionId);
        if (type === 'GAME_STATE_UPDATE' && payload.sessionId !== multiplayerConfig.sessionId) {
            console.log('📡 Updating state from broadcast channel for game:', multiplayerConfig.gameId);
            setState(payload.state);
        } else if (type === 'GAME_STATE_UPDATE' && payload.sessionId === multiplayerConfig.sessionId) {
            console.log('📡 Ignoring broadcast message from own session');
        }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
        console.log('Cleaning up broadcast channel');
        channel.removeEventListener('message', handleMessage);
        channel.close();
    };
  }, [multiplayerConfig]);


  useEffect(() => {
    if (isRejoining && gameStarted) {
      console.log('✅ Game state received after rejoin, setting isRejoining to false');
      setIsRejoining(false);
    }
  }, [isRejoining, gameStarted]);

  const handleStartGame = useCallback((gamePlayers: Player[], mpConfig?: MultiplayerConfig) => {
    console.log('🎮 handleStartGame called with:', { gamePlayers: gamePlayers?.length, mpConfig });

    try {
      if (mpConfig) {
        console.log('🎲 Setting up multiplayer game');
        // Only update config if it's actually different to prevent unnecessary re-renders
        setMultiplayerConfig(prev => {
          if (prev?.gameId === mpConfig.gameId &&
              prev?.localPlayerColor === mpConfig.localPlayerColor &&
              prev?.sessionId === mpConfig.sessionId &&
              prev?.playerId === mpConfig.playerId) {
            return prev; // Same config, don't update
          }
          return mpConfig;
        });
        // For multiplayer, initialize with the provided players
        startGame(gamePlayers);
        // Persist a small rejoin blob so the user can return after refresh/disconnect
        try {
          const savedPlayerId = mpConfig.playerId || user?.id || user?._id || mpConfig.sessionId;
          const rejoinBlob = {
            gameId: mpConfig.gameId,
            playerId: savedPlayerId,
            playerColor: mpConfig.localPlayerColor,
            sessionId: mpConfig.sessionId
          };
          localStorage.setItem('ludo_rejoin', JSON.stringify(rejoinBlob));
          console.log('✅ Saved rejoin info to localStorage', rejoinBlob);
        } catch (e) {
          console.warn('⚠️ Failed to persist rejoin info', e);
        }
      } else {
        console.log('🎲 Setting up local game');
        // For local games
        startGame(gamePlayers);
      }
      setView('game');
      console.log('✅ Game view set successfully');
    } catch (error) {
      console.error('❌ Error in handleStartGame:', error);
      (window as any).gameStarting = false;
    }
  }, [startGame]);

  const handleRestart = () => {
    window.location.reload();
  };
  
  const handleEnterLobby = () => setView('multiplayer-lobby');
  const handleEnterSuperAdmin = async () => {
    // Refresh user data before showing SuperAdmin dashboard
    if (refreshUser) {
      await refreshUser();
    }
    setShowSuperAdminOverlay(true);
  };
  const handleEnterWallet = async () => {
    // Refresh user data before showing wallet
    if (refreshUser) {
      await refreshUser();
    }
    setView('wallet');
  };
  const handleExitWallet = () => {
    setView('setup');
    // Refresh user data after wallet operations
    if (refreshUser) {
      refreshUser();
    }
  };
  
  const handleLoginSuccess = () => {
    // Check if user is Super Admin and redirect to dashboard
    const userStr = localStorage.getItem('ludo_user');
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        if (userData.role === 'SUPER_ADMIN') {
          setView('superadmin');
          return;
        }
      } catch (e) {
        console.error('Error parsing user data for redirect', e);
      }
    }
    setView('setup');
  };

  const handleRegisterSuccess = () => setView('setup');
  const handleSwitchToRegister = () => setView('register');
  const handleSwitchToLogin = () => setView('login');
  const handleSwitchToResetPassword = () => setView('reset-password');
  const handleResetPasswordSuccess = () => setView('login');

  const handleRejoinGame = useCallback((gameId: string, playerColor: PlayerColor) => {
    console.log(`🎮 handleRejoinGame called!`);
    console.log(`🔄 Rejoining game ${gameId} as ${playerColor}`);
    console.log(`👤 User:`, user);
    
    if (!user) {
      console.error('❌ Cannot rejoin: user not authenticated');
      alert('Please login to rejoin the game');
      return;
    }

    setIsRejoining(true); // Set rejoining state
    // Generate a session ID for this rejoin
    const sessionId = Math.random().toString(36).substring(2, 10);
    const playerId = user.id || user._id || user.username;
    
    console.log(`📋 Player ID for rejoin: ${playerId}`);
    
    // Create multiplayer config for rejoining
    const mpConfig: MultiplayerConfig = {
      gameId,
      localPlayerColor: playerColor,
      sessionId,
      playerId: playerId,
    };

    console.log(`✅ Rejoin config created:`, mpConfig);

    // Set the multiplayer config and switch to game view
    setMultiplayerConfig(mpConfig);
    // Persist rejoin info for dashboard fallback (in case of refresh/disconnect)
    try {
      localStorage.setItem('ludo_rejoin', JSON.stringify({
        gameId: mpConfig.gameId,
        playerId: mpConfig.playerId,
        playerColor: mpConfig.localPlayerColor,
        sessionId: mpConfig.sessionId
      }));
      console.log('✅ Persisted rejoin blob for rejoin flow');
    } catch (e) {
      console.warn('⚠️ Failed to persist rejoin blob during rejoin', e);
    }
    
    // The actual state will be updated when we receive GAME_STATE_UPDATE from server
    // startGame(placeholderPlayers) is removed as it's no longer needed;
    // the UI will display a loading state until the real game state arrives.
    
    console.log(`🖼️ Switching to game view...`);
    setView('game');
    
    console.log('✅ Rejoin complete, game view set, view is now:', 'game');
  }, [user, setIsRejoining]);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show login/register/reset password if not authenticated
  if (!isAuthenticated) {
    if (view === 'login') {
      return <Login onSuccess={handleLoginSuccess} onSwitchToRegister={handleSwitchToRegister} onSwitchToResetPassword={handleSwitchToResetPassword} />;
    }
    if (view === 'register') {
      return <Register onSuccess={handleRegisterSuccess} onSwitchToLogin={handleSwitchToLogin} />;
    }
    if (view === 'reset-password') {
      return <ResetPassword onSuccess={handleResetPasswordSuccess} onCancel={handleSwitchToLogin} />;
    }
    // Default to login if not authenticated
    return <Login onSuccess={handleLoginSuccess} onSwitchToRegister={handleSwitchToRegister} />;
  }

  // Authenticated views
  if (view === 'setup') {
    return (
      <>
        {renderSuperAdminOverlay()}
        <GameSetup 
            onStartGame={handleStartGame} 
            onEnterLobby={handleEnterLobby} 
            onRejoinGame={handleRejoinGame}
            onEnterSuperAdmin={handleEnterSuperAdmin}
            onEnterWallet={handleEnterWallet}
        />
      </>
    );
  }

  if (view === 'wallet') {
    if (!user) {
      setView('setup');
      return null;
    }
    return (
      <Wallet 
        user={user} 
        onClose={handleExitWallet}
        onUpdateUser={() => {
          // Refresh user data after wallet operations
          if (refreshUser) {
            refreshUser();
          }
        }}
      />
    );
  }

  if (view === 'multiplayer-lobby') {
    return (
        <>
            {renderSuperAdminOverlay()}
            <MultiplayerLobby onStartGame={handleStartGame} onExit={() => setView('setup')} />
        </>
    );
  }

  // --- Game View ---
  // Show game view if view is 'game' and we have players (don't strictly require gameStarted for multiplayer)
  if (view === 'game') {
    if (isRejoining) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-white text-xl animate-pulse">Rejoining Game...</div>
        </div>
      );
    }
    
    // Only render the game board if the game has started
    if (!gameStarted && (!multiplayerConfig || players.length < 2)) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">Waiting for game to start...</div>
            </div>
        );
    }

    const currentPlayer = players[currentPlayerIndex];
    
    // Helper to find specific players
    const getPlayer = (color: PlayerColor) => players.find(p => p.color === color);
    const pGreen = getPlayer('green');
    const pYellow = getPlayer('yellow');
    const pRed = getPlayer('red');
    const pBlue = getPlayer('blue');

    // Determine perspective for board rotation
    // For local games, we keep the board fixed (perspective 'red') so that the corners match the UI placement.
    // For multiplayer, we rotate so the local player is at the bottom.
    const perspectiveColor = multiplayerConfig 
        ? multiplayerConfig.localPlayerColor 
        : 'red'; 

    return (
      <div className="min-h-screen bg-slate-900 p-2 sm:p-4 flex flex-col lg:grid lg:h-screen lg:grid-cols-[300px_1fr_300px] lg:grid-rows-[1fr_auto_1fr] gap-4 items-center justify-center overflow-hidden relative">
        {renderSuperAdminOverlay()}
        
        {/* Super Admin Button in Game View */}
        {(() => {
            // Debug: Log user role
            if (user) {
                console.log('🎮 Game View - User role check:', {
                    role: user.role,
                    isSuperAdmin: user.role === 'SUPER_ADMIN',
                    userObject: user
                });
            }
            
            const isSuperAdmin = user?.role === 'SUPER_ADMIN';
            
            if (isSuperAdmin) {
                return (
                    <div className="absolute top-4 left-4 z-50">
                        <button 
                            onClick={handleEnterSuperAdmin}
                            className="w-12 h-12 flex items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-700 border-2 border-purple-400 text-white text-xl font-bold transition-all shadow-xl backdrop-blur-sm"
                            title="Super Admin Dashboard"
                        >
                            ⚡
                        </button>
                    </div>
                );
            }
            return null;
        })()}

        {turnState === 'GAMEOVER' && <GameOverModal winners={winners} onRestart={handleRestart} message={state.message}/>}
        
        {/* Top Left: Green - Hidden */}
        {/* <div className="w-full lg:w-auto order-2 lg:order-none lg:row-start-1 lg:col-start-1 flex justify-center lg:justify-start lg:items-start p-2">
            {pGreen && (
                <PlayerInfo
                    player={pGreen}
                    tokens={state.tokens}
                    isCurrentPlayer={currentPlayer.color === pGreen.color}
                    winners={winners}
                    message={currentPlayer.color === pGreen.color ? state.message : undefined}
                />
            )}
        </div> */}

        {/* Top Right: Yellow */}
        <div className="lg:w-auto order-2 lg:order-none lg:row-start-1 lg:col-start-3 flex justify-center lg:justify-end lg:items-start p-2">

        </div>

        {/* Center: Board */}
        <div className="w-full max-w-[600px] aspect-square lg:h-auto order-1 lg:order-none lg:row-start-1 lg:row-end-4 lg:col-start-2 flex items-center justify-center">
          <Board 
            gameState={state} 
            onMoveToken={handleMoveToken} 
            onAnimationComplete={handleAnimationComplete}
            isMyTurn={isMyTurn}
            perspectiveColor={perspectiveColor}
          />
        </div>

        {/* Dice & Controls: Right Middle */}
        <div className="order-3 lg:order-none lg:row-start-2 lg:col-start-3 flex justify-center items-center pointer-events-auto z-10 relative">
             <Dice 
                value={state.diceValue} 
                onRoll={handleRollDice} 
                // Allow rolling if it's my turn, regardless of exact state (hook handles validation)
                // This prevents UI locking if state is slightly desynced (e.g. diceValue null but state not ROLLING)
                isMyTurn={isMyTurn}
                playerColor={currentPlayer?.color || 'green'}
                timer={timer}
                potAmount={state.stake ? state.stake * 2 * 0.9 : 0}
            />
        </div>

        {/* Bottom Left: Red */}
        <div className="lg:w-auto order-4 lg:order-none lg:row-start-3 lg:col-start-1 flex justify-center lg:justify-start lg:items-end p-2">

        </div>

        {/* Bottom Right: Blue - Hidden */}
        {/* <div className="w-full lg:w-auto order-5 lg:order-none lg:row-start-3 lg:col-start-3 flex justify-center lg:justify-end lg:items-end p-2">
             {pBlue && (
                <PlayerInfo
                    player={pBlue}
                    tokens={state.tokens}
                    isCurrentPlayer={currentPlayer.color === pBlue.color}
                    winners={winners}
                    message={currentPlayer.color === pBlue.color ? state.message : undefined}
                />
            )}
        </div> */}

      </div>
    );
  }

  if (view === 'superadmin') {
    return <SuperAdminDashboard onExit={() => setView('setup')} />;
  }

  // Fallback
  return (
    <GameSetup 
        onStartGame={handleStartGame} 
        onEnterLobby={handleEnterLobby} 
        onRejoinGame={handleRejoinGame}
        onEnterSuperAdmin={handleEnterSuperAdmin}
    />
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
      <DebugConsole />
    </AuthProvider>
  );
};

export default App;
