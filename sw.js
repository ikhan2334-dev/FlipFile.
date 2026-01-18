// Service Worker for offline functionality
const CACHE_NAME = 'flipfile-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/favicon.ico',
  '/manifest.json'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  // Skip API calls
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
  );
});

// Background sync for offline file processing
self.addEventListener('sync', event => {
  if (event.tag === 'process-files') {
    event.waitUntil(processQueuedFiles());
  }
});

async function processQueuedFiles() {
  // Get queued files from IndexedDB
  const db = await openDatabase();
  const files = await getAllFiles(db);
  
  for (const file of files) {
    try {
      // Process file when online
      const result = await processFile(file);
      
      // Remove from queue if successful
      if (result.success) {
        await deleteFile(db, file.id);
      }
    } catch (error) {
      console.error('Failed to process queued file:', error);
    }
  }
}

// IndexedDB for offline file queuing
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('flipfile_queue', 1);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      db.createObjectStore('files', { keyPath: 'id' });
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFiles(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readonly');
    const store = transaction.objectStore('files');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteFile(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
