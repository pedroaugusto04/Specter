#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-.deploy/backend.env}"
DEFAULT_PORT="${2:-3001}"

mkdir -p "$(dirname "$OUTPUT_FILE")"
> "$OUTPUT_FILE"

write_kv() {
  local key="$1"
  local value="${2-}"
  printf '%s=%s\n' "$key" "$value" >> "$OUTPUT_FILE"
}

write_kv NODE_ENV "production"
write_kv PORT "${APP_PORT:-$DEFAULT_PORT}"
write_kv HOST "${HOST:-0.0.0.0}"

# Production defaults for Dynamic-Scrapper
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-dynamic_scrapper}"
DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}"
REDIS_URL="${REDIS_URL:-redis://redis:6379}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
CORS_ORIGIN="${CORS_ORIGIN:-https://specterdev.online,http://specterdev.online,https://www.specterdev.online,http://www.specterdev.online,https://pedro-duarte.ddns.net,http://pedro-duarte.ddns.net,https://pedro-duarte.servehttp.com,http://pedro-duarte.servehttp.com}"
COMPILER_PROVIDER="${COMPILER_PROVIDER:-agy}"
NOTIFICATION_PROVIDER="${NOTIFICATION_PROVIDER:-console}"
NOTIFICATION_FROM_EMAIL="${NOTIFICATION_FROM_EMAIL:-onboarding@resend.dev}"
RESEND_API_KEY="${RESEND_API_KEY:-}"
LOG_LEVEL="${LOG_LEVEL:-info}"
SCRAPER_ENGINE="${SCRAPER_ENGINE:-playwright}"

# Guardrail: If NOTIFICATION_PROVIDER is resend but RESEND_API_KEY is not provided,
# warn and safely fall back to console to prevent container boot crash loops.
if [ "$NOTIFICATION_PROVIDER" = "resend" ] && [ -z "${RESEND_API_KEY:-}" ]; then
  echo "⚠️ AVISO: NOTIFICATION_PROVIDER está definido como 'resend', mas RESEND_API_KEY não foi configurada."
  echo "   Revertendo NOTIFICATION_PROVIDER para 'console' para garantir inicialização segura do backend."
  NOTIFICATION_PROVIDER="console"
fi

keys=(
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  DATABASE_URL
  REDIS_URL
  REDIS_HOST
  REDIS_PORT
  CORS_ORIGIN
  LOG_LEVEL
  COMPILER_PROVIDER
  AGY_CLI_PATH
  CODEX_CLI_PATH
  OPENAI_API_KEY
  OPENAI_MODEL
  COMPILER_TEMP_DIR
  COMPILER_TIMEOUT_MS
  COMPILER_CONCURRENCY
  SCRAPER_ENGINE
  SCRAPER_CONCURRENCY
  PLAYWRIGHT_TIMEOUT_MS
  MIN_CRON_INTERVAL_MINUTES
  CONSECUTIVE_FAILURES_FOR_HEALING
  MAX_HEALING_RETRIES
  RETENTION_DAYS_UNCHANGED
  NOTIFICATION_PROVIDER
  RESEND_API_KEY
  NOTIFICATION_FROM_EMAIL
  TELEGRAM_BOT_TOKEN
  NEXT_PUBLIC_API_URL
  NEXT_PUBLIC_BASE_PATH
  DOCKER_LOG_MAX_SIZE
  DOCKER_LOG_MAX_FILE
  ZENROWS_API_KEY
  SCRAPERAPI_KEY
  SCRAPINGBEE_API_KEY
  CRAWLBASE_TOKEN
  HTTP_PROXY
  JWT_SECRET
  JWT_ACCESS_EXPIRES_SECONDS
  JWT_REFRESH_EXPIRES_SECONDS
  COOKIE_SECURE
  FRONTEND_URL
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_CALLBACK_URL
)

for key in "${keys[@]}"; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    write_kv "$key" "$val"
  fi
done

chmod 600 "$OUTPUT_FILE"
