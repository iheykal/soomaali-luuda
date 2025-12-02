import React, { useEffect, useState } from 'react';
import { getTokenPositionCoords } from '../lib/boardLayout';

interface ArrowsAnimationProps {
    fromSquareIndex: number;
    toSquareIndex: number;
    color: string;
    boardSize: number;
}

export const ArrowsAnimation: React.FC<ArrowsAnimationProps> = ({
    fromSquareIndex,
    toSquareIndex,
    color,
    boardSize
}) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Auto-hide after 2 seconds
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    if (!isVisible) return null;

    // Get coordinates for the squares
    const fromPosition: { type: 'PATH'; index: number } = { type: 'PATH', index: fromSquareIndex };
    const toPosition: { type: 'PATH'; index: number } = { type: 'PATH', index: toSquareIndex };
    const fromCoords = getTokenPositionCoords({ color: 'red', position: fromPosition });
    const toCoords = getTokenPositionCoords({ color: 'red', position: toPosition });

    // Calculate control point for curved arrow (simple arc)
    const midX = (fromCoords[0] + toCoords[0]) / 2;
    const midY = (fromCoords[1] + toCoords[1]) / 2;

    // Offset for curve (perpendicular to the line between points)
    const dx = toCoords[0] - fromCoords[0];
    const dy = toCoords[1] - fromCoords[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const curvature = 0.15; // Adjust curve strength
    const controlX = midX - (dy / length) * length * curvature;
    const controlY = midY + (dx / length) * length * curvature;

    // Create path for curved arrow
    const pathD = `M ${fromCoords[0] * boardSize} ${fromCoords[1] * boardSize} Q ${controlX * boardSize} ${controlY * boardSize} ${toCoords[0] * boardSize} ${toCoords[1] * boardSize}`;

    // Calculate arrow head angle
    const angle = Math.atan2(toCoords[1] - controlY, toCoords[0] - controlX) * (180 / Math.PI);

    return (
        <g className="arrows-animation">
            <defs>
                <marker
                    id={`arrowhead-${fromSquareIndex}`}
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <polygon
                        points="0 0, 10 3, 0 6"
                        fill={color}
                        opacity="0.9"
                    />
                </marker>
            </defs>

            {/* Animated curved arrow path */}
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={boardSize * 0.015}
                strokeLinecap="round"
                markerEnd={`url(#arrowhead-${fromSquareIndex})`}
                opacity="0.9"
                style={{
                    animation: 'arrowFadeInOut 2s ease-in-out',
                    strokeDasharray: '1000',
                    strokeDashoffset: '1000',
                }}
            />

            {/* Arrow animation styles */}
            <style>
                {`
                    @keyframes arrowFadeInOut {
                        0% {
                            opacity: 0;
                            stroke-dashoffset: 1000;
                        }
                        20% {
                            opacity: 0.9;
                            stroke-dashoffset: 0;
                        }
                        80% {
                            opacity: 0.9;
                            stroke-dashoffset: 0;
                        }
                        100% {
                            opacity: 0;
                            stroke-dashoffset: 0;
                        }
                    }
                `}
            </style>
        </g>
    );
};

export default ArrowsAnimation;
