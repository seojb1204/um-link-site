# UM LINK · Supabase 연결 가이드

지금 상태에서 **아무것도 안 해도 앱은 돌아갑니다.** (정적 모드)
아래는 여러 기기가 같은 데이터를 보게 만들고 싶을 때만 하는 작업입니다.

소요 시간: 처음이면 20~30분.

---

## 0. 먼저 확인: 이걸 해야 하나?

| 상황 | 해야 하나 |
|---|---|
| 노트북 한 대로 발표하면서 "나란히 시연" 버튼으로 보여줌 | **필요 없음** |
| 심사위원에게 핸드폰을 주고 보호자 화면을 직접 보게 함 | **필요함** |
| 심사 기준에 "구현 완성도" 배점이 있음 | **필요함** |
| 서류 심사만 있음 | **필요 없음** |

필요 없다면 이 문서를 덮고 그냥 배포하세요. `src/db/config.js`를 비워두면 기존과 100% 동일하게 동작합니다.

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 접속 → **Start your project** 클릭
2. GitHub 계정으로 로그인
3. **New project** 클릭
4. 입력:
   - **Name**: `um-link-demo`
   - **Database Password**: 아무거나. **메모장에 적어두세요** (나중에 못 봅니다)
   - **Region**: `Northeast Asia (Seoul)` 선택 ← 한국에서 쓰면 이게 제일 빠릅니다
   - **Pricing Plan**: Free
5. **Create new project** 클릭 → 2~3분 기다림

---

## 2. 테이블 만들기

1. 왼쪽 사이드바에서 **SQL Editor** (아이콘: 터미널 모양) 클릭
2. **+ New query** 클릭
3. `supabase/01_schema.sql` 파일 내용을 **전체 복사**해서 붙여넣기
4. 오른쪽 아래 **Run** 클릭 (또는 Ctrl+Enter)
5. 아래에 `Success. No rows returned` 가 나오면 성공
6. 다시 **+ New query** 클릭
7. `supabase/02_rls_demo.sql` 내용을 붙여넣고 **Run**
8. 왼쪽 **Table Editor** 로 가면 테이블 12개가 보여야 합니다

> `03_rls_production.sql` 은 **실행하지 마세요.** 실서비스 설계 참고용 문서입니다.

---

## 3. 키 가져오기

1. 왼쪽 사이드바 맨 아래 **Project Settings** (톱니바퀴) 클릭
2. **API** 탭 클릭
3. 두 값을 복사:
   - **Project URL** → `https://xxxxxxxx.supabase.co` 형태
   - **Project API keys** 에서 **`anon` `public`** 키 → 아주 긴 문자열

> ⚠️ 같은 화면에 **`service_role`** 키도 있습니다. **이건 절대 복사하지 마세요.**
> 그 키는 모든 권한 정책을 무시합니다. 프론트엔드에 넣으면 누구나 DB 전체를
> 읽고 지울 수 있게 됩니다. GitHub에 올리는 순간 끝입니다.

---

## 4. 설정 파일에 붙여넣기

`src/db/config.js` 를 열어서 두 줄만 채웁니다.

```js
window.UMLINK_DB_CONFIG = {
  url: 'https://xxxxxxxx.supabase.co',        // ← 2번에서 복사한 Project URL
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...', // ← anon public 키
  stateId: 'default',
  mirror: true,
  ...
};
```

**다른 파일은 건드리지 마세요.** 이 파일 하나만 고치면 됩니다.

---

## 5. 확인

1. `app.html` 을 브라우저로 엽니다
2. 1~2초 뒤 화면 아래에 **"실시간 모드 · 다른 기기와 연결됨"** 토스트가 떠야 합니다
3. Supabase 대시보드 → **Table Editor** → `demo_state` 테이블에 행 1개가 생겼는지 확인
4. `status_logs` 테이블에도 행 8개 정도가 쌓였는지 확인 (미러링 동작 확인)

### 실패하면

| 토스트 문구 | 원인 | 해결 |
|---|---|---|
| "정적 모드" 가 뜸 | config.js가 비어 있음 | url/anonKey 다시 확인 |
| "서버 연결 실패" | 키가 틀렸거나 네트워크 차단 | 브라우저 F12 → Console에서 오류 확인 |
| 토스트가 아예 안 뜸 | 스크립트 로드 실패 | F12 → Network에서 `src/db/*.js` 가 404인지 확인 |

> `file://` 로 직접 열면 브라우저 보안 정책 때문에 막힐 수 있습니다.
> 그럴 때는 터미널에서 `npx serve .` 또는 Netlify에 올려서 테스트하세요.

---

## 6. 배포

### Netlify (가장 쉬움)

1. https://app.netlify.com/drop 접속
2. `um-link-site` 폴더를 통째로 드래그 앤 드롭
3. 1분 뒤 `https://xxxx.netlify.app` 주소가 나옵니다
4. 핸드폰으로 그 주소를 열고, 노트북으로도 열어서 **양쪽이 같은 데이터를 보는지 확인**

### GitHub Pages

1. GitHub에 저장소 만들고 파일 업로드
2. Settings → Pages → Source를 `main` 브랜치로
3. 1~2분 뒤 배포

> GitHub에 올릴 때 `anonKey` 가 같이 올라갑니다. **정상입니다.** anon 키는
> 공개 전제로 설계된 키입니다. 단, 그래서 **실제 아동 정보는 절대 넣지 마세요.**

---

## 7. 심사 당일 체크리스트

- [ ] **Supabase 무료 플랜은 7일간 요청이 없으면 프로젝트가 일시정지됩니다.**
      심사 전날 사이트를 한 번 열어서 깨워두세요. 안 그러면 당일 연결이 안 됩니다.
- [ ] 발표장 Wi-Fi가 막혀 있어도 되는지 확인. 막혀도 **정적 모드로 자동 전환**되어
      시연은 됩니다. (단 기기 간 동기화만 안 됨)
- [ ] 시연 전 "시연 데이터 초기화" 버튼으로 깨끗한 상태에서 시작
- [ ] 핸드폰 + 노트북 2대 준비. 이게 이 작업의 유일한 목적입니다.
- [ ] 백업: Supabase가 죽었을 때 쓸 **정적 버전 사본**을 따로 배포해두기
      (`config.js`를 비운 복사본을 다른 Netlify 주소에 올려두면 됩니다)

---

## 구조 설명 (코드 리뷰나 질문 대비)

```
src/db/
  config.js            ← 설정. 여기만 고치면 됩니다
  local-adapter.js     ← localStorage + BroadcastChannel (정적 모드)
  supabase-adapter.js  ← Supabase 연결 + Realtime 구독
  mirror.js            ← 상태 JSON을 정규화 테이블로 복사
  index.js             ← 위 3개를 골라 쓰는 진입점
```

`app.html` 에서 바뀐 부분은 **단 두 곳**입니다.

1. `<script src="src/db/...">` 5줄 추가
2. `/* ===== 저장소 ===== */` 블록 (10줄 → 30줄)

`commit()` 호출부 32곳은 **하나도 안 고쳤습니다.** 저장 경로가 한 함수로
모여 있던 덕분입니다.

### 데이터 흐름

```
[승무원이 상태 입력]
      ↓
  commit(fn)                        app.html (기존 코드 그대로)
      ↓
  DB.commit(S)                      src/db/index.js
      ├─→ localStorage 저장          즉시. 실패해도 앱은 동작
      ├─→ BroadcastChannel          같은 브라우저의 다른 탭
      ├─→ demo_state upsert         Supabase. 다른 기기로 전파
      └─→ mirror.schedule(S)        정규화 테이블에 복사 (0.6초 디바운스)
                ↓
      [보호자 폰에서 Realtime 수신]
                ↓
      adoptState(state, 'remote') → renderAll()
```

### 알려진 한계 (질문 나오면 이렇게 답하면 됩니다)

1. **동시 쓰기는 나중 쓰기가 이깁니다** (last-write-wins).
   상태 전체를 JSON 한 칸에 두는 구조라서 그렇습니다.
   실서비스에서는 테이블별로 쓰기를 분리해야 합니다.
2. **진짜 푸시 알림은 아닙니다.** 앱이 열려 있을 때만 갱신됩니다.
   폰이 잠겨 있어도 알림이 뜨게 하려면 FCM 또는 Web Push가 따로 필요합니다.
3. **실제 항공편 데이터는 연결되지 않았습니다.** 시연용 예시 값입니다.
4. **결제는 테스트 UI뿐입니다.** 실제 결제는 시크릿 키가 필요해서
   Supabase Edge Functions 같은 서버측 코드가 있어야 합니다.
5. **정규화 테이블은 보여주기용 미러입니다.** 앱이 읽는 것은 여전히
   공유 상태 JSON입니다. 읽기까지 정규화 테이블로 옮기려면 앱 로직을
   다시 써야 하는데, 공모전 일정에서는 권하지 않습니다.
