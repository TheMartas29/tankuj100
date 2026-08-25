import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Zpoždění v ms, ať se prvky ve skupině neobjeví všechny naráz. */
  delay?: number;
  className?: string;
};

/**
 * Obalí obsah a nechá ho jemně naběhnout, jakmile se dostane do viewportu.
 * Když má uživatel zapnuté omezení pohybu, CSS animaci vypne a obsah je rovnou vidět.
 */
export default function Reveal({ children, delay = 0, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          window.setTimeout(() => el.classList.add("is-visible"), delay);
          observer.unobserve(el);
        }
      },
      // Spustí se s velkým předstihem (400px pod viewportem), aby byl obsah
      // naběhlý dřív, než k němu uživatel doscrolluje — i při rychlém flick-scrollu na mobilu.
      { threshold: 0, rootMargin: "0px 0px 400px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
