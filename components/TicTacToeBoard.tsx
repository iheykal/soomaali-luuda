import React from 'react';
import type { TicTacToeState } from '../types';
import MorrisBoard from './MorrisBoard';

interface TicTacToeBoardProps {
    gameState: TicTacToeState;
    onCellClick: (row: number, col: number) => void;
    isMyTurn: boolean;
    mySymbol: 'X' | 'O';
    onExit: () => void;
    onRematch?: () => void;
    rematchRequested?: boolean;
    opponentRematchRequested?: boolean;
    ticTacToeLogic: {
        timeLeft: number;
        error: string | null;
    };
}

const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
    gameState,
    onCellClick,
    isMyTurn,
    mySymbol,
    onExit,
    onRematch,
    rematchRequested = false,
    opponentRematchRequested = false
}) => {
    const { board, turnState, winner, winningLine, message, stake, gamePhase, piecesPlaced, selectedPiece } = gameState;

    const opponent = gameState.players.find(p => p.symbol !== mySymbol);
    const myPlayer = gameState.players.find(p => p.symbol === mySymbol);

    // Calculate payout
    const safeStake = stake || 0.05;
    const totalPot = safeStake * 2;
    const commission = totalPot * 0.10;
    const winnerPayout = totalPot - commission;

    const [showGameOverModal, setShowGameOverModal] = React.useState(false);

    // Delay game over modal to allow user to see the winning line
    React.useEffect(() => {
        if (turnState === 'GAMEOVER') {
            const timer = setTimeout(() => {
                setShowGameOverModal(true);
            }, 1500); // 1.5 second delay
            return () => clearTimeout(timer);
        } else {
            setShowGameOverModal(false);
        }
    }, [turnState]);

    return (
        <div className="min-h-screen bg-slate-800 flex flex-col p-4">
            {/* Exit Button */}
            <div className="absolute top-4 right-4 z-20">
                <button
                    onClick={onExit}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition shadow-lg font-bold"
                >
                    Exit Game
                </button>
            </div>

            {/* Prize Display */}
            {stake > 0 && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-4 py-2 rounded-full shadow-xl border border-yellow-300">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🏆</span>
                            <div className="text-center">
                                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">Prize</div>
                                <div className="text-lg font-bold">${winnerPayout.toFixed(2)}</div>
                            </div>
                            <span className="text-lg">💰</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
                {/* Game Status */}
                <div className="mb-8 text-center">
                    {/* Phase Indicator */}
                    {turnState !== 'GAMEOVER' && (
                        <div className="mb-4">
                            {gamePhase === 'PLACEMENT' ? (
                                <div className="inline-block bg-cyan-500/20 border border-cyan-500/50 rounded-lg px-4 py-2">
                                    <p className="text-cyan-300 font-bold text-sm">
                                        📍 Placement Phase ({(piecesPlaced?.X || 0) + (piecesPlaced?.O || 0)}/6)
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Place your 3 pieces</p>
                                </div>
                            ) : (
                                <div className="inline-block bg-purple-500/20 border border-purple-500/50 rounded-lg px-4 py-2">
                                    <p className="text-purple-300 font-bold text-sm">
                                        🔄 Movement Phase
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {selectedPiece ? 'Click adjacent cell to move' : 'Select a piece to move'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {turnState === 'GAMEOVER' ? (
                        <>
                            {winner === 'DRAW' ? (
                                <h2 className="text-4xl font-bold text-white mb-2">🤝 Draw!</h2>
                            ) : winner === myPlayer?.userId ? (
                                <h2 className="text-4xl font-bold text-green-400 mb-2">🎉 You Win!</h2>
                            ) : (
                                <h2 className="text-4xl font-bold text-red-400 mb-2">😔 You Lose</h2>
                            )}
                            <p className="text-lg text-slate-300">{message}</p>
                        </>
                    ) : (
                        <>
                            <h2 className="text-3xl font-bold text-white mb-2">
                                {isMyTurn ? '🎯 Your Turn' : '⏳ Opponent\'s Turn'}
                            </h2>
                            <p className="text-lg text-slate-300">
                                You are <span className={`font-bold text-2xl ${mySymbol === 'X' ? 'text-blue-400' : 'text-red-400'}`}>{mySymbol}</span>
                            </p>
                            {opponent && (
                                <p className="text-sm text-slate-400 mt-2">
                                    Playing against {opponent.username}
                                    {opponent.isDisconnected && <span className="text-yellow-400 ml-2">🤖 (Bot)</span>}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Morris Board */}
                <MorrisBoard
                    board={board}
                    selectedPiece={selectedPiece}
                    onCellClick={onCellClick}
                    isMyTurn={isMyTurn}
                    mySymbol={mySymbol}
                    gamePhase={gamePhase || 'PLACEMENT'}
                    winningLine={winningLine}
                />

                {/* Game Info */}
                <div className="mt-8 text-center">
                    <div className="bg-slate-700 rounded-lg p-4 inline-block">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <div className="text-xs text-slate-400 uppercase">Your Symbol</div>
                                <div className={`text-3xl font-bold ${mySymbol === 'X' ? 'text-blue-400' : 'text-red-400'}`}>
                                    {mySymbol}
                                </div>
                            </div>
                            <div className="w-px h-12 bg-slate-600"></div>
                            <div className="text-center">
                                <div className="text-xs text-slate-400 uppercase">Stake</div>
                                <div className="text-2xl font-bold text-white">${(stake || 0.05).toFixed(2)}</div>
                            </div>
                            <div className="w-px h-12 bg-slate-600"></div>
                            <div className="text-center">
                                <div className="text-xs text-slate-400 uppercase">Win Prize</div>
                                <div className="text-2xl font-bold text-green-400">${winnerPayout.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Game Over Overlay with Rematch */}
            {showGameOverModal && onRematch && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn">
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl border-2 border-slate-600 p-8 max-w-md w-full text-center">
                        {winner === 'DRAW' ? (
                            <>
                                <div className="text-6xl mb-4">🤝</div>
                                <h2 className="text-3xl font-bold text-white mb-2">Draw!</h2>
                                <p className="text-slate-300 mb-6">Good match! Your stake has been refunded.</p>
                            </>
                        ) : winner === myPlayer?.userId ? (
                            <>
                                <div className="text-6xl mb-4 animate-bounce">🎉</div>
                                <h2 className="text-3xl font-bold text-green-400 mb-2">You Win!</h2>
                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
                                    <p className="text-sm text-slate-300 mb-1">You earned</p>
                                    <p className="text-4xl font-black text-green-400">${winnerPayout.toFixed(2)}</p>
                                    <p className="text-xs text-slate-400 mt-1">Net profit: ${(winnerPayout - safeStake).toFixed(2)}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-6xl mb-4">😔</div>
                                <h2 className="text-3xl font-bold text-red-400 mb-2">You Lose</h2>
                                <p className="text-slate-300 mb-6">Better luck next time!</p>
                            </>
                        )}

                        {/* Rematch Buttons */}
                        <div className="flex gap-3">
                            {rematchRequested && !opponentRematchRequested ? (
                                <div className="w-full bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                                    <div className="animate-pulse">
                                        <p className="text-cyan-400 font-bold mb-2">⏳ Waiting for opponent...</p>
                                        <p className="text-xs text-slate-400">Rematch request sent</p>
                                    </div>
                                </div>
                            ) : opponentRematchRequested && !rematchRequested ? (
                                <button
                                    onClick={onRematch}
                                    className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg"
                                >
                                    <span className="text-lg">🔄 Accept Rematch</span>
                                </button>
                            ) : !rematchRequested ? (
                                <button
                                    onClick={onRematch}
                                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg"
                                >
                                    <span className="text-lg">🔄 Rematch</span>
                                </button>
                            ) : null}

                            <button
                                onClick={onExit}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105"
                            >
                                <span className="text-lg">🚪 Exit</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS for animations */}
            <style>{`
        @keyframes pulse-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .animate-pulse-once {
          animation: pulse-once 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
      `}</style>
        </div>
    );
};

export default TicTacToeBoard;
