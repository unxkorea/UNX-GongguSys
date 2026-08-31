const config = require('../config');
const selectors = require('./selectors');

// [요청] 답장확인 로그인 실패 잦음 수정 — admin 페이지는 sendbird 폴링 등 백그라운드 요청이 계속 있어
//        'networkidle'에 도달하지 못하고 타임아웃 → 성공한 로그인을 실패로 오판하던 문제.
//        완료 판정을 'load' + waitForURL로 변경하고, "이미 로그인됨" 감지를 추가.

// [요청] 현재 admin 영역에 들어와 있으면 로그인된 상태로 판정
function isLoggedIn(page) {
  return page.url().includes('/admin');
}

// [요청] 규약(캐시 비우기 + 새로고침) 유지 — 완료 대기만 networkidle → load로 변경
async function clearCacheAndReload(page) {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send('Network.clearBrowserCache');
    await client.detach();
  } catch {}
  await page.reload({ waitUntil: 'load', timeout: config.NAVIGATION_TIMEOUT });
}

async function attemptLogin(page, account) {
  await page.goto(selectors.login.pageUrl, {
    waitUntil: 'load',
    timeout: config.NAVIGATION_TIMEOUT,
  });

  await page.waitForSelector(selectors.login.usernameInput, { timeout: 10000 });
  await page.fill(selectors.login.usernameInput, account.username);
  await page.fill(selectors.login.passwordInput, account.password);
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: '인포크비즈니스 로그인' }).click();
  // [요청] networkidle 대기 대신 admin URL 진입을 성공 기준으로 사용
  await page.waitForURL('**/admin/**', { waitUntil: 'load', timeout: config.NAVIGATION_TIMEOUT });
}

/**
 * 인포크비즈니스 로그인
 */
async function login(page, account) {
  const tag = `[${account.username}]`;
  console.log(`${tag} [로그인] 로그인 시도...`);

  try {
    await attemptLogin(page, account);
    console.log(`${tag} [로그인] 로그인 성공!`);

    await clearCacheAndReload(page);
    console.log(`${tag} [로그인] 캐시 비우기 + 새로고침 완료`);

    return true;
  } catch (error) {
    console.error(`${tag} [로그인 실패] ${error.message}`);

    // [요청] 로그인은 됐는데 완료 대기만 초과한 경우 → 실패로 오판하지 않고 성공 처리
    if (isLoggedIn(page)) {
      console.log(`${tag} [로그인] 이미 로그인된 상태 감지 → 성공 처리`);
      await clearCacheAndReload(page).catch(() => {});
      return true;
    }

    console.log(`${tag} [로그인] 새로고침 후 재시도...`);

    try {
      await page.reload({ waitUntil: 'load', timeout: config.NAVIGATION_TIMEOUT }).catch(() => {});
      await attemptLogin(page, account);
      console.log(`${tag} [로그인] 재시도 성공!`);
      await clearCacheAndReload(page).catch(() => {});
      return true;
    } catch (retryError) {
      // [요청] 재시도 중에도 admin에 들어와 있으면 성공 처리 (로그인 페이지가 admin으로 리다이렉트된 케이스)
      if (isLoggedIn(page)) {
        console.log(`${tag} [로그인] 재시도 중 로그인 상태 감지 → 성공 처리`);
        return true;
      }
      console.error(`${tag} [로그인 재시도 실패] ${retryError.message}`);
      return false;
    }
  }
}

/**
 * 인포크비즈니스 로그아웃
 */
async function logout(page, accountName = '') {
  const tag = `[${accountName}]`;
  console.log(`${tag} [로그아웃] 로그아웃 시도...`);

  try {
    // [요청] admin 페이지는 networkidle 미도달 → 'load'로 변경
    await page.goto(selectors.logout.adminPageUrl, {
      waitUntil: 'load',
      timeout: config.NAVIGATION_TIMEOUT,
    });
    await page.waitForTimeout(1000);

    // 팝업 모달 닫기 ("오늘 그만 보기")
    try {
      const modalBtn = page.getByRole('button', { name: '오늘 그만 보기' });
      await modalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await modalBtn.click();
      console.log(`${tag} [로그아웃] 팝업 모달 닫기 완료`);
      await page.waitForTimeout(500);
    } catch {
      // 모달 안 뜨면 무시
    }

    // 드롭다운 영역 클릭
    await page.locator('div.css-ns5dcw').first().click();
    await page.waitForTimeout(500);

    // "로그아웃" 메뉴 클릭
    await page.getByText('로그아웃', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // 확인 다이얼로그 - "로그아웃" 버튼 클릭
    await page.locator('div.dialog button').getByText('로그아웃').click();

    await page.waitForTimeout(1000);
    console.log(`${tag} [로그아웃] 로그아웃 성공!`);

    // 캐시 비우고 로그인 페이지 새로고침
    await page.context().clearCookies();
    await page.context().clearPermissions();
    await page.goto(selectors.login.pageUrl, {
      waitUntil: 'load',
      timeout: config.NAVIGATION_TIMEOUT,
    });
    await page.reload({ waitUntil: 'load', timeout: config.NAVIGATION_TIMEOUT });
    console.log(`${tag} [로그아웃] 캐시 비우기 + 로그인 페이지 새로고침 완료`);

  } catch (error) {
    console.error(`${tag} [로그아웃 실패] ${error.message}`);
    await page.context().clearCookies();
    await page.goto(selectors.login.pageUrl, {
      waitUntil: 'load',
      timeout: config.NAVIGATION_TIMEOUT,
    }).catch(() => {});
    console.log(`${tag} [로그아웃] 쿠키 삭제 + 로그인 페이지 이동 완료`);
  }
}

module.exports = { login, logout };
