# [요청] Railway 전체 이관 — 인포크+메일 발송을 Railway에서 구동 (headless 크롬)
# Playwright 공식 이미지 — 크롬 + 시스템 라이브러리 미리 포함
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# 소스 복사
COPY package*.json ./
COPY . .

# 의존성 설치 (package-lock.json 기반 정확한 버전)
RUN npm ci --omit=dev

# 환경 설정
ENV NODE_ENV=production
# [요청] Railway에서는 크롬 다운로드 필요 (로컬과 달리 Dockerfile 빌드 시 설치)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

EXPOSE 3000

# 서버 시작 (server.js가 config.HEADLESS 플래그로 headless 크롬 제어)
CMD ["node", "server.js"]
