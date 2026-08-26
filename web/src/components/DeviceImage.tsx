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
 * Zdroje leží v /public/devices/<name>.{avif,webp} (460px šířka, poměr 460×939).
 * Telefon je na stránce nejvíc 16 rem (256 CSS px) široký, takže 460px odpovídá
 * ~2× hustotě – viz scripts/build-devices.py, kde se obrázky generují.
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
        width={460}
        height={939}
        alt={alt}
        className={className}
        loading={loading}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
