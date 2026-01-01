FROM node:20-alpine AS base

WORKDIR /app
# Install dumb-init, netcat and PostgreSQL client for wait-for-db functionality
RUN apk add --no-cache dumb-init netcat-openbsd curl postgresql-client

# Copy shared helper scripts (once in base, inherited by all stages)
COPY scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/healthcheck-http.sh /usr/local/bin/healthcheck-http.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck-http.sh

COPY bff-platform/package*.json ./

FROM base AS development
RUN npm install
# Copy service-specific code first
COPY bff-platform/ /app/
# Copy scripts for migrations
COPY scripts/ /app/scripts/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
# FIX: Create a symlink at /commons to satisfy the "../../commons" relative import
# originating from /app/src/index.js
RUN ln -s /app/commons /commons
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:3000/api/v1/telemetry/health"]
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "dev"]

FROM base AS production
ENV NODE_ENV=production
RUN npm ci --only=production && npm cache clean --force
# Copy service-specific code first
COPY bff-platform/ /app/
# Copy scripts for migrations
COPY scripts/ /app/scripts/
# Copy commons (shared libraries) afterwards so repository commons wins
COPY commons/ /app/commons/
# FIX: Create a symlink at /commons to satisfy the "../../commons" relative import
# originating from /app/src/index.js
RUN ln -s /app/commons /commons
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:3000/api/v1/telemetry/health"]
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
