// [요청] Gmail API 발송 전환 — Google OAuth 토큰 관리 + Gmail API(HTTPS) 원문 발송
// - Railway Hobby 플랜은 아웃바운드 SMTP(25/465/587)를 차단하므로 nodemailer SMTP 대신 Gmail API로 보낸다.
// - 토큰: email_accounts.google_refresh_token (계정별). access token은 프로세스 메모리 캐시.
// - 스코프: gmail.send(발송) + openid email(연결 계정 주소 확인용). 메일함 읽기 권한은 요청하지 않는다.
// - 카페24(src/cafe24.js)와 같은 패턴: 설정 화면 "Google 연결" → 동의 → 콜백에서 코드 교환 → DB 저장.
// - Node 20 전역 fetch 사용 (추가 의존성 없음)
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';
// 만료 60초 전부터 미리 갱신 (경계에서 401 방지)
const EXPIRY_MARGIN_MS = 60 * 1000;

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function notConnected(msg) {
  const e = new Error(msg || 'NOT_CONNECTED');
  e.code = 'NOT_CONNECTED';
  return e;
}

// ─── OAuth ───
function getAuthUrl(redirectUri, state) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',   // refresh token 수령
    prompt: 'consent',        // 재연결 시에도 refresh token을 다시 내려주도록 강제
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

async function requestToken(bodyParams) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...bodyParams }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = refresh token 폐기/만료(비밀번호 변경, 앱 액세스 제거, 테스트 앱 7일 만료 등) → 재연결 필요
    if (json.error === 'invalid_grant') throw notConnected('Google 연결이 만료되었습니다. 설정에서 다시 연결해주세요.');
    throw new Error(`Google 토큰 발급 실패 (${res.status}): ${json.error_description || json.error || JSON.stringify(json)}`);
  }
  return json;
}

// id_token(JWT) payload에서 email 추출. 토큰 엔드포인트에서 TLS로 직접 받은 값이라 서명 검증 없이 payload만 읽는다.
function emailFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return (payload.email || '').toLowerCase();
  } catch { return ''; }
}

// 인증코드 → refresh token + 연결된 구글 계정 이메일. 콜백에서 즉시 호출.
async function exchangeCode(code, redirectUri) {
  const token = await requestToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  let email = emailFromIdToken(token.id_token);
  if (!email && token.access_token) email = await fetchUserinfoEmail(token.access_token);
  if (!token.refresh_token) {
    throw new Error('Google이 refresh token을 내려주지 않았습니다. 구글 계정 → 보안 → 서드파티 앱에서 이 앱의 액세스를 제거한 뒤 다시 연결해주세요.');
  }
  return { refreshToken: token.refresh_token, email };
}

async function fetchUserinfoEmail(accessToken) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  return (json.email || '').toLowerCase();
}

// ─── access token 캐시 ───
const cache = new Map(); // key: refresh token → { accessToken, expiresAt }

async function getAccessToken(account, { force = false } = {}) {
  const rt = account && account.googleRefreshToken;
  if (!rt) throw notConnected('이 Gmail 계정은 Google 연결이 되어 있지 않습니다.');
  const hit = cache.get(rt);
  if (!force && hit && hit.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return hit.accessToken;
  const token = await requestToken({ grant_type: 'refresh_token', refresh_token: rt });
  const entry = { accessToken: token.access_token, expiresAt: Date.now() + (Number(token.expires_in) || 3600) * 1000 };
  cache.set(rt, entry);
  return entry.accessToken;
}

// ─── 발송 ───
// rfc822: MailComposer가 만든 원문(Buffer). 업로드 엔드포인트라 첨부 포함 35MB까지.
async function sendRaw(account, rfc822) {
  let accessToken = await getAccessToken(account);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'message/rfc822' },
      body: rfc822,
    });
    if (res.status === 401 && attempt === 0) {
      // 캐시된 토큰이 서버에서 먼저 폐기된 경우 — 1회 재발급 후 재시도
      accessToken = await getAccessToken(account, { force: true });
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json.error && json.error.message) || JSON.stringify(json);
      throw new Error(`Gmail API 발송 실패 (${res.status}): ${msg}`);
    }
    return { id: json.id, threadId: json.threadId };
  }
  throw new Error('Gmail API 발송 실패: 토큰 재발급 후에도 401');
}

// 연결 확인: refresh token으로 access token 발급 + 연결된 구글 계정이 등록 주소와 같은지
async function verify(account) {
  const accessToken = await getAccessToken(account, { force: true });
  const email = await fetchUserinfoEmail(accessToken);
  const expected = String(account.email || '').trim().toLowerCase();
  if (email && expected && email !== expected) {
    throw new Error(`연결된 구글 계정(${email})이 등록 주소(${expected})와 다릅니다. 다시 연결해주세요.`);
  }
  return { email };
}

module.exports = { isConfigured, getAuthUrl, exchangeCode, getAccessToken, sendRaw, verify, SCOPES };
