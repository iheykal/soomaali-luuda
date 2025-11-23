
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/apiConfig';

class SocketManager {
    private socket: Socket | null = null;
    public isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 5;
    private readonly connectionTimeout: number = 10000; // 10 seconds

    async connect(): Promise<Socket> {
        return new Promise((resolve, reject) => {
            try {
                if (this.socket) {
                    this.disconnect();
                }

                const serverUrl = SOCKET_URL;
                console.log('🔌 Attempting Socket.IO connection to:', serverUrl);

                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    timeout: this.connectionTimeout,
                    forceNew: true,
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    autoConnect: true,
                    withCredentials: true,
                });

                const connTimeout = setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('Connection timeout'));
                        this.cleanup();
                    }
                }, this.connectionTimeout);

                this.socket.on('connect', () => {
                    clearTimeout(connTimeout);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    console.log('✅ Socket.IO connected successfully:', this.socket?.id);
                    resolve(this.socket as Socket);
                });

                this.socket.on('connect_error', (error) => {
                    clearTimeout(connTimeout);
                    console.error('❌ Socket connection error:', error);
                    this.handleConnectionError(error);
                    reject(error);
                });

                this.socket.on('disconnect', (reason) => {
                    this.isConnected = false;
                    console.log('🔌 Socket disconnected:', reason);
                });

                this.socket.on('reconnect_attempt', (attempt) => {
                    this.reconnectAttempts = attempt;
                    console.log(`🔄 Reconnection attempt ${attempt}/${this.maxReconnectAttempts}`);
                });

                this.socket.on('reconnect_failed', () => {
                    console.error('❌ All reconnection attempts failed');
                });

            } catch (error) {
                console.error('❌ Socket connection setup error:', error);
                reject(error);
            }
        });
    }

    private handleConnectionError(error: Error) {
        console.error('Connection error details:', {
            message: error.message,
        });

        if (error.message.includes('websocket error')) {
            console.warn('⚠️ WebSocket failed, server may not support it or be misconfigured.');
        }
    }

    public disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }

    private cleanup() {
        this.disconnect();
        this.reconnectAttempts = 0;
    }

    public getSocket(): Socket {
        if (!this.socket || !this.isConnected) {
            throw new Error('Socket not connected');
        }
        return this.socket;
    }
}

// Export a singleton instance
export const socketManager = new SocketManager();
