import Reveal from "./Reveal";

export default function OlderCars() {
  return (
    <section id="e5" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-gradient px-7 py-16 sm:px-14 sm:py-20">
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
              Běžný benzín dnes obsahuje až 10 % etanolu (E10), který starším motorům
              nesvědčí. V aplikaci vidíš, jestli řidiči u dané pumpy hlásili E5 – a sám
              můžeš přidat, co je u stojanu napsané.
            </p>

            <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Zastavíš u pumpy",
                  text: "Otevřeš detail stanice, kde tankuješ.",
                },
                {
                  step: "02",
                  title: "Koukneš na stojan",
                  text: "U pumpy je napsané, jestli je palivo E5, nebo E10.",
                },
                {
                  step: "03",
                  title: "Klepneš na odpověď",
                  text: "Informace pomůže dalším řidičům se stejným autem.",
                },
              ].map((item) => (
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
              Údaje o palivu hlásí sami řidiči, takže je ber jako vodítko – u stojanu si je
              vždycky ověř.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
