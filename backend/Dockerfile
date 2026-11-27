# --- Build Stage ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY packages/contracts /packages/contracts
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY backend/ .
RUN npm run build

# --- Production Runner Stage ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install Playwright Chromium and system dependencies required for headless browser
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY packages/contracts /packages/contracts
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Keep the local Codex provider available inside the backend container.
RUN npm install --global @openai/codex@0.172.0

# Install Playwright browser binaries with system dependencies
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    apt-get update && \
    npx playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Copy compiled files and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/tests/fixtures/configuration-evaluation-corpus.json ./tests/fixtures/configuration-evaluation-corpus.json
COPY backend/drizzle.config.ts ./

RUN mkdir -p /tmp/scraper_jobs /home/node/.codex && \
    chown -R node:node /app /ms-playwright /tmp/scraper_jobs /home/node/.codex

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]
