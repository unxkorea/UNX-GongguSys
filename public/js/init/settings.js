// [요청] 관리 UI 구조 개편 C단계 — 설정 페이지 초기화

updateLogoutButton();
loadSettings();
loadAccounts();
loadEmailAccounts();
// [요청] 직원 관리 카드
loadEmployees().then(renderEmployeesAdmin);
