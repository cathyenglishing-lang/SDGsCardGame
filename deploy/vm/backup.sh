#!/bin/bash
# backup.sh — 每天 03:30 備份資料庫與錄音到 ~/backup/cardlearn，資料庫保留 7 份、錄音每週日一份保留 4 份
set -uo pipefail
B=$HOME/backup/cardlearn; mkdir -p "$B"; cd "$HOME/cardlearn"
d=$(date +%F)
docker compose exec -T db pg_dump -U cardlearn -d cardlearn | gzip > "$B/db-$d.sql.gz" && echo "$(date '+%F %T') db ok $(du -h "$B/db-$d.sql.gz" | cut -f1)" >> "$B/backup.log"
ls -1t "$B"/db-*.sql.gz | tail -n +8 | xargs -r rm -f
if [ "$(date +%u)" = 7 ]; then tar -czf "$B/audio-$d.tar.gz" -C data audio && ls -1t "$B"/audio-*.tar.gz | tail -n +5 | xargs -r rm -f; fi
