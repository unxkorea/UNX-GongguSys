// [요청] Supabase 메인 DB 이전 — email_accounts repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
const fs = require('fs');
const config = require('../../config');

function db() { return require('../db'); }

// [요청] Gmail 앱 비밀번호 공백 제거 — Google이 'abcd efgh ijkl mnop' 형식으로 보여주기 때문에
// 그대로 붙여넣으면 공백이 섞인 채 저장되고 SMTP가 535 BadCredentials로 거부한다.
// 저장(replaceAll)·조회(list) 양쪽에서 정규화해 기존에 저장된 값도 자동 교정된다.
function normalizeAppPassword(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, '') : v;
}

// ─── JSON ───
async function listJson() {
  if (!fs.existsSync(config.PATHS.emailAccounts)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(config.PATHS.emailAccounts, 'utf-8'));
    return (list || []).map(a => ({ ...a, appPassword: normalizeAppPassword(a.appPassword) }));
  } catch {
    return [];
  }
}

async function replaceAllJson(list) {
  const normalized = (list || []).map(a => ({ ...a, appPassword: normalizeAppPassword(a.appPassword) }));
  fs.writeFileSync(config.PATHS.emailAccounts, JSON.stringify(normalized, null, 2), 'utf-8');
}

// ─── Postgres ───
async function listPg() {
  const { rows } = await db().query(
    `select id, email, app_password, sender_name, signature, signature_image_url
       from email_accounts
      where active = true
      order by id`
  );
  return rows.map(a => ({
    id: a.id,
    email: a.email,
    appPassword: normalizeAppPassword(a.app_password),
    senderName: a.sender_name,
    signature: a.signature || '',
    signatureImage: a.signature_image_url || '',
  }));
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
        [a.email, normalizeAppPassword(a.appPassword), a.senderName,
          a.signature || null, a.signatureImage || null, a.id]
      );
    }
    if (inserts.length) {
      await db().insertMany('email_accounts',
        ['email', 'app_password', 'sender_name', 'signature', 'signature_image_url'],
        inserts.map(a => ({
          email: a.email,
          app_password: normalizeAppPassword(a.appPassword),
          sender_name: a.senderName,
          signature: a.signature || null,
          signature_image_url: a.signatureImage || null,
        })), { client });
    }
  });
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

module.exports = { list, replaceAll, findById };
