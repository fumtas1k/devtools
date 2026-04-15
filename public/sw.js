const CACHE_NAME = 'devtools-v1';

// オフライン時のフォールバック先
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  // 既存の SW を待たずに即時有効化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 古いキャッシュを削除
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // GET かつ http/https のみ対象（POST や chrome-extension:// は除外）
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // ナビゲーションリクエスト（HTMLページ）: Network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // 静的アセット（JS / CSS / フォント / 画像）: Cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached ?? fetch(event.request).then((response) => {
        // 成功レスポンスのみキャッシュに追加
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
    )
  );
});
