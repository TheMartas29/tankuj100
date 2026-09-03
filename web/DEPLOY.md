# Nasazení webu tankuj100.cz

Statický prezentační web (Vite + React + TS + Tailwind v4). Buildí se do `dist/`
a nginx ho servíruje jako obyčejné soubory – žádný Node proces, žádné PM2.

| | tankuj100.cz |
|--|--|
| stroj | VPS `root@80.211.200.128` |
| repo na serveru | `/root/projects/tankuj100` (stejné repo jako backend) |
| složka projektu | `/root/projects/tankuj100/web` |
| kořen pro nginx | `/var/www/tankuj100-web/dist` |
| nginx site | `/etc/nginx/sites-available/tankuj100.cz` |
| deploy skript | `web/deploy_prod.sh` |
| doména | https://tankuj100.cz + www |

Backend API (`be/`, PM2 `tankuj100`) je **jiné nasazení na jiné doméně** – popisuje
ho `../DEPLOY.md`. Tenhle web se ho nedotýká.

## 1) DNS u Forpsi

V administraci Forpsi u domény `tankuj100.cz` nastav dva **A záznamy**:

| název | typ | hodnota | TTL |
|--|--|--|--|
| `tankuj100.cz` (nebo `@`) | A | `80.211.200.128` | 3600 |
| `www` | A | `80.211.200.128` | 3600 |

Případné staré A / CNAME / parking záznamy pro `@` a `www` smaž, jinak se to pere.
IPv6 (AAAA) nedávej – server na v6 nic neposlouchá.

Ověření z Macu (čekej, dokud nevrátí správnou IP):

```bash
dig +short tankuj100.cz @8.8.8.8
dig +short www.tankuj100.cz @8.8.8.8
```

Propsání trvá typicky desítky minut, u Forpsi počítej klidně s několika hodinami.
**Dokud DNS nemíří na VPS, nepouštěj certbot** – ověření selže a Let's Encrypt má
limit 5 neúspěšných pokusů za hodinu na doménu.

## 2) První nasazení na serveru

Repo už na serveru je (kvůli backendu), takže se nic neklonuje:

```bash
ssh root@80.211.200.128
cd /root/projects/tankuj100
git pull --ff-only
mkdir -p /var/www/tankuj100-web/dist
cd web
./deploy_prod.sh -y
```

Kdyby repo na serveru ještě nebylo:

```bash
git clone https://github.com/TheMartas29/tankuj100.git /root/projects/tankuj100
```

Node je na serveru **jen přes nvm** (`/root/.nvm`, v24.8.0) a v neinteraktivním SSH
shellu není v PATH. `deploy_prod.sh` si nvm načte sám, ale když si chceš něco pustit
ručně, začni `. /root/.nvm/nvm.sh`.

Po doběhnutí se podívej, že tam něco leží:

```bash
ls /var/www/tankuj100-web/dist        # index.html, assets/, obrázky
```

## 3) nginx

```bash
cd /root/projects/tankuj100
cp web/nginx.tankuj100.cz.conf.example /etc/nginx/sites-available/tankuj100.cz
ln -s /etc/nginx/sites-available/tankuj100.cz /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Test ještě před přepnutím DNS (obejde DNS přes `Host` hlavičku):

```bash
curl -s -H 'Host: tankuj100.cz' http://80.211.200.128/ | head -c 300
```

## 4) HTTPS (certbot) – až po propsání DNS

```bash
certbot --nginx -d tankuj100.cz -d www.tankuj100.cz
nginx -t && systemctl reload nginx
```

Certbot si do server bloku sám doplní `listen 443 ssl`, cesty k certifikátům a
redirect z portu 80 (nabídne ho – vyber „Redirect“). Obnova běží automaticky
systemd timerem, kontrola: `systemctl list-timers | grep certbot`, nanečisto
`certbot renew --dry-run`.

Až HTTPS pojede, můžeš v `/etc/nginx/sites-available/tankuj100.cz` odkomentovat
řádek s `Strict-Transport-Security`. Dřív ne – HSTS by doménu zamkl na https
i ve chvíli, kdy certifikát nemáš.

## 5) Běžný update

```bash
ssh root@80.211.200.128
cd /root/projects/tankuj100 && git pull --ff-only
cd web && ./deploy_prod.sh          # -y přeskočí potvrzení
```

Skript udělá `npm ci` (fallback `npm install`), `npm run build` a nakonec
`rsync -a --delete --exclude '.well-known' dist/ /var/www/tankuj100-web/dist/`.
Nginx se restartovat nemusí, soubory se vymění za běhu.

`git pull` v `/root/projects/tankuj100` stáhne i případné změny backendu, ale
**nenasadí je** – na to je `./deploy.sh` v kořeni repa.

## ⚠️ VPS má ~1 GB RAM

Deploye **nepouštěj souběžně**. `npm ci` u projektů s nativními moduly
(backend a jeho `better-sqlite3`) sežere paměť a druhý běžící build shodí OOM killer –
typicky se to projeví jako `npm ci` zabité bez chyby nebo „Killed“ uprostřed buildu.

Tenhle web nativní moduly nemá, takže je sám o sobě nenáročný, ale i tak platí:
**jeden deploy v jednu chvíli**. Když build spadne bez zjevného důvodu, koukni na

```bash
dmesg -T | tail -20        # hledej "Out of memory: Killed process"
free -m
```

a pusť ho znovu, až je klid.

## Kampaňová adresa /stahnout

`tankuj100.cz/stahnout` je odkaz do reklamních kampaní. Servíruje **stejnou stránku
jako `/`**, takže návštěvník nepozná nic zvláštního – jen jinou adresu bez parametrů.
Kolik lidí na něj přišlo, se ukazuje v administraci backendu na záložce **Odkaz**.

### Jak to funguje

nginx doručí `index.html` a **vedle toho** (`mirror`) pošle požadavek na backend, který
návštěvu započítá. Mirror běží mimo odpověď návštěvníkovi: když backend leží, stránka
se doručí normálně a jen se ta jedna návštěva nezapočítá.

Do prohlížeče se **neukládá nic** – žádná cookie, žádné ID. IP adresa se neukládá,
vstupuje jen do jednosměrného otisku osoleného datem, který rozliší opakované načtení
od druhého člověka. Protože se na zařízení nic neukládá, web nepotřebuje cookie lištu.

Důsledek pro čtení čísel: **„lidé“ jsou odhad po dnech.** Kdo přijde třikrát za jeden
den, počítá se jednou; kdo přijde ve třech dnech, počítá se třikrát. Sůl se totiž
každý den mění a napříč dny se otisky spojit nedají – schválně.

### Nastavení (jednou)

1. Do `be/.env` na serveru doplň tajemství, kterým se nginx prokazuje backendu:

   ```
   VISIT_TOKEN=<náhodný řetězec, např. openssl rand -hex 24>
   ```

   Bez něj se **nepočítá vůbec nic** – radši žádná data než smyšlená.

2. V `/etc/nginx/sites-available/tankuj100.cz` použij bloky `location = /stahnout`
   a `location = /__visit` z `web/nginx.tankuj100.cz.conf.example` a nahraď
   `ZDE_VISIT_TOKEN` stejnou hodnotou jako v `.env`.

3. `sudo nginx -t && sudo systemctl reload nginx`

### Další kampaňová adresa

Přidat další znamená dvě změny: cestu do `COUNTED_PATHS` v
`be/src/routes/visit.routes.js` (jinak ji backend odmítne) a kopii obou `location`
bloků v nginxu s novou cestou. Cesta v `proxy_pass` musí sedět s tou v `location`.
