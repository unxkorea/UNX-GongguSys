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
  // [요청] 카페24 제품 연동
  cafe24Modal: closeCafe24Modal,
});

// [요청] 카페24 제품 연동 — OAuth 콜백 복귀 처리 (?cafe24=connected|error)
(function handleCafe24Return() {
  const params = new URLSearchParams(location.search);
  const result = params.get('cafe24');
  if (!result) return;
  history.replaceState(null, '', location.pathname); // 새로고침 시 재알림 방지
  if (result === 'connected') {
    showToast('카페24 인증 완료!');
    openCafe24Modal(); // 바로 제품 목록으로 이어가기
  } else if (result === 'error') {
    showAlert('카페24 인증 실패: ' + (params.get('msg') || '알 수 없는 오류'));
  }
})();
