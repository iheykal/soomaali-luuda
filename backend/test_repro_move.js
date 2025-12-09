const gameEngine = require('./logic/gameEngine');

// Mock Game State with Capitalized Color (as seen in some logs)
const mockGameCapitalized = {
    gameId: 'TEST_GAME_CAP',
    players: [
        { color: 'Green', userId: 'p1', socketId: 's1', isAI: false },
        { color: 'Blue', userId: 'p2', socketId: 's2', isAI: false }
    ],
    tokens: [
        { id: 'green-0', color: 'Green', position: { type: 'YARD', index: 0 } }
    ],
    currentPlayerIndex: 0,
    turnState: 'MOVING',
    diceValue: 6,
    legalMoves: []
};

console.log("--- Testing Capitalized Color ('Green') ---");
try {
    const movesCap = gameEngine.calculateLegalMoves(mockGameCapitalized, 6);
    console.log("Moves generated (Green):", JSON.stringify(movesCap, null, 2));
} catch (error) {
    console.error("Error with Capitalized Color:", error);
}

// Mock Game State with Lowercase Color (as used in server.js)
const mockGameLower = {
    gameId: 'TEST_GAME_LOWER',
    players: [
        { color: 'green', userId: 'p1', socketId: 's1', isAI: false },
        { color: 'blue', userId: 'p2', socketId: 's2', isAI: false }
    ],
    tokens: [
        { id: 'green-0', color: 'green', position: { type: 'YARD', index: 0 } }
    ],
    currentPlayerIndex: 0,
    turnState: 'MOVING',
    diceValue: 6,
    legalMoves: []
};

console.log("\n--- Testing Lowercase Color ('green') ---");
try {
    const movesLower = gameEngine.calculateLegalMoves(mockGameLower, 6);
    console.log("Moves generated (green):", JSON.stringify(movesLower, null, 2));
} catch (error) {
    console.error("Error with Lowercase Color:", error);
}
