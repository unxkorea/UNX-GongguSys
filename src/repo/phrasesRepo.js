// [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설 (dual-mode repo)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
//   phrases: 직원별 자주 쓰는 문구(메모). employee_id로 employees 참조.
//   list(employeeId?) / 반환 구조: { id, employeeId, title, content, sortOrder, createdAt }
const fs = require('fs');
const path = require('path');
const config = require('../../config');

function db() { return require('../db'); }

const PHRASES_JSON = path.resolve(__dirname, '..', '..', 'phrases.json');

function rowToPhrase(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    title: r.title || '',
    content: r.content || '',
    sortOrder: r.sort_order || 0,
    pinned: !!r.pinned, // [요청] 직원별 최대 3개 최상단 고정
    createdAt: r.created_at || null,
  };
}

// [요청] 직원별 최대 3개 최상단 고정 — 한 직원이 고정할 수 있는 최대 문구 수.
const PIN_LIMIT = 3;

function normalizeIncoming(payload) {
  return {
    employee_id: payload.employeeId ? Number(payload.employeeId) : null,
    title: (payload.title || '').toString().trim() || null,
    content: (payload.content || '').toString().trim(),
    sort_order: Number.isInteger(payload.sortOrder) ? payload.sortOrder : 0,
  };
}

function validate(row, { requireEmployee = true } = {}) {
  if (requireEmployee && !row.employee_id) {
    const e = new Error('EMPLOYEE_REQUIRED'); e.code = 'EMPLOYEE_REQUIRED'; throw e;
  }
  if (!row.content) {
    const e = new Error('CONTENT_REQUIRED'); e.code = 'CONTENT_REQUIRED'; throw e;
  }
}
function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}
function pinLimitError() {
  const e = new Error('PIN_LIMIT'); e.code = 'PIN_LIMIT'; return e;
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(PHRASES_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.phrases) ? parsed : { phrases: [] };
  } catch {
    return { phrases: [] };
  }
}
function jsonSave(phrases) {
  fs.writeFileSync(PHRASES_JSON, JSON.stringify({ phrases }, null, 2), 'utf-8');
}

async function listJson(employeeId) {
  let list = jsonLoadRaw().phrases || [];
  if (employeeId) list = list.filter(p => Number(p.employee_id) === Number(employeeId));
  // [요청] 고정(pinned) 우선 → sort_order → created_at 순.
  return list.slice()
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned))
      || (a.sort_order || 0) - (b.sort_order || 0)
      || (a.created_at || '').localeCompare(b.created_at || ''))
    .map(rowToPhrase);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const row = normalizeIncoming(payload);
  validate(row);
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = { id: nextId, ...row, created_at: new Date().toISOString() };
  list.push(newRow);
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(newRow);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  const row = normalizeIncoming(payload);
  // 수정 시 employee_id 변경은 허용하지 않음(소속 고정) — content만 필수 검증.
  validate(row, { requireEmployee: false });
  list[idx] = { ...list[idx], title: row.title, content: row.content };
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.phrases = list;
  jsonSave(list);
}

// [요청] 직원별 최대 3개 최상단 고정 — 핀 토글. 켤 때만 직원당 3개 제한 검증.
async function setPinnedJson(id, pinned) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  const target = list[idx];
  if (pinned) {
    const pinnedCount = list.filter(r =>
      Number(r.employee_id) === Number(target.employee_id) && r.pinned && r.id !== numId).length;
    if (pinnedCount >= PIN_LIMIT) throw pinLimitError();
  }
  list[idx] = { ...target, pinned: !!pinned };
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(list[idx]);
}

// ─── Postgres 구현 ───
async function listPg(employeeId) {
  const params = [];
  let where = '';
  if (employeeId) { params.push(Number(employeeId)); where = 'where employee_id = $1'; }
  // [요청] 고정(pinned) 우선 → sort_order → created_at 순.
  const { rows } = await db().query(
    `select * from phrases ${where} order by pinned desc, sort_order asc, created_at asc`, params
  );
  return rows.map(rowToPhrase);
}

async function insertOnePg(payload) {
  const row = normalizeIncoming(payload);
  validate(row);
  const data = await db().one(
    `insert into phrases (employee_id, title, content, sort_order)
     values ($1, $2, $3, $4) returning *`,
    [row.employee_id, row.title, row.content, row.sort_order]
  );
  return rowToPhrase(data);
}

async function updateOnePg(id, payload) {
  const row = normalizeIncoming(payload);
  validate(row, { requireEmployee: false });
  // employee_id는 갱신 대상에서 제외(소속 고정).
  const r = await db().query(
    'update phrases set title = $1, content = $2 where id = $3 returning *',
    [row.title, row.content, Number(id)]
  );
  if (!r.rowCount) throw notFoundError();
  return rowToPhrase(r.rows[0]);
}

async function removeOnePg(id) {
  await db().query('delete from phrases where id = $1', [Number(id)]);
}

// [요청] 직원별 최대 3개 최상단 고정 — 핀 토글. 켤 때만 직원당 3개 제한 검증.
async function setPinnedPg(id, pinned) {
  const numId = Number(id);
  return db().withTx(async client => {
    // 대상 문구의 employee_id 조회 (제한 카운트 기준). 동시 토글 경쟁 방지용 row lock.
    const t = await client.query('select id, employee_id from phrases where id = $1 for update', [numId]);
    const target = t.rows[0];
    if (!target) throw notFoundError();
    if (pinned) {
      const c = await client.query(
        `select count(*)::int as n from phrases
          where employee_id = $1 and pinned = true and id <> $2`,
        [target.employee_id, numId]
      );
      if ((c.rows[0].n || 0) >= PIN_LIMIT) throw pinLimitError();
    }
    const r = await client.query(
      'update phrases set pinned = $1 where id = $2 returning *', [!!pinned, numId]);
    return rowToPhrase(r.rows[0]);
  });
}

// ─── 공용 API ───
async function list(employeeId) {
  return config.USE_DB ? listPg(employeeId) : listJson(employeeId);
}
async function insertOne(payload) {
  return config.USE_DB ? insertOnePg(payload) : insertOneJson(payload);
}
async function updateOne(id, payload) {
  return config.USE_DB ? updateOnePg(id, payload) : updateOneJson(id, payload);
}
async function removeOne(id) {
  return config.USE_DB ? removeOnePg(id) : removeOneJson(id);
}
// [요청] 직원별 최대 3개 최상단 고정
async function setPinned(id, pinned) {
  return config.USE_DB ? setPinnedPg(id, pinned) : setPinnedJson(id, pinned);
}

module.exports = { list, insertOne, updateOne, removeOne, setPinned };
