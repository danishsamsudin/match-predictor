#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV_PY="$ROOT/.venv-ml/bin/python"

if [[ -x "$VENV_PY" ]]; then
  exec "$VENV_PY" "$ROOT/scripts/glpm_predict_from_vectors.py" "$@"
fi

echo "No .venv-ml found — using system python3."
echo "Tip: run bash scripts/ml/setup-venv.sh for an isolated env."
exec python3 "$ROOT/scripts/glpm_predict_from_vectors.py" "$@"
