
import { useState, useEffect, useCallback, useRef } from 'react';
import { socketManager } from '../services/socketService';
import type { Socket } from 'socket.io-client';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'searching';

export const useMatchmaking = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        initializeConnection();

        return () => {
            isMounted.current = false;
            socketManager.disconnect();
        };
    }, []);

    const setupMatchmakingListeners = (activeSocket: Socket) => {
        activeSocket.on('matchmaking_error', (err: { message: string }) => {
            if (!isMounted.current) return;
            console.error('❌ Matchmaking error:', err);
            setError(err.message);
        });

        activeSocket.on('matchmaking_status', (status: { message: string }) => {
            if (!isMounted.current) return;
            console.log('📊 Matchmaking status:', status);
        });
    };

    const initializeConnection = useCallback(async () => {
        if (socketManager.isConnected) {
            console.log('✅ Socket already connected.');
            const s = socketManager.getSocket();
            setSocket(s);
            setConnectionStatus('connected');
            setupMatchmakingListeners(s); // Re-attach listeners just in case
            return;
        }

        try {
            if (!isMounted.current) return;
            setConnectionStatus('connecting');
            setError(null);
            console.log('🎯 Initializing matchmaking connection...');
            
            const connectedSocket = await socketManager.connect();
            if (!isMounted.current) {
                socketManager.disconnect();
                return;
            }

            setSocket(connectedSocket);
            setConnectionStatus('connected');
            setupMatchmakingListeners(connectedSocket);

        } catch (err: any) {
            if (!isMounted.current) return;
            console.error('❌ Failed to initialize matchmaking:', err);
            setConnectionStatus('error');
            setError(err.message || 'Failed to connect.');
        }
    }, []);

    const searchForMatch = useCallback(async (gameConfig: any) => {
        if (!socketManager.isConnected) {
            console.error('❌ Cannot search for match: Socket not connected');
            setError('Unable to connect. Please try again.');
            await initializeConnection(); // Attempt to reconnect
            return;
        }

        try {
            console.log('🎯 Searching for match with config:', gameConfig);
            setConnectionStatus('searching');
            socketManager.getSocket().emit('search_match', gameConfig);
            
        } catch (err: any) {
            console.error('❌ Error searching for match:', err);
            setError(err.message);
            setConnectionStatus('error');
        }
    }, []);

    const cancelSearch = useCallback(() => {
        if (socketManager.isConnected) {
            socketManager.getSocket().emit('cancel_search');
            setConnectionStatus('connected');
        }
    }, []);

    return {
        socket,
        connectionStatus,
        error,
        searchForMatch,
        cancelSearch,
        reconnect: initializeConnection,
        isConnected: socketManager.isConnected,
    };
};
