// [요청] Railway 전환 1단계 — scripts/schema.pg.sql을 DATABASE_URL의 Postgres에 적용
// 사용법: node scripts/applySchemaPg.js
//   멱등(IF NOT EXISTS / OR REPLACE)이라 여러 번 실행해도 안전. 한 트랜잭션으로 실행되어 중간 실패 시 전체 롤백.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, withTx } = require('../src/db');

async function main() {
  const sqlPath = path.resolve(__dirname, 'schema.pg.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[schema] ${sqlPath} 적용 중...`);
  await withTx(async client => {
    await client.query(sql);
  });
  const { rows } = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  );
  console.log(`[schema] 완료. 테이블 ${rows.length}개: ${rows.map(r => r.table_name).join(', ')}`);
  const fn = await pool.query(
    `select routine_name from information_schema.routines
      where routine_schema = 'public' and routine_type = 'FUNCTION' order by routine_name`
  );
  console.log(`[schema] 함수 ${fn.rows.length}개: ${fn.rows.map(r => r.routine_name).join(', ')}`);
}

main()
  .catch(e => { console.error('[schema] 실패:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
