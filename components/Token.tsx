
import React from 'react';
import type { PlayerColor } from '../types';
// Fix: Import from the centralized boardLayout file.
import { PLAYER_TAILWIND_COLORS } from '../lib/boardLayout';

interface TokenProps {
  color: PlayerColor;
  isMovable: boolean;
  onClick: () => void;
}

const Token: React.FC<TokenProps> = ({ color, isMovable, onClick }) => {
  const colors = PLAYER_TAILWIND_COLORS[color];
  const glowClass = isMovable ? colors.glow : '';
  const cursorClass = isMovable ? 'cursor-pointer' : 'cursor-default';

  return (
    <button
      onClick={onClick}
      disabled={!isMovable}
      className={`w-full h-full rounded-full flex items-center justify-center transition transform hover:scale-110 ${colors.bg} ${glowClass} ${cursorClass}`}
    >
      <div className={`w-2/3 h-2/3 rounded-full ${colors.bg.replace('500', '400')} border-2 ${colors.border.replace('500', '300')}`}></div>
    </button>
  );
};

export default Token;