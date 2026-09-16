// [요청] Railway 전환 2단계 — 관리자 개별 계정(ID/PW) + 역할·파트 관리 (설정 > 계정 관리, admin 전용)
// employees 배열은 phrases.js의 loadEmployees()가 채운다(같은 페이지 로드 순서: phrases.js → 이 파일).
// classic script 순차 로드 — type="module" 금지, renderX()는 컨테이너 없으면 early-return.

let parts = []; // [{id, code, name, sortOrder, active}]

async function loadParts() {
  try {
    const res = await fetch('/api/parts');
    parts = await res.json();
  } catch { parts = []; }
  return parts;
}

// 현재 사용자가 admin일 때만 "계정 관리" / "파트 관리" 카드를 채운다(서버도 각 API에서 동일하게 강제).
async function initAccountsAdmin() {
  const box = document.getElementById('accountsAdminBody');
  if (!box) return; // 설정 페이지가 아니면 렌더 대상 없음
  await window.currentUserReady;
  const isAdmin = window.currentUser && window.currentUser.role === 'admin';
  const card = document.getElementById('accountsAdminCard');
  const partsCard = document.getElementById('partsAdminCard');
  if (!isAdmin) {
    // 과도기(레거시 단일 비밀번호로 로그인 시 role은 항상 'admin'이라 이 분기는 개인 계정으로 로그인한 staff에서만 보임.
    if (card) card.style.display = 'none';
    if (partsCard) partsCard.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  if (partsCard) partsCard.style.display = '';
  await Promise.all([loadEmployees(), loadParts()]);
  renderAccountsAdmin();
  renderPartsAdmin();
}

function roleLabel(role) {
  return role === 'admin' ? '관리자' : '직원';
}

function renderAccountsAdmin() {
  const box = document.getElementById('accountsAdminBody');
  if (!box) return;
  if (!employees.length) {
    box.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:8px 0">직원 관리에서 먼저 직원을 추가해주세요.</p>';
    return;
  }
  const activeParts = parts.filter(p => p.active);
  box.innerHTML = employees.map(e => {
    const hasAccount = !!e.loginId;
    const partsHtml = activeParts.map(p => `
      <label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;${e.role === 'admin' ? 'opacity:.5' : ''}">
        <input type="checkbox" data-emp="${e.id}" data-part="${p.id}"
          ${e.partIds.includes(p.id) ? 'checked' : ''} ${e.role === 'admin' ? 'disabled' : ''}>
        ${esc(p.name)}
      </label>`).join('');
    return `
    <div class="product-card" style="cursor:default">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>${esc(e.name)}</b>
        <span style="font-size:12px;color:${hasAccount ? '#10b981' : '#9ca3af'}">
          ${hasAccount ? '✓ 계정 있음 (' + esc(e.loginId) + ')' : '계정 없음 — 문구 전용 이름'}
          ${e.lastLoginAt ? ' · 마지막 로그인 ' + esc(String(e.lastLoginAt).slice(0, 16).replace('T', ' ')) : ''}
        </span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end;margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label>로그인 ID</label>
          <input type="text" id="acc-loginId-${e.id}" value="${esc(e.loginId || '')}" placeholder="예: kh.park">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>새 비밀번호 ${hasAccount ? '(변경 시에만 입력)' : ''}</label>
          <input type="password" id="acc-password-${e.id}" placeholder="${hasAccount ? '변경하지 않으려면 비움' : '계정 생성 시 필수'}" autocomplete="new-password">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>역할</label>
          <select id="acc-role-${e.id}">
            <option value="staff" ${e.role !== 'admin' ? 'selected' : ''}>직원</option>
            <option value="admin" ${e.role === 'admin' ? 'selected' : ''}>관리자</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>&nbsp;</label>
          <label style="display:flex;align-items:center;gap:4px;height:36px">
            <input type="checkbox" id="acc-active-${e.id}" ${e.active ? 'checked' : ''}> 활성
          </label>
        </div>
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">
          공동구매 파트 ${e.role === 'admin' ? '(관리자는 전체 파트 접근 — 개별 부여 불필요)' : '(중복 선택 가능)'}
        </label>
        ${partsHtml || '<span style="font-size:12px;color:#9ca3af">등록된 파트가 없습니다.</span>'}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="saveEmployeeParts(${e.id})">파트 저장</button>
        <button class="btn btn-primary btn-sm" onclick="saveEmployeeAccount(${e.id})">계정 정보 저장</button>
      </div>
    </div>`;
  }).join('');
}

async function saveEmployeeAccount(id) {
  const loginId = document.getElementById(`acc-loginId-${id}`).value.trim();
  const password = document.getElementById(`acc-password-${id}`).value;
  const role = document.getElementById(`acc-role-${id}`).value;
  const active = document.getElementById(`acc-active-${id}`).checked;
  const emp = employees.find(e => e.id === id);
  if (!loginId) { showAlert('로그인 ID를 입력해주세요.'); return; }
  if (!emp.loginId && !password) { showAlert('신규 계정은 비밀번호를 입력해야 합니다.'); return; }
  try {
    const res = await fetch(`/api/employees/${id}/account`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password: password || undefined, role, active }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '저장 실패'); return; }
    await loadEmployees();
    renderAccountsAdmin();
    showToast('계정 정보가 저장되었습니다.');
  } catch (e) { showAlert('저장 실패: ' + e.message); }
}

async function saveEmployeeParts(id) {
  const checked = Array.from(document.querySelectorAll(`input[data-emp="${id}"]:checked`))
    .map(el => Number(el.dataset.part));
  try {
    const res = await fetch(`/api/employees/${id}/parts`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partIds: checked }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '저장 실패'); return; }
    await loadEmployees();
    renderAccountsAdmin();
    showToast('파트가 저장되었습니다.');
  } catch (e) { showAlert('저장 실패: ' + e.message); }
}

// ── 공동구매 파트 관리 ──
function renderPartsAdmin() {
  const box = document.getElementById('partsAdminBody');
  if (!box) return;
  if (!parts.length) {
    box.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:8px 0">등록된 파트가 없습니다.</p>';
    return;
  }
  box.innerHTML = parts.map(p => `
    <div class="employee-row">
      <span class="emp-name" style="${p.active ? '' : 'color:#9ca3af;text-decoration:line-through'}">${esc(p.name)}</span>
      <button class="btn btn-outline btn-sm" onclick="renamePart(${p.id})">이름변경</button>
      <button class="btn btn-outline btn-sm" onclick="togglePartActive(${p.id}, ${!p.active})">${p.active ? '비활성화' : '활성화'}</button>
    </div>`).join('');
}

async function addPart() {
  const input = document.getElementById('newPartName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  try {
    const res = await fetch('/api/parts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '추가 실패'); return; }
    input.value = '';
    await loadParts();
    renderPartsAdmin();
    renderAccountsAdmin(); // 새 파트 체크박스가 계정 카드에도 보이도록
    showToast('파트가 추가되었습니다.');
  } catch (e) { showAlert('추가 실패: ' + e.message); }
}

async function renamePart(id) {
  const part = parts.find(p => p.id === id);
  const name = prompt('새 파트 이름', part ? part.name : '');
  if (name === null) return;
  if (!name.trim()) { showAlert('이름은 비울 수 없습니다.'); return; }
  try {
    const res = await fetch('/api/parts/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '변경 실패'); return; }
    await loadParts();
    renderPartsAdmin();
    renderAccountsAdmin();
    showToast('파트 이름이 변경되었습니다.');
  } catch (e) { showAlert('변경 실패: ' + e.message); }
}

async function togglePartActive(id, active) {
  try {
    const res = await fetch(`/api/parts/${id}/active`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '변경 실패'); return; }
    await loadParts();
    renderPartsAdmin();
    renderAccountsAdmin();
  } catch (e) { showAlert('변경 실패: ' + e.message); }
}
