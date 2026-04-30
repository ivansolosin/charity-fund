#!/usr/bin/env python3
"""
Convert the watercolor "Клевер" logo (green strokes on near-black background)
into a true transparent PNG suitable for elegant overlays on any background.

Strategy:
- For each pixel, compute "darkness" = 1 - max(R,G,B)/255.
- Use that as a soft mask: dark areas (background) -> alpha 0,
  bright/colored areas (the green strokes) -> alpha ~255.
- Keep the original RGB so the watercolor texture is preserved.
- Slight contrast on alpha to avoid muddy halos.
"""

import sys
from pathlib import Path
sys.path.insert(0, "/Users/ivansolosin/Library/Python/3.9/lib/python/site-packages")
from PIL import Image, ImageFilter

SRC = Path("public/logo.png")
DST = Path("public/logo.png")

img = Image.open(SRC).convert("RGB")
w, h = img.size
print(f"src: {w}x{h} mode=RGB")

# Build alpha channel from luminance (max channel preserves green strokes).
pixels = img.load()
alpha = Image.new("L", (w, h), 0)
ap = alpha.load()

for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        # use max channel — green strokes are bright in G, white-ish edges bright in all
        m = max(r, g, b)
        # soft threshold: pixels < 18 fully transparent; > 90 fully opaque; smooth between
        if m <= 18:
            a = 0
        elif m >= 110:
            a = 255
        else:
            # linear ramp 18..110 -> 0..255, gamma 0.85 for crisper edges
            t = (m - 18) / (110 - 18)
            a = int(round((t ** 0.85) * 255))
        ap[x, y] = a

# Light blur on alpha to prevent jaggies around watercolor edges
alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.6))

out = Image.new("RGBA", (w, h))
out.paste(img, (0, 0))
out.putalpha(alpha)

# Optional: trim transparent borders
bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)
    print(f"trimmed bbox -> {out.size}")

# Downscale: retina is fine at 600px max side
MAX = 600
if max(out.size) > MAX:
    scale = MAX / max(out.size)
    new_size = (round(out.size[0] * scale), round(out.size[1] * scale))
    out = out.resize(new_size, Image.LANCZOS)
    print(f"resized -> {out.size}")

out.save(DST, "PNG", optimize=True)
print(f"wrote {DST} {out.size} mode={out.mode}")
