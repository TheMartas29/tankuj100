#!/usr/bin/env bash
#
# tankuj100 – stažení záloh ze serveru na lokální stroj (off-site kopie).
#
# Zálohy na serveru leží na stejném disku jako živá databáze – při ztrátě serveru
# by zmizely spolu s ní. Tenhle skript si je stáhne k sobě.
#
# Použití (na Macu):
#   be/scripts/pull-backups.sh
#
# Kam se stahuje: ~/Backups/tankuj100 (jde přepsat proměnnou LOCAL_DIR).
# Když server není dostupný, skript skončí tiše s kódem 0 – ať případný
# plánovač nespamuje chybami, když je notebook na cestách.

set -euo pipefail

SERVER="${SERVER:-root@80.211.200.128}"
REMOTE_DIR="${REMOTE_DIR:-/root/projects/tankuj100/be/db/_backups}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/Backups/tankuj100}"

mkdir -p "$LOCAL_DIR"

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" true 2>/dev/null; then
  echo "Server $SERVER není dostupný – přeskakuji."
  exit 0
fi

rsync -az --delete-excluded \
  --include='daily-*.sqlite.gz' \
  --include='monthly-*.sqlite.gz' \
  --exclude='*' \
  "$SERVER:$REMOTE_DIR/" "$LOCAL_DIR/"

COUNT="$(find "$LOCAL_DIR" -name '*.sqlite.gz' | wc -l | tr -d ' ')"
NEWEST="$(ls -1t "$LOCAL_DIR"/*.sqlite.gz 2>/dev/null | head -1 || true)"
echo "Staženo do $LOCAL_DIR – záloh: $COUNT"
[ -n "$NEWEST" ] && echo "Nejnovější: $(basename "$NEWEST") ($(date -r "$NEWEST" '+%Y-%m-%d %H:%M'))"
