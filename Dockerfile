FROM node:20-slim

RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2 \
  python3 \
  python3-pip \
  ffmpeg \
  --no-install-recommends && \
  pip3 install --break-system-packages yt-dlp && \
  rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .
COPY infografico-marketing.html /infografico-marketing.html

EXPOSE 3000

CMD ["node", "server.js"]
