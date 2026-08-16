import Reveal from "./Reveal";
import { SUPPORT_EMAIL } from "../config";

/*
  ⚠️ Otázky a odpovědi drž shodné se strukturovanými daty v index.html (FAQPage).
  Google porovnává, co je ve značkování, s tím, co je na stránce reálně vidět.
*/
const QUESTIONS = [
  {
    q: "Kolik aplikace stojí?",
    a: "Zatím nic – tankuj100 je zdarma a celá, bez zamčených funkcí a bez zkušební doby. Neslibujeme, že to tak zůstane navždy, takže jestli tě zajímá, kde natankuješ prémiové palivo, stáhni si ji klidně hned. Kdo ji má, ten ji má.",
  },
  {
    q: "Musím se registrovat?",
    a: "Ne, a ani nemůžeš – aplikace žádné účty nemá. Nikde nevyplňuješ e-mail, nevymýšlíš heslo a nepotvrzuješ žádnou registraci. Otevřeš ji a rovnou používáš. Hodnotit stanice i hlásit typ paliva můžeš bez přihlašování.",
  },
  {
    q: "Sledujete mě? Co děláte s mými daty?",
    a: "Nic, protože žádná nesbíráme. V aplikaci není žádná analytika, žádné reklamní SDK ani sledovací kódy a nic nepředáváme třetím stranám. Tvoje poloha se zpracovává výhradně v telefonu – slouží k vycentrování mapy a seřazení stanic podle vzdálenosti a nikam se neodesílá. Na server odejde jen to, co sám napíšeš: hodnocení, komentář nebo hlášení o palivu.",
  },
  {
    q: "Na jakém iPhonu aplikace poběží?",
    a: "Stačí iOS 16, takže si ji pustíš i na iPhonu 8 nebo SE druhé generace – tedy na telefonech z roku 2017. Je to záměr: appka na hledání benzínky má fungovat i na starším telefonu, který vozíš v autě, a ne tě nutit kupovat nový.",
  },
  {
    q: "Odkud jsou data o benzínkách?",
    a: "Základ tvoří otevřená databáze OpenStreetMap. Informace o typu benzínu (E5/E10) a hodnocení přidávají sami řidiči, proto jsou informativní a u pumpy se vyplatí je ověřit.",
  },
  {
    q: "Chybí tam benzínka, kterou znám. Co s tím?",
    a: "Přímo v aplikaci můžeš stanici navrhnout k přidání. Návrh projde kontrolou a pak se objeví ostatním řidičům.",
  },
  {
    q: "Bude i verze pro Android?",
    a: "Zatím je tankuj100 jen pro iPhone. Jestli by ti Android verze pomohla, dej vědět – zájem sledujeme.",
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
            <details className="group rounded-2xl bg-white p-5 ring-1 ring-black/5 transition hover:ring-black/10 open:ring-brand-200 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold [&::-webkit-details-marker]:hidden sm:text-lg">
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
