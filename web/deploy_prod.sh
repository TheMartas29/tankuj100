#!/usr/bin/env bash
#
# Nasazení prezentačního webu tankuj100 → https://tankuj100.cz
#
# Statický web: vybuilduje Vite (-> dist) a publikuje do složky, kterou servíruje nginx.
# S backendem (PM2 proces `tankuj100`) tohle nemá nic společného – ten se nasazuje
# skriptem ../deploy.sh a tenhle skript se ho ani nedotkne.
#
# Použití (ve složce web/ na serveru):
#   git pull && ./deploy_prod.sh          # zeptá se na potvrzení
#   git pull && ./deploy_prod.sh -y       # bez ptaní
#
# ⚠️ VPS má ~1 GB RAM – nepouštěj souběžně s jiným deployem (npm ci by šel OOM).
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

WEB_ROOT="/var/www/tankuj100-web/dist"   # kam míří nginx (root)

# Pojistka – potvrzení (přeskočíš -y)
if [ "${1:-}" != "-y" ]; then
  read -r -p "Nasadit web tankuj100.cz na produkci? [y/N] " ans
  case "$ans" in [yY] | [yY][eE][sS]) ;; *) echo "Zrušeno."; exit 0 ;; esac
fi

# Načti nvm, ať je node dostupný i v neinteraktivním shellu (na serveru je jen přes nvm)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +u; . "$NVM_DIR/nvm.sh"
  command -v node >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  set -u
fi
command -v node >/dev/null || { echo "CHYBA: není Node.js."; exit 1; }
echo "Node: $(node -v)"

echo "==> [1/3] Instalace závislostí"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

echo "==> [2/3] Build (tsc -b && vite build -> dist)"
npm run build

echo "==> [3/3] Publikace do $WEB_ROOT"
mkdir -p "$WEB_ROOT"
# --delete uklidí staré hashované assety; .well-known necháváme být kvůli certbotu
rsync -a --delete --exclude '.well-known' dist/ "$WEB_ROOT/"

echo ""
echo "Hotovo ✔  https://tankuj100.cz"
