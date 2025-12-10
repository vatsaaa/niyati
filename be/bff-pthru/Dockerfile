FROM node:18-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./

RUN npm ci --only=production --no-audit --no-fund || npm install --no-audit --no-fund

COPY src ./src
COPY .env.example ./

EXPOSE 3003

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
