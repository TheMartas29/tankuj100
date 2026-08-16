# tankuj100 1.1 – návrh a rozdělení práce

Pracovní dokument pro verzi 1.1. Dvě funkce: **žádost o přidání benzínky se schválením
adminem** a **filtrování v seznamu i v mapě**. Tenhle soubor je závazný kontrakt –
kdo na čem dělá a jak spolu části mluví. Po dokončení 1.1 ho smažeme.

## Zásady

- **Verze 1.0 už je v App Storu.** Cokoli se přidá do API, musí být rozšíření, ne změna:
  starý build musí dál fungovat. Žádné pole se nepřejmenovává ani neodebírá.
- **Filtrování běží v telefonu**, ne na serveru. Server posílá data tak, aby se dala
  filtrovat lacino.
- **Návrh musí unést stonásobek dat** (~100 tisíc stanic) bez sekání. Zatím zůstáváme
  u ČR, ale datové struktury a mapa se tomu musí přizpůsobit už teď.
- Cíl je iOS 16.0. Novinky jen za `#available`, všechny na jednom místě v `Backport.swift`.

---

## 1. Datový model – žádosti o benzínku

Nová tabulka. Stanice **nevzniká** odesláním, ale až schválením v administraci.

```sql
CREATE TABLE station_request (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT    NOT NULL,
  lat         REAL    NOT NULL,
  lon         REAL    NOT NULL,
  brand_name  TEXT,
  name        TEXT,
  city        TEXT,
  address     TEXT,
  fuels       TEXT    NOT NULL,   -- JSON pole klíčů, např. ["octane_100","octane_98"]
  note        TEXT,
  status      TEXT    NOT NULL DEFAULT 'new',  -- new | approved | rejected
  admin_note  TEXT,               -- důvod zamítnutí; VIDÍ HO UŽIVATEL
  created_at  TEXT    NOT NULL,
  resolved_at TEXT,
  station_id  INTEGER             -- doplní se při schválení
);
CREATE INDEX idx_station_request_status ON station_request (status, created_at DESC);
CREATE INDEX idx_station_request_device ON station_request (device_id, created_at DESC);
```

`admin_note` slouží dvěma věcem naráz: u zamítnutí je to text pro uživatele, jinde
interní poznámka. Kdo ho vyplňuje, musí vědět, že u zamítnutí půjde ven.

### Vznik stanice při schválení

Stanice dostane `data_source = 'user'` a `osm_id = NULL`.

**Pozor, tohle je past:** `scripts/import-osm.js` dnes při přestavbě promaže celou
tabulku `station` (`TABLES_TO_CLEAR`) a `assignIds()` rozdává nejnižší volná ID jen
podle `osm_id`. Bez zásahu by první import po schválení uživatelskou stanici **smazal**
a její ID přidělil cizí pumpě – hodnocení a hlášení by se tiše přepnula k jiné stanici.
Import se proto musí upravit:

1. mazat jen řádky, které nejsou uživatelské (`data_source IS NULL OR data_source <> 'user'`),
   a stejně tak jejich `station_fuel` / `station_tag`,
2. `assignIds()` musí ID uživatelských stanic považovat za obsazená.

---

## 2. API – rozšíření

### Veřejné (posílá se `X-App-Key`, platí limity zápisů)

| metoda | cesta | co dělá |
|--|--|--|
| POST | `/api/station-requests` | odeslání žádosti |
| GET | `/api/station-requests?device_id=…` | moje žádosti i s výsledkem |

**POST tělo:**
```json
{
  "device_id": "…", "lat": 50.08, "lon": 14.42,
  "brand_name": "MOL", "name": null, "city": "Praha", "address": null,
  "fuels": ["octane_100"], "note": "Nová pumpa u sjezdu."
}
```
`lat`/`lon` povinné a v rozsahu, `fuels` neprázdné pole z povoleného číselníku,
texty přes `checkContent` (vulgarismy, odkazy). Limit: **3 žádosti na zařízení za den**.

**Kontrola duplicit:** když do 150 m existuje stanice nebo nevyřízená žádost, vrátit
`409` s kódem `duplicate_station` a takovou informací, aby to appka uměla vysvětlit.

**GET odpověď:** pole `{id, lat, lon, brand_name, city, status, admin_note, created_at,
resolved_at, station_id}`, nejnovější první, limit 20.

### Administrace

| metoda | cesta | co dělá |
|--|--|--|
| GET | `/api/admin/station-requests?status=…` | seznam (`all`/`new`/`approved`/`rejected`) |
| PATCH | `/api/admin/station-requests/:id` | `{status, admin_note}` – schválit/zamítnout |
| DELETE | `/api/admin/station-requests/:id` | smazat |

Schválení (`status: "approved"`) v jedné transakci založí stanici, doplní její paliva
a do žádosti zapíše `station_id`. Musí zneplatnit `map-cache`.

### Rozšíření `/api/map/`

Přibývají **dvě nová pole**, stávající zůstávají beze změny kvůli verzi 1.0:

```json
{ "id":1, "lat":…, "lon":…, "brand_name":"MOL",
  "rating_avg":4.5, "rating_count":2, "has_98":0, "has_100":1,
  "f": 5, "s": 3 }
```

- `f` – bitová maska paliv, `s` – bitová maska služeb. Krátké názvy schválně:
  při stotisíci stanicích je každý ušetřený bajt znát.

Masky (číslo = pozice bitu, hodnota = `1 << pozice`):

| bit | `f` palivo | | bit | `s` služba |
|--|--|--|--|--|
| 0 | octane_100 | | 0 | shop |
| 1 | octane_98  | | 1 | car_wash |
| 2 | octane_95  | | 2 | toilets |
| 3 | diesel     | | 3 | nonstop (`opening_hours` = 24/7) |
| 4 | lpg        | | 4 | restaurace / občerstvení |
| 5 | cng        | | | |
| 6 | adblue     | | | |
| 7 | e85        | | | |

Číselník je jediný zdroj pravdy v `be/src/fuel-flags.js` a musí mít **přesnou kopii**
v `ios/…/Models/StationFlags.swift`. Když se přidá bit, mění se obě strany.

Pozor na otevírací dobu: v datech je už polidštěná a nonstop se v ní píše nejmíň šesti
způsoby („nonstop“, „NONSTOP“, „24/7“, „Po–Ne 00:00–23:59“, „Mo-Su 00:00-24:00“,
„24h SAMOOBSLUŽNÁ“). Hledat jen „24/7“ najde 38 stanic místo 573.

**Známý strop:** složení odpovědi stálo 1,7 ms a s maskami stojí 4,7 ms (1073 stanic,
jednou za minutu nebo po zápisu). Při stotisíci to vychází zhruba na 0,4 s, což už by
smyčku znatelně blokovalo. Až se k tomu přiblížíme, řešení je držet masky jako sloupce
tabulky `station` a přepočítat je při importu a při úpravě z administrace, ne je skládat
za běhu. Teď by to byla složitost navíc bez užitku.

---

## 3. iOS – filtrování

### Výkon je zadání, ne bonus

Stotisíc stanic znamená, že se nesmí při každé změně filtru sahat na pole struktur
ani porovnávat řetězce. Návrh:

- `StationIndex` se postaví **jednou po načtení dat, mimo hlavní vlákno**. Drží
  paralelní pole (`lat`, `lon`, `fuelMask`, `serviceMask`, `brandId`, `rating`) –
  ne pole objektů. Značky jsou internované na `Int32`.
- Filtr vrací `[Int32]` indexů, ne kopie stanic.
- Filtrování i řazení podle vzdálenosti běží na **pozadí** (`Task.detached`),
  výsledek se publikuje na hlavní vlákno jedním přiřazením.
- Vzdálenosti se počítají přes `GeoDistance` a **jednou dopředu**, ne v porovnávači
  (viz commit e1c9ad9, kde se to řešilo u seznamu).
- Filtr sám je hodnotový typ (`Equatable`), ať jde levně poznat, že se nic nezměnilo.

### Kritéria filtru

Povinná: **palivo** (podle masky `f`) a **značka**. Doplněná, protože v datech dávají
smysl: jen **oblíbené**, jen **nonstop**, **služby** (myčka, obchod, WC), minimální
**hodnocení**. Nepřidávat filtr podle vzdálenosti – to už řeší řazení.

Filtr je **jeden sdílený stav pro mapu i seznam** a přežije restart aplikace.

### Seznam

`nearestLimit = 50` padá, seznam ukazuje **všechno**. Bez polohy se nesmí zablokovat
prázdným stavem jako dnes – když polohu nemáme, řadí se podle značky a obce.

### Mapa

Přes tisíc špendlíků MapKit ještě zvládne, sto tisíc ne. Anotace se proto přidávají
**jen pro viditelný výřez** (+ rezerva okolo), s horním stropem a s odloženou reakcí
na posun mapy. Shlukování přes `clusteringIdentifier` zůstává.

---

### Obrazovka „Benzínka navíc“

Přidání i přehled žádostí jsou **jedna obrazovka se dvěma záložkami** (`Picker`
se stylem `.segmented` v navigation baru, stejně jako už to má seznam benzínek):

- **Přidat** – formulář.
- **Moje žádosti** – jen seznam, nic se v něm needituje. U zamítnuté je vidět důvod
  z `admin_note`, u schválené odkaz na hotovou benzínku v mapě.

Když uživatel ještě žádnou žádost neposlal, druhá záložka ukáže prázdný stav a
obrazovka se otevře rovnou na formuláři. Jakmile nějakou žádost má, otevírá se
na záložce se žádostmi – tam je ta novinka.

### Červený odznak u změněné žádosti

Aplikace nemá push notifikace, stav se proto zjišťuje **dotazem při startu a při
návratu z pozadí** (`scenePhase`). Vedle seznamu žádostí se drží v `UserDefaults`
mapa `id → naposledy viděný stav`; rozdíl mezi ní a odpovědí serveru znamená
nepřečtenou změnu.

Odznak se ukazuje **na sbaleném tlačítku menu** (jinak by ho nikdo neviděl) a po
rozbalení na položce „Přidat benzínku“. Zmizí, jakmile si uživatel záložku
s žádostmi zobrazí. Počítá se jen změna stavu, ne nová žádost od sebe samého.

## 4. iOS – plovoucí menu

Dnes jsou vlevo dole tři kulatá tlačítka, přibývá filtr → čtyři. Sbalí se pod jedno
s ikonou `line.3.horizontal`; po klepnutí vyjedou:

| ikona | akce |
|--|--|
| `plus` | přidat benzínku |
| `list.bullet` | seznam benzínek |
| `line.3.horizontal.decrease` | filtr (s odznakem, když je aktivní) |
| `ellipsis` | menu |

Rozbalení animovaně a odspoda nahoru, se schodovitým zpožděním. Na iOS 26+ přes
`glassEffect` v `GlassEffectContainer`, níž `ultraThinMaterial` – obojí za `#available`
v `Backport.swift`. Musí respektovat „Omezit pohyb“ (`accessibilityReduceMotion`)
a mít popisky pro VoiceOver. Klepnutí mimo menu ho zavře.

---

## 5. Rozdělení práce

Každý vlastní své soubory a **do cizích nesahá**. Integraci a `MapScreen.swift`
si drží hlavní vlákno práce.

| kdo | co | soubory |
|--|--|--|
| hlavní | schéma, masky paliv, rozšíření `/api/map/`, `MapScreen`, plovoucí menu, integrace | `db/schema.js`, `fuel-flags.js`, `station.repo.js`, `MapScreen.swift`, `FloatingMenu.swift`, `Backport.swift` |
| A | backend žádostí + ochrana importu + smoke testy | `station-request.*`, `public.routes.js`, `admin.routes.js`, `validation/inputs.js`, `mailer.js`, `import-osm.js`, `smoke-test.js` |
| B | administrace – záložka Žádosti | `be/index.html` |
| C | filtrovací jádro, seznam, výřez mapy | `StationIndex.swift`, `StationFilter.swift`, `FilterSheet.swift`, `StationsListView.swift`, `StationMapView.swift` |
| D | formulář žádosti a moje žádosti | `AddStationSheet.swift`, `MyRequestsView.swift`, `APIClient.swift`, `Models/StationRequest.swift` |
