// [요청] 관리 UI 구조 개편 A단계 — 유틸 — esc/fmtKst/resizeImage/escapeHtml/showToast/copyText
// index.html 원본 2561-2575, 1064-1091, 2703-2706, 3256-3277 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  유틸
// ═══════════════════════════════════════
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// [요청] ISO(UTC) 문자열을 한국시간(KST) 로 읽기 쉽게 표시
function fmtKst(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  const s = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return esc(s) + ' <span style="color:#9ca3af">KST</span>';
}

// 이미지 리사이즈 (가로 maxWidth로 축소, JPEG 압축)
function resizeImage(file, maxWidth = 600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // 투명 PNG는 흰 배경으로 (JPEG는 투명도 없음)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('blob 생성 실패'));
        const baseName = file.name.replace(/\.[^.]+$/, '');
        resolve(new File([blob], baseName + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// [요청] C단계 — leads.js 에 있던 날짜 헬퍼를 util 로 이동.
//   리드 탭 마감 배지가 모든 페이지에 떠야 해서 nav.js 도 isDue/todayIso 를 쓴다.
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso, days) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDue(lead, todayStr) {
  return lead.finalStatus === 'pending' && lead.remindAt && lead.remindAt <= todayStr;
}

// [요청] 가벼운 토스트 — 동일 노드 재사용, 연속 호출 시 타이머 리셋
let _toastTimer = null;
function showToast(message) {
  let el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast('복사완료!'),
    () => alert('복사 실패: ' + text)
  );
}
