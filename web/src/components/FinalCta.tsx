import AppStoreBadge from "./AppStoreBadge";
import Reveal from "./Reveal";

export default function FinalCta() {
  return (
    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-ink px-7 py-16 text-center sm:px-14 sm:py-20">
          {/* Firemní záře na tmavém podkladu – tech závěr stránky. */}
          <div
            className="absolute -top-28 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-brand-600/45 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-brand-800/40 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative">
            <img
              src="/app-icon.webp"
              alt=""
              width={72}
              height={72}
              loading="lazy"
              className="mx-auto h-18 w-18 drop-shadow-2xl"
            />

            <h2 className="mt-8 text-3xl font-semibold text-white sm:text-5xl">
              Příště zastav tam,
              <br />
              kde to za to stojí.
            </h2>

            <p className="mx-auto mt-5 max-w-lg text-lg text-white/70">
              Stáhni si tankuj100 a měj mapu prémiových pump vždycky po ruce.
            </p>

            <div className="mt-9 flex justify-center">
              <AppStoreBadge className="ring-white/25" />
            </div>

            <p className="mt-6 text-sm text-white/50">Pro iPhone s iOS 16 a novějším</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
