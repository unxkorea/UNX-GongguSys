# [요청] Railway 전체 이관 — 인포크+메일 발송을 Railway에서 headless 크롬으로 구동
#
# Playwright 공식 이미지(mcr.microsoft.com/playwright:vX.Y.Z) 대신 node 베이스 + 런타임 설치를 쓰는 이유:
#   공식 이미지는 브라우저 리비전이 태그 버전에 고정되어 있어, package-lock의 playwright 버전과
#   어긋나면 배포는 성공하고 발송 시점에만 "Executable doesn't exist" 로 죽는다.
#   아래 방식은 npm ci로 설치된 playwright가 요구하는 브라우저를 그대로 받으므로 버전 드리프트가 없다.
FROM node:20-bookworm-slim

WORKDIR /app

# 의존성 먼저 설치 — 소스만 바뀐 재배포에서 이 레이어를 캐시로 재사용
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 크로미움 + 구동에 필요한 시스템 라이브러리 (인포크 발송 경로는 chromium만 사용)
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
# [요청] 서버 환경이므로 headless 고정. settings.json의 headless=false(로컬 기본값)를 덮어쓴다.
#   Railway Variables에서 HEADLESS_MODE를 설정하면 그 값이 이 기본값보다 우선한다.
ENV HEADLESS_MODE=true

EXPOSE 3000

CMD ["node", "server.js"]
