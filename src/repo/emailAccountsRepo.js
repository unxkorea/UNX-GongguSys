// [요청] Supabase 메인 DB 이전 — email_accounts repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
// [요청] Gmail API 발송 전환 — google_refresh_token / google_connected_at 컬럼 + setGoogleToken()
//   list()는 서버 내부용이라 googleRefreshToken을 포함한다. HTTP 응답으로 내보낼 때는 server.js가
//   토큰을 제거하고 googleConnected(불리언)만 내려준다. replaceAll()은 토큰 컬럼을 건드리지 않는다.
const fs = require('fs');
const config = require('../../config');

function db() { return require('../db'); }

// [요청] Gmail 앱 비밀번호 공백 제거 — Google이 'abcd efgh ijkl mnop' 형식으로 보여주기 때문에
// 그대로 붙여넣으면 공백이 섞인 채 저장되고 SMTP가 535 BadCredentials로 거부한다.
// 저장(replaceAll)·조회(list) 양쪽에서 정규화해 기존에 저장된 값도 자동 교정된다.
function normalizeAppPassword(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, '') : (v == null ? '' : v);
}

function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}

// ─── JSON ───
function jsonLoad() {
  if (!fs.existsSync(config.PATHS.emailAccounts)) return [];
  try { return JSON.parse(fs.readFileSync(config.PATHS.emailAccounts, 'utf-8')) || []; } catch { return []; }
}
function jsonSave(list) {
  fs.writeFileSync(config.PATHS.emailAccounts, JSON.stringify(list, null, 2), 'utf-8');
}

async function listJson() {
  return jsonLoad().map(a => ({
    ...a,
    appPassword: normalizeAppPassword(a.appPassword),
    googleRefreshToken: a.googleRefreshToken || '',
    googleConnectedAt: a.googleConnectedAt || null,
  }));
}

async function replaceAllJson(list) {
  // 클라이언트 payload에는 토큰이 없으므로 기존 파일의 토큰을 id 기준으로 보존
  const prev = new Map(jsonLoad().map(a => [a.id, a]));
  const normalized = (list || []).map(a => {
    const old = prev.get(a.id) || {};
    return {
      ...a,
      appPassword: normalizeAppPassword(a.appPassword),
      googleRefreshToken: old.googleRefreshToken || '',
      googleConnectedAt: old.googleConnectedAt || null,
    };
  });
  jsonSave(normalized);
}

async function setGoogleTokenJson(id, refreshToken) {
  const list = jsonLoad();
  const idx = list.findIndex(a => Number(a.id) === Number(id));
  if (idx === -1) throw notFoundError();
  list[idx].googleRefreshToken = refreshToken || '';
  list[idx].googleConnectedAt = refreshToken ? new Date().toISOString() : null;
  jsonSave(list);
}

// ─── Postgres ───
function rowToAccount(a) {
  return {
    id: a.id,
    email: a.email,
    appPassword: normalizeAppPassword(a.app_password),
    senderName: a.sender_name,
    signature: a.signature || '',
    signatureImage: a.signature_image_url || '',
    googleRefreshToken: a.google_refresh_token || '',
    googleConnectedAt: a.google_connected_at || null,
  };
}

async function listPg() {
  const { rows } = await db().query(
    `select id, email, app_password, sender_name, signature, signature_image_url,
            google_refresh_token, google_connected_at
       from email_accounts
      where active = true
      order by id`
  );
  return rows.map(rowToAccount);
}

async function replaceAllPg(list) {
  const updates = (list || []).filter(a => a.id != null);
  const inserts = (list || []).filter(a => a.id == null);
  await db().withTx(async client => {
    for (const a of updates) {
      await client.query(
        `update email_accounts
            set email = $1, app_password = $2, sender_name = $3, signature = $4, signature_image_url = $5
          where id = $6`,
        [a.email, normalizeAppPassword(a.appPassword), a.senderName || '',
          a.signature || null, a.signatureImage || null, a.id]
      );
    }
    if (inserts.length) {
      await db().insertMany('email_accounts',
        ['email', 'app_password', 'sender_name', 'signature', 'signature_image_url'],
        inserts.map(a => ({
          email: a.email,
          app_password: normalizeAppPassword(a.appPassword),
          sender_name: a.senderName || '',
          signature: a.signature || null,
          signature_image_url: a.signatureImage || null,
        })), { client });
    }
  });
}

async function setGoogleTokenPg(id, refreshToken) {
  const r = await db().query(
    `update email_accounts
        set google_refresh_token = $1,
            google_connected_at = case when $1::text is null then null else now() end
      where id = $2`,
    [refreshToken || null, Number(id)]
  );
  if (!r.rowCount) throw notFoundError();
}

// ─── 공용 API ───
async function list() {
  return config.USE_DB ? listPg() : listJson();
}

async function replaceAll(payload) {
  return config.USE_DB ? replaceAllPg(payload) : replaceAllJson(payload);
}

async function findById(id) {
  const all = await list();
  if (id == null) return all[0] || null;
  const idNum = Number(id);
  return all.find(a => a.id === idNum) || null;
}

// [요청] Gmail API 발송 전환 — refresh token 저장(null이면 연결 해제)
async function setGoogleToken(id, refreshToken) {
  return config.USE_DB ? setGoogleTokenPg(id, refreshToken) : setGoogleTokenJson(id, refreshToken);
}

// HTTP 응답용: 토큰 제거 + googleConnected 불리언
function toPublic(a) {
  const { googleRefreshToken, ...rest } = a;
  return { ...rest, googleConnected: !!googleRefreshToken };
}

module.exports = { list, replaceAll, findById, setGoogleToken, toPublic };
