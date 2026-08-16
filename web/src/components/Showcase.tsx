import Reveal from "./Reveal";

const ROWS = [
  {
    image: "/devices/list.webp",
    alt: "Seznam nejbližších benzínek s údajem o vzdálenosti a dostupných oktanech",
    label: "Nejbližší stanice",
    title: "Oktany vidíš u každé pumpy",
    text: "Seznam seřazený podle vzdálenosti od tebe. U každé stanice hned poznáš, jaké palivo čekat, a oblíbené pumpy si připneš k ruce.",
    points: ["Řazení podle vzdálenosti", "Oblíbené stanice", "Vycentrování na tvoji polohu"],
  },
  {
    image: "/devices/detail.webp",
    alt: "Detail benzínky OMV s nabídkou paliv, adresou a tlačítkem Navigovat",
    label: "Detail stanice",
    title: "Zastávku si ověříš předem",
    text: "Nabídka paliv, adresa, otevírací doba i kontakt pohromadě. Když sedí, spustíš navigaci jedním klepnutím. Když nesedí, nahlásíš to taky jedním klepnutím.",
    points: ["Kompletní nabídka paliv", "Navigace přes Apple Mapy", "Nahlášení nesrovnalosti"],
  },
  {
    image: "/devices/reviews.webp",
    alt: "Hodnocení benzínky od ostatních řidičů s komentáři a hvězdičkami",
    label: "Hodnocení",
    title: "Zkušenosti ostatních řidičů",
    text: "Hvězdičky a komentáře od lidí, kteří tam tankovali před tebou. Své hodnocení můžeš kdykoli upravit nebo smazat.",
    points: ["Hodnocení a komentáře", "Vlastní příspěvek pod kontrolou", "Bez nutnosti účtu"],
  },
];

export default function Showcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
      <div className="flex flex-col gap-24 sm:gap-32">
        {ROWS.map((row, i) => {
          const flipped = i % 2 === 1;
          return (
            <div
              key={row.title}
              className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
            >
              <Reveal className={flipped ? "md:order-2" : ""}>
                <div className="relative mx-auto w-[14rem] sm:w-[17rem]">
                  <div
                    className="absolute inset-x-6 top-12 -z-10 h-3/4 rounded-[3rem] bg-brand-500/25 blur-3xl"
                    aria-hidden="true"
                  />
                  <img
                    src={row.image}
                    width={1000}
                    height={2041}
                    alt={row.alt}
                    loading="lazy"
                    className="w-full drop-shadow-2xl"
                  />
                </div>
              </Reveal>

              <Reveal delay={120} className={flipped ? "md:order-1" : ""}>
                <div className="max-w-lg">
                  <span className="text-sm font-semibold tracking-widest text-brand-700 uppercase">
                    {row.label}
                  </span>
                  <h3 className="mt-4 text-3xl font-semibold sm:text-4xl">{row.title}</h3>
                  <p className="mt-4 text-lg text-ink-muted">{row.text}</p>
                  <ul className="mt-7 flex flex-col gap-3">
                    {row.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.9 3.9 6.7-6.7a1 1 0 0 1 1.4 0Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                        <span className="font-medium">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
