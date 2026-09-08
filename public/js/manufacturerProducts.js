// [요청] 제조사-제품 통합 탭 — 2단 마스터-디테일 (조회+CRUD)
// classic script (type="module" 금지 규약 준수). 함수 선언만 두고 실행문은 init/manufacturerProducts.js에.
//
// 재사용 구조:
//   - 제품 카드: products.js의 productCardHtml(i) — 저장/삭제/사진/후킹문구 핸들러 전부 그대로 동작.
//   - 제조사 정보: manufacturers.js의 manufacturerReadHtml/manufacturerEditFormHtml + 인라인 편집 상태
//     (editingInlineManufacturerId) + saveManufacturerInline/endManufacturer/reopenManufacturer/삭제 모달.
//   - 기존 핸들러들이 renderProducts()/renderManufacturers()를 호출하면 그 안의 훅이
//     renderManufacturerProductsPage()를 불러 이 뷰가 갱신된다.
//     따라서 이 파일의 렌더 함수는 renderProducts/renderManufacturers를 절대 호출하지 않는다(무한루프 방지).

let mpQuery = '';
let mpShowEnded = false;
// 선택 키: number(제조사 id) | 'none'(미지정 가상 그룹) | null(미선택 → 렌더 시 첫 항목 자동 선택)
let mpSelectedKey = null;
const MP_NONE = 'none';

// ── 필터 헬퍼 ──
function mpProductVisible(p) {
  return mpShowEnded || p.status !== '협업종료';
}
// key 소속의 제품 인덱스 목록 (products 전역 배열의 원본 인덱스 — productCardHtml(i)에 그대로 전달)
function mpProductIndicesOf(key) {
  const out = [];
  products.forEach((p, i) => {
    if (!mpProductVisible(p)) return;
    const owner = (p.manufacturerId == null || p.manufacturerId === '') ? MP_NONE : Number(p.manufacturerId);
    if (owner === key) out.push(i);
  });
  return out;
}
// 제품 검색 매칭 — 제품 목록 탭의 productMatchesSearch와 동일 필드
function mpProductMatches(p) {
  if (!mpQuery) return true;
  const haystack = [p.name, p.brandName, p.productName, p.category, p.campaignType]
    .map(s => String(s || '').toLowerCase()).join(' ');
  return haystack.includes(mpQuery);
}
function mpMatchedIndices() {
  const out = [];
  products.forEach((p, i) => {
    if (!mpProductVisible(p)) return;
    if (mpProductMatches(p)) out.push(i);
  });
  return out;
}

// ── 좌측 행 데이터 — 제조사들 + '미지정' 가상 그룹 ──
// 검색 중엔 "제조사명 매칭 or 매칭 제품 보유"만 남긴다.
function mpLeftRows() {
  const rows = [];
  for (const m of manufacturers) {
    if (!mpShowEnded && m.status === '협업종료') continue;
    const prodIdx = mpProductIndicesOf(Number(m.id));
    const matchCount = mpQuery ? prodIdx.filter(i => mpProductMatches(products[i])).length : 0;
    const nameMatch = mpQuery && String(m.name || '').toLowerCase().includes(mpQuery);
    if (mpQuery && !nameMatch && matchCount === 0) continue;
    rows.push({ key: Number(m.id), m, count: prodIdx.length, matchCount });
  }
  const noneIdx = mpProductIndicesOf(MP_NONE);
  if (noneIdx.length) {
    const matchCount = mpQuery ? noneIdx.filter(i => mpProductMatches(products[i])).length : 0;
    if (!mpQuery || matchCount > 0) rows.push({ key: MP_NONE, m: null, count: noneIdx.length, matchCount });
  }
  return rows;
}

// ── 메인 렌더 (renderProducts/renderManufacturers의 훅이 호출) ──
function renderManufacturerProductsPage() {
  const left = document.getElementById('mpLeft');
  const right = document.getElementById('mpRight');
  if (!left || !right) return; // 이 페이지가 아니면 no-op

  const rows = mpLeftRows();
  // 선택 보정 — 미선택이거나 선택 항목이 사라졌으면(삭제/협업종료 숨김) 첫 항목으로
  if (!mpQuery && (mpSelectedKey == null || !rows.some(r => r.key === mpSelectedKey))) {
    mpSelectedKey = rows.length ? rows[0].key : null;
  }
  const countEl = document.getElementById('mpCount');
  if (countEl) countEl.textContent = rows.filter(r => r.key !== MP_NONE).length;

  left.innerHTML = rows.length ? rows.map(r => mpLeftRowHtml(r)).join('')
    : '<div class="mp-empty">제조사가 없습니다. 우측 상단 [+ 제조사 추가]로 등록하세요.</div>';
  right.innerHTML = mpQuery ? mpSearchResultsHtml() : mpDetailHtml();
}

function mpLeftRowHtml(r) {
  const selected = !mpQuery && r.key === mpSelectedKey;
  const ended = r.m && r.m.status === '협업종료';
  const name = r.m ? esc(r.m.name) : '미지정';
  const sub = [
    `제품 ${r.count}개`,
    (mpQuery && r.matchCount) ? `<span class="mp-match">매칭 ${r.matchCount}건</span>` : '',
  ].filter(Boolean).join(' · ');
  return `
  <div class="mp-mfr-item ${selected ? 'selected' : ''} ${ended ? 'ended' : ''}" onclick="mpSelect('${r.key}')">
    <div class="mp-mfr-name"><b>${name}</b>${ended ? '<span class="mfr-ended-badge">협업종료</span>' : ''}</div>
    <div class="mp-mfr-sub">${sub}</div>
  </div>`;
}

// ── 우측: 평상시 마스터-디테일 ──
function mpDetailHtml() {
  if (mpSelectedKey == null) return '<div class="mp-empty">좌측에서 제조사를 선택하세요.</div>';
  let head = '';
  if (mpSelectedKey === MP_NONE) {
    head = `
    <div class="mp-detail-card">
      <div class="mp-detail-title">
        <b style="font-size:16px">미지정</b>
        <span style="font-size:12px;color:#9ca3af">제조사가 연결되지 않은 제품 — 카드의 제조사 콤보박스에서 연결 후 저장하세요.</span>
      </div>
    </div>`;
  } else {
    const m = manufacturers.find(x => x.id === mpSelectedKey);
    if (!m) return '<div class="mp-empty">좌측에서 제조사를 선택하세요.</div>';
    const ended = m.status === '협업종료';
    // 읽기 뷰의 '수정' 버튼(startInlineEditManufacturer)이 편집 상태를 바꾸면 훅으로 이 뷰가 재렌더된다.
    const body = editingInlineManufacturerId === m.id ? manufacturerEditFormHtml(m) : manufacturerReadHtml(m);
    head = `
    <div class="mp-detail-card ${ended ? 'ended' : ''}">
      <div class="mp-detail-title">
        <b style="font-size:16px">${esc(m.name)}</b>
        ${ended ? '<span class="mfr-ended-badge">협업종료</span>' : ''}
        <div style="flex:1"></div>
        ${ended
          ? `<button class="btn btn-outline btn-sm" onclick="reopenManufacturer(${m.id})">진행 복귀</button>`
          : `<button class="btn btn-warn btn-sm" onclick="endManufacturer(${m.id})">협업종료</button>`}
        <button class="btn btn-sm" style="background:#fff;border:1px solid #ef4444;color:#ef4444" onclick="openManufacturerDeleteModal(${m.id})">삭제</button>
      </div>
      ${body}
    </div>`;
  }
  const idxs = mpProductIndicesOf(mpSelectedKey);
  const cards = idxs.map(i => productCardHtml(i)).join('');
  return head + `
  <div class="mp-products-head">
    <div class="card-title" style="margin:0">제품 <span class="count">${idxs.length}</span></div>
    <button class="btn btn-outline btn-sm" onclick="mpAddProduct()">+ 제품 추가</button>
  </div>
  ${cards || '<div class="mp-empty">이 제조사의 제품이 없습니다. [+ 제품 추가]로 등록하세요.</div>'}`;
}

// ── 우측: 검색 모드 — 제조사 무관 평면 결과 + 제조사 칩 ──
function mpSearchResultsHtml() {
  const idxs = mpMatchedIndices();
  if (!idxs.length) return '<div class="mp-empty">제품 매칭 없음 — 좌측 제조사를 클릭하면 검색이 해제됩니다.</div>';
  const items = idxs.map(i => {
    const p = products[i];
    const m = (p.manufacturerId != null && p.manufacturerId !== '')
      ? manufacturers.find(x => x.id === Number(p.manufacturerId)) : null;
    const chip = m
      ? `<button type="button" class="mp-chip" onclick="mpSelect('${Number(m.id)}')">${esc(m.name)} ›</button>`
      : `<button type="button" class="mp-chip" onclick="mpSelect('${MP_NONE}')">미지정 ›</button>`;
    return `<div class="mp-result">${chip}${productCardHtml(i)}</div>`;
  }).join('');
  return `
  <div class="mp-products-head">
    <div class="card-title" style="margin:0">검색 결과 <span class="count">${idxs.length}</span></div>
    <span style="font-size:12px;color:#9ca3af">제조사 칩을 누르면 해당 제조사로 이동합니다</span>
  </div>
  ${items}`;
}

// ── 핸들러 ──
function onMpSearchChange() {
  mpQuery = document.getElementById('mpSearch').value.trim().toLowerCase();
  renderManufacturerProductsPage();
}
function onMpShowEndedChange() {
  mpShowEnded = !!document.getElementById('mpShowEnded').checked;
  renderManufacturerProductsPage();
}
// 제조사 선택 — 검색 중이었다면 검색 해제하고 마스터-디테일로 복귀
function mpSelect(key) {
  mpSelectedKey = key === MP_NONE ? MP_NONE : Number(key);
  mpQuery = '';
  const inp = document.getElementById('mpSearch');
  if (inp) inp.value = '';
  editingInlineManufacturerId = null; // 다른 제조사로 옮기면 편집 중이던 폼은 닫는다
  renderManufacturerProductsPage();
}
// [요청] '+ 제조사 추가' 팝업 모달 — ESC 닫힘(nav.js 공통 핸들러에 init이 등록), 배경 클릭으로는 안 닫힘.
function openManufacturerModal() {
  for (const id of ['mfrModalName', 'mfrModalContactPerson', 'mfrModalContact', 'mfrModalHurdle', 'mfrModalSchedule', 'mfrModalMemo']) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  }
  document.getElementById('manufacturerModal').style.display = 'flex';
  setTimeout(() => document.getElementById('mfrModalName')?.focus(), 0);
}
function closeManufacturerModal() {
  document.getElementById('manufacturerModal').style.display = 'none';
}
async function saveManufacturerModal() {
  const payload = {
    name: document.getElementById('mfrModalName').value.trim(),
    contactPerson: document.getElementById('mfrModalContactPerson').value.trim(),
    contact: document.getElementById('mfrModalContact').value.trim(),
    hurdle: document.getElementById('mfrModalHurdle').value.trim(),
    schedule: document.getElementById('mfrModalSchedule').value.trim(),
    memo: document.getElementById('mfrModalMemo').value.trim(),
  };
  if (!payload.name) { showAlert('제조사명은 필수입니다.'); return; }
  let res;
  try {
    res = await fetch('/api/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { showAlert('저장 실패(네트워크): ' + e.message); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { showAlert(data.error || '저장 실패'); return; }
  closeManufacturerModal();
  await loadManufacturers();
  // 방금 추가한 제조사를 좌측에서 자동 선택 (mpSelect가 재렌더까지 수행)
  const newId = data.manufacturer && data.manufacturer.id != null ? Number(data.manufacturer.id) : null;
  if (newId != null) mpSelect(newId);
  else renderManufacturerProductsPage();
  showToast('제조사 추가됨');
}

// 제품 추가 — 선택된 제조사를 자동 연결(브랜드명 + 빈 허들/일정 상속). '미지정'에선 제조사 없이 시작.
function mpAddProduct() {
  const m = (mpSelectedKey !== MP_NONE && mpSelectedKey != null)
    ? manufacturers.find(x => x.id === mpSelectedKey) : null;
  products.unshift({
    name: '',
    brandName: m ? m.name : '',
    productName: '',
    campaignType: '공동구매',
    category: '육아·키즈',
    mailSubject: '',
    usp: '',
    offerMessage: '',
    hookingPhrases: [],
    productLink: '',
    announceExampleLink: '',
    announceExampleOwner: '',
    hurdle: m && m.hurdle ? m.hurdle : '',
    schedule: m && m.schedule ? m.schedule : '',
    memo: '',
    ageRange: '',
    manufacturerId: m ? m.id : null,
    status: '',
    photos: [],
  });
  openProductIdx = 0; // 새 카드 펼침 (products.js 전역)
  markProductDirty(products[0]); // 첫 저장 전까지 dirty
  renderManufacturerProductsPage();
}
