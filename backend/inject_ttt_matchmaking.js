const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');

const matchmakingLogic = `
    // ========== TIC-TAC-TOE MATCHMAKING ==========
    // Global queue for separate TTT matchmaking
    const ticTacToeQueue = [];

    socket.on('ttt_find_match', async ({ userId, username, stake }) => {
      try {
        console.log(\`🔎 Player \${username} looking for TTT match with stake \${stake}\`);
        
        // Remove existing if any
        const existingIndex = ticTacToeQueue.findIndex(p => p.userId === userId);
        if (existingIndex !== -1) {
           ticTacToeQueue.splice(existingIndex, 1);
        }
        
        // Add to queue
        const player = { userId, username, socketId: socket.id, stake };
        ticTacToeQueue.push(player);
        console.log(\`TTT Queue length: \${ticTacToeQueue.length}\`);
        
        // Matchmaking
        if (ticTacToeQueue.length >= 2) {
            // Get first two players
            const p1 = ticTacToeQueue.shift();
            const p2 = ticTacToeQueue.shift();
            
            // Generate ID
            const gameId = 'ttt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            console.log(\`🤝 Matching \${p1.username} vs \${p2.username} in game \${gameId}\`);

            // Creates game in DB
            const result = await ticTacToeEngine.createGame(gameId, [
                { userId: p1.userId, username: p1.username },
                { userId: p2.userId, username: p2.username }
            ], stake);
            
            if (result.success) {
                // Notify P1
                io.to(p1.socketId).emit('ttt_match_found', { 
                    gameId, 
                    stake, 
                    yourSymbol: 'X',
                    players: result.game.players
                });
                
                // Notify P2
                io.to(p2.socketId).emit('ttt_match_found', { 
                    gameId, 
                    stake, 
                    yourSymbol: 'O',
                     players: result.game.players
                });
                
                console.log(\`✅ TTT Match created & notified: \${gameId}\`);
            } else {
               console.error('Failed to create TTT game:', result.message);
               socket.emit('ttt_error', { message: 'Failed to create match' });
            }
        }
      } catch (err) {
        console.error('Error in TTT matchmaking:', err);
      }
    });
    // ========== END TTT MATCHMAKING ==========
`;

try {
    let serverContent = fs.readFileSync(serverPath, 'utf8');

    // Insert before the generic disconnection logic or after existing TTT socket handlers
    // We recently added TTT handlers ending with // ========== END TIC-TAC-TOE HANDLERS ==========

    const targetString = "// ========== END TIC-TAC-TOE HANDLERS ==========";

    if (serverContent.includes('ttt_find_match')) {
        console.log('TTT matchmaking logic already present.');
    } else if (serverContent.includes(targetString)) {
        serverContent = serverContent.replace(
            targetString,
            `${targetString}\n${matchmakingLogic}`
        );
        fs.writeFileSync(serverPath, serverContent);
        console.log('✅ Injected TTT matchmaking logic.');
    } else {
        console.error('❌ Could not find insertion point (END TIC-TAC-TOE HANDLERS).');

        // Fallback: insert before socket.on('disconnect')
        const fallbackTarget = "socket.on('disconnect', async () => {";
        if (serverContent.includes(fallbackTarget)) {
            serverContent = serverContent.replace(
                fallbackTarget,
                `${matchmakingLogic}\n\n    ${fallbackTarget}`
            );
            fs.writeFileSync(serverPath, serverContent);
            console.log('✅ Injected TTT logic via fallback location.');
        } else {
            console.error('❌ FATAL: Could not find any insertion point.');
        }
    }

} catch (err) {
    console.error('Error updating server.js:', err);
}
