
import { GoogleGenAI, Type } from "@google/genai";
import type { GameState, LegalMove } from "../types";

const PROMPT_TEMPLATE = `
You are an expert Ludo player AI. Your goal is to win the game by making the most strategic move.

Here is the current state of the game:
- Current Player: {currentPlayerColor}
- Dice Roll: {diceValue}
- All Token Positions: {tokenPositions}
- Your Legal Moves (token ID and its destination): {legalMoves}

Game Rules and Strategy to consider:
1.  **FINISH**: If a move gets a token to the final HOME spot, it's almost always the best move.
2.  **CAPTURE**: Capturing an opponent's token is a top priority. It sends them back and gives you an extra roll.
3.  **GET OUT**: Getting tokens out of the yard onto the starting square (requires a 6) is crucial early on.
4.  **ADVANCE**: Move tokens that are further along the path closer to home.
5.  **SAFE PLAY**: Prefer moves that land on a "star" safe square. Avoid leaving a token vulnerable if other options exist.
6.  **BLOCKADE**: Forming a blockade with two of your tokens on the same square is a powerful defensive move.

Based on the game state and these strategies, choose the single best move from the list of legal moves.
Your response must be one of the provided legal move objects.
`;

export async function getAIMove(gameState: GameState): Promise<LegalMove | null> {
    const { legalMoves } = gameState;
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set. AI will make a random move.");
        return legalMoves.length > 0 ? legalMoves[Math.floor(Math.random() * legalMoves.length)] : null;
    }

    if (legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const tokenPositions = gameState.tokens.map(t => `Token ${t.id} (${t.color}): ${JSON.stringify(t.position)}`).join('\n');
    
    const prompt = PROMPT_TEMPLATE
        .replace('{currentPlayerColor}', currentPlayer.color)
        .replace('{diceValue}', String(gameState.diceValue))
        .replace('{tokenPositions}', tokenPositions)
        .replace('{legalMoves}', JSON.stringify(legalMoves, null, 2));

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        bestMove: {
                            type: Type.OBJECT,
                            description: "The best LegalMove object to execute, chosen from the provided list.",
                            properties: {
                                tokenId: { type: Type.STRING },
                                finalPosition: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: { type: Type.STRING },
                                        index: { type: Type.NUMBER }
                                    },
                                    // Fix: Make index optional by only requiring type, as 'HOME' position has no index.
                                    required: ['type']
                                }
                            },
                            // Fix: Ensure the core properties of the best move are always returned.
                            required: ['tokenId', 'finalPosition']
                        },
                        reasoning: {
                            type: Type.STRING,
                            description: "A brief explanation for choosing this move.",
                        },
                    },
                    required: ["bestMove", "reasoning"],
                },
            },
        });
        
        const jsonResponse = JSON.parse(response.text);
        const bestMove = jsonResponse.bestMove as LegalMove;
        console.log(`AI chose move for token ${bestMove.tokenId}. Reason: ${jsonResponse.reasoning}`);

        // Validate that the AI's choice is actually a legal move
        const chosenMove = legalMoves.find(m => m.tokenId === bestMove.tokenId);
        
        return chosenMove || legalMoves[Math.floor(Math.random() * legalMoves.length)];

    } catch (error) {
        console.error("Error fetching AI move from Gemini:", error);
        // Fallback to a random move in case of API error
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
}