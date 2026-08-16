import { APP_STORE_URL } from "../config";

type Props = {
  /** "lg" = hlavní CTA v hero a v patě, "sm" = tlačítko v hlavičce. */
  size?: "sm" | "lg";
  className?: string;
};

/** Apple logo – jednoduchá silueta, bez textu. */
function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.05 12.72c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.05-2.75-4.12zM14.5 5.1c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.24 1.98-1.08 3.14 1.14.09 2.3-.58 3.02-1.43z" />
    </svg>
  );
}

/**
 * Klasické černé tlačítko „Download on the App Store“.
 * Sestavené z textu a SVG loga, ne z obrázku – zůstane ostré na každém displeji
 * a jde plynule zvětšovat.
 */
export default function AppStoreBadge({ size = "lg", className = "" }: Props) {
  const isLarge = size === "lg";

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Stáhnout tankuj100 v App Store"
      className={[
        "group inline-flex items-center rounded-xl bg-black text-white",
        "ring-1 ring-white/15 transition-transform duration-200",
        "hover:scale-[1.03] active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white",
        isLarge ? "gap-3 px-5 py-3" : "gap-2 px-3.5 py-2",
        className,
      ].join(" ")}
    >
      <AppleMark className={isLarge ? "h-7 w-7" : "h-5 w-5"} />
      <span className="flex flex-col text-left leading-none">
        <span className={isLarge ? "text-[11px] tracking-wide" : "text-[9px] tracking-wide"}>
          Download on the
        </span>
        <span
          className={
            isLarge
              ? "mt-1 text-xl font-semibold tracking-tight"
              : "mt-0.5 text-sm font-semibold tracking-tight"
          }
        >
          App Store
        </span>
      </span>
    </a>
  );
}
