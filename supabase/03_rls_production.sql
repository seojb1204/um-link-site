-- ============================================================
-- UM LINK · 실서비스용 권한 설계 (참고 자료)
-- ============================================================
--
--  ⚠️  이 파일은 시연 프로젝트에 그대로 실행하지 마세요.
--
--  01_schema.sql 은 시연을 위해 사용자 ID를 text('g1','c1')로 뒀고,
--  로그인 없이 화면에서 사용자를 전환합니다.
--  반면 실서비스는 Supabase Auth(auth.users, uuid)를 기준으로
--  권한을 걸어야 합니다. 두 구조가 달라서 섞을 수 없습니다.
--
--  이 파일의 용도:
--   - 심사에서 "권한 분리를 어떻게 했냐"는 질문에 보여줄 설계도
--   - 공모전 이후 실제 구현으로 넘어갈 때의 출발점
--
--  핵심 원칙: 권한을 앱 코드가 아니라 DB가 강제한다.
--  프론트엔드 코드를 조작해도 남의 아이 정보는 못 가져갑니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. 사용자 프로필 (auth.users 확장)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  role        text        not null,
  name        text        not null,
  emp_no      text,
  org         text,
  airline_id  text,                 -- 소속 항공사 (멀티 테넌트 대비)
  created_at  timestamptz not null default now(),
  constraint profiles_role_chk check (role in ('guardian','crew','ground','admin'))
);

alter table public.profiles enable row level security;

-- 본인 프로필만 조회
create policy profiles_self on public.profiles
  for select to authenticated using (id = auth.uid());


-- ------------------------------------------------------------
-- 2. 권한 판정 함수
-- ------------------------------------------------------------
-- security definer + search_path 고정이 중요합니다.
-- 이게 없으면 정책 안에서 profiles를 읽을 때 RLS가 다시 걸려
-- 무한 재귀가 발생합니다.

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_name() = 'admin', false);
$$;

-- 이 아동의 보호자인가?
create or replace function public.is_guardian_of(target_child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardianships g
    where g.child_id = target_child
      and g.guardian_id = auth.uid()
  );
$$;

-- 이 아동의 담당 승무원·지상직원인가?
-- 중요: 담당이어도 "배정된 기간 안"에서만 접근 가능하게 제한합니다.
-- 비행이 끝난 뒤에도 승무원이 계속 열람할 수 있으면 안 됩니다.
create or replace function public.is_assigned_staff_of(target_child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_assignments a
    where a.child_id = target_child
      and a.staff_id = auth.uid()
      and now() between a.valid_from and a.valid_until
  );
$$;


-- ------------------------------------------------------------
-- 3. 배정 테이블 (기간이 있는 담당 관계)
-- ------------------------------------------------------------
create table if not exists public.staff_assignments (
  id          uuid        primary key default gen_random_uuid(),
  staff_id    uuid        not null references public.profiles(id) on delete cascade,
  child_id    uuid        not null,
  role_at     text        not null,          -- crew / ground_departure / ground_arrival
  valid_from  timestamptz not null,
  valid_until timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint staff_assignments_window_chk check (valid_until > valid_from)
);

create index if not exists staff_assignments_lookup_idx
  on public.staff_assignments(child_id, staff_id, valid_from, valid_until);


-- ------------------------------------------------------------
-- 4. 아동 정보 접근 정책
-- ------------------------------------------------------------
--   보호자: 자기 아이만
--   승무원: 담당 배정 기간 안의 아이만
--   관리자: 전체
--   그 외:  아무것도 안 보임 (정책이 없으면 기본 거부)

-- create policy children_guardian_read on public.um_children
--   for select to authenticated
--   using (public.is_guardian_of(id));
--
-- create policy children_staff_read on public.um_children
--   for select to authenticated
--   using (public.is_assigned_staff_of(id));
--
-- create policy children_admin_all on public.um_children
--   for all to authenticated
--   using (public.is_admin()) with check (public.is_admin());


-- ------------------------------------------------------------
-- 5. 상태 기록 정책 (쓰기는 담당 직원만, 수정은 아무도 못 함)
-- ------------------------------------------------------------
-- create policy status_read on public.status_logs
--   for select to authenticated
--   using (public.is_guardian_of(child_id)
--       or public.is_assigned_staff_of(child_id)
--       or public.is_admin());
--
-- create policy status_write on public.status_logs
--   for insert to authenticated
--   with check (public.is_assigned_staff_of(child_id));
--
-- UPDATE / DELETE 정책을 만들지 않습니다.
-- => 한번 기록된 상태·인계는 누구도 고칠 수 없습니다.
--    이것이 "인계 기록의 추적 가능성"을 DB가 보장하는 방식입니다.


-- ------------------------------------------------------------
-- 6. 사진 접근 정책 (동의 + 결제 두 조건을 DB가 검사)
-- ------------------------------------------------------------
-- 보호자가 사진을 볼 수 있는 조건:
--   (1) 촬영·보관 동의가 유효하고 (철회되지 않았고)
--   (2) 사진 패키지 결제가 활성 상태
-- 이 검사를 프론트엔드에 두면 우회됩니다. DB에 둬야 합니다.

-- create policy media_guardian_read on public.media_assets
--   for select to authenticated
--   using (
--     public.is_guardian_of(child_id)
--     and deleted = false
--     and exists (
--       select 1 from public.consents c
--       where c.child_id = media_assets.child_id
--         and c.shoot_granted = true
--         and c.shoot_withdrawn_at is null
--         and now() < c.created_at + (c.retention_days || ' days')::interval
--     )
--     and exists (
--       select 1 from public.orders o
--       where o.child_id = media_assets.child_id
--         and o.product_id = 'p_photo'
--         and o.status = 'active'
--     )
--   );


-- ------------------------------------------------------------
-- 7. 보관기간 만료 자동 삭제
-- ------------------------------------------------------------
-- 동의서에 적은 보관기간(기본 90일)을 실제로 지키는 장치입니다.
-- pg_cron 확장을 켜고 하루 1회 실행합니다.
--
-- create or replace function public.purge_expired_media()
-- returns integer
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   n integer;
-- begin
--   with expired as (
--     update public.media_assets m
--        set deleted = true, storage_path = null
--      where m.deleted = false
--        and exists (
--          select 1 from public.consents c
--           where c.child_id = m.child_id
--             and (c.shoot_withdrawn_at is not null
--               or now() > c.created_at + (c.retention_days || ' days')::interval)
--        )
--      returning 1
--   )
--   select count(*) into n from expired;
--   return n;
-- end $$;
--
-- select cron.schedule('purge-expired-media', '0 3 * * *',
--                      $$select public.purge_expired_media()$$);


-- ============================================================
-- 발표에서 쓸 수 있는 요약
-- ============================================================
--  1. 권한을 앱이 아니라 DB가 강제  → 프론트 조작으로 우회 불가
--  2. 상태·인계 기록은 추가 전용    → 사후 수정 불가, 책임 추적 가능
--  3. 담당 관계에 유효기간          → 비행 종료 후 승무원 열람 차단
--  4. 사진 열람에 동의+결제 이중검사 → 동의 철회 즉시 접근 차단
--  5. 보관기간 만료 자동 삭제       → 동의서 내용을 시스템이 이행
-- ============================================================
