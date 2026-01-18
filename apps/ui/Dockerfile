# Multi-stage Dockerfile for Niyati UI
# Development: Vite dev server with HMR
# Production: Nginx serving optimized static assets

# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files from the UI folder (build context is project root)
# ensure we install the UI's dependencies, not the monorepo root ones
COPY apps/ui/package*.json ./

# Install dependencies
RUN npm ci

# Stage 2: Builder (for production)
FROM deps AS builder

# Set production environment for optimized build
ENV NODE_ENV=production

# Accept build-time arguments for Vite env vars (VITE_* are baked into the bundle)
ARG VITE_BFF_BASE_URL=""
ARG VITE_N8N_WEBHOOK_URL
ARG VITE_APP_VERSION="0.1.0"
ARG VITE_DEBUG_MODE="false"
ARG VITE_VERBOSE_LOGGING="false"

# Set them as environment variables for the build
ENV VITE_BFF_BASE_URL=$VITE_BFF_BASE_URL
ENV VITE_N8N_WEBHOOK_URL=$VITE_N8N_WEBHOOK_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_DEBUG_MODE=$VITE_DEBUG_MODE
ENV VITE_VERBOSE_LOGGING=$VITE_VERBOSE_LOGGING

# Copy only UI source and config files (avoid copying repo root which contains
# a root package.json that would override the UI package.json and run repo-level scripts)
COPY apps/ui/package*.json ./
COPY apps/ui/src ./src
COPY apps/ui/public ./public
COPY apps/ui/index.html ./
COPY apps/ui/vite.config.js ./
COPY apps/ui/tailwind.config.js ./
COPY apps/ui/postcss.config.js ./
COPY apps/ui/eslint.config.js ./

# Build the application
RUN npm run build

# Stage 3: Development
FROM node:20-alpine AS development

WORKDIR /app

# Install dumb-init and curl for reliable healthchecks
RUN apk add --no-cache dumb-init curl

# Copy package files for the development stage and install deps
# when build context is the repo root we must reference the apps/ui/package.json
COPY apps/ui/package*.json ./
RUN npm install

# Copy only the UI source code (NOT the entire repo which would overwrite package.json)
COPY apps/ui/src ./src
COPY apps/ui/public ./public
COPY apps/ui/index.html ./
COPY apps/ui/vite.config.js ./
COPY apps/ui/tailwind.config.js ./
COPY apps/ui/postcss.config.js ./
COPY apps/ui/eslint.config.js ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose Vite dev server port
EXPOSE 5173

# Simple healthcheck using curl (no external script needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5173 || exit 1

# Start Vite dev server with host binding for Docker
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 4: Production - output built assets to shared volume
# Caddy will serve these directly
FROM alpine:3.19 AS production

# Install su-exec for dropping privileges after setup
RUN apk add --no-cache su-exec

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built assets from builder stage to a staging location
COPY --from=builder --chown=nodejs:nodejs /app/dist /app/dist-source

# Create entrypoint: run as root to fix volume permissions, then drop to nodejs user
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -eu' >> /entrypoint.sh && \
    echo 'mkdir -p /app/dist' >> /entrypoint.sh && \
    echo 'chown -R nodejs:nodejs /app/dist' >> /entrypoint.sh && \
    echo 'exec su-exec nodejs sh -c "cp -r /app/dist-source/* /app/dist/ && echo UI files copied to shared volume && tail -f /dev/null"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Entrypoint starts as root (for chown), then drops to nodejs via su-exec
# The /app/dist directory will be mounted as a volume
CMD ["/entrypoint.sh"]
