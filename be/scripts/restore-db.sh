#!/usr/bin/env bash
#
# tankuj100 – obnovení databáze ze zálohy.
#
# Použití:
#   be/scripts/restore-db.sh                        # vypíše dostupné zálohy
#   be/scripts/restore-db.sh <soubor.sqlite.gz>     # obnoví (zeptá se na potvrzení)
#   be/scripts/restore-db.sh <soubor> -y            # bez ptaní
#
# Postup je schválně opatrný: zálohu nejdřív rozbalíme stranou a ověříme, pak
# teprve zastavíme API, odložíme současnou DB (nemaže se, jen se přejmenuje)
# a nasadíme obnovenou. Když cokoli po cestě selže, živá DB zůstane nedotčená.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${DB_PATH:-$ROOT/be/db/tankuj100db.sqlite}"
DEST="${BACKUP_DIR:-$ROOT/be/db/_backups}"

SRC="${1:-}"
ASSUME_YES=0
for arg in "$@"; do
  [ "$arg" = "-y" ] && ASSUME_YES=1
done

if [ -z "$SRC" ] || [ "$SRC" = "-y" ]; then
  echo "Dostupné zálohy ($DEST):"
  # nullglob: ať se nenamatchovaný vzor nepředá do `ls` jako literál a nehlásil chybu
  shopt -s nullglob
  FILES=("$DEST"/*.sqlite.gz "$DEST"/*.sqlite)
  shopt -u nullglob
  if [ "${#FILES[@]}" -gt 0 ]; then
    ls -lht "${FILES[@]}"
  else
    echo "  (žádné)"
  fi
  echo ""
  echo "Použití: $0 <soubor> [-y]"
  exit 0
fi

# Povolíme i holé jméno souboru ze složky se zálohami.
[ -f "$SRC" ] || SRC="$DEST/$SRC"
[ -f "$SRC" ] || { echo "CHYBA: záloha $SRC neexistuje"; exit 1; }

command -v sqlite3 >/dev/null || { echo "CHYBA: chybí sqlite3"; exit 1; }

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tankuj100-restore.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
CANDIDATE="$TMP_DIR/db.sqlite"

case "$SRC" in
  *.gz) gzip -dc "$SRC" >"$CANDIDATE" ;;
  *)    cp "$SRC" "$CANDIDATE" ;;
esac

INTEGRITY="$(sqlite3 "$CANDIDATE" 'PRAGMA integrity_check;' 2>&1 || true)"
[ "$INTEGRITY" = "ok" ] || { echo "CHYBA: záloha je poškozená ($INTEGRITY)"; exit 1; }

STATIONS="$(sqlite3 "$CANDIDATE" 'SELECT COUNT(*) FROM station;')"
REVIEWS="$(sqlite3 "$CANDIDATE" 'SELECT COUNT(*) FROM review;' 2>/dev/null || echo '—')"
REPORTS="$(sqlite3 "$CANDIDATE" 'SELECT COUNT(*) FROM report;' 2>/dev/null || echo '—')"

echo "Záloha:  $SRC"
echo "Obsah:   stanice $STATIONS, hodnocení $REVIEWS, hlášení $REPORTS"
if [ -f "$DB" ]; then
  NOW_STATIONS="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM station;' 2>/dev/null || echo '?')"
  NOW_REVIEWS="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM review;' 2>/dev/null || echo '?')"
  echo "Teď v DB: stanice $NOW_STATIONS, hodnocení $NOW_REVIEWS"
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Přepsat živou databázi touto zálohou? [y/N] " ans
  case "$ans" in
    [yY] | [yY][eE][sS]) ;;
    *) echo "Zrušeno."; exit 0 ;;
  esac
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u; . "$NVM_DIR/nvm.sh"; set -u
fi

if command -v pm2 >/dev/null && pm2 describe tankuj100 >/dev/null 2>&1; then
  echo "==> zastavuji API"
  pm2 stop tankuj100 >/dev/null
  RESTART_PM2=1
else
  RESTART_PM2=0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -f "$DB" ]; then
  mkdir -p "$DEST"
  mv "$DB" "$DEST/pre-restore-$STAMP.sqlite"
  echo "==> původní DB odložena do $DEST/pre-restore-$STAMP.sqlite"
fi
# WAL/SHM patří k původní DB – se starými soubory by se obnovená DB rozbila.
rm -f "$DB-wal" "$DB-shm"

cp "$CANDIDATE" "$DB"
echo "==> obnoveno do $DB"

if [ "$RESTART_PM2" -eq 1 ]; then
  echo "==> startuji API"
  pm2 start tankuj100 >/dev/null
fi

echo "Hotovo ✔"
