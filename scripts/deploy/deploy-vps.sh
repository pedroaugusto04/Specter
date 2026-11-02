#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Local VPS Deploy Script (Dynamic Scrapper)
# Follows the architecture pattern of FeConnect
# ==============================================================================

APP_DIR="${APP_DIR:-$HOME/dynamic-scrapper}"
BRANCH="${BRANCH:-main}"
FRONTEND_DEPLOY_PATH="${FRONTEND_DEPLOY_PATH:-/var/www/dynamic-scrapper}"
DOCKER_IMAGE_NAME="dynamic-scrapper-backend:latest"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=== Iniciando deploy na VPS ==="
echo "Diretório da aplicação: $APP_DIR"
echo "Branch: $BRANCH"

mkdir -p "$APP_DIR"
cd "$APP_DIR" || { echo "❌ Erro: Diretório $APP_DIR não encontrado na VPS."; exit 1; }

echo "1. Verificando repositório Git..."
if [ -d ".git" ]; then
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

echo "2. Configurando arquivo de ambiente (.env.prod)..."
if [ -f ".env" ]; then
  echo "✔ Carregando variáveis locais de .env..."
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -f "backend.env" ]; then
  cp backend.env .env.prod
elif [ -f ".env.prod" ]; then
  echo "✔ Usando .env.prod existente."
else
  echo "⚠️ Aviso: .env.prod não encontrado. Gerando a partir de defaults..."
  if [ -f "scripts/deploy/generate-backend-env.sh" ]; then
    bash scripts/deploy/generate-backend-env.sh .env.prod 3001
  fi
fi

if [ -f ".env.prod" ]; then
  sed -i '/^DOCKER_IMAGE=/d' .env.prod
  echo "DOCKER_IMAGE=$DOCKER_IMAGE_NAME" >> .env.prod
fi

echo "3. Compilando/Verificando imagem Docker do Backend..."
if [ -f "backend/Dockerfile" ]; then
  docker build -t "$DOCKER_IMAGE_NAME" -f backend/Dockerfile backend/
fi

echo "4. Atualizando containers (Docker Compose)..."
if [ -f "$COMPOSE_FILE" ]; then
  docker compose --env-file .env.prod -f "$COMPOSE_FILE" up -d --remove-orphans
fi

echo "5. Compilando e atualizando Frontend..."
if [ -d "frontend" ]; then
  cd frontend
  npm ci --no-audit --no-fund
  NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-}" \
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}" \
  npm run build

  echo "Sincronizando arquivos do frontend para $FRONTEND_DEPLOY_PATH..."
  sudo mkdir -p "$FRONTEND_DEPLOY_PATH"
  sudo chown -R "$USER:$USER" "$FRONTEND_DEPLOY_PATH"
  rsync -az --delete out/ "$FRONTEND_DEPLOY_PATH/"
  cd "$APP_DIR"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  echo "Recarregando Nginx..."
  sudo nginx -t && sudo systemctl reload nginx || true
fi

echo "6. Limpando imagens Docker não utilizadas..."
docker image prune -f --filter "until=168h" || true

echo "✅ Deploy finalizado com sucesso na VPS!"
