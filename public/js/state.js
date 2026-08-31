// [요청] 관리 UI 구조 개편 A단계 — 전역 상태
// index.html 원본 759-768 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  상태
// ═══════════════════════════════════════
let accounts = [];
let emailAccounts = [];
let products = [];
let influencers = [];
// [요청] 제조사 관리 — 제조사 목록 + 협업종료 제품 표시 토글
let manufacturers = [];
let showEndedProducts = false;
// [요청] C단계 검수 — leads.js 를 로드하지 않는 페이지(추천)도 배열을 참조하므로 상태는 여기서 선언
let leads = [];

// ═══════════════════════════════════════
//  데이터 전용 로더 (UI 모듈 없이 배열만 필요한 페이지용)
// ═══════════════════════════════════════
// [요청] C단계 검수 — 리드/추천/답장확인 페이지는 배열만 쓰는데 UI 모듈 전체를 싣고 있었다.
//   그 모듈들의 render*()는 컨테이너가 없어 no-op 이지만, 자기가 찍어내는 onclick 핸들러가
//   또 다른 미로드 파일(예: products.js → manufacturers.js)에 있어 잠재 결합이 남았다.
//   아래 로더로 데이터만 가져오면 해당 UI 모듈을 아예 로드하지 않아도 된다.
async function loadProductsData() {
  const res = await fetch('/api/products');
  products = await res.json();
}

async function loadLeadsData() {
  const res = await fetch('/api/leads');
  if (!res.ok) return;
  leads = await res.json();
}

async function loadAccountsData() {
  const res = await fetch('/api/accounts');
  accounts = await res.json();
}
