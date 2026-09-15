// [요청] 제조사 관리 기능 — 제조사 추가 → 제품 추가 흐름 (dual-mode repo)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
//   list() 반환 구조: { id, name, contactPerson, contact, hurdle, schedule, memo, status, productCount, createdAt }
//   - status: '' = 진행 / '협업종료'. 협업종료 시 연결된 제품 status도 함께 '협업종료'(endCollaboration 캐스케이드).
//   - productCount: 해당 제조사에 연결된 제품 수(삭제 경고/목록 표시용).
const fs = require('fs');
const config = require('../../config');
const productsRepo = require('./productsRepo');

function db() { return require('../db'); }

const STATUS_ACTIVE = '';
const STATUS_ENDED = '협업종료';

function rowToManufacturer(r, productCount = 0) {
  return {
    id: r.id,
    name: r.name || '',
    contactPerson: r.contact_person || '',
    contact: r.contact || '',
    hurdle: r.hurdle || '',
    schedule: r.schedule || '',
    memo: r.memo || '',
    status: r.status || '',
    productCount,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  const row = {
    name: (payload.name || '').toString().trim(),
    contact_person: (payload.contactPerson || '').toString().trim() || null,
    contact: (payload.contact || '').toString().trim() || null,
    hurdle: (payload.hurdle || '').toString().trim() || null,
    schedule: (payload.schedule || '').toString().trim() || null,
    memo: (payload.memo || '').toString().trim() || null,
  };
  return row;
}

function requireName(row) {
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
}
function duplicateNameError() {
  const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; return e;
}
function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(config.PATHS.manufacturers, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.manufacturers) ? parsed : { manufacturers: [] };
  } catch {
    return { manufacturers: [] };
  }
}
function jsonSave(manufacturers) {
  fs.writeFileSync(
    config.PATHS.manufacturers,
    JSON.stringify({ manufacturers }, null, 2),
    'utf-8'
  );
}

// 제품 목록을 productsRepo로 읽어 제조사별 연결 제품 수 집계(JSON 모드용).
async function countByManufacturer() {
  const products = await productsRepo.list();
  const counts = {};
  for (const p of products) {
    if (p.manufacturerId != null) {
      counts[p.manufacturerId] = (counts[p.manufacturerId] || 0) + 1;
    }
  }
  return counts;
}

async function listJson() {
  const list = jsonLoadRaw().manufacturers || [];
  const counts = await countByManufacturer();
  return list.slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(r => rowToManufacturer(r, counts[r.id] || 0));
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const row = normalizeIncoming(payload);
  requireName(row);
  if (list.some(m => (m.name || '') === row.name)) throw duplicateNameError();
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = { id: nextId, ...row, status: STATUS_ACTIVE, created_at: new Date().toISOString() };
  list.push(newRow);
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(newRow, 0);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) throw notFoundError();
  const row = normalizeIncoming(payload);
  requireName(row);
  if (list.some((m, j) => j !== idx && (m.name || '') === row.name)) throw duplicateNameError();
  list[idx] = { ...list[idx], ...row };
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(list[idx]);
}

async function setStatusJson(id, status) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) throw notFoundError();
  list[idx].status = status;
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.manufacturers = list;
  jsonSave(list);
}

// ─── Postgres 구현 ───
async function listPg() {
  // 연결 제품 수는 SQL 서브쿼리로 한 번에 집계 (제품 전체 로드 불필요)
  const { rows } = await db().query(
    `select m.*,
            (select count(*)::int from products p where p.manufacturer_id = m.id) as product_count
       from manufacturers m
      order by m.name asc`
  );
  return rows.map(r => rowToManufacturer(r, r.product_count || 0));
}

async function insertOnePg(payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  try {
    const data = await db().one(
      `insert into manufacturers (name, contact_person, contact, hurdle, schedule, memo, status)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [row.name, row.contact_person, row.contact, row.hurdle, row.schedule, row.memo, STATUS_ACTIVE]
    );
    return rowToManufacturer(data, 0);
  } catch (error) {
    if (db().isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
}

async function updateOnePg(id, payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  try {
    const r = await db().query(
      `update manufacturers
          set name = $1, contact_person = $2, contact = $3, hurdle = $4, schedule = $5, memo = $6,
              updated_at = now()
        where id = $7 returning *`,
      [row.name, row.contact_person, row.contact, row.hurdle, row.schedule, row.memo, Number(id)]
    );
    if (!r.rowCount) throw notFoundError();
    return rowToManufacturer(r.rows[0]);
  } catch (error) {
    if (db().isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
}

async function setStatusPg(id, status) {
  const r = await db().query(
    'update manufacturers set status = $1, updated_at = now() where id = $2 returning *',
    [status, Number(id)]
  );
  if (!r.rowCount) throw notFoundError();
  return rowToManufacturer(r.rows[0]);
}

async function removeOnePg(id) {
  // [요청] 연결 제품은 공용 removeOne에서 먼저 삭제됨(removeByManufacturer). 여기선 제조사만 삭제.
  await db().query('delete from manufacturers where id = $1', [Number(id)]);
}

// ─── 공용 API ───
async function list() {
  return config.USE_DB ? listPg() : listJson();
}
async function insertOne(payload) {
  return config.USE_DB ? insertOnePg(payload) : insertOneJson(payload);
}
async function updateOne(id, payload) {
  return config.USE_DB ? updateOnePg(id, payload) : updateOneJson(id, payload);
}
// [요청] 제조사 삭제 시 연결 제품도 함께 삭제 — 제품 먼저 삭제 후 제조사 삭제.
async function removeOne(id) {
  await productsRepo.removeByManufacturer(Number(id));
  return config.USE_DB ? removeOnePg(id) : removeOneJson(id);
}

// [요청] 제조사 협업종료 — 제조사 status 세팅 + 연결 제품 캐스케이드.
//   '협업종료'면 연결된 제품 status도 함께 '협업종료'로.
//   진행('')으로 복귀할 때는 제조사만 되돌리고 제품은 건드리지 않음(사용자가 개별 복귀).
async function endCollaboration(id) {
  const m = config.USE_DB ? await setStatusPg(id, STATUS_ENDED) : await setStatusJson(id, STATUS_ENDED);
  await productsRepo.setStatusByManufacturer(Number(id), STATUS_ENDED);
  return m;
}
async function reopen(id) {
  return config.USE_DB ? setStatusPg(id, STATUS_ACTIVE) : setStatusJson(id, STATUS_ACTIVE);
}

module.exports = {
  list, insertOne, updateOne, removeOne, endCollaboration, reopen,
  STATUS_ACTIVE, STATUS_ENDED,
};
