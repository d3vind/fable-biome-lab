from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def font(size: int):
    for path in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def pair(left_path: Path, right_path: Path, output: Path, left_label: str, right_label: str, subtitle: str):
    left = Image.open(left_path).convert("RGB")
    right = Image.open(right_path).convert("RGB")
    if left.size != right.size:
        raise ValueError(f"matched frames differ: {left.size} vs {right.size}")
    w, h = left.size
    header = 92
    canvas = Image.new("RGB", (w * 2, h + header), "#10140f")
    canvas.paste(left, (0, header))
    canvas.paste(right, (w, header))
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 13), left_label, font=font(26), fill="#f5f0d6")
    draw.text((w + 24, 13), right_label, font=font(26), fill="#f5f0d6")
    draw.text((24, 52), subtitle, font=font(18), fill="#bac5ad")
    draw.line((w, 0, w, h + header), fill="#f5f0d6", width=2)
    canvas.save(output, optimize=True)


pair(
    OUT / "baseline-middle-6d61a97.png",
    OUT / "measurement/island-02-middle-r3/delivered.png",
    OUT / "middle-before-after-r3.png",
    "6d61a97 — owner-reviewed tip",
    "R3 — brighter/greener delivery",
    "PARTING-3311 · standard · station 1200 m · yaw +0.45 rad · heading 0° · 1440×900 native frames",
)

pair(
    OUT / "measurement/island-01-open/delivered.png",
    OUT / "measurement/island-02-tip/delivered.png",
    OUT / "dreamy-compare.png",
    "Island 01 keeper register",
    "Island 02 R3",
    "Matched sun azimuth relative to local travel · station 900 m · standard · native delivered pixels",
)
