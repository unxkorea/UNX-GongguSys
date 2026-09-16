// [요청] 관리 UI 구조 개편 C단계 — 설정 페이지 초기화

updateLogoutButton();
loadSettings();
loadAccounts();
loadEmailAccounts();
// [요청] 직원 관리 카드
loadEmployees().then(renderEmployeesAdmin);
// [요청] Railway 전환 2단계 — 계정/파트 관리 카드 (admin만 표시, currentUserReady 확인 후 자체적으로 로드)
initAccountsAdmin();

// [요청] Gmail API 발송 전환 — Google OAuth 콜백 복귀 처리 (?gmail=connected|error)
(function handleGmailReturn() {
  const params = new URLSearchParams(location.search);
  const result = params.get('gmail');
  if (!result) return;
  history.replaceState(null, '', location.pathname); // 새로고침 시 재알림 방지
  if (result === 'connected') {
    showToast('Google 연결 완료! 이제 서버에서 Gmail API로 발송됩니다.');
  } else if (result === 'error') {
    showAlert('Google 연결 실패: ' + (params.get('msg') || '알 수 없는 오류'));
  }
})();
