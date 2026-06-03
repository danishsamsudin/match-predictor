#!/usr/bin/env bash
# Upload variables from .env.local to the linked Vercel project.
# Usage: from match-predictor/: ./scripts/sync-env-to-vercel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Install Vercel CLI: npm i -g vercel" >&2
  exit 1
fi

cd "$ROOT"

if [[ ! -f .vercel/project.json ]]; then
  echo "Link this folder first: vercel link" >&2
  exit 1
fi

echo "Syncing env vars from $ENV_FILE to linked Vercel project…"

add_env() {
  local key="$1"
  local value="$2"
  local env="$3"
  local sensitive="$4"
  if [[ "$sensitive" == "true" ]]; then
    printf '%s' "$value" | vercel env add "$key" "$env" --force --sensitive >/dev/null
  else
    printf '%s' "$value" | vercel env add "$key" "$env" --force >/dev/null
  fi
}

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]}" ]] && continue
  [[ "$line" != *"="* ]] && continue

  key="${line%%=*}"
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  fi

  sensitive="true"
  [[ "$key" == NEXT_PUBLIC_* ]] && sensitive="false"

  echo "  → $key"
  for env in production preview; do
    add_env "$key" "$value" "$env" "$sensitive"
  done
  if [[ "$sensitive" == "false" ]]; then
    add_env "$key" "$value" development "false"
  fi
done < "$ENV_FILE"

echo "Done. Redeploy production: vercel deploy --prod"
