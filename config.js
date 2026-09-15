const path = require('path');
const fs = require('fs');

// [요청] settings.json에서 런타임 설정 로드 (UI에서 변경 가능)
const SETTINGS_PATH = path.resolve(__dirname, 'settings.json');
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch { return {}; }
}

module.exports = {
  // [요청] Railway 전환 1단계 — 메인 DB가 Railway Postgres(pg). USE_SUPABASE 플래그를 DB_MODE로 개명.
  //   DB_MODE=pg   : Postgres (기본). DATABASE_URL 필요.
  //   DB_MODE=json : 로컬 JSON 파일 롤백 모드 (`DB_MODE=json npm run ui`). 구 `USE_SUPABASE=false`도 동일하게 인식.
  DB_MODE: process.env.DB_MODE || (process.env.USE_SUPABASE === 'false' ? 'json' : 'pg'),
  get USE_DB() { return this.DB_MODE !== 'json'; },
  // 하위 호환 별칭(구 스크립트용). 신규 코드는 USE_DB를 쓸 것.
  get USE_SUPABASE() { return this.USE_DB; },

  // 계정당 주간 발송 제한
  WEEKLY_LIMIT: 10,

  // 브라우저 설정
  // [요청] 외부 배포 대응 — settings.json에서 headless 토글 가능 (외부에서 발송 트리거 시 로컬 크롬창 안 뜨게)
  // [요청] Railway 전체 이관 — env 우선순위 (Railway에서 자동 headless=true, 로컬은 settings.json 또는 기본값=false)
  get HEADLESS() {
    // 1순위: 환경변수 HEADLESS_MODE (Railway에서 설정)
    if (process.env.HEADLESS_MODE !== undefined) {
      return process.env.HEADLESS_MODE === 'true';
    }
    // 2순위: settings.json (로컬 UI 토글)
    const setting = loadSettings().headless;
    if (setting !== undefined) return !!setting;
    // 3순위: 기본값 false (로컬에서 개발 시 창 띄우기)
    return false;
  },
  SLOW_MO: 300,           // 각 동작 사이 딜레이 (ms)

  // 타임아웃
  NAVIGATION_TIMEOUT: 30000,
  ACTION_DELAY: 2000,     // 제안서 발송 사이 대기 (ms)
  LOGOUT_DELAY: 3000,     // 로그아웃 후 대기 (ms)

  // 인포크링크 URL (실제 URL로 변경 필요)
  BASE_URL: 'https://link.inpock.co.kr',

  // 실패한 인플루언서 재시도 여부
  RETRY_FAILED: false,

  // 파일 경로
  PATHS: {
    accounts: path.resolve(__dirname, 'accounts.json'),
    emailAccounts: path.resolve(__dirname, 'emailAccounts.json'),
    products: path.resolve(__dirname, 'products.json'),
    influencers: path.resolve(__dirname, 'influencers.csv'),
    logs: path.resolve(__dirname, 'logs'),
    screenshots: path.resolve(__dirname, 'screenshots'),
    // [요청] 리드 관리 탭 신설 — JSON 폴백 경로
    leads: path.resolve(__dirname, 'leads.json'),
    // [요청] 제조사 관리 기능 — JSON 폴백 경로
    manufacturers: path.resolve(__dirname, 'manufacturers.json'),
  },

  MAIL_SUBJECT_PREFIX: '[언엑스 공동구매]',
  MAIL_SUBJECT_SUFFIX: '공동구매 제안 건',
  // [요청] UI 설정에서 참조자 이메일 변경 가능 — 빈값 저장 시 BCC 없음(하드코딩 폴백 제거)
  get MAIL_BCC() { return loadSettings().mailBcc || ''; },
};
