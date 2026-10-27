/* ============================================================
 * UM LINK · 서비스워커
 * ------------------------------------------------------------
 * 하는 일
 *   1. 앱 껍데기를 캐시에 저장해 오프라인에서도 열리게 합니다.
 *   2. 새 배포가 있으면 받아오고, 없으면 캐시를 씁니다.
 *
 * 하지 않는 일 (중요)
 *   - Supabase 통신은 건드리지 않습니다. 다른 출처(cross-origin)라
 *     그대로 통과시킵니다. 실시간 데이터를 캐시하면 오래된 화면이
 *     보일 수 있어서 의도적으로 제외했습니다.
 *   - WebSocket(실시간 구독)은 서비스워커가 가로채지 않습니다.
 *
 * 캐시 버전을 올리면 옛 캐시가 자동으로 지워집니다.
 * ============================================================ */

var VERSION = 'umlink-v1';
var SHELL = VERSION + '-shell';
var RUNTIME = VERSION + '-runtime';

/* 처음 설치할 때 미리 받아둘 파일들 (앱 껍데기) */
var PRECACHE = [
  './',
  './app.html',
  './index.html',
  './manifest.json',
  './flight-journey.js',
  './src/db/config.js',
  './src/db/local-adapter.js',
  './src/db/supabase-adapter.js',
  './src/db/mirror.js',
  './src/db/index.js',
  './src/pwa/install.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* ---- 설치: 껍데기 미리 저장 ---------------------------------- */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // 하나가 실패해도 나머지는 저장되도록 개별 처리합니다.
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* ---- 활성화: 옛 버전 캐시 정리 -------------------------------- */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---- 요청 가로채기 -------------------------------------------- */
self.addEventListener('fetch', function (e) {
  var req = e.request;

  // GET 이 아닌 요청(쓰기)은 건드리지 않습니다.
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 다른 출처(Supabase, CDN, 폰트)는 그대로 통과시킵니다.
  if (url.origin !== self.location.origin) return;

  // 화면 이동(HTML)은 새 배포를 먼저 확인합니다.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./app.html');
        });
      })
    );
    return;
  }

  // 나머지 파일은 캐시를 먼저 주고, 뒤에서 조용히 갱신합니다.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});

/* ---- 앱에서 보내는 메시지 ------------------------------------- */
self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
