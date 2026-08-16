# Nasazení tankuj100 (PM2 + nginx)

Backend (`be/`) je Node/Express API, které:
- servíruje mapová data a detaily benzinek ze SQLite (`be/db/tankuj100db.sqlite`),
  včetně toho, **jaká paliva** stanice čepuje (98 / 100 oktanů, nafta, LPG, …),
- přijímá **hodnocení, komentáře, hlášení nesrovnalostí a hlasy o typu benzínu** z aplikace,
- posílá **e-mailové notifikace** o nových hlášeních (EmailJS),
- obsluhuje **admin UI** na `/` (za basic auth).

Nasazení běží stejným způsobem jako ostatní projekty (bale): jeden **PM2** proces,
před ním **nginx** jako reverzní proxy, deploy jedním skriptem z gitu.

| | tankuj100 |
|--|--|
| složka na serveru | `/root/projects/tankuj100` (nebo kam je repo naklonované) |
| port (PM2 env) | 3000 |
| PM2 app | `tankuj100` |
| deploy skript | `./deploy.sh` |
| doména | https://tankuj100.silkroadbrand.eu |

## Běžný deploy (po prvním nasazení)

```bash
cd /root/projects/tankuj100
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

Tabulky pro hodnocení (`review`), hlášení (`report`), hlasy o palivu (`fuel_vote`)
i pro data o stanicích (`station_fuel`, `station_tag`, `station_source`) si server vytvoří sám při startu
(`be/src/db.js`), migrace jsou idempotentní.

**Živá DB je mimo git** (`.gitignore`), takže přežije každý `git pull` i deploy –
úpravy stanic z admin UI ani hodnocení uživatelů se nepřepíšou. `node_modules` se
do gitu taky necommitují, instalují se přes `npm ci` při deploy.

## Zálohy databáze

Uživatelský obsah (hodnocení, komentáře, hlášení) je **jen v živé DB** – jinde ho
nemáme, takže zálohy jsou jediná pojistka. Běží automaticky z cronu.

```bash
be/scripts/backup-db.sh            # záloha + rotace (běží z cronu ve 3:17)
be/scripts/backup-db.sh --list     # co je zazálohované
be/scripts/restore-db.sh           # vypíše zálohy k obnovení
be/scripts/restore-db.sh daily-20260811-031701.sqlite.gz   # obnoví (ptá se)
be/scripts/pull-backups.sh         # stáhne zálohy ze serveru k sobě (spouštět na Macu)
```

Jak to funguje:
- kopie se dělá přes `sqlite3 .backup`, tedy **včetně WAL** a bez rizika, že chytneme
  rozepsanou transakci (prostý `cp` živé DB tohle nezaručuje),
- každá kopie se **ověří** (`PRAGMA integrity_check` + kontrola, že v ní jsou stanice)
  ještě než se uloží – neověřená záloha není záloha,
- ukládá se zabalená do `be/db/_backups/` jako `daily-*.sqlite.gz` (~30 kB),
- **retence**: 30 denních + 12 měsíčních (první záloha v měsíci se odloží jako měsíční),
- průběh se loguje do `be/db/_backups/backup.log`.

Rotace se dívá vždy jen na vlastní předponu, takže si zálohy z cronu, z deploye
(`deploy-*`) a ruční (`pre-cleanup-*`, `pre-restore-*`) navzájem nemažou.

Cron na serveru (`crontab -e`):

```
17 3 * * * /root/projects/tankuj100/be/scripts/backup-db.sh >/dev/null 2>&1
```

Obnova zastaví PM2, **původní DB nesmaže** – jen ji odloží jako `pre-restore-*.sqlite` –
a nasadí zálohu. Když ověření zálohy selže, živá DB zůstane nedotčená.

⚠️ Zálohy leží na stejném disku jako živá DB, takže chrání před chybou v aplikaci
nebo omylem v adminu, **ne** před ztrátou serveru. Off-site kopii dělá
`pull-backups.sh` na Macu (stahuje do `~/Backups/tankuj100`).

Na Macu ho pouští launchd každý den v 10:30 – ne v noci, protože spící notebook
by úlohu prospal. Instalace na novém stroji:

```bash
cp deploy/cz.silkroad.tankuj100.backups.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/cz.silkroad.tankuj100.backups.plist
launchctl start cz.silkroad.tankuj100.backups   # zkušební běh
```

Průběh je v `~/Backups/tankuj100/pull.log`. Když je server nedostupný (notebook
na cestách), skript skončí tiše – ať plánovač nespamuje chybami.

## Konfigurace (`be/.env`)

Soubor **není v gitu**. Vzor je `be/.env.example`; na serveru ho vytvoř a doplň:

| proměnná | k čemu |
|--|--|
| `PORT` | port API (musí sedět s nginx a PM2, výchozí 3000) |
| `HOST` | adresa, na které server poslouchá. Výchozí `127.0.0.1` = jen přes nginx. Na `0.0.0.0` přepínej jen kvůli ladění z jiného zařízení v síti. |
| `ENV_NAME` | `production` nebo `test` – hlásí to `/api/ping` a aplikace podle toho pozná, s kým mluví |
| `APP_KEY`, `APP_KEY_MODE` | klíč mobilní aplikace, viz níže |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | přihlášení do adminu. **Bez nich je admin vypnutý** (503) – to je záměr, ať se veřejně neotevře. |
| `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` | notifikace přes EmailJS (stejný účet jako formulář na silkroadbrand.eu) |
| `EMAILJS_PRIVATE_KEY` | jen když v EmailJS zapneš vynucení private key pro ne-browser volání |
| `NOTIFY_EMAIL` | kam mají notifikace chodit (předává se šabloně jako `to_email`) |
| `MAIL_MAX_PER_HOUR` | strop notifikací za hodinu (ochrana schránky) |

Po změně `.env` je potřeba `pm2 restart tankuj100 --update-env`.

Když e-maily nejsou nakonfigurované, aplikace **funguje dál** – hlášení se uloží do DB
a notifikace se jen zapíše do `pm2 logs`. Nic se neztratí.

## Klíč mobilní aplikace (`X-App-Key`)

Aplikace posílá u každého volání hlavičku `X-App-Key`. Hodnota je v iOS v
`APIClient.appKey` a na serveru v `APP_KEY`; **musí být stejná**.

Není to tajemství – z binárky aplikace ji jde vytáhnout. Smysl je odfiltrovat boty
a `curl`, ne odolat útočníkovi. Proti cílenému zneužití by pomohl až Apple App Attest.

`APP_KEY_MODE` má tři stavy:

| režim | request bez klíče |
|--|--|
| `off` | projde, nic se neděje (platí i když `APP_KEY` je prázdný – překlep v `.env` nesmí zamknout API) |
| `soft` | projde, jen se jednou za hodinu spočítá do `pm2 logs` |
| `hard` | dostane 401 |

**Zavádění i výměna klíče vždy přes `soft`**, jinak starším buildům aplikace API
přestane fungovat ze dne na den:

1. na serveru `APP_KEY=<nový>`, `APP_KEY_MODE=soft`, `pm2 restart tankuj100 --update-env`
2. vydat verzi aplikace se stejným klíčem
3. sledovat `pm2 logs tankuj100 | grep app-key` – hlásí, kolik requestů chodí bez klíče
4. až je číslo prakticky nula, přepnout na `APP_KEY_MODE=hard` a restartovat

`/health` klíč nevyžaduje nikdy (kvůli monitoringu) a `/api/admin/*` taky ne – ten má
vlastní basic auth a prohlížeč by hlavičku stejně neposlal.

## Nahrání buildu do App Store Connect

Potřeba jednou nastavit (obojí vyžaduje přihlášení k Apple ID, takže to nejde
automatizovat):

1. **Distribuční certifikát** pro tým `R5MFNT4B5A` – Xcode → Settings → Accounts →
   Manage Certificates → **+** → Apple Distribution. V klíčence musí být vidět jako
   `Apple Distribution: … (R5MFNT4B5A)`; ověř přes `security find-identity -v -p codesigning`.
2. **App Store Connect API klíč** – App Store Connect → Users and Access →
   Integrations → App Store Connect API → **+**, role Developer nebo App Manager.
   Stažený `AuthKey_XXXXXXXX.p8` patří do `~/.appstoreconnect/private_keys/`.
   Poznamenej si **Key ID** a **Issuer ID**.

Potom už je nahrání tři příkazy:

```bash
cd ios/tankuj100 && xcodebuild -project tankuj100.xcodeproj -scheme tankuj100 -configuration Release -archivePath build/tankuj100.xcarchive -destination 'generic/platform=iOS' archive
```

```bash
cd ios/tankuj100 && xcodebuild -exportArchive -archivePath build/tankuj100.xcarchive -exportOptionsPlist ../ExportOptions.plist -exportPath build/export
```

```bash
xcrun altool --upload-app -f ios/tankuj100/build/export/tankuj100.ipa -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
```

Číslo buildu (`CURRENT_PROJECT_VERSION`) musí být u stejné verze pokaždé vyšší než
u předchozího nahrání, jinak App Store Connect build odmítne.

Archivuje se **jen schéma `tankuj100`** – testovací schéma má jiné bundle ID a do
App Storu nepatří.

⚠️ **Backend musí být na produkci dřív než aplikace.** Verze 1.1 filtruje podle masek
`f`/`s` z `/api/map/`; dokud je produkce neposílá, filtr na palivo ani na služby
nic nenajde (masky jsou nula). Pořadí je tedy: nasadit backend na produkci → ověřit,
že `/api/map/` masky vrací → teprve pak nahrát build.

## Testovací prostředí

| | produkce | test |
|--|--|--|
| doména | tankuj100.silkroadbrand.eu | tankuj100-test.silkroadbrand.eu |
| stroj | VPS `root@80.211.200.128` | `roman@192.168.0.73` (ven přes duckdns) |
| složka | `/root/projects/tankuj100` | `/var/www/tankuj100-test` |
| `APP_KEY_MODE` | `soft` (do vydání verze s klíčem) | **`hard`** |
| `APP_KEY` | jiný než na testu | jiný než na produkci |
| e-maily | EmailJS | vypnuté (jen do logu) |

Klíče se **nesmí** shodovat – jinak by přístup k testu otevřel i produkci.

Test je uzavřený právě tím klíčem: bez něj vrací `/api/*` 401. Nginx tam navíc
posílá `X-Robots-Tag: noindex, nofollow`, ať se doména neobjeví ve vyhledávačích.

### Testovací aplikace: vlastní schéma, ne přepínač

Od verze 1.1 jsou to **dvě samostatné aplikace**, které jdou mít v telefonu vedle sebe:

| schéma | konfigurace | bundle ID | název na ploše | prostředí |
|--|--|--|--|--|
| `tankuj100` | Debug / Release | `cz.silkroad.tankuj100` | tankuj100 | produkce |
| `tankuj100 TEST` | Debug Test / Release Test | `cz.silkroad.tankuj100.test` | tankuj100 TEST | test |

Prostředí se určuje **při překladu** podle `TANKUJ_TEST`
(`SWIFT_ACTIVE_COMPILATION_CONDITIONS`, nastaveno na úrovni projektu u konfigurací
`… Test`), vyhodnocuje se v `AppEnvironment`. Za běhu se přepnout nedá.

```bash
xcodebuild -project tankuj100.xcodeproj -scheme 'tankuj100 TEST' -configuration 'Debug Test' -destination 'id=<UDID>' build
```

Testovací build o sobě dává vědět oranžovým pruhem „TESTOVACÍ PROSTŘEDÍ“ přes mapu
a odznakem v „O aplikaci“.

Dřív to řešil skrytý přepínač (7× klepnutí na verzi) a v binárce byly oba klíče.
Rozdělení je lepší ve třech ohledech: **v každém buildu je jen jeho vlastní klíč**
(kdo rozebere ostrou aplikaci, na test se nedostane), uživatel si prostředí nepřepne
omylem, a odpadá skrytá nepopsaná funkce, kterou App Review zakazuje (2.3.1).

⚠️ Pozor na `project.pbxproj`: je to starý formát plistu, kde **hodnota s mezerou
musí být v uvozovkách** – `name = "Debug Test";`. Bez uvozovek Xcode projekt tiše
odmítne otevřít. `plutil -lint` tenhle soubor neumí, kontroluj `xcodebuild -list`.

Při výměně klíče se musí změnit **obě strany** – `APP_KEY` v `.env` daného prostředí
i konstanta v `AppEnvironment.appKey` – a vydat novou verzi aplikace.

## Data o benzínkách: OpenStreetMap (ODbL)

Seznam benzínek pochází z **OpenStreetMap** – držíme jen stanice, které mají v OSM
`fuel:octane_98=yes` nebo `fuel:octane_100=yes` (~558 v ČR). Ceny paliv **nesledujeme**,
zobrazuje se jen to, jaká paliva stanice čepuje (`station_fuel`) a co má za vybavení
(`station_tag`). Původní zdroj (fuelo.net) už se nepoužívá a `station.station_id`
(staré fuelo ID) je nově vždy `NULL`; identita bodu je `station.osm_id`
(např. `node/39826162`).

⚠️ **Licence ODbL vyžaduje uvedení zdroje.** Atribuce se musí objevit všude, kde se
data zobrazují:
- v aplikaci (obrazovka O aplikaci / detail benzínky): **„Data © přispěvatelé
  OpenStreetMap, licence ODbL“** s odkazem na <https://www.openstreetmap.org/copyright>,
- v zásadách soukromí (`be/privacy.html`),
- u každého záznamu v DB jako `station.data_source` (vyplňuje import).

Import a aktualizace dat:

```bash
cd /root/projects/tankuj100/be
node scripts/import-osm.js --dry-run   # jen vypíše, co by se stalo
node scripts/import-osm.js             # provede (předtím zazálohuje DB)
```

## Synchronizace se zdroji značek (`sync-brands.js`)

OSM je jen základ – aktuální stav sítě mají značky na svých webech. `sync-brands.js`
je obejde, data stáhne a nalije do stejných tabulek jako import z OSM.

Zdroje (jeden soubor na značku v `be/src/sources/`, popis endpointů v `data/SOURCES.md`):
`orlen`, `mol`, `omv`, `shell`, `eurooil` (EuroOil + RoBiN OIL), `km-prona`, `one1`
(TOP TANK), `tank-ono`. Žádný z nich nepotřebuje klíč ani cookie.

Co skript dělá:
- **páruje** záznam se stanicí v DB v tomto pořadí: podle uložené vazby
  `station_source(source, external_id)` → nejbližší stanice stejné značky do 150 m →
  u zdrojů bez souřadnic (Tank ONO) podle názvu obce. Vazba se ukládá, takže druhý
  běh už páruje napevno,
- **zakládá** novou stanici jen tehdy, když čerpá 98 nebo 100 oktanů a má důvěryhodné
  souřadnice (nula/nula a body mimo ČR se zahazují). Obyčejné pumpy do aplikace nepatří,
- **aktualizuje** u napárovaných stanic název, adresu, obec, PSČ, telefon, otevírací
  dobu, paliva a služby – v rámci vlastní sítě je značka autoritativní. Doplní i
  `station.data_source` (např. `OpenStreetMap (ODbL) + Orlen (orlen.cz)`),
- **nikdy nic nemaže.** Stanice, kterou zdroj přestal vracet, se jen vypíše v reportu
  jako „možná zrušená“ – visí na ní hodnocení, hlášení a hlasy uživatelů,
- **přeskočí zdroj, který vypadá rozbitě.** Když vrátí míň než polovinu stanic, které
  na něj už máme napárované, změny se za něj neaplikují a jen se to nahlásí. Výpadek
  jednoho webu neshodí celý běh, chyba se vypíše v reportu.

```bash
cd /root/projects/tankuj100/be
node scripts/sync-brands.js --dry-run        # jen vypíše, co by udělal
node scripts/sync-brands.js                  # provede (předtím zazálohuje DB)
node scripts/sync-brands.js --source=orlen   # jen jedna značka
node scripts/sync-brands.js --limit 20       # jen prvních 20 stanic ze zdroje (ladění)
```

Plný běh trvá ~10 minut a udělá kolem tisícovky requestů – Orlen, Shell, KM-PRONA,
One1 a Tank ONO se musí doptat na detail každé stanice. Skript je **idempotentní**:
druhý běh hned po prvním nahlásí nula změn.

Data se mění po měsících, takže **stačí jednou týdně**. Cron na serveru
(`crontab -e`), schválně mimo čas noční zálohy ve 3:17:

```
40 3 * * 1 cd /root/projects/tankuj100/be && /usr/bin/env node scripts/sync-brands.js >> db/_backups/sync-brands.log 2>&1
```

(`node` z nvm nemusí být v cronové `PATH` – pak do crontabu dej plnou cestu, kterou
vypíše `which node`.)

### Když import nasekal škodu

Před každým ostrým během se dělá záloha do `be/db/_backups/pre-sync-brands-*.sqlite`,
takže návrat je prostý:

```bash
pm2 stop tankuj100
cp be/db/_backups/pre-sync-brands-<časová-značka>.sqlite be/db/tankuj100db.sqlite
rm -f be/db/tankuj100db.sqlite-wal be/db/tankuj100db.sqlite-shm
pm2 start tankuj100
```

Starší stav (denní/měsíční zálohy z cronu) obnoví `be/scripts/restore-db.sh`.
Když je špatně jen jedna značka, jde po opravě adaptéru pustit `--source=<značka>`
znovu – hodnoty se přepíšou a stanice se podruhé nezaloží, drží ji `station_source`.

## Úklid dat (jednorázově / po novém importu)

Ve starých datech (fuelo.net) byly i benzínky v Německu, Rakousku a Polsku a u části
záznamů místo značky azbukou „Бензиностанция“. Skript to vyčistí:

```bash
cd /root/projects/tankuj100/be
node scripts/cleanup-db.js --dry-run   # jen vypíše, co by udělal
node scripts/cleanup-db.js             # provede (předtím zazálohuje DB)
```

Test „je bod v ČR?“ dělá point-in-polygon proti hranici z OpenStreetMap
(`be/data/cz-border.json`, zjednodušená na ~200 m). Skript je idempotentní.

## První nasazení

Předpoklady: Node 18+ (ideálně přes nvm), `pm2` globálně (`npm i -g pm2`),
build nástroje pro nativní modul `better-sqlite3`
(`sudo apt-get install -y build-essential python3`), `sqlite3` (kvůli zálohám).

1. **Kód**: `git clone https://github.com/TheMartas29/tankuj100.git /root/projects/tankuj100`
2. **Konfigurace**: `cp be/.env.example be/.env` a doplň hodnoty (viz tabulka výše).
3. **Deploy**: `cd /root/projects/tankuj100 && ./deploy.sh -y`
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
| GET | `/api/map/` | body do mapy: `id, lat, lon, brand_name, rating_avg, rating_count, has_98, has_100` |
| GET | `/api/detail/:id` | detail benzínky + `osm_id`, `fuels[]` a `services[{key,value}]` |
| GET | `/api/stations/:id/feedback?device_id=…` | hodnocení, komentáře, hlasy o palivu, moje odpovědi |
| POST | `/api/stations/:id/reviews` | uložit/upravit hodnocení (1 na zařízení) |
| DELETE | `/api/stations/:id/reviews` | smazat vlastní hodnocení |
| POST | `/api/stations/:id/reports` | nahlásit nesrovnalost → e-mail (`closed`, `fuel`, `location`, `content`, `other`) |
| POST | `/api/stations/:id/fuel-vote` | hlas E5 / E10 |
| GET | `/api/ping` | s jakým prostředím aplikace mluví (`ENV_NAME`) |
| GET | `/health` | monitoring – vrací jen `{ok:true}`, nic o vnitřku serveru |
| GET | `/privacy` | zásady soukromí (URL pro App Store Connect) |

Za basic auth: `/` a `/admin` (UI) a `/api/admin/*`
(`stats`, `reports`, `reviews`, `stations`, `test-mail`).

`/api/map/` posílá `ETag` a `Cache-Control: no-cache`, takže aplikace na nezměněná
data dostane 304 místo 128 kB. Hotová odpověď se navíc drží minutu v paměti a zápis
si ji zneplatní sám.

## Limity a ochrany

Všechno se počítá v paměti procesu, takže `pm2 restart` limity vynuluje. To je záměr –
jde o minuty, ne o trvalé zákazy.

| co | strop | podle čeho |
|--|--|--|
| čtení i zápisy dohromady | 1200 / h | IP |
| jen zápisy (POST, PATCH, DELETE) | 120 / h | IP |
| hodnocení | 15 / h | IP + `device_id` |
| hlášení | 10 / h | IP + `device_id` |
| hlasy o palivu | 40 / h | IP + `device_id` |
| hlášení jedné benzínky | 3 / 24 h | `device_id` |
| pokusy o přihlášení do adminu | 10 / 15 min | IP |

Proč mají zápisy strop navíc: `device_id` si posílá klient sám, takže limity vázané
na něj obejde kdokoli, kdo si ho generuje náhodně. Strop podle IP obejít nejde.

Po deseti nepovedených přihlášeních se adresa na čtvrt hodiny zavře a nepustí ani
správné heslo – jinak by útočník poznal, že heslo uhodl, protože by najednou dostal
jinou odpověď. **Když se zamkneš sám, stačí počkat, nebo `pm2 restart tankuj100`.**
Requesty úplně bez přihlašovacích údajů se do pokusů nepočítají – prohlížeč se takhle
ptá pokaždé, než dostane výzvu, a jinak by si admin zamkl sám sebe.

Server posílá `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` a na HTML
stránkách i `Content-Security-Policy`. Nginx přidává totéž – dvojí hlavička nevadí a
kdyby někdo šel na Node přímo, ochrana platí i tak. `/api/admin/*` navíc odmítá
požadavky s cizí hlavičkou `Origin`, což je obrana proti CSRF: prohlížeč si údaje
basic auth pamatuje a přiložil by je i k requestu, který vyvolala cizí stránka.

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
