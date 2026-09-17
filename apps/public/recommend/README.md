# gonggu-recommend (apps/public/recommend)

제품추천 카탈로그 공개 페이지 — 메인 관리 시스템(UNX-GongguSys)과 분리된 독립 Express 앱.
관리자 화면·API를 포함하지 않으며, 메인 시스템 데이터는 서버 간 인증이 걸린 내부 API로만 가져온다.

## 로컬 실행

```bash
cd apps/public/recommend
npm install
MAIN_APP_URL=http://localhost:3000 INTERNAL_API_KEY=<메인 앱과 동일한 값> npm start
```

`http://localhost:<PORT>/?c=<카탈로그 코드>` 로 접속. 메인 앱(`server.js`)도 같은
`INTERNAL_API_KEY` 환경변수로 함께 떠 있어야 카탈로그 데이터를 가져올 수 있다.

## Railway 배포 메모

`railway.json`으로 Builder를 명시적으로 Nixpacks로 고정해둠 — Root Directory를
`apps/public/recommend`로 바꿔도 서비스에 Dockerfile 빌드가 이미 설정돼 있으면
루트의 [Dockerfile](../../../Dockerfile)을 계속 찾아 실패할 수 있어서다. 그래도 빌드가
Dockerfile로 시도되면 Railway 대시보드 → 이 서비스 → Settings → Build 섹션에서
Builder를 Nixpacks로 직접 바꾸거나 커스텀 Dockerfile Path를 지워야 한다.

## 환경변수

- `PORT` — 기본 3000 (Railway가 자동 주입)
- `MAIN_APP_URL` — 메인 앱(UNX-GongguSys)의 주소. Railway 프라이빗 네트워킹 사용 시
  `http://<메인 서비스>.railway.internal:<PORT>` 형태(대시보드의 변수 참조 기능으로 연결).
- `INTERNAL_API_KEY` — 메인 앱의 같은 이름 환경변수와 **동일한 값**이어야 함(공유 비밀키).

## 구조

- `server.js` — 정적 파일 서빙 + `/api/catalog/:code`(메인 앱 내부 API 중계) + `/c/:code` 리다이렉트.
  정의되지 않은 모든 경로는 404.
- `public/` — `index.html` / `style.css` / `catalog.js` (갤러리 + 상세 모달 UI).
