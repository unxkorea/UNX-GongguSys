// [요청] 관리 UI 구조 개편 C단계 — 인포크/메일 발송 페이지 초기화

// 발송 계정 조정(±1) · 메일 계정 셀렉트 옵션에 필요
loadAccounts();
loadEmailAccounts();
// 이메일 타겟 존재 여부 판정 · 발송 후 목록 갱신에 필요
loadInfluencers();

loadRunStats();
loadFailed();
// [요청] 발송 중 크래시 대비 — 초기 로드
loadSending();
// [요청] 다중 PC 접속 시 매크로 실행 상태 동기화 — 초기 로드
syncMacroRunning();

registerModalClosers({
  manualSendModal: closeManualSendModal,
});
