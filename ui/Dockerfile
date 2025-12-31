# Multi-stage Dockerfile for Niyati UI
# Development: Vite dev server with HMR
# Production: Nginx serving optimized static assets

# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

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

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 3: Development
FROM node:20-alpine AS development

WORKDIR /app

# Install dumb-init and curl for reliable healthchecks
RUN apk add --no-cache dumb-init curl

# Copy package files and install deps
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose Vite dev server port
EXPOSE 5173

# Copy healthcheck helper and use it for clearer exit codes
COPY be/scripts/healthcheck-http.sh /usr/local/bin/healthcheck-http.sh
RUN chmod +x /usr/local/bin/healthcheck-http.sh
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "/usr/local/bin/healthcheck-http.sh http://localhost:5173"]

# Start Vite dev server with host binding for Docker
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 4: Production with Nginx
FROM nginx:alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Use existing nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
