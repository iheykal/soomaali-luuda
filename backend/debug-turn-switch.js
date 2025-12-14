const mongoose = require('mongoose');
const gameEngine = require('./logic/gameEngine');
const Game = require('./models/Game');
const User = require('./models/User');
require('dotenv').config();

// Connect to DB (using env var)
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';
console.log('Connecting to:', MONGO_URI.includes('@') ? 'Remote DB' : MONGO_URI);


async function runTest() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to DB');

        const gameId = 'DEBUG_GAME_' + Date.now();
        const user1Id = 'u_test_1';
        const user2Id = 'u_test_2';

        // 1. Join Game
        console.log('--- 1. Joining Game ---');
        await gameEngine.handleJoinGame(gameId, user1Id, 'green', 'socket1');
        await gameEngine.handleJoinGame(gameId, user2Id, 'blue', 'socket2');

        let game = await Game.findOne({ gameId });
        console.log(`Game created. Current Player: ${game.players[game.currentPlayerIndex].color}`);

        // 2. Roll Dice (Player 1 - Green)
        console.log('\n--- 2. Roll Dice (Player 1) ---');
        // Force turn to Player 1 if random started with Player 2
        if (game.players[game.currentPlayerIndex].color !== 'green') {
            console.log('Switching turn to green manually for test...');
            const p1Index = game.players.findIndex(p => p.color === 'green');
            await Game.updateOne({ gameId }, { $set: { currentPlayerIndex: p1Index } });
        }

        const rollResult = await gameEngine.handleRollDice(gameId, 'socket1');
        console.log('Roll Result Success:', rollResult.success);
        console.log('Dice Value:', rollResult.state.diceValue);
        console.log('Turn State:', rollResult.state.turnState);
        console.log('Legal Moves:', rollResult.state.legalMoves.length);

        if (!rollResult.success) {
            console.error('Roll failed:', rollResult.message);
            process.exit(1);
        }

        // 3. Move Token (if moves available, else mocked)
        console.log('\n--- 3. Move Token ---');
        let moveResult;
        if (rollResult.state.legalMoves.length > 0) {
            const tokenId = rollResult.state.legalMoves[0].tokenId;
            console.log(`Moving token: ${tokenId}`);
            moveResult = await gameEngine.handleMoveToken(gameId, 'socket1', tokenId);
        } else {
            // If rolled 1-5 with all in yard, no moves. Force a 6 roll scenario?
            // Or just verify that we can't move.
            console.log('No legal moves from roll. Simulating a 6 roll...');
            // Hack state to force a move
            const p1Index = game.players.findIndex(p => p.color === 'green');
            game.diceValue = 6;
            game.turnState = 'MOVING';
            game.legalMoves = [{ tokenId: 'green-0', finalPosition: { type: 'PATH', index: 0 } }];
            await Game.updateOne({ gameId }, { $set: { diceValue: 6, turnState: 'MOVING', legalMoves: game.legalMoves } });

            // Try moving now
            moveResult = await gameEngine.handleMoveToken(gameId, 'socket1', 'green-0');
        }

        console.log('Move Result Success:', moveResult.success);
        game = await Game.findOne({ gameId });
        console.log('New Current Player:', game.players[game.currentPlayerIndex].color);
        console.log('New Turn State:', game.turnState);

        const expectedPlayer = (rollResult.state.diceValue === 6 && moveResult.success) ? 'green' : 'blue';
        // Note: 6 grants extra turn.

        console.log(`Expected Player: ${expectedPlayer} (roughly)`);

        console.log('\n✅ Test execution complete.');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
