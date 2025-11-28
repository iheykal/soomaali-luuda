import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface ChatMessage {
    id: string;
    text: string;
    emoji: string;
}

interface ReceivedMessage {
    userId: string;
    playerColor: string;
    playerName: string;
    message: string;
    timestamp: number;
}

interface QuickChatProps {
    gameId: string;
    socket: any;
    userId: string;
    playerColor?: string;
}

const CHAT_MESSAGES: ChatMessage[] = [
    { id: 'm1', emoji: '😊', text: 'Thanks' },
    { id: 'm2', emoji: '', text: 'Waa badbaaday' },
    { id: 'm3', emoji: '😊', text: 'si fcna u ciyartay' },
    { id: 'm4', emoji: '', text: 'ciyaartaan anaa kaa leh' },
    { id: 'm5', emoji: '❤️', text: 'si fiicanaa u dheeshay' },
];

const QuickChat: React.FC<QuickChatProps> = ({ gameId, socket, userId, playerColor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [recentMessages, setRecentMessages] = useState<ReceivedMessage[]>([]);
    const [cooldown, setCooldown] = useState(0);
    const [unreadCount, setUnreadCount] = useState(0);

    // Listen for incoming chat messages
    useEffect(() => {
        if (!socket) return;

        const handleChatMessage = (data: ReceivedMessage) => {
            console.log('💬 Received chat message:', data);
            setRecentMessages(prev => [...prev, data].slice(-3)); // Keep last 3 messages

            // Increment unread if chat is closed and message is from opponent
            if (!isOpen && data.userId !== userId) {
                setUnreadCount(prev => prev + 1);
            }

            // Auto-remove message after 5 seconds
            setTimeout(() => {
                setRecentMessages(prev => prev.filter(m => m.timestamp !== data.timestamp));
            }, 5000);
        };

        socket.on('chat_message', handleChatMessage);

        return () => {
            socket.off('chat_message', handleChatMessage);
        };
    }, [socket, userId, isOpen]);

    // Cooldown timer
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    // Clear unread when opening
    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0);
        }
    }, [isOpen]);

    const sendMessage = (message: ChatMessage) => {
        if (cooldown > 0) return;
        if (!socket || !socket.connected) {
            console.error('Socket not connected');
            return;
        }

        const messageText = message.emoji ? `${message.emoji} ${message.text}` : message.text;
        socket.emit('send_chat_message', {
            gameId,
            userId,
            message: messageText
        });

        setCooldown(2); // 2 second cooldown
        setIsOpen(false); // Close after sending
    };

    return (
        <>
            {/* Recent Messages Display */}
            <div className="fixed top-4 left-4 z-40 pointer-events-none max-w-xs">
                {recentMessages.map((msg) => (
                    <div
                        key={msg.timestamp}
                        className="mb-2 animate-slide-in-left"
                        style={{
                            animation: 'slideInLeft 0.3s ease-out'
                        }}
                    >
                        <div
                            className="px-4 py-2 rounded-lg shadow-lg text-white font-medium"
                            style={{
                                backgroundColor: msg.playerColor === 'red' ? '#ef4444' :
                                    msg.playerColor === 'blue' ? '#3b82f6' :
                                        msg.playerColor === 'green' ? '#22c55e' :
                                            msg.playerColor === 'yellow' ? '#eab308' : '#6b7280'
                            }}
                        >
                            <div className="text-xs opacity-80">{msg.playerName}</div>
                            <div>{msg.message}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chat Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110"
                aria-label="Quick Chat"
            >
                {isOpen ? (
                    <X size={24} />
                ) : (
                    <div className="relative">
                        <MessageCircle size={24} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                )}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 z-50 bg-white rounded-lg shadow-2xl w-80 max-w-[calc(100vw-3rem)] animate-slide-up">
                    {/* Header */}
                    <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={20} />
                            <h3 className="font-bold">Quick Chat</h3>
                        </div>
                        {cooldown > 0 && (
                            <span className="text-xs bg-blue-700 px-2 py-1 rounded">
                                Wait {cooldown}s
                            </span>
                        )}
                    </div>

                    {/* Messages List */}
                    <div className="p-3 max-h-64 overflow-y-auto">
                        <div className="flex flex-col gap-2">
                            {CHAT_MESSAGES.map(msg => (
                                <button
                                    key={msg.id}
                                    onClick={() => sendMessage(msg)}
                                    disabled={cooldown > 0}
                                    className={`p-3 rounded-lg text-left transition-all ${cooldown > 0
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-gray-100 hover:bg-blue-50 hover:shadow-md active:scale-95'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {msg.emoji && <span className="text-2xl">{msg.emoji}</span>}
                                        <span className="text-sm font-medium text-gray-800">{msg.text}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 bg-gray-50 rounded-b-lg border-t border-gray-200">
                        <p className="text-xs text-gray-500 text-center">
                            Tap a message to send • Stay positive! 😊
                        </p>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
        
        .animate-slide-in-left {
          animation: slideInLeft 0.3s ease-out;
        }
      `}</style>
        </>
    );
};

export default QuickChat;
