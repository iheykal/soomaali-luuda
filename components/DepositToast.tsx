import React, { useEffect, useState } from 'react';
import { audioService } from '../services/audioService';

interface DepositToastProps {
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  newBalance: number;
  message: string;
  onClose: () => void;
}

const DepositToast: React.FC<DepositToastProps> = ({ amount, type, newBalance, message, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Play sound immediately when component mounts
    try {
      audioService.play('win'); // The win sound is a nice positive chime
    } catch (e) {
      console.warn('Could not play toast audio:', e);
    }

    // Animate in
    const showTimer = setTimeout(() => setVisible(true), 50);
    // Auto-dismiss after 6 seconds
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 400); // wait for fade-out
    }, 6000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [onClose]);

  const isDeposit = type === 'DEPOSIT';

  return (
    <div
      className="fixed top-0 left-0 right-0 flex justify-center pointer-events-none p-4 sm:p-6"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', zIndex: 999999 }}
    >
      {/* Toast Banner */}
      <div
        className="relative pointer-events-auto w-full max-w-md flex items-center gap-4 p-4 rounded-2xl shadow-2xl cursor-pointer"
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 400);
        }}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(-150%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
          background: isDeposit
            ? 'linear-gradient(135deg, rgba(20, 83, 45, 0.95) 0%, rgba(5, 46, 22, 0.98) 100%)'
            : 'linear-gradient(135deg, rgba(127, 29, 29, 0.95) 0%, rgba(69, 10, 10, 0.98) 100%)',
          border: isDeposit ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Glow effect under the banner */}
        <div
          className="absolute inset-0 rounded-2xl blur-lg opacity-40 z-[-1]"
          style={{
            background: isDeposit ? '#22c55e' : '#ef4444',
          }}
        />

        {/* Icon */}
        <div
          className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
          style={{
            background: isDeposit
              ? 'radial-gradient(circle, #166534, #052e16)'
              : 'radial-gradient(circle, #991b1b, #450a0a)',
            boxShadow: isDeposit
              ? '0 0 15px rgba(34, 197, 94, 0.5), inset 0 1px 1px rgba(74, 222, 128, 0.4)'
              : '0 0 15px rgba(239, 68, 68, 0.5), inset 0 1px 1px rgba(248, 113, 113, 0.4)',
            animation: 'pulse-icon 2s infinite',
          }}
        >
          {isDeposit ? '💸' : '💳'}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] sm:text-xs font-black uppercase tracking-wider mb-0.5 truncate"
            style={{ color: isDeposit ? '#4ade80' : '#f87171' }}
          >
            {isDeposit ? 'Lacag La Soo Geliyey' : 'Lacag La Raaray'}
          </p>
          <div className="flex items-baseline gap-2 truncate">
            <span
              className="text-xl sm:text-2xl font-black tabular-nums"
              style={{
                color: '#ffffff',
                textShadow: isDeposit ? '0 0 10px rgba(34, 197, 94, 0.5)' : '0 0 10px rgba(239, 68, 68, 0.5)',
              }}
            >
              {isDeposit ? '+' : '-'}${amount.toFixed(2)}
            </span>
          </div>
          <p className="text-white/70 text-xs font-medium truncate mt-0.5">
            {message}
          </p>
        </div>

        {/* Balance Badge */}
        <div
          className="flex-shrink-0 flex flex-col items-end justify-center px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-0.5">Haraagii</span>
          <span className="text-sm font-black text-white tabular-nums">${newBalance.toFixed(2)}</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-icon {
          0%, 100% { transform: scale(1); box-shadow: ${isDeposit ? '0 0 15px rgba(34, 197, 94, 0.5)' : '0 0 15px rgba(239, 68, 68, 0.5)'}; }
          50% { transform: scale(1.05); box-shadow: ${isDeposit ? '0 0 25px rgba(34, 197, 94, 0.8)' : '0 0 25px rgba(239, 68, 68, 0.8)'}; }
        }
      `}</style>
    </div>
  );
};

export default DepositToast;
