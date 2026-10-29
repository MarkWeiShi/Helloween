#!/bin/bash
set -euo pipefail
node /app/scripts/install-web.mjs /opt/ghost-web /data/web
nginx -t
HOST=127.0.0.1 PORT=8787 node /app/server/index.mjs &
api_pid=$!
nginx -g 'daemon off;' &
web_pid=$!
shutdown() {
  kill -TERM "$api_pid" 2>/dev/null || true
  kill -QUIT "$web_pid" 2>/dev/null || true
  wait "$api_pid" "$web_pid" 2>/dev/null || true
}
trap shutdown TERM INT EXIT
wait -n "$api_pid" "$web_pid"
