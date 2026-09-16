// [요청] Railway 전환 2단계 — 권한 미들웨어 (admin / staff·파트)
//   세션에 로그인 시 심어둔 role/parts를 기준으로 판단한다. 레거시 단일 비밀번호 로그인(전환기 지원,
//   employeeId 없이 authenticated=true만 세팅됨)은 role='admin'으로 간주해 기존 동작을 그대로 유지한다.
const authState = require('./state');

function currentUser(req) {
  const s = req.session || {};
  if (!s.authenticated) return null;
  return {
    employeeId: s.employeeId != null ? s.employeeId : null,
    loginId: s.loginId || null,
    name: s.name || null,
    role: s.role || 'admin', // 레거시 세션 기본값 — settings.adminPassword로 들어온 세션
    parts: Array.isArray(s.parts) ? s.parts : [],
  };
}

function isAdmin(req) {
  const u = currentUser(req);
  return !!u && u.role === 'admin';
}

// role이 'admin'이면 무엇이든 통과. 그 외엔 지정한 role과 정확히 일치해야 함.
// 인증이 아예 구성되지 않은 상태(로컬 전용 운영 등)에서는 authRequired와 동일하게 전부 통과.
function requireRole(role) {
  return (req, res, next) => {
    if (authState.isAuthBypassed()) return next();
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'auth_required' });
    if (u.role === 'admin' || u.role === role) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

// admin은 모든 파트 통과. staff는 세션에 해당 파트 code가 있어야 통과.
function requirePart(code) {
  return (req, res, next) => {
    if (authState.isAuthBypassed()) return next();
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'auth_required' });
    if (u.role === 'admin' || u.parts.includes(code)) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

module.exports = { currentUser, isAdmin, requireRole, requirePart };
