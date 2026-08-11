# Zdroje dat o čerpacích stanicích (ČR)

Průzkum k 12. 8. 2026. Cílem je pro každou značku najít strojově čitelný zdroj, který jde volat
z cronu na serveru — tj. **bez cookies, bez session, bez přihlášení**.
Všechny endpointy níže byly ověřeny `curl`em mimo prohlížeč (čistý stav, žádné cookies).

Ukázky odpovědí: `data/samples/<znacka>.json`.

## Přehled

| Značka | Typ zdroje | Endpoint / stránka | Stanic v ČR | z toho 98/100 okt. | Souřadnice | Paliva | Ověřeno curlem bez cookies |
|---|---|---|---|---|---|---|---|
| Orlen (+ Benzina) | JSON API | `www.orlen.cz/cs-CZ/api/stations/list` + `/api/stations/{country}/{id}` | 466 | 343 (Verva 100) | ano (18× 0,0) | ano | ano |
| MOL | JSON API (POST) | `cerpacistanice.molcesko.cz/api.php` | 314 (302 MOL, 11 PapOil, 1 Slovnaft) | 250 (EVO 100 Plus) | ano | ano | ano |
| OMV | JSON API (POST, WIGeoGIS) | `app.wigeogis.com/kunden/omv/data/getresults.php` + `getconfig.php?STATIONID=` | 138 | 130 (MaxxMotion 100plus) | ano | přes filtr / detail | ano |
| Shell | JSON API (geoapp.me) | `shellretaillocator.geoapp.me/api/v2/locations/...` | 181 | 107 (V-Power Racing 100) | ano | v detailu / přes filtr | ano |
| EuroOil + RoBiN OIL | JSON vložený v HTML | `www.ceproas.cz/eurooil/cerpaci-stanice` | 284 (218 EuroOil + 66 RoBiN OIL) | 80 (BA 98) | ano | ano | ano |
| KM-PRONA | JSON vložený v HTML + HTML detail | `km-prona.cz/cerpaci-stanice/interaktivni-mapa` | 52 | 38 (Natural 98) | ano | až v detailu stanice | ano |
| TOP TANK / One1 | JSON v atributu HTML + HTML detail | `www.one1.eu/cerpaci-stanice` | 37 | 19 (Natural 98) | ano | až v detailu stanice | ano |
| Tank ONO | jen HTML scraping | `www.tank-ono.cz/cz/index.php?page=cenik` / `page=pumpcard&pump=N` | 46 | 43 (Natural 98) | jen přes goo.gl redirect | ano (z ceníku) | ano |

Poznámka: `tankono.cz` (bez pomlčky) je parkovaná doména s reklamou, správná je **`tank-ono.cz`**.
`robinoil.cz` přesměrovává na `srdcovka.eurooil.cz` — RoBiN OIL je součástí Čepro/EuroOil a
najdeš ho ve stejném datasetu jako EuroOil (`type: "2"`).

---

## 1. Orlen / Benzina

**Seznam stanic (souřadnice + ID)**

```
GET https://www.orlen.cz/cs-CZ/api/stations/list
      ?topN=0&now=false&nonstop=false&fuelTypes=&accessoryTypes=&gastroTypes=
      &paymentTypes=&carWashTypes=&stationTypes=&countries=
```

Povinné: **všechny** parametry musí být přítomné (i prázdné), jinak 400
(`"The filters field is required."`). `countries` chce čárkou oddělené **integery**,
takže se nechává prázdné (web je jen CZ, vrací se 466 stanic, všechny `country: "CZ"`).
Hlavičky: stačí `User-Agent: Mozilla/5.0`; bez UA server občas resetuje spojení
(`curl: (56)`) — vyplatí se přidat i `--http1.1` a `Referer: https://www.orlen.cz/stanice`.

```json
{"totalStationCount":466,"stations":[
  {"id":{"stationId":101,"country":"CZ"},
   "location":{"lat":50.122571900000,"lng":12.368463100000}},
  {"id":{"stationId":102,"country":"CZ"},
   "location":{"lat":50.319593100000,"lng":12.519159000000}}
]}
```

- lat/lon: `stations[].location.lat` / `.lng` — **18 stanic má 0.0/0.0** (nutné ošetřit)
- ID stanice: `stations[].id.stationId`

**Detail stanice**

```
GET https://www.orlen.cz/cs-CZ/api/stations/CZ/{stationId}
```

```json
{"station":{
  "id":{"stationId":101,"country":"CZ"},
  "name":"FRANTIŠKOVY LÁZNĚ",
  "address":{"streetAndNumber":"Aleje – Zátiší 53","city":"Františkovy Lázně","country":"CZ"},
  "openingHours":[{"weekdayFrom":0,"weekdayTo":6,"from":"00:00","to":"23:59"}],
  "icons":["~/getmedia/.../verva-100.png?width=79...","~/getmedia/.../efecta-95.png?..."],
  "discounts":[{"fuelType":"Verva 100","discountAmount":1.0,"currency":"Kč"}]
}}
```

- adresa: `station.address.streetAndNumber` + `.city` — **PSČ tu není**
- otevírací doba: `station.openingHours[]` (`weekdayFrom` 0 = pondělí)
- paliva: `station.icons[]` — název souboru je kód paliva (`verva-100`, `verva-diesel`,
  `efecta-95`, `efecta-diesel`, `adblue-kanystr`, …). `station.discounts[].fuelType`
  obsahuje totéž čitelně, ale je vázané na probíhající slevovou akci → **spolehlivější jsou `icons`**.
- telefon: `station.contacts[]` (často prázdné)

**Rychlejší cesta k Verva 100 bez 466 detailních requestů:** `list` umí filtrovat palivem —
`&fuelTypes=2` vrátí 343 stanic s Verva 100. Kódy paliv jsou v HTML `/stanice`
v proměnné `filters` (`fuelFilter`): `1` Verva Diesel, `2` **Verva 100**, `3` Efecta Diesel,
`4` Efecta 95, `6` CNG, `7` AdBlue, `10` kap. do ostřikovačů, `11` elektronabíječka,
`12` H2, `13` LPG, `14` HVO100 Diesel. Ověřeno na 20 náhodných stanicích: filtr `fuelTypes=2`
se 100% shoduje s přítomností `verva-100` v `icons`.

Poznámky: bez tokenu, bez rate limitu (466 detailů proběhlo bez problému), bez stránkování.

---

## 2. MOL

Doména `mol.cz` z tohoto prostředí **netimeoutuje na DNS, ale na TCP** (nepřipojí se);
funkční je `molcesko.cz` a hlavně samostatný vyhledávač na `cerpacistanice.molcesko.cz`.

```
POST https://cerpacistanice.molcesko.cz/api.php
Content-Type: application/json

{"api":"stations","mode":"country","lang":"cs","input":"CZ"}
```

Jediné volání → **celá síť v jednom JSON poli (314 záznamů, ~1,2 MB)**. Nejbohatší zdroj ze všech.

```json
[{"code":"2031100805","brand":"MOL","company":"MOL Ceska",
  "postcode":"739 42","city":"Chlebovice","address":"Chlebovice 310",
  "name":"Chlebovice D48 to FM","phoneNum":"+420720036225","stationStatus":"1",
  "gpsPosition":{"latitude":49.6555328,"longitude":18.2499142},
  "openedHours":{"openedSummerWeekDay":"00:00-24:00","openedSummerSaturday":"00:00-24:00", "...":"..."},
  "fuelsAndAdditives":{"values":[{"id":"EVO_95","name":"EVO 95"},
                                 {"id":"EVO_100_PLUS","name":"EVO 100 Plus"},
                                 {"id":"EVO_DIESEL","name":"EVO Diesel"}]},
  "services":{"values":[{"id":"AD_BLUE","name":"AdBlue"},{"id":"SHOP","name":"Obchod"}]},
  "gastroCategory":{"values":[{"id":"FRESH_CORNER","name":"Fresh Corner"}]}}]
```

- lat/lon: `gpsPosition.latitude` / `.longitude`
- adresa: `address` + `city` + `postcode` (+ `county` = kraj)
- paliva: `fuelsAndAdditives.values[].id` — **`EVO_100_PLUS` = 100 oktanů** (250 stanic)
- otevírací doba: `openedHours` (letní/zimní varianta zvlášť, `winterToSummerDate`/`summerToWinterDate`)
- služby: `services.values[]`, gastro `gastroCategory.values[]`, karty `cards.values[]`
- ID: `code` (např. `2031100805`)

Filtrovat je nutné na straně klienta:
- `brand`: `MOL` (302), `PapOil` (11), `Slovnaft` (1)
- `stationStatus`: `1` = v provozu (293), dále `2` (12), `5` (6), `3` (3) — web si nechává jen `[1,4]`

Bez tokenu, bez cookies, bez stránkování.

---

## 3. OMV

OMV nepoužívá vlastní API — vyhledávač je webkomponenta od **WIGeoGIS**.

**Seznam stanic**

```
POST https://app.wigeogis.com/kunden/omv/data/getresults.php
Content-Type: application/x-www-form-urlencoded

CTRISO=CZE&BRAND=OMV&VEHICLE=CAR&MODE=NEXTDOOR&ANZ=9999&PRESELECTED=
```

`HASH` a `TS` (z `getconfig.php`) prohlížeč posílá, ale **server je nekontroluje** — bez nich
endpoint vrací data stejně. Volitelně lze přidat filtry `QRY[]=<kriterium>`.

```json
[{"brand_id":"OMV","postcode":"586 01","address_l":"DÁLNICE D1 - 111 KM SMĚR BRNO",
  "town_l":"Pávov","country_l":"Česko","telnr":"+420567210039",
  "open_hours":"Mo-Su 00:00-24:00","national_code":"CZ",
  "opening_hours":"dayOfWeek=1,closed=FALSE,from=00:00,to=24:00#dayOfWeek=2,...",
  "sid":"CZ.2001.8","x":"15.59072","y":"49.45391","distance":0}]
```

- **pozor: `x` = longitude, `y` = latitude** (obráceně oproti zvyklosti)
- adresa: `address_l` + `town_l` + `postcode`
- otevírací doba: `open_hours` (OSM formát) i strukturovaně `opening_hours` (`#` odděluje dny)
- ID: `sid` (např. `CZ.2001.8`)
- paliva v seznamu **nejsou**

**Paliva — dvě možnosti**

a) Filtrem (1 request): stejné volání + `QRY[]=crtMAXXMOTION100` → **130 stanic**
   s MaxxMotion 100plus (z celkových 138). Další kódy: `crtMAXXMOTION95`, `crtMAXXMOTION`,
   `crtADBLUE`, `crtE10`, `crtERDGAS`, `crtCARWASH_HALL`, `crtOPEN24H`, `crtMOTORWAY`, …
   (celý seznam v `getconfig.php` → `confVariables.conf_criteriaArrayCAR`).

b) Detailem stanice:

```
GET https://app.wigeogis.com/kunden/omv/data/getconfig.php
      ?BRAND=OMV&CTRISO=CZE&LNG=CS&FILTERS=&STATIONID=CZ.2001.8
```
→ `confVariables.conf_STATIONDETAILS`:

```json
{"site_number_key":"CZ.2001.8","brand_id":"OMV","postcode":"586 01",
 "telnr":"+420567210039","email":"station.pavov.jih@omv.com",
 "address_l":"DÁLNICE D1 - 111 KM SMĚR BRNO","town_l":"Pávov",
 "x_coordinates":"15.59072","y_coordinates":"49.45391",
 "mm_super_100":1,"mm_95":1,"product_lpg":0,"product_erdgas":1,"adblue_pump":1,
 "shop":1,"viva":1,"carwash_boxes":null,"open_24_hours":1,"ladestation":"350"}
```

- 100 oktanů: `mm_super_100` (1/0)
- e-mail stanice je jen tady

Bez cookies, bez tokenu. Doporučeno: 1× seznam + 1× filtr `crtMAXXMOTION100` (2 requesty)
místo 138 detailů.

---

## 4. Shell

Vyhledávač na `shell.cz` je iframe na `shellretaillocator.geoapp.me` (platforma Geome).

**Seznam v bounding boxu**

```
GET https://shellretaillocator.geoapp.me/api/v2/locations/within_bounds
      ?sw[]=<lat>&sw[]=<lng>&ne[]=<lat>&ne[]=<lng>
      &locale=cs_CZ&format=json&driving_distances=false
```

Odpověď je `{"locations":[...], "clusters":[...]}`. **Pokud je oblast moc velká, vrátí se
prázdné `locations` a jen `clusters`** — každý cluster má `bounds`, takže se dá rekurzivně
zanořovat. Pro celé ČR (bbox 48.5/12.0 – 51.1/18.9) stačilo **60 requestů** a vyšlo
366 stanic, z toho **181 s `country_code == "CZ"`** (zbytek je přesah do DE/AT/PL/SK).

```json
{"locations":[
  {"id":"10032195","name":"8001 TŘEBÍČ","lat":49.20456,"lng":15.89127,"brand":"Shell",
   "country_code":"CZ","address":"SPOJOVACÍ 1329","city":"TŘEBÍČ","postcode":"674 01",
   "state":"Vysocina","telephone":"+420 568 843 254","inactive":false,
   "amenities":["carwash","shop","wifi","high_speed_diesel_pump"],
   "site_category":"conventional_fuel_site",
   "website_url":"https://find.shell.com/cz/fuel/10032195-8001-trebic/cs_CZ"}],
 "clusters":[{"centroid":[49.09,18.64],"bounds":{"sw":[49.09,18.31],"ne":[49.23,18.74]},"size":7}]}
```

**Ve `within_bounds` chybí `fuels`.** Paliva jsou v detailu:

```
GET https://shellretaillocator.geoapp.me/api/v2/locations/{id}?locale=cs_CZ&format=json
```

```json
{"id":"10032195","fuels":["premium_gasoline","premium_diesel",
                          "fuelsave_midgrade_gasoline","fuelsave_regular_diesel"],
 "opening_hours":[{"days":["Mon","Sun"],"hours":[["06:00","22:00"]]}],
 "forecourt_opening_hours":[...],"shop_opening_hours":[...],"ev_charging":[...],
 "fuel_pricing":[...],"offers":[...]}
```

- lat/lon: `lat` / `lng`
- adresa: `address` + `city` + `postcode` (+ `formatted_address`)
- paliva: `fuels[]` — **`super_premium_gasoline` = V-Power Racing 100**,
  `premium_gasoline` = V-Power 95, `fuelsave_midgrade_gasoline` = FuelSave 95
- ID: `id` (např. `10032195`)

**Zkratka:** `within_bounds` umí filtrovat palivem —
`&with_all[fuels][]=super_premium_gasoline` → jedním requestem **107 stanic v ČR**
s V-Power Racing 100 (filtrovaný výsledek se nemusí clusterovat).

Alternativa: `GET /api/v2/locations/nearest_to?lat=..&lng=..&limit=50&locale=cs_CZ&format=json`
— vrací i `fuels`, ale **`limit` je zastropovaný na 50** (500 už vrátí `{"errors":...}`).

Bez cookies, bez tokenu.

---

## 5. EuroOil + RoBiN OIL (Čepro)

Nemá REST API, ale **celá síť je v JSON poli přímo v HTML** stránky mapy —
v `<script>` ve volání `flags([...])` těsně před `initMapbox();`.

```
GET https://www.ceproas.cz/eurooil/cerpaci-stanice
```

Parsování: najdi `initMapbox();`, od něj zpět poslední `([{` … `}]);` a obsah načti jako JSON.

```json
[{"id":336,"cislo":861,"jmeno":"Trutnov","obec":"Trutnov","ulice":"Vlčická",
  "cislo_popisne":"","psc":"54202","kraj":"Kraj Královéhradecký","okres":"Trutnov",
  "telefon_stanice":"735720861","provozni_doba":"5:00 - 23:00",
  "latitude":50.58669,"longitude":15.87861,"active":1,"type":"2",
  "ba95n":1,"ba98":1,"opt95e":0,"optdiesel":1,"optdieselplus":1,"lpg":1,"cng":0,
  "adblue":0,"hvo":0,"myci_linka":0,"myci_box":1,"nonstop":0,"wifi":1,"pb":1,
  "souradnice":"50°35′12.073″N, 015°52′43.029″E"}]
```

- lat/lon: `latitude` / `longitude`
- adresa: `ulice` + `cislo_popisne`/`cislo_orientacni` + `obec` + `psc` (+ `kraj`, `okres`)
- paliva jsou boolean sloupce: `ba95n`, **`ba98`**, `ba91s`, `opt95e`, `optdiesel`,
  `optdieselplus`, `ekodiesel`, `e85`, `lpg`, `cng`, `hvo`, `adblue`, `fame`, `nm_bez_spd`
- otevírací doba: `provozni_doba` (+ `provozni_doba_nd` pro ne/svátky)
- **značka: `type`** — `"1"` = EuroOil (218 stanic), `"2"` = RoBiN OIL (66 stanic);
  ověřeno na `id 336` (Trutnov, Vlčická), což je reálně RoBiN OIL
- BA 98: celkem 80 stanic (39 EuroOil + 41 RoBiN OIL)
- `active` (1/0)

Pozor: záznamy obsahují i osobní/provozní údaje nájemců (`najemce_cs`, `ic_najemce_cs`,
`korespondenční_adresa_najemce_cs`, …) — do vlastní DB je neukládat.

Alternativní (horší) cesta: HTML seznam pod mapou je stránkovaný po 10 přes Nette AJAX
`GET /eurooil/cerpaci-stanice?widget-340-pageId=N&do=widget-340-getData`, ale bez session
cookie vrací jen `{"redirect": ...}`. JSON v HTML je jednodušší a kompletní.

---

## 6. KM-PRONA

Také bez API, ale JSON je vložený v HTML mapy.

```
GET https://km-prona.cz/cerpaci-stanice/interaktivni-mapa
```
→ v HTML `var stations = JSON.parse("…");` (JS string literál, načte se dvojím `json.loads`).

```json
[{"idstation":1,"station_name":"Bezno","station_address":"1-bezno",
  "gps":"50.361849, 14.792885","Lat":"50.361849","Lon":" 14.792885",
  "address":"Mělnická 311, Bezno 294 29","operating_time":"6.00–20.00",
  "phone":"326 395 516","contact":"Pavel Šulc",
  "quick":1,"washing":0,"wash_line":0,"cleaner":1,"propan":0,"lpg":0,
  "ccs":1,"dkv":1,"wifi":1,"refreshment":1,"sazka":1,"toll":0}]
```

- lat/lon: `Lat` / `Lon` (**`Lon` má na začátku mezeru — nutný `strip()`**), případně `gps`
- adresa: `address` (jeden řetězec „ulice čp, obec PSČ“, PSČ zvlášť není)
- otevírací doba: `operating_time`
- **paliva v tomto JSONu nejsou** — jsou až na detailu stanice

**Detail stanice / paliva**

```
GET https://km-prona.cz/seznam-stanic/{station_address}
```
(pozor: `/cerpaci-stanice/seznam-stanic/{slug}` dělá 301 na `/seznam-stanic/{slug}`, tedy `-L`)

Paliva se poznají z názvů obrázků:
`<img class="thumbnail" src="/base/images/fuels/natural_98.jpg?v=3">`

Výskyty napříč všemi 52 stanicemi:
`natural_95` 52×, `diesel_pro` 52×, `dpro_plus` 50×, `adblue` 44×, **`natural_98` 38×**, `lpg` 19×.
Nad každou ikonou je i počet stojanů (`<span>4x</span>`).

52 requestů, bez cookies, bez rate limitu.

---

## 7. TOP TANK / One1

Značka **TOP TANK s.r.o.** provozuje síť pod jménem **One1** (dřív F1 GAS / Free1),
web `one1.eu` (holdingový web je `toptank.eu`).

```
GET https://www.one1.eu/cerpaci-stanice
```
→ `<div class="Map-inner" data-data='[…]'>` — HTML-escapované JSON pole (37 stanic).

```json
[{"position":{"lat":"49.124959","lng":"13.210326"},
  "url":"https://www.one1.eu/station/map-detail/61","name":"Alžbětín",
  "open":false,"gastro":true,"wash":false,"fuelE5":true,"lpg":false,
  "adBlue":false,"electricCharger":false,"vingette":false,"toll":false}]
```

- lat/lon: `position.lat` / `position.lng` (jsou to **stringy**)
- adresa a paliva tu nejsou

**Modal s adresou + slug detailu**

```
GET https://www.one1.eu/station/map-detail/{id}
```
→ `<p class="Modal-address">Alžbětín 61, Železná Ruda, 34404</p>`
a `<a href="/alzbetin" class="Button Button--doubleArrow …">Podrobné informace</a>`

**Detail stanice — paliva a otevírací doba**

```
GET https://www.one1.eu/{slug}
```
Sekce `<h2>Paliva</h2>`:

```html
<div class="Fuel"><div class="Icon Icon--fuel-natural95"><span>E5</span></div></div>
<div class="Fuel"><div class="Icon Icon--fuel-natural98"></div></div>
<div class="Fuel Fuel--onextra"><div class="Icon Icon--fuel-racing"><span>Onextra</span></div></div>
<div class="Fuel"><div class="Icon Icon--fuel-diesel"></div></div>
<div class="Fuel"><div class="Icon Icon--fuel-adblue"><span>Kanystr</span></div></div>
```

Výskyty napříč 37 stanicemi: `fuel-diesel` 37×, `fuel-natural95`+E5 32×, `fuel-adblue` 31×,
`fuel-racing`+Onextra 20×, **`fuel-natural98` 19×**, `fuel-natural95`+E10 6×.

Důležité: **`Onextra` je „Natural 95 Onextra“, tedy 95 oktanů, ne prémiový 98!**
Prémiové palivo poznáš jen podle ikony `Icon--fuel-natural98`.

Celkem 1 + 37 + 37 = 75 requestů. Bez cookies, bez tokenu.

---

## 8. Tank ONO

**Žádné API, nejhorší zdroj z celé sady.** Starý PHP web bez strukturovaných dat.
Správná doména je `www.tank-ono.cz` (doména `tankono.cz` je parkovaná reklama).

**Seznam stanic**

```
GET https://www.tank-ono.cz/cz/index.php?page=pumpy
```
→ odkazy `index.php?page=pumpcard&pump=N`, N = 1..46 (pozor, v HTML mají některé
`pump=24 ` s koncovou mezerou).

**Ceník = nejlepší zdroj paliv** (jediná strojově čitelná tabulka na webu)

```
GET https://www.tank-ono.cz/cz/index.php?page=cenik
```

Dvě tabulky `<table class="cenik">` (CZK a EUR), 46 řádků každá.
Sloupce podle hlaviček (`<th><img src="../images/…">`):
`N95`, `N95+`, **`N98`**, `Diesel`, `Diesel+`, `AdBlue`, `LPG`, `OM`, `NM`.
Hodnota `---` = palivo se na stanici neprodává.

```
ČS Plzeň, Domažlická     38,90 | ---   | 40,90 | 41,90 | 42,50 | 12,50 | --- | --- | ---
ČS Plzeň, Studentská     38,90 | 39,50 | 40,90 | 41,90 | 42,50 | ---   | 20,50 | 99,00 | ---
ČS Krupá u Rakovníka     38,90 | ---   | ---   | 41,90 | 42,50 | 12,50 | --- | --- | ---
```

→ **43 ze 46 stanic prodává Natural 98.**

**Detail stanice**

```
GET https://www.tank-ono.cz/cz/index.php?page=pumpcard&pump=N
```

- název: `<div id="nadpis">Tank ONO s.r.o. - ČS Plzeň, Domažlická</div>`
- telefon/e-mail/vedoucí: `<div id="kontakty">`
- **adresa na stránce vůbec není** (jen město v názvu)
- paliva: podle názvů GIFů `../images/{n95c|n98c|dc|dpc|abc|lpgc|euro}.gif`
- ceny jsou vykreslené jako obrázky číslic (`n4.gif`, `m9.gif`, …) → z detailu nečitelné,
  proto ceník

**Souřadnice** jdou získat jen oklikou — na detailu je odkaz `<a href="https://goo.gl/maps/XXXXX">`
(ikona `mapicocz.gif`). Po následování redirectu (`curl -L`) je cíl ve tvaru
`https://www.google.cz/maps/place/Tank+ONO,+s.r.o./@49.7364283,13.330928,18z/...`,
odkud se lat/lng vytáhne regexem `@(-?\d+\.\d+),(-?\d+\.\d+)`.
Ověřeno na 6 stanicích — funguje, ale **je to křehké** (goo.gl je od 2025 postupně rušen).
Doporučení: souřadnice Tank ONO si udržovat ručně/z OSM, ne scrapovat při každém běhu.

---

## Souhrn pro implementaci scraperu

| Priorita | Značka | Počet requestů na plný refresh |
|---|---|---|
| 1 | MOL | 1 |
| 1 | OMV | 2 (seznam + filtr `crtMAXXMOTION100`) |
| 1 | EuroOil + RoBiN OIL | 1 |
| 1 | Shell | 1 (filtr `with_all[fuels][]=super_premium_gasoline`) nebo ~60 (rekurze celé sítě) |
| 2 | Orlen | 2 (seznam + filtr `fuelTypes=2`), nebo 1 + 466 pro plné detaily |
| 2 | TOP TANK / One1 | 75 |
| 3 | KM-PRONA | 53 |
| 4 | Tank ONO | 2 (pumpy + ceník) + 46 detailů + 46 redirectů pro GPS |

Obecné poznámky:
- Nikde není potřeba API klíč ani cookie.
- U `www.orlen.cz` bez `User-Agent` občas přijde `Connection reset by peer` → vždy posílat UA
  (a raději `--http1.1`).
- Nikde nebyl pozorován rate limit; přesto v cronu volat sekvenčně s malou prodlevou.
- `data/samples/*.json` obsahují prvních ~20 stanic z každého zdroje (u Orlenu/OMV/Shellu
  navíc ukázku detailu), aby podle nich šlo napsat parser bez opakovaného stahování.
