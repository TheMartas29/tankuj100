#!/usr/bin/env bash
#
# tankuj100 – nasazení backendu (Express + SQLite) přes PM2.
#
# Použití na serveru (ve složce repa):
#   ./deploy.sh            # stáhne změny z gitu a nasadí (zeptá se na potvrzení)
#   ./deploy.sh -y         # bez ptaní (např. pro automatizaci)
#   ./deploy.sh --no-pull  # nasadí aktuální stav bez `git pull`
#
# Co dělá:
#   0) `git pull` (pokud není --no-pull)
#   1) naseeduje DB z be/db/seed.sqlite, když živá DB chybí (první nasazení);
#      jinak živou DB zazálohuje do be/db/_backups (rotace 10)
#   2) nainstaluje závislosti backendu (npm ci)
#   3) (re)startuje API přes PM2 (tankuj100.config.cjs)
#
# Živá DB (be/db/tankuj100db.sqlite) je MIMO git – přežije každý git pull i deploy.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DO_PULL=1
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y) ASSUME_YES=1 ;;
    --no-pull) DO_PULL=0 ;;
    *) echo "Neznámý přepínač: $arg"; exit 1 ;;
  esac
done

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Nasadit tankuj100 na tento server? [y/N] " ans
  case "$ans" in
    [yY] | [yY][eE][sS]) ;;
    *) echo "Zrušeno."; exit 0 ;;
  esac
fi

# Načti nvm, ať jsou node/pm2 dostupné i v neinteraktivním shellu.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  command -v node >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  set -u
fi

command -v node >/dev/null || { echo "CHYBA: není nainstalovaný Node.js (ani přes nvm)."; exit 1; }
command -v pm2  >/dev/null || { echo "CHYBA: není nainstalovaný pm2 (npm i -g pm2)."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "CHYBA: potřeba Node.js 18+. Máš $(node -v)."; exit 1
fi

echo "=================================================="
echo "  Nasazuji: tankuj100"
echo "  Složka:   $ROOT"
echo "=================================================="

if [ "$DO_PULL" -eq 1 ]; then
  echo "==> [git] pull"
  git pull --ff-only
fi

# --- [1] Seed / záloha DB ---
DB="be/db/tankuj100db.sqlite"
SEED="be/db/seed.sqlite"
mkdir -p be/db/_backups
if [ ! -f "$DB" ]; then
  echo "==> [1/3] Živá DB chybí – seeduji z $SEED (první nasazení)"
  [ -f "$SEED" ] || { echo "CHYBA: chybí seed $SEED"; exit 1; }
  cp "$SEED" "$DB"
else
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BK="be/db/_backups/$STAMP.sqlite"
  echo "==> [1/3] Záloha živé DB -> $BK"
  if command -v sqlite3 >/dev/null; then
    sqlite3 "$DB" ".backup '$BK'"
  else
    cp "$DB" "$BK"
  fi
  # rotace: nech posledních 10 záloh
  ls -1t be/db/_backups/*.sqlite 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

echo "==> [2/3] Backend: instalace závislostí (npm ci)"
( cd be && npm ci --omit=dev )

echo "==> [3/3] (Re)start API přes PM2"
pm2 startOrReload tankuj100.config.cjs --update-env
pm2 save

echo ""
echo "Hotovo ✔  (tankuj100)"
pm2 status
