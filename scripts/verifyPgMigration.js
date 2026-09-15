// [요청] Railway 전환 1단계 — 이관 검증: Supabase(원본) vs Postgres(대상) 건수 비교 + FK 고아 + 시퀀스 상태
// 사용법: node scripts/verifyPgMigration.js
//   SUPABASE_* 가 .env에 없으면 원본 비교는 건너뛰고 대상 DB 자체 점검만 수행.
require('dotenv').config();
const { pool } = require('../src/db');

const TABLES = [
  'accounts', 'weekly_tracking', 'email_accounts', 'manufacturers', 'products', 'product_photos',
  'influencers', 'sent_log', 'reply_runs', 'replies', 'leads', 'catalogs', 'employees', 'phrases',
  'settings', 'cafe24_tokens',
];

// [자식 테이블, FK 컬럼, 부모 테이블] — 고아 row 검사
const FKS = [
  ['weekly_tracking', 'account_id', 'accounts'],
  ['product_photos', 'product_id', 'products'],
  ['products', 'manufacturer_id', 'manufacturers'],
  ['replies', 'run_id', 'reply_runs'],
  ['phrases', 'employee_id', 'employees'],
  ['catalogs', 'lead_id', 'leads'],
  ['sent_log', 'account_id', 'accounts'],
];

async function supabaseCounts() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    out[t] = error ? null : count;
  }
  return out;
}

async function main() {
  let ok = true;
  const src = await supabaseCounts();

  console.log('── 건수 비교 (원본 Supabase → 대상 Postgres)');
  for (const t of TABLES) {
    const { rows } = await pool.query(`select count(*)::int as n from ${t}`);
    const dst = rows[0].n;
    const s = src ? src[t] : undefined;
    const mark = src == null ? '  ' : (s === dst ? 'OK' : (s == null ? '--' : 'NG'));
    if (mark === 'NG') ok = false;
    console.log(`  ${mark} ${t.padEnd(16)} ${src ? String(s ?? '없음').padStart(6) + ' → ' : ''}${String(dst).padStart(6)}`);
  }

  console.log('── FK 고아 검사');
  for (const [child, col, parent] of FKS) {
    const { rows } = await pool.query(
      `select count(*)::int as n from ${child} c
        where c.${col} is not null and not exists (select 1 from ${parent} p where p.id = c.${col})`);
    const n = rows[0].n;
    if (n > 0) ok = false;
    console.log(`  ${n ? 'NG' : 'OK'} ${child}.${col} → ${parent}: 고아 ${n}건`);
  }

  console.log('── 시퀀스 상태 (last_value ≥ max(id) 여야 다음 insert가 충돌 안 남)');
  const { rows: seqs } = await pool.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_default like 'nextval(%' order by table_name`);
  for (const { table_name, column_name } of seqs) {
    const seq = (await pool.query('select pg_get_serial_sequence($1, $2) as s', [table_name, column_name])).rows[0].s;
    // is_called=false면 다음 nextval이 last_value 자체를 돌려주므로 "다음 값"으로 비교
    const s = (await pool.query(`select last_value, is_called from ${seq}`)).rows[0];
    const nextVal = Number(s.last_value) + (s.is_called ? 1 : 0);
    const maxId = Number((await pool.query(`select coalesce(max(${column_name}), 0) as m from ${table_name}`)).rows[0].m);
    const good = nextVal > maxId;
    if (!good) ok = false;
    console.log(`  ${good ? 'OK' : 'NG'} ${table_name}.${column_name}: max=${maxId} next=${nextVal}`);
  }

  console.log(ok ? '\n검증 통과' : '\n검증 실패 항목 있음 (NG 확인)');
  if (!ok) process.exitCode = 1;
}

main()
  .catch(e => { console.error('[검증] 실패:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
