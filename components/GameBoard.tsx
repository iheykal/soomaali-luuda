
import React, { useState, useEffect, useRef } from 'react';
import type { GameState, PlayerColor, Token, LegalMove } from '../types';
import {
  PLAYER_TAILWIND_COLORS,
  PLAYER_COLORS,
  mainPathCoords,
  homePathCoords,
  yardCoords,
  SAFE_SQUARES,
  START_POSITIONS,
  getTokenPositionCoords,
  getAnimationPath,
  calculatePathBetween,
} from '../lib/boardLayout';

interface BoardProps {
  gameState: GameState;
  onMoveToken: (tokenId: string) => void;
  onAnimationComplete: () => void;
  isMyTurn: boolean;
  perspectiveColor?: PlayerColor;
}

// Helper hook to get the previous value of a prop or state
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}


const Board: React.FC<BoardProps> = React.memo(({ gameState, onMoveToken, onAnimationComplete, isMyTurn, perspectiveColor = 'red' }) => {
  const { tokens, legalMoves, diceValue, turnState } = gameState;

  console.log(`🎯 Board render: legalMoves=${legalMoves?.length || 0}, diceValue=${diceValue}, turnState=${turnState}, isMyTurn=${isMyTurn}`);
  if (legalMoves && legalMoves.length > 0) {
    console.log(`🎯 Available moves: ${legalMoves.map(m => `${m.tokenId} -> ${m.finalPosition.type}:${m.finalPosition.index}`).join(', ')}`);
  }
  const size = 800; // SVG canvas size
  const cellSize = size / 15;
  const [animation, setAnimation] = useState<{ tokenId: string, tokenColor: PlayerColor, path: {x: number, y: number}[], step: number } | null>(null);
  const prevTokens = usePrevious(tokens);

  useEffect(() => {
    // REMOVED: turnState !== 'ANIMATING' check to allow animation even if server quickly transitions to ROLLING
    if (!prevTokens) return;

    const movedToken = tokens.find(token => {
      const prev = prevTokens.find(p => p.id === token.id);
      return prev && JSON.stringify(prev.position) !== JSON.stringify(token.position);
    });

    if (movedToken) {
      const prevToken = prevTokens.find(pt => pt.id === movedToken.id);
      if (prevToken) {
        // Use calculatePathBetween instead of getAnimationPath to avoid relying on diceValue
        const path = calculatePathBetween(prevToken.position, movedToken.position, movedToken.color);
        if (path.length > 0) {
          setAnimation({
            tokenId: movedToken.id,
            tokenColor: movedToken.color,
            path,
            step: 0,
          });
        } else {
            onAnimationComplete();
        }
      }
    }
  }, [tokens, prevTokens, onAnimationComplete]);

  useEffect(() => {
    if (!animation) return;

    if (animation.step >= animation.path.length - 1) {
      const endTimer = setTimeout(() => {
        setAnimation(null);
        onAnimationComplete();
      }, 150);
      return () => clearTimeout(endTimer);
    }
    
    const stepTimer = setTimeout(() => {
      setAnimation(prev => prev ? ({ ...prev, step: prev.step + 1 }) : null);
    }, 300);

    return () => clearTimeout(stepTimer);
  }, [animation, onAnimationComplete]);


  const toPx = (norm: number) => norm * size;

  // Rotation Logic:
  // Red (Bottom-Left) is Default (0 deg).
  // Yellow (Top-Right) -> Rotate 180 deg to appear at Bottom-Left.
  // Green (Top-Left) -> Rotate 270 deg (Counter-Clockwise) to appear at Bottom-Left.
  // Blue (Bottom-Right) -> Rotate 90 deg (Clockwise) to appear at Bottom-Left.
  const getRotation = () => {
      switch (perspectiveColor) {
          case 'yellow': return 180;
          case 'blue': return 90;
          case 'green': return 270;
          default: return 0;
      }
  };
  const rotation = getRotation();

  const renderGridAndPaths = () => {
    // Full 4-player board stars
    const STAR_COLORS: Record<number, PlayerColor> = { 8: 'green', 21: 'yellow', 34: 'blue', 47: 'red' };

    return (
      <>
        {/* Bases */}
        <rect x={0} y={0} width={cellSize * 6} height={cellSize * 6} className="fill-green" />
        <rect x={cellSize * 9} y={0} width={cellSize * 6} height={cellSize * 6} className="fill-yellow" />
        <rect x={0} y={cellSize * 9} width={cellSize * 6} height={cellSize * 6} className="fill-red" />
        <rect x={cellSize * 9} y={cellSize * 9} width={cellSize * 6} height={cellSize * 6} className="fill-blue" />
        
        {/* Inner Base Squares */}
        <rect x={cellSize * 0.5} y={cellSize * 0.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8"/>
        <rect x={cellSize * 9.5} y={cellSize * 0.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8"/>
        <rect x={cellSize * 0.5} y={cellSize * 9.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8"/>
        <rect x={cellSize * 9.5} y={cellSize * 9.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8"/>

        {/* Center Triangles */}
        <path d={`M ${size/2},${size/2} L ${cellSize*6},${cellSize*6} L ${cellSize*6},${cellSize*9} Z`} className="fill-green" />
        <path d={`M ${size/2},${size/2} L ${cellSize*6},${cellSize*6} L ${cellSize*9},${cellSize*6} Z`} className="fill-yellow" />
        <path d={`M ${size/2},${size/2} L ${cellSize*9},${cellSize*9} L ${cellSize*6},${cellSize*9} Z`} className="fill-red" />
        <path d={`M ${size/2},${size/2} L ${cellSize*9},${cellSize*9} L ${cellSize*9},${cellSize*6} Z`} className="fill-blue" />

        {mainPathCoords.map((c) => {
          const isStar = SAFE_SQUARES.includes(c.index);
          const isStart = Object.values(START_POSITIONS).includes(c.index);
          let cellColorClass = 'ludo-cell';
          let starColorClass = '';
          
          if (isStart) {
            const color = PLAYER_COLORS.find(pc => START_POSITIONS[pc] === c.index)!;
            cellColorClass = `ludo-home-path ${color}`;
          }
           if (isStar && !isStart) {
            const starColor = STAR_COLORS[c.index];
            if (starColor) starColorClass = `star-${starColor}`;
          }

          return (
            <g key={`cell-${c.index}`} transform={`translate(${toPx(c.x)}, ${toPx(c.y)})`}>
              <rect x={-cellSize/2} y={-cellSize/2} width={cellSize} height={cellSize} className={cellColorClass} />
              {starColorClass && <text dy=".3em" textAnchor="middle" className={`star ${starColorClass}`}>★</text>}
            </g>
          );
        })}
        
        {/* Home Paths */}
        {homePathCoords.map((c) => (
           <g key={`home-${c.color}-${c.index}`} transform={`translate(${toPx(c.x)}, ${toPx(c.y)})`}>
              <rect x={-cellSize/2} y={-cellSize/2} width={cellSize} height={cellSize} className={`ludo-home-path ${c.color}`} />
            </g>
        ))}
        
        {/* Yard Spots */}
         {yardCoords.map((c) => (
            <g key={`yard-spot-${c.color}-${c.index}`} transform={`translate(${toPx(c.x)}, ${toPx(c.y)})`}>
              <circle r={cellSize * 0.45} className="yard-spot" />
            </g>
        ))}
      </>
    );
  };
  
  const renderTokens = () => {
    const tokensByPosition: Record<string, Token[]> = tokens.reduce((acc, token) => {
        const posKey = JSON.stringify(token.position);
        if (!acc[posKey]) acc[posKey] = [];
        acc[posKey].push(token);
        return acc;
    }, {} as Record<string, Token[]>);

    const tokensToRender = Object.values(tokensByPosition).flat().filter(token => {
        return !animation || token.id !== animation.tokenId;
    });

    return tokensToRender.map((token) => {
        const coords = getTokenPositionCoords(token);
        if (!coords) return null;

        const isMovable = legalMoves.some(m => m.tokenId === token.id);
        console.log(`🎯 Token ${token.id}: position=${token.position.type}:${token.position.index}, isMovable=${isMovable}`);
        const group = tokensByPosition[JSON.stringify(token.position)];
        const stackIndex = group.findIndex(t => t.id === token.id);
        const stackOffset = cellSize * 0.15;
        const xOffset = stackIndex > 0 ? (stackIndex % 2 === 1 ? -stackOffset : stackOffset) : 0;
        const yOffset = stackIndex > 1 ? (stackIndex < 3 ? -stackOffset : stackOffset) : 0;
        const canClick = isMovable && isMyTurn;

        return (
            <g 
                key={token.id} 
                transform={`translate(${toPx(coords.x) + xOffset}, ${toPx(coords.y) + yOffset})`}
                onClick={() => canClick && onMoveToken(token.id)}
                onTouchEnd={(e) => {
                    e.preventDefault(); // Prevent ghost clicks
                    if (canClick) onMoveToken(token.id);
                }}
                style={{ 
                    cursor: canClick ? 'pointer' : 'default', 
                    transition: 'transform 0.2s ease-in-out',
                    touchAction: 'manipulation'
                }}
                className={canClick ? 'cursor-pointer' : ''}
            >
                {/* Invisible Hit Target - Larger for sensitivity */}
                <circle 
                    r={cellSize * 0.85} 
                    fill="transparent" 
                    style={{ pointerEvents: 'all' }}
                />
                {/* Visual Token - Restored Size */}
                <circle 
                    r={cellSize * 0.45} 
                    fill={`url(#grad-${token.color})`} 
                    className="token" 
                    style={{ pointerEvents: 'none' }} 
                />
            </g>
        );
    });
  };

  const renderMovableIndicators = () => {
    if (turnState !== 'MOVING' || !isMyTurn) {
      return null;
    }

    const tokensByPosition: Record<string, Token[]> = tokens.reduce((acc, token) => {
        const posKey = JSON.stringify(token.position);
        if (!acc[posKey]) acc[posKey] = [];
        acc[posKey].push(token);
        return acc;
    }, {} as Record<string, Token[]>);

    return legalMoves.map((move) => {
      const token = tokens.find((t) => t.id === move.tokenId);
      if (!token) return null;

      const coords = getTokenPositionCoords(token);
      if (!coords) return null;

      const group = tokensByPosition[JSON.stringify(token.position)];
      const stackIndex = group.findIndex(t => t.id === token.id);
      const stackOffset = cellSize * 0.15;
      const xOffset = stackIndex > 0 ? (stackIndex % 2 === 1 ? -stackOffset : stackOffset) : 0;
      const yOffset = stackIndex > 1 ? (stackIndex < 3 ? -stackOffset : stackOffset) : 0;
      
      return (
        <g 
            key={`indicator-${move.tokenId}`} 
            transform={`translate(${toPx(coords.x) + xOffset}, ${toPx(coords.y) + yOffset})`}
            style={{ pointerEvents: 'none' }}
        >
          <circle className="movable-indicator" r={cellSize * 0.45} />
        </g>
      );
    });
  };
  
  const renderAnimatedToken = () => {
      if (!animation) return null;
      const coords = animation.path[animation.step];
      const { tokenColor } = animation;

      if (!coords) return null;

      return (
         <g 
            transform={`translate(${toPx(coords.x)}, ${toPx(coords.y)})`}
            style={{ transition: 'transform 0.1s linear', pointerEvents: 'none' }}
        >
            <circle r={cellSize * 0.45} fill={`url(#grad-${tokenColor})`} className="token" />
        </g>
      )
  }

  return (
    <div className="aspect-square w-full lg:w-auto lg:h-full max-w-full bg-gray-200 p-2 rounded-2xl shadow-2xl overflow-hidden">
        <svg 
            viewBox={`0 0 ${size} ${size}`}
            style={{ 
                transform: `rotate(${rotation}deg)`, 
                transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' 
            }}
        >
            <defs>
              {PLAYER_COLORS.map(color => {
                const colors = PLAYER_TAILWIND_COLORS[color];
                return (
                  <radialGradient key={`grad-${color}`} id={`grad-${color}`} cx="30%" cy="30%" r="70%">
                    <stop offset="0%" style={{ stopColor: colors.hexHighlight, stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: colors.hex, stopOpacity: 1 }} />
                  </radialGradient>
                )
              })}
            </defs>
            {renderGridAndPaths()}
            {renderTokens()}
            {renderMovableIndicators()}
            {renderAnimatedToken()}
        </svg>
    </div>
  );
});

export default Board;

