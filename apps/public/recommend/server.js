// [요청] 제품추천 공개 앱 분리 — apps/public/recommend
//   메인 관리 시스템(UNX-GongguSys)과 완전히 분리된 독립 Express 앱. 이 앱에는 관리자 화면·API가
//   전혀 없고(라우트를 아예 정의하지 않음), 정의되지 않은 모든 경로는 맨 아래 catch-all이 404로 응답한다.
//   데이터는 메인 앱의 DB/파일서버에 직접 붙지 않고, 서버 간 인증이 걸린 내부 API
//   (MAIN_APP_URL + /internal/api/catalogs/:code, 헤더 X-Internal-Key)로만 가져온다.
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAIN_APP_URL = (process.env.MAIN_APP_URL || '').replace(/\/+$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// [요청] 예전 public/recommend/vercel.json의 헤더 정책을 그대로 재현
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// [요청] 예전 vercel.json의 '/c/:code' → '/index.html?c=:code' rewrite와 동일한 동작(리다이렉트로 대체)
app.get('/c/:code', (req, res) => {
  res.redirect(302, '/?c=' + encodeURIComponent(req.params.code));
});

// 브라우저가 부르는 유일한 API. 서버 쪽에서 메인 앱의 내부 API를 대신 호출해 결과만 중계한다 —
// 브라우저는 메인 앱 주소도, INTERNAL_API_KEY도 절대 알 수 없다.
app.get('/api/catalog/:code', async (req, res) => {
  if (!MAIN_APP_URL || !INTERNAL_API_KEY) {
    console.error('[gonggu-recommend] MAIN_APP_URL/INTERNAL_API_KEY 미설정');
    return res.status(500).json({ error: 'server_misconfigured' });
  }
  try {
    const upstream = await fetch(
      `${MAIN_APP_URL}/internal/api/catalogs/${encodeURIComponent(req.params.code)}`,
      { headers: { 'X-Internal-Key': INTERNAL_API_KEY }, cache: 'no-store' }
    );
    if (upstream.status === 404) return res.status(404).json({ error: 'not_found' });
    if (!upstream.ok) throw new Error('upstream HTTP ' + upstream.status);
    const data = await upstream.json();
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('[gonggu-recommend] catalog fetch 실패:', e.message);
    res.status(502).json({ error: 'upstream_unavailable' });
  }
});

// [요청] 관리자 화면·API는 이 앱에 없음 — 정의되지 않은 모든 경로는 상세 정보 없이 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, () => {
  console.log(`[gonggu-recommend] listening on ${PORT}`);
});
