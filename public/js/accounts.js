// [요청] 관리 UI 구조 개편 A단계 — 계정 관리 + Gmail 계정
// index.html 원본 893-1063, 1092-1130 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  계정 관리
// ═══════════════════════════════════════
async function loadAccounts() {
  await loadAccountsData();    // [요청] C단계 검수 — 데이터 fetch는 state.js 공용 로더로 일원화
  renderAccounts();
}

function renderAccounts() {
  // [요청] C단계 — replies.js 는 인포크확인 페이지에서만 로드되므로 존재할 때만 호출
  if (typeof renderRepliesAccountOptions === 'function') renderRepliesAccountOptions();
  const tbody = document.getElementById('accountsBody');
  if (!tbody) return;   // [요청] C단계 — 설정 페이지가 아니면 렌더 대상 없음
  document.getElementById('accountCount').textContent = accounts.length;
  tbody.innerHTML = accounts.map((acc, i) => {
    const pct = (acc.sent / 10) * 100;
    const cls = pct >= 100 ? 'full' : pct >= 50 ? 'mid' : 'low';
    return `<tr>
      <td>${acc.id ?? '신규'}</td>
      <td><input type="text" value="${esc(acc.username)}" onchange="accounts[${i}].username=this.value"></td>
      <td><input type="password" value="${esc(acc.password)}" onchange="accounts[${i}].password=this.value"></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="flex:1"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
          <input type="text" value="${acc.sent}" style="width:40px;text-align:center;padding:4px;border:1px solid #d1d5db;border-radius:4px" onchange="updateSentCount(${i}, this.value)">/10
        </div>
      </td>
      <td style="display:flex;gap:4px;white-space:nowrap">
        <button class="btn btn-sm" style="background:#6b7280;color:#fff;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;white-space:nowrap" onclick="resetAccountCount(${i})" title="이번주 발송 0으로 초기화">초기화</button>
        <button class="btn btn-danger btn-sm" onclick="removeAccount(${i})">X</button>
      </td>
    </tr>`;
  }).join('');
}

function updateSentCount(i, val) {
  const count = parseInt(val) || 0;
  accounts[i].sent = count;
  // weeklyTracking에도 반영
  const week = accounts[i].week;
  if (week) {
    accounts[i].weeklyTracking[week] = count;
  }
  renderAccounts();
}

function addAccount() {
  // [요청] 설정 > 계정 추가 저장 안 됨 — id 부여를 server/repo에 위임 (id:null이어야 Supabase insert 분기 진입)
  accounts.push({ id: null, username: '', password: '', weeklyTracking: {}, sent: 0, remaining: 10 });
  renderAccounts();
}

function resetAccountCount(i) {
  updateSentCount(i, 0);
}

function removeAccount(i) {
  accounts.splice(i, 1);
  renderAccounts();
}

async function saveAccounts() {
  const toSave = accounts.map(({ sent, remaining, week, ...rest }) => rest);
  await fetch('/api/accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSave) });
  showAlert('계정 정보가 저장되었습니다.');
  loadAccounts();
}

async function resetCounts() {
  if (!(await showConfirm('모든 계정의 이번 주 발송 횟수를 초기화하시겠습니까?'))) return;
  await fetch('/api/accounts/reset', { method: 'POST' });
  loadAccounts();
}

// ═══════════════════════════════════════
//  이메일 계정 (Gmail)
// ═══════════════════════════════════════
async function loadEmailAccounts() {
  const res = await fetch('/api/emailAccounts');
  emailAccounts = await res.json();
  renderEmailAccounts();
}

function renderEmailAccounts() {
  renderRunEmailAccountOptions();
  const container = document.getElementById('emailAccountsBody');
  if (!container) return;   // [요청] C단계 — 설정 페이지가 아니면 렌더 대상 없음
  document.getElementById('emailAccountCount').textContent = emailAccounts.length;
  container.innerHTML = emailAccounts.map((acc, i) => `
    <div class="product-card" style="cursor:default">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="form-group" style="margin-bottom:0">
          <label>Gmail 주소 #${acc.id}</label>
          <input type="text" value="${esc(acc.email)}" onchange="emailAccounts[${i}].email=this.value;renderRunEmailAccountOptions()">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>앱 비밀번호</label>
          <!-- [요청] Google이 'abcd efgh ijkl mnop' 형식으로 보여줘서 그대로 붙여넣기 쉬움 → 입력 즉시 공백 제거 -->
          <input type="password" value="${esc(acc.appPassword)}" onchange="this.value=this.value.replace(/\\s+/g,'');emailAccounts[${i}].appPassword=this.value">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>표시 이름 (선택)</label>
          <input type="text" value="${esc(acc.senderName || '')}" onchange="emailAccounts[${i}].senderName=this.value;renderRunEmailAccountOptions()" placeholder="예: 언엑스">
        </div>
      </div>
      <div class="form-group">
        <label>서명 텍스트 (선택) — HTML 또는 일반 텍스트</label>
        <textarea rows="4" onchange="emailAccounts[${i}].signature=this.value" placeholder="예시:&#10;경현 / 언엑스&#10;010-0000-0000&#10;https://undefiance.com">${esc(acc.signature || '')}</textarea>
      </div>
      <div class="form-group">
        <label>서명 이미지 (명함 등 · 선택)</label>
        <div class="photo-grid">
          ${acc.signatureImage ? `
            <div style="position:relative">
              <img class="photo-thumb" style="width:auto;max-width:240px;height:auto" src="/assets/${acc.signatureImage.split('/').pop()}" onerror="this.style.display='none'">
              <button style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer" onclick="removeSignatureImage(${i})">X</button>
            </div>
          ` : `
            <label class="photo-upload-btn" style="width:120px">
              + 명함 업로드
              <input type="file" accept="image/*" style="display:none" onchange="uploadSignatureImage(${i}, this.files)">
            </label>
          `}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="verifyEmailAccount(${acc.id})">연결 테스트</button>
        <span id="emailVerify-${acc.id}" style="font-size:12px;flex:1;margin:0 12px"></span>
        <button class="btn btn-danger btn-sm" onclick="removeEmailAccount(${i})">삭제</button>
      </div>
    </div>
  `).join('');
}

function addEmailAccount() {
  const nextId = emailAccounts.length > 0 ? Math.max(...emailAccounts.map(a => a.id)) + 1 : 1;
  emailAccounts.push({ id: nextId, email: '', appPassword: '', senderName: '', signature: '' });
  renderEmailAccounts();
}

// [요청] alert/confirm 전면 모달 전환 — 공용 showConfirm 사용(async 전환, onclick 전용이라 안전)
async function removeEmailAccount(i) {
  if (!(await showConfirm('이 이메일 계정을 삭제하시겠습니까?'))) return;
  emailAccounts.splice(i, 1);
  renderEmailAccounts();
}

async function saveEmailAccounts() {
  await fetch('/api/emailAccounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailAccounts) });
  showAlert('이메일 계정 정보가 저장되었습니다.');
  loadEmailAccounts();
}

async function verifyEmailAccount(id) {
  // 저장 먼저 (현재 입력값 반영)
  await fetch('/api/emailAccounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailAccounts) });
  const el = document.getElementById('emailVerify-' + id);
  el.textContent = '확인 중...';
  el.style.color = '#6b7280';
  try {
    const res = await fetch('/api/emailAccounts/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await res.json();
    if (res.ok) {
      el.textContent = '✓ 성공';
      el.style.color = '#10b981';
    } else {
      el.textContent = '✗ ' + (data.error || '실패');
      el.style.color = '#ef4444';
    }
  } catch (e) {
    el.textContent = '✗ ' + e.message;
    el.style.color = '#ef4444';
  }
}

async function uploadSignatureImage(i, files) {
  if (!files || !files[0]) return;
  const original = files[0];
  let toUpload;
  try {
    toUpload = await resizeImage(original, 600, 0.85);
    console.log(`서명 이미지 리사이즈: ${(original.size/1024).toFixed(0)}KB → ${(toUpload.size/1024).toFixed(0)}KB`);
  } catch (e) {
    console.warn('리사이즈 실패, 원본 업로드:', e.message);
    toUpload = original;
  }
  const formData = new FormData();
  formData.append('photos', toUpload);
  const res = await fetch('/api/products/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.files && data.files[0]) {
    emailAccounts[i].signatureImage = data.files[0];
    await fetch('/api/emailAccounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailAccounts) });
    renderEmailAccounts();
  }
}

async function removeSignatureImage(i) {
  delete emailAccounts[i].signatureImage;
  await fetch('/api/emailAccounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailAccounts) });
  renderEmailAccounts();
}

function renderRunEmailAccountOptions() {
  const sel = document.getElementById('runEmailAccount');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">(선택 안 함)</option>' +
    emailAccounts.map(a => `<option value="${a.id}">${esc(a.email)}${a.senderName ? ' · ' + esc(a.senderName) : ''}</option>`).join('');
  if (prev) sel.value = prev;
  else if (emailAccounts.length > 0) sel.value = String(emailAccounts[0].id);
}
