// [요청] Railway 전환 2단계 — 공동구매 파트(영업/CS/정산 등) 관리 (dual-mode repo)
//   parts: {id, code, name, sortOrder, active}. code는 내부 식별자(불변), name은 화면 표시용(admin이 변경 가능).
//   employee_parts(직원-파트 M:N)는 employeesRepo.js가 소유(employee 쪽에서 다루는 게 자연스러움).
const fs = require('fs');
const path = require('path');
const config = require('../../config');

function db() { return require('../db'); }

const PARTS_JSON = path.resolve(__dirname, '..', '..', 'parts.json');
const DEFAULT_PARTS = [
  { code: 'sales', name: '영업', sortOrder: 1 },
  { code: 'cs', name: 'CS', sortOrder: 2 },
  { code: 'settlement', name: '정산', sortOrder: 3 },
];

function rowToPart(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name || '',
    sortOrder: r.sort_order || 0,
    active: !!r.active,
  };
}

function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}
function duplicateError() {
  const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; return e;
}

// ─── JSON ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(PARTS_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.parts) ? parsed : { parts: [] };
  } catch {
    // 최초 실행 시 기본 파트 3종으로 시드
    const seeded = DEFAULT_PARTS.map((p, i) => ({ id: i + 1, ...p, active: true }));
    jsonSave(seeded);
    return { parts: seeded };
  }
}
function jsonSave(parts) {
  fs.writeFileSync(PARTS_JSON, JSON.stringify({ parts }, null, 2), 'utf-8');
}

async function listJson({ activeOnly = false } = {}) {
  let list = jsonLoadRaw().parts || [];
  if (activeOnly) list = list.filter(p => p.active !== false);
  return list.slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.id || 0) - (b.id || 0))
    .map(rowToPart);
}

async function insertOneJson(name) {
  const raw = jsonLoadRaw();
  const list = raw.parts || [];
  const trimmed = (name || '').trim();
  if (!trimmed) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  if (list.some(p => p.name === trimmed)) throw duplicateError();
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const code = 'p' + nextId; // 신규 파트는 순번 기반 code (표시엔 name만 씀)
  const newRow = { id: nextId, code, name: trimmed, sortOrder: nextId, active: true };
  list.push(newRow);
  raw.parts = list;
  jsonSave(list);
  return rowToPart(newRow);
}

async function renameJson(id, name) {
  const raw = jsonLoadRaw();
  const list = raw.parts || [];
  const numId = Number(id);
  const idx = list.findIndex(p => p.id === numId);
  if (idx === -1) throw notFoundError();
  const trimmed = (name || '').trim();
  if (!trimmed) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  list[idx].name = trimmed;
  raw.parts = list;
  jsonSave(list);
  return rowToPart(list[idx]);
}

async function setActiveJson(id, active) {
  const raw = jsonLoadRaw();
  const list = raw.parts || [];
  const numId = Number(id);
  const idx = list.findIndex(p => p.id === numId);
  if (idx === -1) throw notFoundError();
  list[idx].active = !!active;
  raw.parts = list;
  jsonSave(list);
  return rowToPart(list[idx]);
}

// ─── Postgres ───
async function listPg({ activeOnly = false } = {}) {
  const where = activeOnly ? 'where active = true' : '';
  const { rows } = await db().query(`select * from parts ${where} order by sort_order asc, id asc`);
  return rows.map(rowToPart);
}

async function insertOnePg(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  const { rows } = await db().query('select coalesce(max(sort_order), 0) + 1 as n from parts');
  const sortOrder = rows[0].n;
  // code는 내부 식별자라 이름이 겹쳐도 신규 code는 겹치지 않음(nextval 기반) — unique 위반은 name 중복이 아니라 code 충돌 시에만 발생.
  const code = 'part_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    const data = await db().one(
      'insert into parts (code, name, sort_order) values ($1, $2, $3) returning *',
      [code, trimmed, sortOrder]
    );
    return rowToPart(data);
  } catch (error) {
    if (db().isUniqueViolation(error)) throw duplicateError();
    throw error;
  }
}

async function renamePg(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  const r = await db().query('update parts set name = $1 where id = $2 returning *', [trimmed, Number(id)]);
  if (!r.rowCount) throw notFoundError();
  return rowToPart(r.rows[0]);
}

async function setActivePg(id, active) {
  const r = await db().query('update parts set active = $1 where id = $2 returning *', [!!active, Number(id)]);
  if (!r.rowCount) throw notFoundError();
  return rowToPart(r.rows[0]);
}

// ─── 공용 API ───
async function list(opts) {
  return config.USE_DB ? listPg(opts) : listJson(opts);
}
async function insertOne(name) {
  return config.USE_DB ? insertOnePg(name) : insertOneJson(name);
}
async function rename(id, name) {
  return config.USE_DB ? renamePg(id, name) : renameJson(id, name);
}
async function setActive(id, active) {
  return config.USE_DB ? setActivePg(id, active) : setActiveJson(id, active);
}

module.exports = { list, insertOne, rename, setActive };
