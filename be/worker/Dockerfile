FROM node:20-alpine
WORKDIR /usr/src/app

# copy package.json first to leverage docker cache
COPY package.json ./
RUN npm ci --only=production

COPY worker.js ./

ENV NODE_ENV=production

CMD ["node", "worker.js"]
