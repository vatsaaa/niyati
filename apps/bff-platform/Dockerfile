FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init curl python3 build-base postgresql-client

# Replicate monorepo structure for workspace resolution
COPY packages/commons packages/commons
RUN cd packages/commons && npm install


# Setup service in nested directory
WORKDIR /app/apps/bff-platform
COPY apps/bff-platform/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/bff-platform .
COPY scripts/ ./scripts/

# Copy utility scripts
COPY scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/healthcheck-http.sh /usr/local/bin/healthcheck-http.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck-http.sh

FROM base AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:3000/api/v1/telemetry/health"]
ENV NODE_ENV=production
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
