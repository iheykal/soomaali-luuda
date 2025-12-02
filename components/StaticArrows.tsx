import React from 'react';
import { mainPathCoords } from '../lib/boardLayout';

interface StaticArrowsProps {
    boardSize: number;
    cellSize: number;
}

export const StaticArrows: React.FC<StaticArrowsProps> = ({ boardSize, cellSize }) => {
    const ARROW_SQUARES = [4, 17, 30, 43];
    const toPx = (norm: number) => norm * boardSize;

    return (
        <>
            {ARROW_SQUARES.map(squareIndex => {
                const fromCoord = mainPathCoords[squareIndex];
                const toCoord = mainPathCoords[(squareIndex + 1) % 52];

                // Calculate control point for curved arrow
                const midX = (fromCoord.x + toCoord.x) / 2;
                const midY = (fromCoord.y + toCoord.y) / 2;
                const dx = toCoord.x - fromCoord.x;
                const dy = toCoord.y - fromCoord.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const curvature = 0.25;
                const controlX = midX - (dy / length) * length * curvature;
                const controlY = midY + (dx / length) * length * curvature;

                // Create curved path
                const pathD = `M ${toPx(fromCoord.x)} ${toPx(fromCoord.y)} Q ${toPx(controlX)} ${toPx(controlY)} ${toPx(toCoord.x)} ${toPx(toCoord.y)}`;

                return (
                    <g key={`static-arrow-${squareIndex}`}>
                        <path
                            d={pathD}
                            fill="none"
                            stroke="#666"
                            strokeWidth={cellSize * 0.08}
                            strokeDasharray={`${cellSize * 0.12} ${cellSize * 0.06}`}
                            opacity="0.5"
                            markerEnd="url(#arrowhead-static)"
                        />
                    </g>
                );
            })}
        </>
    );
};

export default StaticArrows;
