FROM node:20-alpine AS base

WORKDIR /app
# Ensure native modules can be built inside the image (python + build tools)
# Also install netcat so `wait-for-db.sh` can probe TCP ports
RUN apk add --no-cache dumb-init python3 build-base netcat-openbsd curl

# Copy shared helper scripts (once in base, inherited by all stages)
COPY scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/healthcheck-http.sh /usr/local/bin/healthcheck-http.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck-http.sh

COPY bff-auth/package*.json ./

FROM base AS development
RUN npm install
# Copy service-specific code first
COPY bff-auth/ /app/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
# FIX: Create a symlink at /commons to satisfy the "../../commons" relative import
# originating from /app/src/index.js
RUN ln -s /app/commons /commons
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:3001/api/v1/telemetry/health"]
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "dev"]

FROM base AS production
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force
# Copy service-specific code first
COPY bff-auth/ /app/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
# FIX: Create a symlink at /commons to satisfy the "../../commons" relative import
# originating from /app/src/index.js
RUN ln -s /app/commons /commons
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:3001/api/v1/telemetry/health"]
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
