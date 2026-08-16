# App Store metadata – tankuj100 (draft)

Podklad pro App Store Connect. Text uprav podle potřeby. Screenshoty a ikona se nahrávají
zvlášť v App Store Connect.

## Základ
- **Název (30 zn.):** tankuj100
- **Podtitul (30 zn.):** Benzínky s prémiovým palivem
- **Kategorie:** Navigace (primární) / Cestování (sekundární)
- **Privacy policy URL:** https://tankuj100.silkroadbrand.eu/privacy
- **Podpora URL:** https://tankuj100.silkroadbrand.eu

## Promo text (170 zn.)
Najdi benzínky, kde natankuješ 100 nebo 98 oktanů. Mapa prémiových stanic, jejich nabídka paliv, otevírací doba a hodnocení od ostatních řidičů.

## Popis
tankuj100 ti na mapě ukáže **jen** benzínky, které nabízejí prémiový benzín se 100 nebo
98 oktany – ideální pro majitele starších vozů i pro každého, kdo chce tankovat
kvalitnější palivo. Žádné listování stanicemi, kde stejně zastavovat nechceš.

Co appka umí:
• Mapa benzínek se 100 a 98 oktany po celé ČR
• Detail stanice – nabídka paliv, adresa, otevírací doba, kontakt a služby
• Hodnocení a komentáře od ostatních řidičů
• Sdílení informace, jestli se na stanici čepuje E5 (benzín s nižším podílem etanolu,
  vhodnější pro starší motory) – hlásí ji sami řidiči u pumpy
• Nahlášení nesrovnalosti (zavřeno, nesedí paliva, špatná adresa) jedním klepnutím
• Oblíbené benzínky a seznam nejbližších stanic
• Vycentrování mapy na tvoji polohu
• Navigace do stanice přes Apple Mapy

Bez registrace a bez reklam. Údaje o benzínkách pocházejí z OpenStreetMap (licence ODbL),
jsou informativní a nemusí být vždy aktuální; informace o typu benzínu pochází od
uživatelů, tak si ji u pumpy ověř.

## Klíčová slova (100 zn., čárkami)
benzínka,palivo,natural,benzin,oktan,100,98,tankování,mapa,stanice,pumpa,čerpací,e5

## Poznámky k App Privacy (dotazník v App Store Connect)
- **Location** → „App functionality", **NENÍ** propojeno s identitou, **NENÍ** používáno ke
  sledování. Poloha se zpracovává jen v zařízení, neodesílá se.
- **User Content** (hodnocení, komentáře, hlášení) → „App functionality", **NENÍ** propojeno
  s identitou, **NENÍ** používáno ke sledování. Odesílá se jen to, co uživatel sám napíše.
- **Identifiers** → náhodné UUID zařízení v UserDefaults. Není to IDFA ani nic, co by šlo
  spojit s uživatelem; slouží jen k úpravě vlastního hodnocení a k zabránění opakovaného
  hlasování. V dotazníku uvést jako **Device ID · App Functionality · Not linked ·
  Not used for tracking** (kdyby recenzent řešil detail, popis je v privacy policy).
- Žádné účty, žádná analytika, žádná reklama, žádné sdílení s třetími stranami
  (EmailJS slouží jen k interní notifikaci nám, neobsahuje údaje o uživateli).

## Uživatelský obsah (UGC) – Apple to kontroluje
Appka umožňuje veřejné komentáře, takže Apple podle Guideline 1.2 vyžaduje:
- **filtr nevhodného obsahu** – validace na serveru (limity délky, kontrola vstupů),
- **možnost nahlásit / moderovat obsah** – každé hodnocení jde v adminu skrýt i smazat,
  o nových komentářích chodí e‑mailová notifikace,
- **možnost smazat vlastní obsah** – v aplikaci: detail → Upravit moje hodnocení → Smazat,
- **kontakt na provozovatele** – info@silkroadbrand.eu (v privacy policy).
- **Age rating:** kvůli UGC nastavit v dotazníku „Infrequent/Mild – User Generated Content"
  (vede zhruba na 12+). Nezaškrtávat vyšší kategorie.

## Poznámka pro recenzenta (App Review Notes)

**Od verze 1.1 už není potřeba žádná.** Verze 1.0 obsahovala skrytý přepínač prostředí
(sedmero klepnutí na číslo verze v „O aplikaci"), který se kvůli Guideline 2.3.1 musel
recenzentovi přiznat – text, kterým se to popsalo, je v historii tohohle souboru.

Přepínač je pryč. Prostředí se určuje při překladu a testovací aplikace je samostatný
produkt s vlastním bundle ID (`cz.silkroad.tankuj100.test`), který se do App Storu
nikdy neposílá. Ostrá aplikace tedy žádnou skrytou ani nepopsanou funkci nemá a v
binárce není ani testovací klíč.

## TODO před odesláním
- [x] ~~Zvážit číslo verze~~ – vydáno jako `1.0 (1)`.
- [x] ~~Vyplnit poznámku pro recenzenta (kvůli 2.3.1)~~ – od 1.1 odpadá, viz výše.
- [ ] Screenshoty (6.9" a 6.5" iPhone) – mapa, detail stanice s nabídkou paliv a hodnocením,
      seznam nejbližších stanic.
- [ ] Ikona 1024×1024 (už je v projektu jako app icon).
- [ ] Vyplnit App Privacy dotazník dle výše (Location + User Content + Device ID).
- [ ] Nastavit age rating s ohledem na UGC.
- [ ] Ověřit kontaktní e‑mail v privacy (teď: info@silkroadbrand.eu).

Hotové a ověřené (16. 8. 2026): HTTPS bez ATS výjimek, launch screen, ikona v Assets.car,
`ITSAppUsesNonExemptEncryption = false` (jinak build visí v „Missing Compliance"),
ladicí přepínače `-apiBaseURL` a `-openSheet` se do release buildu nedostanou,
bundle `cz.silkroad.tankuj100`, tým `R5MFNT4B5A`, cíl iOS 16.0, jen iPhone.
