
import React, { useState, useEffect, useCallback } from 'react';
import Board from './components/GameBoard';
import Dice from './components/Dice';
import GameSetup from './components/GameSetup';
import PlayerInfo from './components/PlayerInfo';
import GameOverModal from './components/GameOverModal';
import QuickChat from './components/QuickChat';
import WinNotification from './components/WinNotification';
import { useGameLogic } from './hooks/useGameLogic';
import { useGlobalSocket } from './hooks/useGlobalSocket';
import MultiplayerLobby from './components/MultiplayerLobby';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ResetPassword from './components/auth/ResetPassword';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Player, PlayerColor, MultiplayerGame } from './types';
import { debugService } from './services/debugService';
import DebugConsole from './components/DebugConsole';
import { audioService } from './services/audioService';
import { notificationService, WinNotificationData } from './services/notificationService';


import SuperAdminDashboard from './components/superadmin/SuperAdminDashboard';
import Wallet from './components/Wallet';

type View = 'setup' | 'game' | 'multiplayer-lobby' | 'login' | 'register' | 'reset-password' | 'superadmin' | 'wallet';

interface MultiplayerConfig {
  gameId: string;
  localPlayerColor: PlayerColor;
  sessionId: string;
  playerId: string;
  stake?: number;
}



const AppContent: React.FC = () => {
  const [multiplayerConfig, setMultiplayerConfig] = useState<MultiplayerConfig | null>(null);
  const { state, startGame, handleRollDice, handleMoveToken, handleAnimationComplete, isMyTurn, setState, socket } = useGameLogic(multiplayerConfig || undefined);
  const { gameStarted, players, currentPlayerIndex, turnState, winners, timer } = state;
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const [view, setView] = useState<View>('login');
  const [showSuperAdminOverlay, setShowSuperAdminOverlay] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false); // New state for rejoining status
  const [showWallet, setShowWallet] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any | null>(null);
  const [winNotification, setWinNotification] = useState<WinNotificationData | null>(null);

  // Connect to global socket for financial notifications
  useGlobalSocket(user?.id || user?._id, isAuthenticated);

  // Unlock audio on first user interaction to avoid browser autoplay blocks
  useEffect(() => {
    const handler = () => {
      audioService.unlock();
      // Optionally play a tiny confirmation click (muted unlock won't be audible)
      try {
        audioService.play('click');
      } catch (e) {
        // ignore
      }
      window.removeEventListener('pointerdown', handler);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

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

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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

  // Effect to listen for win notifications from socket
  useEffect(() => {
    if (!socket) return;

    const handleWinNotification = (data: WinNotificationData) => {
      console.log('🎉 Win notification received:', data);
      // Only show notification if this user is the winner
      if (user && (data.winnerId === user.id || data.winnerId === user._id)) {
        notificationService.showWinNotification(data);
        setWinNotification(data);
      }
    };

    socket.on('win_notification', handleWinNotification);

    return () => {
      socket.off('win_notification', handleWinNotification);
    };
  }, [socket, user]);


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
            sessionId: mpConfig.sessionId,
            stake: mpConfig.stake || 0,
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
  const handleToggleWallet = async () => {
    if (!showWallet) {
      if (refreshUser) {
        await refreshUser();
      }
    }
    setShowWallet(prev => !prev);
  }

  const handleEnterWallet = async () => {
    // Refresh user data before showing wallet
    if (refreshUser) {
      await refreshUser();
    }
    setShowWallet(true);
  };

  const handleExitWallet = () => {
    setShowWallet(false);
    // Refresh user data after wallet operations
    if (refreshUser) {
      refreshUser();
    }
  };

  // Auto-navigate to setup view if user is already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading && view === 'login') {
      console.log('👤 User already authenticated, setting view to setup');
      setView('setup');
    }
  }, [isAuthenticated, authLoading, view, user]);

  const handleLoginSuccess = () => {
    // Check if user is Super Admin and redirect to dashboard
    let userStr = localStorage.getItem('ludo_user');
    // Defensive: handle legacy/broken storage where the string "undefined" was stored
    if (userStr === 'undefined') {
      console.warn('⚠️ Found invalid ludo_user value in localStorage, clearing');
      localStorage.removeItem('ludo_user');
      localStorage.removeItem('ludo_token');
      userStr = null;
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

  const handleInstallClick = () => {
    if (!installPrompt) {
      return;
    }
    // Show the install prompt
    installPrompt.prompt();
    // Wait for the user to respond to the prompt
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      // We can't use the prompt again, so clear it
      setInstallPrompt(null);
    });
  };

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

  // Authenticated: Show main game interface
  return (
    <>
      {renderSuperAdminOverlay()}
      {showWallet && <Wallet onClose={handleExitWallet} />}
      {winNotification && (
        <WinNotification
          playerName={winNotification.winnerUsername}
          grossWin={winNotification.grossWin}
          netAmount={winNotification.netAmount}
          platformFee={winNotification.commission}
          onClose={() => setWinNotification(null)}
          onNavigateToWallet={handleEnterWallet}
        />
      )}

      {view === 'setup' && (
        <GameSetup
          onStartGame={handleStartGame}
          onEnterLobby={handleEnterLobby}
          onRejoinGame={handleRejoinGame}
          onEnterSuperAdmin={handleEnterSuperAdmin}
          onEnterWallet={handleEnterWallet}
          onInstall={handleInstallClick}
          showInstallButton={!!installPrompt}
        />
      )}

      {view === 'multiplayer-lobby' && (
        <MultiplayerLobby
          onStartGame={handleStartGame}
          onBack={() => setView('setup')}
        />
      )}

      {view === 'game' && (
        <div className="min-h-screen bg-slate-800 flex flex-col">
          {isRejoining && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl">
                <p className="text-xl font-bold">Rejoining game...</p>
              </div>
            </div>
          )}
          {/* PlayerInfo cards removed as per user request */}
          {/* <div className="flex-shrink-0 p-4 flex justify-between items-start">
            <div className="flex gap-2 flex-wrap">
              {players.map((p, i) => (
                <PlayerInfo
                  key={p.color}
                  player={p}
                  tokens={state.tokens}
                  isCurrentPlayer={i === currentPlayerIndex}
                  winners={winners}
                  message={state.message}
                />
              ))}
            </div>
            <button
              onClick={handleRestart}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition h-10"
            >
              Exit Game
            </button>
          </div> */}

          {/* Prize Display - Always visible during gameplay */}
          {multiplayerConfig && state.stake && state.stake > 0 && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-4 py-2 rounded-full shadow-xl border border-yellow-300">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <div className="text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">Prize</div>
                    <div className="text-lg font-bold">${((state.stake || 0) * 0.8).toFixed(2)}</div>
                  </div>
                  <span className="text-lg">💰</span>
                </div>
              </div>
            </div>
          )}


          <div className="absolute top-4 right-4">
            <button
              onClick={handleRestart}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition shadow-lg"
            >
              Exit Game
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-2">
            <div className="max-w-[700px] w-full aspect-square">
              <Board
                gameState={state}
                onMoveToken={handleMoveToken}
                onAnimationComplete={handleAnimationComplete}
                isMyTurn={isMyTurn}
                perspectiveColor={multiplayerConfig?.localPlayerColor}
              />
            </div>
          </div>

          <div className="flex-shrink-0 p-2 flex justify-center">
            <Dice
              value={state.diceValue}
              onRoll={handleRollDice}
              isMyTurn={isMyTurn}
              playerColor={players[currentPlayerIndex]?.color || 'red'}
              timer={timer}
              turnState={turnState}
              potAmount={state.stake}
            />
          </div>

          {/* Quick Chat - Only for multiplayer games */}
          {multiplayerConfig && socket && (
            <QuickChat
              gameId={multiplayerConfig.gameId}
              socket={socket}
              userId={multiplayerConfig.playerId}
              playerColor={multiplayerConfig.localPlayerColor}
            />
          )}

          {winners.length > 0 && (
            <GameOverModal
              winners={winners}
              players={players}
              onRestart={handleRestart}
              prize={(state.stake || 0) * 0.8}
            />
          )}
        </div>
      )}

      {view === 'superadmin' && (
        <SuperAdminDashboard onExit={() => setView('setup')} />
      )}
    </>
  );
};

// Main App component with AuthProvider wrapper
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
      <DebugConsole />
    </AuthProvider>
  );
};

export default App;
