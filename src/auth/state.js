// [요청] Railway 전환 2단계 — 인증 설정 여부를 server.js와 guard.js가 공유하는 모듈.
//   "인증이 아예 구성되지 않은" 로컬 전용 운영(비밀번호 미설정 + 로그인 계정 0개)에서는
//   기존 동작대로 누구나 admin처럼 통과해야 한다 — guard.requireRole 등도 이 판단을 따라야
//   authRequired만 통과시키고 개별 admin 라우트에서 401이 나는 불일치를 막을 수 있다.
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '..', '..', 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); }
  catch { return {}; }
}

// 활성 로그인 계정 존재 여부 캐시. authRequired/guard 모두 동기 판단이 필요해 DB를 매 요청 조회하지 않는다.
let cachedHasLoginAccounts = false;

async function refreshLoginAccountsCache() {
  try {
    const employeesRepo = require('../repo/employeesRepo');
    cachedHasLoginAccounts = (await employeesRepo.countActiveLoginAccounts()) > 0;
  } catch (e) {
    console.warn('[auth] 로그인 계정 캐시 갱신 실패(이전 값 유지):', e.message);
  }
}

function hasLoginAccounts() {
  return cachedHasLoginAccounts;
}

// 인증 수단(단일 비밀번호 또는 개인 로그인 계정)이 하나라도 구성되어 있는지.
function isAuthConfigured() {
  return !!readSettings().adminPassword || cachedHasLoginAccounts;
}

// 인증 자체가 완전히 꺼져 있는 상태(로컬 전용 운영 / AUTH_DISABLED / Vercel 서버리스)인지.
//   이 경우 guard.requireRole·requirePart는 통과시켜야 authRequired와 동작이 일치한다.
function isAuthBypassed() {
  return process.env.AUTH_DISABLED === 'true' || !!process.env.VERCEL || !isAuthConfigured();
}

module.exports = { readSettings, refreshLoginAccountsCache, hasLoginAccounts, isAuthConfigured, isAuthBypassed };
