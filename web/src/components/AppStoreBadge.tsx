import { APP_STORE_URL } from "../config";

type Props = {
  /** "lg" = hlavní CTA v hero a v patě, "sm" = tlačítko v hlavičce. */
  size?: "sm" | "lg";
  className?: string;
};

/** Výška odznaku. Šířku dopočítá prohlížeč z poměru stran (119.664 : 40). */
export const BADGE_HEIGHT = { sm: "h-10", lg: "h-14" } as const;

/**
 * Oficiální odznak „Stáhnout v App Store" od Apple (česká varianta, černý lockup).
 * Zdroj: public/appstore-badge.svg – originální SVG z Apple marketing resources,
 * záměrně se nepřekresluje ani nijak neupravuje, aby odpovídal jejich pravidlům.
 */
export default function AppStoreBadge({ size = "lg", className = "" }: Props) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "inline-block shrink-0 rounded-[12px] transition-transform duration-200",
        "hover:scale-[1.03] active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current",
        className,
      ].join(" ")}
    >
      {/*
        max-w-none je tu schválně: Tailwind v preflightu nastavuje img { max-width: 100% }
        a uvnitř flex kontejneru se pak šířka dopočítaná z poměru stran srazí na nulu.
      */}
      <img
        src="/appstore-badge.svg"
        alt="Stáhnout v App Store"
        width={119.664}
        height={40}
        className={`${BADGE_HEIGHT[size]} w-auto max-w-none`}
      />
    </a>
  );
}
