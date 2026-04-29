# =============================================================
# charity-fund — Node 20 + Express + better-sqlite3
# Multi-stage build:
#   1) deps: install dependencies with build toolchain (better-sqlite3 is native)
#   2) runtime: small image with only node_modules + source
# =============================================================

# ---- Stage 1: deps ----
FROM node:20-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- Stage 2: runtime ----
FROM node:20-alpine

LABEL org.opencontainers.image.title="charity-fund"
LABEL org.opencontainers.image.description="Charity fund landing — Telegram + SQLite intake & admin"
LABEL org.opencontainers.image.source="https://github.com/ivansolosin/charity-fund"

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy dependencies (already-built native modules from deps stage)
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# App source
COPY --chown=node:node package.json server.js db.js ./
COPY --chown=node:node public ./public

# SQLite data directory (mount Railway Volume here for persistence)
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "server.js"]
