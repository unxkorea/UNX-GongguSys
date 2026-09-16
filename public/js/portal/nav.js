// [요청] /portal 분리복제 — public/js/nav.js에서 이 3탭(인플루언서/발송/답장확인)에 필요한 부분만 추린 사본.
//   리드 마감 배지 등 다른 탭 전용 로직은 제외. 원본 nav.js를 고쳐도 자동 반영되지 않는다.

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

// 인포크 확인 페이지 진입 시 배지 숨김 + 확인 시각 저장
function markRepliesSeen() {
  const badge = document.getElementById('headerReplyBadge');
  if (badge) badge.style.display = 'none';
  localStorage.setItem('repliesSeenAt', new Date().toISOString());
}

// ═══════════════════════════════════════
//  헤더 사용자 표시 + 전역 currentUser
// ═══════════════════════════════════════
window.currentUser = null;
window.currentUserReady = (async function loadCurrentUser() {
  const badge = document.getElementById('headerUser');
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    window.currentUser = data.user || null;
    if (badge) {
      if (data.needsAuth && data.user) {
        const roleLabel = data.user.role === 'admin' ? '관리자' : '직원';
        badge.textContent = `${data.user.name || data.user.loginId || roleLabel} · ${roleLabel}`;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch { /* 조회 실패 시 조용히 무시 — 헤더 배지만 안 뜸 */ }
  return window.currentUser;
})();

// ═══════════════════════════════════════
//  로그아웃 — 공유 settings.js를 로드하지 않으므로 여기에 둔다
// ═══════════════════════════════════════
async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login';
}

// ═══════════════════════════════════════
//  모달 ESC 닫기 (공통 핸들러 + 페이지별 등록)
// ═══════════════════════════════════════
const MODAL_CLOSERS = {};
function registerModalClosers(map) { Object.assign(MODAL_CLOSERS, map); }

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
//  공통 부트스트랩
// ═══════════════════════════════════════
updateReplyBadge();
setInterval(updateReplyBadge, 30000);
