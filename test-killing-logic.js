import { handleMoveToken } from './backend/logic/gameEngine.js';
import Game from './backend/models/Game.js';

// Mock Mongoose models
const mockGame = {
    gameId: 'test-game',
    players: [],
    tokens: [],
    currentPlayerIndex: 0,
    turnState: 'ROLLING',
    legalMoves: [],
    save: async function () { return this; },
    toObject: function () { return this; }
};

// Mock Game.findOne
Game.findOne = async () => mockGame;
// Mock Game.prototype.save
Game.prototype.save = async function () { return this; };

// Helper to reset game state
const resetGame = () => {
    mockGame.players = [
        { color: 'green', userId: 'p1', socketId: 's1', isAI: false },
        { color: 'blue', userId: 'p2', socketId: 's2', isAI: false }
    ];
    mockGame.tokens = [
        { id: 'green-0', color: 'green', position: { type: 'PATH', index: 50 } }, // Setup for move to 0
        { id: 'blue-0', color: 'blue', position: { type: 'PATH', index: 0 } }     // Enemy on 0
    ];
    mockGame.currentPlayerIndex = 0; // Green's turn
    mockGame.turnState = 'ROLLING';
    mockGame.diceValue = 2; // Roll 2 to move from 50 to 0 (50 -> 51 -> 0)
};

async function runTests() {
    console.log("=== STARTING TESTS ===");

    // Test 1: Kill 1 Enemy on Start Square (0)
    console.log("\nTest 1: Kill 1 Enemy on Start Square (0)");
    resetGame();
    // Setup Green at 50, Blue at 0. Roll 2. Green moves 50->0.
    // Mock legal moves calculation (since we can't easily mock the internal calculateLegalMoves without exporting it)
    // We will manually inject the legal move to simulate the engine finding it.
    mockGame.legalMoves = [{ tokenId: 'green-0', finalPosition: { type: 'PATH', index: 0 } }];

    // Execute move
    await handleMoveToken('test-game', 's1', 'green-0');

    // Check result
    const blueToken = mockGame.tokens.find(t => t.id === 'blue-0');
    if (blueToken.position.type === 'YARD') {
        console.log("✅ PASS: Blue token sent to YARD (Killed)");
    } else {
        console.log("❌ FAIL: Blue token NOT sent to YARD. Pos:", blueToken.position);
    }

    // Test 2: Join 2 Enemies on Square 0
    console.log("\nTest 2: Join 2 Enemies on Square 0");
    resetGame();
    mockGame.tokens.push({ id: 'blue-1', color: 'blue', position: { type: 'PATH', index: 0 } }); // Add 2nd Blue token
    mockGame.legalMoves = [{ tokenId: 'green-0', finalPosition: { type: 'PATH', index: 0 } }];

    await handleMoveToken('test-game', 's1', 'green-0');

    const blueToken1 = mockGame.tokens.find(t => t.id === 'blue-0');
    const blueToken2 = mockGame.tokens.find(t => t.id === 'blue-1');
    const greenToken = mockGame.tokens.find(t => t.id === 'green-0');

    if (blueToken1.position.type === 'PATH' && blueToken1.position.index === 0 &&
        blueToken2.position.type === 'PATH' && blueToken2.position.index === 0 &&
        greenToken.position.type === 'PATH' && greenToken.position.index === 0) {
        console.log("✅ PASS: All tokens remain on Square 0 (Joined)");
    } else {
        console.log("❌ FAIL: Tokens moved unexpectedly.");
        console.log("Blue1:", blueToken1.position);
        console.log("Blue2:", blueToken2.position);
        console.log("Green:", greenToken.position);
    }

    console.log("\n=== TESTS COMPLETED ===");
}

runTests();
