# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

인포크링크(`business.inpock.co.kr`) 제안서를 Playwright로 자동 발송하는 매크로 + Gmail 이메일 발송 매크로 + 인포크 확인 매크로. Express 관리 UI(`server.js`)가 모든 기능을 감싼다.

## 자주 쓰는 명령어

```bash
npm run ui            # 관리 UI 기동 (http://localhost:3000)
npm start             # CLI로 매크로 실행 (UI 거치지 않고 바로)
npm run dry-run       # 실제 제출 없이 전 과정만 수행 (검증용)
npm run reset-counts  # 전 계정의 weeklyTracking 초기화
npm run check-replies # 인포크 확인 매크로 CLI 실행
npm run tunnel        # cloudflared로 외부 임시 URL 발급 (ngrok은 md/how-to-run.md)
```

- `PORT=8080 npm run ui` — 포트 오버라이드
- `DB_MODE=json npm run ui` — JSON 롤백 모드 (구 `USE_SUPABASE=false`도 동일하게 인식)
- `npm run db:schema` / `npm run db:migrate -- --force` / `npm run db:verify` — Railway Postgres 스키마 적용 / Supabase→Postgres 데이터 이관 / 검증

UI에서 "발송 시작"을 누르면 [server.js](server.js)가 `node src/index.js` 자식 프로세스를 spawn하고, 필요 시 `EMAIL_ACCOUNT_ID` 환경변수를 주입한다. UI가 보여주는 실시간 로그는 자식 프로세스의 stdout/stderr 버퍼(`macroLogs`, `replyLogs`)다.

테스트/린트 스크립트는 없다.
 
### 관리 UI 구조 — EJS MPA (탭 = 페이지)

관리 UI는 탭마다 실제 URL을 갖는 **MPA**다. 예전엔 `public/index.html` 단일 SPA였으나 EJS 10페이지로 분리했다.

- **라우트**: [server.js](server.js)의 `UI_PAGES` 배열이 단일 소스. `/products` `/manufacturers` `/influencers` `/run` `/replies` `/leads` `/catalogs` `/instagram` `/phrases` `/settings` (+ `/` → `/products` 리다이렉트). 각 항목이 `res.render('layout', opts)`에 넘길 `{title, active, activeSub, page, scripts, modals}`를 들고 있다.
- **뷰**: [views/layout.ejs](views/layout.ejs)(공통 뼈대) + [views/partials/header.ejs](views/partials/header.ejs) + [views/partials/tabs.ejs](views/partials/tabs.ejs)(GNB) + `views/pages/*.ejs`(패널 본문) + `views/partials/modals/*.ejs`.
  - **탭을 추가·개명·이동할 곳은 [views/partials/tabs.ejs](views/partials/tabs.ejs)의 `TABS`/`SUBTABS` 배열 한 곳뿐.** 10개 페이지에 동시 반영된다.
- **클라이언트 JS**: [public/js/](public/js/) — 도메인별 파일 + `init/<page>.js`(페이지별 초기 로드). CSS는 [public/css/app.css](public/css/app.css) 1개.
  - **`type="module"` 금지**. 인라인 `onclick=` 핸들러가 120여 개라 모듈 스코프로 가면 전역 함수 참조가 전부 끊긴다. classic script 순차 로드를 유지할 것.
  - 파일 간 hoisting이 안 되므로 **실행문은 `init/<page>.js`에만** 둔다. layout이 `util → state → nav → (페이지 scripts) → init/<page>` 순으로 붙인다.
  - 한 js 파일이 여러 페이지에서 로드되므로 **`renderX()`는 컨테이너가 없으면 early-return**해야 한다(기존 함수들이 이미 그렇게 돼 있음).
  - 페이지 공통 동작(헤더 인포크 배지, 리드 마감 배지, 모달 ESC 레지스트리)은 [public/js/nav.js](public/js/nav.js) 소유. 모달은 각 페이지 init이 `registerModalClosers({...})`로 등록한다.
- **Vercel**: [vercel.json](vercel.json)의 `includeFiles`에 `views/**`가 있어야 한다. 서버리스는 런타임 경로 조립(`res.render`)을 추적 못 해서, 빠지면 로컬만 되고 배포에서 템플릿을 못 찾는다.

### 외부 접속 & 인증

- [server.js](server.js)는 express-session 기반 인증을 적용. **인증 수단 둘 중 하나라도 있으면 인증 필요**: ① `settings.json`의 `adminPassword`(레거시 단일 비밀번호, 과도기 지원) ② [employees](scripts/schema.pg.sql) 테이블의 활성 로그인 계정(개인 ID/PW, 1개 이상). 둘 다 없으면 **인증 비활성**(로컬 전용 운영). `AUTH_DISABLED=true` 환경변수로도 강제 우회 가능(로컬 개발용).
- **[요청] Railway 전환 2단계 — 관리자 개별 계정(ID/PW) + 역할·파트**:
  - `employees` 테이블이 로그인 계정을 겸한다(`login_id`/`password_hash`(bcryptjs)/`role`('admin'|'staff')/`active`/`last_login_at`). `login_id`가 없는 employee는 예전처럼 "문구 탭 전용 이름"일 뿐이고, 설정 > "계정 관리"에서 admin이 로그인ID/PW를 부여하면 계정이 된다.
  - `parts`(공동구매 파트: 영업/CS/정산, admin이 추가·이름변경·비활성 가능) + `employee_parts`(직원-파트 M:N, **중복 부여 가능**). admin은 파트 배정 없이도 전 파트 접근(코드에서 판단, DB에 행을 넣지 않음).
  - 로그인은 `POST /api/login`에 `{loginId, password}`(개인 계정) 또는 `{password}`만(레거시, 과도기) 보낼 수 있다. 세션에 `{employeeId, loginId, role, parts}` 저장. `express-rate-limit`으로 IP당 15분에 20회 제한.
  - 권한 판단은 [src/auth/guard.js](src/auth/guard.js)의 `requireRole('admin')`/`requirePart(code)` — role이 'admin'이면 무엇이든 통과. 인증이 아예 구성 안 된 상태([src/auth/state.js](src/auth/state.js)의 `isAuthBypassed()`)에서는 guard도 authRequired와 동일하게 전부 통과시킨다(로컬 무인증 운영 하위호환).
  - **admin 전용으로 잠근 라우트**: 계정/파트 CRUD(`/api/employees/:id/account`, `/api/employees/:id/parts`, `/api/employees/:id` DELETE, `/api/parts*`), 설정 변경(`PUT /api/settings`), Gmail 계정 저장·연결(`PUT /api/emailAccounts`, `/api/gmail/auth`, `/api/gmail/disconnect`). 마지막 활성 admin 계정은 삭제·강등·비활성화 불가(`LAST_ADMIN` 에러).
  - **최초 관리자 부트스트랩**: 활성 로그인 계정이 0개이고 `ADMIN_INIT_ID`/`ADMIN_INIT_PW` 환경변수가 있으면 서버 시작 시 1회 자동 생성(멱등 — 이미 있으면 no-op).
  - `notifications` 테이블은 파트별 대시보드 알림용으로 정의만 해두었다(3단계 이후 사용 예정, 현재 코드에서는 미사용).
  - JSON 롤백 모드도 동일 기능 지원: `employees.json`에 `loginId/passwordHash/role/active/lastLoginAt/partIds` 필드, 파트는 `parts.json`(최초 실행 시 영업/CS/정산 자동 시드).
- 로그인 페이지: [public/login.html](public/login.html) — 아이디 칸을 비우면 레거시 단일 비밀번호로 시도. 엔드포인트: `POST /api/login`, `POST /api/logout`, `GET /api/auth/status`(응답에 `user: {name, loginId, role, parts}` 포함, 헤더의 사용자 배지가 이 값을 씀 — [public/js/nav.js](public/js/nav.js)의 `window.currentUser`/`window.currentUserReady`).
- 세션 시크릿: `SESSION_SECRET` 환경변수 → `settings.json` → 없으면 프로세스 시작 시 랜덤 생성(랜덤 생성 시 재시작마다 전원 재로그인). Railway처럼 재배포가 잦은 환경은 `SESSION_SECRET`을 Variables에 고정하는 것을 권장.
- 외부 노출 방법은 [md/how-to-run.md](md/how-to-run.md) 참고 — ngrok 고정 도메인(`shimmy-defame-unifier.ngrok-free.dev`)과 cloudflared 임시 URL 둘 다 사용 가능.
- `config.HEADLESS`는 `settings.json`의 `headless` 값에서 읽히는 getter. 외부 접속 시 체크하면 발송 트리거 시 로컬 PC에 크롬창이 뜨지 않음.

## 아키텍처 전체 흐름

[src/index.js](src/index.js)가 오케스트레이터다. 한 번 실행되면:

1. [src/repo/influencersRepo.js](src/repo/influencersRepo.js)의 `listPending()`이 발송 대상(status=pending) 로드.
2. `profileUrl`에 `@`가 있으면 **이메일 경로**, 아니면 **인포크 브라우저 경로**로 분기.
3. 이메일 타겟은 [src/emailSender.js](src/emailSender.js)의 `sendMail()`이 발송. `EMAIL_ACCOUNT_ID` env로 [src/repo/emailAccountsRepo.js](src/repo/emailAccountsRepo.js)에서 계정 선택. **전송 경로는 계정의 Google 연결 여부로 분기**: `googleRefreshToken`이 있으면 nodemailer `MailComposer`로 RFC822 원문을 만들어 [src/gmailApi.js](src/gmailApi.js)가 Gmail API(HTTPS)로 전송, 없으면 nodemailer Gmail SMTP(앱 비밀번호). **Railway는 Hobby 플랜에서 아웃바운드 SMTP를 차단하므로 서버 발송은 API 경로만 동작**한다. Google OAuth는 설정 탭 "Google 연결"(`/api/gmail/auth` → `/api/gmail/callback`)로 계정별 refresh token을 `email_accounts.google_refresh_token`에 저장. 환경변수 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` 필요(Railway Variables + 로컬 .env). 콜백 URI는 Google Cloud OAuth 클라이언트에 `https://<railway-domain>/api/gmail/callback`, `http://localhost:3000/api/gmail/callback` 등록 필요. Bcc는 원문의 Bcc 헤더로 전달(`MimeNode.keepBcc=true`).
4. 인포크 타겟은 Playwright chromium을 띄워 [src/accountManager.js](src/accountManager.js)의 `getAvailableAccount()`가 고른 계정(from [src/repo/accountsRepo.js](src/repo/accountsRepo.js))으로 [src/auth.js](src/auth.js)의 `login()` → [src/proposal.js](src/proposal.js)의 `sendProposal()` → 슬롯 소진되면 `logout()` → 다음 계정으로 순환.
5. 실패는 `influencers.status='failed'` + `error` 컬럼으로 즉시 기록. UI의 "재발송"은 failed→pending 상태 전환.

### Repo 레이어 / DB 모드

모든 데이터 I/O는 [src/repo/](src/repo/) 아래 repo를 경유한다 (`accountsRepo`, `productsRepo`, `manufacturersRepo`, `influencersRepo`, `emailAccountsRepo`, `sentLogRepo`, `repliesRepo`, `leadsRepo`, `catalogsRepo`, `employeesRepo`, `phrasesRepo`, `partsRepo`).

- **기본 모드: Postgres(Railway)** — `DB_MODE=pg`. 접속은 `DATABASE_URL` 하나(Railway Variables는 내부 주소, 로컬 `.env`는 Railway의 `DATABASE_PUBLIC_URL` 값). 각 repo의 `*Pg()` 함수가 `pg`로 직접 SQL을 실행한다.
- **롤백 모드: JSON** — `DB_MODE=json` 환경변수로 기존 JSON 파일 I/O 복귀. 각 repo가 `config.USE_DB` 플래그로 내부 분기(`config.USE_SUPABASE`는 하위 호환 별칭).
- pg Pool 싱글톤 + 헬퍼(`query/one/withTx/insertMany/isUniqueViolation`): [src/db.js](src/db.js). `DATABASE_URL` 없으면 require 시점에 throw하므로 repo들은 `require('../db')`를 함수 안에서 지연 로드한다.
- 타입 파서: `date`는 `'YYYY-MM-DD'` 문자열, `timestamptz`는 ISO 문자열, `int8`은 number로 고정(PostgREST 시절 반환 형태와 동일하게 맞춤). 새 SQL을 쓸 때 Date 객체를 기대하지 말 것.
- 공개 카탈로그는 anon 키 대신 서버의 `GET /api/public/catalog/:code`(인증 면제, CORS 허용)가 `catalogsRepo.getPublicByCode()`로 응답한다.
- 설정값(`settings.json`)만은 DB로 옮기지 않고 로컬 파일 유지 — `config.MAIL_BCC` getter가 동기 접근해서.

### 핵심 도메인 규칙

- **주간 10건 제한**: [config.js](config.js)의 `WEEKLY_LIMIT = 10`. ISO 주차 키(예: `2026-W16`)로 `weekly_tracking` 테이블에 누적.
  - DB 모드: plpgsql 함수 `increment_weekly_count(account_id, week_key)`로 **원자적 UPSERT**(`select increment_weekly_count($1,$2)`). 병렬 발송·크래시 시에도 카운터 유실·중복 없음.
  - JSON 모드: `accounts.json[].weeklyTracking` 즉시 파일 write.
- **이메일 vs 인포크 라우팅**: `EMAIL_REGEX` 매칭으로 자동 분기. `profileUrl`이 `x`면 스킵, `@` 포함이면 이메일, 그 외는 인포크 URL(`http://` 자동 보정).
- **DOM 셀렉터 중앙화**: 모든 인포크 사이트 셀렉터는 [src/selectors.js](src/selectors.js)에 있다. UI 변경으로 깨지면 여기만 고친다.
- **BCC 하드코딩**: [config.js](config.js)의 `MAIL_BCC`가 모든 Gmail 발송에 강제 BCC로 붙는다. 값은 `settings.json`.

### 인포크 확인 파이프라인

[src/checkReplies.js](src/checkReplies.js)는 각 계정으로 headless 로그인 → `sendbird-badge` 엘리먼트 개수로 답장 수 집계 → [src/repo/repliesRepo.js](src/repo/repliesRepo.js)가 계정 하나 끝날 때마다 실시간 기록.

- DB 모드: `reply_runs` 1 row + `replies` N rows. `reply_runs.finished_at IS NULL`이면 "진행 중(partial)".
- JSON 모드: `replies.json` 단일 파일, `partial: true/false` flag.
- UI는 어느 모드든 공통으로 repo를 통해 조회.

[server.js](server.js)의 node-cron이 매일 08:30/10:30/12:30/14:30에 자동 실행한다. `--start <username>` 인자로 특정 계정부터 순차 시작 가능.

### 이미지 저장/참조

- **과도기 상태(Railway 전환 4단계 전)**: 사진 파일 본체는 아직 Supabase Storage(`product-photos`, `signatures` 버킷, public)에 있고 DB에는 그 public URL이 저장돼 있다. 4단계(파일 저장소)에서 관리자 전용 저장소로 옮기고 URL을 치환할 예정.
- 이메일 발송: nodemailer는 URL·로컬 경로 모두 `path:`에 직접 넘길 수 있어 별도 다운로드 불필요.
- 인포크 제안서(Playwright `setInputFiles`)는 로컬 경로만 받음 → [src/proposal.js](src/proposal.js)의 `resolvePhotosToLocal()`이 ① `assets/<basename>` 존재 시 즉시 사용, ② 없으면 `%TEMP%/inpock-photos/`에 1회 다운로드 후 사용.
- 신규 업로드(UI): multer가 먼저 `assets/`에 저장 → [src/repo/productsRepo.js](src/repo/productsRepo.js)의 `uploadPhoto()`가 [src/legacy/supabaseStorage.js](src/legacy/supabaseStorage.js)로 Storage에 올리고 public URL 반환(`.env`에 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`가 있을 때만. 없으면 로컬 `assets/` 경로 반환 → Railway에선 재배포 시 유실되므로 키를 유지할 것). 4단계에서 이 헬퍼와 `@supabase/supabase-js` 의존성을 함께 제거한다.

### 로그인/로그아웃 공통 규약

[md/ModifyHistory.md](md/ModifyHistory.md)의 결정사항: 로그인·로그아웃 모두 반드시 캐시 비우기 + 새로고침을 수행한다. [src/auth.js](src/auth.js)가 이미 구현하고 있으니 인증 관련 코드를 만질 때는 이 규약을 깨지 말 것. 로그인 실패 시 새로고침 후 1회 재시도하는 것도 의도된 동작이다.

## 작업 진행 프로토콜 — [md/ModifyHistory.md](md/ModifyHistory.md)

이 저장소는 [md/ModifyHistory.md](md/ModifyHistory.md)에 요청사항을 적는 방식으로 협업한다. 규칙(파일 상단에 명시됨):

1. 요청 제목은 `## ` 으로 시작.
2. `[ 요청사항 ]` 밑에 새 요청이 들어오면 Claude는 먼저 `[ 실행계획 ]`에 계획을 추가만 한다 — **사용자가 "작업시작"이라고 하기 전에는 코드 수정 금지**.
3. 작업 시작하면 변경 코드에 해당 작업 내용 주석을 남긴다(예: `// [요청] ...`). `src/checkReplies.js`의 기존 주석이 이 패턴의 예시.
4. 작업 완료되면 `[ 요청사항 ]`의 해당 항목을 `[ 작업완료 ]` 상단으로 옮기고, 사용한 실행계획은 지운다.

이 프로토콜은 일반적인 CLAUDE.md 규범보다 우선한다. 특히 "작은 버그 수정이라도 승인 없이 건드리지 말 것"을 의미한다.

## 데이터 소스

### Railway Postgres (기본)

[scripts/schema.pg.sql](scripts/schema.pg.sql)이 전체 DDL(`npm run db:schema`로 적용, 멱등). [scripts/schema.sql](scripts/schema.sql)은 Supabase 시절 원본으로, RLS·anon grant·security definer만 다르다. 테이블 추가·변경 시 **schema.pg.sql을 기준으로** 고친다. 테이블:
- `accounts` + `weekly_tracking` (발송 계정 / 주간 카운터)
- `email_accounts` (Gmail 계정·서명)
- `manufacturers` (제조사 마스터 — name/contact_person/contact/hurdle/schedule/memo/status). products가 `manufacturer_id`로 참조. `status`: 빈값=진행 / `협업종료`(협업종료 시 연결 제품 status도 함께 변경)
- `products` + `product_photos` (제품·사진 URL). `manufacturer_id`(제조사 FK, on delete set null) + `status`(빈값=진행 / `협업종료`) 보유
- `influencers` (발송 큐 + 실패 기록 통합, `status=pending|sent|failed|skipped|sending`)
- `sent_log` (append-only 감사 로그)
- `reply_runs` + `replies` (인포크 확인)
- `leads` (답장 온 인플루언서 추적 — replied_at/proposal_sent_at/remind_at/final_status)
- `catalogs` (인플루언서 맞춤 추천 카탈로그 — code/product_ids/view_count)
- `employees`(직원 겸 로그인 계정 — [요청] Railway 전환 2단계 참고) + `phrases`(직원별 자주 쓰는 문구), `parts` + `employee_parts`(공동구매 파트, M:N), `notifications`(파트별 알림, 정의만·미사용), `settings`(미사용, 설정은 settings.json), `cafe24_tokens`(카페24 OAuth 토큰)
- SQL 함수: `increment_weekly_count(account_id, week_key)` / `adjust_weekly_count(account_id, week_key, delta)` — 원자적 카운터 증감
- SQL 함수: `get_catalog_by_code(p_code)` — 공개 카탈로그 1건 조회(view_count 자동 증가). `catalogsRepo.getPublicByCode()`가 호출.
- RLS·anon 역할 없음. DB 접근은 서버(`DATABASE_URL`)뿐이고, 외부 노출 경로는 `/api/public/catalog/:code` 하나다.

### 공개 추천 카탈로그 — [public/recommend/](public/recommend/) (Vercel 분리 배포)

관리 UI의 "추천" 탭에서 인플루언서별 카탈로그 생성 → `/recommend/?c=<code>` 공개 URL 발급.
- **분리 배포 이유(과거)**: 관리자 PC가 꺼져 있어도 링크가 열려야 했음. 지금은 관리 서버가 Railway에서 24시간 돌므로 `https://<railway-domain>/recommend/?c=<code>`로 서버가 직접 서빙해도 된다. Vercel 배포를 유지할 수도 있음(아래 `CATALOG_API_BASE` 필요).
- 파일 구성: `index.html` / `style.css` / `catalog.js` / `config.js`(`window.CATALOG_API_BASE`) / `vercel.json`(`/c/:code` rewrite).
- 데이터 흐름: 페이지가 `GET {CATALOG_API_BASE}/api/public/catalog/:code`를 fetch → 서버가 `get_catalog_by_code` SQL 함수(DB 모드) 또는 JSON 조립(JSON 모드) → 제품 + 사진 + view_count 자동 증가. 404면 "존재하지 않는 카탈로그".
- `CATALOG_API_BASE`: 빈 문자열이면 같은 도메인(서버 직접 서빙·로컬). Vercel에 분리 배포하면 Railway 앱 도메인을 넣는다. 이 라우트만 `Access-Control-Allow-Origin: *`.
- Vercel 배포: GitHub 연동 → Add New Project → Root Directory = `public/recommend` → Framework `Other`. 기본 도메인 `xxx.vercel.app` 사용.
- 관리 UI 설정 → "추천 카탈로그 공개 URL"에 공개 도메인 입력. 미입력 시 `${currentOrigin}/recommend/`로 폴백.

### JSON 파일 (롤백용으로 유지)

`DB_MODE=json`일 때만 사용. 스키마는 DB와 동일한 의미:
- `accounts.json`: `{id, username, password, weeklyTracking: {"YYYY-Www": n}}`
- `emailAccounts.json`: `{id, email, appPassword, senderName, signature, signatureImage}`
- `products.json`: `{products: [{name, brandName, productName, campaignType, category, usp, offerMessage, photos[], mailSubject?, manufacturerId?, status?}]}` (`manufacturerId`=제조사 연결, `status`=빈값/`협업종료`)
- `manufacturers.json`: `{manufacturers: [{id, name, contactPerson, contact, hurdle, schedule, memo, status, createdAt}]}` (`status`=빈값/`협업종료`)
- `influencers.json` / `failed.json`: `{nickname, profileUrl, productName, [error]}`
- `replies.json`: `{checkedAt, partial, results[]}`
- `leads.json`: `{leads: [{id, nickname, profileUrl, interestedProductName, suitableProductNote, repliedAt, proposalSentAt, remindAt, finalStatus, notes, ...}]}`
- `catalogs.json`: `{catalogs: [{id, code, title, influencerNickname, leadId, productIds[], viewCount, viewedAt, createdAt}]}` (JSON 모드에서도 공개 페이지가 동작 — `catalogsRepo.getPublicByCodeJson()`이 제품을 조립)
- `employees.json`: `{employees: [{id, name, sortOrder, createdAt, loginId, passwordHash, role, active, lastLoginAt, partIds[]}]}` ([요청] Railway 전환 2단계 — `loginId`가 없으면 문구 탭 전용 이름, 있으면 로그인 계정)
- `parts.json`: `{parts: [{id, code, name, sortOrder, active}]}` (최초 조회 시 영업/CS/정산 3종 자동 시드)

### 설정 파일 (양쪽 모드 공통)

- `settings.json`: `mailBcc` 등. DB로 옮기지 않음 — [config.js](config.js) getter가 sync 접근해야 해서.
- [.env](.env) (gitignored): `DATABASE_URL`(필수). `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 4단계 전까지 사진 업로드·이관 스크립트용으로 유지.

## 마이그레이션·검증 스크립트 ([scripts/](scripts/))

- `schema.pg.sql` + `applySchemaPg.js`(`npm run db:schema`) — Railway Postgres DDL 적용 (멱등, 단일 트랜잭션)
- `migrateSupabaseToPg.js`(`npm run db:migrate`) — Supabase 전 테이블 → Postgres, id 보존 + 시퀀스 재설정. 기본은 대상이 비어 있을 때만, `--force`는 truncate 후 재삽입, `--dry-run`은 읽기만.
- `verifyPgMigration.js`(`npm run db:verify`) — 양쪽 건수 비교 + FK 고아 + 시퀀스 상태
- Supabase 시절(현재 실행 불가·참고용): `schema.sql`, `uploadAssets.js`, `migrateJsonToSupabase.js`, `verifyMigration.js`, `test*Repo.js`, `testIncrementRpc.js`, `cleanupOrphanPhotos.js`, `migrateBrandsToManufacturers.js`, `diagInfluencerDelete.js`. 4단계 정리 대상.

## 주의사항

- `config.HEADLESS = false`가 기본 — 브라우저 창이 뜨는 건 의도다. 인포크 확인만 `checkReplies.js` 내부에서 `headless: true`로 강제한다.
- `products.json`(또는 DB)에 없는 `productName`을 가진 인플루언서가 있으면 [src/index.js](src/index.js)가 `process.exit(1)` — 제품명 매칭은 엄격하다.
- **이미지 경로 혼재**: 현재 `assets/` 폴더는 (1) 마이그레이션 전 레거시 이미지, (2) UI 신규 업로드 임시저장, (3) 제안서용 로컬 캐시 3역할을 겸한다. 향후 정리 여지.
- **Supabase 프로젝트는 4단계 전까지 삭제 금지**: 사진 파일 본체와 신규 업로드가 아직 Supabase Storage에 있다. 무료 프로젝트는 7일 미접속 시 pause되지만 업로드가 있으면 유지됨.
- **롤백 절차**: 문제 발생 시 `DB_MODE=json npm run ui`로 JSON 모드 즉시 복귀. JSON 모드에서 데이터를 수정했다면 DB로 되돌릴 때 수동 반영 필요(JSON→Postgres 이관 스크립트는 없음).
- **Railway Postgres 외부 접속**: 로컬 이관·검증이 끝나면 Postgres 서비스의 TCP Proxy를 꺼도 된다(앱은 내부 주소 사용). 다시 로컬에서 붙을 일이 있으면 켜고 `DATABASE_PUBLIC_URL`을 `.env`에 넣는다.
