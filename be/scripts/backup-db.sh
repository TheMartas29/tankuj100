#!/usr/bin/env bash
#
# tankuj100 – automatická záloha SQLite databáze.
#
# Použití:
#   be/scripts/backup-db.sh              # denní záloha + rotace
#   be/scripts/backup-db.sh --list       # výpis existujících záloh
#
# Spouští se z cronu na serveru (viz DEPLOY.md). Skript:
#   1) udělá konzistentní kopii přes `sqlite3 .backup` – tedy VČETNĚ WAL a bez
#      rizika, že chytneme databázi rozepsanou uprostřed transakce (prostý `cp`
#      živé DB tohle nezaručuje),
#   2) ověří kopii (`PRAGMA integrity_check` + kontrola, že v ní jsou stanice),
#      protože záloha, kterou nikdo nezkusil otevřít, není záloha,
#   3) teprve ověřenou kopii zabalí a přesune na místo (atomicky přes mv),
#   4) první zálohu v měsíci si nechá stranou jako měsíční,
#   5) smaže staré denní/měsíční zálohy podle nastavené retence.
#
# Rotace se schválně dívá jen na soubory s vlastní předponou (daily-/monthly-),
# aby nesmazala zálohy z deploye ani ruční `pre-cleanup-*`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DB="${DB_PATH:-$ROOT/be/db/tankuj100db.sqlite}"
DEST="${BACKUP_DIR:-$ROOT/be/db/_backups}"
DAILY_KEEP="${DAILY_KEEP:-30}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
LOG="${BACKUP_LOG:-$DEST/backup.log}"

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  echo "$line"
  mkdir -p "$(dirname "$LOG")"
  echo "$line" >>"$LOG"
}

die() {
  log "CHYBA: $*"
  exit 1
}

if [ "${1:-}" = "--list" ]; then
  ls -lh "$DEST"/*.sqlite.gz 2>/dev/null || echo "Zatím žádné zálohy v $DEST"
  exit 0
fi

command -v sqlite3 >/dev/null || die "chybí sqlite3 (apt install sqlite3)"
[ -f "$DB" ] || die "databáze $DB neexistuje"

mkdir -p "$DEST"

STAMP="$(date +%Y%m%d-%H%M%S)"
MONTH="$(date +%Y%m)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tankuj100-backup.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_DB="$TMP_DIR/db.sqlite"

# --- [1] konzistentní kopie ---
sqlite3 "$DB" ".backup '$TMP_DB'" || die "sqlite3 .backup selhalo"

# --- [2] ověření kopie ---
INTEGRITY="$(sqlite3 "$TMP_DB" 'PRAGMA integrity_check;' 2>&1 || true)"
[ "$INTEGRITY" = "ok" ] || die "záloha neprošla integrity_check: $INTEGRITY"

STATIONS="$(sqlite3 "$TMP_DB" 'SELECT COUNT(*) FROM station;' 2>&1 || true)"
case "$STATIONS" in
  ''|*[!0-9]*) die "v záloze nejde přečíst tabulka station: $STATIONS" ;;
esac
[ "$STATIONS" -gt 0 ] || die "záloha obsahuje 0 stanic – nezálohuji prázdnou DB"

REVIEWS="$(sqlite3 "$TMP_DB" 'SELECT COUNT(*) FROM review;' 2>/dev/null || echo 0)"
REPORTS="$(sqlite3 "$TMP_DB" 'SELECT COUNT(*) FROM report;' 2>/dev/null || echo 0)"
VOTES="$(sqlite3 "$TMP_DB" 'SELECT COUNT(*) FROM fuel_vote;' 2>/dev/null || echo 0)"

# --- [3] zabalit a atomicky přesunout ---
gzip -9 "$TMP_DB"
DAILY="$DEST/daily-$STAMP.sqlite.gz"
mv "$TMP_DB.gz" "$DAILY"
SIZE="$(du -h "$DAILY" | cut -f1)"

# --- [4] měsíční kopie (první záloha v daném měsíci) ---
MONTHLY="$DEST/monthly-$MONTH.sqlite.gz"
if [ ! -f "$MONTHLY" ]; then
  cp "$DAILY" "$MONTHLY"
  log "měsíční záloha $MONTHLY"
fi

# --- [5] rotace ---
# shellcheck disable=SC2012  # jména souborů jsou naše, bez mezer a nových řádků
ls -1t "$DEST"/daily-*.sqlite.gz 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm -f
# shellcheck disable=SC2012
ls -1t "$DEST"/monthly-*.sqlite.gz 2>/dev/null | tail -n +$((MONTHLY_KEEP + 1)) | xargs -r rm -f

log "OK $DAILY ($SIZE) – stanice $STATIONS, hodnocení $REVIEWS, hlášení $REPORTS, hlasy $VOTES"

# Log ať neroste donekonečna – nech posledních 500 řádků.
if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt 500 ]; then
  tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
