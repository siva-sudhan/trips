// Our trips offline cache
const V = 'ot-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];
const TILE_LIMIT = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'ot-tiles').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles(){
  const c = await caches.open('ot-tiles'); const keys = await c.keys();
  if (keys.length > TILE_LIMIT) for (const k of keys.slice(0, keys.length - TILE_LIMIT)) await c.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page itself: try network so updates arrive, fall back to the saved copy
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Map tiles: saved copy first, keep every tile you have looked at
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('ot-tiles').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); trimTiles(); } return r; }
      catch (err) { return new Response('', {status: 504}); }
    }));
    return;
  }
  // Exchange rate: always network, wallet keeps the last rate itself
  if (['open.er-api.com','api.open-meteo.com','api.github.com'].includes(url.hostname) || url.hostname.endsWith('githubusercontent.com')) return;
  // Everything else (fonts, Leaflet, icons): cache first, then network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => hit)));
});
