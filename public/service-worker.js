/**
 * Service Worker for Web Push Notifications
 * Handles push notifications when the app is closed
 */

// Service Worker version - increment to force update
const SW_VERSION = 'v1.0.0';

console.log(`[SW] Service Worker ${SW_VERSION} loaded`);

// Install event - happens when service worker is first installed
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    // Skip waiting to activate immediately
    self.skipWaiting();
});

// Activate event - happens when service worker becomes active
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    // Claim all clients immediately
    event.waitUntil(self.clients.claim());
});

// Push event - happens when a push notification is received
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received:', event);

    let notificationData = {
        title: 'Notification',
        body: 'You have a new notification',
        icon: '/wello.png',
        badge: '/wello.png',
        data: { url: '/' }
    };

    // Parse the push data
    if (event.data) {
        try {
            const data = event.data.json();
            console.log('[SW] Push data:', data);
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                data: data.data || notificationData.data,
                tag: `financial-${Date.now()}`, // Unique tag
                requireInteraction: false,
                vibrate: [200, 100, 200] // Vibration pattern for Android
            };
        } catch (error) {
            console.error('[SW] Error parsing push data:', error);
        }
    }

    // Show the notification
    const promiseChain = self.registration.showNotification(
        notificationData.title,
        {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            data: notificationData.data,
            tag: notificationData.tag,
            requireInteraction: notificationData.requireInteraction,
            vibrate: notificationData.vibrate
        }
    );

    event.waitUntil(promiseChain);
});

// Notification click event - happens when user clicks the notification
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);

    event.notification.close(); // Close the notification

    // Get the URL to open from notification data
    const urlToOpen = event.notification.data?.url || '/';

    // Focus or open the app
    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // If the app is already open in a tab, focus it
            for (let client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => {
                        // Optionally navigate to the URL
                        if (urlToOpen !== '/') {
                            client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
                        }
                    });
                }
            }

            // If no tab is open, open a new one
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

// Message event - listen for messages from the app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker setup complete');
