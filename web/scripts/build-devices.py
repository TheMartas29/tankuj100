#!/usr/bin/env python3
"""
Složí screenshoty z appstore-screenshots do rámečku iPhonu a uloží je jako
AVIF + WebP do web/public/devices/.

Rozměry nejsou odhad – jsou převzaté z appstore-screenshots/src/lib/constants.ts
(FRAME_OPENING), kde je sklo změřené z alfa kanálu rámečku:
    rámeček  1470 × 3000
    sklo     1320 × 2868 na pozici (75, 66)  → přesně velikost screenshotu

Výstupní šířka vychází z toho, jak velký je telefon na stránce: nejvíc 16 rem
(256 CSS px) na širokém displeji, 13.5 rem (216 CSS px) na mobilu. 460 px tedy
odpovídá ~2× hustotě, což je u screenshotu zmenšeného na palec šířky vizuálně
k nerozeznání od 3×, ale soubor je o polovinu menší.

Kvalita je nastavená pro každý obrázek zvlášť – mapa má hodně jemné textury,
takže při stejné kvalitě vyjde třikrát větší než obrazovky s UI. Hodnoty jsou
ověřené porovnáním v reálné velikosti na displeji (i při dvojnásobném zvětšení
je rozdíl proti 720px originálu nepostřehnutelný).

Vyžaduje avifenc a cwebp:  brew install libavif webp
Spuštění:  python3 scripts/build-devices.py
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]  # …/tankuj100
SRC = ROOT / "appstore-screenshots" / "public"
SHOTS = SRC / "screenshots" / "apple" / "iphone" / "cs"
OUT = ROOT / "web" / "public" / "devices"

FRAME = SRC / "frames" / "iphone-frame.png"
MASK = SRC / "frames" / "iphone-glass-mask.png"

GLASS_X, GLASS_Y = 75, 66
GLASS_W, GLASS_H = 1320, 2868

OUT_WIDTH = 460

# name → (zdrojový screenshot, kvalita AVIF, kvalita WebP)
SCREENS = {
    "map": ("01-map.png", 42, 68),
    "detail": ("02-detail.png", 52, 74),
    "reviews": ("03-reviews.png", 52, 74),
    "list": ("04-list.png", 52, 74),
}


def require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise SystemExit(f"Chybí {tool} – nainstaluj přes: brew install libavif webp")
    return path


def compose(filename: str) -> Image.Image:
    shot = Image.open(SHOTS / filename).convert("RGBA")
    if shot.size != (GLASS_W, GLASS_H):
        shot = shot.resize((GLASS_W, GLASS_H), Image.LANCZOS)

    frame = Image.open(FRAME).convert("RGBA")
    # Alfa masky = přesný tvar skla (včetně zaoblených rohů), takže rohy
    # screenshotu sedí na rámeček na pixel.
    glass = Image.open(MASK).convert("RGBA").split()[-1]

    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    canvas.paste(shot, (GLASS_X, GLASS_Y))
    canvas.putalpha(glass)  # ořízne screenshot na tvar skla
    canvas = Image.alpha_composite(canvas, frame)

    h = round(OUT_WIDTH * canvas.height / canvas.width)
    return canvas.resize((OUT_WIDTH, h), Image.LANCZOS)


def build(name: str, filename: str, q_avif: int, q_webp: int) -> None:
    canvas = compose(filename)

    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        master = Path(tmp) / f"{name}.png"
        canvas.save(master)

        avif = OUT / f"{name}.avif"
        subprocess.run(
            [require("avifenc"), "-q", str(q_avif), "--qalpha", "70",
             "-s", "4", "-j", "all", str(master), str(avif)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

        webp = OUT / f"{name}.webp"
        subprocess.run(
            [require("cwebp"), "-q", str(q_webp), "-m", "6", "-alpha_q", "80",
             "-sharp_yuv", "-quiet", str(master), "-o", str(webp)],
            check=True,
        )

    print(f"  {name:9s} {canvas.width}×{canvas.height}   "
          f"avif {avif.stat().st_size // 1024:3d} kB   "
          f"webp {webp.stat().st_size // 1024:3d} kB")


if __name__ == "__main__":
    print(f"Skládám iPhone rámečky ({OUT_WIDTH} px):")
    for screen_name, (screen_file, qa, qw) in SCREENS.items():
        build(screen_name, screen_file, qa, qw)
    print("Hotovo →", OUT)
