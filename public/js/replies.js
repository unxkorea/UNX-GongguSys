// [요청] 관리 UI 구조 개편 A단계 — 인포크 확인
// index.html 원본 2328-2425 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  인포크 확인 (구 답장 확인)
// ═══════════════════════════════════════
let repliesPolling = null;

function renderRepliesAccountOptions() {
  const sel = document.getElementById('repliesStartAccount');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">전체 (처음부터)</option>' +
    accounts.map(a => `<option value="${esc(a.username)}">${esc(a.username)}</option>`).join('');
  if (prev) sel.value = prev;
}

async function startCheckReplies() {
  const startFrom = document.getElementById('repliesStartAccount').value;
  const res = await fetch('/api/replies/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startFrom: startFrom || undefined }),
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error || '시작 실패');
  document.getElementById('btnCheckReplies').style.display = 'none';
  document.getElementById('btnStopReplies').style.display = 'inline-block';
  document.getElementById('btnForceStopReplies').style.display = 'inline-block';
  document.getElementById('repliesLogArea').textContent = '시작...\n';
  // [요청] 헤더 뱃지 — 답장확인 중 표시
  document.getElementById('headerStatus').textContent = '답장확인 중';
  document.getElementById('headerStatus').style.background = 'rgba(99,102,241,0.3)';
  if (repliesPolling) clearInterval(repliesPolling);
  repliesPolling = setInterval(pollReplies, 1000);
}

async function stopCheckReplies() {
  await fetch('/api/replies/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
}

async function forceStopCheckReplies() {
  if (!(await showConfirm('강제 종료하시겠습니까? 진행 중인 작업이 즉시 중단됩니다.'))) return;
  await fetch('/api/replies/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });
}

async function pollReplies() {
  const res = await fetch('/api/replies/status');
  const data = await res.json();
  const logEl = document.getElementById('repliesLogArea');
  logEl.textContent = (data.logs || []).join('\n');
  logEl.scrollTop = logEl.scrollHeight;

  if (data.results && data.results.results) {
    const rows = data.results.results.map(r => {
      // [요청] 답장확인 '거절' 표시 — 거절 있으면 답장 건수 옆에 병기
      const rejectPart = r.rejectCount > 0
        ? ` <span style="color:#ef4444;font-weight:700">(${r.rejectCount}명 거절)</span>`
        : '';
      const status = r.error
        ? `<span style="color:#ef4444">오류: ${esc(r.error)}</span>`
        : r.replyCount > 0
          ? `<span style="color:#10b981;font-weight:700">${r.replyCount}명에게서 답장</span>${rejectPart}`
          : `<span style="color:#9ca3af">답장 없음</span>`;
      return `<tr><td>${esc(r.account)}</td><td>${status}</td></tr>`;
    }).join('');
    const total = data.results.results.reduce((s, r) => s + (r.replyCount || 0), 0);
    const totalRejects = data.results.results.reduce((s, r) => s + (r.rejectCount || 0), 0);
    const totalRejectPart = totalRejects > 0
      ? ` (거절 <strong style="color:#ef4444">${totalRejects}건</strong>)`
      : '';
    document.getElementById('repliesResult').innerHTML = `
      <div style="margin-bottom:12px;font-size:14px;color:#6b7280">확인 시각: ${fmtKst(data.results.checkedAt)} · 총 답장 <strong style="color:#6366f1">${total}건</strong>${totalRejectPart}</div>
      <table><thead><tr><th>계정</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table>
    `;
  }

  // [요청] 헤더 뱃지 3분기 — 발송/답장확인 상호 배타라 단순 처리
  const headerStatusEl = document.getElementById('headerStatus');
  if (data.running) {
    document.getElementById('btnCheckReplies').style.display = 'none';
    document.getElementById('btnStopReplies').style.display = 'inline-block';
    document.getElementById('btnForceStopReplies').style.display = 'inline-block';
    // 페이지 새로고침/다중 PC 동기화 시에도 답장확인 중 반영
    headerStatusEl.textContent = '답장확인 중';
    headerStatusEl.style.background = 'rgba(99,102,241,0.3)';
    if (!repliesPolling) repliesPolling = setInterval(pollReplies, 1000);
  } else {
    clearInterval(repliesPolling);
    repliesPolling = null;
    document.getElementById('btnCheckReplies').style.display = 'inline-block';
    document.getElementById('btnStopReplies').style.display = 'none';
    document.getElementById('btnForceStopReplies').style.display = 'none';
    // 답장확인이 점유한 뱃지일 때만 '준비'로 되돌림 (발송 중/완료 뱃지는 건드리지 않음)
    if (headerStatusEl.textContent === '답장확인 중') {
      headerStatusEl.textContent = '준비';
      headerStatusEl.style.background = 'rgba(255,255,255,0.2)';
    }
  }
}
