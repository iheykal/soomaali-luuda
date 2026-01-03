import React from 'react';

interface SlidingNotificationProps {
    text: string;
    bgColor?: string;
    textColor?: string;
    speed?: number; // Duration in seconds
    className?: string;
}

const SlidingNotification: React.FC<SlidingNotificationProps> = ({
    text,
    bgColor = 'bg-red-500/10',
    textColor = 'text-white/90',
    speed = 30,
    className = ''
}) => {
    return (
        <div className={`w-full ${bgColor} border-y border-white/10 py-3 overflow-hidden backdrop-blur-md relative ${className}`}>
            <div className="flex overflow-hidden">
                <div
                    className="whitespace-nowrap flex items-center gap-12"
                    style={{
                        animation: `sliding-marquee ${speed}s linear infinite`
                    }}
                >
                    {/* Repeated text to ensure seamless scrolling */}
                    {[1, 2, 3, 4].map((n) => (
                        <div key={n} className={`flex items-center gap-3 ${textColor} font-medium`}>
                            <span className="text-yellow-400 font-bold uppercase tracking-wider">fiiro gaar ah:</span>
                            <span className="text-sm sm:text-base">{text}</span>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes sliding-marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-25%); }
                }
            `}</style>
        </div>
    );
};

export default SlidingNotification;
