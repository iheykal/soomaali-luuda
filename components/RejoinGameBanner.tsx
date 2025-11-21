import React from 'react';

interface RejoinGameBannerProps {
  gameId: string;
  playerColor: string;
  stake: number;
  allPawnsHome?: boolean;
  winners?: string[];
  onRejoin: () => void;
  onDismiss: () => void;
}

const RejoinGameBanner: React.FC<RejoinGameBannerProps> = ({
  gameId,
  playerColor,
  stake,
  allPawnsHome = false,
  winners = [],
  onRejoin,
  onDismiss,
}) => {
  const isWinner = winners.includes(playerColor);
  const gameStatus = isWinner 
    ? '🏆 You Won!' 
    : allPawnsHome 
    ? '🎯 All Pawns Home!' 
    : '⚠️ Game In Progress';

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] animate-bounce" style={{ pointerEvents: 'auto' }}>
      <div className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 rounded-lg shadow-2xl p-4 max-w-md w-full border-4 border-yellow-300" style={{ pointerEvents: 'auto' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🎮</span>
            <h3 className="text-white font-bold text-lg">Active Game Found!</h3>
          </div>
          <button
            onClick={onDismiss}
            className="text-white hover:text-gray-200 text-xl font-bold"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
        
        <div className="bg-white bg-opacity-20 rounded-lg p-3 mb-3 backdrop-blur-sm">
          <div className="text-white space-y-1 text-sm">
            <p><strong>Status:</strong> {gameStatus}</p>
            <p><strong>Game ID:</strong> {gameId.toUpperCase()}</p>
            <p><strong>Your Color:</strong> <span className="capitalize font-bold" style={{ color: playerColor }}>{playerColor}</span></p>
            <p><strong>Stake:</strong> 💰 {stake} coins</p>
            {allPawnsHome && !isWinner && (
              <p className="text-yellow-200 font-semibold">⚠️ All your pawns are home! Rejoin to claim victory!</p>
            )}
            {isWinner && (
              <p className="text-green-200 font-semibold">🎉 You've won this game! Rejoin to see final results!</p>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => {
              console.log('🔘 Rejoin button clicked!');
              onRejoin();
            }}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            🔄 Rejoin Game
          </button>
          <button
            onClick={onDismiss}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all"
          >
            Later
          </button>
        </div>
        
        <p className="text-xs text-white text-center mt-2 opacity-80">
          Your game is waiting for you!
        </p>
      </div>
    </div>
  );
};

export default RejoinGameBanner;

