import { DEVICE_LQIP } from "./deviceLqip";

type Props = {
  /** Základ názvu obrázku v /public/devices (bez přípony), např. "map". */
  name: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  /** true = kritický obrázek nad ohybem (fetchPriority high). */
  priority?: boolean;
};

/**
 * Telefonní screenshot v moderních formátech: AVIF → WebP fallback.
 * Zdroje leží v /public/devices/<name>.{avif,webp} (720px šířka, poměr 720×1469).
 * <picture> je display:contents, takže se layoutově chová jako samotný <img>.
 *
 * Dokud se ostrá verze nestáhne, drží se jako pozadí drobný rozmazaný placeholder
 * (LQIP, ~1 kB inline) — sekce tak nikdy nevypadá prázdně, i na pomalém mobilu.
 */
export default function DeviceImage({
  name,
  alt,
  className = "",
  loading = "lazy",
  priority = false,
}: Props) {
  const lqip = DEVICE_LQIP[name];
  return (
    <picture className="contents">
      <source srcSet={`/devices/${name}.avif`} type="image/avif" />
      <source srcSet={`/devices/${name}.webp`} type="image/webp" />
      <img
        src={`/devices/${name}.webp`}
        width={720}
        height={1469}
        alt={alt}
        className={className}
        loading={loading}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        style={
          lqip
            ? { backgroundImage: `url("${lqip}")`, backgroundSize: "cover", backgroundRepeat: "no-repeat" }
            : undefined
        }
      />
    </picture>
  );
}
