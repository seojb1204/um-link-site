/* ============================================================
 * UM LINK · DB 설정
 * ------------------------------------------------------------
 * 여기만 고치면 됩니다. 다른 파일은 건드릴 필요 없습니다.
 *
 * [정적 모드]  url, anonKey 를 비워두면 => 기존처럼 브라우저
 *              저장소만 사용합니다. 인터넷 없이도 동작합니다.
 *
 * [실시간 모드] url, anonKey 를 채우면 => Supabase에 연결해서
 *              여러 기기가 같은 데이터를 봅니다.
 *
 * 값 찾는 곳: Supabase 대시보드 > Project Settings > API Keys
 *   - url     : "Project URL"
 *   - anonKey : "Publishable key" (sb_publishable_... 로 시작)
 *
 * 2025년부터 Supabase 키 이름이 바뀌었습니다. 둘 다 그대로 동작합니다.
 *   새 이름: Publishable key (sb_publishable_...)  <- 지금 쓰는 것
 *   옛 이름: anon / public key (eyJ... JWT 형식)
 *
 * ⚠️  이 키는 공개되는 키입니다. 프론트엔드에 박히는 게 정상입니다.
 * ⚠️  Secret key (sb_secret_...) 또는 service_role 키는 절대 넣지 마세요.
 *     그 키들은 모든 권한 정책(RLS)을 무시합니다.
 * ============================================================ */

window.UMLINK_DB_CONFIG = {
  // Project URL (대시보드 주소창의 .../project/ 뒤 문자열 + .supabase.co)
  url: 'https://cqtexrvrizrpbavseont.supabase.co',

  // Publishable key
  anonKey: 'sb_publishable_Ofy6Mh6dKUejoN7Xz9hDyg_vJjqJZY8',

  // 공유 상태 행의 id. 여러 팀이 한 프로젝트를 나눠 쓸 때만 바꾸세요.
  // (예: 'team-a' 로 두면 다른 데모와 데이터가 섞이지 않습니다)
  stateId: 'default',

  // 정규화 테이블(status_logs, handovers 등)에도 기록을 쌓을지 여부.
  // true 로 두면 Supabase Table Editor에서 실제 행이 보입니다.
  // 심사에서 DB를 직접 보여줄 거면 true 로 두세요.
  mirror: true,

  // Supabase JS 라이브러리 (CDN). 버전 고정.
  sdkUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js',

  // 연결 실패 시 몇 ms 뒤에 정적 모드로 떨어질지
  connectTimeoutMs: 8000,
};
