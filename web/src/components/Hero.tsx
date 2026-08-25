import AppStoreBadge from "./AppStoreBadge";
import DeviceImage from "./DeviceImage";

const TRUST = ["Zatím zdarma", "Bez registrace", "Bez reklam"];

// Pořadí odpovídá tomu, jak se s aplikací pracuje: mapa → seznam → detail → hodnocení.
const SCREENS = [
  { name: "map", alt: "Mapa benzínek se 100 oktany po celé České republice" },
  { name: "list", alt: "Seznam nejbližších stanic seřazený podle vzdálenosti" },
  { name: "detail", alt: "Detail stanice s nabídkou paliv a otevírací dobou" },
  { name: "reviews", alt: "Hodnocení stanice od ostatních řidičů" },
];

// Na širokých displejích se telefony poskládají do mírného oblouku – krajní níž,
// prostřední výš. Na mobilu se žádné posuny nedělají, tam se jen scrolluje.
const ARC = ["lg:translate-y-10", "lg:translate-y-1", "lg:translate-y-1", "lg:translate-y-10"];

export default function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden pt-28 sm:pt-32">
      {/* Sytý firemní gradient, který se dole plynule rozpustí do podkladu stránky. */}
      <div
        className="absolute inset-0 -z-20 bg-brand-gradient"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 86%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 86%)",
        }}
        aria-hidden="true"
      />
      {/* Dvě měkké záře, aby gradient nebyl plochý. */}
      <div
        className="absolute -top-40 -left-32 -z-10 h-[36rem] w-[36rem] rounded-full bg-brand-300/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -top-24 right-[-10rem] -z-10 h-[30rem] w-[30rem] rounded-full bg-brand-900/30 blur-3xl"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[0.8rem] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm sm:px-4 sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Mapa prémiových paliv v Česku
          </span>

          <h1 className="mt-5 text-[2.15rem] leading-[1.08] font-semibold text-white sm:mt-6 sm:text-5xl md:text-6xl lg:text-7xl">
            Benzínky se 100 oktany.
            <br />
            Všechny na jedné mapě.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-white/85 sm:mt-6 sm:text-lg md:text-xl">
            tankuj100 ti ukáže jen ty pumpy, kde skutečně natankuješ Natural 100 nebo 98.
            Žádné projíždění stanic, u kterých stejně zastavovat nechceš.
          </p>

          {/* Obě tlačítka mají shodnou výšku (h-14), ať vedle sebe sedí. */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:mt-9 sm:flex-row sm:justify-center sm:gap-4">
            <AppStoreBadge />
            <a
              href="#funkce"
              className="inline-flex h-14 items-center justify-center rounded-[12px] px-6 text-base font-medium text-white ring-1 ring-white/35 transition hover:bg-white/10"
            >
              Co appka umí
            </a>
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/75 sm:mt-7 sm:gap-x-6">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.9 3.9 6.7-6.7a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/*
        Telefony záměrně přesahují přes rozhraní gradientu a světlé plochy.
        Na mobilu je to vodorovný carousel se zarovnáním na střed (prst + snap),
        od lg se vejdou všechny čtyři vedle sebe a scrollovat není potřeba.
      */}
      <div className="relative mt-12 sm:mt-14">
        <div
          className="absolute inset-x-8 top-16 -z-10 h-2/3 rounded-[4rem] bg-brand-900/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className={[
            "no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto",
            // Odsazení po stranách zarovná první a poslední telefon na střed obrazovky.
            "scroll-px-5 px-[calc(50%-6.75rem)] pb-6 sm:px-[calc(50%-7.5rem)]",
            "lg:snap-none lg:justify-center lg:overflow-visible lg:px-8 lg:pb-0",
          ].join(" ")}
        >
          {SCREENS.map((screen, i) => (
            <figure
              key={screen.name}
              className={`shrink-0 snap-center ${ARC[i]} w-[13.5rem] sm:w-[15rem] lg:w-[14.5rem] xl:w-[16rem]`}
            >
              <DeviceImage
                name={screen.name}
                alt={screen.alt}
                className="w-full drop-shadow-2xl"
                loading={i === 0 ? "eager" : "lazy"}
                priority={i === 0}
              />
            </figure>
          ))}
        </div>

        {/* Nápověda jen tam, kde se opravdu scrolluje. */}
        <p className="mt-1 text-center text-xs text-ink-muted lg:hidden">
          Přejeď prstem a prohlédni si aplikaci
        </p>
      </div>
    </section>
  );
}
