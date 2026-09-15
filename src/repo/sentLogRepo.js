// [요청] Supabase 메인 DB 이전 — sent_log repo (append-only)
// [요청] sent.log 관련 설정 및 로그 전부 제거 — JSON 파일(logs/sent.log) 경로 폐기, DB 테이블만 사용
// [요청] Railway 전환 1단계 — pg(SQL) 구현으로 교체
const db = require('../db');

async function append(accountId, influencer) {
  // accountId가 "mail:1"·"dry-run" 같은 문자열일 수 있음. 정수 아니면 null로 저장.
  const n = parseInt(accountId, 10);
  const account_id = Number.isFinite(n) && String(n) === String(accountId) ? n : null;
  await db.query(
    `insert into sent_log (account_id, nickname, profile_url, product_name, sent_at)
     values ($1, $2, $3, $4, now())`,
    [account_id, influencer.nickname || null, influencer.profileUrl || null, influencer.productName || null]
  );
}

async function list() {
  const { rows } = await db.query(
    `select sent_at, account_id, nickname, profile_url, product_name
       from sent_log
      order by sent_at asc
      limit 2000`
  );
  return rows.map(r => ({
    timestamp: r.sent_at,
    accountId: r.account_id != null ? String(r.account_id) : '',
    nickname: r.nickname || '',
    profileUrl: r.profile_url || '',
    productName: r.product_name || '',
  }));
}

module.exports = { append, list };
