// [요청] Supabase 메인 DB 이전 — replies repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
// JSON 모드: replies.json 단일 스냅샷(checkedAt, partial, results[])
// DB 모드: reply_runs + replies 테이블 (partial = finished_at IS NULL)
const fs = require('fs');
const path = require('path');
const config = require('../../config');

function db() { return require('../db'); }

const REPLIES_JSON = path.resolve(__dirname, '..', '..', 'replies.json');

// ─── JSON ───
function readFile() {
  if (!fs.existsSync(REPLIES_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(REPLIES_JSON, 'utf-8')); } catch { return null; }
}
function writeFile(data) {
  fs.writeFileSync(REPLIES_JSON, JSON.stringify(data, null, 2), 'utf-8');
}

async function startRunJson() {
  const startedAt = new Date().toISOString();
  writeFile({ checkedAt: startedAt, partial: true, results: [] });
  return { runId: null, startedAt };
}
async function addResultJson(_runId, result) {
  const current = readFile() || { checkedAt: new Date().toISOString(), partial: true, results: [] };
  current.results.push(result);
  writeFile(current);
}
async function finishRunJson(_runId) {
  const current = readFile();
  if (current) {
    current.partial = false;
    writeFile(current);
  }
}
async function getLatestJson() {
  return readFile();
}

// ─── Postgres ───
async function startRunPg() {
  const row = await db().one(
    'insert into reply_runs (started_at) values (now()) returning id, started_at'
  );
  return { runId: row.id, startedAt: row.started_at };
}

async function addResultPg(runId, result) {
  await db().query(
    `insert into replies (run_id, account_username, reply_count, reject_count, error, checked_at)
     values ($1, $2, $3, $4, $5, now())`,
    [
      runId,
      result.account,
      result.replyCount || 0,
      // [요청] 답장확인 '거절' 표시 — 안읽음 거절 채팅방 수
      result.rejectCount || 0,
      result.error || null,
    ]
  );
}

async function finishRunPg(runId) {
  await db().query('update reply_runs set finished_at = now() where id = $1', [runId]);
}

async function getLatestPg() {
  const run = await db().one(
    'select id, started_at, finished_at from reply_runs order by started_at desc limit 1'
  );
  if (!run) return null;
  const { rows } = await db().query(
    `select account_username, reply_count, reject_count, error, checked_at
       from replies where run_id = $1 order by checked_at asc`,
    [run.id]
  );
  return {
    checkedAt: run.started_at,
    partial: run.finished_at == null,
    results: rows.map(r => ({
      account: r.account_username,
      replyCount: r.reply_count || 0,
      // [요청] 답장확인 '거절' 표시
      rejectCount: r.reject_count || 0,
      error: r.error || null,
    })),
  };
}

// ─── 공용 ───
async function startRun() {
  return config.USE_DB ? startRunPg() : startRunJson();
}
async function addResult(runId, result) {
  return config.USE_DB ? addResultPg(runId, result) : addResultJson(runId, result);
}
async function finishRun(runId) {
  return config.USE_DB ? finishRunPg(runId) : finishRunJson(runId);
}
async function getLatest() {
  return config.USE_DB ? getLatestPg() : getLatestJson();
}

module.exports = { startRun, addResult, finishRun, getLatest };
