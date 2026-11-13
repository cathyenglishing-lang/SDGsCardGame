#!/bin/bash
# update-geoip.sh — download this month's free DB-IP Lite databases (country/region/city and network)
# for the visitor log (backend/visits.py). Data: DB-IP.com, CC BY 4.0. Cron: 3rd of every month, 05:10.
#   ~/cardlearn/update-geoip.sh
# The files go to ~/cardlearn/data/geoip, mounted into the app as /data/geoip (GEOIP_DIR).
# The app opens them once, so it is restarted after a new download.
set -euo pipefail
DIR="$HOME/cardlearn/data/geoip"
mkdir -p "$DIR"
month=$(date +%Y-%m)
got=0
for kind in city asn; do
  url="https://download.db-ip.com/free/dbip-$kind-lite-$month.mmdb.gz"
  if curl -fsSL -o "$DIR/$kind.tmp.gz" "$url"; then
    gunzip -f "$DIR/$kind.tmp.gz" && mv -f "$DIR/$kind.tmp" "$DIR/dbip-$kind-lite.mmdb" && got=$((got + 1))
  else
    echo "$(date '+%F %T') geoip: $url not available, keeping the old file" >&2
    rm -f "$DIR/$kind.tmp.gz"
  fi
done
if [ "$got" -gt 0 ]; then
  docker restart cardlearn-app >/dev/null && echo "$(date '+%F %T') geoip: $got file(s) updated ($month), app restarted"
fi
