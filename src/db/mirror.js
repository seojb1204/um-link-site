/* ============================================================
 * UM LINK · 정규화 테이블 미러링
 * ------------------------------------------------------------
 * 공유 상태(JSON)를 정규화된 테이블에도 그대로 복사합니다.
 *
 * 왜 필요한가:
 *   JSON 한 칸에만 저장하면 Supabase Table Editor를 열어도
 *   보여줄 게 없습니다. 심사에서 "DB 설계했어요"를 증명하려면
 *   실제 테이블에 실제 행이 쌓여 있어야 합니다.
 *
 * 성격:
 *   - 읽기에는 쓰이지 않습니다. 앱은 여전히 공유 상태만 읽습니다.
 *   - 실패해도 앱 동작에 영향이 없습니다. (조용히 무시)
 *   - 중복 삽입은 DB의 기본키 충돌로 걸러집니다.
 *
 * 개인정보: 사진 원본은 올리지 않습니다. 장면 종류와 설명만 남깁니다.
 * ============================================================ */

(function (global) {
  'use strict';

  var NS = (global.UMLinkDB = global.UMLinkDB || {});

  var STATUS_KINDS = ['stage', 'meal', 'sleep', 'mood', 'location', 'service', 'flight', 'note'];
  var MEDIA_KINDS = ['photo', 'video', 'collage'];

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }
  function iso(v) {
    if (!v) return null;
    try {
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch (e) {
      return null;
    }
  }
  function num(v, fallback) {
    var n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  }
  function oneOf(v, allowed, fallback) {
    return allowed.indexOf(v) >= 0 ? v : fallback;
  }

  /* 앱 운항 단계 -> DB flights.phase 제약조건 값 */
  var PHASE_DB = {
    scheduled: 'scheduled',
    boarding: 'boarding',
    departed: 'enroute',
    cruise: 'enroute',
    descent: 'enroute',
    landed: 'landed',
  };

  /* ------------------------------------------------------------
   * 상태 JSON -> 테이블별 행 묶음
   * ---------------------------------------------------------- */
  function buildRows(S) {
    var out = {};

    out.flights = arr(S.flights).map(function (f) {
      return {
        id: f.id,
        flight_no: f.no || '',
        from_iata: f.from || '',
        from_city: f.fromCity || null,
        to_iata: f.to || '',
        to_city: f.toCity || null,
        // 출발·도착은 각 공항의 현지 시각 문자열이에요. 시차 때문에
        // 절대 시각(timestamptz)으로 바꾸면 도착 시각이 틀어져요.
        dep_local: f.depLocal || null,
        arr_local: f.arrLocal || null,
        duration_min: num(f.durationMin, 0),
        delay_min: num(f.delayMin, 0),
        gate: f.gate || null,
        arr_gate: f.arrGate || null,
        // 앱의 운항 단계와 DB의 phase 제약조건이 다릅니다.
        //   앱: scheduled / boarding / departed / cruise / descent / landed
        //   DB: scheduled / checkin / boarding / enroute / landed / handed_over
        // 비행 중인 세 단계(departed·cruise·descent)는 DB에서 enroute 하나로 묶입니다.
        // 세밀한 단계는 demo_state 의 JSON 원본에 그대로 남아 있습니다.
        phase: PHASE_DB[f.phase] || 'scheduled',
      };
    });

    // 앱 사용자 + 지상직원을 한 테이블로 합칩니다
    out.app_users = arr(S.users)
      .map(function (u) {
        return {
          id: u.id,
          role: oneOf(u.role, ['guardian', 'crew', 'ground', 'admin', 'pickup'], 'guardian'),
          name: u.name || '',
          login: u.login || null,
          relation: u.relation || null,
          emp_no: u.empNo || null,
          org: u.org || null,
          notify: u.notify !== false,
        };
      })
      .concat(
        arr(S.staff).map(function (s) {
          return {
            id: s.id,
            role: 'ground',
            name: s.name || '',
            login: null,
            relation: null,
            emp_no: s.empNo || null,
            org: s.org || null,
            notify: false,
          };
        })
      );

    out.um_children = arr(S.ums).map(function (m) {
      return {
        id: m.id,
        code: m.code || m.id,
        name: m.name || '',
        age: num(m.age, 0),
        seat: m.seat || null,
        flight_id: m.flightId || null,
        crew_id: m.crewId || null,
        escort_id: m.escortId || null,
        stage: num(m.stage, 0),
        pickup_name: m.pickup || null,
      };
    });

    out.guardianships = [];
    arr(S.ums).forEach(function (m) {
      arr(m.guardians).forEach(function (gid) {
        out.guardianships.push({ guardian_id: gid, child_id: m.id });
      });
    });

    out.status_logs = arr(S.events).map(function (e) {
      return {
        id: e.id,
        child_id: e.umId,
        stage: e.stage == null ? null : num(e.stage, null),
        kind: oneOf(e.kind, STATUS_KINDS, 'note'),
        title: e.title || '',
        detail: e.detail || null,
        recorded_by: e.by || null,
        occurred_at: iso(e.at) || new Date().toISOString(),
      };
    });

    out.handovers = arr(S.handoffs).map(function (h) {
      return {
        id: h.id,
        child_id: h.umId,
        stage: h.stage == null ? null : num(h.stage, null),
        from_name: h.fromName || '',
        to_name: h.toName || '',
        to_org: h.toOrg || null,
        place: h.place || null,
        method: h.method || null,
        status: oneOf(h.status, ['pending', 'confirmed', 'rejected'], 'pending'),
        occurred_at: iso(h.at) || new Date().toISOString(),
      };
    });

    out.consents = arr(S.consents).map(function (c) {
      var items = c.items || {};
      var shoot = c.shoot || {};
      var ai = c.ai || {};
      return {
        id: c.id,
        child_id: c.umId,
        guardian_id: c.guardianId,
        verified_at: iso(c.verifiedAt),
        item_child: !!items.child,
        item_contact: !!items.contact,
        item_staff: !!items.staff,
        shoot_granted: !!shoot.granted,
        shoot_at: iso(shoot.at),
        shoot_withdrawn_at: iso(shoot.withdrawnAt),
        ai_granted: !!ai.granted,
        ai_at: iso(ai.at),
        ai_withdrawn_at: iso(ai.withdrawnAt),
        retention_days: num(c.retention, 90),
      };
    });

    // 사진 원본(src)은 올리지 않습니다 — 메타데이터만
    out.media_assets = arr(S.media).map(function (m) {
      return {
        id: m.id,
        child_id: m.umId,
        kind: oneOf(m.kind, MEDIA_KINDS, 'photo'),
        scene: m.scene || null,
        storage_path: null,
        caption: m.caption || null,
        uploaded_by: m.by || null,
        status: oneOf(m.status, ['pending', 'queued', 'sent', 'failed'], 'pending'),
        deleted: !!m.deleted,
      };
    });

    out.orders = arr(S.orders).map(function (o) {
      return {
        id: o.id,
        child_id: o.umId || null,
        guardian_id: o.guardianId || null,
        product_id: o.productId || '',
        amount: num(o.amount, 0),
        status: oneOf(
          o.status,
          ['created', 'active', 'producing', 'ready', 'payment_failed', 'refunded'],
          'created'
        ),
        pay_status: o.payStatus || 'none',
      };
    });

    out.notifications = arr(S.notifications).map(function (n) {
      return {
        id: n.id,
        guardian_id: n.guardianId,
        child_id: n.umId || null,
        type: n.type || 'info',
        severity: oneOf(n.severity, ['urgent', 'normal'], 'normal'),
        title: n.title || '',
        body: n.body || null,
        read: !!n.read,
      };
    });

    out.pickup_codes = arr(S.pickupCodes).map(function (c) {
      return {
        id: c.id,
        child_id: c.umId,
        code: c.code,
        issued_by: c.issuedBy || null,
        issued_at: iso(c.issuedAt) || new Date().toISOString(),
        expires_at: iso(c.expiresAt) || new Date(Date.now() + 36e5).toISOString(),
        used_at: iso(c.usedAt),
        used_by_name: c.usedByName || null,   // 아이를 데려간 인수자
        verified_by: c.verifiedBy || null,    // 코드를 확인한 지상직원
      };
    });

    out.privacy_requests = arr(S.privacyRequests).map(function (p) {
      return {
        id: p.id,
        child_id: p.umId || null,
        guardian_id: p.guardianId || null,
        kind: oneOf(p.kind, ['access', 'delete', 'suspend', 'withdraw'], 'access'),
        status: oneOf(p.status, ['received', 'processing', 'done', 'rejected'], 'received'),
        requested_at: iso(p.at) || new Date().toISOString(),
      };
    });

    return out;
  }

  /* ------------------------------------------------------------
   * 외래키 제약 때문에 순서가 중요합니다.
   * 부모 테이블부터 넣어야 합니다.
   * ---------------------------------------------------------- */
  var ORDER = [
    { table: 'flights', conflict: 'id' },
    { table: 'app_users', conflict: 'id' },
    { table: 'um_children', conflict: 'id' },
    { table: 'guardianships', conflict: 'guardian_id,child_id' },
    { table: 'consents', conflict: 'id' },
    { table: 'status_logs', conflict: 'id', appendOnly: true },
    { table: 'handovers', conflict: 'id', appendOnly: true },
    { table: 'media_assets', conflict: 'id' },
    { table: 'orders', conflict: 'id' },
    { table: 'notifications', conflict: 'id' },
    { table: 'pickup_codes', conflict: 'id' },
    { table: 'privacy_requests', conflict: 'id' },
  ];

  function Mirror(client) {
    this.client = client;
    this.lastError = null;
    this._running = false;
    this._pending = null;
    this._timer = null;
  }

  /* 디바운스: 연속 입력 때 매번 11개 테이블을 쓰지 않도록 */
  Mirror.prototype.schedule = function (S, delayMs) {
    var self = this;
    this._pending = S;
    if (this._timer) return;
    this._timer = setTimeout(function () {
      self._timer = null;
      var snapshot = self._pending;
      self._pending = null;
      if (snapshot) self.sync(snapshot);
    }, delayMs == null ? 600 : delayMs);
  };

  Mirror.prototype.sync = function (S) {
    var self = this;
    if (!this.client || this._running) return Promise.resolve(false);
    this._running = true;

    var rows = buildRows(S);

    // 테이블을 순서대로 하나씩 처리 (외래키 때문에 병렬 불가)
    var chain = Promise.resolve();
    ORDER.forEach(function (spec) {
      chain = chain.then(function () {
        var data = rows[spec.table];
        if (!data || !data.length) return null;

        var options = { onConflict: spec.conflict };
        // 추가 전용 테이블은 기존 행을 건드리지 않습니다
        if (spec.appendOnly) options.ignoreDuplicates = true;

        return self.client
          .from(spec.table)
          .upsert(data, options)
          .then(function (res) {
            if (res.error) {
              // 테이블 하나가 실패해도 나머지는 계속 진행
              self.lastError = spec.table + ': ' + res.error.message;
              // 401/403 은 거의 항상 RLS 정책 누락입니다. 한 번만 안내합니다.
              if (!self._warned && /JWT|api key|permission|policy|401|403/i.test(String(res.error.message || '') + res.error.code)) {
                self._warned = true;
                try {
                  console.warn('[UM Link] 미러링 거부됨 (' + spec.table + '). ' +
                    'Supabase SQL Editor에서 supabase/02_rls_demo.sql 을 실행했는지 확인하세요.');
                } catch (e) {}
              }
            }
            return null;
          });
      });
    });

    return chain
      .then(function () {
        self._running = false;
        return !self.lastError;
      })
      .catch(function (err) {
        self.lastError = String((err && err.message) || err);
        self._running = false;
        return false;
      });
  };

  NS.Mirror = Mirror;
  NS.buildMirrorRows = buildRows; // 테스트용
})(window);
