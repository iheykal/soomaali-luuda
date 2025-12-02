import { audioService } from './audioService';

export interface WinNotificationData {
    winnerId: string;
    winnerUsername: string;
    grossWin: number;
    netAmount: number;
    commission: number;
    stake: number;
}

type NotificationCallback = (data: WinNotificationData) => void;

class NotificationService {
    private listeners: NotificationCallback[] = [];

    /**
     * Subscribe to win notification events
     */
    subscribe(callback: NotificationCallback): () => void {
        this.listeners.push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Trigger a win notification
     */
    showWinNotification(data: WinNotificationData): void {
        console.log('🎉 Win notification triggered:', data);

        // Play celebration sound (win sound effect)
        try {
            audioService.play('win');
        } catch (error) {
            console.warn('Could not play win sound:', error);
        }

        // Notify all listeners
        this.listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Error in notification callback:', error);
            }
        });
    }

    /**
     * Clear all listeners (cleanup)
     */
    clearListeners(): void {
        this.listeners = [];
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
