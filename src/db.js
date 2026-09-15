// [요청] Railway 전환 1단계 — Supabase 클라이언트 → node-postgres(pg) Pool 싱글톤
// DATABASE_URL 하나로 접속. 서버 사이드 전용(브라우저/프론트엔드로 import 금지).
//   - Railway 배포: Variables의 DATABASE_URL(내부 주소 postgres.railway.internal)
//   - 로컬 개발/이관: .env의 DATABASE_URL(Railway Postgres의 DATABASE_PUBLIC_URL 값)
require('dotenv').config();
const { Pool, types } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL이 .env(또는 Railway Variables)에 없음. ' +
    'Railway Postgres → Variables의 DATABASE_URL(서버) / DATABASE_PUBLIC_URL(로컬)을 확인하세요.'
  );
}

// ─── 타입 파서: Supabase(PostgREST)가 돌려주던 JSON 형태와 동일하게 맞춘다 ───
// date(1082): Date 객체로 바꾸면 로컬 타임존 오프셋만큼 하루가 어긋난다 → 'YYYY-MM-DD' 문자열 그대로.
types.setTypeParser(1082, v => v);
// timestamptz(1184)/timestamp(1114): Date 객체 대신 ISO 문자열(기존 코드가 문자열 비교·직렬화 전제).
types.setTypeParser(1184, v => (v == null ? v : new Date(v).toISOString()));
types.setTypeParser(1114, v => (v == null ? v : new Date(v + 'Z').toISOString()));
// int8(20): bigserial id·count(*)가 문자열로 오는 것을 숫자로.
types.setTypeParser(20, v => (v == null ? v : Number(v)));

const pool = new Pool({
  connectionString: url,
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', err => {
  // idle 커넥션이 서버 측에서 끊긴 경우 등. 프로세스가 죽지 않도록 로그만 남긴다.
  console.error('[pg] pool error:', err.message);
});

/** SQL 실행. rows 배열 등 pg Result 그대로 반환. */
async function query(text, params) {
  return pool.query(text, params);
}

/** 첫 row 또는 null. */
async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

/** 트랜잭션. fn(client)가 throw하면 rollback. */
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 다중 row INSERT 헬퍼. rows: [{col: val}], columns: 컬럼 배열(순서 고정).
 * 200건씩 끊어 실행. returning 지정 시 반환 row를 모아 돌려준다.
 * client 생략 시 pool 사용.
 */
async function insertMany(table, columns, rows, { returning = '', client = null, chunk = 200 } = {}) {
  const out = [];
  if (!rows || !rows.length) return out;
  const runner = client || pool;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const tuples = part.map(row => {
      const ph = columns.map(c => { params.push(row[c] === undefined ? null : row[c]); return `$${params.length}`; });
      return `(${ph.join(',')})`;
    });
    const sql =
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}` +
      (returning ? ` returning ${returning}` : '');
    const r = await runner.query(sql, params);
    if (returning) out.push(...r.rows);
  }
  return out;
}

/** unique 위반(23505) 여부. */
function isUniqueViolation(err) {
  return !!err && err.code === '23505';
}

module.exports = { pool, query, one, withTx, insertMany, isUniqueViolation };
