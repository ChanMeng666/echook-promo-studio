"""Look-loop helper: downscale a plate's flattened preview and cut 100 % crops.

    python art/look.py desk                      # .cache/art-look/desk.jpg (1600 px wide)
    python art/look.py desk 900,300,700,500 ...  # plus crops x,y,w,h at 100 %
"""

import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def main() -> None:
    name = sys.argv[1]
    src = os.path.join(ROOT, ".cache", "art-preview", name, "preview.jpg")
    out = os.path.join(ROOT, ".cache", "art-look")
    os.makedirs(out, exist_ok=True)
    im = Image.open(src).convert("RGB")
    small = im.copy()
    small.thumbnail((1600, 1600), Image.LANCZOS)
    small.save(os.path.join(out, f"{name}.jpg"), quality=90)
    for i, spec in enumerate(sys.argv[2:]):
        x, y, w, h = [int(v) for v in spec.split(",")]
        im.crop((x, y, x + w, y + h)).save(os.path.join(out, f"{name}-crop{i}.jpg"), quality=92)
    print("ok", im.size)


if __name__ == "__main__":
    main()
