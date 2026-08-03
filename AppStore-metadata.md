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
Rychle najdi nejbližší benzínky s prémiovým palivem. Mapa stanic, ceny, hodnocení řidičů a info, kde se čepuje E5 pro starší auta.

## Popis
tankuj100 ti na mapě ukáže benzínky nabízející prémiové palivo – ideální pro majitele
starších vozů i pro každého, kdo chce tankovat kvalitnější palivo.

Co appka umí:
• Mapa benzínek s prémiovým palivem po celé ČR
• Detail stanice – adresa, otevírací doba, kontakt, možnosti platby
• Aktuální ceny paliv u dané stanice
• Hodnocení a komentáře od ostatních řidičů
• Ověřeno řidiči: u kterých stanic se čepuje E5 (benzín s nižším podílem etanolu,
  vhodnější pro starší motory) – a filtr, který ti ukáže jen ty potvrzené
• Nahlášení nesrovnalosti (špatná cena, zavřeno, špatná adresa) jedním klepnutím
• Oblíbené benzínky a seznam nejbližších stanic
• Vycentrování mapy na tvoji polohu
• Navigace do stanice přes Apple Mapy

Bez registrace a bez reklam. Data o cenách jsou informativní a přebírají se z veřejných
zdrojů; informace o typu benzínu pochází od uživatelů, tak si ji u pumpy ověř.

## Klíčová slova (100 zn., čárkami)
benzínka,palivo,natural,benzin,nafta,ceny paliv,tankování,mapa,stanice,pumpa,čerpací,e5

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

## TODO před odesláním
- [ ] Screenshoty (6.9" a 6.5" iPhone) – mapa, detail stanice s hodnocením, seznam „S E5".
- [ ] Ikona 1024×1024 (už je v projektu jako app icon).
- [ ] Vyplnit App Privacy dotazník dle výše (Location + User Content + Device ID).
- [ ] Nastavit age rating s ohledem na UGC.
- [ ] Ověřit kontaktní e‑mail v privacy (teď: info@silkroadbrand.eu).
