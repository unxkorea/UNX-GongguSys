// [요청] 관리 UI 구조 개편 A단계 — 인스타그램 분석
// index.html 원본 2426-2560 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  인스타그램 분석
// ═══════════════════════════════════════
// [요청] 인스타그램 URL → 평균 릴스 통계 조회
let instaPollTimer = null;

function fmtInstaNum(n) {
  if (n == null) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function startInstaAnalyze(mode) {
  const url = document.getElementById('instagramProfileUrl').value.trim();
  if (!url) { alert('인스타 프로필 URL을 입력해주세요.'); return; }
  // 모드별 버튼 잠금
  document.getElementById('btnInstaQuick').disabled = true;
  document.getElementById('btnInstaFull').disabled = true;
  document.getElementById('instaResultBox').style.display = 'none';
  document.getElementById('instaStatusBox').style.display = 'block';
  document.getElementById('instaStatusStep').textContent = '시작 중...';
  document.getElementById('instaStatusProgress').textContent = '';
  document.getElementById('instaLogArea').textContent = '';

  try {
    const res = await fetch('/api/instagram/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileUrl: url, mode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '분석 시작 실패');
    }
    startInstaPolling();
  } catch (e) {
    alert('오류: ' + e.message);
    finishInstaUI();
  }
}

function startInstaPolling() {
  if (instaPollTimer) clearInterval(instaPollTimer);
  pollInstaOnce();
  instaPollTimer = setInterval(pollInstaOnce, 1500);
}

async function pollInstaOnce() {
  try {
    const res = await fetch('/api/instagram/status');
    const job = await res.json();
    if (!job || job.status === 'idle') {
      finishInstaUI();
      return;
    }
    // 진행 표시
    document.getElementById('instaStatusStep').textContent = job.currentStep || '진행 중...';
    const pg = job.total > 0 ? `${job.progress || 0} / ${job.total}` : '';
    document.getElementById('instaStatusProgress').textContent = pg ? `진행: ${pg}` : '';
    // 로그 (최근 20줄)
    if (job.logs && job.logs.length) {
      const logEl = document.getElementById('instaLogArea');
      logEl.textContent = job.logs.slice(-50).join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (job.status === 'done') {
      renderInstaResult(job.result);
      finishInstaUI();
    } else if (job.status === 'error') {
      renderInstaError(job.error);
      finishInstaUI();
    }
  } catch (e) {
    // 통신 일시 실패는 무시 (다음 폴링에서 재시도)
  }
}

function finishInstaUI() {
  if (instaPollTimer) { clearInterval(instaPollTimer); instaPollTimer = null; }
  document.getElementById('btnInstaQuick').disabled = false;
  document.getElementById('btnInstaFull').disabled = false;
  document.getElementById('instaStatusBox').style.display = 'none';
}

function renderInstaResult(r) {
  if (!r) return;
  const card = (label, value, sub) => `
    <div class="stat-card" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff)">
      <div class="stat-value" style="font-size:30px">${esc(fmtInstaNum(value))}</div>
      <div class="stat-label" style="font-weight:600">${esc(label)}</div>
      ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">${esc(sub)}</div>` : ''}
    </div>`;
  const cards = [];
  cards.push(card('평균 조회수', r.avgViews, `샘플 ${r.sampleCount}개`));
  if (r.mode === 'full') {
    cards.push(card('평균 좋아요', r.avgLikes, `샘플 ${r.likesSampleCount}개`));
    cards.push(card('평균 댓글', r.avgComments, `샘플 ${r.commentsSampleCount}개`));
  }
  const box = document.getElementById('instaResultBox');
  box.style.display = 'block';
  box.innerHTML = `
    <div style="font-size:13px;color:#6b7280;margin-bottom:10px">
      <b>@${esc(r.targetUsername)}</b> · ${r.mode === 'full' ? '전체 분석' : '빠른 분석'} · ${fmtKst(r.sampledAt)}
    </div>
    <div class="run-stats">${cards.join('')}</div>
  `;
}

function renderInstaError(msg) {
  const box = document.getElementById('instaResultBox');
  box.style.display = 'block';
  box.innerHTML = `
    <div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:14px 18px;font-size:14px">
      <b>분석 실패</b><br>${esc(msg)}
    </div>`;
}

// 페이지 로드 후 진행 중 작업이 있으면 폴링 재개 (다중 PC 동기화)
async function syncInstaRunning() {
  try {
    const res = await fetch('/api/instagram/status');
    const job = await res.json();
    if (job && job.status === 'running') {
      document.getElementById('btnInstaQuick').disabled = true;
      document.getElementById('btnInstaFull').disabled = true;
      document.getElementById('instaStatusBox').style.display = 'block';
      startInstaPolling();
    } else if (job && job.status === 'done' && job.result) {
      renderInstaResult(job.result);
    }
  } catch {}
}
