/* ============================================================
 * UM LINK · 앱 설치 (PWA)
 * ------------------------------------------------------------
 * 하는 일
 *   1. 서비스워커 등록 (오프라인 실행)
 *   2. '홈 화면에 추가' 버튼 표시
 *      - 안드로이드/크롬: 브라우저가 주는 설치 창을 띄움
 *      - 아이폰/사파리: 설치 창이 없어서 방법을 안내
 *   3. 이미 설치해서 열었으면 버튼을 숨김
 *
 * 이 파일만 빼면 기능 전체가 사라집니다. 앱 동작에는 영향이 없습니다.
 * ============================================================ */

(function (global) {
  'use strict';

  var doc = global.document;
  var deferred = null;     // 안드로이드가 건네주는 설치 창
  var bar = null;

  /* 설치된 상태로 실행 중인가 (홈화면 아이콘으로 연 경우) */
  function installed() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
      if (global.navigator && global.navigator.standalone) return true;  // iOS
    } catch (e) {}
    return false;
  }

  function isIOS() {
    var ua = (global.navigator && global.navigator.userAgent) || '';
    return /iPad|iPhone|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && global.navigator.maxTouchPoints > 1); // iPadOS
  }

  /* 한 번 닫으면 그 브라우저에서는 다시 띄우지 않습니다 */
  function dismissed() {
    try { return global.localStorage.getItem('umlink.install.hide') === '1'; }
    catch (e) { return false; }
  }
  function remember() {
    try { global.localStorage.setItem('umlink.install.hide', '1'); } catch (e) {}
  }

  function style() {
    if (doc.getElementById('umlink-install-style')) return;
    var s = doc.createElement('style');
    s.id = 'umlink-install-style';
    s.textContent =
      '.umlink-install{position:fixed;left:12px;right:12px;z-index:30;' +
      'bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
      'display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;' +
      'background:#1f2a5c;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3);' +
      'font-family:inherit;font-size:14px;line-height:1.5;max-width:560px;margin:0 auto}' +
      '.umlink-install img{width:36px;height:36px;border-radius:9px;flex:none}' +
      '.umlink-install .t{flex:1;min-width:0}' +
      '.umlink-install .t b{display:block;font-size:14px}' +
      '.umlink-install .t span{font-size:12px;color:#b7c0df}' +
      '.umlink-install button{border:0;border-radius:9px;padding:9px 14px;font:inherit;' +
      'font-weight:700;font-size:13px;cursor:pointer;background:#1b7594;color:#fff;flex:none}' +
      '.umlink-install .x{background:transparent;color:#b7c0df;padding:9px 6px;font-weight:500}' +
      '@media (max-width:420px){.umlink-install{font-size:13px}.umlink-install img{display:none}}';
    doc.head.appendChild(s);
  }

  function hide() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function show(mode) {
    if (bar || installed() || dismissed()) return;
    style();

    bar = doc.createElement('div');
    bar.className = 'umlink-install';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', '홈 화면에 추가');

    var label = mode === 'ios'
      ? '<b>홈 화면에 추가하면 앱처럼 열려요</b><span>공유 버튼 → "홈 화면에 추가"</span>'
      : '<b>홈 화면에 추가</b><span>주소창 없이 전체화면으로 열려요</span>';

    bar.innerHTML =
      '<img src="icons/icon-192.png" alt="">' +
      '<div class="t">' + label + '</div>' +
      (mode === 'ios' ? '' : '<button type="button" data-umlink-install>설치</button>') +
      '<button type="button" class="x" data-umlink-close aria-label="닫기">✕</button>';

    doc.body.appendChild(bar);

    bar.addEventListener('click', function (e) {
      if (e.target.closest('[data-umlink-close]')) { remember(); hide(); return; }
      if (e.target.closest('[data-umlink-install]') && deferred) {
        var p = deferred; deferred = null; hide();
        try {
          p.prompt();
          if (p.userChoice) p.userChoice.then(function (r) {
            if (r && r.outcome === 'accepted') remember();
          });
        } catch (err) {}
      }
    });
  }

  /* ---- 서비스워커 등록 ---------------------------------------- */
  function registerSW() {
    if (!('serviceWorker' in global.navigator)) return;
    // file:// 로 열면 등록이 안 됩니다. 조용히 넘어갑니다.
    if (global.location.protocol === 'file:') return;
    global.navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* 화면 아래쪽에 연결 상태 토스트가 2.8초간 떠 있어서,
     그보다 늦게 띄워야 가리지 않습니다. */
  var DELAY = 4000;
  function showLater(mode) {
    global.setTimeout(function () { show(mode); }, DELAY);
  }

  /* ---- 시작 --------------------------------------------------- */
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showLater('prompt');          // 안드로이드·크롬
  });

  global.addEventListener('appinstalled', function () { remember(); hide(); });

  function start() {
    registerSW();
    // 아이폰은 브라우저가 주는 설치 창이 없어서 방법만 안내합니다.
    if (isIOS() && !installed() && !dismissed()) showLater('ios');
  }

  if (doc.readyState === 'complete' || doc.readyState === 'interactive') start();
  else global.addEventListener('DOMContentLoaded', start);

  /* 외부에서 쓸 수 있게 공개 */
  global.UMLinkInstall = { installed: installed, show: show, hide: hide };
})(window);
