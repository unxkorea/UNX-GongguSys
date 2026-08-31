// [요청] 관리 UI 구조 개편 C단계 — 제품추천생성(추천 카탈로그) 페이지 초기화

// 공개 URL 도메인(window.CATALOG_PUBLIC_BASE_URL) 을 채운 뒤 목록을 그려야 링크가 맞음
loadSettings().then(loadCatalogs);
setInterval(loadCatalogs, 60000);

// 모달 좌패널 제품 목록 · 리드 닉네임 셀렉트에 필요 — 배열만 쓰므로 products.js/leads.js 미로드
loadProductsData();
loadLeadsData();

registerModalClosers({
  catalogModal: closeCatalogModal,
});
