// [요청] 관리 UI 구조 개편 A단계 — 추천 카탈로그
// index.html 원본 3181-3255, 3278-3472 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  [요청] 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크
// ═══════════════════════════════════════
let catalogs = [];
let selectedProductIds = []; // 모달 내부 선택 상태 (순서 보존)
let prefillNickname = ''; // 닉네임 prefill 상태
let sortableInstance = null;

async function loadCatalogs() {
  try {
    const res = await fetch('/api/catalogs');
    if (!res.ok) return;
    catalogs = await res.json();
    renderCatalogs();
  } catch {}
}

function renderCatalogs() {
  const tbody = document.getElementById('catalogsBody');
  if (!tbody) return;   // [요청] C단계 — 설정 페이지(공개 URL 저장 후 호출)엔 목록 DOM 없음
  const q = (document.getElementById('catalogsSearch')?.value || '').trim().toLowerCase();
  const sort = document.getElementById('catalogsSort')?.value || 'recent';

  let list = catalogs.slice();
  if (q) {
    list = list.filter(c =>
      (c.influencerNickname || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q)
    );
  }
  if (sort === 'nickname') {
    list.sort((a, b) => {
      const na = (a.influencerNickname || '').toLowerCase();
      const nb = (b.influencerNickname || '').toLowerCase();
      if (na !== nb) return na.localeCompare(nb, 'ko');
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  } else {
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  document.getElementById('catalogsCount').textContent = catalogs.length;
  document.getElementById('catalogsFilterCount').textContent =
    (q ? `(${list.length}/${catalogs.length})` : '');

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="catalogs-empty">${catalogs.length === 0 ? '생성된 카탈로그가 없습니다. "+ 신규 카탈로그"로 시작하세요.' : '검색 결과 없음'}</td></tr>`;
    return;
  }

  let prevNickname = null;
  tbody.innerHTML = list.map(c => {
    const baseUrl = (window.CATALOG_PUBLIC_BASE_URL || `${location.origin}/recommend/`);
    const url = `${baseUrl}?c=${encodeURIComponent(c.code)}`;
    const isGroup = sort === 'nickname' && c.influencerNickname === prevNickname;
    const nickCell = isGroup
      ? `<td><span style="color:#9ca3af">↳</span></td>`
      : `<td><b>${esc(c.influencerNickname)}</b></td>`;
    prevNickname = c.influencerNickname;
    const created = (c.createdAt || '').slice(0, 10);
    return `<tr class="${isGroup ? 'group-cont' : ''}">
      ${nickCell}
      <td>${esc(c.title || '-')}</td>
      <td style="text-align:center">${(c.productIds || []).length}</td>
      <td style="text-align:center">${c.viewCount || 0}</td>
      <td><span class="url-cell">${esc(url)}</span><button class="btn btn-outline copy-btn" onclick="copyText('${esc(url)}')">복사</button></td>
      <td style="font-size:12px;color:#6b7280">${esc(created)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCatalogModal(${c.id}, 'edit')">수정</button>
        <button class="btn btn-outline btn-sm" onclick="openCatalogModal(${c.id})">복제</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCatalog(${c.id})">삭제</button>
      </td>
    </tr>`;
  }).join('');
}

// [요청] 모달 열기 — mode: 'clone'(기본, 신규/복제) | 'edit'(기존 카탈로그 수정, code/view_count 보존)
let editingCatalogId = null;
function openCatalogModal(sourceId, mode = 'clone') {
  const source = sourceId ? catalogs.find(c => c.id === sourceId) : null;
  editingCatalogId = (source && mode === 'edit') ? source.id : null;
  selectedProductIds = source ? source.productIds.slice() : [];
  prefillNickname = source ? source.influencerNickname : '';

  // 리드 select 옵션 채우기
  const leadSelect = document.getElementById('catalogLeadSelect');
  leadSelect.innerHTML =
    '<option value="">— 리드에서 선택 (선택사항) —</option>' +
    (leads || []).map(l => `<option value="${l.id}" data-nickname="${esc(l.nickname)}">${esc(l.nickname)}</option>`).join('');
  leadSelect.value = (editingCatalogId && source.leadId) ? String(source.leadId) : '';

  document.getElementById('catalogTitle').value =
    editingCatalogId ? (source.title || '') :
    source ? `${source.title || ''} (복사)` : '';
  document.getElementById('catalogNickname').value = prefillNickname;
  document.getElementById('catalogSearch').value = '';
  document.getElementById('catalogResultBox').style.display = 'none';

  // 헤더·버튼 라벨 토글
  document.getElementById('catalogModalTitle').textContent = editingCatalogId ? '카탈로그 수정' : '신규 카탈로그';
  document.getElementById('catalogSubmitBtn').textContent = editingCatalogId ? '수정' : '생성';

  renderCatalogProductPanels();
  updateDupWarning();

  document.getElementById('catalogModal').style.display = 'flex';
  setTimeout(() => document.getElementById('catalogNickname').focus(), 0);
}

function closeCatalogModal() {
  document.getElementById('catalogModal').style.display = 'none';
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
  selectedProductIds = [];
  editingCatalogId = null;
}

function onCatalogLeadChange() {
  const sel = document.getElementById('catalogLeadSelect');
  const opt = sel.options[sel.selectedIndex];
  const nickname = opt?.dataset?.nickname || '';
  if (nickname) {
    document.getElementById('catalogNickname').value = nickname;
    updateDupWarning();
  }
}

function updateDupWarning() {
  const nick = document.getElementById('catalogNickname').value.trim();
  const box = document.getElementById('catalogDupWarning');
  if (!nick) { box.style.display = 'none'; return; }
  const existing = catalogs.filter(c => c.influencerNickname === nick).length;
  if (existing > 0) {
    box.style.display = 'block';
    box.textContent = `ℹ️ "${nick}" 닉네임으로 이미 ${existing}개의 카탈로그가 있습니다. (의도된 경우 그대로 진행)`;
  } else {
    box.style.display = 'none';
  }
}

function renderCatalogProductPanels() {
  const q = (document.getElementById('catalogSearch')?.value || '').trim().toLowerCase();
  const allList = document.getElementById('catalogAllList');
  const selectedList = document.getElementById('catalogSelectedList');

  // 좌패널 — 전체 제품 (검색 적용)
  const filtered = (products || []).filter(p => {
    if (!q) return true;
    return [p.name, p.brandName, p.productName, p.category].some(v =>
      (v || '').toLowerCase().includes(q)
    );
  });
  if (!filtered.length) {
    allList.innerHTML = `<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px">${products.length === 0 ? '제품이 없습니다' : '검색 결과 없음'}</div>`;
  } else {
    allList.innerHTML = filtered.map(p => {
      const isSelected = selectedProductIds.includes(p.id);
      return `<div class="catalog-product-item ${isSelected ? 'selected' : ''}" onclick="toggleProductSelect(${p.id})">
        <div style="flex:1">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">${esc(p.brandName || '-')} · ${esc(p.category || '-')}</div>
        </div>
        <span style="font-size:13px;color:${isSelected ? '#10b981' : '#d1d5db'}">${isSelected ? '✓' : '+'}</span>
      </div>`;
    }).join('');
  }

  // 우패널 — 선택된 제품 (순서 보존 / 드래그 가능)
  if (!selectedProductIds.length) {
    selectedList.innerHTML = `<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px">왼쪽에서 제품을 선택하세요</div>`;
  } else {
    selectedList.innerHTML = selectedProductIds.map(pid => {
      const p = products.find(x => x.id === pid);
      if (!p) return '';
      return `<div class="catalog-product-item in-selected" data-pid="${pid}">
        <span class="drag-handle">⠿</span>
        <div style="flex:1">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">${esc(p.brandName || '-')}</div>
        </div>
        <button class="remove-btn" onclick="removeFromSelected(${pid})" title="제거">✕</button>
      </div>`;
    }).join('');
  }

  // Sortable 재바인딩
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
  if (selectedProductIds.length && typeof Sortable !== 'undefined') {
    sortableInstance = Sortable.create(selectedList, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: () => {
        // DOM 순서 → selectedProductIds 동기화
        selectedProductIds = Array.from(selectedList.querySelectorAll('[data-pid]'))
          .map(el => Number(el.dataset.pid));
      },
    });
  }
}

function toggleProductSelect(pid) {
  const idx = selectedProductIds.indexOf(pid);
  if (idx >= 0) selectedProductIds.splice(idx, 1);
  else selectedProductIds.push(pid);
  renderCatalogProductPanels();
}

function removeFromSelected(pid) {
  const idx = selectedProductIds.indexOf(pid);
  if (idx >= 0) {
    selectedProductIds.splice(idx, 1);
    renderCatalogProductPanels();
  }
}

// [요청] 편집 모드(editingCatalogId 있음) → PUT, 신규/복제 → POST. URL(code)은 편집 시 유지.
async function submitCatalog() {
  const nickname = document.getElementById('catalogNickname').value.trim();
  if (!nickname) { alert('닉네임은 필수입니다.'); return; }
  if (!selectedProductIds.length) { alert('제품을 1개 이상 선택해야 합니다.'); return; }
  const leadId = Number(document.getElementById('catalogLeadSelect').value) || null;
  const title = document.getElementById('catalogTitle').value.trim() || `${nickname}님 공동구매 제안`;

  const isEdit = editingCatalogId != null;
  const url = isEdit ? `/api/catalogs/${editingCatalogId}` : '/api/catalogs';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      influencerNickname: nickname,
      leadId,
      productIds: selectedProductIds,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || `${isEdit ? '수정' : '생성'} 실패: ${res.status}`);
    return;
  }
  // 결과 표시 (편집 시 URL 동일, 타이틀만 "수정됨"으로)
  const baseUrl = (window.CATALOG_PUBLIC_BASE_URL || `${location.origin}/recommend/`);
  const publicUrl = `${baseUrl}?c=${encodeURIComponent(data.catalog.code)}`;
  document.getElementById('catalogResultUrl').textContent = publicUrl;
  document.getElementById('catalogResultTitle').textContent = isEdit ? '카탈로그 수정됨' : '카탈로그 생성됨';
  document.getElementById('catalogResultBox').style.display = 'flex';
  document.getElementById('catalogResultBox').dataset.url = publicUrl;
  await loadCatalogs();
}

function copyResultUrl() {
  const url = document.getElementById('catalogResultBox').dataset.url;
  if (url) copyText(url);
}

async function deleteCatalog(id) {
  const cat = catalogs.find(c => c.id === id);
  if (!confirm(`"${cat?.title || cat?.influencerNickname || ''}" 카탈로그를 삭제할까요?`)) return;
  const res = await fetch(`/api/catalogs/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || `삭제 실패: ${res.status}`);
    return;
  }
  await loadCatalogs();
}
