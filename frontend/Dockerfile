# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /workspace/frontend

# Install dependencies based on lockfile
COPY packages/contracts /workspace/packages/contracts
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source code and build Next.js application
COPY frontend/ .

# Accept NEXT_PUBLIC_API_URL build argument for client-side bundle
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

RUN npm run build

# --- Runner Stage (Production Lean Image) ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a non-privileged system user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone server bundle produced by Next.js
COPY --from=builder /workspace/frontend/public ./frontend/public
COPY --from=builder --chown=nextjs:nodejs /workspace/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/frontend/.next/static ./frontend/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "frontend/server.js"]
