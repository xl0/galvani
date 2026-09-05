#!/usr/bin/env bash
# Regenerate the parity fixture. BETSE insists on writing ~/.betse, so HOME is
# pointed at a scratch dir inside tools/betse.
set -euo pipefail
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || ./setup.sh
mkdir -p .home
HOME="$PWD/.home" MPLCONFIGDIR="$PWD/.home/mpl" .venv/bin/python dump_parity.py "${1:-../../tests/fixtures/betse-basic.json}" "${@:2}"
