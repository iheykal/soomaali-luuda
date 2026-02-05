import React from 'react';

interface MorrisBoardProps {
    board: string[][];
    selectedPiece: [number, number] | null;
    onCellClick: (row: number, col: number) => void;
    isMyTurn: boolean;
    mySymbol: 'X' | 'O';
    gamePhase: 'PLACEMENT' | 'MOVEMENT';
    winningLine: number[][] | null;
}

const MorrisBoard: React.FC<MorrisBoardProps> = ({
    board,
    selectedPiece,
    onCellClick,
    isMyTurn,
    mySymbol,
    gamePhase,
    winningLine
}) => {
    // Position mapping for 3x3 grid to SVG coordinates
    const positions = [
        { row: 0, col: 0, x: 80, y: 80 },   // Top-left
        { row: 0, col: 1, x: 300, y: 80 },  // Top-center
        { row: 0, col: 2, x: 520, y: 80 },  // Top-right
        { row: 1, col: 0, x: 80, y: 300 },  // Middle-left
        { row: 1, col: 1, x: 300, y: 300 }, // Center
        { row: 1, col: 2, x: 520, y: 300 }, // Middle-right
        { row: 2, col: 0, x: 80, y: 520 },  // Bottom-left
        { row: 2, col: 1, x: 300, y: 520 }, // Bottom-center
        { row: 2, col: 2, x: 520, y: 520 }  // Bottom-right
    ];

    const isWinningCell = (row: number, col: number) => {
        if (!winningLine) return false;
        return winningLine.some(([r, c]) => r === row && c === col);
    };

    const isAdjacent = (from: [number, number], to: [number, number]) => {
        const [r1, c1] = from;
        const [r2, c2] = to;

        // Horizontal/vertical adjacent
        if (r1 === r2 && Math.abs(c1 - c2) === 1) return true;
        if (c1 === c2 && Math.abs(r1 - r2) === 1) return true;

        // Diagonal through center
        if (r1 === 1 && c1 === 1) {
            if ((r2 === 0 || r2 === 2) && (c2 === 0 || c2 === 2)) return true;
        }
        if (r2 === 1 && c2 === 1) {
            if ((r1 === 0 || r1 === 2) && (c1 === 0 || c1 === 2)) return true;
        }

        return false;
    };

    const handleCellClick = (row: number, col: number) => {
        // Play sound effect
        try {
            const audio = new Audio('/audio/sfx_click.mp3');
            audio.volume = 0.3; // 30% volume
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            console.log('Audio error:', error);
        }

        onCellClick(row, col);
    };

    return (
        <div className="flex items-center justify-center">
            <svg width="600" height="600" viewBox="0 0 600 600" className="max-w-full h-auto">
                {/* Background */}
                <rect width="600" height="600" fill="#2C3E50" rx="20" />

                {/* Connection Lines */}
                <g stroke="#ECF0F1" strokeWidth="4" strokeLinecap="round">
                    {/* Horizontal lines */}
                    <line x1="80" y1="80" x2="520" y2="80" />
                    <line x1="80" y1="300" x2="520" y2="300" />
                    <line x1="80" y1="520" x2="520" y2="520" />

                    {/* Vertical lines */}
                    <line x1="80" y1="80" x2="80" y2="520" />
                    <line x1="300" y1="80" x2="300" y2="520" />
                    <line x1="520" y1="80" x2="520" y2="520" />

                    {/* Diagonal lines through center */}
                    <line x1="80" y1="80" x2="300" y2="300" opacity="0.7" />
                    <line x1="300" y1="300" x2="520" y2="520" opacity="0.7" />
                    <line x1="520" y1="80" x2="300" y2="300" opacity="0.7" />
                    <line x1="300" y1="300" x2="80" y2="520" opacity="0.7" />
                </g>

                {/* Winning Line Visualization */}
                {winningLine && winningLine.length >= 2 && (() => {
                    const points = winningLine
                        .map(([r, c]) => positions.find(p => p.row === r && p.col === c))
                        .filter((p): p is typeof positions[0] => !!p);

                    if (points.length < 2) return null;

                    // Determine extremities for line drawing
                    // We need to handle the diagonal (0,2)-(2,0) specially if we want consistent direction?
                    // But drawing start->end based on sorted coords works for all cases.
                    points.sort((a, b) => (a.row - b.row) || (a.col - b.col));

                    // Allow drawing in reverse for the back-diagonal to make it look nicer? 
                    // (0,2) -> (2,0) is fine.

                    const start = points[0];
                    const end = points[points.length - 1];

                    // Extend the line slightly beyond the pieces
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const extend = 40; // Extend by 40px

                    const x1 = start.x - (dx / length) * extend;
                    const y1 = start.y - (dy / length) * extend;
                    const x2 = end.x + (dx / length) * extend;
                    const y2 = end.y + (dy / length) * extend;

                    return (
                        <g className="animate-pulse">
                            <defs>
                                <marker
                                    id="arrowhead"
                                    markerWidth="10"
                                    markerHeight="7"
                                    refX="9"
                                    refY="3.5"
                                    orient="auto"
                                >
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#F1C40F" />
                                </marker>
                            </defs>
                            <line
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke="#F1C40F"
                                strokeWidth="8"
                                strokeLinecap="round"
                                markerEnd="url(#arrowhead)"
                                filter="drop-shadow(0 0 5px rgba(241, 196, 15, 0.5))"
                            />
                        </g>
                    );
                })()}

                {/* Position Circles and Pieces */}
                {positions.map((pos) => {
                    const piece = board[pos.row][pos.col];
                    const isMyPiece = piece === mySymbol;
                    const isSelected = selectedPiece && selectedPiece[0] === pos.row && selectedPiece[1] === pos.col;
                    const isWinning = isWinningCell(pos.row, pos.col);

                    // Check if this is a valid move for the selected piece
                    const isValidMove = selectedPiece && !piece &&
                        gamePhase === 'MOVEMENT' &&
                        isAdjacent(selectedPiece, [pos.row, pos.col]);

                    // Check if this piece has any valid moves (can be moved)
                    const hasValidMoves = isMyPiece && gamePhase === 'MOVEMENT' &&
                        positions.some(p =>
                            board[p.row][p.col] === '' &&
                            isAdjacent([pos.row, pos.col], [p.row, p.col])
                        );

                    const canClick = isMyTurn && (
                        (gamePhase === 'PLACEMENT' && !piece) || // Can place in empty
                        (gamePhase === 'MOVEMENT' && isMyPiece && hasValidMoves) || // Can select pieces with valid moves
                        (gamePhase === 'MOVEMENT' && isValidMove) // Can move to valid spot
                    );

                    return (
                        <g
                            key={`${pos.row}-${pos.col}`}
                            onClick={() => canClick && handleCellClick(pos.row, pos.col)}
                            className={canClick ? 'cursor-pointer' : ''}
                            style={{ touchAction: 'manipulation' }}
                        >
                            {/* Base circle (position marker) */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r="35"
                                fill={isValidMove ? '#27AE60' : '#34495E'}
                                stroke={isValidMove ? '#2ECC71' : '#7F8C8D'}
                                strokeWidth={isValidMove ? '4' : '3'}
                                className={isValidMove ? 'animate-pulse' : ''}
                            />

                            {/* Piece */}
                            {piece && (
                                <>
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r="30"
                                        fill={piece === 'X' ? '#3498DB' : '#E74C3C'}
                                        stroke={isWinning ? '#F1C40F' : isSelected ? '#F39C12' : '#2C3E50'}
                                        strokeWidth={isWinning || isSelected ? '5' : '2'}
                                        className={isSelected ? 'animate-pulse' : isMyPiece && isMyTurn && hasValidMoves ? 'animate-pulse' : ''}
                                        style={{
                                            animationDuration: isMyPiece && isMyTurn && !isSelected && hasValidMoves ? '0.5s' : '1s'
                                        }}
                                    />
                                    <text
                                        x={pos.x}
                                        y={pos.y}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill="white"
                                        fontSize="32"
                                        fontWeight="bold"
                                        pointerEvents="none"
                                        style={{ userSelect: 'none' }}
                                    >
                                        {piece}
                                    </text>
                                </>
                            )}

                            {/* Hover effect for clickable spots */}
                            {canClick && (
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r="35"
                                    fill="white"
                                    opacity="0"
                                    className="hover:opacity-10 transition-opacity"
                                    pointerEvents="all"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default MorrisBoard;
