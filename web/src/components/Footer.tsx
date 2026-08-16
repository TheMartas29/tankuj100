import { PRIVACY_URL, SUPPORT_EMAIL } from "../config";

export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <img
                src="/app-icon.webp"
                alt=""
                width={36}
                height={36}
                loading="lazy"
                className="h-9 w-9"
              />
              <span className="text-lg font-semibold tracking-tight">tankuj100</span>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              Mapa benzínek se 100 a 98 oktany po celé České republice. Zdarma, bez
              registrace a bez reklam.
            </p>
          </div>

          <nav className="flex flex-col gap-3 text-sm">
            <span className="font-semibold">Odkazy</span>
            <a href={PRIVACY_URL} className="text-ink-muted transition hover:text-ink">
              Ochrana soukromí
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink-muted transition hover:text-ink">
              Podpora
            </a>
            <a href="#faq" className="text-ink-muted transition hover:text-ink">
              Časté dotazy
            </a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-black/5 pt-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} tankuj100</p>
          {/* Uvedení zdroje dat vyžaduje licence ODbL, pod kterou je OpenStreetMap. */}
          <p>
            Data o benzínkách ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition hover:text-ink"
            >
              přispěvatelé OpenStreetMap
            </a>
          </p>
        </div>
      </div>

      {/*
        Minimalistický podpis „powered by silkroad brand" – stejný jako na
        balerestaurant.cz a keramicky.silkroadbrand.eu: shodný text i odkaz,
        vycentrovaný, tlumený, bez podtržení a bez jakékoli reakce na hover.
      */}
      <div className="flex justify-center border-t border-black/10 px-4 pt-[22px] pb-[26px]">
        <a
          href="https://www.silkroadbrand.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11.5px] tracking-[0.08em] text-ink/45 no-underline hover:text-ink/45 focus:text-ink/45 active:text-ink/45"
        >
          powered by silkroad brand
        </a>
      </div>
    </footer>
  );
}
