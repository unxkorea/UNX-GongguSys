# [요청] Railway가 Root Directory(apps/public/recommend) 안에서 이 Dockerfile을 자동 감지하도록 함.
#   Config as Code(railway.json)는 신규 서비스에 더 이상 opt-in 불가(2026-08-28부터)라 이 방식으로 대체.
#   메인 앱의 Dockerfile과 달리 Playwright/Chromium이 전혀 필요 없어 훨씬 가볍다.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
