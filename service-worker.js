// service-worker.js
const CACHE_NAME = 'usermanager-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/about.html',
    '/presentation.html',
    '/style.css',
    '/script.js',
    '/main.go'
];

// Устанавливаем Service Worker и кешируем ресурсы
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Активация - удаляем старые кеши
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Стратегия: Network First, затем Cache
self.addEventListener('fetch', event => {
    // Для API запросов - всегда сеть
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response(JSON.stringify({
                        error: 'Network error',
                        cached: false
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }
    
    // Для статических файлов - сеть, затем кеш
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Клонируем ответ для кеширования
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Периодическая синхронизация (для фонового обновления)
self.addEventListener('sync', event => {
    if (event.tag === 'update-content') {
        event.waitUntil(
            updateContent()
        );
    }
});

async function updateContent() {
    // Фоновая синхронизация контента
    const cache = await caches.open(CACHE_NAME);
    const requests = urlsToCache.map(url => new Request(url, { cache: 'reload' }));
    
    for (const request of requests) {
        try {
            const response = await fetch(request);
            if (response.ok) {
                await cache.put(request, response);
            }
        } catch (error) {
            console.log('Failed to update:', request.url, error);
        }
    }
}