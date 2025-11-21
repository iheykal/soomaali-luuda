
import React from 'react';
import type { Player, Token } from '../types';
// Fix: Import from the centralized boardLayout file.
import { PLAYER_TAILWIND_COLORS } from '../lib/boardLayout';

interface PlayerInfoProps {
  player: Player;
  tokens: Token[];
  isCurrentPlayer: boolean;
  winners: string[];
  message?: string;
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({ player, tokens, isCurrentPlayer, winners, message }) => {
  const colors = PLAYER_TAILWIND_COLORS[player.color];
  const playerTokens = tokens.filter(t => t.color === player.color);
  const homeCount = playerTokens.filter(t => t.position.type === 'HOME').length;
  const rank = winners.indexOf(player.color);

  return (
    <div className={`p-4 rounded-lg border-4 ${isCurrentPlayer ? colors.border : 'border-slate-600'} ${colors.darkBg} transition-all shadow-lg relative`}>
      
      {player.isDisconnected && (
          <div className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center shadow-sm z-10 animate-pulse">
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
              </svg>
              OFFLINE
          </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <h3 className={`text-2xl font-bold capitalize ${colors.text.replace(/-[0-9]+/, '-300')}`}>
                {player.color} {player.isAI && '🤖'}
            </h3>
            {player.isDisconnected && <span className="text-xs text-slate-400 font-mono">(Bot Active)</span>}
        </div>
        
        {rank !== -1 && (
            <span className="text-xl font-bold bg-yellow-400 text-slate-900 px-3 py-1 rounded-full">
                {rank === 0 ? '🏆' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
            </span>
        )}
      </div>
      <div className="mt-2 flex space-x-2">
        {Array.from({ length: playerTokens.length }).map((_, i) => (
          <div key={i} className={`w-6 h-6 rounded-full ${i < homeCount ? colors.bg : 'bg-slate-600'} border-2 ${colors.border.replace(/-[0-9]+/, '-700')}`}></div>
        ))}
      </div>
      {isCurrentPlayer && message && (
        <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-lg text-center text-slate-200 min-h-[56px] flex items-center justify-center">{message}</p>
        </div>
      )}
    </div>
  );
};

export default PlayerInfo;
