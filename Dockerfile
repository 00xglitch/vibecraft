# Vibecraft Docker Image
# Multi-stage build for optimized production image

# =============================================================================
# Build Stage
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build server and client
RUN pnpm run build

# =============================================================================
# Production Stage
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm for production
RUN npm install -g pnpm

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies only (skip prepare script which needs husky)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Create data directory
RUN mkdir -p /data

# Environment defaults (can be overridden at runtime)
ENV NODE_ENV=production
ENV VIBECRAFT_PORT=4003
ENV VIBECRAFT_DATA_DIR=/data
ENV VIBECRAFT_EVENTS_FILE=/data/events.jsonl
ENV VIBECRAFT_SESSIONS_FILE=/data/sessions.json

# Expose the server port
EXPOSE 4003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:4003/health || exit 1

# Run the server
CMD ["node", "dist/server/server/index.js"]
