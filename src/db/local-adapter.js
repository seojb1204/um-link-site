/* ============================================================
 * UM LINK · 로컬 저장소 어댑터
 * ------------------------------------------------------------
 * 기존 app.html 의 localStorage + BroadcastChannel 동작을
 * 그대로 옮긴 것입니다. 정적 모드에서는 이것만 사용합니다.
 *
 * 범위: 같은 브라우저의 탭 사이에서만 동기화됩니다.
 *       기기가 다르면 공유되지 않습니다. (그게 Supabase가 필요한 이유)
 * ============================================================ */

(function (global) {
  'use strict';

  var NS = (global.UMLinkDB = global.UMLinkDB || {});

  function LocalAdapter(options) {
    this.key = (options && options.key) || 'umlink.demo.v3';
    this.channelName = (options && options.channelName) || 'umlink-sync';
    this.storageOK = true;
    this._channel = null;
    this._listeners = [];
  }

  LocalAdapter.prototype.name = 'local';

  /* ---- 읽기 (동기) ------------------------------------------ */
  LocalAdapter.prototype.read = function () {
    try {
      var raw = global.localStorage.getItem(this.key);
      this.storageOK = true;
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      this.storageOK = false;
      return null;
    }
  };

  /* ---- 쓰기 (동기) ------------------------------------------ */
  LocalAdapter.prototype.write = function (state) {
    try {
      global.localStorage.setItem(this.key, JSON.stringify(state));
      this.storageOK = true;
    } catch (e) {
      // 사생활 보호 모드이거나 저장 공간이 꽉 찬 경우
      this.storageOK = false;
    }

    // 같은 브라우저의 다른 탭에 알림
    try {
      if (this._channel) this._channel.postMessage({ rev: state && state.rev });
    } catch (e) {
      /* 무시: 동기화만 안 될 뿐 앱은 계속 동작 */
    }

    return this.storageOK;
  };

  /* ---- 변경 감지 -------------------------------------------- */
  LocalAdapter.prototype.subscribe = function (onChange) {
    var self = this;
    this._listeners.push(onChange);

    if (!this._channel && 'BroadcastChannel' in global) {
      this._channel = new global.BroadcastChannel(this.channelName);
      this._channel.onmessage = function () {
        self._emit();
      };
    }

    // BroadcastChannel 미지원 브라우저용 폴백
    global.addEventListener('storage', function (e) {
      if (e.key === self.key) self._emit();
    });

    return function unsubscribe() {
      var i = self._listeners.indexOf(onChange);
      if (i >= 0) self._listeners.splice(i, 1);
    };
  };

  LocalAdapter.prototype._emit = function () {
    var next = this.read();
    if (!next) return;
    for (var i = 0; i < this._listeners.length; i++) {
      try {
        this._listeners[i](next, 'local');
      } catch (e) {
        /* 리스너 하나가 터져도 나머지는 계속 */
      }
    }
  };

  LocalAdapter.prototype.destroy = function () {
    try {
      if (this._channel) this._channel.close();
    } catch (e) {}
    this._channel = null;
    this._listeners = [];
  };

  NS.LocalAdapter = LocalAdapter;
})(window);
