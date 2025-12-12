FROM node:18-alpine

WORKDIR /usr/src/app

# Copy commons module first (dependency)
COPY commons ../commons

# Copy package files
COPY bff-pthru/package.json bff-pthru/package-lock.json* ./

# Install dependencies (commons is a file: dependency)
RUN npm ci --only=production --no-audit --no-fund || npm install --no-audit --no-fund

# Copy source
COPY bff-pthru/src ./src

EXPOSE 3003

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
