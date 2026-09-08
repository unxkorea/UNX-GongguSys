// [요청] 관리 UI 구조 개편 A단계 — 직원 관리 + 메모 문구
// index.html 원본 2689-2702, 2707-2931 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  [요청] 자주 사용하는 문구 — 직원 관리 + 직원별 문구 추가/복사
// ═══════════════════════════════════════
let employees = [];          // [{id, name, sortOrder, createdAt}]
let selectedEmployeeId = null; // 문구 탭에서 현재 선택된 직원 id

async function loadEmployees() {
  try {
    const res = await fetch('/api/employees');
    employees = await res.json();
  } catch { employees = []; }
  return employees;
}

// ── 설정 > 직원 관리 카드 ──
function renderEmployeesAdmin() {
  const box = document.getElementById('employeesBody');
  if (!box) return;
  if (!employees.length) {
    box.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:8px 0">등록된 직원이 없습니다. 아래에서 추가하세요.</p>';
    return;
  }
  box.innerHTML = employees.map(e => `
    <div class="employee-row">
      <span class="emp-name">${escapeHtml(e.name)}</span>
      <button class="btn btn-outline btn-sm" onclick="renameEmployee(${e.id})">이름변경</button>
      <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${e.id})">삭제</button>
    </div>`).join('');
}

async function addEmployee() {
  const input = document.getElementById('newEmployeeName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  try {
    const res = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '추가 실패'); return; }
    input.value = '';
    await loadEmployees();
    renderEmployeesAdmin();
    showToast('직원 추가됨');
  } catch (e) { showAlert('추가 실패: ' + e.message); }
}

async function renameEmployee(id) {
  const emp = employees.find(e => e.id === id);
  const name = prompt('새 이름', emp ? emp.name : '');
  if (name === null) return;
  if (!name.trim()) { showAlert('이름은 비울 수 없습니다.'); return; }
  try {
    const res = await fetch('/api/employees/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '변경 실패'); return; }
    await loadEmployees();
    renderEmployeesAdmin();
    showToast('이름 변경됨');
  } catch (e) { showAlert('변경 실패: ' + e.message); }
}

async function deleteEmployee(id) {
  const emp = employees.find(e => e.id === id);
  if (!(await showConfirm(`'${emp ? emp.name : ''}' 직원과 해당 직원의 모든 문구를 삭제합니다. 계속할까요?`))) return;
  try {
    const res = await fetch('/api/employees/' + id, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); showAlert(d.error || '삭제 실패'); return; }
    if (selectedEmployeeId === id) selectedEmployeeId = null;
    await loadEmployees();
    renderEmployeesAdmin();
    showToast('직원 삭제됨');
  } catch (e) { showAlert('삭제 실패: ' + e.message); }
}

// ── 문구 탭: 직원 서브탭 ──
function renderPhraseTabs() {
  const tabs = document.getElementById('phraseSubtabs');
  const content = document.getElementById('phraseContent');
  if (!tabs || !content) return;   // [요청] C단계 — 메모 페이지가 아니면 렌더 대상 없음
  if (!employees.length) {
    tabs.innerHTML = '';
    content.innerHTML = '<div class="phrase-empty">먼저 설정 → 직원 관리에서 직원을 추가하세요.</div>';
    return;
  }
  // 선택 직원이 없거나 삭제됐으면 첫 직원 선택
  if (!employees.some(e => e.id === selectedEmployeeId)) {
    selectedEmployeeId = employees[0].id;
  }
  tabs.innerHTML = employees.map(e =>
    `<div class="phrase-subtab ${e.id === selectedEmployeeId ? 'active' : ''}" onclick="selectPhraseEmployee(${e.id})">${escapeHtml(e.name)}</div>`
  ).join('');
  loadPhrases(selectedEmployeeId);
}

function selectPhraseEmployee(id) {
  selectedEmployeeId = id;
  renderPhraseTabs();
}

let currentPhrases = []; // 현재 선택 직원의 문구 목록 (id로 복사/수정 참조 — onclick 이스케이프 회피)
let editingPhraseId = null; // [요청] 인라인 수정 중인 문구 id (alert 대신 카드 내 폼)

async function loadPhrases(employeeId) {
  editingPhraseId = null; // 목록 재로드 시 인라인 수정 상태 해제
  const content = document.getElementById('phraseContent');
  try {
    const res = await fetch('/api/phrases?employeeId=' + employeeId);
    currentPhrases = await res.json();
  } catch { currentPhrases = []; }
  content.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;align-items:flex-start">
      <input type="text" id="newPhraseTitle" placeholder="제목 (선택)" style="width:200px">
      <textarea id="newPhraseContent" placeholder="문구 내용" rows="4" style="flex:1;min-height:42px;resize:vertical"></textarea>
      <button class="btn btn-primary btn-sm" onclick="addPhrase()" style="white-space:nowrap">+ 추가</button>
    </div>
    <div id="phraseList"></div>`;
  renderPhrases();
}

function renderPhrases() {
  const list = document.getElementById('phraseList');
  if (!list) return;   // [요청] C단계 — 메모 페이지가 아니면 렌더 대상 없음
  if (!currentPhrases.length) {
    list.innerHTML = '<div class="phrase-empty">등록된 문구가 없습니다. 위에서 추가하세요.</div>';
    return;
  }
  // [요청] 직원별 최대 3개 최상단 고정 — 고정 카운트 안내 (currentPhrases는 서버에서 pinned 우선 정렬됨)
  const pinnedCount = currentPhrases.filter(p => p.pinned).length;
  const countHtml = `<div class="phrase-pin-count">📌 고정 ${pinnedCount}/3</div>`;
  list.innerHTML = countHtml + currentPhrases.map(p => {
    // [요청] 수정은 showAlert(prompt) 대신 카드 내부 인라인 폼으로
    if (p.id === editingPhraseId) {
      // [요청] 메모 수정 textarea 높이 자동 — 저장된 내용 줄 수에 맞춰 rows(최소 4 ~ 최대 30)
      return `
    <div class="phrase-card phrase-editing">
      <input type="text" id="editPhraseTitle-${p.id}" class="phrase-edit-title" placeholder="제목 (선택)" value="${escapeHtml(p.title)}">
      <textarea id="editPhraseContent-${p.id}" class="phrase-edit-content" rows="${Math.min(Math.max((p.content || '').split('\n').length, 4), 30)}">${escapeHtml(p.content)}</textarea>
      <div class="phrase-actions">
        <button class="btn btn-primary btn-sm" onclick="savePhraseEdit(${p.id})">저장</button>
        <button class="btn btn-outline btn-sm" onclick="cancelPhraseEdit()">취소</button>
      </div>
    </div>`;
    }
    // [요청] 직원별 최대 3개 최상단 고정 — 우측 상단 📌 토글 아이콘(활성=노란원/비활성=흐림)
    return `
    <div class="phrase-card${p.pinned ? ' pinned' : ''}">
      <div class="phrase-pin-toggle${p.pinned ? ' active' : ''}" title="${p.pinned ? '고정 해제' : '고정'}" onclick="togglePin(${p.id}, ${p.pinned ? 'false' : 'true'})">📌</div>
      ${p.title ? `<div class="phrase-title">${escapeHtml(p.title)}</div>` : ''}
      <div class="phrase-content">${escapeHtml(p.content)}</div>
      <div class="phrase-actions">
        <button class="btn btn-primary btn-sm" onclick="copyPhrase(${p.id})">📋 복사</button>
        <button class="btn btn-outline btn-sm" onclick="editPhrase(${p.id})">수정</button>
        <button class="btn btn-danger btn-sm" onclick="deletePhrase(${p.id})">삭제</button>
      </div>
    </div>`;
  }).join('');
}

// [요청] 직원별 최대 3개 최상단 고정 — 핀 토글 (PIN_LIMIT 초과 시 서버가 400)
async function togglePin(id, pinned) {
  try {
    const res = await fetch('/api/phrases/' + id + '/pin', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned })
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '고정 변경 실패'); return; }
    loadPhrases(selectedEmployeeId);
    showToast(pinned ? '문구를 고정했습니다' : '고정을 해제했습니다');
  } catch (e) { showAlert('고정 변경 실패: ' + e.message); }
}

function copyPhrase(id) {
  const p = currentPhrases.find(x => x.id === id);
  if (p) copyText(p.content);
}

async function addPhrase() {
  const title = document.getElementById('newPhraseTitle').value.trim();
  const contentEl = document.getElementById('newPhraseContent');
  const content = contentEl.value.trim();
  if (!content) { contentEl.focus(); return; }
  try {
    const res = await fetch('/api/phrases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: selectedEmployeeId, title, content })
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '추가 실패'); return; }
    loadPhrases(selectedEmployeeId);
    showToast('문구 추가됨');
  } catch (e) { showAlert('추가 실패: ' + e.message); }
}

// [요청] 인라인 수정 — 카드를 편집 폼으로 전환(목록 재요청 없이 렌더만)
function editPhrase(id) {
  editingPhraseId = id;
  renderPhrases();
  const ta = document.getElementById('editPhraseContent-' + id);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelPhraseEdit() {
  editingPhraseId = null;
  renderPhrases();
}

async function savePhraseEdit(id) {
  const title = document.getElementById('editPhraseTitle-' + id).value.trim();
  const contentEl = document.getElementById('editPhraseContent-' + id);
  const content = contentEl.value.trim();
  if (!content) { contentEl.focus(); return; }
  try {
    const res = await fetch('/api/phrases/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || '수정 실패'); return; }
    editingPhraseId = null;
    loadPhrases(selectedEmployeeId);
    showToast('문구 수정됨');
  } catch (e) { showAlert('수정 실패: ' + e.message); }
}

async function deletePhrase(id) {
  if (!(await showConfirm('이 문구를 삭제할까요?'))) return;
  try {
    const res = await fetch('/api/phrases/' + id, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); showAlert(d.error || '삭제 실패'); return; }
    loadPhrases(selectedEmployeeId);
    showToast('문구 삭제됨');
  } catch (e) { showAlert('삭제 실패: ' + e.message); }
}
