// [요청] Supabase 메인 DB 이전 — accounts repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체. 함수 시그니처·반환 형태는 그대로.
// USE_DB 플래그로 JSON 파일 / Postgres 분기.
// 모든 함수는 async. JSON 모드에서도 await 가능하도록 유지.
const fs = require('fs');
const config = require('../../config');

// db.js는 DATABASE_URL 없으면 require 시점에 throw하므로 JSON 모드에서 안 죽도록 지연 로드
function db() { return require('../db'); }

// ─── JSON 구현 ───
function jsonLoad() {
  const raw = fs.readFileSync(config.PATHS.accounts, 'utf-8');
  return JSON.parse(raw);
}
function jsonSave(accounts) {
  fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
}

async function listJson() {
  return jsonLoad();
}

async function incrementJson(accountId, weekKey) {
  const accounts = jsonLoad();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) throw new Error(`계정 ID ${accountId}를 찾을 수 없습니다.`);
  acc.weeklyTracking = acc.weeklyTracking || {};
  acc.weeklyTracking[weekKey] = (acc.weeklyTracking[weekKey] || 0) + 1;
  jsonSave(accounts);
  return acc.weeklyTracking[weekKey];
}

// [요청] 주간 카운트 강제 증감 — JSON 모드 ±delta (max(0, ...))
async function adjustJson(accountId, weekKey, delta) {
  const accounts = jsonLoad();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) throw new Error(`계정 ID ${accountId}를 찾을 수 없습니다.`);
  acc.weeklyTracking = acc.weeklyTracking || {};
  const next = Math.max(0, (acc.weeklyTracking[weekKey] || 0) + delta);
  acc.weeklyTracking[weekKey] = next;
  jsonSave(accounts);
  return next;
}

async function replaceAllJson(accounts) {
  // [요청] 설정 > 계정 추가 저장 안 됨 — id 결손 row(=신규)에 자동 id 부여 (DB는 SERIAL로 자동, JSON 모드만 보정)
  const existingIds = accounts.map(a => a.id).filter(id => id != null);
  let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;
  const normalized = accounts.map(a => (a.id == null ? { ...a, id: nextId++ } : a));
  jsonSave(normalized);
}

async function resetAllWeeklyTrackingJson() {
  const accounts = jsonLoad();
  for (const a of accounts) a.weeklyTracking = {};
  jsonSave(accounts);
}

// ─── Postgres 구현 ───
async function listPg() {
  // weekly_tracking을 json_object_agg로 접어 기존 JSON 구조({ weekKey: count })로 바로 매핑
  const { rows } = await db().query(
    `select a.id, a.username, a.password,
            coalesce((select json_object_agg(w.week_key, w.count)
                        from weekly_tracking w where w.account_id = a.id), '{}'::json) as weekly_tracking
       from accounts a
      where a.active = true
      order by a.id`
  );
  return rows.map(a => ({
    id: a.id,
    username: a.username,
    password: a.password,
    weeklyTracking: a.weekly_tracking || {},
  }));
}

async function incrementPg(accountId, weekKey) {
  // schema.pg.sql의 plpgsql 함수 그대로 사용 — 원자적 UPSERT
  const row = await db().one('select increment_weekly_count($1, $2) as c', [accountId, weekKey]);
  return row ? row.c : null;
}

// [요청] 주간 카운트 강제 증감 — 원자적 ±delta 함수
async function adjustPg(accountId, weekKey, delta) {
  const row = await db().one('select adjust_weekly_count($1, $2, $3) as c', [accountId, weekKey, delta]);
  return row ? row.c : null;
}

async function replaceAllPg(accounts) {
  // UI에서 password·username 편집만 지원 (추가/삭제는 별도 엔드포인트로 분리 예정)
  // id 기준 update. id 없는 row는 insert.
  const updates = accounts.filter(a => a.id != null);
  const inserts = accounts.filter(a => a.id == null);
  await db().withTx(async client => {
    for (const a of updates) {
      await client.query('update accounts set username = $1, password = $2 where id = $3',
        [a.username, a.password, a.id]);
    }
    if (inserts.length) {
      await db().insertMany('accounts', ['username', 'password'],
        inserts.map(a => ({ username: a.username, password: a.password })), { client });
    }
  });
}

async function resetAllWeeklyTrackingPg() {
  await db().query('delete from weekly_tracking');
}

// ─── 공용 API ───
async function list() {
  return config.USE_DB ? listPg() : listJson();
}

async function incrementSendCount(accountId, weekKey) {
  return config.USE_DB
    ? incrementPg(accountId, weekKey)
    : incrementJson(accountId, weekKey);
}

// [요청] 주간 카운트 강제 증감
async function adjustSendCount(accountId, weekKey, delta) {
  return config.USE_DB
    ? adjustPg(accountId, weekKey, delta)
    : adjustJson(accountId, weekKey, delta);
}

async function replaceAll(accounts) {
  return config.USE_DB
    ? replaceAllPg(accounts)
    : replaceAllJson(accounts);
}

async function resetAllWeeklyTracking() {
  return config.USE_DB
    ? resetAllWeeklyTrackingPg()
    : resetAllWeeklyTrackingJson();
}

module.exports = { list, incrementSendCount, adjustSendCount, replaceAll, resetAllWeeklyTracking };
