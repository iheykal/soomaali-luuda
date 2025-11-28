

import React from 'react';
import type { PlayerColor, Player } from '../types';
// Fix: Import from the centralized boardLayout file.
import { PLAYER_TAILWIND_COLORS } from '../lib/boardLayout';

interface GameOverModalProps {
  winners: PlayerColor[];
  players?: Player[];
  onRestart: () => void;
  message?: string;
  prize?: number;
}

const GameOverModal: React.FC<GameOverModalProps> = ({ winners, players, onRestart, message, prize }) => {
  // Get the winner's player info if available
  const winnerPlayer = players?.find(p => p.color === winners[0]);

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
        <button
          onClick={onRestart}
          className="mt-4 px-10 py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-2xl rounded-lg shadow-xl transition transform hover:scale-105"
        >
          Play Again
        </button>
      </div>
    </div>
  );
};

export default GameOverModal;