-- ============================================================
-- UM LINK · Supabase 스키마
-- 실행 위치: Supabase 대시보드 > SQL Editor > New query
-- 실행 순서: 01_schema.sql -> 02_rls_demo.sql
-- ============================================================
-- 주의: 이 스키마에 들어가는 모든 데이터는 시연용 가상 데이터입니다.
--       실제 아동의 이름·사진·보호자 연락처를 넣지 마세요.
-- ============================================================

-- ------------------------------------------------------------
-- 0. 공유 상태 테이블 (기기 간 실시간 동기화의 핵심)
-- ------------------------------------------------------------
-- 시연 앱은 상태 전체를 하나의 JSON으로 들고 있습니다.
-- 이 테이블 1행을 모든 기기가 공유하면 노트북(승무원)과
-- 휴대폰(보호자)이 같은 데이터를 보게 됩니다.
create table if not exists public.demo_state (
  id          text        primary key default 'default',
  rev         bigint      not null default 0,
  state       jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

comment on table public.demo_state is
  '시연 앱 공유 상태. 기기 간 실시간 동기화용. 실서비스에서는 사용하지 않음.';

-- ------------------------------------------------------------
-- 1. 항공편
-- ------------------------------------------------------------
create table if not exists public.flights (
  id            text        primary key,
  flight_no     text        not null,
  from_iata     text        not null,
  from_city     text,
  to_iata       text        not null,
  to_city       text,
  -- 출발·도착은 각 공항의 '현지 시각' 문자열("14:30")로 둡니다.
  -- 시차가 있어서 절대 시각으로 바꾸면 도착 시각이 틀어집니다.
  dep_local     text        not null,
  arr_local     text        not null,
  duration_min  integer     not null,
  delay_min     integer     not null default 0,
  gate          text,
  arr_gate      text,
  phase         text        not null default 'scheduled',
  created_at    timestamptz not null default now(),
  constraint flights_phase_chk check (
    phase in ('scheduled','checkin','boarding','enroute','landed','handed_over')
  )
);

-- ------------------------------------------------------------
-- 2. 앱 사용자 (시연용)
-- ------------------------------------------------------------
-- 실서비스에서는 auth.users + profiles 구조로 대체됩니다.
-- (03_rls_production.sql 참고)
create table if not exists public.app_users (
  id          text        primary key,
  role        text        not null,
  name        text        not null,
  login       text        unique,
  relation    text,                  -- 보호자: 모 / 부 등
  emp_no      text,                  -- 승무원·지상직원 사번
  org         text,                  -- 소속
  notify      boolean     not null default true,
  created_at  timestamptz not null default now(),
  -- pickup = 도착지에서 아이를 데려가는 가족. 항공사 직원이 아닙니다.
  constraint app_users_role_chk check (role in ('guardian','crew','ground','admin','pickup'))
);

-- ------------------------------------------------------------
-- 2-1. 인수 코드 (최종 인계 확인)
-- ------------------------------------------------------------
-- 보호자가 발급하고 인수자가 입력하는 1회용 코드입니다.
-- 지상직원은 이 절차에 관여하지 않습니다.
create table if not exists public.pickup_codes (
  id           text        primary key,
  child_id     text        not null,
  code         text        not null,
  issued_by    text,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by_name text,   -- 아이를 데려간 인수자 (보호자가 지정한 사람)
  verified_by  text,   -- 코드를 확인한 도착지 지상직원
  constraint pickup_codes_window_chk check (expires_at > issued_at)
);

create index if not exists pickup_codes_child_idx on public.pickup_codes(child_id, issued_at desc);

-- ------------------------------------------------------------
-- 3. 비동반 소아 (UM)
-- ------------------------------------------------------------
create table if not exists public.um_children (
  id            text        primary key,
  code          text        not null unique,   -- UM-0001
  name          text        not null,
  age           integer     not null,
  seat          text,
  flight_id     text        references public.flights(id) on delete set null,
  crew_id       text        references public.app_users(id) on delete set null,
  escort_id     text        references public.app_users(id) on delete set null,
  stage         integer     not null default 0,
  pickup_name   text,                          -- 도착지 인수자
  created_at    timestamptz not null default now(),
  constraint um_children_age_chk   check (age between 0 and 17),
  constraint um_children_stage_chk check (stage between 0 and 6)
);

create index if not exists um_children_flight_idx on public.um_children(flight_id);
create index if not exists um_children_crew_idx   on public.um_children(crew_id);

-- ------------------------------------------------------------
-- 4. 보호자 - 아동 연결 (다대다)
-- ------------------------------------------------------------
create table if not exists public.guardianships (
  guardian_id text not null references public.app_users(id)   on delete cascade,
  child_id    text not null references public.um_children(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (guardian_id, child_id)
);

create index if not exists guardianships_child_idx on public.guardianships(child_id);

-- ------------------------------------------------------------
-- 5. 상태 기록 (추가 전용 로그)
-- ------------------------------------------------------------
-- 승무원·지상직원이 입력하는 모든 상태가 여기 쌓입니다.
-- 수정·삭제하지 않습니다 (추적 가능성 확보).
create table if not exists public.status_logs (
  id           text        primary key,
  child_id     text        not null references public.um_children(id) on delete cascade,
  stage        integer,
  kind         text        not null default 'stage',
  title        text        not null,
  detail       text,
  recorded_by  text,                 -- 입력자 이름 (사번은 app_users로 추적)
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint status_logs_kind_chk check (
    kind in ('stage','meal','sleep','mood','location','service','flight','note')
  )
);

create index if not exists status_logs_child_time_idx
  on public.status_logs(child_id, occurred_at desc);

-- ------------------------------------------------------------
-- 6. 인계 기록 (차별점 1)
-- ------------------------------------------------------------
create table if not exists public.handovers (
  id           text        primary key,
  child_id     text        not null references public.um_children(id) on delete cascade,
  stage        integer,
  from_name    text        not null,
  to_name      text        not null,
  to_org       text,
  place        text,
  method       text,                 -- '보호자 서명 · 직원 QR' 등
  status       text        not null default 'pending',
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint handovers_status_chk check (status in ('pending','confirmed','rejected'))
);

create index if not exists handovers_child_idx on public.handovers(child_id, occurred_at desc);

-- ------------------------------------------------------------
-- 7. 동의 (개인정보보호법 제22조의2 · 항목별 분리 동의)
-- ------------------------------------------------------------
create table if not exists public.consents (
  id              text        primary key,
  child_id        text        not null references public.um_children(id) on delete cascade,
  guardian_id     text        not null references public.app_users(id)   on delete cascade,
  verified_at     timestamptz,                   -- 법정대리인 확인 시점
  -- 필수 동의 항목
  item_child      boolean     not null default false,
  item_contact    boolean     not null default false,
  item_staff      boolean     not null default false,
  -- 선택 동의: 촬영·보관
  shoot_granted   boolean     not null default false,
  shoot_at        timestamptz,
  shoot_withdrawn_at timestamptz,
  -- 선택 동의: AI 처리
  ai_granted      boolean     not null default false,
  ai_at           timestamptz,
  ai_withdrawn_at timestamptz,
  retention_days  integer     not null default 90,
  created_at      timestamptz not null default now(),
  unique (child_id, guardian_id)
);

-- 동의 변경 이력 (철회·재동의 추적)
create table if not exists public.consent_history (
  id          bigserial   primary key,
  consent_id  text        not null references public.consents(id) on delete cascade,
  text        text        not null,
  at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. 사진·영상 메타데이터
-- ------------------------------------------------------------
-- 실제 파일은 Supabase Storage 버킷에 두고, 여기엔 경로만 둡니다.
create table if not exists public.media_assets (
  id            text        primary key,
  child_id      text        not null references public.um_children(id) on delete cascade,
  kind          text        not null default 'photo',
  scene         text,
  storage_path  text,                 -- Storage 버킷 내 경로
  caption       text,
  uploaded_by   text,
  status        text        not null default 'pending',
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  constraint media_kind_chk   check (kind in ('photo','video','collage')),
  constraint media_status_chk check (status in ('pending','queued','sent','failed'))
);

create index if not exists media_child_idx on public.media_assets(child_id) where deleted = false;

-- ------------------------------------------------------------
-- 9. 주문 (수익모델 A안: 사진·영상 유료팩)
-- ------------------------------------------------------------
create table if not exists public.orders (
  id          text        primary key,
  child_id    text        not null references public.um_children(id) on delete cascade,
  guardian_id text        references public.app_users(id) on delete set null,
  product_id  text        not null,
  amount      integer     not null,
  status      text        not null default 'created',
  pay_status  text        not null default 'none',
  created_at  timestamptz not null default now(),
  constraint orders_status_chk check (
    status in ('created','active','producing','ready','payment_failed','refunded')
  )
);

-- ------------------------------------------------------------
-- 10. 알림
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id           text        primary key,
  guardian_id  text        not null references public.app_users(id)   on delete cascade,
  child_id     text        references public.um_children(id) on delete cascade,
  type         text        not null,
  severity     text        not null default 'normal',
  title        text        not null,
  body         text,
  read         boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint notifications_severity_chk check (severity in ('urgent','normal'))
);

create index if not exists notifications_guardian_idx
  on public.notifications(guardian_id, created_at desc);

-- ------------------------------------------------------------
-- 11. 개인정보 요청 (열람·삭제·처리정지)
-- ------------------------------------------------------------
create table if not exists public.privacy_requests (
  id           text        primary key,
  child_id     text        references public.um_children(id) on delete cascade,
  guardian_id  text        references public.app_users(id)   on delete cascade,
  kind         text        not null,
  status       text        not null default 'received',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint privacy_kind_chk   check (kind in ('access','delete','suspend','withdraw')),
  constraint privacy_status_chk check (status in ('received','processing','done','rejected'))
);

-- ============================================================
-- Realtime 활성화
-- ============================================================
-- demo_state 변경을 모든 기기에 브로드캐스트합니다.
--
-- 이 블록은 실패해도 테이블 생성에는 영향이 없습니다.
-- 권한이 없거나 발행(publication)이 없으면 안내만 남기고 넘어가며,
-- 그 경우 대시보드 Database > Replication 에서 직접 켜면 됩니다.
do $$
declare
  t text;
  wanted text[] := array['demo_state','status_logs','handovers'];
begin
  -- 보통 Supabase가 미리 만들어 두지만, 없으면 만들어요.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array wanted loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

exception
  when insufficient_privilege or undefined_object then
    raise notice 'Realtime 발행 설정을 건너뛰었어요. 대시보드 Database > Replication 에서 demo_state 를 켜 주세요.';
end $$;

-- 초기 행 생성 (앱이 처음 접속할 때 넣어도 되지만 미리 만들어 둠)
insert into public.demo_state (id, rev, state)
values ('default', 0, '{}'::jsonb)
on conflict (id) do nothing;
