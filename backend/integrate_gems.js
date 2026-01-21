/**
 * GEM FEATURE - AUTO INTEGRATION SCRIPT
 * 
 * This script automatically adds the gems feature to your server.js
 * 
 * HOW TO USE:
 * 1. Make a backup of your server.js first!
 * 2. Run: node backend/integrate_gems.js
 * 3. Restart your server
 */

const fs = require('fs');
const path = require('path');

const SERVER_JS_PATH = path.join(__dirname, 'server.js');
const BACKUP_PATH = path.join(__dirname, 'server.js.backup');

// The socket handler code to insert
const SOCKET_HANDLER = `
  // ===== GEM RE-ROLL SYSTEM =====
  socket.on('use_gem_reroll', async ({ gameId }) => {
    console.log(\`💎 GEM RE-ROLL REQUEST from \${socket.id} for game \${gameId}\`);
    try {
      const userId = socket.data.userId;
      if (!userId) return socket.emit('ERROR', { message: 'Authentication required' });

      const user = await User.findById(userId);
      if (!user) return socket.emit('ERROR', { message: 'User not found' });

      // Check gem balance (1 gem = $0.01)
      const GEM_COST = 1;
      if (user.gems < GEM_COST) {
        return socket.emit('ERROR', { message: 'Insufficient gems. Purchase gems to use re-roll.' });
      }

      const game = await Game.findOne({ gameId });
      if (!game || game.status !== 'ACTIVE') {
        return socket.emit('ERROR', { message: 'Game not found or not active' });
      }

      // Verify it's this player's turn
      const currentPlayer = game.players[game.currentPlayerIndex];
      if (!currentPlayer || String(currentPlayer.userId) !== String(userId)) {
        return socket.emit('ERROR', { message: 'Not your turn' });
      }

      // Check re-roll limit (max 5 per game per player)
      const MAX_REROLLS = 5;
      let rerollCount = 0;
      if (game.rerollsUsed) {
        if (game.rerollsUsed instanceof Map) {
          rerollCount = game.rerollsUsed.get(userId) || 0;
        } else {
          rerollCount = game.rerollsUsed[userId] || 0;
        }
      }

      if (rerollCount >= MAX_REROLLS) {
        return socket.emit('ERROR', { message: \`Maximum \${MAX_REROLLS} re-rolls per game reached\` });
      }

      // Deduct gem from user
      user.gems -= GEM_COST;
      user.transactions.push({
        type: 'gem_usage',
        amount: -GEM_COST,
        matchId: gameId,
        description: \`Used gem for re-roll in game \${gameId}\`,
        createdAt: new Date()
      });
      await user.save();

      // Update re-roll count
      if (!game.rerollsUsed) {
        game.rerollsUsed = new Map();
      }
      if (game.rerollsUsed instanceof Map) {
        game.rerollsUsed.set(userId, rerollCount + 1);
      } else {
        game.rerollsUsed[userId] = rerollCount + 1;
      }

      // Grant re-roll: Reset turn state to ROLLING
      game.turnState = 'ROLLING';
      game.diceValue = null;
      game.legalMoves = [];
      game.message = \`\${currentPlayer.username || currentPlayer.color} used a gem to re-roll! 💎\`;
      game.timer = 7; // Reset timer for roll

      game.markModified('rerollsUsed');
      await game.save();

      console.log(\`✅ Gem re-roll granted to \${userId}. Gems remaining: \${user.gems}, Re-rolls used: \${rerollCount + 1}/\${MAX_REROLLS}\`);

      // Emit updated game state
      const updatedState = game.toObject ? game.toObject() : game;
      io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });

      // Emit gem update to player
      socket.emit('gem_reroll_success', {
        gemsRemaining: user.gems,
        rerollsUsed: rerollCount + 1,
        rerollsRemaining: MAX_REROLLS - (rerollCount + 1)
      });

      // Restart turn timer
      if (!currentPlayer.isAI && !currentPlayer.isDisconnected) {
        scheduleHumanPlayerAutoRoll(gameId);
      }

    } catch (error) {
      console.error('Gem re-roll error:', error);
      socket.emit('ERROR', { message: 'Failed to process gem re-roll' });
    }
  });
`;

// API routes to add
const API_ROUTES = `
// ===== GEMS API ROUTES =====
app.post('/api/admin/deposit-gems', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { userId, gemAmount, comment } = req.body;
    const adminUser = req.user;

    if (!userId || !gemAmount || gemAmount <= 0) {
      return res.status(400).json({ error: 'User ID and valid gem amount required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gemsToAdd = parseInt(gemAmount);
    user.gems += gemsToAdd;

    user.transactions.push({
      type: 'gem_purchase',
      amount: gemsToAdd,
      description: comment || \`Admin \${adminUser.username} deposited \${gemsToAdd} gems\`,
      createdAt: new Date()
    });

    await user.save();

    console.log(\`✅ Admin \${adminUser.username} deposited \${gemsToAdd} gems to \${user.username}\`);

    res.json({
      success: true,
      message: \`Successfully deposited \${gemsToAdd} gems to \${user.username}\`,
      newGemBalance: user.gems
    });

  } catch (error) {
    console.error('Gem deposit error:', error);
    res.status(500).json({ error: 'Failed to deposit gems' });
  }
});

app.get('/api/admin/gems/:userId', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gemTransactions = user.transactions.filter(t =>
      t.type === 'gem_purchase' || t.type === 'gem_usage'
    ).slice(-20);

    res.json({
      username: user.username,
      gems: user.gems,
      transactions: gemTransactions
    });

  } catch (error) {
    console.error('Get gem balance error:', error);
    res.status(500).json({ error: 'Failed to fetch gem data' });
  }
});
`;

function integrateGems() {
    try {
        console.log('🔧 Starting gems feature integration...\n');

        // Create backup
        console.log('📋 Creating backup...');
        const serverContent = fs.readFileSync(SERVER_JS_PATH, 'utf8');
        fs.writeFileSync(BACKUP_PATH, serverContent);
        console.log('✅ Backup created at:', BACKUP_PATH);

        // Check if already integrated
        if (serverContent.includes('use_gem_reroll')) {
            console.log('\n⚠️  Gems socket handler already exists in server.js');
            console.log('Skipping socket handler integration...\n');
        } else {
            // Find insertion point for socket handler
            const socketMarker = "socket.on('send_chat_message'";
            if (!serverContent.includes(socketMarker)) {
                console.error('❌ Could not find socket chat handler. Manual integration required.');
                return false;
            }

            // Find the closing of send_chat_message handler
            const markerIndex = serverContent.indexOf(socketMarker);
            const afterMarker = serverContent.substring(markerIndex);
            const handlerEnd = afterMarker.indexOf('});');

            if (handlerEnd === -1) {
                console.error('❌ Could not find end of chat handler. Manual integration required.');
                return false;
            }

            const insertPoint = markerIndex + handlerEnd + 4; // +4 for '});' and newline

            const newContent =
                serverContent.substring(0, insertPoint) +
                '\n' + SOCKET_HANDLER + '\n' +
                serverContent.substring(insertPoint);

            fs.writeFileSync(SERVER_JS_PATH, newContent);
            console.log('✅ Socket handler integrated!\n');
        }

        // Add API routes
        const updatedContent = fs.readFileSync(SERVER_JS_PATH, 'utf8');

        if (updatedContent.includes('/api/admin/deposit-gems')) {
            console.log('⚠️  Gems API routes already exist in server.js\n');
        } else {
            // Find a good insertion point (after other admin routes)
            const adminRouteMarker = "// --- WALLET & PAYMENT ROUTES ---";
            if (!updatedContent.includes(adminRouteMarker)) {
                console.log('⚠️  Could not find admin routes section. Add API routes manually.\n');
            } else {
                const insertIndex = updatedContent.indexOf(adminRouteMarker);
                const finalContent =
                    updatedContent.substring(0, insertIndex) +
                    API_ROUTES + '\n\n' +
                    updatedContent.substring(insertIndex);

                fs.writeFileSync(SERVER_JS_PATH, finalContent);
                console.log('✅ API routes integrated!\n');
            }
        }

        console.log('🎉 Integration complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Restart your backend server');
        console.log('2. Test gem deposit: POST /api/admin/deposit-gems');
        console.log('3. Test in-game re-roll with socket event: use_gem_reroll');
        console.log('\nIf anything goes wrong, restore from backup:');
        console.log('  cp backend/server.js.backup backend/server.js');

        return true;

    } catch (error) {
        console.error('❌ Integration failed:', error.message);
        console.log('\nRestoring from backup...');
        try {
            if (fs.existsSync(BACKUP_PATH)) {
                fs.copyFileSync(BACKUP_PATH, SERVER_JS_PATH);
                console.log('✅ Backup restored');
            }
        } catch (restoreError) {
            console.error('❌ Restore failed:', restoreError.message);
        }
        return false;
    }
}

// Run the integration
if (require.main === module) {
    integrateGems();
}

module.exports = { integrateGems };
