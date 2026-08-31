// [요청] 관리 UI 구조 개편 A단계 — 설정
// index.html 원본 2576-2688 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  설정 (참조자 이메일 등)
// ═══════════════════════════════════════
// [요청] UI에서 참조자 이메일 설정 가능
async function loadSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  // [요청] C단계 — 추천 페이지도 공개 URL 확보 목적으로 loadSettings()를 부르므로 폼 요소는 선택적
  const bcc = document.getElementById('settingsMailBcc');
  if (bcc) bcc.value = data.mailBcc || '';
  // [요청] 추천 카탈로그 공개 URL — 입력 + 전역 변수 동기화 (공유 링크 생성에 사용)
  const cb = document.getElementById('settingsCatalogBaseUrl');
  if (cb) cb.value = data.catalogPublicBaseUrl || '';
  if (data.catalogPublicBaseUrl) {
    window.CATALOG_PUBLIC_BASE_URL = data.catalogPublicBaseUrl.endsWith('/')
      ? data.catalogPublicBaseUrl
      : data.catalogPublicBaseUrl + '/';
  } else {
    window.CATALOG_PUBLIC_BASE_URL = null;
  }
  // [요청] 외부 배포 — headless 토글 반영
  const hd = document.getElementById('settingsHeadless');
  if (hd) hd.checked = !!data.headless;
  // [요청] 인스타분석 계정 — ID는 표시, 비밀번호는 마스킹/공란
  const insta = data.instagram || {};
  const igu = document.getElementById('settingsInstagramUsername');
  if (igu) igu.value = insta.username || '';
  const igp = document.getElementById('settingsInstagramPassword');
  if (igp) igp.placeholder = insta.password ? '저장된 비밀번호 (변경 시에만 입력)' : '비밀번호';
}

// [요청] 인스타분석 계정 저장
async function saveInstagramCreds() {
  const username = document.getElementById('settingsInstagramUsername').value.trim();
  const passwordInput = document.getElementById('settingsInstagramPassword');
  const password = passwordInput.value;
  // 기존 settings 읽어서 instagram만 부분 업데이트 (비번 빈값 = 기존 유지)
  const cur = await (await fetch('/api/settings')).json();
  const curInsta = cur.instagram || {};
  const next = {
    username,
    password: password ? password : (curInsta.password || ''),
  };
  if (!next.username || !next.password) {
    alert('ID와 비밀번호를 모두 입력해주세요.');
    return;
  }
  await fetch('/api/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instagram: next }),
  });
  passwordInput.value = '';
  passwordInput.placeholder = '저장된 비밀번호 (변경 시에만 입력)';
  alert('인스타분석 계정이 저장되었습니다.');
}

async function saveSettings() {
  const mailBcc = document.getElementById('settingsMailBcc').value.trim();
  await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mailBcc }) });
  alert('설정이 저장되었습니다.');
}

// [요청] 추천 카탈로그 공개 URL 저장
async function saveCatalogBaseUrl() {
  let url = document.getElementById('settingsCatalogBaseUrl').value.trim();
  if (url && !/^https?:\/\//.test(url)) {
    alert('URL은 http:// 또는 https:// 로 시작해야 합니다.');
    return;
  }
  if (url && !url.endsWith('/')) url += '/';
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogPublicBaseUrl: url }),
  });
  window.CATALOG_PUBLIC_BASE_URL = url || null;
  // [요청] C단계 — catalogs.js 는 추천 페이지에서만 로드되므로 존재할 때만 호출
  if (typeof renderCatalogs === 'function') renderCatalogs(); // 목록에 표시된 URL도 갱신
  alert('추천 카탈로그 공개 URL이 저장되었습니다.');
}

// [요청] 외부 배포 — 관리자 비밀번호 변경
async function saveAdminPassword() {
  const input = document.getElementById('settingsAdminPassword');
  const adminPassword = input.value;
  if (adminPassword === '') {
    if (!confirm('비밀번호를 빈값으로 저장하면 외부 접속 인증이 꺼집니다. 계속하시겠습니까?')) return;
  }
  await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword }) });
  input.value = '';
  alert('비밀번호가 저장되었습니다.');
  updateLogoutButton();
}

// [요청] 외부 배포 — headless 토글
async function saveHeadless() {
  const headless = document.getElementById('settingsHeadless').checked;
  await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ headless }) });
  alert(`Headless 모드: ${headless ? 'ON' : 'OFF'}. 다음 매크로 실행부터 적용됩니다.`);
}

// [요청] 외부 배포 — 로그아웃
async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login';
}

async function updateLogoutButton() {
  try {
    const r = await fetch('/api/auth/status');
    const s = await r.json();
    const btn = document.getElementById('logoutBtn');
    if (btn) btn.style.display = (s.needsAuth && s.authenticated) ? 'inline-block' : 'none';
  } catch {}
}
