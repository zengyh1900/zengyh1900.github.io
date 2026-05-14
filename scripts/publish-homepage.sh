#!/usr/bin/env bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

message="${*:-update}"

if [[ -z "${message//[[:space:]]/}" ]]; then
  message="update"
fi

echo "Running homepage checks..."
node --check scripts/preview-homepage.mjs
git diff --check
pre-commit run --all-files
git diff --check

echo "Staging repository changes..."
git add --all -- .

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

blocked_paths="$(git diff --cached --name-only | rg '(^|/)(\.env|.*\.(key|pem|p12))$|^\.cc-connect/' || true)"
if [[ -n "$blocked_paths" ]]; then
  echo "Refusing to commit sensitive or runtime-only paths:" >&2
  echo "$blocked_paths" >&2
  exit 1
fi

git diff --cached --check

echo "Committing with message: $message"
git commit -m "$message"

echo "Pushing current branch..."
git push
