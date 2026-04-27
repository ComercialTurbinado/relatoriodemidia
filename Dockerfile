FROM node:20-slim

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --production

COPY backend/ .
COPY infografico-marketing.html ./infografico-marketing.html

EXPOSE 3000

CMD ["node", "server.js"]
