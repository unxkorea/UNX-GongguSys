// [요청] 제조사-제품 통합 탭 — 페이지 초기화
// loadProducts() → renderProducts() → 훅(renderManufacturerProductsPage)으로 초기 렌더 + 첫 제조사 자동 선택.

loadManufacturers().then(loadProducts);

// 카드 단위 저장 — 입력 발생한 제품 카드만 dirty 마킹 (init/products.js와 동일 패턴, 컨테이너만 #mpRight)
function mpDirtyFromEvent(e) {
  if (!e.target.matches('input, textarea, select')) return;
  const card = e.target.closest('.product-card');
  if (!card) return;
  const idx = parseInt(card.id.replace('product-', ''), 10);
  if (!isNaN(idx) && products[idx]) markProductDirty(products[idx]);
}
const mpRightBox = document.getElementById('mpRight');
mpRightBox.addEventListener('input', mpDirtyFromEvent);
mpRightBox.addEventListener('change', mpDirtyFromEvent);

registerModalClosers({
  hookingModal: closeHookingModal,
  manufacturerDeleteModal: closeManufacturerDeleteModal,
  // [요청] 제조사 추가 팝업 모달 — ESC 닫힘 등록
  manufacturerModal: closeManufacturerModal,
});
