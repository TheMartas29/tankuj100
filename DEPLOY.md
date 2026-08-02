# Nasazení tankuj100 (PM2 + nginx)

Backend (`be/`) je Node/Express API, které:
- servíruje mapová data a detaily benzinek ze SQLite (`be/db/tankuj100db.sqlite`),
- scrapuje aktuální ceny paliv z fuelo.net (`/api/fuel-prices/:id`),
- obsluhuje jednoduché admin UI na `/` (`be/index.html`).

Nasazení běží stejným způsobem jako ostatní projekty (bale): jeden **PM2** proces,
před ním **nginx** jako reverzní proxy, deploy jedním skriptem z gitu.

| | tankuj100 |
|--|--|
| složka na serveru | `/var/www/tankuj100` (nebo kam je repo naklonované) |
| port (PM2 env) | 3000 |
| PM2 app | `tankuj100` |
| deploy skript | `./deploy.sh` |

## Běžný deploy (po prvním nasazení)

```bash
cd /var/www/tankuj100
./deploy.sh            # udělá git pull + nasadí (zeptá se na potvrzení)
./deploy.sh -y         # bez ptaní
./deploy.sh --no-pull  # nasadí aktuální stav bez git pull
```

## Jak deploy funguje

`deploy.sh` (jediné místo s logikou):
0. `git pull --ff-only` (pokud není `--no-pull`),
1. **DB**: když živá `be/db/tankuj100db.sqlite` chybí (první nasazení), naseeduje ji
   z verzovaného `be/db/seed.sqlite` (867 stanic). Jinak živou DB **zazálohuje** do
   `be/db/_backups/` (rotace 10),
2. `npm ci` v `be/`,
3. `pm2 startOrReload tankuj100.config.cjs` + `pm2 save`.

**Živá DB je mimo git** (`.gitignore`), takže přežije každý `git pull` i deploy –
úpravy stanic z admin UI se nepřepíšou. `node_modules` se do gitu taky necommitují,
instalují se přes `npm ci` při deploy.

## První nasazení

Předpoklady: Node 18+ (ideálně přes nvm), `pm2` globálně (`npm i -g pm2`),
build nástroje pro nativní modul `better-sqlite3`
(`sudo apt-get install -y build-essential python3`), `sqlite3` (kvůli zálohám).

1. **Kód**: `git clone https://github.com/TheMartas29/tankuj100.git /var/www/tankuj100`
2. **Deploy**: `cd /var/www/tankuj100 && ./deploy.sh -y`
   (naseeduje DB ze seedu, nainstaluje závislosti, nastartuje PM2)
3. **Autostart po rebootu** (stačí jednou): `pm2 startup` (spusť vypsaný příkaz),
   pak `pm2 save`.
4. **nginx**: `sudo cp deploy/nginx.tankuj100.conf.example /etc/nginx/sites-available/tankuj100`,
   nahraď `__DOMENA__`, pak
   `sudo ln -s /etc/nginx/sites-available/tankuj100 /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`.
5. **HTTPS**: `sudo certbot --nginx -d __DOMENA__`.

> ⚠️ Migrace ze současného běhu: pokud teď backend běží ručně (např. `node server.js`
> nebo ve `screen`/`tmux`), nejdřív ten proces ukonči, ať port 3000 neblokuje, a pak
> spusť `./deploy.sh`. PM2 ho převezme a bude ho po pádu/rebootu restartovat sám.

## iOS aplikace

iOS klient volá API přes `NetworkClient.BASE_URL`. Teď je nastaveno na
`http://80.211.200.128:3000`. **Pro App Store je potřeba HTTPS** – po nasazení domény
s TLS (krok 5) změň `BASE_URL` na `https://tvoje-domena` a odeber výjimku
`NSAllowsArbitraryLoads` z `ios/tankuj100/tankuj100/Info.plist`.

## Užitečné

```bash
pm2 status              # přehled procesů
pm2 logs tankuj100      # logy API
pm2 restart tankuj100   # ruční restart
curl -s localhost:3000/api/map/ | head -c 200   # rychlý test, že API vrací data
```
