// [요청] 관리 UI 구조 개편 C단계 — 제조사 목록 페이지 초기화

loadManufacturers().then(renderManufacturers);

registerModalClosers({
  manufacturerDeleteModal: closeManufacturerDeleteModal,
});
