
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface AdminDiceControlProps {
    socket: Socket | null;
    gameId: string | null;
}

const AdminDiceControl: React.FC<AdminDiceControlProps> = ({ socket, gameId }) => {
    const [diceValue, setDiceValue] = useState<string>('6');
    const [targetColor, setTargetColor] = useState<string>('green'); // Default target
    const [isVisible, setIsVisible] = useState(false);

    if (!socket || !gameId) return null;

    const handleForceRoll = () => {
        if (!socket) return;
        const value = parseInt(diceValue);
        if (isNaN(value) || value < 1 || value > 6) {
            alert('Invalid dice value');
            return;
        }

        console.log(`👮 FORCE ROLL: Setting next roll to ${value} for game ${gameId}`);
        socket.emit('admin_force_roll', {
            gameId,
            targetColor, // Target by color for now, easier than ID
            diceValue: value
        });
    };

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 left-4 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100"
            >
                Admin
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 left-4 z-50 bg-slate-900 border border-slate-700 p-4 rounded-lg shadow-2xl text-white w-64">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-sm text-yellow-500">🎲 God Mode</h3>
                <button onClick={() => setIsVisible(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Target Player Color</label>
                    <select
                        value={targetColor}
                        onChange={(e) => setTargetColor(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                    >
                        <option value="green">Green</option>
                        <option value="yellow">Yellow</option>
                        <option value="blue">Blue</option>
                        <option value="red">Red</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Force Next Roll</label>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5, 6].map(num => (
                            <button
                                key={num}
                                onClick={() => setDiceValue(num.toString())}
                                className={`flex-1 aspect-square flex items-center justify-center rounded border ${diceValue === num.toString()
                                        ? 'bg-yellow-600 border-yellow-400 text-white'
                                        : 'bg-slate-800 border-slate-600 hover:bg-slate-700'
                                    }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleForceRoll}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded text-sm transition-colors"
                >
                    FORCE ROLL {diceValue}
                </button>
            </div>
        </div>
    );
};

export default AdminDiceControl;
