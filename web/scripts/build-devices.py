#!/usr/bin/env python3
"""
Složí screenshoty z appstore-screenshots do rámečku iPhonu a uloží je jako WebP
do web/public/devices/.

Rozměry nejsou odhad – jsou převzaté z appstore-screenshots/src/lib/constants.ts
(FRAME_OPENING), kde je sklo změřené z alfa kanálu rámečku:
    rámeček  1470 × 3000
    sklo     1320 × 2868 na pozici (75, 66)  → přesně velikost screenshotu

Spuštění:  python3 scripts/build-devices.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]          # …/tankuj100
SRC = ROOT / "appstore-screenshots" / "public"
SHOTS = SRC / "screenshots" / "apple" / "iphone" / "cs"
OUT = ROOT / "web" / "public" / "devices"

FRAME = SRC / "frames" / "iphone-frame.png"
MASK = SRC / "frames" / "iphone-glass-mask.png"

# Poloha skla v rámečku (viz constants.ts → FRAME_OPENING)
GLASS_X, GLASS_Y = 75, 66
GLASS_W, GLASS_H = 1320, 2868

# Výstupní šířka – zobrazuje se do ~500 px, takže 1000 px pokrývá i retinu.
OUT_WIDTH = 1000

SCREENS = {
    "map": "01-map.png",
    "detail": "02-detail.png",
    "reviews": "03-reviews.png",
    "list": "04-list.png",
}


def build(name: str, filename: str) -> None:
    shot = Image.open(SHOTS / filename).convert("RGBA")
    if shot.size != (GLASS_W, GLASS_H):
        shot = shot.resize((GLASS_W, GLASS_H), Image.LANCZOS)

    frame = Image.open(FRAME).convert("RGBA")
    # Alfa masky = přesný tvar skla (včetně zaoblených rohů), takže rohy
    # screenshotu sedí na rámeček na pixel.
    glass = Image.open(MASK).convert("RGBA").split()[-1]

    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    canvas.paste(shot, (GLASS_X, GLASS_Y))
    canvas.putalpha(glass)                      # ořízne screenshot na tvar skla
    canvas = Image.alpha_composite(canvas, frame)

    h = round(OUT_WIDTH * canvas.height / canvas.width)
    canvas = canvas.resize((OUT_WIDTH, h), Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{name}.webp"
    canvas.save(dest, "WEBP", quality=88, method=6)
    print(f"  {dest.name:14s} {canvas.width}×{canvas.height}  {dest.stat().st_size // 1024} kB")


if __name__ == "__main__":
    print("Skládám iPhone rámečky:")
    for name, filename in SCREENS.items():
        build(name, filename)
    print("Hotovo →", OUT)
