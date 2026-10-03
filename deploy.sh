#!/usr/bin/env bash
#
# PEOS redeploy script (idempotent). Pulls the latest code, applies additive migrations, rebuilds
# and restarts the app under pm2. Safe to run repeatedly.
#
#   - Never overwrites existing .env values (only appends missing keys).
#   - Generates INTEGRATION_ENCRYPTION_KEY once if absent (required before any OAuth connector works).
#   - Appends a COMMENTED OAuth template for GitHub/Google (do NOT set a redirect without its
#     client id+secret — env validation requires all three together, or none).
#
# Usage (on the VPS):   cd /var/www/peos.yazanalsamman.com && git pull && bash deploy.sh
#
# Override defaults with env vars, e.g.:  APP_DIR=/srv/peos PM2_NAME=peos PORT=3005 bash deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/peos.yazanalsamman.com}"
PM2_NAME="${PM2_NAME:-peos}"
PORT="${PORT:-3005}"
APP_URL="${APP_URL:-https://peos.yazanalsamman.com}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/peos-node24/bin}"   # from the Phase 8 deploy; ignored if absent

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# Use the project's Node/pnpm (Node 24) without changing the system default.
if [ -d "$NODE_BIN_DIR" ]; then PATH="$NODE_BIN_DIR:$PATH"; fi
command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found on PATH"; exit 1; }

cd "$APP_DIR"
log "Deploying $APP_DIR (node $(node -v 2>/dev/null || echo '?'), pnpm $(pnpm -v 2>/dev/null || echo '?'))"

log "Pulling latest code"
git pull --ff-only

# ── .env: append missing keys only (never clobber working values) ────────────
ENV_FILE="$APP_DIR/.env"
touch "$ENV_FILE"
ensure_env() {
  local key="$1" value="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
    log "Added $key to .env"
  fi
}

# Token encryption key (base64 32 bytes). Safe to set alone; required once a connector is configured.
if ! grep -qE '^INTEGRATION_ENCRYPTION_KEY=.+' "$ENV_FILE"; then
  KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  # Replace an empty line if present, else append.
  if grep -qE '^INTEGRATION_ENCRYPTION_KEY=$' "$ENV_FILE"; then
    sed -i "s|^INTEGRATION_ENCRYPTION_KEY=$|INTEGRATION_ENCRYPTION_KEY=${KEY}|" "$ENV_FILE"
  else
    printf 'INTEGRATION_ENCRYPTION_KEY=%s\n' "$KEY" >>"$ENV_FILE"
  fi
  log "Generated INTEGRATION_ENCRYPTION_KEY"
fi

# OAuth connector template (COMMENTED — the app runs fine without it; integrations show
# "Not configured"). Fill in all three of a block to enable that connector, then rerun this script.
if ! grep -q 'PEOS_INTEGRATION_OAUTH_TEMPLATE' "$ENV_FILE"; then
  cat >>"$ENV_FILE" <<EOF

# ── PEOS_INTEGRATION_OAUTH_TEMPLATE (Phase 9.5) ───────────────────────────────
# GitHub OAuth app (Settings → Developer settings → OAuth Apps). Callback:
#   ${APP_URL}/api/v1/integrations/github/callback
# Uncomment and set ALL THREE together (never a redirect alone), then rerun deploy.sh:
# GITHUB_INTEGRATION_CLIENT_ID=
# GITHUB_INTEGRATION_CLIENT_SECRET=
# GITHUB_INTEGRATION_REDIRECT_URI=${APP_URL}/api/v1/integrations/github/callback
#
# Google OAuth (Gmail/Drive/Calendar — connectors are deferred; Gmail scopes need a verified
# consent screen). Callback: ${APP_URL}/api/v1/integrations/google/callback
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_REDIRECT_URI=${APP_URL}/api/v1/integrations/google/callback
EOF
  log "Appended commented OAuth template to .env (fill in to enable connectors)"
fi

log "Installing dependencies"
pnpm install --frozen-lockfile

log "Generating Prisma client"
pnpm exec prisma generate

log "Applying database migrations (additive)"
pnpm exec prisma migrate deploy

log "Building"
pnpm build

log "Restarting pm2 process '$PM2_NAME'"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start pnpm --name "$PM2_NAME" --cwd "$APP_DIR" -- exec next start -p "$PORT"
fi
pm2 save

log "Health check"
sleep 2
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  echo "Local health OK (http://127.0.0.1:${PORT}/api/health)"
else
  echo "WARNING: local health check failed — inspect: pm2 logs ${PM2_NAME} --lines 50"
  exit 1
fi

log "Done. Live at ${APP_URL}"
echo "Migrations applied; integration tables are now present. Integrations show 'Not configured'"
echo "until you fill the OAuth template in ${ENV_FILE} and rerun this script."
