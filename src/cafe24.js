// [요청] 카페24(언엑스샵) 제품 연동 — Admin API OAuth 토큰 관리 + 제품 조회
// - 토큰은 Supabase cafe24_tokens 테이블에 저장 (Railway 파일시스템은 재배포 시 초기화되므로 파일 저장 불가)
// - JSON 롤백 모드(USE_SUPABASE=false)에서는 미지원 — isSupported()로 가드
// - Node 20 전역 fetch 사용 (추가 의존성 없음)
require('dotenv').config();
const config = require('../config');

const MALL_ID = process.env.CAFE24_MALL_ID || '';
const CLIENT_ID = process.env.CAFE24_CLIENT_ID || '';
const CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '';
const SCOPE = 'mall.read_product';
// 토큰 만료 60초 전부터는 미리 갱신 (경계에서 401 방지)
const EXPIRY_MARGIN_MS = 60 * 1000;

function isConfigured() {
  return !!(MALL_ID && CLIENT_ID && CLIENT_SECRET);
}
function isSupported() {
  return config.USE_SUPABASE;
}
function apiBase() {
  return `https://${MALL_ID}.cafe24api.com`;
}

// ─── 토큰 저장/조회 (Supabase) ───
function db() {
  // db.js는 SUPABASE_URL 없으면 require 시점에 throw하므로 지연 로드
  return require('./db').supabase;
}

async function loadTokenRow() {
  const { data, error } = await db()
    .from('cafe24_tokens').select('*').eq('mall_id', MALL_ID).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveTokenRow(tokenResponse) {
  const row = {
    mall_id: MALL_ID,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: tokenResponse.expires_at || null,
    refresh_token_expires_at: tokenResponse.refresh_token_expires_at || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from('cafe24_tokens').upsert(row, { onConflict: 'mall_id' });
  if (error) throw error;
  return row;
}

// ─── OAuth ───
function getAuthUrl(redirectUri, state) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    state,
    redirect_uri: redirectUri,
    scope: SCOPE,
  });
  return `${apiBase()}/api/v2/oauth/authorize?${q.toString()}`;
}

async function requestToken(bodyParams) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${apiBase()}/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(bodyParams).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`카페24 토큰 발급 실패 (${res.status}): ${json.error_description || json.error || JSON.stringify(json)}`);
  }
  return json;
}

// 인증코드 → 토큰 교환 후 DB 저장 (인증코드 유효시간 1분 — 콜백에서 즉시 호출)
async function exchangeCode(code, redirectUri) {
  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  await saveTokenRow(token);
  return token;
}

// 유효한 access token 반환 — 만료(임박) 시 refresh token으로 재발급 후 저장
async function getAccessToken() {
  const row = await loadTokenRow();
  if (!row) {
    const e = new Error('NOT_CONNECTED');
    e.code = 'NOT_CONNECTED';
    throw e;
  }
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt - EXPIRY_MARGIN_MS > Date.now()) return row.access_token;

  // 갱신 토큰마저 만료면 재인증 필요
  const refreshExpires = row.refresh_token_expires_at ? new Date(row.refresh_token_expires_at).getTime() : Infinity;
  if (refreshExpires <= Date.now()) {
    const e = new Error('NOT_CONNECTED');
    e.code = 'NOT_CONNECTED';
    throw e;
  }
  const refreshed = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
  });
  await saveTokenRow(refreshed);
  return refreshed.access_token;
}

async function isConnected() {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// ─── Admin API ───
async function apiGet(pathname, params = {}) {
  const accessToken = await getAccessToken();
  const q = new URLSearchParams(params);
  const url = `${apiBase()}/api/v2/admin${pathname}${q.size ? `?${q}` : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`카페24 API 실패 (${res.status} ${pathname}): ${json.error?.message || JSON.stringify(json)}`);
  }
  return json;
}

// additionalimages 응답은 객체 배열({big, medium, small} 등) 형태가 섞일 수 있어 방어적으로 URL만 추출
function extractImageUrls(additional) {
  if (!Array.isArray(additional)) return [];
  const urls = [];
  for (const item of additional) {
    if (typeof item === 'string' && /^https?:\/\//.test(item)) { urls.push(item); continue; }
    if (item && typeof item === 'object') {
      const u = item.big || item.medium || item.small || item.url || item.image;
      if (typeof u === 'string' && /^https?:\/\//.test(u)) urls.push(u);
    }
  }
  return urls;
}

// 전체 제품 목록 (페이지네이션 순회) → UI/import용 공통 형태로 매핑
async function fetchProducts() {
  const limit = 100;
  let offset = 0;
  const all = [];
  for (;;) {
    const json = await apiGet('/products', {
      limit: String(limit),
      offset: String(offset),
      embed: 'additionalimages',
    });
    const batch = json.products || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 10000) break; // 안전장치
  }
  return all.map(p => ({
    productNo: p.product_no,
    name: p.product_name || '',
    price: p.price != null ? Number(p.price) : null,
    display: p.display === 'T',
    selling: p.selling === 'T',
    image: p.detail_image || p.list_image || '',
    additionalImages: extractImageUrls(p.additionalimages),
  }));
}

module.exports = {
  MALL_ID,
  isConfigured,
  isSupported,
  isConnected,
  getAuthUrl,
  exchangeCode,
  fetchProducts,
};
