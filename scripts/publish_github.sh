#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-aether-route-sim}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v gh >/dev/null 2>&1; then
  echo '需要安装并登录 GitHub CLI： https://cli.github.com/ ; gh auth login' >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo '请先执行：gh auth login' >&2
  exit 1
fi
if [[ ! -d .git ]]; then git init -b main; fi
git add .
if [[ -n "$(git status --porcelain)" ]]; then
  git -c user.name="AETHER Project" -c user.email="noreply@localhost" commit -m "feat: initial AETHER simulation platform" 
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo '已有 origin 远程地址，准备推送。'
  git push -u origin main
else
  gh repo create "$REPO" --private --source . --remote origin --push
fi
