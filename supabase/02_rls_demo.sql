-- ============================================================
-- UM LINK · RLS 정책 (시연 모드) — 펼쳐 쓴 버전
-- 실행 순서: 01_schema.sql 다음에 실행
-- 여러 번 실행해도 안전합니다 (drop policy if exists 포함).
-- ============================================================
--
--  ⚠️  시연 전용 정책입니다.
--  시연 앱은 Supabase Auth를 쓰지 않고 화면에서 사용자를 전환하므로,
--  비로그인(anon) 키로 읽고 쓸 수 있게 열어 둡니다.
--
--  그래서 반드시 지킬 것:
--   1. 실제 아동 이름·나이·사진·보호자 연락처를 넣지 마세요.
--   2. 가상 데이터와 AI 생성 이미지만 사용하세요.
--   3. Secret key(sb_secret_...)는 절대 프론트엔드에 넣지 마세요.
--
--  실서비스용 정책은 03_rls_production.sql 을 보세요.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 모든 테이블 RLS 켜기
-- ------------------------------------------------------------
alter table public.demo_state enable row level security;
alter table public.status_logs enable row level security;
alter table public.handovers enable row level security;
alter table public.flights enable row level security;
alter table public.app_users enable row level security;
alter table public.um_children enable row level security;
alter table public.guardianships enable row level security;
alter table public.consents enable row level security;
alter table public.consent_history enable row level security;
alter table public.media_assets enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.pickup_codes enable row level security;
alter table public.privacy_requests enable row level security;

-- ------------------------------------------------------------
-- 2. 공유 상태 — 읽기 + 추가 + 수정 (삭제 없음)
-- ------------------------------------------------------------
drop policy if exists demo_state_read   on public.demo_state;
drop policy if exists demo_state_insert on public.demo_state;
drop policy if exists demo_state_update on public.demo_state;
create policy demo_state_read   on public.demo_state for select to anon, authenticated using (true);
create policy demo_state_insert on public.demo_state for insert to anon, authenticated with check (true);
create policy demo_state_update on public.demo_state for update to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 3. 추가 전용 테이블 — 읽기 + 추가만
--    수정·삭제 정책이 없으므로 한번 쌓인 기록은 바뀌지 않습니다.
--    = "인계 기록은 사후 수정 불가"를 DB가 강제합니다.
-- ------------------------------------------------------------
drop policy if exists status_logs_read   on public.status_logs;
drop policy if exists status_logs_insert on public.status_logs;
create policy status_logs_read   on public.status_logs for select to anon, authenticated using (true);
create policy status_logs_insert on public.status_logs for insert to anon, authenticated with check (true);

drop policy if exists handovers_read   on public.handovers;
drop policy if exists handovers_insert on public.handovers;
create policy handovers_read   on public.handovers for select to anon, authenticated using (true);
create policy handovers_insert on public.handovers for insert to anon, authenticated with check (true);

-- ------------------------------------------------------------
-- 4. 일반 테이블 — 읽기 + 추가 + 수정 (삭제 없음)
-- ------------------------------------------------------------
drop policy if exists flights_read   on public.flights;
drop policy if exists flights_insert on public.flights;
drop policy if exists flights_update on public.flights;
create policy flights_read   on public.flights for select to anon, authenticated using (true);
create policy flights_insert on public.flights for insert to anon, authenticated with check (true);
create policy flights_update on public.flights for update to anon, authenticated using (true) with check (true);

drop policy if exists app_users_read   on public.app_users;
drop policy if exists app_users_insert on public.app_users;
drop policy if exists app_users_update on public.app_users;
create policy app_users_read   on public.app_users for select to anon, authenticated using (true);
create policy app_users_insert on public.app_users for insert to anon, authenticated with check (true);
create policy app_users_update on public.app_users for update to anon, authenticated using (true) with check (true);

drop policy if exists um_children_read   on public.um_children;
drop policy if exists um_children_insert on public.um_children;
drop policy if exists um_children_update on public.um_children;
create policy um_children_read   on public.um_children for select to anon, authenticated using (true);
create policy um_children_insert on public.um_children for insert to anon, authenticated with check (true);
create policy um_children_update on public.um_children for update to anon, authenticated using (true) with check (true);

drop policy if exists guardianships_read   on public.guardianships;
drop policy if exists guardianships_insert on public.guardianships;
drop policy if exists guardianships_update on public.guardianships;
create policy guardianships_read   on public.guardianships for select to anon, authenticated using (true);
create policy guardianships_insert on public.guardianships for insert to anon, authenticated with check (true);
create policy guardianships_update on public.guardianships for update to anon, authenticated using (true) with check (true);

drop policy if exists consents_read   on public.consents;
drop policy if exists consents_insert on public.consents;
drop policy if exists consents_update on public.consents;
create policy consents_read   on public.consents for select to anon, authenticated using (true);
create policy consents_insert on public.consents for insert to anon, authenticated with check (true);
create policy consents_update on public.consents for update to anon, authenticated using (true) with check (true);

drop policy if exists consent_history_read   on public.consent_history;
drop policy if exists consent_history_insert on public.consent_history;
drop policy if exists consent_history_update on public.consent_history;
create policy consent_history_read   on public.consent_history for select to anon, authenticated using (true);
create policy consent_history_insert on public.consent_history for insert to anon, authenticated with check (true);
create policy consent_history_update on public.consent_history for update to anon, authenticated using (true) with check (true);

drop policy if exists media_assets_read   on public.media_assets;
drop policy if exists media_assets_insert on public.media_assets;
drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_read   on public.media_assets for select to anon, authenticated using (true);
create policy media_assets_insert on public.media_assets for insert to anon, authenticated with check (true);
create policy media_assets_update on public.media_assets for update to anon, authenticated using (true) with check (true);

drop policy if exists orders_read   on public.orders;
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update on public.orders;
create policy orders_read   on public.orders for select to anon, authenticated using (true);
create policy orders_insert on public.orders for insert to anon, authenticated with check (true);
create policy orders_update on public.orders for update to anon, authenticated using (true) with check (true);

drop policy if exists notifications_read   on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_read   on public.notifications for select to anon, authenticated using (true);
create policy notifications_insert on public.notifications for insert to anon, authenticated with check (true);
create policy notifications_update on public.notifications for update to anon, authenticated using (true) with check (true);

drop policy if exists pickup_codes_read   on public.pickup_codes;
drop policy if exists pickup_codes_insert on public.pickup_codes;
drop policy if exists pickup_codes_update on public.pickup_codes;
create policy pickup_codes_read   on public.pickup_codes for select to anon, authenticated using (true);
create policy pickup_codes_insert on public.pickup_codes for insert to anon, authenticated with check (true);
create policy pickup_codes_update on public.pickup_codes for update to anon, authenticated using (true) with check (true);

drop policy if exists privacy_requests_read   on public.privacy_requests;
drop policy if exists privacy_requests_insert on public.privacy_requests;
drop policy if exists privacy_requests_update on public.privacy_requests;
create policy privacy_requests_read   on public.privacy_requests for select to anon, authenticated using (true);
create policy privacy_requests_insert on public.privacy_requests for insert to anon, authenticated with check (true);
create policy privacy_requests_update on public.privacy_requests for update to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 5. 결과 확인 — 이 쿼리가 함께 실행되어 결과를 보여줍니다
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables where table_schema = 'public') as 테이블,
  (select count(*) from pg_policies where schemaname = 'public')                 as 정책,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public')              as 실시간;
