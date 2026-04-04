import React, { useEffect, useState } from 'react';

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
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ backdropFilter: visible ? 'none' : 'none' }}
    >
      {/* Overlay tap-to-dismiss */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 400);
        }}
      />

      {/* Toast Card */}
      <div
        className="relative pointer-events-auto mx-4 w-full max-w-sm"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(-40px) scale(0.92)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        }}
      >
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-3xl blur-xl opacity-60"
          style={{
            background: isDeposit
              ? 'radial-gradient(ellipse at center, #22c55e 0%, transparent 70%)'
              : 'radial-gradient(ellipse at center, #ef4444 0%, transparent 70%)',
          }}
        />

        <div
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: isDeposit
              ? 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #052e16 100%)'
              : 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #450a0a 100%)',
            border: isDeposit ? '1px solid #22c55e40' : '1px solid #ef444440',
          }}
        >
          {/* Top accent bar */}
          <div
            className="h-1 w-full"
            style={{
              background: isDeposit
                ? 'linear-gradient(90deg, transparent, #22c55e, #4ade80, #22c55e, transparent)'
                : 'linear-gradient(90deg, transparent, #ef4444, #f87171, #ef4444, transparent)',
            }}
          />

          <div className="p-6 text-center">
            {/* Icon */}
            <div
              className="mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{
                background: isDeposit
                  ? 'radial-gradient(circle, #166534, #052e16)'
                  : 'radial-gradient(circle, #991b1b, #450a0a)',
                boxShadow: isDeposit
                  ? '0 0 30px #22c55e60, inset 0 1px 1px #4ade8040'
                  : '0 0 30px #ef444460, inset 0 1px 1px #f8717140',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            >
              {isDeposit ? '💸' : '💳'}
            </div>

            {/* Title */}
            <p
              className="text-xs font-black uppercase tracking-[0.3em] mb-1"
              style={{ color: isDeposit ? '#4ade80' : '#f87171' }}
            >
              {isDeposit ? 'Lacag La Soo Geliyey' : 'Lacag La Raaray'}
            </p>

            {/* Amount */}
            <div
              className="text-5xl font-black mb-1 tabular-nums"
              style={{
                color: '#ffffff',
                textShadow: isDeposit ? '0 0 20px #22c55e' : '0 0 20px #ef4444',
                letterSpacing: '-0.02em',
              }}
            >
              {isDeposit ? '+' : '-'}${amount.toFixed(2)}
            </div>

            {/* Message */}
            <p className="text-white/70 text-sm mb-4 font-medium">
              {message}
            </p>

            {/* New balance */}
            <div
              className="mx-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <span>💰</span>
              <span>Haraagii: <span className="text-white font-black">${newBalance.toFixed(2)}</span></span>
            </div>

            {/* Dismiss hint */}
            <p className="text-white/30 text-xs mt-4 font-medium">Taabo si aad u xirto</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: ${isDeposit ? '0 0 30px #22c55e60' : '0 0 30px #ef444460'}; }
          50% { transform: scale(1.05); box-shadow: ${isDeposit ? '0 0 50px #22c55e80' : '0 0 50px #ef444480'}; }
        }
      `}</style>
    </div>
  );
};

export default DepositToast;
