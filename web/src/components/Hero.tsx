import AppStoreBadge from "./AppStoreBadge";

const TRUST = ["Zdarma", "Bez registrace", "Bez reklam"];

export default function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden pt-28 sm:pt-32">
      {/* Sytý firemní gradient, který se dole plynule rozpustí do podkladu stránky. */}
      <div
        className="absolute inset-0 -z-20 bg-brand-gradient"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 52%, transparent 88%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 52%, transparent 88%)",
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
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Mapa prémiových paliv v Česku
          </span>

          <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-semibold text-white sm:text-6xl lg:text-7xl">
            Benzínky se 100 oktany.
            <br />
            Všechny na jedné mapě.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-white/85 sm:text-xl">
            tankuj100 ti ukáže jen ty pumpy, kde skutečně natankuješ Natural 100 nebo 98.
            Žádné projíždění stanic, u kterých stejně zastavovat nechceš.
          </p>

          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <AppStoreBadge />
            <a
              href="#funkce"
              className="rounded-xl px-5 py-3 text-base font-medium text-white/90 ring-1 ring-white/30 transition hover:bg-white/10"
            >
              Co appka umí
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/75">
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

        {/* Telefon záměrně přesahuje přes rozhraní gradientu a bílé plochy. */}
        <div className="relative mx-auto mt-14 w-[16rem] sm:mt-16 sm:w-[19rem]">
          <div
            className="absolute inset-x-4 top-10 -z-10 h-full rounded-[3rem] bg-brand-900/25 blur-3xl"
            aria-hidden="true"
          />
          <img
            src="/devices/map.webp"
            width={1000}
            height={2041}
            alt="Aplikace tankuj100 s mapou benzínek se 100 oktany po celé České republice"
            className="w-full drop-shadow-2xl"
            fetchPriority="high"
          />
        </div>
      </div>
    </section>
  );
}
