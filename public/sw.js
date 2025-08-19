const CACHE_NAME = 'showdown-v1.0';
const urlsToCache = [
    '/',
    '/lobby',
    '/login',
    '/rules',
    '/styles.css',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests (like POST /login)
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip external URLs
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});