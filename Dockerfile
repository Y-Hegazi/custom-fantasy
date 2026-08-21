# ==============================================================================
# Stage 1: Build & Typecheck Artifacts
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install clean production and development dependencies
RUN npm ci

# Copy full application source code
COPY . .

# Run strict TypeScript verification and production bundle compilation
RUN npm run typecheck && npm run build

# ==============================================================================
# Stage 2: Minimal Secure Production Runtime
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built assets, dependencies, and server runtime from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Enterprise security: Run as non-privileged user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Start containerized service
CMD ["node", "server.js"]
