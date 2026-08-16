import Reveal from "./Reveal";
import { SUPPORT_EMAIL } from "../config";

const QUESTIONS = [
  {
    q: "Kolik aplikace stojí?",
    a: "Nic. tankuj100 je zdarma, bez reklam a bez placených funkcí.",
  },
  {
    q: "Musím se registrovat?",
    a: "Ne. Aplikace nemá účty ani přihlašování – otevřeš ji a rovnou používáš. Hodnotit a hlásit palivo můžeš i bez registrace.",
  },
  {
    q: "Odkud jsou data o benzínkách?",
    a: "Základ tvoří otevřená databáze OpenStreetMap. Informace o typu benzínu (E5/E10) a hodnocení přidávají sami řidiči, proto jsou informativní a u pumpy se vyplatí je ověřit.",
  },
  {
    q: "Sleduje aplikace moji polohu?",
    a: "Ne. Poloha se zpracovává jen ve tvém telefonu, aby šla mapa vycentrovat a stanice seřadit podle vzdálenosti. Nikam se neodesílá a s ničím se nespojuje.",
  },
  {
    q: "Chybí tam benzínka, kterou znám. Co s tím?",
    a: "Přímo v aplikaci můžeš stanici navrhnout k přidání. Návrh projde kontrolou a pak se objeví ostatním řidičům.",
  },
  {
    q: "Bude i verze pro Android?",
    a: "Zatím je tankuj100 jen pro iPhone (iOS 16 a novější). Jestli by ti Android verze pomohla, dej vědět – zájem sledujeme.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className="text-center">
          <span className="text-sm font-semibold tracking-widest text-brand-700 uppercase">
            Časté dotazy
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Co se nejčastěji ptáte</h2>
        </div>
      </Reveal>

      <div className="mt-12 flex flex-col gap-3">
        {QUESTIONS.map((item, i) => (
          <Reveal key={item.q} delay={i * 60}>
            <details className="group rounded-2xl bg-white p-6 ring-1 ring-black/5 transition hover:ring-black/10 open:ring-brand-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition group-open:rotate-45">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
                  </svg>
                </span>
              </summary>
              <p className="mt-4 text-ink-muted">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <p className="mt-10 text-center text-ink-muted">
          Nenašel jsi odpověď?{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
          >
            Napiš nám
          </a>
          .
        </p>
      </Reveal>
    </section>
  );
}
