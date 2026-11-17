#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Specter Production Deployment Script
# Deterministic local-to-VPS deployment without GitHub Actions quota limits.
# ==============================================================================

VPS_HOST="${VPS_HOST:-163.176.195.173}"
VPS_USER="${VPS_USER:-ubuntu}"
VPS_SSH_KEY="${VPS_SSH_KEY:-/home/pedroduarte/Videos/oracle-cloud/ssh-p-key2.key}"
DOCKER_IMAGE_TAG="${DOCKER_IMAGE_TAG:-specter-backend:local-recovery}"
FRONTEND_DEPLOY_PATH="${FRONTEND_DEPLOY_PATH:-/var/www/specter}"
SKIP_CHECKS="${SKIP_CHECKS:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$ROOT_DIR"

log() {
  echo -e "\033[1;34m[DEPLOY]\033[0m $1"
}

success() {
  echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

error() {
  echo -e "\033[1;31m[ERROR]\033[0m $1" >&2
}

SSH_CMD="ssh -i $VPS_SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${VPS_USER}@${VPS_HOST}"

log "Starting deployment to ${VPS_USER}@${VPS_HOST}..."

# 1. Verify SSH Connectivity
log "Verifying SSH connection to VPS..."
if ! $SSH_CMD "echo connected" >/dev/null 2>&1; then
  error "Unable to connect to ${VPS_USER}@${VPS_HOST} with key ${VPS_SSH_KEY}."
  exit 1
fi
success "SSH connection established."

# 2. Local Quality Checks
if [ "$SKIP_CHECKS" = "true" ]; then
  log "Skipping typecheck and lint (SKIP_CHECKS=true)..."
else
  log "Running typecheck..."
  npm run typecheck
  success "Typecheck passed."

  log "Running linter..."
  npm run lint
  success "Linter passed."
fi

# 3. Build Frontend Locally (Offloads VPS Memory / Avoids OOM)
if [ -d "extension" ] && command -v zip >/dev/null 2>&1; then
  log "Packaging companion extension artifact..."
  mkdir -p frontend/public
  (cd extension && zip -qr ../frontend/public/specter-companion.zip . -x "specter-companion.zip") || true
fi

log "Building frontend static export locally..."
NEXT_PUBLIC_BASE_PATH="" \
NEXT_PUBLIC_API_URL="/api" \
NEXT_PUBLIC_EXTENSION_URL="" \
npm run --prefix frontend build
success "Frontend built successfully in frontend/out."

# 4. Sync Backend Sources and Build Docker Image on VPS (Native ARM64)
log "Syncing backend sources to VPS for native container build..."
$SSH_CMD "mkdir -p ~/specter-build"

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'out' \
  -e "ssh -i $VPS_SSH_KEY -o StrictHostKeyChecking=no" \
  backend packages package.json package-lock.json \
  "${VPS_USER}@${VPS_HOST}:~/specter-build/"

log "Building Docker image on VPS (${DOCKER_IMAGE_TAG})..."
$SSH_CMD "cd ~/specter-build && sudo docker build -t ${DOCKER_IMAGE_TAG} -f backend/Dockerfile ."

log "Cleaning up VPS build directory and dangling images..."
$SSH_CMD "rm -rf ~/specter-build && sudo docker image prune -f"

# 5. Recreate Backend Container (Preserves .env.prod and DB/Redis volumes)
log "Recreating backend container in production compose..."
$SSH_CMD "cd ~/specter && sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-deps backend"
success "Backend container updated and running."

# 6. Deploy Static Frontend and Reload Nginx
log "Uploading frontend static export to VPS..."
$SSH_CMD "mkdir -p /tmp/specter-out"

rsync -avz --delete \
  -e "ssh -i $VPS_SSH_KEY -o StrictHostKeyChecking=no" \
  frontend/out/ \
  "${VPS_USER}@${VPS_HOST}:/tmp/specter-out/"

log "Moving frontend to ${FRONTEND_DEPLOY_PATH} and reloading Nginx..."
$SSH_CMD "sudo rsync -av --delete /tmp/specter-out/ ${FRONTEND_DEPLOY_PATH}/ && sudo rm -rf /tmp/specter-out && sudo nginx -t && sudo systemctl reload nginx"
success "Frontend deployed and Nginx reloaded."

# 7. Post-Deployment Verification
log "Verifying backend health endpoint..."
MAX_RETRIES=15
RETRY_COUNT=0
HEALTH_STATUS=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  HEALTH_STATUS=$($SSH_CMD "curl -sf http://127.0.0.1:3001/api/health" || true)
  if [[ "$HEALTH_STATUS" =~ "ok" ]]; then
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  log "Waiting for backend to finish booting (attempt ${RETRY_COUNT}/${MAX_RETRIES})..."
  sleep 2
done

if [[ "$HEALTH_STATUS" =~ "ok" ]]; then
  success "Backend health check passed: $HEALTH_STATUS"
else
  error "Backend health check failed: $HEALTH_STATUS"
  exit 1
fi

log "Verifying public dashboard URL..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://specterdev.online/dashboard/ || true)
if [ "$HTTP_STATUS" = "200" ]; then
  success "Public dashboard reachable: HTTP ${HTTP_STATUS}"
else
  log "Public dashboard returned HTTP ${HTTP_STATUS} (may be cached or redirecting)."
fi

echo ""
success "======================================================"
success "🚀 Specter deployed successfully to ${VPS_HOST}!"
success "======================================================"
