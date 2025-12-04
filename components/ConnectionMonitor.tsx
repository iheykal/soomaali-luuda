import React, { useEffect, useState } from 'react';

interface ConnectionMonitorProps {
    socket: any;
    isConnected: boolean;
    isReconnecting: boolean;
    reconnectAttempts: number;
}

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

const ConnectionMonitor: React.FC<ConnectionMonitorProps> = ({
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempts
}) => {
    const [latency, setLatency] = useState<number>(0);
    const [status, setStatus] = useState<ConnectionStatus>('connected');

    useEffect(() => {
        if (isReconnecting) {
            setStatus('reconnecting');
        } else if (isConnected) {
            setStatus('connected');
        } else {
            setStatus('disconnected');
        }
    }, [isConnected, isReconnecting]);

    // Measure latency every 5 seconds
    useEffect(() => {
        if (!socket || !isConnected) return;

        const measureLatency = () => {
            const startTime = Date.now();
            socket.emit('connection_health_check');

            const timeout = setTimeout(() => {
                setLatency(999); // Timeout = high latency
            }, 5000);

            const handler = () => {
                clearTimeout(timeout);
                setLatency(Date.now() - startTime);
            };

            socket.once('connection_health_response', handler);
        };

        measureLatency();
        const interval = setInterval(measureLatency, 5000);

        return () => {
            clearInterval(interval);
        };
    }, [socket, isConnected]);

    const getStatusColor = () => {
        switch (status) {
            case 'connected':
                return latency < 200 ? 'bg-green-500' : 'bg-yellow-500';
            case 'reconnecting':
                return 'bg-orange-500';
            case 'disconnected':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'connected':
                return `Connected (${latency}ms)`;
            case 'reconnecting':
                return `Reconnecting... (${reconnectAttempts}/∞)`;
            case 'disconnected':
                return 'Disconnected';
            default:
                return 'Unknown';
        }
    };

    const getStatusIcon = () => {
        switch (status) {
            case 'connected':
                return '✓';
            case 'reconnecting':
                return '↻';
            case 'disconnected':
                return '✗';
            default:
                return '?';
        }
    };

    return (
        <div className="fixed top-4 left-4 z-50 flex items-center gap-2 bg-slate-800/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-600 shadow-lg">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${status === 'reconnecting' ? 'animate-pulse' : ''}`} />
            <span className="text-white text-sm font-medium">
                {getStatusIcon()} {getStatusText()}
            </span>
        </div>
    );
};

export default ConnectionMonitor;
