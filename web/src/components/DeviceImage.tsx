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
 * Obrázky mají průhledné pozadí (tvar telefonu se zaoblenými rohy), proto zde
 * záměrně NENÍ blur-up placeholder na pozadí – obdélníkové pozadí by prosvítalo
 * skrz průhledné okraje a vytvářelo rámeček.
 */
export default function DeviceImage({
  name,
  alt,
  className = "",
  loading = "lazy",
  priority = false,
}: Props) {
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
      />
    </picture>
  );
}
