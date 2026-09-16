// [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설 (dual-mode repo)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체
// [요청] Railway 전환 2단계 — employees를 로그인 계정으로 확장(login_id/password_hash/role/active/last_login_at)
//   + employee_parts(직원-파트 M:N, 중복 부여 가능). login_id가 없는 employee는 예전처럼 "문구 탭 전용 이름".
//   admin이 설정 > 계정 관리에서 setAccount()로 로그인ID/비번/역할을 부여하면 계정이 된다.
//   list()는 서버 내부용으로 passwordHash를 포함한다 — HTTP 응답으로 내보낼 때는 server.js가 toPublic()으로 제거한다.
//   employees: 독립 범용 직원 테이블. 지금은 phrases가 참조하지만 향후 다른 테이블에서도 재사용 예정.
//   list() / getById(id) 반환 구조: { id, name, sortOrder, createdAt, loginId, role, active, lastLoginAt, passwordHash, partIds }
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../../config');

function db() { return require('../db'); }

const EMPLOYEES_JSON = path.resolve(__dirname, '..', '..', 'employees.json');
const PHRASES_JSON = path.resolve(__dirname, '..', '..', 'phrases.json');
const BCRYPT_ROUNDS = 10;

function rowToEmployee(r) {
  return {
    id: r.id,
    name: r.name || '',
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at || null,
    // [요청] Railway 전환 2단계
    loginId: r.login_id || null,
    passwordHash: r.password_hash || null, // 내부용 — HTTP 응답 전 toPublic()으로 반드시 제거
    role: r.role || 'staff',
    active: r.active !== false,
    lastLoginAt: r.last_login_at || null,
    partIds: Array.isArray(r.part_ids) ? r.part_ids : [],
  };
}

function normalizeIncoming(payload) {
  return {
    name: (payload.name || '').toString().trim(),
    sort_order: Number.isInteger(payload.sortOrder) ? payload.sortOrder : 0,
  };
}

function requireName(row) {
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
}
function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}
function duplicateLoginIdError() {
  const e = new Error('DUPLICATE_LOGIN_ID'); e.code = 'DUPLICATE_LOGIN_ID'; return e;
}
function invalidRoleError() {
  const e = new Error('INVALID_ROLE'); e.code = 'INVALID_ROLE'; return e;
}
function lastAdminError() {
  const e = new Error('LAST_ADMIN'); e.code = 'LAST_ADMIN'; return e;
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(EMPLOYEES_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.employees) ? parsed : { employees: [] };
  } catch {
    return { employees: [] };
  }
}
function jsonSave(employees) {
  fs.writeFileSync(EMPLOYEES_JSON, JSON.stringify({ employees }, null, 2), 'utf-8');
}
// JSON 모드 저장 레코드 → repo 표준 형태(camelCase 필드가 이미 파일에 그대로 저장됨).
function jsonRowToEmployee(r) {
  return {
    id: r.id,
    name: r.name || '',
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at || null,
    loginId: r.loginId || null,
    passwordHash: r.passwordHash || null,
    role: r.role || 'staff',
    active: r.active !== false,
    lastLoginAt: r.lastLoginAt || null,
    partIds: Array.isArray(r.partIds) ? r.partIds : [],
  };
}

async function listJson() {
  const list = jsonLoadRaw().employees || [];
  return list.slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0))
    .map(jsonRowToEmployee);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const row = normalizeIncoming(payload);
  requireName(row);
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = {
    id: nextId, name: row.name, sort_order: row.sort_order, created_at: new Date().toISOString(),
    loginId: null, passwordHash: null, role: 'staff', active: true, lastLoginAt: null, partIds: [],
  };
  list.push(newRow);
  raw.employees = list;
  jsonSave(list);
  return jsonRowToEmployee(newRow);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  const row = normalizeIncoming(payload);
  requireName(row);
  list[idx] = { ...list[idx], name: row.name, sort_order: row.sort_order };
  raw.employees = list;
  jsonSave(list);
  return jsonRowToEmployee(list[idx]);
}

// JSON 모드는 FK cascade가 없으므로 해당 직원의 phrases도 직접 정리해 DB의 on delete cascade를 흉내낸다.
function cascadeDeletePhrasesJson(employeeId) {
  try {
    const raw = JSON.parse(fs.readFileSync(PHRASES_JSON, 'utf-8'));
    const list = Array.isArray(raw.phrases) ? raw.phrases : [];
    const kept = list.filter(p => Number(p.employee_id) !== Number(employeeId));
    if (kept.length !== list.length) {
      fs.writeFileSync(PHRASES_JSON, JSON.stringify({ phrases: kept }, null, 2), 'utf-8');
    }
  } catch { /* phrases.json 없으면 무시 */ }
}

function countActiveAdminsJson(list, excludeId) {
  return list.filter(r => r.role === 'admin' && r.active !== false && r.loginId && r.id !== excludeId).length;
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  if (list[idx].loginId && list[idx].role === 'admin' && countActiveAdminsJson(list, numId) === 0) {
    throw lastAdminError();
  }
  list.splice(idx, 1);
  raw.employees = list;
  jsonSave(list);
  cascadeDeletePhrasesJson(numId);
}

// [요청] Railway 전환 2단계 — 로그인 계정 부여/수정. password 없으면 기존 해시 유지.
async function setAccountJson(id, { loginId, password, role, active } = {}) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  const nextRole = role || list[idx].role || 'staff';
  if (!['admin', 'staff'].includes(nextRole)) throw invalidRoleError();
  const trimmedLoginId = loginId != null ? String(loginId).trim() : list[idx].loginId;
  if (trimmedLoginId && list.some((r, j) => j !== idx && r.loginId === trimmedLoginId)) {
    throw duplicateLoginIdError();
  }
  const nextActive = active != null ? !!active : (list[idx].active !== false);
  // 마지막 admin을 비활성화/강등하는 것 방지
  if (list[idx].role === 'admin' && list[idx].loginId && (nextRole !== 'admin' || !nextActive)) {
    if (countActiveAdminsJson(list, numId) === 0) throw lastAdminError();
  }
  list[idx] = {
    ...list[idx],
    loginId: trimmedLoginId || null,
    role: nextRole,
    active: nextActive,
    passwordHash: password ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : list[idx].passwordHash,
  };
  raw.employees = list;
  jsonSave(list);
  return jsonRowToEmployee(list[idx]);
}

async function setEmployeePartsJson(id, partIds) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  list[idx].partIds = Array.isArray(partIds) ? [...new Set(partIds.map(Number).filter(n => Number.isInteger(n)))] : [];
  raw.employees = list;
  jsonSave(list);
  return jsonRowToEmployee(list[idx]);
}

async function findByLoginIdJson(loginId) {
  const trimmed = String(loginId || '').trim();
  if (!trimmed) return null;
  const list = jsonLoadRaw().employees || [];
  const row = list.find(r => r.loginId === trimmed);
  return row ? jsonRowToEmployee(row) : null;
}

async function touchLastLoginJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const idx = list.findIndex(r => r.id === Number(id));
  if (idx === -1) return;
  list[idx].lastLoginAt = new Date().toISOString();
  raw.employees = list;
  jsonSave(list);
}

async function countActiveLoginAccountsJson() {
  const list = jsonLoadRaw().employees || [];
  return list.filter(r => r.loginId && r.active !== false).length;
}

async function createBootstrapAdminJson(loginId, password, name) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  if (list.some(r => r.loginId === loginId)) return null; // 이미 존재 — no-op
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = {
    id: nextId, name: name || 'Admin', sort_order: 0, created_at: new Date().toISOString(),
    loginId, passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS), role: 'admin', active: true,
    lastLoginAt: null, partIds: [],
  };
  list.push(newRow);
  raw.employees = list;
  jsonSave(list);
  return jsonRowToEmployee(newRow);
}

// ─── Postgres 구현 ───
const SELECT_EMPLOYEE = `
  select e.*, coalesce((select json_agg(ep.part_id) from employee_parts ep where ep.employee_id = e.id), '[]'::json) as part_ids
    from employees e`;

async function listPg() {
  const { rows } = await db().query(`${SELECT_EMPLOYEE} order by e.sort_order asc, e.id asc`);
  return rows.map(rowToEmployee);
}

async function insertOnePg(payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  const data = await db().one(
    'insert into employees (name, sort_order) values ($1, $2) returning *, \'[]\'::json as part_ids',
    [row.name, row.sort_order]
  );
  return rowToEmployee(data);
}

async function updateOnePg(id, payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  const r = await db().query(
    `update employees set name = $1, sort_order = $2 where id = $3 returning *`,
    [row.name, row.sort_order, Number(id)]
  );
  if (!r.rowCount) throw notFoundError();
  return rowToEmployee({ ...r.rows[0], part_ids: [] }); // rename 응답에 파트까지 필요 없음(목록은 별도 재조회)
}

async function countActiveAdminsPg(excludeId) {
  const { rows } = await db().query(
    `select count(*)::int as n from employees
      where role = 'admin' and active = true and login_id is not null and id <> $1`,
    [excludeId || 0]
  );
  return rows[0].n;
}

async function removeOnePg(id) {
  const numId = Number(id);
  const target = await db().one('select role, login_id from employees where id = $1', [numId]);
  if (target && target.role === 'admin' && target.login_id) {
    if ((await countActiveAdminsPg(numId)) === 0) throw lastAdminError();
  }
  // phrases.employee_id / employee_parts는 on delete cascade로 함께 삭제됨.
  await db().query('delete from employees where id = $1', [numId]);
}

// [요청] Railway 전환 2단계 — 로그인 계정 부여/수정. password 없으면 기존 해시 유지.
async function setAccountPg(id, { loginId, password, role, active } = {}) {
  const numId = Number(id);
  return db().withTx(async client => {
    const cur = await client.query('select * from employees where id = $1 for update', [numId]);
    if (!cur.rowCount) throw notFoundError();
    const target = cur.rows[0];
    const nextRole = role || target.role || 'staff';
    if (!['admin', 'staff'].includes(nextRole)) throw invalidRoleError();
    const nextLoginId = loginId != null ? String(loginId).trim() || null : target.login_id;
    const nextActive = active != null ? !!active : target.active !== false;
    if (target.role === 'admin' && target.login_id && (nextRole !== 'admin' || !nextActive)) {
      const others = await client.query(
        `select count(*)::int as n from employees
          where role = 'admin' and active = true and login_id is not null and id <> $1`,
        [numId]
      );
      if (others.rows[0].n === 0) throw lastAdminError();
    }
    const passwordHash = password ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : target.password_hash;
    try {
      const r = await client.query(
        `update employees set login_id = $1, password_hash = $2, role = $3, active = $4
          where id = $5 returning *`,
        [nextLoginId, passwordHash, nextRole, nextActive, numId]
      );
      return rowToEmployee({ ...r.rows[0], part_ids: [] });
    } catch (error) {
      if (db().isUniqueViolation(error)) throw duplicateLoginIdError();
      throw error;
    }
  });
}

async function setEmployeePartsPg(id, partIds) {
  const numId = Number(id);
  const ids = Array.isArray(partIds) ? [...new Set(partIds.map(Number).filter(n => Number.isInteger(n)))] : [];
  await db().withTx(async client => {
    const exists = await client.query('select 1 from employees where id = $1', [numId]);
    if (!exists.rowCount) throw notFoundError();
    await client.query('delete from employee_parts where employee_id = $1', [numId]);
    if (ids.length) {
      await db().insertMany('employee_parts', ['employee_id', 'part_id'],
        ids.map(pid => ({ employee_id: numId, part_id: pid })), { client });
    }
  });
  const data = await db().one(`${SELECT_EMPLOYEE} where e.id = $1`, [numId]);
  return rowToEmployee(data);
}

async function findByLoginIdPg(loginId) {
  const trimmed = String(loginId || '').trim();
  if (!trimmed) return null;
  const data = await db().one(`${SELECT_EMPLOYEE} where e.login_id = $1`, [trimmed]);
  return data ? rowToEmployee(data) : null;
}

async function touchLastLoginPg(id) {
  await db().query('update employees set last_login_at = now() where id = $1', [Number(id)]);
}

async function countActiveLoginAccountsPg() {
  const { rows } = await db().query(
    `select count(*)::int as n from employees where login_id is not null and active = true`
  );
  return rows[0].n;
}

async function createBootstrapAdminPg(loginId, password, name) {
  try {
    const data = await db().one(
      `insert into employees (name, login_id, password_hash, role, active)
       values ($1, $2, $3, 'admin', true) returning *, '[]'::json as part_ids`,
      [name || 'Admin', loginId, bcrypt.hashSync(password, BCRYPT_ROUNDS)]
    );
    return rowToEmployee(data);
  } catch (error) {
    if (db().isUniqueViolation(error)) return null; // 이미 존재 — no-op
    throw error;
  }
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
async function removeOne(id) {
  return config.USE_DB ? removeOnePg(id) : removeOneJson(id);
}
// [요청] Railway 전환 2단계
async function setAccount(id, opts) {
  return config.USE_DB ? setAccountPg(id, opts) : setAccountJson(id, opts);
}
async function setEmployeeParts(id, partIds) {
  return config.USE_DB ? setEmployeePartsPg(id, partIds) : setEmployeePartsJson(id, partIds);
}
async function findByLoginId(loginId) {
  return config.USE_DB ? findByLoginIdPg(loginId) : findByLoginIdJson(loginId);
}
async function touchLastLogin(id) {
  return config.USE_DB ? touchLastLoginPg(id) : touchLastLoginJson(id);
}
async function countActiveLoginAccounts() {
  return config.USE_DB ? countActiveLoginAccountsPg() : countActiveLoginAccountsJson();
}
// 부트스트랩: loginId가 이미 있으면 아무 것도 하지 않고 null 반환(멱등).
async function createBootstrapAdmin(loginId, password, name) {
  return config.USE_DB ? createBootstrapAdminPg(loginId, password, name) : createBootstrapAdminJson(loginId, password, name);
}
async function verifyPassword(passwordHash, password) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}
// HTTP 응답용: passwordHash 제거
function toPublic(e) {
  const { passwordHash, ...rest } = e;
  return rest;
}

module.exports = {
  list, insertOne, updateOne, removeOne,
  setAccount, setEmployeeParts, findByLoginId, touchLastLogin,
  countActiveLoginAccounts, createBootstrapAdmin, verifyPassword, toPublic,
};
