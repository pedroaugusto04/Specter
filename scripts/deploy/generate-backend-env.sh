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
CORS_ORIGIN="${CORS_ORIGIN:-https://pedro-duarte.ddns.net,http://pedro-duarte.ddns.net,https://pedro-duarte.servehttp.com,http://pedro-duarte.servehttp.com}"
COMPILER_PROVIDER="${COMPILER_PROVIDER:-agy}"
NOTIFICATION_PROVIDER="${NOTIFICATION_PROVIDER:-console}"
LOG_LEVEL="${LOG_LEVEL:-info}"
SCRAPER_ENGINE="${SCRAPER_ENGINE:-playwright}"

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
  NEXT_PUBLIC_API_URL
  NEXT_PUBLIC_BASE_PATH
  DOCKER_LOG_MAX_SIZE
  DOCKER_LOG_MAX_FILE
)

for key in "${keys[@]}"; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    write_kv "$key" "$val"
  fi
done

chmod 600 "$OUTPUT_FILE"
