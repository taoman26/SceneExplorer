#!/usr/bin/env bash
# Starts the WebUI server on a generated dummy library (see make_dummy_library.py) and refuses to run on anything else,
# so development and screenshots never touch your real library.
#   run_dummy_server.sh LIBDIR DATADIR [PORT]  (default 18686, runs in the foreground; Ctrl-C / kill to stop)
set -euo pipefail
LIB="${1:?dummy library dir}"; DATA="${2:?webui data dir}"; PORT="${3:-18686}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$LIB/.dummy-library" ] || { echo "refusing: $LIB is not a generated dummy library (no .dummy-library marker)" >&2; exit 1; }
export SE_DB_DIR="$LIB/db" SE_DOC_FILE="$LIB/dummy.scexd" SE_DATA_DIR="$DATA" SE_PORT="$PORT"
case "$SE_DB_DIR$SE_DOC_FILE" in *"/.local/share/Ambiesoft"*|*"/Documents/SceneExplorer"*) echo "refusing: real library path" >&2; exit 1;; esac
exec node --no-warnings "$HERE/../server/src/index.js"
