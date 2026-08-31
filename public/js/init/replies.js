// [요청] 관리 UI 구조 개편 C단계 — 인포크 답장 확인 페이지 초기화

// [요청] 진입 시 헤더 배지 숨김 + 확인 시각 저장 (A단계 onPanelEnter('replies') 대체)
markRepliesSeen();

// '시작 계정' 셀렉트 옵션 채우기 — accounts 배열만 쓰므로 accounts.js 미로드
loadAccountsData().then(renderRepliesAccountOptions);

pollReplies();
