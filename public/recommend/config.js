// [요청] 추천 카탈로그 페이지 — 공개 API 주소 설정
// [요청] Railway 전환 1단계 — Supabase anon 키 제거. 카탈로그는 관리 서버(server.js)의
//   GET /api/public/catalog/:code 로 조회한다(인증 면제, 읽기 전용, CORS 허용).
//
// CATALOG_API_BASE:
//   ''                              → 같은 도메인(관리 서버가 /recommend 를 직접 서빙할 때, 로컬 테스트 포함)
//   'https://<railway-app-domain>'  → Vercel 등 다른 도메인에 분리 배포했을 때 관리 서버 주소(끝에 / 없이)
//
// 로컬 테스트: http://localhost:3000/recommend/?c=<code>

window.CATALOG_API_BASE = '';
