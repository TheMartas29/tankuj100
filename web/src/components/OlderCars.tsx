import Reveal from "./Reveal";

const STEPS = [
  {
    step: "01",
    title: "Zastavíš u pumpy",
    text: "Otevřeš detail stanice, kde zrovna tankuješ.",
  },
  {
    step: "02",
    title: "Koukneš na stojan",
    text: "U pumpy musí být uvedené, jestli je palivo E5, nebo E10.",
  },
  {
    step: "03",
    title: "Klepneš na odpověď",
    text: "Informace pomůže dalším řidičům se stejným autem.",
  },
];

export default function OlderCars() {
  return (
    <section id="e5" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-gradient px-6 py-14 sm:px-14 sm:py-20">
          {/* Dekorativní záře, ať plocha nepůsobí ploše. */}
          <div
            className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-white/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-900/25 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">
              Benzín pro starší auta
            </span>

            <h2 className="mt-6 text-3xl font-semibold text-white sm:text-5xl">
              Jezdíš starším autem? Pak řešíš E5.
            </h2>

            <p className="mt-6 text-lg text-white/85 sm:text-xl">
              Od roku 2024 se u nás běžný Natural 95 postupně mění na <strong className="font-semibold text-white">E10</strong> —
              benzín s až 10 % bioetanolu místo dosavadních 5 % (E5). Pro moderní auta to
              problém není, u starších motorů ale ano.
            </p>

            <p className="mt-4 text-base text-white/75">
              Etanol se totiž chová jako rozpouštědlo: vymývá změkčovadla z hadiček a těsnění
              palivové soustavy, ta pak tvrdnou a praskají. Zároveň váže vzdušnou vlhkost,
              takže při delším stání auta se na dně nádrže usazuje voda. Nejvíc to štve
              vozy vyrobené zhruba do roku 2000, karburátorové motory a veterány — a právě
              těm svědčí prémiová paliva se 100 oktany, která místo bioetanolu používají
              šetrnější ETBE.
            </p>

            <p className="mt-5 text-sm text-white/70">
              Pěkně to rozebírá{" "}
              <a
                href="https://www.fkhv.cz/2024/06/29/rozdil-paliv-s-oznacenim-e5-a-e10-a-jejich-mozny-vliv-na-provoz-historickeho-vozidla"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
              >
                článek Federace klubů historických vozidel ČR
              </a>{" "}
              o rozdílu paliv E5 a E10 a jejich vlivu na provoz historického vozidla.
            </p>

            <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
              {STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl bg-white/12 p-6 ring-1 ring-white/20 backdrop-blur-sm"
                >
                  <span className="text-sm font-semibold text-white/60">{item.step}</span>
                  <h3 className="mt-2 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-white/75">{item.text}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-white/65">
              V aplikaci vidíš, jestli řidiči u dané pumpy hlásili E5 — a sám můžeš přidat,
              co je u stojanu napsané. Údaje hlásí sami řidiči, takže je ber jako vodítko
              a u stojanu si je vždycky ověř.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
