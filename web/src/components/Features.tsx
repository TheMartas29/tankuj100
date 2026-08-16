import Reveal from "./Reveal";

const FEATURES = [
  {
    title: "Jen prémiové pumpy",
    text: "Mapa ukazuje výhradně stanice, kde je Natural 100 nebo 98. Přehled o tom, kde se dá tankovat kvalitněji, máš na jeden pohled.",
    tint: "from-brand-50 to-brand-100",
    icon: (
      <path d="M9 2.25A2.75 2.75 0 0 0 6.25 5v14A2.75 2.75 0 0 0 9 21.75h4A2.75 2.75 0 0 0 15.75 19V5A2.75 2.75 0 0 0 13 2.25H9ZM8.75 6.5h4.5v3.75h-4.5V6.5Zm10 1.06 2.03 2.03c.3.28.47.68.47 1.1v6.06a1.75 1.75 0 1 1-3.5 0V12.5h-1V6.31l2 1.25Z" />
    ),
  },
  {
    title: "Všechno o stanici",
    text: "Nabídka paliv, adresa, otevírací doba, kontakt i služby. Navigaci do stanice spustíš jedním klepnutím.",
    tint: "from-amber-50 to-orange-100",
    icon: (
      <path d="M12 2.25c-3.87 0-7 3.02-7 6.75 0 4.87 6.06 12 6.32 12.3a.9.9 0 0 0 1.36 0C13.94 21 20 13.87 20 9c0-3.73-3.13-6.75-8-6.75Zm0 9.5a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Z" />
    ),
  },
  {
    title: "Ověřeno řidiči",
    text: "Hodnocení, komentáře i informace o tom, jestli se u pumpy čepuje E5. Přidávají je sami řidiči přímo na místě.",
    tint: "from-rose-50 to-red-100",
    icon: (
      <path d="M12 2.6c.3 0 .58.18.72.46l2.48 5.02 5.54.8a.8.8 0 0 1 .45 1.37l-4.01 3.9.95 5.52a.8.8 0 0 1-1.17.84L12 17.9l-4.96 2.6a.8.8 0 0 1-1.17-.84l.95-5.51-4-3.9a.8.8 0 0 1 .44-1.37l5.54-.8 2.48-5.02A.8.8 0 0 1 12 2.6Z" />
    ),
  },
];

export default function Features() {
  return (
    <section id="funkce" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold tracking-widest text-brand-700 uppercase">
            Co appka umí
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">
            Postavená kolem jediné otázky:{" "}
            <span className="text-brand-gradient">kde natankuju líp?</span>
          </h2>
          <p className="mt-5 text-lg text-ink-muted">
            Žádné účty, žádné reklamy. Otevřeš, najdeš pumpu, jedeš.
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 90}>
            <article
              className={`h-full rounded-3xl bg-gradient-to-br ${feature.tint} p-8 ring-1 ring-black/5`}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lg shadow-brand-800/20">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                  {feature.icon}
                </svg>
              </span>
              <h3 className="mt-6 text-xl font-semibold">{feature.title}</h3>
              <p className="mt-3 text-ink-muted">{feature.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
