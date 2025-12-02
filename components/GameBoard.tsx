
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
import ArrowsAnimation from './ArrowsAnimation';
import StaticArrows from './StaticArrows';

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
  const [animation, setAnimation] = useState<{ tokenId: string, tokenColor: PlayerColor, path: { x: number, y: number }[], step: number, isTeleport?: boolean } | null>(null);
  const [arrowAnimation, setArrowAnimation] = useState<{ fromSquare: number, toSquare: number, color: string } | null>(null);
  const prevTokens = usePrevious(tokens);
  const prevMessage = usePrevious(gameState.message);

  // Detect Arrows Rule trigger from message
  useEffect(() => {
    if (gameState.message && gameState.message.includes('🎯 Arrows Rule!') && gameState.message !== prevMessage) {
      console.log('🎯 Arrows Rule detected in GameBoard!', gameState.message);

      // Extract square information from the backend log if possible, or calculate from game state
      // For simplicity, we'll show the arrow for any detected Arrows Rule trigger
      // We need to find which token just moved - it should be the last moved token
      const movedToken = tokens.find(token => {
        const prev = prevTokens?.find(p => p.id === token.id);
        return prev && JSON.stringify(prev.position) !== JSON.stringify(token.position);
      });

      if (movedToken && movedToken.position.type === 'PATH') {
        console.log('🎯 Found moved token for Arrows Rule:', movedToken.id, movedToken.position);

        // The token is now on the 5th square (after auto-jump), so we show arrow from 4th to 5th
        const fromSquare = (movedToken.position.index - 1 + 52) % 52;
        const toSquare = movedToken.position.index;

        // Get color for arrow
        const colorMap: Record<PlayerColor, string> = {
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6'
        };

        setArrowAnimation({
          fromSquare,
          toSquare,
          color: colorMap[movedToken.color]
        });

        // Auto-hide after 2 seconds
        setTimeout(() => {
          setArrowAnimation(null);
        }, 2000);

        // Create teleport animation with multiple steps for smooth effect
        const fromCoords = getTokenPositionCoords({ color: movedToken.color, position: { type: 'PATH', index: fromSquare } });
        const toCoords = getTokenPositionCoords({ color: movedToken.color, position: { type: 'PATH', index: toSquare } });

        if (fromCoords && toCoords) {
          // Create a 10-step path for smooth disappear/reappear
          const steps = 10;
          const path = Array.from({ length: steps + 1 }, (_, i) => {
            const progress = i / steps;
            // For first half, stay at fromCoords
            // For second half, stay at toCoords
            return progress < 0.5 ? fromCoords : toCoords;
          });

          console.log('🎯 Setting teleport animation', { fromSquare, toSquare, pathLength: path.length });

          setAnimation({
            tokenId: movedToken.id,
            tokenColor: movedToken.color,
            path,
            step: 0,
            isTeleport: true
          });
        } else {
          console.error('🎯 Could not get coords for teleport', { fromSquare, toSquare });
        }
      } else {
        console.log('🎯 Could not find moved token for Arrows Rule');
      }
    }
  }, [gameState.message, prevMessage, tokens, prevTokens]);

  useEffect(() => {
    // REMOVED: turnState !== 'ANIMATING' check to allow animation even if server quickly transitions to ROLLING
    if (!prevTokens) return;

    // Skip normal animation if Arrows Rule was just triggered
    if (gameState.message && gameState.message.includes('🎯 Arrows Rule!')) {
      console.log('Skipping normal animation - Arrows Rule detected');
      return;
    }

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
  }, [tokens, prevTokens, onAnimationComplete, gameState.message]);

  useEffect(() => {
    if (!animation) return;

    if (animation.step >= animation.path.length - 1) {
      const endTimer = setTimeout(() => {
        setAnimation(null);
        onAnimationComplete();
      }, animation.isTeleport ? 200 : 150); // Slightly longer pause for teleport
      return () => clearTimeout(endTimer);
    }

    const stepTimer = setTimeout(() => {
      setAnimation(prev => prev ? ({ ...prev, step: prev.step + 1 }) : null);
    }, animation.isTeleport ? 100 : 300); // Much faster for teleport (100ms vs 300ms)

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

  // Helper to get arrow rotation angle for each arrow square
  const getArrowRotation = (squareIndex: number): number => {
    // Determine which side of the board the square is on based on its position
    const coord = mainPathCoords[squareIndex];
    const nextCoord = mainPathCoords[(squareIndex + 1) % 52];

    // Calculate angle from current to next square
    const dx = nextCoord.x - coord.x;
    const dy = nextCoord.y - coord.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return angle;
  };

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
        <rect x={cellSize * 0.5} y={cellSize * 0.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8" />
        <rect x={cellSize * 9.5} y={cellSize * 0.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8" />
        <rect x={cellSize * 0.5} y={cellSize * 9.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8" />
        <rect x={cellSize * 9.5} y={cellSize * 9.5} width={cellSize * 5} height={cellSize * 5} fill="white" stroke="#d1d5db" strokeWidth="2" rx="8" />

        {/* Center Triangles */}
        <path d={`M ${size / 2},${size / 2} L ${cellSize * 6},${cellSize * 6} L ${cellSize * 6},${cellSize * 9} Z`} className="fill-green" />
        <path d={`M ${size / 2},${size / 2} L ${cellSize * 6},${cellSize * 6} L ${cellSize * 9},${cellSize * 6} Z`} className="fill-yellow" />
        <path d={`M ${size / 2},${size / 2} L ${cellSize * 9},${cellSize * 9} L ${cellSize * 6},${cellSize * 9} Z`} className="fill-red" />
        <path d={`M ${size / 2},${size / 2} L ${cellSize * 9},${cellSize * 9} L ${cellSize * 9},${cellSize * 6} Z`} className="fill-blue" />

        {mainPathCoords.map((c) => {
          const isStar = SAFE_SQUARES.includes(c.index);
          const isStart = Object.values(START_POSITIONS).includes(c.index);
          const isArrowSquare = [4, 17, 30, 43].includes(c.index); // Arrow squares
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
              <rect x={-cellSize / 2} y={-cellSize / 2} width={cellSize} height={cellSize} className={cellColorClass} />
              {starColorClass && <text dy=".3em" textAnchor="middle" className={`star ${starColorClass}`}>★</text>}
              {/* Removed old arrow - now using StaticArrows component */}
            </g>
          );
        })}

        {/* Home Paths */}
        {homePathCoords.map((c) => (
          <g key={`home-${c.color}-${c.index}`} transform={`translate(${toPx(c.x)}, ${toPx(c.y)})`}>
            <rect x={-cellSize / 2} y={-cellSize / 2} width={cellSize} height={cellSize} className={`ludo-home-path ${c.color}`} />
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
    const { tokenColor, isTeleport } = animation;

    if (!coords) return null;

    // Special teleport animation for Arrows Rule
    if (isTeleport) {
      const progress = animation.step / Math.max(animation.path.length - 1, 1);
      let scale = 1;
      let opacity = 1;

      if (progress < 0.5) {
        // Disappearing phase (pawn digs down)
        scale = 1 - (progress * 2); // 1 → 0
        opacity = 1 - (progress * 2);
      } else {
        // Reappearing phase (pawn pops up)
        scale = (progress - 0.5) * 2; // 0 → 1
        opacity = (progress - 0.5) * 2;
      }

      return (
        <g
          transform={`translate(${toPx(coords.x)}, ${toPx(coords.y)}) scale(${scale})`}
          style={{ pointerEvents: 'none' }}
        >
          <circle
            r={cellSize * 0.45}
            fill={`url(#grad-${tokenColor})`}
            className="token"
            opacity={opacity}
          />
        </g>
      );
    }

    // Normal movement animation
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
          {/* Static arrowhead marker for permanent arrows */}
          <marker
            id="arrowhead-static"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              fill="#666"
              opacity="0.6"
            />
          </marker>

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
        {/* Render static arrow graphics */}
        <StaticArrows boardSize={size} cellSize={cellSize} />
        {renderTokens()}
        {renderMovableIndicators()}
        {renderAnimatedToken()}
        {arrowAnimation && (
          <ArrowsAnimation
            fromSquareIndex={arrowAnimation.fromSquare}
            toSquareIndex={arrowAnimation.toSquare}
            color={arrowAnimation.color}
            boardSize={size}
          />
        )}
      </svg>
    </div>
  );
});

export default Board;

