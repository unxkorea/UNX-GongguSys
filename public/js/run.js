// [요청] 관리 UI 구조 개편 A단계 — 매크로 실행 + 실패/발송중 목록
// index.html 원본 2050-2327 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  매크로 실행
// ═══════════════════════════════════════
let pollTimer = null;

async function loadRunStats() {
  const res = await fetch('/api/accounts');
  const accs = await res.json();
  const totalSent = accs.reduce((s, a) => s + a.sent, 0);
  const totalRemaining = accs.reduce((s, a) => s + a.remaining, 0);

  const infRes = await fetch('/api/influencers');
  const infs = await infRes.json();

  const logRes = await fetch('/api/logs');
  const logs = await logRes.json();

  document.getElementById('runStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${infs.length}</div><div class="stat-label">대기 인플루언서</div></div>
    <div class="stat-card"><div class="stat-value">${totalSent}</div><div class="stat-label">이번 주 발송</div></div>
    <div class="stat-card"><div class="stat-value">${totalRemaining}</div><div class="stat-label">남은 슬롯</div></div>
    <div class="stat-card"><div class="stat-value">${accs.length}</div><div class="stat-label">총 계정</div></div>
  `;

  // [요청] 다음 사용 계정 표시 — accountManager.getAvailableAccount() 와 동일 규칙(id ASC + remaining>0 첫 계정).
  const nextRow = document.getElementById('nextAccountRow');
  if (accs.length === 0) {
    nextRow.className = 'next-account-row empty';
    nextRow.innerHTML = `<div class="info"><span class="label">다음 사용 계정 (인포크)</span><span>등록된 계정 없음</span></div>`;
    currentNextAccountId = null;
    manualEditMode = false;
  } else {
    const next = accs.find(a => a.remaining > 0);
    if (!next) {
      nextRow.className = 'next-account-row empty';
      nextRow.innerHTML = `<div class="info"><span class="label">다음 사용 계정 (인포크)</span><span>모든 계정 이번 주 한도 소진</span></div>`;
      currentNextAccountId = null;
      manualEditMode = false;
    } else {
      nextRow.className = 'next-account-row';
      // [요청] 수동발송처리 4단계 — 다음 사용 계정이 바뀌면 편집 모드 자동 종료(다른 계정에 의도치 않게 ±하지 않도록)
      if (currentNextAccountId !== null && currentNextAccountId !== next.id) {
        manualEditMode = false;
      }
      currentNextAccountId = next.id;
      const infoHtml = `
        <div class="info">
          <span class="label">다음 사용 계정 (인포크)</span>
          <span class="username">${esc(next.username)}</span>
          <span class="meta">이번 주 ${next.sent}/10 발송 · 남은 슬롯 ${next.remaining}개</span>
        </div>`;
      // [요청] 수동발송처리 4단계 — 평소엔 [수동발송처리] 한 버튼만, 모달 확인 후에만 ±1/수정완료 노출
      const actionHtml = manualEditMode
        ? `<div class="adjust-group" title="수동 발송한 경우 카운트 보정 — 즉시 반영">
            <button class="adjust-btn" onclick="adjustNextAccount(-1)" ${next.sent <= 0 ? 'disabled' : ''} title="이번 주 발송 카운트 -1">−1</button>
            <button class="adjust-btn" onclick="adjustNextAccount(1)" title="이번 주 발송 카운트 +1">+1</button>
            <button class="done-btn" onclick="closeManualEdit()">수정완료</button>
          </div>`
        : `<div class="adjust-group">
            <button class="manual-send-btn" onclick="openManualSendModal()" title="수동으로 인포크 발송했을 때 카운트 보정">수동발송처리</button>
          </div>`;
      nextRow.innerHTML = infoHtml + actionHtml;
    }
  }
}

// [요청] 수동발송처리 4단계 — 1단계→2단계: 모달 열기
let manualEditMode = false;
function openManualSendModal() {
  document.getElementById('manualSendModal').style.display = 'flex';
}
function closeManualSendModal() {
  document.getElementById('manualSendModal').style.display = 'none';
}
// 2단계→3단계: 확인 시 편집 모드 진입
function confirmManualSend() {
  manualEditMode = true;
  closeManualSendModal();
  loadRunStats();
}
// 4단계: 수정완료 → 닫힘 상태 복귀 (즉시반영 모델이라 별도 commit 없음)
function closeManualEdit() {
  manualEditMode = false;
  loadRunStats();
}

// [요청] 주간 카운트 강제 증감 — 현재 표시된 next 계정의 카운트를 즉시 ±1
let currentNextAccountId = null;
async function adjustNextAccount(delta) {
  if (!currentNextAccountId) return;
  const id = currentNextAccountId;
  try {
    const res = await fetch(`/api/accounts/${id}/adjust-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showAlert(`카운트 변경 실패: ${err.error || res.status}`);
      return;
    }
  } catch (e) {
    showAlert(`카운트 변경 실패: ${e.message}`);
    return;
  }
  await loadRunStats();
}

async function startMacro(dryRun) {
  const hasEmailTarget = influencers.some(i => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((i.profileUrl || '').trim()));
  const emailAccountId = document.getElementById('runEmailAccount').value;
  // [요청] 메일만 발송 옵션
  const mailOnly = document.getElementById('runMailOnly').checked;
  if (mailOnly && !hasEmailTarget) {
    showAlert('메일만 발송 옵션이 켜져있는데 이메일 타겟이 하나도 없습니다.');
    return;
  }
  if (hasEmailTarget && !emailAccountId) {
    showAlert('이메일 주소가 포함되어 있습니다. 상단 "메일 발송 계정"을 먼저 선택해주세요.');
    return;
  }
  const confirmMsg = dryRun
    ? '테스트 실행(DRY-RUN)을 시작하시겠습니까?'
    : (mailOnly ? '메일만 발송을 시작하시겠습니까? (인포크 스킵)' : '제안서 발송을 시작하시겠습니까?');
  if (!(await showConfirm(confirmMsg))) return;

  // 먼저 인플루언서 저장
  await fetch('/api/influencers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(influencers) });

  const res = await fetch('/api/macro/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun, emailAccountId: emailAccountId || undefined, mailOnly })
  });
  const data = await res.json();
  if (!res.ok) { showAlert(data.error); return; }

  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnDryRun').style.display = 'none';
  document.getElementById('btnStop').style.display = '';
  document.getElementById('headerStatus').textContent = dryRun ? 'DRY-RUN 실행 중' : '발송 중';
  document.getElementById('headerStatus').style.background = 'rgba(16,185,129,0.3)';

  pollTimer = setInterval(pollStatus, 1000);
}

async function stopMacro() {
  if (!(await showConfirm('매크로를 중지하시겠습니까?'))) return;
  await fetch('/api/macro/stop', { method: 'POST' });
}

// [요청] 다중 PC 접속 시 매크로 실행 상태 동기화 — 페이지 진입 시 서버에서 running 가져와 UI 맞춤
async function syncMacroRunning() {
  try {
    const res = await fetch('/api/macro/status');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.running) return;
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnDryRun').style.display = 'none';
    document.getElementById('btnStop').style.display = '';
    document.getElementById('headerStatus').textContent = '발송 중';
    document.getElementById('headerStatus').style.background = 'rgba(16,185,129,0.3)';
    if (!pollTimer) pollTimer = setInterval(pollStatus, 1000);
    pollStatus();
  } catch {}
}

async function pollStatus() {
  const res = await fetch('/api/macro/status');
  const data = await res.json();

  const logArea = document.getElementById('logArea');
  logArea.innerHTML = data.logs.map(line => {
    if (line.includes('성공')) return `<span class="success">${esc(line)}</span>`;
    if (line.includes('실패') || line.includes('ERROR') || line.includes('오류')) return `<span class="error">${esc(line)}</span>`;
    if (line.includes('로그인') || line.includes('계정') || line.includes('────')) return `<span class="info">${esc(line)}</span>`;
    return esc(line);
  }).join('\n');
  logArea.scrollTop = logArea.scrollHeight;

  // [요청] 실행 중에도 실패 목록 실시간 표시
  loadFailed();
  // [요청] 발송한 인플루언서 건바이건 삭제 — 대기 목록/카운트도 실시간 반영
  loadInfluencers();
  loadRunStats();
  // [요청] 발송 중 크래시 대비 — sending 상태 실시간 반영 (정상 발송 중에는 즉시 sent로 바뀌어 사라짐)
  loadSending();

  if (!data.running) {
    clearInterval(pollTimer);
    document.getElementById('btnStart').style.display = '';
    document.getElementById('btnDryRun').style.display = '';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('headerStatus').textContent = '완료';
    document.getElementById('headerStatus').style.background = 'rgba(255,255,255,0.2)';
    loadAccounts();
    loadRunStats();
  }
}

// ═══════════════════════════════════════
//  실패 목록
// ═══════════════════════════════════════
async function loadFailed() {
  const res = await fetch('/api/failed');
  const failed = await res.json();
  const card = document.getElementById('failedCard');
  if (failed.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('failedCount').textContent = failed.length;
  document.getElementById('failedBody').innerHTML = failed.map(f => `<tr>
    <td>${esc(f.nickname)}</td>
    <td style="font-size:12px;word-break:break-all">${esc(f.profileUrl)}</td>
    <td>${esc(f.productName)}</td>
    <td style="font-size:12px;color:#ef4444">${esc(f.error || '')}</td>
  </tr>`).join('');
}

async function clearFailed() {
  if (!(await showConfirm('실패 목록을 삭제하시겠습니까?'))) return;
  await fetch('/api/failed', { method: 'DELETE' });
  loadFailed();
}

// [요청] 발송 중 크래시 대비 — sending 상태 확인/해결
async function loadSending() {
  const res = await fetch('/api/influencers/sending');
  if (!res.ok) return;
  const list = await res.json();
  const card = document.getElementById('sendingCard');
  if (!list.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('sendingCount').textContent = list.length;
  document.getElementById('sendingBody').innerHTML = list.map(r => {
    const when = r.updatedAt ? new Date(r.updatedAt).toLocaleString('ko-KR') : '';
    return `<tr>
      <td>${esc(r.nickname)}</td>
      <td style="font-size:12px;word-break:break-all">${esc(r.profileUrl)}</td>
      <td>${esc(r.productName)}</td>
      <td style="font-size:12px;color:#6b7280">${esc(when)}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="resolveSending(${r.id}, 'sent')">실제로 보냄</button>
        <button class="btn btn-sm" onclick="resolveSending(${r.id}, 'requeue')">pending 복구</button>
      </td>
    </tr>`;
  }).join('');
}

async function resolveSending(id, action) {
  const confirmMsg = action === 'sent'
    ? '정말 보낸 건으로 처리하시겠습니까? 감사 로그에 추가되고 대기열에서 제거됩니다.'
    : 'pending 상태로 되돌리시겠습니까? 다음 실행 시 다시 발송됩니다.';
  if (!(await showConfirm(confirmMsg))) return;
  const res = await fetch(`/api/influencers/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  if (!res.ok) { showAlert(`실패: ${data.error || '알 수 없는 오류'}`); return; }
  loadSending();
  loadInfluencers();
  loadRunStats();
}

async function retryFailed() {
  if (!(await showConfirm('실패한 인플루언서를 인플루언서 목록에 추가하시겠습니까?'))) return;
  const res = await fetch('/api/failed/retry', { method: 'POST' });
  const data = await res.json();
  if (res.ok) {
    showAlert(`${data.added}명이 인플루언서 목록에 추가되었습니다. 다시 발송해주세요.`);
    loadInfluencers();
    loadFailed();
  }
}
