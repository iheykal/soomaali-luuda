
import React, { useState, useEffect, useRef } from 'react';
import type { PlayerColor } from '../types';
import { PLAYER_TAILWIND_COLORS } from '../lib/boardLayout';
import { audioService } from '../services/audioService';

interface DiceProps {
  value: number | null;
  onRoll: () => void;
  isMyTurn: boolean;
  playerColor: PlayerColor;
  timer: number;
  turnState: 'ROLLING' | 'MOVING' | 'ANIMATING' | 'GAMEOVER';
  potAmount?: number;
}

const Dot: React.FC<{ style: React.CSSProperties; color: string }> = ({ style, color }) => (
  <div 
    className="absolute w-5 h-5 rounded-full shadow-inner" 
    style={{ ...style, backgroundColor: color }} 
  />
);

const DiceFace: React.FC<{ value: number; dotColor: string }> = ({ value, dotColor }) => {
    // Use numbers instead of dots for better visibility
    return (
        <div className="dice-number" style={{ color: dotColor, visibility: dotColor === 'transparent' ? 'hidden' : 'visible' }}>
            {value}
        </div>
    );
};

const Dice: React.FC<DiceProps> = ({ value, onRoll, isMyTurn, playerColor, timer, turnState, potAmount }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [cubeClass, setCubeClass] = useState('');
  const prevValueRef = useRef<number | null>(null); // Use ref for lastValue to prevent re-render loop
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showNumber, setShowNumber] = useState(value !== null);


  useEffect(() => {
    const lastValue = prevValueRef.current;
    console.log(`🎲 Dice useEffect triggered: value=${value}, type=${typeof value}, playerColor=${playerColor}, isMyTurn=${isMyTurn}, lastValue=${lastValue}`);
    console.log(`🎲 Current state: isAnimating=${isAnimating}, cubeClass="${cubeClass}"`);

    // Handle valid dice values (1-6) - ALWAYS animate on new roll
    if (value !== null && value !== undefined && typeof value === 'number' && value >= 1 && value <= 6) {
      setShowNumber(true);
      // Check if this is a new roll (value changed from null/undefined/different number)
      const isNewRoll = lastValue === null || lastValue === undefined || lastValue !== value;
      
      if (isNewRoll) {
        console.log(`✅ NEW ROLL detected: ${value}, starting animation for ${playerColor} (previous: ${lastValue})`);
        
        // Update ref immediately
        prevValueRef.current = value;
        
        // Play dice roll sound
        audioService.play('diceRoll');
        
        // Stop any ongoing animation and reset
        setIsAnimating(false);
        setCubeClass('');
        
        // Start animation immediately
        setIsAnimating(true);
        
        // Set final state after animation completes (shorter for snappier feel)
        animationTimerRef.current = setTimeout(() => {
          console.log(`🎲 Animation complete, setting cubeClass to show-${value}`);
          setCubeClass(`show-${value}`);
          setIsAnimating(false);
        }, 400); // 0.4s animation
      } else {
        // Same value - ensure display is correct
        console.log(`🎲 Same value (${value}), ensuring display is correct`);
        if (cubeClass !== `show-${value}` && !isAnimating) {
          setCubeClass(`show-${value}`);
        }
      }
    } 
    // Handle null value (new turn starting)
    else if (value === null) {
      setShowNumber(false);
      console.log(`🎲 Dice value is null (new turn), resetting to neutral state for ${playerColor}`);
      setIsAnimating(false);
      setCubeClass('');
      prevValueRef.current = null;
    } 
    // Handle undefined (keep current state)
    else if (value === undefined) {
      console.log(`⚠️ Dice value is undefined, keeping current state (cubeClass="${cubeClass}") for ${playerColor}`);
    } 
    // Handle invalid values
    else {
      setShowNumber(false);
      console.error(`❌ Invalid dice value: ${value}, resetting to default for ${playerColor}`);
      setCubeClass('');
      setIsAnimating(false);
      prevValueRef.current = null;
    }

    // Cleanup function - always returned at the useEffect level
    return () => {
      if (animationTimerRef.current) {
        console.log(`🧹 Cleaning up animation timer for value ${value}`);
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [value]); // Dependency only on value to prevent loop with state updates

  const handleClick = () => {
    console.log(`🎲 ========== DICE CLICKED ==========`);
    console.log(`🎲 isMyTurn: ${isMyTurn}`);
    console.log(`🎲 current dice value: ${value}`);
    console.log(`🎲 timer: ${timer}s`);
    console.log(`🎲 playerColor: ${playerColor}`);
    console.log(`🎲 isAnimating: ${isAnimating}`);
    console.log(`🎲 cubeClass: "${cubeClass}"`);
    console.log(`🎲 clickableClass: "${clickableClass}"`);
    
    // CRITICAL FIX: Allow click even if timer is 0 - backend will handle auto-roll
    // User should be able to manually roll until backend timer fires
    if (isMyTurn) {
        console.log(`✅ It's my turn, calling onRoll function...`);
        console.log(`✅ Timer is ${timer}s - allowing roll (backend will validate)`);
        onRoll();
        console.log(`✅ onRoll function called successfully`);
    } else {
        console.log(`❌ Not my turn - click blocked`);
    }
    console.log(`🎲 ===================================`);
  }

  const clickableClass = isMyTurn ? 'dice-clickable' : '';
  const blinkingClass = isMyTurn && turnState === 'ROLLING' ? 'animate-fast-pulse' : '';
  const colors = PLAYER_TAILWIND_COLORS[playerColor];

  // Determine dot color for contrast (Yellow needs dark text/dots)
  const dotColor = playerColor === 'yellow' ? '#1e293b' : '#ffffff';
  
  // Dynamic styles for the dice faces
  const faceStyle = {
      backgroundColor: colors.hex,
      borderColor: 'rgba(255,255,255,0.5)',
      transition: 'background-color 0.25s ease',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1)'
  };

  return (
    <div className="flex flex-col items-center space-y-4">
        <div className="relative">
            {/* Circular Timer Indicator (always show if timer provided) */}
            <div className="absolute -inset-4 rounded-full border-4 border-slate-700/0 flex items-center justify-center pointer-events-none">
              {typeof timer === 'number' && (
                <span className={`absolute -top-8 text-sm font-bold ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                  {timer}s
                </span>
              )}
            </div>

            

            <div 
                className={`scene ${clickableClass} ${blinkingClass} touch-manipulation z-20`}
                onClick={handleClick}
                onTouchEnd={(e) => {
                    // Prevent default to avoid double-firing with onClick if supported, 
                    // but usually simple prevention of ghost clicks is enough.
                    // However, we want to ensure touch works even if click is finicky.
                    e.preventDefault(); 
                    handleClick();
                }}
                role="button"
                tabIndex={0}
                aria-label="Roll dice"
                aria-disabled={!isMyTurn}
            >
                <div className={`cube ${isAnimating ? 'is-rolling' : ''} ${!isAnimating && cubeClass ? cubeClass : ''}`}>
                    {[1, 2, 3, 4, 5, 6].map(num => (
                        <div key={num} className={`face face-${num}`} style={faceStyle}>
                            <DiceFace value={num} dotColor={showNumber ? dotColor : 'transparent'} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Dice;