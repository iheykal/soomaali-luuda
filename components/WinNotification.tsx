import React, { useEffect, useState } from 'react';

interface WinNotificationProps {
    playerName: string;
    grossWin: number;
    netAmount: number;
    platformFee: number;
    onClose: () => void;
    onNavigateToWallet: () => void;
}

const WinNotification: React.FC<WinNotificationProps> = ({
    playerName,
    grossWin,
    netAmount,
    platformFee,
    onClose,
    onNavigateToWallet,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        // Trigger slide-in animation
        setTimeout(() => setIsVisible(true), 10);

        // Auto-dismiss after 10 seconds
        const timer = setTimeout(() => {
            handleClose();
        }, 10000);

        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => {
            onClose();
        }, 300); // Match animation duration
    };

    const handleWalletClick = () => {
        handleClose();
        setTimeout(() => {
            onNavigateToWallet();
        }, 350);
    };

    return (
        <div
            className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] transition-all duration-300 ${isVisible && !isExiting
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-full opacity-0'
                }`}
            style={{ maxWidth: '90%', width: '400px' }}
        >
            <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white rounded-2xl shadow-2xl border-4 border-yellow-400 overflow-hidden animate-bounce-subtle">
                {/* Header with celebration */}
                <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-green-900 px-6 py-3 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-20 animate-pulse" />
                    <h3 className="text-2xl font-bold relative z-10 flex items-center justify-center gap-2">
                        <span className="animate-bounce">🎉</span>
                        <span>Hambalyo!</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>🎉</span>
                    </h3>
                </div>

                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute top-2 right-2 w-8 h-8 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all text-white font-bold z-20"
                    aria-label="Close notification"
                >
                    ✕
                </button>

                {/* Main content */}
                <div className="px-6 py-4 space-y-3">
                    {/* Winner name and gross amount */}
                    <div className="text-center">
                        <p className="text-lg font-semibold mb-1">
                            <span className="text-yellow-300">✨ {playerName}</span> waxaad ku guuleysatay
                        </p>
                        <p className="text-3xl font-bold text-yellow-300 drop-shadow-lg">
                            ${grossWin.toFixed(2)} Dollar
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="border-t-2 border-dashed border-white opacity-40 my-2" />

                    {/* Net amount after platform fee */}
                    <div className="bg-white bg-opacity-10 rounded-lg px-4 py-3 backdrop-blur-sm">
                        <p className="text-sm text-green-100 mb-1">Lacag la'aan:</p>
                        <div className="flex items-baseline justify-between">
                            <p className="text-2xl font-bold text-white">
                                ${netAmount.toFixed(2)}
                            </p>
                            <p className="text-xs text-green-200">
                                (10% platform fee: ${platformFee.toFixed(2)})
                            </p>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t-2 border-dashed border-white opacity-40 my-2" />

                    {/* Action button */}
                    <button
                        onClick={handleWalletClick}
                        className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-green-900 font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center gap-2 group"
                    >
                        <span>Tag si aad lacagta uga bixato</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>

                {/* Celebration confetti effect */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-0 left-1/4 w-2 h-2 bg-yellow-300 rounded-full animate-confetti" style={{ animationDelay: '0s' }} />
                    <div className="absolute top-0 left-1/2 w-2 h-2 bg-yellow-400 rounded-full animate-confetti" style={{ animationDelay: '0.2s' }} />
                    <div className="absolute top-0 left-3/4 w-2 h-2 bg-yellow-300 rounded-full animate-confetti" style={{ animationDelay: '0.4s' }} />
                </div>
            </div>

            <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        @keyframes confetti {
          0% { 
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% { 
            transform: translateY(400px) rotate(720deg);
            opacity: 0;
          }
        }
        
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
        
        .animate-confetti {
          animation: confetti 3s ease-out infinite;
        }
      `}</style>
        </div>
    );
};

export default WinNotification;
