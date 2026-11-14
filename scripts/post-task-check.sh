#!/usr/bin/env bash
set -euo pipefail

# Post-task formatter & Oxlint runner for changed files (saves agent tokens).
# Usage: bash scripts/post-task-check.sh [--fix] [file ...]

FIX=false
if [[ "${1:-}" == "--fix" ]]; then
  FIX=true
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
  echo "post-task-check: no changed files."
  exit 0
fi

echo "==> Prettier (${#FILES[@]} changed file(s))"
if [[ "$FIX" == true ]]; then
  pnpm exec prettier --ignore-unknown --write "${FILES[@]}"
else
  pnpm exec prettier --ignore-unknown --check "${FILES[@]}"
fi

declare -a LINT_FILES=()
for f in "${FILES[@]}"; do
  case "$f" in
    *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs)
      LINT_FILES+=("$f")
      ;;
  esac
done

if [[ "${#LINT_FILES[@]}" -gt 0 ]]; then
  echo "==> Oxlint (${#LINT_FILES[@]} code file(s))"
  if [[ "$FIX" == true ]]; then
    pnpm exec oxlint --type-aware --fix "${LINT_FILES[@]}"
    pnpm exec prettier --ignore-unknown --write "${LINT_FILES[@]}"
  else
    pnpm exec oxlint --type-aware "${LINT_FILES[@]}"
  fi
else
  echo "==> Oxlint: no JS/TS files changed."
fi

echo "post-task-check: done."
