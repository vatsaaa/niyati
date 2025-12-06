# Multi-stage Dockerfile for Niyati BFF
# Optimized for both development and production environments

# Stage 1: Base dependencies
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Stage 2: Development dependencies
FROM base AS development

# Install all dependencies (including dev)
RUN npm install

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/telemetry/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default to dev mode (can be overridden in docker-compose)
CMD ["npm", "run", "dev"]

# Stage 3: Production build
FROM base AS production

# Set NODE_ENV
ENV NODE_ENV=production

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/telemetry/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with dumb-init
ENTRYPOINT ["dumb-init", "--"]

# Production start command
CMD ["npm", "start"]
