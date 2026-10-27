/*!
 * UM LINK — Flight Journey (ICN → LAX) 18초 모션 그래픽
 * HTML · CSS · JavaScript(Canvas)만으로 동작하는 영상형 애니메이션입니다.
 *
 * 사용법
 *   <script src="flight-journey.js"></script>
 *   UMFlightJourney.mount(document.getElementById('box'), { autoplay: true });
 *   UMFlightJourney.openModal();   // 전체 화면 위에 띄워서 재생
 *
 * - 화면 비율 16:9, 내부 해상도 1920×1080, 매 프레임(브라우저 기준 60fps) 렌더링
 * - 비행 경로: 인천국제공항(37.4602, 126.4407) → 로스앤젤레스 국제공항(33.9416, -118.4085) 대권 항로
 * - 지도: Apache ECharts world 지도(echarts@4.9.0/map/js/world.js)를 불러와 해안선을 그립니다.
 *         불러오지 못하면 경위도 격자만 그린 대체 화면으로 재생합니다.
 * - 공항 좌표를 바탕으로 한 시각화이며, 실제 운항 항적이 아닙니다.
 */
(function (global) {
  'use strict';
  if (global.UMFlightJourney) return;

  /* ---------- 설정 ---------- */
  var W = 1920, H = 1080, DURATION = 18;
  var FLIGHT = { no: 'KE017', from: 'ICN', to: 'LAX', depLocal: '14:30', arrLocal: '08:30', durationMin: 660 };
  var AP = {
    ICN: { lat: 37.4602, lon: 126.4407, code: 'ICN', name: 'INCHEON INTERNATIONAL AIRPORT' },
    LAX: { lat: 33.9416, lon: -118.4085, code: 'LAX', name: 'LOS ANGELES INTERNATIONAL AIRPORT' }
  };
  var WORLD_URL = 'https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/js/world.js';
  var C = {
    oceanIn: '#10214a', oceanOut: '#060c20', land: '#17284f', landHi: '#1c3060',
    coast: 'rgba(92,196,220,0.42)', border: 'rgba(120,160,220,0.14)', grid: 'rgba(150,175,235,0.075)',
    teal: '#4cc3dc', tealSoft: 'rgba(76,195,220,0.22)', remain: 'rgba(176,186,208,0.62)',
    navy: '#1f2a5c', white: '#ffffff', muted: 'rgba(205,215,240,0.72)', faint: 'rgba(205,215,240,0.45)',
    card: 'rgba(9,16,40,0.84)', cardLine: 'rgba(76,195,220,0.55)'
  };
  var FONT = '"IBM Plex Sans KR","IBM Plex Sans","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  var MONO = '"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace';
  var PLANE = new (global.Path2D || function () {})('M10.5 3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V9l8 4.5V16l-8-2.5V19l2.5 2v1.5L12 21.5l-4 1V21l2.5-2v-5.5L2.5 16v-2.5l8-4.5z');

  /* ---------- 투영: 메르카토르, 경도 105°E ~ 255°E(=105°W), 위도 약 9°N ~ 68°N ---------- */
  var LON0 = 105, PX = W / 150;
  function merc(lat) { lat = Math.max(-85, Math.min(85, lat)); return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI; }
  var MTOP = merc(68);
  function proj(lat, lon) { return [(lon - LON0) * PX, (MTOP - merc(lat)) * PX]; }

  /* ---------- 대권 항로(날짜변경선을 넘어도 경도가 이어지도록 펼침) ---------- */
  function gcRoute(a, b, n) {
    var r = Math.PI / 180, p1 = a.lat * r, l1 = a.lon * r, p2 = b.lat * r, l2 = b.lon * r;
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
    var out = [], prev = null;
    for (var i = 0; i <= n; i++) {
      var f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      var y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      var z = A * Math.sin(p1) + B * Math.sin(p2);
      var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / r, lon = Math.atan2(y, x) / r;
      if (prev !== null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; }
      prev = lon; out.push(proj(lat, lon));
    }
    return out;
  }
  var ROUTE = gcRoute(AP.ICN, AP.LAX, 360);
  // 화면 길이 기준으로 재매개화: 진행률이 경로 위 실제 거리와 비례하도록
  var CUM = [0];
  for (var ri = 1; ri < ROUTE.length; ri++) CUM.push(CUM[ri - 1] + Math.hypot(ROUTE[ri][0] - ROUTE[ri - 1][0], ROUTE[ri][1] - ROUTE[ri - 1][1]));
  var LEN = CUM[CUM.length - 1];
  function routeIndex(t) {
    var target = Math.max(0, Math.min(1, t)) * LEN, lo = 0, hi = CUM.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (CUM[mid] < target) lo = mid; else hi = mid; }
    var seg = CUM[hi] - CUM[lo] || 1;
    return { i: lo, k: (target - CUM[lo]) / seg };
  }
  function routeAt(t) {
    var q = routeIndex(t), a = ROUTE[q.i], b = ROUTE[q.i + 1] || a;
    return [a[0] + (b[0] - a[0]) * q.k, a[1] + (b[1] - a[1]) * q.k];
  }
  var P_ICN = ROUTE[0], P_LAX = ROUTE[ROUTE.length - 1];

  /* ---------- 시간 곡선 ---------- */
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function easeInOutSine(x) { return -(Math.cos(Math.PI * clamp01(x)) - 1) / 2; }
  function easeOutCubic(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
  var T_DEP = 3.0, T_ARR = 15.5; // 항공기 출발·도착 시각(영상 기준 초)
  function progressAt(time) { return easeInOutSine((time - T_DEP) / (T_ARR - T_DEP)); }

  /* ---------- 지도 데이터(ECharts world) 불러오기 ---------- */
  function decodeRing(str, off, scale) {
    var res = [], px = off[0], py = off[1];
    for (var i = 0; i < str.length; i += 2) {
      var x = str.charCodeAt(i) - 64, y = str.charCodeAt(i + 1) - 64;
      x = (x >> 1) ^ (-(x & 1)); y = (y >> 1) ^ (-(y & 1));
      x += px; y += py; px = x; py = y;
      res.push([x / scale, y / scale]);
    }
    return res;
  }
  function decodeGeo(json) {
    var enc = !!json.UTF8Encoding, scale = json.UTF8Scale == null ? 1024 : json.UTF8Scale, rings = [];
    (json.features || []).forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (poly, pi) {
        poly.forEach(function (ring, ri) {
          if (enc && typeof ring === 'string') {
            var off = g.type === 'Polygon' ? g.encodeOffsets[ri] : g.encodeOffsets[pi][ri];
            rings.push(decodeRing(ring, off, scale));
          } else if (Array.isArray(ring)) rings.push(ring);
        });
      });
    });
    return rings;
  }
  function buildLand(rings) {
    var path = new Path2D(), used = 0;
    rings.forEach(function (ring) {
      if (!ring || ring.length < 3) return;
      var pts = [], mn = 1e9, mx = -1e9, mnLat = 1e9;
      for (var i = 0; i < ring.length; i++) {
        var lon = ring[i][0], lat = ring[i][1];
        if (lon < 0) lon += 360; // 태평양 중심으로 펼침
        if (lon < mn) mn = lon; if (lon > mx) mx = lon; if (lat < mnLat) mnLat = lat;
        pts.push([lon, lat]);
      }
      if (mx - mn > 180) return;       // 그리니치를 가로지르는 고리(유럽·아프리카 일부)는 화면 밖이라 제외
      if (mx < 60 || mn > 320 || mnLat < -60) return;
      for (var j = 0; j < pts.length; j++) { var p = proj(pts[j][1], pts[j][0]); if (j) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); }
      path.closePath(); used++;
    });
    return used ? path : null;
  }
  var worldPromise = null;
  function loadWorld() {
    if (worldPromise) return worldPromise;
    worldPromise = new Promise(function (resolve, reject) {
      var had = Object.prototype.hasOwnProperty.call(global, 'echarts'), prev = global.echarts, done = false;
      function finish(err, data) {
        if (done) return; done = true;
        if (had) global.echarts = prev; else { try { delete global.echarts; } catch (e) { global.echarts = undefined; } }
        if (err) reject(err); else resolve(data);
      }
      if (prev && prev.registerMap && prev.getMap && prev.getMap('world')) { var m = prev.getMap('world'); finish(null, m.geoJson || m.geoJSON); return; }
      global.echarts = { registerMap: function (name, json) { if (name === 'world') { try { finish(null, decodeGeo(json)); } catch (e) { finish(e); } } } };
      var s = document.createElement('script');
      s.src = WORLD_URL; s.async = true;
      s.onload = function () { setTimeout(function () { finish(new Error('world map not registered')); }, 0); };
      s.onerror = function () { finish(new Error('world map failed to load')); };
      setTimeout(function () { finish(new Error('world map timeout')); }, 9000);
      document.head.appendChild(s);
    });
    return worldPromise;
  }

  /* ---------- 그리기 도우미 ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function spacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
  function hhmm(min) { return Math.floor(min / 60) + 'h ' + String(min % 60).padStart(2, '0') + 'm'; }

  /* ---------- 카메라 ---------- */
  var C0 = [W / 2, H / 2], KF = 1.55;
  function camera(time, P) {
    var w = smooth(3.2, 5.4, time) * (1 - smooth(14.6, 16.3, time));
    var mid = [(P_ICN[0] + P_LAX[0]) / 2, (P_ICN[1] + P_LAX[1]) / 2 - 60];
    var fx = P[0] * 0.72 + mid[0] * 0.28, fy = P[1] * 0.72 + mid[1] * 0.28 + 30;
    var hw = W / 2 / KF, hh = H / 2 / KF;
    fx = Math.max(hw, Math.min(W - hw, fx)); fy = Math.max(hh, Math.min(H - hh, fy));
    var k = Math.exp(Math.log(KF) * w);
    return { k: k, x: C0[0] + (fx - C0[0]) * w, y: C0[1] + (fy - C0[1]) * w };
  }
  function toScreen(cam, p) { return [(p[0] - cam.x) * cam.k + W / 2, (p[1] - cam.y) * cam.k + H / 2]; }

  /* ---------- 한 프레임 그리기(시간의 순수 함수: 탐색·재생이 항상 같은 그림) ---------- */
  function render(ctx, time, st) {
    time = Math.max(0, Math.min(DURATION, time));
    var t = progressAt(time), P = routeAt(t), cam = camera(time, P);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var g = ctx.createRadialGradient(W * 0.55, H * 0.42, 80, W * 0.55, H * 0.5, W * 0.75);
    g.addColorStop(0, C.oceanIn); g.addColorStop(1, C.oceanOut);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 월드 좌표계(카메라 적용)
    ctx.setTransform(cam.k, 0, 0, cam.k, W / 2 - cam.x * cam.k, H / 2 - cam.y * cam.k);
    var lw = 1 / cam.k;
    ctx.strokeStyle = C.grid; ctx.lineWidth = lw;
    ctx.beginPath();
    for (var lon = 110; lon <= 250; lon += 10) { var x = (lon - LON0) * PX; ctx.moveTo(x, -40); ctx.lineTo(x, H + 40); }
    for (var lat = 10; lat <= 70; lat += 10) { var y = proj(lat, 0)[1]; ctx.moveTo(-40, y); ctx.lineTo(W + 40, y); }
    ctx.stroke();
    // 날짜변경선
    ctx.setLineDash([6 * lw, 10 * lw]); ctx.strokeStyle = 'rgba(150,175,235,0.16)';
    ctx.beginPath(); ctx.moveTo((180 - LON0) * PX, -40); ctx.lineTo((180 - LON0) * PX, H + 40); ctx.stroke(); ctx.setLineDash([]);

    if (st.land) {
      ctx.fillStyle = C.land; ctx.fill(st.land);
      ctx.strokeStyle = C.coast; ctx.lineWidth = 1.3 * lw; ctx.lineJoin = 'round'; ctx.stroke(st.land);
    }
    // 지역 이름
    ctx.fillStyle = 'rgba(190,205,240,0.20)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 28px ' + FONT; spacing(ctx, 10);
    var po = proj(24, 170); ctx.fillText('NORTH PACIFIC OCEAN', po[0], po[1]);
    ctx.font = '600 22px ' + FONT; spacing(ctx, 10);
    if (st.land) {
      var as = proj(45, 112); ctx.fillText('ASIA', as[0], as[1]);
      var na = proj(56, 248); ctx.fillText('NORTH AMERICA', na[0] - 30, na[1]);
    }
    spacing(ctx, 0);

    // 남은 경로(회색 점선) → 이동한 경로(청록 실선)
    var q = routeIndex(t);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = C.remain; ctx.lineWidth = 3 * lw; ctx.setLineDash([12 * lw, 12 * lw]);
    ctx.beginPath(); ctx.moveTo(P[0], P[1]);
    for (var i = q.i + 1; i < ROUTE.length; i++) ctx.lineTo(ROUTE[i][0], ROUTE[i][1]);
    if (t < 0.9999) ctx.stroke();
    ctx.setLineDash([]);
    if (t > 0) {
      ctx.beginPath(); ctx.moveTo(ROUTE[0][0], ROUTE[0][1]);
      for (var j = 1; j <= q.i; j++) ctx.lineTo(ROUTE[j][0], ROUTE[j][1]);
      ctx.lineTo(P[0], P[1]);
      ctx.strokeStyle = C.tealSoft; ctx.lineWidth = 12 * lw; ctx.stroke();
      ctx.strokeStyle = C.teal; ctx.lineWidth = 5 * lw; ctx.stroke();
    }

    // 화면 좌표계
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var sI = toScreen(cam, P_ICN), sL = toScreen(cam, P_LAX), sP = toScreen(cam, P);
    function marker(s, pulseFrom, pulseTo) {
      if (time >= pulseFrom && time <= pulseTo) {
        for (var n = 0; n < 2; n++) {
          var ph = ((time - pulseFrom) / 1.6 + n * 0.5) % 1;
          ctx.beginPath(); ctx.arc(s[0], s[1], 14 + ph * 46, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(76,195,220,' + (0.55 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 2.5; ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(s[0], s[1], 13, 0, Math.PI * 2); ctx.fillStyle = C.navy; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = C.white; ctx.stroke();
      ctx.beginPath(); ctx.arc(s[0], s[1], 4.5, 0, Math.PI * 2); ctx.fillStyle = C.teal; ctx.fill();
    }
    marker(sI, 0.3, 3.6);
    marker(sL, 15.2, 18.1);

    // 공항 정보 카드
    function card(s, ap, appear, side, dim) {
      var a = easeOutCubic((time - appear) / 0.8) * dim; if (a <= 0.01) return;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = '600 22px ' + FONT; spacing(ctx, 3); var w2 = ctx.measureText(ap.name).width; spacing(ctx, 0);
      var cw = Math.max(w2, 120) + 48, ch = 108, dx = side > 0 ? 34 : -34 - cw, dy = 34 + (1 - a) * 14;
      var x0 = s[0] + dx, y0 = s[1] + dy;
      ctx.strokeStyle = C.cardLine; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s[0] + side * 12, s[1] + 12); ctx.lineTo(x0 + (side > 0 ? 0 : cw), y0 + 22); ctx.stroke();
      rr(ctx, x0, y0, cw, ch, 14); ctx.fillStyle = C.card; ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.white; ctx.font = '600 46px ' + MONO; ctx.fillText(ap.code, x0 + 24, y0 + 56);
      ctx.fillStyle = C.muted; ctx.font = '600 22px ' + FONT; spacing(ctx, 3); ctx.fillText(ap.name, x0 + 24, y0 + 88); spacing(ctx, 0);
      ctx.restore();
    }
    card(sI, AP.ICN, 0.6, 1, 1 - 0.45 * smooth(6, 7, time));
    card(sL, AP.LAX, 12.0, -1, 1);

    // 항공기(1대): 진행 방향으로 회전
    var appear = easeOutCubic((time - (T_DEP - 0.4)) / 0.7);
    if (appear > 0.01) {
      var back = routeAt(Math.max(0, t - 0.004)), fwd = routeAt(Math.min(1, t + 0.004));
      if (t >= 0.999) { back = ROUTE[ROUTE.length - 6]; fwd = ROUTE[ROUTE.length - 1]; }
      if (t <= 0.001) { back = ROUTE[0]; fwd = ROUTE[5]; }
      var ang = Math.atan2(fwd[1] - back[1], fwd[0] - back[0]) + Math.PI / 2;
      st.lastAngle = ang;
      ctx.save(); ctx.globalAlpha = appear; ctx.translate(sP[0], sP[1]); ctx.rotate(ang);
      var sc = 2.7 * (0.75 + 0.25 * appear); ctx.scale(sc, sc); ctx.translate(-12, -12);
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.white; ctx.fill(PLANE);
      ctx.shadowColor = 'transparent'; ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(31,42,92,0.9)'; ctx.stroke(PLANE);
      ctx.restore();
    }
    st.lastPlane = sP; st.lastT = t;

    // 글자가 경로와 겹쳐도 읽히도록 상·하단에 어두운 띠
    var gt = ctx.createLinearGradient(0, 0, 0, 280); gt.addColorStop(0, 'rgba(6,12,32,0.82)'); gt.addColorStop(1, 'rgba(6,12,32,0)');
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, 280);
    var gb = ctx.createLinearGradient(0, H - 190, 0, H); gb.addColorStop(0, 'rgba(6,12,32,0)'); gb.addColorStop(1, 'rgba(6,12,32,0.85)');
    ctx.fillStyle = gb; ctx.fillRect(0, H - 190, W, 190);

    // 상단 HUD
    var hudA = smooth(0, 0.8, time);
    ctx.save(); ctx.globalAlpha = hudA; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.teal; ctx.font = '700 24px ' + FONT; spacing(ctx, 6); ctx.fillText('UM LINK', 96, 104); spacing(ctx, 0);
    ctx.fillStyle = C.white; ctx.font = '600 52px ' + FONT; ctx.fillText('Flight Journey', 96, 164);
    ctx.fillStyle = C.muted; ctx.font = '500 24px ' + MONO; ctx.fillText(FLIGHT.no + '  ·  ' + FLIGHT.from + ' → ' + FLIGHT.to, 98, 206);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted; ctx.font = '500 22px ' + MONO;
    ctx.fillText('DEP ' + FLIGHT.depLocal + ' ' + FLIGHT.from + '   ARR ' + FLIGHT.arrLocal + ' ' + FLIGHT.to, W - 96, 104);
    ctx.fillStyle = C.faint; ctx.font = '500 18px ' + FONT; spacing(ctx, 2); ctx.fillText('LOCAL TIME  ·  BLOCK 11h 00m', W - 96, 136); spacing(ctx, 0);
    ctx.restore();

    // 하단 진행 막대
    var pct = Math.round(t * 100), el = Math.round(FLIGHT.durationMin * t), rem = FLIGHT.durationMin - el;
    var bx = 96, bw = W - 192, by = 988;
    ctx.save(); ctx.globalAlpha = hudA;
    rr(ctx, bx, by, bw, 8, 4); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    if (t > 0) { rr(ctx, bx, by, Math.max(8, bw * t), 8, 4); ctx.fillStyle = C.teal; ctx.fill(); }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = C.white; ctx.font = '600 22px ' + FONT; spacing(ctx, 3);
    var status = t <= 0 ? 'READY FOR DEPARTURE' : t >= 1 ? 'ARRIVED  ·  ' + FLIGHT.arrLocal + ' LAX' : 'IN FLIGHT';
    ctx.fillText(status, bx, by - 20); spacing(ctx, 0);
    ctx.fillStyle = C.muted; ctx.font = '500 22px ' + MONO;
    ctx.fillText(String(pct).padStart(3, ' ') + '%', bx + 330, by - 20);
    ctx.textAlign = 'right';
    ctx.fillText('ELAPSED ' + hhmm(el) + '   REMAINING ' + hhmm(rem), bx + bw, by - 20);
    ctx.fillStyle = C.faint; ctx.font = '500 17px ' + FONT;
    ctx.fillText(st.land ? '공항 좌표 기반 시각화 시뮬레이션 · 실제 운항 항적이 아니에요 · Map data: Apache ECharts world map'
                         : '공항 좌표 기반 시각화 시뮬레이션 · 실제 운항 항적이 아니에요 · 해안선 데이터 없이 경위도 격자만 표시', bx + bw, by + 46);
    ctx.restore();

    // 도착 완료
    var done = easeOutCubic((time - 16.0) / 0.9);
    if (done > 0.01) {
      ctx.save(); ctx.globalAlpha = done; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var cy = 318 - (1 - done) * 18;
      ctx.fillStyle = 'rgba(6,12,32,0.55)'; rr(ctx, W / 2 - 470, cy - 92, 940, 150, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(76,195,220,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.white; ctx.font = '600 52px ' + FONT; spacing(ctx, 8);
      ctx.fillText('FLIGHT JOURNEY COMPLETED', W / 2 + 4, cy - 12); spacing(ctx, 0);
      ctx.fillStyle = C.teal; ctx.font = '600 38px ' + MONO; ctx.fillText('ICN → LAX', W / 2, cy + 40);
      ctx.restore();
    }
  }

  /* ---------- 재생기 UI ---------- */
  var CSS = '' +
    '.ufj{--ufj-bg:#0b1430;--ufj-bar:#111c3d;--ufj-ink:#eef2fb;--ufj-muted:#a9b4d4;--ufj-line:#26335f;--ufj-accent:#4cc3dc;' +
    'position:relative;background:var(--ufj-bg);color:var(--ufj-ink);border-radius:16px;overflow:hidden;border:1px solid var(--ufj-line);font-family:' + FONT + ';max-width:100%;outline:none}' +
    '.ufj:focus-visible{box-shadow:0 0 0 3px var(--ufj-accent)}' +
    '.ufj-stage{position:relative;width:100%;aspect-ratio:16/9;max-width:100%;background:#060c20}' +
    '.ufj-stage canvas{display:block;width:100%;height:100%}' +
    '.ufj-big{position:absolute;inset:0;margin:auto;width:84px;height:84px;border-radius:50%;border:0;background:rgba(76,195,220,.92);color:#06202b;cursor:pointer;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.4)}' +
    '.ufj-big svg{width:34px;height:34px;margin-left:5px;fill:currentColor}' +
    '.ufj-big[hidden]{display:none}' +
    '.ufj-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--ufj-bar);flex-wrap:wrap}' +
    '.ufj-btn{font:inherit;font-size:13px;font-weight:600;min-height:34px;padding:0 12px;border-radius:9px;border:1px solid var(--ufj-line);background:transparent;color:var(--ufj-ink);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}' +
    '.ufj-btn:hover{border-color:var(--ufj-accent)}' +
    '.ufj-btn.on{background:var(--ufj-accent);border-color:var(--ufj-accent);color:#06202b}' +
    '.ufj-btn.main{background:var(--ufj-accent);border-color:var(--ufj-accent);color:#06202b;min-width:92px;justify-content:center}' +
    '.ufj-btn[disabled]{opacity:.45;cursor:not-allowed}' +
    '.ufj-btn svg{width:14px;height:14px;fill:currentColor}' +
    '.ufj-time{font-family:' + MONO + ';font-size:13px;color:var(--ufj-muted);font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.ufj-seek{flex:1 1 160px;min-width:120px;accent-color:var(--ufj-accent);margin:0}' +
    '.ufj-note{width:100%;font-size:12px;color:var(--ufj-muted);line-height:1.5}' +
    '.ufj-rec{color:#ffb4b4}' +
    '.ufj-modal{position:fixed;inset:0;z-index:2000;background:rgba(4,8,22,.86);display:grid;place-items:center;' +
    'padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}' +
    '.ufj-modal-in{width:min(1280px,100%,calc((100vh - 170px) * 16 / 9));display:grid;gap:10px}' +
    '.ufj-modal-top{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#eef2fb;font-family:' + FONT + '}' +
    '.ufj-modal-top b{font-size:15px}' +
    '.ufj-x{font:inherit;width:40px;height:40px;border-radius:10px;border:1px solid #3a4874;background:transparent;color:#fff;font-size:18px;cursor:pointer}' +
    '@media (max-width:520px){.ufj-bar{gap:8px;padding:8px}.ufj-btn{padding:0 9px}.ufj-hide-sm{display:none}}';
  function injectCSS() { if (document.getElementById('ufj-css')) return; var s = document.createElement('style'); s.id = 'ufj-css'; s.textContent = CSS; document.head.appendChild(s); }
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>'
  };
  function fmt(s) { s = Math.max(0, Math.min(DURATION, s)); var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }
  function canDownload() { try { return global.top === global.self; } catch (e) { return false; } }
  function pickMime() {
    if (!global.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
    var list = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }

  function mount(el, opts) {
    opts = opts || {};
    injectCSS();
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.createElement('div');
    root.className = 'ufj'; root.tabIndex = 0;
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'UM LINK Flight Journey 애니메이션, ICN에서 LAX까지 18초');
    root.innerHTML =
      '<div class="ufj-stage"><canvas width="' + W + '" height="' + H + '" role="img" aria-label="인천국제공항에서 로스앤젤레스 국제공항까지 항공기 1대가 태평양을 건너는 경로 애니메이션"></canvas>' +
      '<button class="ufj-big" type="button" aria-label="재생">' + ICON.play + '</button></div>' +
      '<div class="ufj-bar">' +
      '<button class="ufj-btn main" type="button" data-u="play">' + ICON.play + '<span>재생</span></button>' +
      '<button class="ufj-btn" type="button" data-u="restart" aria-label="처음부터">' + ICON.restart + '<span class="ufj-hide-sm">처음부터</span></button>' +
      '<input class="ufj-seek" type="range" min="0" max="' + (DURATION * 1000) + '" step="10" value="0" aria-label="재생 위치">' +
      '<span class="ufj-time">0:00 / ' + fmt(DURATION) + '</span>' +
      '<button class="ufj-btn" type="button" data-u="loop" aria-pressed="false">반복</button>' +
      '<button class="ufj-btn ufj-hide-sm" type="button" data-u="fs">전체화면</button>' +
      '<button class="ufj-btn" type="button" data-u="rec" hidden>영상 파일로 저장</button>' +
      '<div class="ufj-note" aria-live="polite">지도 불러오는 중…</div></div>';
    el.appendChild(root);
    var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    var big = root.querySelector('.ufj-big'), btnPlay = root.querySelector('[data-u="play"]'), seek = root.querySelector('.ufj-seek');
    var timeEl = root.querySelector('.ufj-time'), note = root.querySelector('.ufj-note');
    var btnLoop = root.querySelector('[data-u="loop"]'), btnRec = root.querySelector('[data-u="rec"]'), btnFs = root.querySelector('[data-u="fs"]');
    var st = { land: null, mapState: 'loading' };
    var S = { time: 0, playing: false, loop: !!opts.loop, last: 0, raf: 0, recording: null, seeking: false, destroyed: false };
    var mime = pickMime(), allowSave = canDownload() && !!mime && !!cv.captureStream;

    function baseNote() {
      var m = st.mapState === 'ready' ? '해안선: Apache ECharts world 지도 데이터' : st.mapState === 'failed' ? '해안선 데이터를 불러오지 못해 경위도 격자만 표시해요' : '지도 불러오는 중…';
      var save = allowSave ? '' : (canDownload() ? ' · 이 브라우저는 영상 저장을 지원하지 않아요' : ' · 영상 파일 저장은 ZIP으로 받은 사이트(직접 연 페이지)에서 쓸 수 있어요');
      return '공항 좌표 기반 시각화 시뮬레이션 · ' + m + save;
    }
    function draw() { render(ctx, S.time, st); }
    function ui() {
      btnPlay.innerHTML = (S.playing ? ICON.pause + '<span>일시정지</span>' : ICON.play + '<span>' + (S.time >= DURATION ? '다시 보기' : S.time > 0 ? '계속 재생' : '재생') + '</span>');
      btnPlay.setAttribute('aria-label', S.playing ? '일시정지' : '재생');
      big.hidden = S.playing || (S.time > 0 && S.time < DURATION);
      big.setAttribute('aria-label', S.time >= DURATION ? '다시 보기' : '재생');
      if (!S.seeking) seek.value = Math.round(S.time * 1000);
      seek.setAttribute('aria-valuetext', fmt(S.time) + ' / ' + fmt(DURATION));
      timeEl.textContent = fmt(S.time) + ' / ' + fmt(DURATION);
      btnLoop.classList.toggle('on', S.loop); btnLoop.setAttribute('aria-pressed', S.loop);
      var rec = !!S.recording;
      [btnPlay, seek, btnLoop, root.querySelector('[data-u="restart"]')].forEach(function (b) { b.disabled = rec; });
      btnRec.hidden = !allowSave; btnRec.disabled = rec;
      btnRec.textContent = rec ? '녹화 중…' : (mime && mime.indexOf('mp4') >= 0 ? 'MP4로 저장' : 'WebM으로 저장');
    }
    function frame(now) {
      if (S.destroyed) return;
      if (S.playing) {
        var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0; S.last = now;
        S.time += dt;
        if (S.time >= DURATION) {
          S.time = DURATION;
          if (S.recording) { draw(); S.playing = false; stopRec(); }
          else if (S.loop) { draw(); S.time = DURATION; S.playing = false; setTimeout(function () { if (S.loop && !S.playing && S.time >= DURATION) { S.time = 0; play(); } }, 1400); }
          else S.playing = false;
        }
        draw(); ui();
      }
      S.raf = requestAnimationFrame(frame);
    }
    function play() { if (S.time >= DURATION) S.time = 0; S.playing = true; S.last = 0; ui(); }
    function pause() { S.playing = false; ui(); draw(); }
    function toggle() { if (S.playing) pause(); else play(); }
    function seekTo(s) { S.time = Math.max(0, Math.min(DURATION, s)); draw(); ui(); }
    function startRec() {
      if (!allowSave || S.recording) return;
      var stream = cv.captureStream(30), chunks = [];
      var rec;
      try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 }); }
      catch (e) { note.textContent = '영상 녹화를 시작하지 못했어요. 다른 브라우저(Chrome 권장)에서 시도해 주세요.'; return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        var type = mime.split(';')[0], blob = new Blob(chunks, { type: type });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'UM-LINK-Flight-Journey-ICN-LAX.' + (type === 'video/mp4' ? 'mp4' : 'webm');
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        S.recording = null; note.textContent = '영상 파일을 저장했어요 (' + (blob.size / 1048576).toFixed(1) + 'MB, 1920×1080). ' + baseNote(); ui();
      };
      S.recording = rec; S.time = 0; draw();
      rec.start(250); note.textContent = '녹화 중이에요. 18초 동안 이 화면을 그대로 두세요.';
      play();
    }
    function stopRec() { if (S.recording && S.recording.state !== 'inactive') S.recording.stop(); }

    big.addEventListener('click', function () { play(); root.focus({ preventScroll: true }); });
    btnPlay.addEventListener('click', toggle);
    root.querySelector('[data-u="restart"]').addEventListener('click', function () { S.time = 0; play(); });
    btnLoop.addEventListener('click', function () { S.loop = !S.loop; ui(); });
    btnRec.addEventListener('click', startRec);
    btnFs.addEventListener('click', function () {
      var stage = root.querySelector('.ufj-stage'), req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
      if (req) { try { var r = req.call(stage); if (r && r.catch) r.catch(function () { note.textContent = '이 화면에서는 전체화면을 쓸 수 없어요. ' + baseNote(); }); } catch (e) {} }
    });
    seek.addEventListener('input', function () { S.seeking = true; seekTo(+seek.value / 1000); });
    seek.addEventListener('change', function () { S.seeking = false; ui(); });
    root.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(S.time + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(S.time - 1); }
      else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
      else if (e.key === 'End') { e.preventDefault(); seekTo(DURATION); }
    });

    var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
      document.fonts.load('600 52px "IBM Plex Sans KR"'), document.fonts.load('600 46px "IBM Plex Mono"'), document.fonts.load('500 22px "IBM Plex Mono"')
    ]).catch(function () {}) : Promise.resolve();
    fontsReady.then(function () { if (!S.playing) draw(); });
    loadWorld().then(function (rings) { st.land = buildLand(rings); st.mapState = st.land ? 'ready' : 'failed'; })
      .catch(function () { st.mapState = 'failed'; })
      .then(function () { if (!S.recording) note.textContent = baseNote(); if (!S.playing) draw(); });

    if (typeof opts.start === 'number') S.time = opts.start;
    draw(); ui(); note.textContent = baseNote();
    S.raf = requestAnimationFrame(frame);

    var io = null;
    if (opts.autoplay && !reduce) {
      if (opts.autoplay === 'visible' && global.IntersectionObserver) {
        io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && !S.playing && S.time === 0) play(); }); }, { threshold: 0.5 });
        io.observe(root);
      } else play();
    }
    var api = {
      el: root, play: play, pause: pause, seek: seekTo, duration: DURATION,
      get time() { return S.time; }, get playing() { return S.playing; },
      _state: st, _progressAt: progressAt, _routeAt: routeAt, _toScreen: function (time) { var tt = progressAt(time), P = routeAt(tt); return toScreen(camera(time, P), P); },
      destroy: function () { S.destroyed = true; stopRec(); cancelAnimationFrame(S.raf); if (io) io.disconnect(); root.remove(); }
    };
    return api;
  }

  function openModal(opts) {
    injectCSS();
    var last = document.activeElement;
    var m = document.createElement('div');
    m.className = 'ufj-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'UM LINK Flight Journey');
    m.innerHTML = '<div class="ufj-modal-in"><div class="ufj-modal-top"><b>UM LINK — Flight Journey · ICN → LAX</b><button class="ufj-x" type="button" aria-label="닫기">✕</button></div><div class="ufj-slot"></div></div>';
    document.body.appendChild(m);
    var p = mount(m.querySelector('.ufj-slot'), Object.assign({ autoplay: true }, opts || {}));
    function close() { p.destroy(); m.remove(); document.removeEventListener('keydown', onKey); if (last && last.focus) last.focus(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    m.querySelector('.ufj-x').addEventListener('click', close);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    document.addEventListener('keydown', onKey);
    p.el.focus({ preventScroll: true });
    return { player: p, close: close };
  }

  global.UMFlightJourney = { mount: mount, openModal: openModal, render: render, DURATION: DURATION, _decodeGeo: decodeGeo, _loadWorld: loadWorld };
})(window);
