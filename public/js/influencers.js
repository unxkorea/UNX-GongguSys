// [요청] 관리 UI 구조 개편 A단계 — 인플루언서
// index.html 원본 1965-2049 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  인플루언서
// ═══════════════════════════════════════
async function loadInfluencers() {
  const res = await fetch('/api/influencers');
  influencers = await res.json();
  renderInfluencers();
}

function renderInfluencers() {
  const tbody = document.getElementById('influencersBody');
  if (!tbody) return;   // [요청] C단계 — 발송 페이지는 influencers 배열만 씀(목록 DOM 없음)
  document.getElementById('influencerCount').textContent = influencers.length;
  tbody.innerHTML = influencers.map((inf, i) => `<tr>
    <td>${i + 1}</td>
    <td><input type="text" value="${esc(inf.nickname)}" onchange="influencers[${i}].nickname=this.value"></td>
    <td><input type="text" value="${esc(inf.profileUrl)}" onchange="influencers[${i}].profileUrl=this.value"></td>
    <td><input type="text" value="${esc(inf.productName)}" onchange="influencers[${i}].productName=this.value"></td>
    <td><button class="btn btn-danger btn-sm" onclick="removeInfluencer(${i})">X</button></td>
  </tr>`).join('');
}

function addInfluencerRow() {
  influencers.push({ nickname: '', profileUrl: '', productName: '' });
  renderInfluencers();
}

function removeInfluencer(i) {
  influencers.splice(i, 1);
  renderInfluencers();
}

function clearInfluencers() {
  if (!confirm('인플루언서 목록을 전부 삭제하시겠습니까?')) return;
  influencers = [];
  renderInfluencers();
  saveInfluencers();
}

async function saveInfluencers() {
  await fetch('/api/influencers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(influencers) });
  alert('인플루언서 목록이 저장되었습니다.');
}

// 붙여넣기 처리 (구글 시트에서 탭 구분 데이터)
const pasteArea = document.getElementById('pasteArea');

// [요청] 한 셀에 메일 여러 개(멀티라인 셀) 지원 — 따옴표("...") 인식 TSV 파서.
//   시트/엑셀은 줄바꿈 포함 셀을 "..."로 감싸 복사하므로(내부 " 는 "" 이스케이프),
//   따옴표 안의 \n·\t는 행/셀 구분자가 아니라 셀 내용으로 유지해야 한다.
function parseClipboardTable(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === '\t') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// [요청] C단계 — 발송 페이지도 influencers.js 를 로드하므로(배열·loadInfluencers 사용)
//   붙여넣기 영역이 없는 페이지에서는 리스너 등록을 건너뛴다.
if (pasteArea) pasteArea.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const rows = parseClipboardTable(text).filter(cells => cells.some(c => c.trim()));

  let added = 0;
  for (const cells of rows) {
    // 탭 구분(셀 2개 이상)이면 그대로, 아니면 기존 콤마 구분 라인으로 처리
    const isTab = cells.length > 1;
    const parts = isTab ? cells : cells[0].split(',');
    // [요청] 두 번째 컬럼이 콤마 나열 또는 멀티라인 셀(줄바꿈 나열)이면
    //   같은 닉네임/제품으로 URL별 다중 행 생성 (탭 분리 라인에서만 적용)
    if (parts.length >= 3) {
      const nickname = parts[0].trim();
      const productName = parts[2].trim();
      const urls = isTab
        ? parts[1].split(/[\n,]/).map(s => s.trim()).filter(Boolean)
        : [parts[1].trim()];
      for (const url of urls) {
        influencers.push({ nickname, profileUrl: url, productName });
        added++;
      }
    } else if (parts.length === 2) {
      // 닉네임 + URL만 있으면 제품명은 비워둠 (멀티라인 셀이면 URL별 행 생성)
      const nickname = parts[0].trim();
      const urls = isTab
        ? parts[1].split('\n').map(s => s.trim()).filter(Boolean)
        : [parts[1].trim()];
      for (const url of urls) {
        influencers.push({ nickname, profileUrl: url, productName: '' });
        added++;
      }
    }
  }

  renderInfluencers();
  if (added > 0) {
    pasteArea.innerHTML = `<p style="color:#10b981">${added}명 추가 완료!</p><small>추가 붙여넣기 가능</small>`;
    setTimeout(() => {
      pasteArea.innerHTML = `<p>구글 시트에서 복사 후 여기를 클릭하고 Ctrl+V</p><small>닉네임 &nbsp; | &nbsp; 인포크 URL &nbsp; | &nbsp; 제품명 &nbsp; (탭으로 구분)</small>`;
    }, 2000);
  }
});
