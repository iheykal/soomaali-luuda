

import React, { useState, useEffect } from 'react';
import type { PlayerColor, Player } from '../types';
// Fix: Import from the centralized boardLayout file.
import { PLAYER_TAILWIND_COLORS } from '../lib/boardLayout';
import type { Socket } from 'socket.io-client';

interface GameOverModalProps {
  winners: PlayerColor[];
  players?: Player[];
  onRestart: () => void;
  onCancel?: () => void;
  onRematchAccepted?: (newGameId: string) => void;
  message?: string;
  prize?: number;
  socket?: Socket | null;
  gameId?: string | null;
  stakeAmount?: number;
  localPlayerColor?: PlayerColor;
}

const REMATCH_TIMEOUT = 30; // seconds

const GameOverModal: React.FC<GameOverModalProps> = ({
  winners,
  players,
  onRestart,
  onCancel,
  message,
  prize,
  socket,
  gameId,
  stakeAmount,
  localPlayerColor,
  onRematchAccepted
}) => {
  // Get the winner's player info if available
  const winnerPlayer = players?.find(p => p.color === winners[0]);

  // Rematch state
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentRequestedRematch, setOpponentRequestedRematch] = useState(false);
  const [countdown, setCountdown] = useState(REMATCH_TIMEOUT);
  const [searchingOpponent, setSearchingOpponent] = useState(false);

  // Handle rematch socket events
  useEffect(() => {
    if (!socket || !gameId) return;

    const handleRematchRequested = (data: { requesterId: string; requesterColor: PlayerColor }) => {
      console.log('Opponent requested rematch:', data);
      if (data.requesterColor !== localPlayerColor) {
        setOpponentRequestedRematch(true);
      }
    };

    const handleRematchAccepted = (data: { newGameId: string; stakeAmount: number }) => {
      console.log('Rematch accepted, new game:', data);
      if (onRematchAccepted) {
        onRematchAccepted(data.newGameId);
      } else {
        // Fallback: The server will automatically start the new game, just reload
        window.location.reload();
      }
    };

    const handleRematchDeclined = () => {
      console.log('Rematch declined or timed out');
      if (rematchRequested) {
        // Player requested rematch but opponent declined - search for new opponent
        setSearchingOpponent(true);
        setRematchRequested(false);
      }
    };

    const handleRematchSearching = (data: { message: string }) => {
      console.log('Searching for new opponent:', data);
      setSearchingOpponent(true);
    };

    socket.on('rematch_requested', handleRematchRequested);
    socket.on('rematch_accepted', handleRematchAccepted);
    socket.on('rematch_declined', handleRematchDeclined);
    socket.on('rematch_searching', handleRematchSearching);

    return () => {
      socket.off('rematch_requested', handleRematchRequested);
      socket.off('rematch_accepted', handleRematchAccepted);
      socket.off('rematch_declined', handleRematchDeclined);
      socket.off('rematch_searching', handleRematchSearching);
    };
  }, [socket, gameId, localPlayerColor, rematchRequested]);

  // Countdown timer
  useEffect(() => {
    if (!rematchRequested && !opponentRequestedRematch) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timeout - decline rematch and search for new opponent
          if (socket && gameId) {
            socket.emit('rematch_timeout', { gameId });
          }
          if (rematchRequested) {
            setSearchingOpponent(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rematchRequested, opponentRequestedRematch, socket, gameId]);

  const handleRematch = () => {
    if (!socket || !gameId) {
      // Fallback to simple restart if no socket
      onRestart();
      return;
    }

    setRematchRequested(true);
    setCountdown(REMATCH_TIMEOUT);
    socket.emit('request_rematch', {
      gameId,
      stakeAmount: stakeAmount || 0
    });
  };

  const handleAcceptRematch = () => {
    if (socket && gameId) {
      socket.emit('accept_rematch', { gameId });
    }
  };

  const handleDecline = () => {
    if (socket && gameId) {
      socket.emit('decline_rematch', { gameId });
    }
    if (onCancel) {
      onCancel();
    } else {
      onRestart();
    }
  };

  // Show searching state
  if (searchingOpponent) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center w-full max-w-md border-4 border-yellow-500">
          <div className="text-6xl mb-4 animate-bounce">🔍</div>
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Raadinta Ciyaaryahan...</h2>
          <p className="text-white mb-4">Searching for opponent with ${stakeAmount?.toFixed(2) || '0.00'} stake</p>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-yellow-500 animate-pulse" style={{ width: '100%' }}></div>
          </div>
          <button
            onClick={handleDecline}
            className="mt-6 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition"
          >
            ✕ Jooji (Cancel)
          </button>
        </div>
      </div>
    );
  }

  // Show waiting for opponent state
  if (rematchRequested && !opponentRequestedRematch) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center w-full max-w-md border-4 border-cyan-500">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <h2 className="text-2xl font-bold mb-4 text-cyan-400">Sugitaanka Jawaab...</h2>
          <p className="text-white mb-4">Waiting for opponent to accept rematch</p>

          {/* Countdown Circle */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-slate-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - countdown / REMATCH_TIMEOUT)}
                className="text-cyan-500 transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">
              {countdown}
            </span>
          </div>

          <button
            onClick={handleDecline}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition"
          >
            ✕ Jooji (Cancel)
          </button>
        </div>
      </div>
    );
  }

  // Show opponent requested rematch
  if (opponentRequestedRematch) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center w-full max-w-md border-4 border-green-500">
          <div className="text-6xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold mb-4 text-green-400">Rematch Request!</h2>
          <p className="text-white mb-4">Opponent wants a rematch with ${stakeAmount?.toFixed(2) || '0.00'}</p>

          {/* Countdown Circle */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-slate-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - countdown / REMATCH_TIMEOUT)}
                className="text-green-500 transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">
              {countdown}
            </span>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleAcceptRematch}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition flex items-center gap-2"
            >
              ✓ Haa (Accept)
            </button>
            <button
              onClick={handleDecline}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition flex items-center gap-2"
            >
              ✕ Maya (Decline)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default game over modal with rematch options
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center w-full max-w-md border-4 border-cyan-500">
        <h2 className="text-4xl font-bold mb-4 text-cyan-400">Game Over!</h2>
        {message && <p className="text-xl text-white mb-4">{message}</p>}

        {/* Prize Amount Display */}
        {prize && prize > 0 && (
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-3 rounded-lg mb-4 shadow-lg text-left">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1">Winner Prize</div>
            <div className="text-2xl font-bold">${prize.toFixed(2)}</div>
            {winnerPlayer && (
              <div className="text-xs mt-1 opacity-90">
                Congratulations {winnerPlayer.username || winnerPlayer.color}! 🎉
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 my-6">
          {winners.map((color, index) => (
            <div key={color} className={`flex items-center justify-between p-4 rounded-lg text-2xl font-bold ${PLAYER_TAILWIND_COLORS[color].bg.replace('500', '700')}`}>
              <span>
                {index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
              </span>
              <span className={`capitalize ${PLAYER_TAILWIND_COLORS[color].text.replace('500', '300')}`}>{color}</span>
            </div>
          ))}
        </div>

        {/* Rematch buttons - only show for multiplayer games with socket */}
        {socket && gameId ? (
          <div className="flex gap-4 justify-center mt-6">
            <button
              onClick={handleDecline}
              className="px-6 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-xl rounded-lg shadow-xl transition transform hover:scale-105 flex items-center gap-2"
            >
              <span className="text-2xl">✕</span>
            </button>
            <button
              onClick={handleRematch}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-xl rounded-lg shadow-xl transition transform hover:scale-105 flex items-center gap-2"
            >
              🔄 Laciyaar markale
            </button>
          </div>
        ) : (
          <button
            onClick={onRestart}
            className="mt-4 px-10 py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-2xl rounded-lg shadow-xl transition transform hover:scale-105"
          >
            Play Again
          </button>
        )}
      </div>
    </div>
  );
};

export default GameOverModal;