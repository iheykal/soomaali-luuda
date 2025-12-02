import type { PlayerColor, Token, TokenPosition } from '../types';

// --- Core Game Constants ---
export const PLAYER_COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
// Fix: Added `glow` property to the type and each color object to support highlighting movable tokens.
export const PLAYER_TAILWIND_COLORS: Record<PlayerColor, { bg: string, darkBg: string, text: string, border: string, glow: string, hex: string, hexHighlight: string }> = {
    red: { bg: 'bg-red-600', darkBg: 'bg-red-900', text: 'text-red-600', border: 'border-red-600', glow: 'ring-4 ring-red-400', hex: '#dc2626', hexHighlight: '#f87171' },
    green: { bg: 'bg-green-600', darkBg: 'bg-green-900', text: 'text-green-600', border: 'border-green-600', glow: 'ring-4 ring-green-400', hex: '#16a34a', hexHighlight: '#4ade80' },
    yellow: { bg: 'bg-yellow-400', darkBg: 'bg-yellow-700', text: 'text-yellow-400', border: 'border-yellow-400', glow: 'ring-4 ring-yellow-300', hex: '#facc15', hexHighlight: '#fde047' },
    blue: { bg: 'bg-blue-600', darkBg: 'bg-blue-900', text: 'text-blue-600', border: 'border-blue-600', glow: 'ring-4 ring-blue-400', hex: '#2563eb', hexHighlight: '#60a5fa' },
};

// --- Board Layout and Game Rules ---
const GRID_SIZE = 15;
export const HOME_PATH_LENGTH = 5; // 5 steps in the path, 6th is home.

// Game logic re-mapped to match new visual layout.
// Red: bottom-left, Green: top-left, Yellow: top-right, Blue: bottom-right
export const START_POSITIONS: Record<PlayerColor, number> = { red: 39, green: 0, yellow: 13, blue: 26 };
export const HOME_ENTRANCES: Record<PlayerColor, number> = { red: 37, green: 50, yellow: 11, blue: 24 };


// Starred squares + player start squares are safe
// Added Home Entrances (11, 24, 37, 50) to be safe as well
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47, 11, 24, 37, 50];

// Arrow squares: Fixed positions where ANY player gets auto-jump + extra roll
// Pattern: Every 13th square starting from 4 (4, 17, 30, 43)
export const ARROW_SQUARES = [4, 17, 30, 43];



// --- Coordinate Mappings for SVG Board ---

// Maps a logical path position (0-51) to a [row, col] on a 15x15 grid
const RAW_PATH_MAP: Record<number, [number, number]> = {
    0: [6, 1], 1: [6, 2], 2: [6, 3], 3: [6, 4], 4: [6, 5],
    5: [5, 6], 6: [4, 6], 7: [3, 6], 8: [2, 6], 9: [1, 6],
    10: [0, 6], 11: [0, 7], 12: [0, 8],
    13: [1, 8], 14: [2, 8], 15: [3, 8], 16: [4, 8], 17: [5, 8],
    18: [6, 9], 19: [6, 10], 20: [6, 11], 21: [6, 12], 22: [6, 13],
    23: [6, 14], 24: [7, 14], 25: [8, 14],
    26: [8, 13], 27: [8, 12], 28: [8, 11], 29: [8, 10], 30: [8, 9],
    31: [9, 8], 32: [10, 8], 33: [11, 8], 34: [12, 8], 35: [13, 8],
    36: [14, 8], 37: [14, 7], 38: [14, 6],
    39: [13, 6], 40: [12, 6], 41: [11, 6], 42: [10, 6], 43: [9, 6],
    44: [8, 5], 45: [8, 4], 46: [8, 3], 47: [8, 2], 48: [8, 1],
    49: [8, 0], 50: [7, 0], 51: [6, 0]
};

// Maps a home path step (0-4) to a [row, col]
const RAW_HOME_PATH_MAP: Record<PlayerColor, [number, number][]> = {
    red: Array.from({ length: 5 }, (_, i) => [13 - i, 7]), // Bottom to center
    green: Array.from({ length: 5 }, (_, i) => [7, 1 + i]),   // Left to center
    yellow: Array.from({ length: 5 }, (_, i) => [1 + i, 7]),   // Top to center
    blue: Array.from({ length: 5 }, (_, i) => [7, 13 - i]), // Right to center
};

// Maps a yard index (0-3) to a [row, col], re-mapped for new layout
// Fix: Explicitly type YARD_COORDS_BY_QUADRANT to ensure TypeScript infers the correct tuple type `[number, number][]` instead of `number[][]`.
const YARD_COORDS_BY_QUADRANT: Record<string, [number, number][]> = {
    'top-left': [[1.5, 1.5], [1.5, 4.5], [4.5, 1.5], [4.5, 4.5]],
    'top-right': [[1.5, 10.5], [1.5, 13.5], [4.5, 10.5], [4.5, 13.5]],
    'bottom-right': [[10.5, 10.5], [10.5, 13.5], [13.5, 10.5], [13.5, 13.5]],
    'bottom-left': [[10.5, 1.5], [10.5, 4.5], [13.5, 1.5], [13.5, 4.5]],
};
const RAW_YARD_MAP: Record<PlayerColor, [number, number][]> = {
    red: YARD_COORDS_BY_QUADRANT['bottom-left'],
    green: YARD_COORDS_BY_QUADRANT['top-left'],
    yellow: YARD_COORDS_BY_QUADRANT['top-right'],
    blue: YARD_COORDS_BY_QUADRANT['bottom-right'],
};

// --- Helper function to convert grid coords to normalized SVG coords ---
const cellCenter = (row: number, col: number) => ({
    x: (col + 0.5) / GRID_SIZE,
    y: (row + 0.5) / GRID_SIZE,
});

// --- Exported, processed coordinate maps for the UI ---
export const mainPathCoords = Object.values(RAW_PATH_MAP).map((rc, i) => ({
    index: i, row: rc[0], col: rc[1], ...cellCenter(rc[0], rc[1])
}));

export const homePathCoords = (Object.keys(RAW_HOME_PATH_MAP) as PlayerColor[]).flatMap(color =>
    RAW_HOME_PATH_MAP[color].map((rc, i) => ({
        color, index: i, row: rc[0], col: rc[1], ...cellCenter(rc[0], rc[1])
    }))
);

export const yardCoords = (Object.keys(RAW_YARD_MAP) as PlayerColor[]).flatMap(color =>
    RAW_YARD_MAP[color].map((rc, i) => ({
        color, index: i, row: rc[0], col: rc[1], ...cellCenter(rc[0], rc[1])
    }))
);

// Fix: Refactor to use a switch statement for robust type narrowing on the discriminated union `TokenPosition`.
export const getTokenPositionCoords = (token: Pick<Token, 'color' | 'position'>) => {
    const { position } = token;
    switch (position.type) {
        case 'YARD':
            return yardCoords.find(c => c.color === token.color && c.index === position.index);
        case 'PATH':
            return mainPathCoords[position.index];
        case 'HOME_PATH':
            return homePathCoords.find(c => c.color === token.color && c.index === position.index);
        case 'HOME': {
            // For 'HOME' tokens, return center triangle position
            const center = cellCenter(7, 7); // Center of the 15x15 grid is 7,7
            const offset = 0.08 * GRID_SIZE; // Make offset relative
            switch (token.color) {
                case 'red': return { ...center, y: center.y + (offset / GRID_SIZE) };
                case 'green': return { ...center, x: center.x - (offset / GRID_SIZE) };
                case 'yellow': return { ...center, y: center.y - (offset / GRID_SIZE) };
                case 'blue': return { ...center, x: center.x + (offset / GRID_SIZE) };
            }
        }
    }
    return undefined;
};

// --- Animation Path Helpers ---
function getNextSingleStepPosition(currentPos: TokenPosition, color: PlayerColor): TokenPosition {
    if (currentPos.type === 'HOME' || currentPos.type === 'YARD') return currentPos;

    if (currentPos.type === 'HOME_PATH') {
        const nextIndex = currentPos.index + 1;
        return nextIndex < HOME_PATH_LENGTH ? { type: 'HOME_PATH', index: nextIndex } : { type: 'HOME' };
    }

    if (currentPos.type === 'PATH') {
        // If token is at its home entrance, the next step is into the home path.
        if (currentPos.index === HOME_ENTRANCES[color]) {
            return { type: 'HOME_PATH', index: 0 };
        }
        const nextIndex = (currentPos.index + 1) % 52;
        return { type: 'PATH', index: nextIndex };
    }

    return currentPos; // Fallback
}

export const getAnimationPath = (
    startPos: TokenPosition,
    diceValue: number,
    color: PlayerColor
): { x: number; y: number }[] => {
    const pathCoords = [];

    if (startPos.type === 'YARD') {
        const yardCoord = getTokenPositionCoords({ color, position: startPos });
        const startPathIndex = START_POSITIONS[color];
        const pathCoord = mainPathCoords[startPathIndex];
        if (yardCoord && pathCoord) pathCoords.push(yardCoord, pathCoord);
        return pathCoords;
    }

    // Fix: Explicitly type `currentPos` as `TokenPosition`. After the 'YARD' check above,
    // TypeScript narrows `startPos`, and thus `currentPos`, to a type that excludes 'YARD'.
    // However, `getNextSingleStepPosition` returns the full `TokenPosition` type.
    // This explicit annotation prevents the narrowing and resolves the assignment error in the loop.
    let currentPos: TokenPosition = startPos;
    const startCoords = getTokenPositionCoords({ color, position: startPos });
    if (startCoords) pathCoords.push(startCoords);

    for (let i = 0; i < diceValue; i++) {
        const nextPos = getNextSingleStepPosition(currentPos, color);
        const nextCoords = getTokenPositionCoords({ color, position: nextPos });
        if (nextCoords) pathCoords.push(nextCoords);
        currentPos = nextPos;
        if (currentPos.type === 'HOME') break;
    }

    return pathCoords;
};

// Helper to compare two TokenPositions
const isSamePosition = (a: TokenPosition, b: TokenPosition): boolean => {
    if (a.type !== b.type) return false;
    if (a.type === 'HOME') return b.type === 'HOME';
    return (a as any).index === (b as any).index;
};

// New Function: Calculate path between two positions WITHOUT needing dice value
// This is robust against server clearing dice value
export const calculatePathBetween = (
    startPos: TokenPosition,
    endPos: TokenPosition,
    color: PlayerColor
): { x: number; y: number }[] => {
    const pathCoords = [];

    // 1. Handle Yard to Start
    if (startPos.type === 'YARD' && endPos.type === 'PATH') {
        const yardCoord = getTokenPositionCoords({ color, position: startPos });
        const startPathIndex = START_POSITIONS[color];
        const pathCoord = mainPathCoords[startPathIndex];
        if (yardCoord && pathCoord) pathCoords.push(yardCoord, pathCoord);
        // If end pos is further than start, we continue, but usually Yard->Start is 1 step.
        return pathCoords;
    }

    // 2. Handle Capture (Any -> Yard) - Direct return to base
    if (endPos.type === 'YARD') {
        const startCoord = getTokenPositionCoords({ color, position: startPos });
        const endCoord = getTokenPositionCoords({ color, position: endPos });
        if (startCoord && endCoord) {
            return [startCoord, endCoord];
        }
        return [];
    }

    // 3. Handle regular movement
    let currentPos = startPos;

    // Add start point
    const startCoords = getTokenPositionCoords({ color, position: startPos });
    if (startCoords) pathCoords.push(startCoords);

    // Safety limit to prevent infinite loops
    let steps = 0;
    const MAX_STEPS = 60;

    while (!isSamePosition(currentPos, endPos) && steps < MAX_STEPS) {
        const nextPos = getNextSingleStepPosition(currentPos, color);
        const nextCoords = getTokenPositionCoords({ color, position: nextPos });

        if (nextCoords) {
            pathCoords.push(nextCoords);
        }

        // If we didn't move (e.g. at Home), break to avoid infinite loop
        if (isSamePosition(currentPos, nextPos)) break;

        currentPos = nextPos;
        steps++;
    }

    return pathCoords;
};