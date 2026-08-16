import { useEffect, useState } from "react";
import AppStoreBadge from "./AppStoreBadge";

const LINKS = [
  { href: "#funkce", label: "Funkce" },
  { href: "#e5", label: "Benzín pro starší auta" },
  { href: "#faq", label: "Časté dotazy" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled ? "border-b border-black/5 bg-paper/80 backdrop-blur-xl" : "border-b border-transparent",
      ].join(" ")}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="tankuj100 – domů">
          <img
            src="/app-icon.webp"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 drop-shadow-sm"
          />
          <span
            className={[
              "text-lg font-semibold tracking-tight transition-colors",
              scrolled ? "text-ink" : "text-white",
            ].join(" ")}
          >
            tankuj100
          </span>
        </a>

        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={[
                  "text-sm font-medium transition-opacity hover:opacity-60",
                  scrolled ? "text-ink-muted" : "text-white/90",
                ].join(" ")}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <AppStoreBadge size="sm" className="shrink-0" />
      </nav>
    </header>
  );
}
