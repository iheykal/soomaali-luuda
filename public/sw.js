self.addEventListener('install', (event) => {
  console.log('Service worker installed');
});

self.addEventListener('fetch', (event) => {
  // This is a very basic fetch handler.
  // A real-world app would have more complex logic for caching.
  event.respondWith(fetch(event.request));
});
