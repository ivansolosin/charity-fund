# =============================================================
# charity-fund — Node 20 / Express server
# - serves /public statics
# - exposes POST /api/apply (forwards to Telegram)
# - listens on $PORT (Railway injects it)
# =============================================================

FROM node:20-alpine

LABEL org.opencontainers.image.title="charity-fund"
LABEL org.opencontainers.image.description="Charity fund landing — slot-based transparent support, Telegram-backed intake"
LABEL org.opencontainers.image.source="https://github.com/ivansolosin/charity-fund"

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies first for better layer caching
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy source
COPY server.js db.js ./
COPY migrations ./migrations
COPY public ./public

# Run as non-root for safety
USER node

EXPOSE 3000

CMD ["node", "server.js"]
