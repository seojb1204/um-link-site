/* ============================================================
 * UM LINK · Supabase 어댑터
 * ------------------------------------------------------------
 * 공유 상태 1행(demo_state)을 모든 기기가 함께 읽고 씁니다.
 * 누가 쓰면 Realtime으로 나머지 기기에 즉시 전파됩니다.
 *
 * 동작 방식
 *   1. CDN에서 supabase-js 를 불러옴 (설정이 채워진 경우에만)
 *   2. demo_state 에서 현재 상태를 가져옴
 *   3. postgres_changes 로 변경을 구독
 *   4. 로컬에서 쓰기가 일어나면 upsert
 *
 * 충돌 처리: rev(개정 번호) 기준 last-write-wins.
 *   두 사람이 같은 순간에 쓰면 나중 쓰기가 이깁니다.
 *   시연 규모에서는 충분하지만, 실서비스에서는 테이블을 정규화하고
 *   항목별로 쓰기를 분리해야 합니다. (supabase/03_rls_production.sql)
 * ============================================================ */

(function (global) {
  'use strict';

  var NS = (global.UMLinkDB = global.UMLinkDB || {});
  var TABLE = 'demo_state';

  /* ---- CDN에서 SDK 1회만 로드 -------------------------------- */
  var sdkPromise = null;
  function loadSdk(url) {
    if (global.supabase && global.supabase.createClient) {
      return Promise.resolve(global.supabase);
    }
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () {
        if (global.supabase && global.supabase.createClient) resolve(global.supabase);
        else reject(new Error('supabase-js 로드됐지만 createClient가 없음'));
      };
      s.onerror = function () {
        reject(new Error('supabase-js CDN 로드 실패 (네트워크 차단 가능)'));
      };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function randomId() {
    return 'c_' + Math.random().toString(36).slice(2, 10);
  }

  function SupabaseAdapter(config) {
    this.config = config;
    this.stateId = config.stateId || 'default';
    this.clientId = randomId(); // 내가 쓴 변경을 다시 받아 되돌리는 것 방지
    this.client = null;
    this.channel = null;
    this.connected = false;
    this._listeners = [];
    this._lastPushedRev = -1;
  }

  SupabaseAdapter.prototype.name = 'supabase';

  /* ---- 연결 -------------------------------------------------- */
  SupabaseAdapter.prototype.connect = function () {
    var self = this;
    var cfg = this.config;

    return loadSdk(cfg.sdkUrl).then(function (sdk) {
      self.client = sdk.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      self.connected = true;
      return self.client;
    });
  };

  /* ---- 원격 상태 읽기 ---------------------------------------- */
  SupabaseAdapter.prototype.pull = function () {
    var self = this;
    if (!this.client) return Promise.resolve(null);

    return this.client
      .from(TABLE)
      .select('rev, state, updated_at')
      .eq('id', this.stateId)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) return null;
        // 빈 자리표시 행({})은 상태로 취급하지 않습니다
        if (!res.data.state || !res.data.state.ver) return null;
        return { rev: res.data.rev, state: res.data.state };
      })
      .catch(function (err) {
        self._fail(err);
        return null;
      });
  };

  /* ---- 원격 상태 쓰기 ---------------------------------------- */
  SupabaseAdapter.prototype.push = function (state) {
    var self = this;
    if (!this.client) return Promise.resolve(false);

    this._lastPushedRev = state.rev;

    return this.client
      .from(TABLE)
      .upsert(
        {
          id: this.stateId,
          rev: state.rev,
          state: state,
          updated_at: new Date().toISOString(),
          updated_by: this.clientId,
        },
        { onConflict: 'id' }
      )
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      })
      .catch(function (err) {
        self._fail(err);
        return false;
      });
  };

  /* ---- 변경 구독 --------------------------------------------- */
  SupabaseAdapter.prototype.subscribe = function (onChange) {
    var self = this;
    this._listeners.push(onChange);

    if (this.channel || !this.client) return;

    this.channel = this.client
      .channel('umlink-state-' + this.stateId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: 'id=eq.' + this.stateId,
        },
        function (payload) {
          var row = payload['new'];
          if (!row || !row.state || !row.state.ver) return;

          // 내가 쓴 변경이면 무시 (화면이 두 번 그려지는 것 방지)
          if (row.updated_by === self.clientId) return;

          for (var i = 0; i < self._listeners.length; i++) {
            try {
              self._listeners[i](row.state, 'remote');
            } catch (e) {}
          }
        }
      )
      .subscribe();
  };

  SupabaseAdapter.prototype._fail = function (err) {
    this.connected = false;
    if (this.onError) {
      try {
        this.onError(err);
      } catch (e) {}
    }
  };

  SupabaseAdapter.prototype.destroy = function () {
    try {
      if (this.channel && this.client) this.client.removeChannel(this.channel);
    } catch (e) {}
    this.channel = null;
    this._listeners = [];
  };

  NS.SupabaseAdapter = SupabaseAdapter;
})(window);
