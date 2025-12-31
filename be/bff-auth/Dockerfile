FROM node:20-alpine AS base

WORKDIR /app
# Ensure native modules can be built inside the image (python + build tools)
RUN apk add --no-cache dumb-init python3 build-base

COPY bff-auth/package*.json ./

FROM base AS development
RUN npm install
# Copy service-specific code first
COPY bff-auth/ /app/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/telemetry/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

FROM base AS production
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force
# Copy service-specific code first
COPY bff-auth/ /app/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/telemetry/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
