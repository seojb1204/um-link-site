/* ============================================================
 * UM LINK · DB 레이어 진입점
 * ------------------------------------------------------------
 * app.html 이 사용하는 유일한 창구입니다.
 * 설정에 따라 로컬 저장소만 쓸지, Supabase까지 쓸지 결정합니다.
 *
 * 사용법 (app.html 쪽)
 *   DB.init({ key: KEY, onState: fn, onStatus: fn });
 *   var S = DB.readLocal();          // 동기. 즉시 화면 렌더 가능
 *   DB.commit(S);                    // 저장 + 다른 기기로 전파
 *   DB.connect(function(){ return S; });  // 비동기 연결 (실패해도 앱은 동작)
 *
 * 설계 원칙
 *   - 부팅은 항상 동기적이고 네트워크를 기다리지 않습니다.
 *   - Supabase 연결이 실패하면 정적 모드로 조용히 떨어집니다.
 *     => 심사 당일 인터넷이 막혀도 시연이 됩니다.
 * ============================================================ */

(function (global) {
  'use strict';

  var NS = (global.UMLinkDB = global.UMLinkDB || {});

  var cfg = global.UMLINK_DB_CONFIG || {};
  var local = null;
  var remote = null;
  var mirror = null;

  var onState = null;
  var onStatus = null;
  var status = 'static';
  var connectStarted = false;

  function hasRemoteConfig() {
    return !!(cfg.url && cfg.anonKey && String(cfg.url).indexOf('http') === 0);
  }

  function setStatus(next, detail) {
    if (status === next) return;
    status = next;
    if (onStatus) {
      try {
        onStatus(next, detail);
      } catch (e) {}
    }
  }

  /* ------------------------------------------------------------
   * 초기화 (동기)
   * ---------------------------------------------------------- */
  NS.init = function (options) {
    options = options || {};
    onState = options.onState || null;
    onStatus = options.onStatus || null;

    local = new NS.LocalAdapter({ key: options.key });
    local.subscribe(function (state, origin) {
      if (onState) onState(state, origin);
    });

    status = hasRemoteConfig() ? 'connecting' : 'static';
    return NS;
  };

  /* ------------------------------------------------------------
   * 동기 읽기 — 부팅용
   * ---------------------------------------------------------- */
  NS.readLocal = function () {
    return local ? local.read() : null;
  };

  /* ------------------------------------------------------------
   * 쓰기 — 로컬 즉시 저장 후 원격에 전파
   * ---------------------------------------------------------- */
  NS.commit = function (state) {
    var ok = local ? local.write(state) : false;

    if (remote && remote.connected) {
      remote.push(state).then(function (pushed) {
        if (!pushed) setStatus('error', '원격 저장 실패');
      });

      if (mirror && cfg.mirror !== false) {
        mirror.schedule(state);
      }
    }
    return ok;
  };

  /* ------------------------------------------------------------
   * 원격 연결 (비동기, 실패 허용)
   *   getState: 현재 상태를 돌려주는 함수.
   *             원격이 비어 있으면 이 상태를 초기값으로 올립니다.
   * ---------------------------------------------------------- */
  NS.connect = function (getState) {
    if (!hasRemoteConfig()) {
      setStatus('static');
      return Promise.resolve(false);
    }
    if (connectStarted) return Promise.resolve(status === 'live');
    connectStarted = true;

    setStatus('connecting');
    remote = new NS.SupabaseAdapter(cfg);
    remote.onError = function (err) {
      setStatus('error', String((err && err.message) || err));
    };

    var timeout = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('연결 시간 초과'));
      }, cfg.connectTimeoutMs || 8000);
    });

    return Promise.race([remote.connect(), timeout])
      .then(function () {
        mirror = new NS.Mirror(remote.client);

        // 원격 변경 구독
        remote.subscribe(function (state, origin) {
          if (onState) onState(state, origin);
        });

        return remote.pull();
      })
      .then(function (found) {
        var current = getState ? getState() : null;

        if (found && found.state && found.state.ver === (current && current.ver)) {
          // 원격에 이미 상태가 있음 -> 그걸 따릅니다
          setStatus('live');
          if (onState) onState(found.state, 'remote');
        } else if (current) {
          // 원격이 비었거나 버전이 다름 -> 내 상태를 초기값으로 올립니다
          return remote.push(current).then(function (pushed) {
            // 쓰기가 거부되면 연결된 게 아닙니다. 상태를 그대로 둡니다.
            if (!pushed) {
              setStatus('error', '쓰기 거부 (권한 정책 확인 필요)');
              return false;
            }
            setStatus('live');
            if (mirror && cfg.mirror !== false) mirror.sync(current);
            return true;
          });
        } else {
          setStatus('live');
        }
        return true;
      })
      .catch(function (err) {
        // 연결 실패 = 정적 모드로 계속. 앱은 정상 동작합니다.
        remote = null;
        mirror = null;
        setStatus('error', String((err && err.message) || err));
        return false;
      });
  };

  /* ------------------------------------------------------------
   * 상태 조회
   * ---------------------------------------------------------- */
  NS.status = function () {
    return status;
  };
  NS.mode = function () {
    return remote && remote.connected ? 'supabase' : 'static';
  };
  NS.storageOK = function () {
    return local ? local.storageOK : false;
  };
  NS.mirrorError = function () {
    return mirror ? mirror.lastError : null;
  };

  /* 한글 상태 문구 — 토스트에 쓰기 좋게 */
  NS.statusText = function () {
    switch (status) {
      case 'live':
        return '실시간 모드 · 다른 기기와 연결됨';
      case 'connecting':
        return '서버에 연결 중...';
      case 'error':
        return '서버 연결 실패 · 이 기기에서만 저장됩니다';
      default:
        return '정적 모드 · 이 브라우저에만 저장됩니다';
    }
  };
})(window);
