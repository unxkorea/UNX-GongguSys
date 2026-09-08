// [요청] 관리 UI 구조 개편 C단계 — 탭 전환 로직 제거, 헤더/탭 배지만 담당
// A단계까지는 SPA 패널 토글(activateSub/onPanelEnter/탭 클릭 리스너)을 여기서 했으나,
// MPA 전환으로 탭이 <a href>가 되면서 전부 불필요해짐. active 표시는 서버(EJS)가 렌더한다.
// 남은 책임: 모든 페이지 공통으로 뜨는 ① 헤더 인포크 배지 ② 리드 탭 마감 배지.

// ═══════════════════════════════════════
//  헤더 인포크 확인 배지 (인포크 N건)
// ═══════════════════════════════════════
async function updateReplyBadge() {
  const badge = document.getElementById('headerReplyBadge');
  if (!badge) return;
  try {
    const res = await fetch('/api/replies/status');
    const data = await res.json();
    if (!data.results || !data.results.results) return;

    const checkedAt = data.results.checkedAt;
    const seenAt = localStorage.getItem('repliesSeenAt');
    // 이미 본 결과면 배지 숨김
    if (seenAt && seenAt >= checkedAt) {
      badge.style.display = 'none';
      return;
    }

    const total = data.results.results.reduce((sum, r) => sum + (r.replyCount || 0), 0);
    if (total > 0) {
      badge.textContent = `인포크 ${total}건`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

// [요청] C단계 — 인포크 확인 페이지 진입 시 배지 숨김 + 확인 시각 저장.
//   A단계까지 onPanelEnter('replies')가 하던 일. 이제 replies 페이지 init이 호출한다.
function markRepliesSeen() {
  const badge = document.getElementById('headerReplyBadge');
  if (badge) badge.style.display = 'none';
  localStorage.setItem('repliesSeenAt', new Date().toISOString());
}

// ═══════════════════════════════════════
//  리드 탭 마감 배지 (모든 페이지 공통)
// ═══════════════════════════════════════
// [요청] C단계 — A단계까지 leads.js가 메모리의 leads 배열로 갱신했으나,
//   MPA에선 리드 페이지가 아니어도 탭 배지가 떠야 하므로 nav가 직접 조회한다.
//   leads 페이지는 수정 직후 즉시 반영이 필요해 배열을 넘겨 호출(fetch 생략)한다.
function renderLeadsBadge(list) {
  const badge = document.getElementById('leadsDueBadge');
  if (!badge) return;
  const today = todayIso();
  const dueCount = (list || []).filter(l => isDue(l, today)).length;
  if (dueCount > 0) {
    badge.textContent = dueCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

async function refreshLeadsBadge() {
  if (!document.getElementById('leadsDueBadge')) return;
  try {
    const res = await fetch('/api/leads');
    if (!res.ok) return;
    renderLeadsBadge(await res.json());
  } catch {}
}

// ═══════════════════════════════════════
//  모달 ESC 닫기 (공통 핸들러 + 페이지별 등록)
// ═══════════════════════════════════════
// [요청] C단계 — A단계까지 init.js가 6개 모달을 한 객체에 하드코딩했으나,
//   MPA에선 페이지마다 싣는 모달이 달라 각 페이지 init이 자기 것만 등록한다.
const MODAL_CLOSERS = {};
function registerModalClosers(map) { Object.assign(MODAL_CLOSERS, map); }

// [요청] alert/confirm 전면 모달 전환 — 공용 다이얼로그는 전 페이지 공통이라 여기서 등록 (ESC = confirm 취소)
registerModalClosers({ appDialogModal: () => closeAppDialog(false) });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = Array.from(document.querySelectorAll('.modal-backdrop'))
    .filter(el => el.style.display && el.style.display !== 'none');
  if (open.length === 0) return;
  const top = open[open.length - 1];
  const closer = MODAL_CLOSERS[top.id];
  if (closer) {
    e.stopPropagation();
    closer();
  }
});

// ═══════════════════════════════════════
//  공통 부트스트랩 (모든 페이지)
// ═══════════════════════════════════════
updateReplyBadge();
setInterval(updateReplyBadge, 30000);
refreshLeadsBadge();
