#!/bin/bash
# deploy.sh — 每小時檢查 GitHub main，有更新就重建 app（cron）。手動強制：~/cardlearn/deploy.sh --build
set -uo pipefail
cd "$HOME/cardlearn"
exec 9>.deploy.lock; flock -n 9 || exit 0
LOG=$HOME/cardlearn/deploy.log
old=$(git -C app rev-parse HEAD 2>/dev/null)
git -C app fetch -q origin main && git -C app reset -q --hard origin/main
new=$(git -C app rev-parse HEAD)
if [ "$old" != "$new" ] || [ "${1:-}" = "--build" ]; then
  if docker compose up -d --build >>"$LOG" 2>&1; then echo "$(date '+%F %T') deployed $new" >>"$LOG"; else echo "$(date '+%F %T') BUILD FAILED $new" >>"$LOG"; fi
  docker image prune -f >/dev/null 2>&1
fi
