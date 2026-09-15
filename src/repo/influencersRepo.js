// [요청] Supabase 메인 DB 이전 — influencers repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
// JSON 모드: influencers.json (pending) + failed.json 2개 파일
// DB 모드: influencers 테이블 단일, status 컬럼으로 pending/sent/failed 구분
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { readInfluencers } = require('../influencerReader');

function db() { return require('../db'); }

const INFLUENCERS_JSON = path.resolve(__dirname, '..', '..', 'influencers.json');
const FAILED_JSON = path.resolve(__dirname, '..', '..', 'failed.json');

function readJsonFile(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function writeJsonFile(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── JSON 구현 ───
async function listPendingJson() {
  // 기존 readInfluencersAuto()와 동일한 JSON→CSV fallback 로직
  if (fs.existsSync(INFLUENCERS_JSON)) {
    const data = readJsonFile(INFLUENCERS_JSON, []);
    if (Array.isArray(data) && data.length > 0) {
      const valid = data.filter(r => r.nickname && r.profileUrl && r.productName);
      return valid;
    }
  }
  return readInfluencers();
}

async function listFailedJson() {
  return readJsonFile(FAILED_JSON, []);
}

async function replaceAllPendingJson(list) {
  writeJsonFile(INFLUENCERS_JSON, list);
}

async function resetRunStateJson() {
  writeJsonFile(FAILED_JSON, []);
}

async function markFailedJson(influencer, errorMsg) {
  const current = readJsonFile(FAILED_JSON, []);
  current.push({ ...influencer, error: errorMsg });
  writeJsonFile(FAILED_JSON, current);
}

// [요청] 발송한 인플루언서 건바이건 삭제 — JSON 모드: influencers.json에서 즉시 제거
async function markSentJson(influencer) {
  const current = readJsonFile(INFLUENCERS_JSON, []);
  if (!Array.isArray(current) || current.length === 0) return;
  const filtered = current.filter(row => {
    if (influencer.id != null && row.id != null) return row.id !== influencer.id;
    return !(
      row.nickname === influencer.nickname &&
      row.profileUrl === influencer.profileUrl &&
      row.productName === influencer.productName
    );
  });
  if (filtered.length !== current.length) writeJsonFile(INFLUENCERS_JSON, filtered);
}

async function clearFailedJson() {
  if (fs.existsSync(FAILED_JSON)) fs.unlinkSync(FAILED_JSON);
}

async function requeueFailedJson() {
  const failed = readJsonFile(FAILED_JSON, []);
  const current = readJsonFile(INFLUENCERS_JSON, []);
  const toAdd = failed.map(({ nickname, profileUrl, productName }) =>
    ({ nickname, profileUrl, productName }));
  writeJsonFile(INFLUENCERS_JSON, [...current, ...toAdd]);
  if (fs.existsSync(FAILED_JSON)) fs.unlinkSync(FAILED_JSON);
  return { added: toAdd.length };
}

// ─── Postgres 구현 ───
function rowToInfluencer(r) {
  return {
    id: r.id,
    nickname: r.nickname,
    profileUrl: r.profile_url,
    productName: r.product_name,
    ...(r.error != null ? { error: r.error } : {}),
  };
}

async function listPendingPg() {
  const { rows } = await db().query(
    `select id, nickname, profile_url, product_name
       from influencers where status = 'pending' order by id`
  );
  return rows.map(rowToInfluencer);
}

async function listFailedPg() {
  const { rows } = await db().query(
    `select id, nickname, profile_url, product_name, error
       from influencers where status = 'failed' order by id`
  );
  return rows.map(rowToInfluencer);
}

async function replaceAllPendingPg(list) {
  // status='pending'만 교체. sent/failed 이력은 보존.
  await db().withTx(async client => {
    await client.query(`delete from influencers where status = 'pending'`);
    if (!list || !list.length) return;
    await db().insertMany('influencers', ['nickname', 'profile_url', 'product_name', 'status'],
      list.map(i => ({
        nickname: i.nickname,
        profile_url: i.profileUrl,
        product_name: i.productName,
        status: 'pending',
      })), { client });
  });
}

async function resetRunStatePg() {
  // run 시작 시 이전 failed 정리 (JSON 모드의 failed.json 초기화와 동등)
  await db().query(`delete from influencers where status = 'failed'`);
}

async function markFailedPg(influencer, errorMsg) {
  if (influencer.id != null) {
    await db().query(
      `update influencers set status = 'failed', error = $1, updated_at = now() where id = $2`,
      [errorMsg, influencer.id]
    );
    return;
  }
  // id가 없으면 natural key로 조회 후 업데이트, 없으면 신규 insert
  const row = await db().one(
    `select id from influencers
      where nickname = $1 and profile_url = $2 and status = 'pending' limit 1`,
    [influencer.nickname, influencer.profileUrl]
  );
  if (row) {
    await db().query(
      `update influencers set status = 'failed', error = $1, updated_at = now() where id = $2`,
      [errorMsg, row.id]
    );
  } else {
    await db().query(
      `insert into influencers (nickname, profile_url, product_name, status, error)
       values ($1, $2, $3, 'failed', $4)`,
      [influencer.nickname, influencer.profileUrl, influencer.productName, errorMsg]
    );
  }
}

// [요청] 발송한 인플루언서 건바이건 삭제 — DB 모드: row 물리 제거
// 감사 이력은 sent_log 테이블이 담당하므로 influencers에선 삭제해도 무방
async function markSentPg(influencer) {
  if (influencer.id != null) {
    await db().query('delete from influencers where id = $1', [influencer.id]);
  } else {
    await db().query(
      `delete from influencers where nickname = $1 and profile_url = $2 and status = 'pending'`,
      [influencer.nickname, influencer.profileUrl]
    );
  }
}

async function clearFailedPg() {
  await db().query(`delete from influencers where status = 'failed'`);
}

async function requeueFailedPg() {
  const r = await db().query(
    `update influencers set status = 'pending', error = null, updated_at = now()
      where status = 'failed'`
  );
  return { added: r.rowCount };
}

// [요청] 발송 중 크래시 대비 — 'sending' 중간 상태
async function markSendingPg(influencer) {
  if (influencer.id == null) return;
  await db().query(
    `update influencers set status = 'sending', updated_at = now() where id = $1`,
    [influencer.id]
  );
}

// [요청] 확인필요 카드 — in-flight sending row 오표시 수정
//   staleSeconds > 0: updated_at이 그만큼 이전인 row만 반환 (in-flight 제외).
//   매크로 실행 중일 때 server에서 staleSeconds=120 전달해 정상 처리 중인 row를 카드에서 가린다.
async function listSendingPg(staleSeconds = 0) {
  const params = [];
  let where = `status = 'sending'`;
  if (staleSeconds > 0) {
    params.push(new Date(Date.now() - staleSeconds * 1000).toISOString());
    where += ` and updated_at < $1`;
  }
  const { rows } = await db().query(
    `select id, nickname, profile_url, product_name, updated_at
       from influencers where ${where} order by id`, params
  );
  return rows.map(r => ({
    ...rowToInfluencer(r),
    updatedAt: r.updated_at,
  }));
}

async function resolveSendingAsSentPg(id) {
  await db().withTx(async client => {
    const r = await client.query(
      `select id, nickname, profile_url, product_name, status from influencers where id = $1`, [id]);
    const row = r.rows[0];
    if (!row || row.status !== 'sending') {
      throw new Error('sending 상태 row가 아닙니다.');
    }
    // sent_log에 추가 (account_id는 sending 상태만으로는 알 수 없음 → null)
    await client.query(
      `insert into sent_log (account_id, nickname, profile_url, product_name, sent_at)
       values (null, $1, $2, $3, now())`,
      [row.nickname || null, row.profile_url || null, row.product_name || null]
    );
    await client.query('delete from influencers where id = $1', [id]);
  });
}

async function resolveSendingAsPendingPg(id) {
  await db().query(
    `update influencers set status = 'pending', error = null, updated_at = now()
      where id = $1 and status = 'sending'`, [id]
  );
}

// JSON 모드는 이 기능을 지원하지 않음 (긴급 롤백 모드에서는 중단 복구 UI 불필요)
async function markSendingJson() { /* no-op */ }
async function listSendingJson() { return []; }
async function resolveSendingAsSentJson() { throw new Error('JSON 모드에서는 지원하지 않음'); }
async function resolveSendingAsPendingJson() { throw new Error('JSON 모드에서는 지원하지 않음'); }

// ─── 공용 API ───
async function listPending() {
  return config.USE_DB ? listPendingPg() : listPendingJson();
}
async function listFailed() {
  return config.USE_DB ? listFailedPg() : listFailedJson();
}
async function replaceAllPending(list) {
  return config.USE_DB ? replaceAllPendingPg(list) : replaceAllPendingJson(list);
}
async function resetRunState() {
  return config.USE_DB ? resetRunStatePg() : resetRunStateJson();
}
async function markFailed(influencer, errorMsg) {
  return config.USE_DB
    ? markFailedPg(influencer, errorMsg)
    : markFailedJson(influencer, errorMsg);
}
async function markSent(influencer) {
  return config.USE_DB ? markSentPg(influencer) : markSentJson(influencer);
}
async function clearFailed() {
  return config.USE_DB ? clearFailedPg() : clearFailedJson();
}
async function requeueFailed() {
  return config.USE_DB ? requeueFailedPg() : requeueFailedJson();
}
// [요청] 발송 중 크래시 대비 — sending 상태 공용 API
async function markSending(influencer) {
  return config.USE_DB ? markSendingPg(influencer) : markSendingJson(influencer);
}
async function listSending(staleSeconds = 0) {
  return config.USE_DB ? listSendingPg(staleSeconds) : listSendingJson();
}
async function resolveSendingAsSent(id) {
  return config.USE_DB ? resolveSendingAsSentPg(id) : resolveSendingAsSentJson(id);
}
async function resolveSendingAsPending(id) {
  return config.USE_DB ? resolveSendingAsPendingPg(id) : resolveSendingAsPendingJson(id);
}

module.exports = {
  listPending, listFailed, replaceAllPending,
  resetRunState, markFailed, markSent,
  clearFailed, requeueFailed,
  markSending, listSending, resolveSendingAsSent, resolveSendingAsPending,
};
