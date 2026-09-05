#!/usr/bin/env bash
# Create tools/betse/.venv with BETSE installed from the cached git checkout.
set -euo pipefail
cd "$(dirname "$0")"
SRC=${BETSE_SRC:-$HOME/.cache/checkouts/github.com/betsee/betse}
[ -d "$SRC" ] || { echo "BETSE checkout not found at $SRC (set BETSE_SRC)"; exit 1; }
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python "$SRC"
echo "ok: $(.venv/bin/betse --version 2>/dev/null | tail -1)"
