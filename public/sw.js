const CACHE_NAME = 'showdown-v1.0';
const urlsToCache = [
    '/',
    '/lobby',
    '/login',
    '/rules',
    '/styles.css',
    '/manifest.json',
    '/images/icon-192.png',
    '/images/icon-512.png',
    // Team logos - cache the most popular teams
    'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png',
    'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png',
    'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png',
    'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png',
    'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching app resources');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ All resources cached');
                self.skipWaiting(); // Force activate immediately
            })
            .catch((error) => {
                console.error('❌ Cache failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activated');
            self.clients.claim(); // Take control immediately
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if available
                if (response) {
                    console.log('📦 Serving from cache:', event.request.url);
                    return response;
                }

                // Fetch from network
                console.log('🌐 Fetching from network:', event.request.url);
                return fetch(event.request).then((response) => {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response (it can only be consumed once)
                    const responseToCache = response.clone();

                    // Cache successful responses for future use
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
            .catch((error) => {
                console.error('❌ Fetch failed:', error);

                // Return offline page for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html') ||
                        new Response('App is offline. Please check your connection.', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                }

                throw error;
            })
    );
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('🔔 Push notification received');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Showdown Survivor', body: event.data.text() };
        }
    }

    const options = {
        title: data.title || 'Showdown Survivor',
        body: data.body || 'You have a new notification',
        icon: '/images/icon-192.png',
        badge: '/images/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: Math.random(),
            url: data.url || '/'
        },
        actions: [
            {
                action: 'view',
                title: 'View',
                icon: '/images/icon-192.png'
            },
            {
                action: 'close',
                title: 'Close'
            }
        ],
        requireInteraction: true
    };

    event.waitUntil(
        self.registration.showNotification(options.title, options)
            .then(() => console.log('✅ Notification shown'))
            .catch((error) => console.error('❌ Notification failed:', error))
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked');

    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Open the app
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Background sync (for offline pick submissions)
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync-picks') {
        console.log('🔄 Background sync triggered');
        event.waitUntil(syncPicks());
    }
});

// Sync offline picks when connection restored
async function syncPicks() {
    try {
        // Get offline picks from IndexedDB or localStorage
        // This would sync any picks made while offline
        console.log('📤 Syncing offline picks...');
        // Implementation would go here
    } catch (error) {
        console.error('❌ Pick sync failed:', error);
    }
}