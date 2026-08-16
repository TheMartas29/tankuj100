#!/usr/bin/env python3
"""
Připraví ikony webu ze zdrojové ikony aplikace.

Zdrojový app-icon.png je 1024×1024, ale samotná grafika zabírá jen 824×824 –
kolem dokola je 100 px průhledného okraje. Kdyby se použil rovnou, každý
rámeček nebo zaoblení v CSS by se kreslilo kolem prázdna a vypadalo jako
"neviditelný obrys". Proto se tady ořízne na skutečné rozměry grafiky.

Spuštění:  python3 scripts/build-icons.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]              # …/tankuj100/web
SRC = ROOT.parent / "appstore-screenshots" / "public" / "app-icon.png"
OUT = ROOT / "public"

# Firemní gradient ikony – použije se jen na dolití průhledných rohů
# u apple-touch-iconu, kde iOS průhlednost nepodporuje (zčernala by).
TOP = (240, 145, 53)
BOTTOM = (224, 6, 0)


def artwork() -> Image.Image:
    """Zdrojová ikona oříznutá přesně na neprůhlednou grafiku."""
    icon = Image.open(SRC).convert("RGBA")
    box = icon.split()[-1].getbbox()
    if not box:
        raise SystemExit("Ikona je celá průhledná – zkontroluj zdroj.")
    print(f"  zdroj {icon.size} → grafika {box} ({box[2] - box[0]}×{box[3] - box[1]})")
    return icon.crop(box)


def gradient(size: tuple[int, int]) -> Image.Image:
    w, h = size
    strip = Image.new("RGB", (1, h))
    px = strip.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return strip.resize((w, h), Image.BILINEAR).convert("RGBA")


def main() -> None:
    print("Připravuji ikony:")
    art = artwork()

    # Web (hlavička, patička, CTA) – průhledné rohy si nese ikona sama,
    # takže v CSS už není potřeba žádné zaoblení ani rámeček.
    art.resize((512, 512), Image.LANCZOS).save(OUT / "app-icon.webp", "WEBP", quality=92, method=6)

    # Favicon – průhlednost prohlížečům nevadí.
    art.resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png")

    # apple-touch-icon musí být plná čtvercová plocha; iOS si rohy zaoblí sám.
    # Průhledné rohy se dolijí stejným gradientem, takže přechod není vidět.
    touch = art.resize((180, 180), Image.LANCZOS)
    base = gradient((180, 180))
    base.alpha_composite(touch)
    base.convert("RGB").save(OUT / "apple-touch-icon.png")

    for name in ("app-icon.webp", "favicon.png", "apple-touch-icon.png"):
        size = (OUT / name).stat().st_size
        print(f"  {name:22s} {size // 1024 or 1} kB")


if __name__ == "__main__":
    main()
