# ── Stage 1: production dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --omit=dev is the modern equivalent of --only=production
RUN npm ci --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for security (principle of least privilege)
RUN addgroup -S campusflow && adduser -S campusflow -G campusflow

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove dev/test files that should not be in the image
RUN rm -rf tests .env.example .dockerignore

# Create uploads directory owned by non-root user
RUN mkdir -p uploads && chown -R campusflow:campusflow /app

USER campusflow

EXPOSE 5000

ENV NODE_ENV=production

# Liveness probe — Docker will restart container if this fails 3 times
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
