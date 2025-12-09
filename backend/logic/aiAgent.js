
class AIAgent {
    /**
     * Chooses the best move for the AI given the current game state and legal moves.
     * @param {object} game - The current game state from the database.
     * @param {Array<object>} legalMoves - An array of legal moves for the current player.
     * @returns {object} The chosen move from the legalMoves array.
     */
    chooseMove(game, legalMoves) {
        if (!legalMoves || legalMoves.length === 0) {
            return null;
        }

        let bestMove = legalMoves[0];
        const currentPlayer = game.players[game.currentPlayerIndex];

        // 1. Prioritize winning the game
        const winningMove = legalMoves.find(move => move.finalPosition.type === 'HOME');
        if (winningMove) {
            console.log(`🤖 AI: Choosing winning move to HOME for token ${winningMove.tokenId}`);
            return winningMove;
        }

        // 2. Prioritize capturing an opponent's token
        const captureMove = legalMoves.find(move => {
            if (move.finalPosition.type === 'PATH' && !this.isSafeSquare(move.finalPosition.index)) {
                const isOccupiedByOpponent = game.tokens.some(t =>
                    t.color !== currentPlayer.color &&
                    t.position.type === 'PATH' &&
                    t.position.index === move.finalPosition.index
                );
                return isOccupiedByOpponent;
            }
            return false;
        });

        if (captureMove) {
            console.log(`🤖 AI: Choosing capture move for token ${captureMove.tokenId}`);
            return captureMove;
        }

        // 3. Simple heuristic: move the token that is furthest along the path
        let furthestMove = bestMove;
        let maxDistance = -1;

        for (const move of legalMoves) {
            const token = game.tokens.find(t => t.id === move.tokenId);
            if (token && token.position.type === 'PATH') {
                if (token.position.index > maxDistance) {
                    maxDistance = token.position.index;
                    furthestMove = move;
                }
            }
        }
        
        console.log(`🤖 AI: Choosing to move furthest token: ${furthestMove.tokenId}`);
        return furthestMove;
    }

    /**
     * Checks if a square is a safe square.
     * @param {number} index - The index of the square on the path.
     * @returns {boolean} True if the square is safe, false otherwise.
     */
    isSafeSquare(index) {
        const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
        return SAFE_SQUARES.includes(index);
    }
}

module.exports = new AIAgent();
