# tankuj100 – prezentační web

Produktová jednostránka k aplikaci tankuj100 — [tankuj100.cz](https://tankuj100.cz).
React + Vite + TypeScript + Tailwind v4, statický build bez backendu.

S API (PM2 proces `tankuj100`) nemá tenhle web nic společného, běží vedle sebe.

## Vývoj

```bash
npm install
npm run dev        # http://localhost:5180
```

## Build

```bash
npm run build      # výstup do dist/
```

## Odkaz na App Store

Aplikace zatím čeká na schválení, takže `APP_STORE_URL` v [`src/config.ts`](src/config.ts)
je zástupný. Až bude v App Storu, přepiš ho tam — je to jediné místo, odkud ho berou
všechna tlačítka na webu.

## Obrázky

Produktové vizuály se generují ze zdrojů v `../appstore-screenshots`, needitují se ručně:

```bash
python3 scripts/build-devices.py   # screenshoty do rámečku iPhonu -> public/devices/
python3 scripts/build-icons.py     # ikony webu -> public/ (ořízne průhledný okraj)
python3 scripts/build-og.py        # náhled odkazu -> public/og-image.png
```

Skripty stačí pustit znovu, když se změní screenshoty nebo ikona aplikace.

## Nasazení

Přes git, stejně jako ostatní weby na VPS — postup je v [DEPLOY.md](DEPLOY.md).

```bash
git pull && ./deploy_prod.sh
```
