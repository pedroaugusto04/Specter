#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Specter — Local Environment Setup Script
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "⚡ Setting up Specter local environment..."

# 1. Create .env from .env.example if missing
if [ ! -f .env ]; then
  echo "📄 Creating .env from .env.example..."
  cp .env.example .env
else
  echo "✔ Existing .env found."
fi

# 2. Ensure ENCRYPTION_KEY is populated with a secure 32-byte (64 hex characters) key
CURRENT_KEY=$(grep -E '^ENCRYPTION_KEY=' .env | cut -d '=' -f2- || true)

if [ -z "$CURRENT_KEY" ] || [ "$CURRENT_KEY" = "replace_with_64_hex_chars_or_32_bytes_random_secret" ]; then
  echo "🔑 Generating a new 32-byte hex ENCRYPTION_KEY..."
  if command -v openssl >/dev/null 2>&1; then
    NEW_KEY=$(openssl rand -hex 32)
  elif command -v node >/dev/null 2>&1; then
    NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  elif command -v python3 >/dev/null 2>&1; then
    NEW_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  else
    NEW_KEY=$(head -c 32 /dev/urandom | xxd -p -c 32)
  fi

  # Replace in .env
  if grep -q '^ENCRYPTION_KEY=' .env; then
    sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${NEW_KEY}|" .env
  else
    echo "ENCRYPTION_KEY=${NEW_KEY}" >> .env
  fi
  echo "✔ ENCRYPTION_KEY generated and saved to .env."
else
  echo "✔ Valid ENCRYPTION_KEY already present."
fi

# 3. Check for Docker
echo "🐳 Checking Docker environment..."
if command -v docker >/dev/null 2>&1; then
  echo "✔ Docker is installed."
else
  echo "⚠️  Warning: Docker not found. Please install Docker Engine or Docker Desktop."
fi

echo ""
echo "========================================================================"
echo "✨ Setup complete!"
echo "Next steps:"
echo " 1. Open .env and add your Gemini API Key in COMPILER_API_KEY"
echo "    (Get one for free at: https://aistudio.google.com/)"
echo " 2. Start the application with Docker:"
echo "    docker compose -f docker-compose.dev.yml up"
echo " 3. Open dashboard at http://localhost:3005"
echo "========================================================================"
