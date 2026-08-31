// [요청] 관리 UI 구조 개편 A단계 — 제조사 관리
// index.html 원본 1649-1964 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  [요청] 제조사 관리 — 제조사 추가 → 제품 추가 흐름
// ═══════════════════════════════════════
async function loadManufacturers() {
  try {
    const res = await fetch('/api/manufacturers');
    manufacturers = await res.json();
  } catch { manufacturers = []; }
  return manufacturers;
}

// 제품 폼 제조사 콤보박스 — 협업종료 제조사는 기본 제외(단, 현재 선택된 제조사는 항상 노출).
function manufacturersForSelect(selectedId, query) {
  const q = (query || '').trim().toLowerCase();
  return manufacturers.filter(m => {
    if (selectedId != null && m.id === Number(selectedId)) return true;
    if (m.status === '협업종료') return false;
    if (q && !String(m.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
}
function manufacturerOptionsHtml(selectedId, query) {
  const list = manufacturersForSelect(selectedId, query);
  const opts = ['<option value="">— 제조사 선택 —</option>'];
  for (const m of list) {
    const label = m.status === '협업종료' ? `${m.name} (협업종료)` : m.name;
    opts.push(`<option value="${m.id}" ${Number(selectedId) === m.id ? 'selected' : ''}>${esc(label)}</option>`);
  }
  return opts.join('');
}
// 검색어로 콤보박스 옵션만 갱신(포커스 보존을 위해 full re-render 회피)
function filterManufacturerSelect(i, query) {
  const sel = document.getElementById('mfrSelect-' + i);
  if (!sel) return;
  const p = products[i];
  sel.innerHTML = manufacturerOptionsHtml(p ? p.manufacturerId : null, query);
}
// 제조사 선택 → manufacturerId 세팅 + 브랜드명 자동 채움 + 빈 허들/일정/메모만 상속
function selectManufacturer(i, val) {
  const p = products[i];
  if (!p) return;
  const id = (val === '' || val == null) ? null : Number(val);
  p.manufacturerId = id;
  const m = manufacturers.find(x => x.id === id);
  if (m) {
    p.brandName = m.name;
    if (!String(p.hurdle || '').trim() && m.hurdle) p.hurdle = m.hurdle;
    if (!String(p.schedule || '').trim() && m.schedule) p.schedule = m.schedule;
    if (!String(p.memo || '').trim() && m.memo) p.memo = m.memo;
  }
  markProductDirty(p);
  renderProducts();
}
// 제품 협업종료/복귀 토글 (저장된 제품만)
async function toggleProductStatus(i) {
  const p = products[i];
  if (!p) return;
  if (p.id == null) { alert('먼저 저장한 뒤에 협업종료 처리할 수 있습니다.'); return; }
  const newStatus = p.status === '협업종료' ? '' : '협업종료';
  if (newStatus === '협업종료' && !confirm('이 제품을 협업종료 처리할까요?')) return;
  let res;
  try {
    res = await fetch('/api/products/' + encodeURIComponent(p.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, status: newStatus }),
    });
  } catch (e) { alert('실패(네트워크): ' + e.message); return; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '실패'); return; }
  p.status = newStatus;
  renderProducts();
  showToast(newStatus === '협업종료' ? '협업종료 처리됨' : '진행으로 복귀됨');
}
function onShowEndedProductsChange() {
  showEndedProducts = !!document.getElementById('showEndedProducts').checked;
  renderProducts();
}

// ── 제조사 목록 (제품 관리 2depth) ──
function renderManufacturers() {
  const box = document.getElementById('manufacturersList');
  if (!box) return;
  const q = (document.getElementById('manufacturerSearch')?.value || '').trim().toLowerCase();
  const showEnded = !!document.getElementById('showEndedManufacturers')?.checked;
  const list = manufacturers.filter(m => {
    if (!showEnded && m.status === '협업종료') return false;
    if (q && !`${m.name} ${m.contactPerson} ${m.contact}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const countEl = document.getElementById('manufacturerCount');
  if (countEl) countEl.textContent = list.length;
  if (!list.length) {
    box.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:32px;font-size:14px">제조사가 없습니다. 우측 상단 [+ 제조사 추가]로 등록하세요.</div>';
    return;
  }
  // [요청] 제조사 목록 — 행 클릭 시 인라인 펼침(읽기) → '수정' 버튼으로 편집 전환
  box.innerHTML = list.map(m => {
    const ended = m.status === '협업종료';
    const sub = [m.contactPerson, m.contact].filter(Boolean).map(esc).join(' · ');
    const open = expandedManufacturerId === m.id;
    const detail = open
      ? `<div class="manufacturer-detail">${editingInlineManufacturerId === m.id ? manufacturerEditFormHtml(m) : manufacturerReadHtml(m)}</div>`
      : '';
    return `
    <div class="manufacturer-item ${ended ? 'ended' : ''} ${open ? 'open' : ''}">
      <div class="manufacturer-head" onclick="toggleManufacturer(${m.id})">
        <span class="manufacturer-caret">▶</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b>${esc(m.name)}</b>
            ${ended ? '<span class="mfr-ended-badge">협업종료</span>' : ''}
            <span style="font-size:12px;color:#9ca3af">제품 ${m.productCount}개</span>
          </div>
          ${sub ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
        </div>
        ${ended
          ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();reopenManufacturer(${m.id})">진행 복귀</button>`
          : `<button class="btn btn-warn btn-sm" onclick="event.stopPropagation();endManufacturer(${m.id})">협업종료</button>`}
        <!-- [요청] 제조사 삭제(연결 제품도 함께 삭제) — 확인 모달. 덜 눈에 띄게 흰 배경+빨간 테두리/글씨 -->
        <button class="btn btn-sm" style="background:#fff;border:1px solid #ef4444;color:#ef4444" onclick="event.stopPropagation();openManufacturerDeleteModal(${m.id})">삭제</button>
      </div>
      ${detail}
    </div>`;
  }).join('');
}

// [요청] 제조사 목록 인라인 펼침 — 읽기 뷰
function manufacturerReadHtml(m) {
  const row = (label, val) => `<div class="full"><div class="mfr-read-label">${label}</div><div class="mfr-read-value">${val ? esc(val) : '<span style=\"color:#c0c4cc\">—</span>'}</div></div>`;
  const cell = (label, val) => `<div><div class="mfr-read-label">${label}</div><div class="mfr-read-value">${val ? esc(val) : '<span style=\"color:#c0c4cc\">—</span>'}</div></div>`;
  return `
    <div class="mfr-read-grid">
      ${cell('담당자', m.contactPerson)}
      ${cell('연락처', m.contact)}
      ${cell('허들', m.hurdle)}
      ${cell('일정 참고사항', m.schedule)}
      ${row('제조사 메모', m.memo)}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-outline btn-sm" onclick="startInlineEditManufacturer(${m.id})">수정</button>
    </div>`;
}

// [요청] 제조사 목록 인라인 펼침 — 편집 폼 (id는 인라인 전용 mfrInline*)
function manufacturerEditFormHtml(m) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label><span style="color:#ef4444;margin-right:2px">*</span>제조사명</label><input id="mfrInlineName" type="text" value="${esc(m.name)}"></div>
      <div class="form-group"><label>담당자</label><input id="mfrInlineContactPerson" type="text" value="${esc(m.contactPerson)}" placeholder="선택"></div>
      <div class="form-group"><label>연락처</label><input id="mfrInlineContact" type="text" value="${esc(m.contact)}" placeholder="선택 (전화·이메일·카톡 등)"></div>
      <div class="form-group"><label>허들</label><input id="mfrInlineHurdle" type="text" value="${esc(m.hurdle)}" placeholder="선택 (제품 기본값)"></div>
      <div class="form-group"><label>일정 참고사항</label><input id="mfrInlineSchedule" type="text" value="${esc(m.schedule)}" placeholder="선택 (제품 기본값)"></div>
    </div>
    <div class="form-group"><label>제조사 메모</label><textarea id="mfrInlineMemo" rows="2" placeholder="선택">${esc(m.memo)}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="cancelInlineEditManufacturer()">취소</button>
      <button class="btn btn-primary btn-sm" onclick="saveManufacturerInline(${m.id})">저장</button>
    </div>`;
}

// [요청] 제조사 목록 인라인 — 펼침/편집 상태
let expandedManufacturerId = null;
let editingInlineManufacturerId = null;
function toggleManufacturer(id) {
  id = Number(id);
  if (expandedManufacturerId === id) {
    expandedManufacturerId = null;
  } else {
    expandedManufacturerId = id;
  }
  editingInlineManufacturerId = null; // 펼침 전환 시 항상 읽기 모드로
  renderManufacturers();
}
function startInlineEditManufacturer(id) {
  editingInlineManufacturerId = Number(id);
  renderManufacturers();
  setTimeout(() => document.getElementById('mfrInlineName')?.focus(), 0);
}
function cancelInlineEditManufacturer() {
  editingInlineManufacturerId = null;
  renderManufacturers();
}
async function saveManufacturerInline(id) {
  const payload = {
    name: document.getElementById('mfrInlineName').value.trim(),
    contactPerson: document.getElementById('mfrInlineContactPerson').value.trim(),
    contact: document.getElementById('mfrInlineContact').value.trim(),
    hurdle: document.getElementById('mfrInlineHurdle').value.trim(),
    schedule: document.getElementById('mfrInlineSchedule').value.trim(),
    memo: document.getElementById('mfrInlineMemo').value.trim(),
  };
  if (!payload.name) { alert('제조사명은 필수입니다.'); return; }
  let res;
  try {
    res = await fetch('/api/manufacturers/' + Number(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { alert('저장 실패(네트워크): ' + e.message); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || '저장 실패'); return; }
  editingInlineManufacturerId = null;
  expandedManufacturerId = Number(id); // 펼침 유지
  await loadManufacturers();
  renderManufacturers();
  showToast('제조사 수정됨');
}

let editingManufacturerId = null;
function openManufacturerForm(id) {
  editingManufacturerId = (id == null) ? null : Number(id);
  const m = editingManufacturerId != null ? manufacturers.find(x => x.id === editingManufacturerId) : null;
  const box = document.getElementById('manufacturerFormBox');
  box.innerHTML = `
    <div class="manufacturer-form">
      <h4 style="margin:0 0 12px;font-size:15px">${m ? '제조사 수정' : '제조사 추가'}</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label><span style="color:#ef4444;margin-right:2px">*</span>제조사명</label><input id="mfrName" type="text" value="${m ? esc(m.name) : ''}"></div>
        <div class="form-group"><label>담당자</label><input id="mfrContactPerson" type="text" value="${m ? esc(m.contactPerson) : ''}" placeholder="선택"></div>
        <div class="form-group"><label>연락처</label><input id="mfrContact" type="text" value="${m ? esc(m.contact) : ''}" placeholder="선택 (전화·이메일·카톡 등)"></div>
        <div class="form-group"><label>허들</label><input id="mfrHurdle" type="text" value="${m ? esc(m.hurdle) : ''}" placeholder="선택 (제품 기본값)"></div>
        <div class="form-group"><label>일정 참고사항</label><input id="mfrSchedule" type="text" value="${m ? esc(m.schedule) : ''}" placeholder="선택 (제품 기본값)"></div>
      </div>
      <!-- [요청] 제품 상세에 제조사 메모 표시 — 라벨 '메모' → '제조사 메모' (id/저장 로직 유지) -->
      <div class="form-group"><label>제조사 메모</label><textarea id="mfrMemo" rows="2" placeholder="선택">${m ? esc(m.memo) : ''}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="closeManufacturerForm()">취소</button>
        <button class="btn btn-primary btn-sm" onclick="saveManufacturer()">저장</button>
      </div>
    </div>`;
  box.style.display = 'block';
  setTimeout(() => document.getElementById('mfrName')?.focus(), 0);
}
function closeManufacturerForm() {
  const box = document.getElementById('manufacturerFormBox');
  box.innerHTML = '';
  box.style.display = 'none';
  editingManufacturerId = null;
}
async function saveManufacturer() {
  const payload = {
    name: document.getElementById('mfrName').value.trim(),
    contactPerson: document.getElementById('mfrContactPerson').value.trim(),
    contact: document.getElementById('mfrContact').value.trim(),
    hurdle: document.getElementById('mfrHurdle').value.trim(),
    schedule: document.getElementById('mfrSchedule').value.trim(),
    memo: document.getElementById('mfrMemo').value.trim(),
  };
  if (!payload.name) { alert('제조사명은 필수입니다.'); return; }
  const isEdit = editingManufacturerId != null;
  const url = isEdit ? '/api/manufacturers/' + editingManufacturerId : '/api/manufacturers';
  const method = isEdit ? 'PUT' : 'POST';
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { alert('저장 실패(네트워크): ' + e.message); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || '저장 실패'); return; }
  closeManufacturerForm();
  await loadManufacturers();
  renderManufacturers();
  showToast(isEdit ? '제조사 수정됨' : '제조사 추가됨');
}
async function endManufacturer(id) {
  const m = manufacturers.find(x => x.id === Number(id));
  const n = m ? m.productCount : 0;
  if (!confirm(`'${m ? m.name : ''}'을(를) 협업종료 처리합니다.\n\n연결된 제품 ${n}개도 함께 협업종료됩니다.\n계속하시겠습니까?`)) return;
  let res;
  try {
    res = await fetch('/api/manufacturers/' + id + '/status', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: '협업종료' }),
    });
  } catch (e) { alert('실패(네트워크): ' + e.message); return; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '실패'); return; }
  await loadManufacturers();
  renderManufacturers();
  await loadProducts(); // 캐스케이드로 제품 status가 바뀌었으니 제품 목록 재로드
  showToast('협업종료 처리됨');
}
async function reopenManufacturer(id) {
  let res;
  try {
    res = await fetch('/api/manufacturers/' + id + '/status', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: '' }),
    });
  } catch (e) { alert('실패(네트워크): ' + e.message); return; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '실패'); return; }
  await loadManufacturers();
  renderManufacturers();
  showToast('진행으로 복귀됨 (제품은 개별 복귀하세요)');
}

// [요청] 제조사 삭제(연결 제품도 함께 삭제) — 확인 모달
let deletingManufacturerId = null;
function openManufacturerDeleteModal(id) {
  deletingManufacturerId = Number(id);
  const m = manufacturers.find(x => x.id === deletingManufacturerId);
  const n = m ? m.productCount : 0;
  document.getElementById('manufacturerDeleteName').textContent = m ? m.name : '';
  document.getElementById('manufacturerDeleteWarn').textContent = `연결된 제품 ${n}개도 같이 삭제됩니다.`;
  document.getElementById('manufacturerDeleteModal').style.display = 'flex';
}
function closeManufacturerDeleteModal() {
  document.getElementById('manufacturerDeleteModal').style.display = 'none';
  deletingManufacturerId = null;
}
async function confirmDeleteManufacturer() {
  if (deletingManufacturerId == null) return;
  let res;
  try {
    res = await fetch('/api/manufacturers/' + deletingManufacturerId, { method: 'DELETE' });
  } catch (e) { alert('삭제 실패(네트워크): ' + e.message); return; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || '삭제 실패'); return; }
  closeManufacturerDeleteModal();
  await loadManufacturers();
  renderManufacturers();
  await loadProducts(); // 연결 제품도 삭제됐으니 제품 목록 재로드
  showToast('제조사 및 연결 제품 삭제됨');
}
