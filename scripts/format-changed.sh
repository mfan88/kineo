#!/usr/bin/env bash
set -euo pipefail

# Format (or check) only files changed relative to main plus untracked files.
# Usage: bash scripts/format-changed.sh [--check] [file ...]

MODE="write"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
  shift
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

declare -a FILES=()
add_file() {
  local candidate="$1"
  [[ -n "$candidate" && -f "$candidate" ]] || return 0
  local existing
  for existing in "${FILES[@]+"${FILES[@]}"}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  FILES+=("$candidate")
}

if [[ "$#" -gt 0 ]]; then
  for arg in "$@"; do
    add_file "$arg"
  done
else
  BASE_REF="main"
  if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
    BASE_REF="HEAD"
  fi
  while IFS= read -r -d '' file; do
    add_file "$file"
  done < <(git diff --name-only -z --diff-filter=ACMR "$BASE_REF" 2>/dev/null || true)
  while IFS= read -r -d '' file; do
    add_file "$file"
  done < <(git ls-files --others --exclude-standard -z 2>/dev/null || true)
fi

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "format-changed: no changed files."
  exit 0
fi

if [[ "$MODE" == "check" ]]; then
  pnpm exec prettier --ignore-unknown --check "${FILES[@]}"
else
  pnpm exec prettier --ignore-unknown --write "${FILES[@]}"
fi
