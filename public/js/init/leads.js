// [요청] 관리 UI 구조 개편 C단계 — 리드 관리 페이지 초기화

// 리드 모달의 '관심 제품' 셀렉트 옵션에 필요 — 배열만 쓰므로 products.js 미로드, 데이터만 조회
loadProductsData();

loadLeads();
setInterval(loadLeads, 60000);

registerModalClosers({
  leadModal: closeLeadModal,
});
