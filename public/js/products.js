// [요청] 관리 UI 구조 개편 A단계 — 제품 관리
// index.html 원본 1131-1648 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  제품 관리
// ═══════════════════════════════════════
async function loadProducts() {
  await loadProductsData();      // [요청] C단계 검수 — 데이터 fetch는 state.js 공용 로더로 일원화
  dirtyProducts = new WeakSet(); // [요청] 카드 단위 저장 — 로드 직후 clean
  renderProducts();
}

// [요청] 카드 단위 저장 — 카드별 dirty 추적(WeakSet으로 product 객체 참조)
let dirtyProducts = new WeakSet();
function markProductDirty(p) {
  if (!p || dirtyProducts.has(p)) return;
  dirtyProducts.add(p);
  const idx = products.indexOf(p);
  if (idx !== -1) {
    const card = document.getElementById(`product-${idx}`);
    if (card) card.classList.add('dirty');
  }
}
function clearProductDirty(p) {
  if (!p) return;
  dirtyProducts.delete(p);
  const idx = products.indexOf(p);
  if (idx !== -1) {
    const card = document.getElementById(`product-${idx}`);
    if (card) card.classList.remove('dirty');
  }
}

let openProductIdx = -1;
// [요청] 후킹문구 아코디언 — product index 기반 펼침 상태
const hookingOpenIdx = new Set();
function toggleHookingOpen(i) {
  if (hookingOpenIdx.has(i)) hookingOpenIdx.delete(i);
  else hookingOpenIdx.add(i);
  renderProducts();
}

// [요청] 제품 검색 — query state + 핸들러
let productSearchQuery = '';
function onProductSearchChange() {
  productSearchQuery = document.getElementById('productSearch').value.trim().toLowerCase();
  renderProducts();
}
function productMatchesSearch(p) {
  if (!productSearchQuery) return true;
  const haystack = [
    p.name, p.brandName, p.productName, p.category, p.campaignType,
  ].map(s => String(s || '').toLowerCase()).join(' ');
  return haystack.includes(productSearchQuery);
}

function renderProducts() {
  // [요청] 제조사-제품 통합 탭 — 해당 페이지가 로드돼 있으면 함께 갱신(그 페이지에선 아래 early-return).
  //   기존 핸들러들이 renderProducts()만 호출해도 새 탭 뷰가 따라오게 하는 훅. 역호출 금지(무한루프 방지).
  if (typeof renderManufacturerProductsPage === 'function') renderManufacturerProductsPage();
  const container = document.getElementById('productsList');
  if (!container) return;   // [요청] C단계 — 제품 목록 페이지가 아니면 렌더 대상 없음(리드/추천 등은 products 배열만 씀)
  // [요청] 제조사 관리 — 협업종료 제품은 기본 숨김(토글 시 노출). 표시 대상 전체 카운트의 분모로 사용.
  const visibleProducts = products.filter(p => showEndedProducts || p.status !== '협업종료');
  // [요청] 제품 검색 — 매칭 인덱스만 추출, 카운트는 매칭/전체
  const matchedIndices = products
    .map((p, i) => ((showEndedProducts || p.status !== '협업종료') && productMatchesSearch(p)) ? i : -1)
    .filter(i => i >= 0);
  document.getElementById('productCount').textContent =
    productSearchQuery ? `${matchedIndices.length}/${visibleProducts.length}` : visibleProducts.length;
  if (matchedIndices.length === 0 && products.length > 0) {
    container.innerHTML = `<div style="text-align:center;color:#9ca3af;padding:32px;font-size:14px">검색 결과 없음</div>`;
    return;
  }
  container.innerHTML = matchedIndices.map(i => productCardHtml(i)).join('');
}

// [요청] 제조사-제품 통합 탭 — 제품 카드 1장의 HTML을 함수로 추출(새 탭이 재사용). 카드 내용 무변경.
function productCardHtml(i) {
    const p = products[i];
    const isOpen = openProductIdx === i;
    // [요청] 빠른추가/이미지 없음 판정 — USP 비어있음 = 빠른추가, photos 비어있음 = 이미지 없음
    const isQuick = !p.usp;
    const noPhoto = !(p.photos && p.photos.length > 0);
    const needsAttention = isQuick || noPhoto;
    const isDirty = dirtyProducts.has(p); // [요청] 카드 단위 저장
    const isEnded = p.status === '협업종료'; // [요청] 제조사 관리 — 협업종료 제품
    const isCafe24 = p.cafe24ProductNo != null; // [요청] 카페24 제품 연동 — 출처 뱃지
    return `
    <div class="product-card ${needsAttention ? 'needs-attention' : ''} ${isOpen ? 'editing' : ''} ${isDirty ? 'dirty' : ''} ${isEnded ? 'ended' : ''}" id="product-${i}">
      ${(isQuick || noPhoto || isCafe24) ? `<div class="card-badges">
        ${isCafe24 ? '<span class="card-badge badge-cafe24">카페24</span>' : ''}
        ${isQuick ? '<span class="card-badge badge-quick">빠른추가</span>' : ''}
        ${noPhoto ? '<span class="card-badge badge-no-photo">이미지 없음</span>' : ''}
      </div>` : ''}
      <div class="product-header" style="cursor:pointer" onclick="toggleProduct(${i})">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;color:#6b7280;transition:transform 0.2s;display:inline-block;transform:rotate(${isOpen?'90':'0'}deg)">&gt;</span>
          <span class="product-name">${esc(p.name) || '새 제품'}</span>
          ${isEnded ? '<span class="product-ended-badge">협업종료</span>' : ''}
          <span style="font-size:12px;color:#9ca3af">${esc(p.brandName)} · ${esc(p.productName)} · ${esc(p.campaignType)} · ${esc(p.category)}</span>
        </div>
      </div>
      <div style="display:${isOpen ? 'block' : 'none'};margin-top:16px">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;align-items:center">
          <!-- [요청] 미저장 표시 -->
          <span class="dirty-indicator">● 미저장</span>
          <!-- [요청] 제조사 관리 — 제품 협업종료/복귀 토글 -->
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();toggleProductStatus(${i})">${isEnded ? '진행으로 복귀' : '협업종료'}</button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();saveOneProduct(${i})">저장</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();removeProduct(${i})">삭제</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <!-- [요청] 필수 표시 -->
            <label><span style="color:#ef4444;margin-right:2px">*</span>관리명 (인플루언서 목록에서 매칭용)</label>
            <input type="text" value="${esc(p.name)}" onchange="products[${i}].name=this.value;updateProductHeader(${i})" onclick="event.stopPropagation()">
          </div><br>
          <div class="form-group">
            <label><span style="color:#ef4444;margin-right:2px">*</span>제품명</label>
            <input type="text" value="${esc(p.productName)}" onchange="products[${i}].productName=this.value;updateProductHeader(${i})" onclick="event.stopPropagation()">
          </div>
          <div class="form-group">
            <label>메일 제목</label>
            <input type="text" value="${esc(p.mailSubject || '')}" onchange="products[${i}].mailSubject=this.value" onclick="event.stopPropagation()" placeholder="비우면 '[언엑스 공동구매] ${esc(p.name)} 공동구매 제안 건'으로 발송">
          </div>
          <!-- [요청] 제조사 영역을 박스로 묶어 시각적으로 구분 (배경색 + 테두리) -->
          <div style="grid-column:1/-1;background:#f0f7ff;border:1px solid #dbeafe;border-radius:8px;padding:14px 16px;margin:4px 0">
            <div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:10px">제조사 정보</div>
            <!-- [요청] 제조사 관리 — 브랜드명 직접입력 → 제조사 검색 콤보박스(선택 시 브랜드명 자동) -->
            <!-- [요청] 제조사 검색 input은 왼쪽, selectbox+브랜드명은 오른쪽 여백으로 이동 -->
            <div class="form-group">
              <label><span style="color:#ef4444;margin-right:2px">*</span>제조사</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
                <input type="text" placeholder="제조사 검색..." oninput="filterManufacturerSelect(${i}, this.value)" onclick="event.stopPropagation()">
                <div>
                  <select id="mfrSelect-${i}" onchange="selectManufacturer(${i}, this.value)" onclick="event.stopPropagation()">
                    ${manufacturerOptionsHtml(p.manufacturerId)}
                  </select>
                  <div style="font-size:12px;color:#9ca3af;margin-top:4px">브랜드명: ${esc(p.brandName) || '(제조사 선택 시 자동 채움)'}</div>
                </div>
              </div>
            </div>
            <!-- [요청] 제품 상세에 제조사 메모 표시 — 연결 제조사의 memo를 읽기전용으로(편집은 '제조사 목록' 탭). 제조사-제품명-제조사 메모-카테고리-캠페인 유형 순. -->
            <div class="form-group" style="margin-bottom:0">
              <label>제조사 메모 <span style="font-size:12px;color:#9ca3af">(제조사 목록에서 편집)</span></label>
              ${(() => {
                const mm = manufacturers.find(x => x.id === p.manufacturerId);
                const memo = mm && mm.memo ? mm.memo : '';
                // [요청] 제조사 메모 textarea 자동 높이 — 저장된 메모 줄 수에 맞춰 rows(최소 2 ~ 최대 12)
                const rows = Math.min(Math.max(memo.split('\n').length, 2), 12);
                return `<textarea rows="${rows}" readonly onclick="event.stopPropagation()" style="background:#fff;color:#6b7280;cursor:default" placeholder="${mm ? '제조사 메모 없음' : '제조사 선택 시 표시'}">${esc(memo)}</textarea>`;
              })()}
            </div>
          </div>
          <div class="form-group">
            <label><span style="color:#ef4444;margin-right:2px">*</span>카테고리</label>
            <select onchange="products[${i}].category=this.value;updateProductHeader(${i})" onclick="event.stopPropagation()">
              ${['육아·키즈','홈·리빙','뷰티','패션','식품','디지털','여행','건강','반려동물','기타'].map(t => `<option value="${t}" ${p.category===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label><span style="color:#ef4444;margin-right:2px">*</span>캠페인 유형</label>
            <select onchange="products[${i}].campaignType=this.value;updateProductHeader(${i})" onclick="event.stopPropagation()">
              ${['공동구매','협찬','광고','체험단','기타'].map(t => `<option value="${t}" ${p.campaignType===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label><span style="color:#ef4444;margin-right:2px">*</span>제품 특징 (USP)</label>
          <!-- [요청] 제품 목록 textarea 높이 고정 — rows 3→8 -->
          <textarea rows="8" onchange="products[${i}].usp=this.value" onclick="event.stopPropagation()">${esc(p.usp)}</textarea>
        </div>
        <div class="form-group">
          <label><span style="color:#ef4444;margin-right:2px">*</span>제안 / 메일 내용</label>
          <!-- [요청] 제품 목록 textarea 높이 고정 — rows 4→15 -->
          <textarea rows="15" onchange="products[${i}].offerMessage=this.value" onclick="event.stopPropagation()">${esc(p.offerMessage)}</textarea>
        </div>
        <!-- [요청] 제품 목록 필드 확장 — 후킹문구 동적 리스트 / [요청] 후킹문구 기본 1개 노출 + 나머지 아코디언 -->
        <div class="form-group">
          <!-- [요청] 후킹문구 라벨 옆 버튼 배치 (아코디언 캐럿은 리스트 하단 '더 보기' 버튼으로 이동) -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label style="margin:0">후킹문구 <span style="font-size:12px;color:#9ca3af">(${(p.hookingPhrases||[]).length}개)</span></label>
            <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
              <button class="btn btn-outline btn-sm" onclick="addHookingPhrase(${i})">+ 후킹문구 추가</button>
              <!-- [요청] 후킹문구 일괄 붙여넣기 -->
              <button class="btn btn-outline btn-sm" onclick="openHookingModal(${i})">📋 일괄 입력</button>
            </div>
          </div>
          <div class="hooking-list" onclick="event.stopPropagation()">
            ${(() => {
              // [요청] 후킹문구 기본 1개 노출 — 1번 행은 항상 표시(데이터 없으면 빈 칸), 2번째부터만 접힘
              const list = Array.isArray(p.hookingPhrases) ? p.hookingPhrases : [];
              const open = hookingOpenIdx.has(i);
              const row = (val, hi, removable) => `
                <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
                  <span style="min-width:24px;color:#6b7280;font-size:13px">${hi+1}.</span>
                  <input type="text" style="flex:1" value="${esc(val)}" onchange="setHookingPhrase(${i},${hi},this.value)">
                  ${removable ? `<button class="btn btn-danger btn-sm" onclick="removeHookingPhrase(${i},${hi})">−</button>` : ''}
                </div>`;
              const first = list.length ? row(list[0], 0, true) : row('', 0, false);
              const rest = list.slice(1).map((h, k) => row(h, k + 1, true)).join('');
              // [요청] 접힘 토글 — 2개 이상일 때만 하단 전폭 점선 버튼 노출
              const more = list.length > 1
                ? `<button type="button" class="hooking-more" onclick="toggleHookingOpen(${i})">${open ? '− 접기' : '+ ' + (list.length - 1) + '개 더 보기'}</button>`
                : '';
              return first + `<div style="display:${open ? 'block' : 'none'}">${rest}</div>` + more;
            })()}
          </div>
          <!-- [요청] 공고 예시 링크 + 예시 주인 계정 2단 -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group">
              <label>예시 링크</label>
              <input type="text" value="${esc(p.announceExampleLink || '')}" onchange="products[${i}].announceExampleLink=this.value" onclick="event.stopPropagation()" placeholder="선택">
            </div>
            <div class="form-group">
              <label>예시 계정 (인포크 발송시 제외하고 발송) </label>
              <input type="text" value="${esc(p.announceExampleOwner || '')}" onchange="products[${i}].announceExampleOwner=this.value" onclick="event.stopPropagation()" placeholder="선택">
            </div>
          </div>
          <div class="form-group">
            <label>제품 링크</label>
            <input type="text" value="${esc(p.productLink || '')}" onchange="products[${i}].productLink=this.value" onclick="event.stopPropagation()" placeholder="선택">
          </div>
        </div>
        <!-- [요청] 발송용 / 내부용 시각적 구분선 -->
        <hr style="border:none;border-top:1px solid #e5e7eb;width:50%;margin:25px auto">
        <!-- [요청] 제품 목록 필드 확장 — 추가 필드 그리드 (모두 선택) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <div class="form-group">
            <label>허들</label>
            <input type="text" value="${esc(p.hurdle || '')}" onchange="products[${i}].hurdle=this.value" onclick="event.stopPropagation()" placeholder="선택">
          </div>
          <div class="form-group">
            <label>일정 참고사항</label>
            <input type="text" value="${esc(p.schedule || '')}" onchange="products[${i}].schedule=this.value" onclick="event.stopPropagation()" placeholder="선택">
          </div>
          <div class="form-group">
            <label>연령대</label>
            <input type="text" value="${esc(p.ageRange || '')}" onchange="products[${i}].ageRange=this.value" onclick="event.stopPropagation()" placeholder="선택">
          </div>
        </div>
        <!-- [요청] 제품 목록 필드 확장 — 메모 -->
        <div class="form-group">
          <label>메모 <span style="font-size:12px;color:#9ca3af">(내부용)</span></label>
          <!-- [요청] 메모 textarea 높이 자동 — 저장된 내용 줄 수만큼(최소 3 ~ 최대 20) -->
          <textarea rows="${Math.min(Math.max(String(p.memo || '').split('\n').length, 3), 20)}" onchange="products[${i}].memo=this.value" onclick="event.stopPropagation()">${esc(p.memo || '')}</textarea>
        </div>
        <div class="form-group">
          <label>사진</label>
          <div class="photo-grid" onclick="event.stopPropagation()">
            ${(p.photos||[]).map((photo, pi) => `
              <div style="position:relative">
                <img class="photo-thumb" src="/assets/${photo.split('/').pop()}" onerror="this.style.display='none'">
                <button style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer" onclick="removePhoto(${i},${pi})">X</button>
              </div>
            `).join('')}
            <label class="photo-upload-btn">
              +
              <input type="file" multiple accept="image/*" style="display:none" onchange="uploadPhotos(${i}, this.files)">
            </label>
          </div>
        </div>
      </div>
    </div>`;
}

function toggleProduct(i) {
  openProductIdx = openProductIdx === i ? -1 : i;
  renderProducts();
}

function updateProductHeader(i) {
  // 헤더 텍스트만 즉시 갱신 (접힘 상태 유지)
  renderProducts();
}

// [요청] 빠른 제품 추가
// [요청] 제조사 관리 — 빠른추가도 제조사 콤보박스(필수)로
async function openQuickProductModal() {
  document.getElementById('quickProductName').value = '';
  await loadManufacturers();
  const search = document.getElementById('quickMfrSearch');
  if (search) search.value = '';
  filterQuickMfrSelect('');
  const modal = document.getElementById('quickProductModal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('quickMfrSearch').focus(), 0);
}
function closeQuickProductModal() {
  document.getElementById('quickProductModal').style.display = 'none';
}
function filterQuickMfrSelect(query) {
  const sel = document.getElementById('quickMfrSelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = manufacturerOptionsHtml(prev ? Number(prev) : null, query);
}
async function applyQuickProductModal() {
  const productName = document.getElementById('quickProductName').value.trim();
  const mfrVal = document.getElementById('quickMfrSelect').value;
  if (!mfrVal) { showAlert('제조사를 선택해주세요.'); return; }
  if (!productName) { showAlert('제품명을 입력해주세요.'); return; }
  const manufacturerId = Number(mfrVal);
  const m = manufacturers.find(x => x.id === manufacturerId);
  const brandName = m ? m.name : '';
  // 사전 중복 검사 — 메모리 products 배열의 관리명과 매칭
  if (products.some(p => p.name === productName)) {
    showAlert('이미 같은 관리명의 제품이 존재합니다.');
    return;
  }
  const res = await fetch('/api/products/quick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandName, productName, manufacturerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showAlert(data.error || `추가 실패: ${res.status}`);
    return;
  }
  // DB가 진실의 원천 — 전체 재로드 후 새 제품 카드 펼침
  productSearchQuery = '';
  const searchInput = document.getElementById('productSearch');
  if (searchInput) searchInput.value = '';
  await loadProducts();
  const idx = products.findIndex(p => p.name === productName);
  if (idx >= 0) openProductIdx = idx;
  renderProducts();
  closeQuickProductModal();
}

function addProduct() {
  // [요청] 제품 검색 — 새 제품이 검색 필터에 가려지지 않도록 검색어 비움
  productSearchQuery = '';
  const searchInput = document.getElementById('productSearch');
  if (searchInput) searchInput.value = '';
  // [요청] 제품 목록 필드 확장 — 신규 필드 7종 초기화
  products.unshift({
    name: '',
    brandName: '',
    productName: '',
    campaignType: '공동구매',
    category: '육아·키즈',
    mailSubject: '',
    usp: '',
    offerMessage: '',
    hookingPhrases: [],
    productLink: '',
    announceExampleLink: '',
    announceExampleOwner: '', // [요청] 예시 주인 계정
    hurdle: '',
    schedule: '',
    memo: '',
    ageRange: '',
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturerId: null,
    status: '',
    photos: []
  });
  openProductIdx = 0;
  renderProducts();
  markProductDirty(products[0]); // [요청] 카드 단위 저장 — 신규 stub은 첫 저장 전까지 dirty
}

// [요청] 제품 목록 필드 확장 — 후킹문구 가변 리스트
function addHookingPhrase(i) {
  if (!Array.isArray(products[i].hookingPhrases)) products[i].hookingPhrases = [];
  products[i].hookingPhrases.push('');
  hookingOpenIdx.add(i); // [요청] 후킹문구 아코디언 — 추가 시 자동 펼침
  renderProducts();
  markProductDirty(products[i]);
}
function removeHookingPhrase(i, hi) {
  products[i].hookingPhrases.splice(hi, 1);
  renderProducts();
  markProductDirty(products[i]);
}
// [요청] 후킹문구 기본 1개 노출 — 데이터가 없어도 뜨는 빈 1번 칸 입력 처리(배열 없으면 생성)
function setHookingPhrase(i, hi, value) {
  const p = products[i];
  if (!Array.isArray(p.hookingPhrases)) p.hookingPhrases = [];
  const wasEmpty = p.hookingPhrases.length === 0;
  p.hookingPhrases[hi] = value;
  markProductDirty(p);
  if (wasEmpty) renderProducts(); // 빈 상태 → 1개: 라벨 (N개) 카운트 동기화
}

// [요청] 후킹문구 일괄 붙여넣기 — 모달 제어
let currentHookingTarget = -1;
function openHookingModal(i) {
  currentHookingTarget = i;
  document.getElementById('hookingModalTextarea').value = '';
  const appendRadio = document.querySelector('input[name="hookingMode"][value="append"]');
  if (appendRadio) appendRadio.checked = true;
  const modal = document.getElementById('hookingModal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('hookingModalTextarea').focus(), 0);
}
function closeHookingModal() {
  document.getElementById('hookingModal').style.display = 'none';
  currentHookingTarget = -1;
}
function applyHookingModal() {
  if (currentHookingTarget < 0 || !products[currentHookingTarget]) return;
  const raw = document.getElementById('hookingModalTextarea').value;
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) { showAlert('입력된 후킹문구가 없습니다.'); return; }
  const modeEl = document.querySelector('input[name="hookingMode"]:checked');
  const mode = modeEl ? modeEl.value : 'append';
  const target = products[currentHookingTarget];
  if (!Array.isArray(target.hookingPhrases)) target.hookingPhrases = [];
  target.hookingPhrases = (mode === 'replace')
    ? lines
    : target.hookingPhrases.concat(lines);
  hookingOpenIdx.add(currentHookingTarget); // [요청] 후킹문구 아코디언 — 일괄 입력 후 자동 펼침
  markProductDirty(target);
  closeHookingModal();
  renderProducts();
}

// [요청] 카드 단위 저장 — 삭제 버튼은 confirm 통과 시 즉시 DB 삭제(저장 후순서 일관성).
async function removeProduct(i) {
  if (!(await showConfirm('이 제품을 삭제하시겠습니까?'))) return;
  const p = products[i];
  if (p && p.id != null) {
    let res;
    try {
      res = await fetch(`/api/products/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    } catch (e) {
      showAlert('삭제 실패(네트워크): ' + e.message);
      return;
    }
    if (!res.ok) {
      let msg = String(res.status);
      try { const err = await res.json(); if (err && err.error) msg = err.error; } catch {}
      showAlert('삭제 실패: ' + msg);
      return;
    }
  }
  if (p) dirtyProducts.delete(p);
  const wasSaved = p && p.id != null; // [요청] 제조사 경고 카운트 수정 — DB에서 지운 경우에만 재로드
  products.splice(i, 1);
  if (openProductIdx === i) openProductIdx = -1;
  else if (openProductIdx > i) openProductIdx--;
  // [요청] 저장 느림 개선 — 재로드는 백그라운드로 (saveOneProduct와 동일)
  if (wasSaved && typeof loadManufacturers === 'function') loadManufacturers().then(renderManufacturers);
  renderProducts();
}

function removePhoto(pi, photoIdx) {
  products[pi].photos.splice(photoIdx, 1);
  renderProducts();
  markProductDirty(products[pi]);
}

async function uploadPhotos(productIdx, files) {
  const formData = new FormData();
  for (const f of files) {
    let toUpload;
    try {
      toUpload = await resizeImage(f, 600, 0.85);
      console.log(`제품 사진 리사이즈: ${f.name} ${(f.size/1024).toFixed(0)}KB → ${(toUpload.size/1024).toFixed(0)}KB`);
    } catch (e) {
      console.warn(`리사이즈 실패 (${f.name}), 원본 업로드:`, e.message);
      toUpload = f;
    }
    formData.append('photos', toUpload);
  }
  const res = await fetch('/api/products/upload', { method: 'POST', body: formData });
  const data = await res.json();
  products[productIdx].photos = [...(products[productIdx].photos || []), ...data.files];
  renderProducts();
  markProductDirty(products[productIdx]);
}

// [요청] 카드 단위 저장 — 단일 카드만 검증 후 DB 반영. id 없으면 POST(insert), 있으면 PUT(update).
async function saveOneProduct(i) {
  const p = products[i];
  if (!p) return;
  const required = [
    ['name', '관리명'],
    ['brandName', '브랜드명'],
    ['productName', '제품명'],
    ['category', '카테고리'],
    ['campaignType', '캠페인 유형'],
  ];
  for (const [key, label] of required) {
    if (!String(p[key] || '').trim()) {
      showAlert(`'${label}' 항목이 비어있습니다.`);
      openProductIdx = i;
      renderProducts();
      return;
    }
  }
  // [요청] 제조사 관리 — 제품 저장 시 제조사 필수
  if (p.manufacturerId == null || p.manufacturerId === '') {
    showAlert('제조사를 선택해주세요. (제조사 추가 → 제품 추가 순서)');
    openProductIdx = i;
    renderProducts();
    return;
  }
  const isNew = p.id == null;
  const url = isNew ? '/api/products' : `/api/products/${encodeURIComponent(p.id)}`;
  const method = isNew ? 'POST' : 'PUT';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
  } catch (e) {
    showAlert('저장 실패(네트워크): ' + e.message);
    return;
  }
  if (!res.ok) {
    let msg = String(res.status);
    try { const err = await res.json(); if (err && err.error) msg = err.error; } catch {}
    showAlert('저장 실패: ' + msg);
    return;
  }
  // 응답에서 id 갱신 — JSON 모드에선 id=name이라 리네임 후 후속 저장이 깨지지 않도록.
  try {
    const data = await res.json();
    if (data && data.product && data.product.id != null) p.id = data.product.id;
  } catch {}
  // [요청] 제조사 삭제/협업종료 경고 카운트 수정 — 저장으로 연결 제품 수가 바뀔 수 있어 제조사 목록 재로드
  //   (모달/confirm이 쓰는 m.productCount가 낡은 값이 되지 않도록. renderManufacturers의 훅으로 제조사-제품 탭도 갱신)
  // [요청] 저장 느림 개선 — 이 재로드는 전체 제품 조회를 동반해 무거우므로 await 없이 백그라운드로 (완료 알림을 막지 않음)
  if (typeof loadManufacturers === 'function') loadManufacturers().then(renderManufacturers);
  clearProductDirty(p);
  renderProducts(); // 뱃지(빠른추가/이미지없음)·needs-attention 갱신
  showAlert('저장되었습니다.');
}

// ═══════════════════════════════════════════════════════════════
// [요청] 카페24(언엑스샵) 제품 연동 — 불러오기 모달
//   /products 페이지에만 모달이 있으므로 컨테이너 없으면 early-return (파일 공유 규약)
// ═══════════════════════════════════════════════════════════════
let cafe24Items = [];

async function openCafe24Modal() {
  const modal = document.getElementById('cafe24Modal');
  if (!modal) return;
  let st;
  try {
    st = await (await fetch('/api/cafe24/status')).json();
  } catch (e) {
    showAlert('카페24 상태 확인 실패: ' + e.message);
    return;
  }
  if (!st.supported) { showAlert('JSON 롤백 모드에서는 카페24 연동을 지원하지 않습니다.'); return; }
  if (!st.configured) { showAlert('카페24 환경변수가 설정되지 않았습니다.\n(CAFE24_MALL_ID / CAFE24_CLIENT_ID / CAFE24_CLIENT_SECRET)'); return; }
  if (!st.connected) {
    if (await showConfirm('카페24 인증이 필요합니다.\n카페24 로그인 페이지로 이동할까요?')) {
      location.href = '/api/cafe24/auth';
    }
    return;
  }
  document.getElementById('cafe24MallLabel').textContent = `— ${st.mallId}`;
  document.getElementById('cafe24CheckAll').checked = false;
  document.getElementById('cafe24SelCount').textContent = '';
  document.getElementById('cafe24List').innerHTML =
    '<div style="padding:20px;color:#6b7280;font-size:13px">카페24에서 제품 목록을 불러오는 중...</div>';
  modal.style.display = 'flex';

  let res;
  try {
    res = await fetch('/api/cafe24/products');
  } catch (e) {
    document.getElementById('cafe24List').innerHTML =
      `<div style="padding:20px;color:#ef4444;font-size:13px">불러오기 실패(네트워크): ${esc(e.message)}</div>`;
    return;
  }
  if (res.status === 401) {
    closeCafe24Modal();
    if (await showConfirm('카페24 인증이 만료되었습니다.\n다시 인증할까요?')) location.href = '/api/cafe24/auth';
    return;
  }
  if (!res.ok) {
    let msg = String(res.status);
    try { const err = await res.json(); if (err && err.error) msg = err.error; } catch {}
    document.getElementById('cafe24List').innerHTML =
      `<div style="padding:20px;color:#ef4444;font-size:13px">불러오기 실패: ${esc(msg)}</div>`;
    return;
  }
  cafe24Items = await res.json();
  renderCafe24List();
}

function renderCafe24List() {
  const box = document.getElementById('cafe24List');
  if (!box) return;
  if (!cafe24Items.length) {
    box.innerHTML = '<div style="padding:20px;color:#6b7280;font-size:13px">카페24에 등록된 제품이 없습니다.</div>';
    return;
  }
  box.innerHTML = cafe24Items.map(item => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:13px">
      <input type="checkbox" class="cafe24-check" data-no="${item.productNo}" onchange="updateCafe24SelCount()">
      ${item.image
        ? `<img src="${esc(item.image)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">`
        : '<span style="width:40px;height:40px;background:#f3f4f6;border-radius:6px;flex-shrink:0"></span>'}
      <span style="flex:1;min-width:0">
        <span style="display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</span>
        <span style="display:block;font-size:12px;color:#9ca3af">
          No.${item.productNo}
          ${item.price != null ? ` · ${Number(item.price).toLocaleString()}원` : ''}
          ${item.selling ? '' : ' · <span style="color:#ef4444">판매안함</span>'}
        </span>
      </span>
      ${item.imported ? `<span style="font-size:11px;color:#2563eb;background:#dbeafe;padding:2px 8px;border-radius:10px;white-space:nowrap" title="관리명: ${esc(item.importedAs || '')}">가져옴</span>` : ''}
    </label>
  `).join('');
  updateCafe24SelCount();
}

function toggleCafe24All(checked) {
  document.querySelectorAll('.cafe24-check').forEach(cb => { cb.checked = checked; });
  updateCafe24SelCount();
}

function updateCafe24SelCount() {
  const el = document.getElementById('cafe24SelCount');
  if (!el) return;
  const n = document.querySelectorAll('.cafe24-check:checked').length;
  el.textContent = n ? `${n}개 선택됨` : '';
}

async function importCafe24Selected() {
  const nos = [...document.querySelectorAll('.cafe24-check:checked')].map(cb => Number(cb.dataset.no));
  if (!nos.length) { showAlert('가져올 제품을 선택해주세요.'); return; }
  const btn = document.getElementById('cafe24ImportBtn');
  btn.disabled = true;
  btn.textContent = '가져오는 중...';
  let res, data;
  try {
    res = await fetch('/api/cafe24/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productNos: nos }),
    });
    data = await res.json();
  } catch (e) {
    showAlert('가져오기 실패(네트워크): ' + e.message);
    btn.disabled = false; btn.textContent = '선택 가져오기';
    return;
  }
  btn.disabled = false;
  btn.textContent = '선택 가져오기';
  if (!res.ok) {
    showAlert('가져오기 실패: ' + (data && data.error ? data.error : res.status));
    return;
  }
  closeCafe24Modal();
  await loadProducts();
  let msg = `카페24 가져오기 완료 — 신규 ${data.created}개, 갱신 ${data.updated}개`;
  if (data.failed && data.failed.length) msg += `\n실패 ${data.failed.length}건:\n` + data.failed.join('\n');
  showAlert(msg);
}

function closeCafe24Modal() {
  const modal = document.getElementById('cafe24Modal');
  if (modal) modal.style.display = 'none';
}
