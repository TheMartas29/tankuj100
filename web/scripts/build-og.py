#!/usr/bin/env python3
"""
Vygeneruje náhledový obrázek pro sdílení odkazu (Open Graph) → public/og-image.png.

1200 × 630 px, firemní gradient, ikona aplikace, text a telefon s mapou.
Spuštění:  python3 scripts/build-og.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]          # …/tankuj100/web
OUT = ROOT / "public" / "og-image.png"

W, H = 1200, 630

# Firemní gradient (odečtený z ikony): oranžová → červená
TOP = (240, 145, 53)
BOTTOM = (224, 6, 0)

FONT_CANDIDATES = [
    ("/System/Library/Fonts/Avenir Next.ttc", 2),      # Demi Bold
    ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
    ("/Library/Fonts/Arial Bold.ttf", 0),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path, index in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                continue
    return ImageFont.load_default(size)


def gradient(size: tuple[int, int]) -> Image.Image:
    """Svislý přechod, mírně zešikmený otočením, ať není placatý."""
    w, h = size
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return base.resize((w, h), Image.BILINEAR)


def main() -> None:
    canvas = gradient((W, H)).convert("RGBA")

    # Měkká světlá záře vlevo nahoře, aby plocha získala hloubku.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-260, -320, 620, 380], fill=(255, 255, 255, 46))
    canvas = Image.alpha_composite(canvas, glow)

    # Telefon s mapou vpravo, mírně přesahující dolů mimo plátno.
    phone = Image.open(ROOT / "public" / "devices" / "map.webp").convert("RGBA")
    ph = 700
    pw = round(ph * phone.width / phone.height)
    phone = phone.resize((pw, ph), Image.LANCZOS)
    canvas.alpha_composite(phone, (W - pw - 84, 116))

    draw = ImageDraw.Draw(canvas)

    # Ikona aplikace + název
    # app-icon.webp už je oříznutý na grafiku a nese si vlastní zaoblené rohy
    # (viz scripts/build-icons.py), takže se nic dalšího maskovat nemusí.
    icon = Image.open(ROOT / "public" / "app-icon.webp").convert("RGBA").resize((64, 64), Image.LANCZOS)
    canvas.alpha_composite(icon, (80, 74))
    draw.text((160, 90), "tankuj100", font=load_font(34), fill=(255, 255, 255, 235))

    # Hlavní sdělení
    draw.text((80, 224), "Benzínky", font=load_font(78), fill="white")
    draw.text((80, 310), "se 100 oktany.", font=load_font(78), fill="white")
    draw.text(
        (80, 424),
        "Všechny na jedné mapě.",
        font=load_font(36),
        fill=(255, 255, 255, 220),
    )
    draw.text(
        (80, 492),
        "Zdarma · Bez registrace · Bez reklam",
        font=load_font(26),
        fill=(255, 255, 255, 175),
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"Hotovo → {OUT}  ({OUT.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
