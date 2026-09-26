#!/usr/bin/env bash
# One-command start: installs dependencies when needed, then runs the server.
# The server runs on Node.js 12.17 or newer (Raspberry Pi / x68000pi). Building the web client needs Node.js 20.19 or newer,
# so on an older Node build it elsewhere (cd client && npm install && npm run build) and copy client/dist here.
# Settings come from SE_* environment variables (see webui/schema.md), e.g.  SE_PORT=9000 ./start.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 12.17 or newer is required." >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>12||(a===12&&b>=17)?0:1)' \
  || { echo "Node.js 12.17 or newer is required (found $(node -v))." >&2; exit 1; }
[ -d server/node_modules ] || (cd server && npm install --production --no-audit --no-fund)
if [ ! -f client/dist/index.html ]; then
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)'; then
    [ -d client/node_modules ] || (cd client && npm install --no-audit --no-fund)
    (cd client && npm run build)
  else
    echo "WARNING: web client is not built and Node $(node -v) is too old to build it (needs 20.19+)." >&2
    echo "         Build it on another machine (cd webui/client && npm install && npm run build) and copy client/dist to webui/client/dist." >&2
  fi
fi
exec node --no-warnings server/src/index.js
