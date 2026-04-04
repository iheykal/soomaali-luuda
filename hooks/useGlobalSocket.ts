import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/apiConfig';

interface FinancialNotification {
    type: 'DEPOSIT' | 'WITHDRAWAL';
    action: 'APPROVED' | 'REJECTED';
    amount: number;
    message: string;
}

// Helper function to convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Global socket hook for user-specific notifications
 * Handles deposit/withdrawal approval notifications via Browser Notification API and Web Push
 */
export const useGlobalSocket = (userId: string | null | undefined, isAuthenticated: boolean) => {
    const socketRef = useRef<Socket | null>(null);
    const notificationPermissionRequested = useRef(false);
    const pushSubscriptionSent = useRef(false);

    useEffect(() => {
        // Only connect if user is authenticated and we have a userId
        if (!isAuthenticated || !userId) {
            return;
        }

        // Register Service Worker for Web Push
        const registerServiceWorker = async () => {
            if ('serviceWorker' in navigator) {
                try {
                    console.log('📝 Registering service worker...');
                    const registration = await navigator.serviceWorker.register('/service-worker.js', {
                        scope: '/'
                    });
                    console.log('✅ Service Worker registered:', registration);

                    // Wait for service worker to be ready
                    await navigator.serviceWorker.ready;
                    return registration;
                } catch (error) {
                    console.error('❌ Service Worker registration failed:', error);
                    return null;
                }
            }
            console.warn('⚠️ Service Workers not supported in this browser');
            return null;
        };

        // Subscribe to Push Notifications
        const subscribeToPush = async (registration: ServiceWorkerRegistration) => {
            try {
                // Request notification permission
                if (!notificationPermissionRequested.current && 'Notification' in window) {
                    const permission = await Notification.requestPermission();
                    console.log('📢 Notification permission:', permission);
                    notificationPermissionRequested.current = true;

                    if (permission !== 'granted') {
                        console.warn('⚠️ Notification permission denied');
                        return;
                    }
                }

                // Get VAPID public key from server
                const apiBase = (import.meta as any).env?.VITE_USE_REAL_API === 'true'
                    ? window.location.origin
                    : SOCKET_URL;

                const response = await fetch(`${apiBase}/api/push/vapid-public-key`);

                if (!response.ok) {
                    console.warn('⚠️ VAPID key not available');
                    return;
                }

                const { publicKey } = await response.json();

                // Subscribe to push notifications
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });

                console.log('📲 Push subscription created:', subscription);

                // Send subscription to backend
                const token = localStorage.getItem('ludo_token');
                if (!token) {
                    console.warn('⚠️ No auth token found, cannot save push subscription');
                    return;
                }

                const subscribeResponse = await fetch(`${apiBase}/api/push/subscribe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ subscription: subscription.toJSON() })
                });

                if (subscribeResponse.ok) {
                    console.log('✅ Push subscription saved to backend');
                    pushSubscriptionSent.current = true;
                } else {
                    console.error('❌ Failed to save push subscription to backend');
                }
            } catch (error) {
                console.error('❌ Error subscribing to push notifications:', error);
            }
        };

        // Initialize Service Worker and Push Subscription
        const initializePush = async () => {
            const registration = await registerServiceWorker();
            if (registration && !pushSubscriptionSent.current) {
                await subscribeToPush(registration);
            }
        };

        initializePush();

        // Connect to Socket.IO
        const socketUrl = (import.meta as any).env?.VITE_USE_REAL_API === 'true'
            ? window.location.origin
            : SOCKET_URL;

        console.log('🔌 Connecting to global socket for notifications:', socketUrl);

        socketRef.current = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 45000,
        });

        const socket = socketRef.current;

        socket.on('connect', () => {
            console.log('🔌 Global socket connected:', socket.id);
            // Register user for notifications
            socket.emit('register_user', { userId });
            console.log('👤 Registered user for notifications:', userId);
        });

        socket.on('connect_error', (error) => {
            console.error('🔌 Global socket connection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('🔌 Global socket disconnected:', reason);
        });

        // Listen for force rejoin invite from admin
        socket.on('FORCE_REJOIN_INVITE', (data: { gameId: string; playerColor: string; message: string }) => {
            console.log('🔔 FORCE_REJOIN_INVITE received:', data);

            // Show browser notification if permitted
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('🎮 Game Rejoin Invite', {
                    body: data.message || 'Admin invited you to rejoin the game',
                    icon: '/wello.png',
                    badge: '/wello.png',
                    tag: `rejoin_${data.gameId}`,
                    requireInteraction: false,
                });

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };

                setTimeout(() => notification.close(), 5000);
            }

            // Reload the page to trigger the checkActiveGame flow
            // This will detect the active game and show the rejoin banner
            console.log('🔄 Reloading page to rejoin game...');
            setTimeout(() => {
                window.location.reload();
            }, 1000); // Small delay to let the notification show
        });

        // Listen for balance updates (admin deposits/withdrawals)
        socket.on('balance_updated', (data: { newBalance: number, type: string, amount: number, message: string }) => {
            console.log('💰 Balance update received:', data);

            // 1. Always dispatch in-app toast event (works regardless of browser notification permission)
            window.dispatchEvent(new CustomEvent('BALANCE_CREDITED', {
                detail: {
                    amount: data.amount,
                    type: (data.type || 'DEPOSIT').toUpperCase(),
                    newBalance: data.newBalance,
                    message: data.message || 'Admin balance update',
                }
            }));

            // 2. Try browser notification as a bonus (only if already granted — don't re-prompt)
            if ('Notification' in window && Notification.permission === 'granted') {
                const title = data.type === 'DEPOSIT' ? '💸 Lacag La Soo Geliyey' : '💳 Lacag La Raaray';
                const notification = new Notification(title, {
                    body: `$${data.amount.toFixed ? data.amount.toFixed(2) : data.amount} — Haraagii: $${data.newBalance}`,
                    icon: '/wello.png',
                    badge: '/wello.png',
                    tag: `balance_update_${Date.now()}`,
                    requireInteraction: false,
                });
                setTimeout(() => notification.close(), 5000);
                notification.onclick = () => { window.focus(); notification.close(); };
            }

            // 3. Refresh balance in context
            console.log('🔄 Silently updating balance on screen...');
            setTimeout(() => {
                window.dispatchEvent(new Event('LUDO_REFRESH_USER'));
            }, 500);
        });

        // Listen for financial request updates
        socket.on('financial_request_update', (data: FinancialNotification) => {
            console.log('💰 Financial request update received:', data);

            // Show browser notification (when app is open)
            if ('Notification' in window && Notification.permission === 'granted') {
                const humanType = data.type === 'DEPOSIT' ? 'Lacag-Dhigasho' : 'Lacag-Labixid';
                const title = data.action === 'APPROVED'
                    ? `${data.type === 'DEPOSIT' ? '💵' : '💸'} ${humanType} Approved`
                    : `❌ ${humanType} Rejected`;

                const notification = new Notification(title, {
                    body: data.message,
                    icon: '/wello.png', // App icon
                    badge: '/wello.png',
                    tag: `financial_${data.type}_${Date.now()}`, // Unique tag to prevent duplicates
                    requireInteraction: false,
                    silent: false,
                });

                // Auto-close after 10 seconds
                setTimeout(() => notification.close(), 10000);

                // Optional: Handle notification click
                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };

                console.log('📢 Browser notification shown:', title);
            } else if ('Notification' in window && Notification.permission === 'denied') {
                console.warn('📢 Notification permission denied by user');
            } else {
                console.log('📢 Received notification but showing as console log:', data.message);
            }
        });

        // Cleanup on unmount or when user logs out
        return () => {
            console.log('🧹 Cleaning up global socket connection');
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [userId, isAuthenticated]);

    return socketRef.current;
};
