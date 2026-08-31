// [요청] 관리 UI 구조 개편 C단계 — 제품 목록 페이지 초기화
// A단계의 통짜 init.js 를 페이지별로 분할. 이 페이지에 필요한 것만 부른다.

// 제조사 먼저 로드(제품 콤보박스 옵션) 후 제품 로드
loadManufacturers().then(loadProducts);

// [요청] 카드 단위 저장 — 입력 발생한 카드만 dirty 마킹
function dirtyFromEvent(e) {
  if (!e.target.matches('input, textarea, select')) return;
  const card = e.target.closest('.product-card');
  if (!card) return;
  const idx = parseInt(card.id.replace('product-', ''), 10);
  if (!isNaN(idx) && products[idx]) markProductDirty(products[idx]);
}
const productsList = document.getElementById('productsList');
productsList.addEventListener('input', dirtyFromEvent);
productsList.addEventListener('change', dirtyFromEvent);

registerModalClosers({
  hookingModal: closeHookingModal,
  quickProductModal: closeQuickProductModal,
});
