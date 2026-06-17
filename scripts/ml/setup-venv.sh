#!/usr/bin/env bash
# Isolated Python env for ML training (avoids Anaconda base dependency conflicts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$ROOT/.venv-ml"

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$ROOT/scripts/ml/requirements.txt"

echo ""
echo "ML venv ready: $VENV"
echo "Run training with: npm run wc:ml-train"
