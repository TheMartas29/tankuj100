# Nasazení tankuj100 (PM2 + nginx)

Backend (`be/`) je Node/Express API, které:
- servíruje mapová data a detaily benzinek ze SQLite (`be/db/tankuj100db.sqlite`),
- scrapuje aktuální ceny paliv z fuelo.net (`/api/fuel-prices/:id`),
- přijímá **hodnocení, komentáře, hlášení nesrovnalostí a hlasy o typu benzínu** z aplikace,
- posílá **e-mailové notifikace** o nových hlášeních (EmailJS),
- obsluhuje **admin UI** na `/` (za basic auth).

Nasazení běží stejným způsobem jako ostatní projekty (bale): jeden **PM2** proces,
před ním **nginx** jako reverzní proxy, deploy jedním skriptem z gitu.

| | tankuj100 |
|--|--|
| složka na serveru | `/var/www/tankuj100` (nebo kam je repo naklonované) |
| port (PM2 env) | 3000 |
| PM2 app | `tankuj100` |
| deploy skript | `./deploy.sh` |
| doména | https://tankuj100.silkroadbrand.eu |

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
   z verzovaného `be/db/seed.sqlite` (411 benzínek v ČR). Jinak živou DB **zazálohuje** do
   `be/db/_backups/` (rotace 10),
2. `npm ci` v `be/`,
3. `pm2 startOrReload tankuj100.config.cjs` + `pm2 save`.

Tabulky pro hodnocení (`review`), hlášení (`report`) a hlasy o palivu (`fuel_vote`)
si server vytvoří sám při startu (`be/src/db.js`), migrace jsou idempotentní.

**Živá DB je mimo git** (`.gitignore`), takže přežije každý `git pull` i deploy –
úpravy stanic z admin UI ani hodnocení uživatelů se nepřepíšou. `node_modules` se
do gitu taky necommitují, instalují se přes `npm ci` při deploy.

## Konfigurace (`be/.env`)

Soubor **není v gitu**. Vzor je `be/.env.example`; na serveru ho vytvoř a doplň:

| proměnná | k čemu |
|--|--|
| `PORT` | port API (musí sedět s nginx a PM2, výchozí 3000) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | přihlášení do adminu. **Bez nich je admin vypnutý** (503) – to je záměr, ať se veřejně neotevře. |
| `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` | notifikace přes EmailJS (stejný účet jako formulář na silkroadbrand.eu) |
| `EMAILJS_PRIVATE_KEY` | jen když v EmailJS zapneš vynucení private key pro ne-browser volání |
| `NOTIFY_EMAIL` | kam mají notifikace chodit (předává se šabloně jako `to_email`) |
| `MAIL_MAX_PER_HOUR` | strop notifikací za hodinu (ochrana schránky) |

Po změně `.env` je potřeba `pm2 restart tankuj100 --update-env`.

Když e-maily nejsou nakonfigurované, aplikace **funguje dál** – hlášení se uloží do DB
a notifikace se jen zapíše do `pm2 logs`. Nic se neztratí.

## Úklid dat (jednorázově / po novém importu)

Data z fuelo.net obsahují i benzínky v Německu, Rakousku a Polsku a u části záznamů
je místo značky azbukou „Бензиностанция“. Skript to vyčistí:

```bash
cd /var/www/tankuj100/be
node scripts/cleanup-db.js --dry-run   # jen vypíše, co by udělal
node scripts/cleanup-db.js             # provede (předtím zazálohuje DB)
```

Test „je bod v ČR?“ dělá point-in-polygon proti hranici z OpenStreetMap
(`be/data/cz-border.json`, zjednodušená na ~200 m). Skript je idempotentní.

## První nasazení

Předpoklady: Node 18+ (ideálně přes nvm), `pm2` globálně (`npm i -g pm2`),
build nástroje pro nativní modul `better-sqlite3`
(`sudo apt-get install -y build-essential python3`), `sqlite3` (kvůli zálohám).

1. **Kód**: `git clone https://github.com/TheMartas29/tankuj100.git /var/www/tankuj100`
2. **Konfigurace**: `cp be/.env.example be/.env` a doplň hodnoty (viz tabulka výše).
3. **Deploy**: `cd /var/www/tankuj100 && ./deploy.sh -y`
   (naseeduje DB ze seedu, nainstaluje závislosti, nastartuje PM2)
4. **Autostart po rebootu** (stačí jednou): `pm2 startup` (spusť vypsaný příkaz),
   pak `pm2 save`.
5. **nginx**: `sudo cp deploy/nginx.tankuj100.conf.example /etc/nginx/sites-available/tankuj100`,
   nahraď `__DOMENA__`, pak
   `sudo ln -s /etc/nginx/sites-available/tankuj100 /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`.
6. **HTTPS**: `sudo certbot --nginx -d __DOMENA__`.

## Endpointy

Veřejné (volá iOS aplikace):

| metoda | cesta | k čemu |
|--|--|--|
| GET | `/api/map/` | body do mapy + agregované hodnocení a verdikt E5 |
| GET | `/api/detail/:id` | detail benzínky |
| GET | `/api/fuel-prices/:stationId` | ceny paliv z fuelo.net (15 min cache) |
| GET | `/api/stations/:id/feedback?device_id=…` | hodnocení, komentáře, hlasy o palivu, moje odpovědi |
| POST | `/api/stations/:id/reviews` | uložit/upravit hodnocení (1 na zařízení) |
| DELETE | `/api/stations/:id/reviews` | smazat vlastní hodnocení |
| POST | `/api/stations/:id/reports` | nahlásit nesrovnalost → e-mail |
| POST | `/api/stations/:id/fuel-vote` | hlas E5 / E10 / nevím |
| GET | `/health` | monitoring |
| GET | `/privacy` | zásady soukromí (URL pro App Store Connect) |

Za basic auth: `/` a `/admin` (UI) a `/api/admin/*`
(`stats`, `reports`, `reviews`, `stations`, `test-mail`).

Zápisové endpointy mají rate-limit podle IP + `device_id` a limit 3 hlášení
na benzínku a zařízení za 24 h.

## iOS aplikace

iOS klient volá API přes `NetworkClient.BASE_URL` = `https://tankuj100.silkroadbrand.eu`.
HTTPS je pro App Store povinné (ATS), výjimka `NSAllowsArbitraryLoads` je odebraná.

Zařízení se identifikuje anonymním UUID v `UserDefaults` (`DeviceIdentity`) – žádné
přihlašování, žádný e-mail, nic, čím by šel uživatel dohledat.

## Užitečné

```bash
pm2 status              # přehled procesů
pm2 logs tankuj100      # logy API (i notifikace, když e-mail není nastavený)
pm2 restart tankuj100 --update-env   # restart po změně .env
curl -s localhost:3000/health                   # rychlý test
curl -s localhost:3000/api/map/ | head -c 200   # data pro mapu
```
