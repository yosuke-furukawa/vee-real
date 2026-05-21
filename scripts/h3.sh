#!/usr/bin/env bash
# Run the Node app and Caddy together so the site is served over
# HTTP/1.1, HTTP/2, and HTTP/3 (QUIC).
#
# Defaults to non-privileged ports (8443/8080) so it works without sudo.
# Override with HTTPS_PORT / HTTP_PORT (e.g. sudo HTTPS_PORT=443 HTTP_PORT=80 pnpm h3).

set -euo pipefail

if ! command -v caddy >/dev/null 2>&1; then
	echo "caddy not found. Install it with 'brew install caddy' (or see https://caddyserver.com/docs/install)." >&2
	exit 1
fi

export PORT="${PORT:-3000}"
export HTTPS_PORT="${HTTPS_PORT:-8443}"
export HTTP_PORT="${HTTP_PORT:-8080}"
export APP_UPSTREAM="${APP_UPSTREAM:-127.0.0.1:${PORT}}"

cd "$(dirname "$0")/.."

cleanup() {
	trap - INT TERM EXIT
	# Kill the whole process group so both app and caddy exit together.
	kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[h3] starting Node app on :${PORT}"
pnpm start &

echo "[h3] starting Caddy on https://localhost:${HTTPS_PORT} (h1/h2/h3) -> ${APP_UPSTREAM}"
caddy run --config Caddyfile --adapter caddyfile &

wait
