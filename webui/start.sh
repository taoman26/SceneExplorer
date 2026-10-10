#!/usr/bin/env bash
# One-command start: installs dependencies and builds the web client when needed, then runs the server.
# Settings come from SE_* environment variables (see webui/schema.md), e.g.  SE_PORT=9000 ./start.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 22.13 or newer is required." >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Node.js 22.13 or newer is required (found $(node -v))." >&2; exit 1; }
[ -d server/node_modules ] || (cd server && npm install --omit=dev --no-audit --no-fund)
# Always rebuild (it's ~1-2s): a stale client/dist served alongside newer server code is a silent, confusing bug.
[ -d client/node_modules ] || (cd client && npm install --no-audit --no-fund)
(cd client && npm run build)
exec node --no-warnings server/src/index.js
