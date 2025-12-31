FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Install only production dependencies in builder stage
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy runtime files
COPY worker.js ./

FROM node:20-alpine AS production
WORKDIR /usr/src/app

# Copy only the runtime artifacts from builder
COPY --from=builder /usr/src/app /usr/src/app

ENV NODE_ENV=production
# Install dumb-init and netcat for wait-for-db
RUN apk add --no-cache dumb-init netcat-openbsd

# Copy helper scripts
COPY scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Non-root user for better security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /usr/src/app
USER nodejs

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "worker.js"]
