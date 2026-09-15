// [요청] Railway 전환 1단계 — Supabase → Railway Postgres 데이터 이관
// 사용법:
//   node scripts/migrateSupabaseToPg.js            # 대상 테이블이 전부 비어 있을 때만 진행 (안전 모드)
//   node scripts/migrateSupabaseToPg.js --force    # 대상 테이블을 비우고 재삽입 (멱등, 컷오버 직전 재실행용)
//   node scripts/migrateSupabaseToPg.js --dry-run  # 읽기만 하고 건수 출력
// 전제: .env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (원본) + DATABASE_URL (대상, Railway DATABASE_PUBLIC_URL) 모두 필요.
//       대상 DB에는 scripts/applySchemaPg.js 로 스키마가 먼저 적용되어 있어야 한다.
// 동작:
//   - 테이블을 FK 순서로 읽어 id를 그대로 보존해 insert
//   - 대상 테이블에 실제 존재하는 컬럼만 골라 넣음 (원본에만 있는 컬럼은 무시, 대상에만 있는 컬럼은 default)
//   - 마지막에 serial 시퀀스를 max(id)로 맞춤 (이후 insert가 PK 충돌 나지 않도록)
//   - 사진 URL(product_photos.url, email_accounts.signature_image_url)은 Supabase 공개 URL 그대로 복사 (4단계에서 치환)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { pool, withTx } = require('../src/db');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env에 없음 (원본 DB 접속 정보).');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// FK 순서. orderBy는 Supabase 페이지네이션 안정성용 정렬 키.
const TABLES = [
  { name: 'accounts',        orderBy: 'id' },
  { name: 'weekly_tracking', orderBy: 'account_id' },
  { name: 'email_accounts',  orderBy: 'id' },
  { name: 'manufacturers',   orderBy: 'id' },
  { name: 'products',        orderBy: 'id' },
  { name: 'product_photos',  orderBy: 'id' },
  { name: 'influencers',     orderBy: 'id' },
  { name: 'sent_log',        orderBy: 'id' },
  { name: 'reply_runs',      orderBy: 'started_at' },
  { name: 'replies',         orderBy: 'id' },
  { name: 'leads',           orderBy: 'id' },
  { name: 'catalogs',        orderBy: 'id' },
  { name: 'employees',       orderBy: 'id' },
  { name: 'phrases',         orderBy: 'id' },
  { name: 'settings',        orderBy: 'key' },
  { name: 'cafe24_tokens',   orderBy: 'mall_id' },
];
const PAGE = 1000;

async function fetchAll(table, orderBy) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select('*').order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      // 원본에 없는 테이블(예: 아직 안 만든 cafe24_tokens)은 빈 배열로 처리
      if (/does not exist|relation|not find/i.test(error.message)) {
        console.warn(`  ! ${table}: 원본에 테이블 없음 → 0건으로 처리 (${error.message})`);
        return [];
      }
      throw new Error(`${table} 읽기 실패: ${error.message}`);
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function targetColumns(client, table) {
  const { rows } = await client.query(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table]);
  return rows;
}

// pg 파라미터로 넘길 값 정규화: jsonb는 문자열화, 배열은 그대로(pg가 text[]로 변환)
function toParam(value, dataType) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(value);
  return value;
}

async function insertRows(client, table, cols, rows) {
  const names = cols.map(c => c.column_name);
  const CHUNK = 200;
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = part.map(row => {
      const ph = cols.map(c => {
        params.push(toParam(row[c.column_name], c.data_type));
        return `$${params.length}` + (c.data_type === 'jsonb' ? '::jsonb' : '');
      });
      return `(${ph.join(',')})`;
    });
    const r = await client.query(
      `insert into ${table} (${names.join(',')}) values ${tuples.join(',')}`, params);
    n += r.rowCount;
  }
  return n;
}

async function resetSequences(client) {
  const { rows } = await client.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public' and column_default like 'nextval(%'`
  );
  for (const { table_name, column_name } of rows) {
    await client.query(
      `select setval(pg_get_serial_sequence($1, $2),
                     coalesce((select max(${column_name}) from ${table_name}), 0) + 1, false)`,
      [table_name, column_name]);
  }
  return rows.length;
}

async function main() {
  console.log(`[이관] Supabase → Postgres  모드: ${DRY_RUN ? 'DRY-RUN' : FORCE ? 'FORCE(비우고 재삽입)' : '안전(비어있을 때만)'}`);

  // 1) 원본 전량 읽기
  const source = {};
  for (const t of TABLES) {
    source[t.name] = await fetchAll(t.name, t.orderBy);
    console.log(`  읽기 ${t.name.padEnd(16)} ${String(source[t.name].length).padStart(6)}건`);
  }
  if (DRY_RUN) { console.log('[이관] dry-run 종료.'); return; }

  // 2) 대상 검사 + 삽입 (단일 트랜잭션: 실패 시 전체 롤백)
  await withTx(async client => {
    const existing = new Set((await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`)).rows.map(r => r.table_name));
    const targets = TABLES.filter(t => existing.has(t.name));
    const missing = TABLES.filter(t => !existing.has(t.name)).map(t => t.name);
    if (missing.length) throw new Error(`대상 DB에 테이블 없음: ${missing.join(', ')} — 먼저 node scripts/applySchemaPg.js 실행`);

    if (FORCE) {
      // 역순 truncate (cascade라 순서 무관하지만 로그 가독성)
      await client.query(`truncate table ${targets.map(t => t.name).reverse().join(', ')} restart identity cascade`);
      console.log('  대상 테이블 비움 (truncate ... restart identity cascade)');
    } else {
      for (const t of targets) {
        const { rows } = await client.query(`select count(*)::int as n from ${t.name}`);
        if (rows[0].n > 0) {
          throw new Error(`대상 테이블 ${t.name}에 이미 ${rows[0].n}건 있음. 비우고 재삽입하려면 --force`);
        }
      }
    }

    for (const t of targets) {
      const rows = source[t.name];
      if (!rows.length) { console.log(`  삽입 ${t.name.padEnd(16)}      0건`); continue; }
      const cols = await targetColumns(client, t.name);
      const srcKeys = new Set(Object.keys(rows[0]));
      const usable = cols.filter(c => srcKeys.has(c.column_name));
      const skipped = [...srcKeys].filter(k => !cols.some(c => c.column_name === k));
      const n = await insertRows(client, t.name, usable, rows);
      console.log(`  삽입 ${t.name.padEnd(16)} ${String(n).padStart(6)}건` +
        (skipped.length ? `  (원본 전용 컬럼 무시: ${skipped.join(', ')})` : ''));
    }

    const seqs = await resetSequences(client);
    console.log(`  시퀀스 ${seqs}개 재설정`);
  });

  console.log('[이관] 완료. 검증: node scripts/verifyPgMigration.js');
}

main()
  .catch(e => { console.error('[이관] 실패 (롤백됨):', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
