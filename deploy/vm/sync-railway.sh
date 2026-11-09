#!/bin/bash
# sync-railway.sh: copy the VM database to the Railway database (the cloud fallback), replacing what is there.
# Recordings stay on the VM as files; Railway gets the rows (who recorded what) but not the audio.
# Railway is PostgreSQL 18, so the 18 client is used for both sides. Runs nightly from cron (04:10).
set -uo pipefail
cd "$HOME/cardlearn"
. ./.env; . ./.env-railway
LOG=$HOME/backup/cardlearn/sync-railway.log
NET=$(docker inspect cardlearn-db-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
if docker run --rm --network "$NET" -e PGPASSWORD="$PG_PASSWORD" postgres:18-alpine \
     pg_dump -h db -U cardlearn -d cardlearn --clean --if-exists --no-owner --no-privileges \
   | docker run --rm -i postgres:18-alpine psql "$RAILWAY_DATABASE_URL" -q -v ON_ERROR_STOP=1 --single-transaction >/tmp/sync-railway.out 2>&1; then
  echo "$(date '+%F %T') ok $(docker run --rm postgres:18-alpine psql "$RAILWAY_DATABASE_URL" -tAc 'select count(*) from users') users" >> "$LOG"
else
  echo "$(date '+%F %T') FAILED: $(tail -3 /tmp/sync-railway.out | tr '\n' ' ')" >> "$LOG"
fi
