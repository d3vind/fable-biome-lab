#!/usr/bin/env python3
"""Compose review PNGs without colour, sharpness, or tonal adjustments."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent
RAW = OUT / "_raw"
FONT_PATHS = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale only for a composite; source pixels are otherwise untouched."""
    return image.resize(size, Image.Resampling.LANCZOS)


def text_lines(draw: ImageDraw.ImageDraw, text: str, width_px: int, text_font) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=text_font)[2] <= width_px:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def labelled_frame(source: Path, target: Path, caption: str) -> None:
    image = Image.open(source).convert("RGB")
    bar_h = 118
    canvas = Image.new("RGB", (image.width, image.height + bar_h), "#11161b")
    canvas.paste(image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    caption_font = font(24)
    lines = text_lines(draw, caption, image.width - 48, caption_font)
    y = image.height + 18
    for line in lines[:3]:
        draw.text((24, y), line, fill="#f3efe6", font=caption_font)
        y += 31
    canvas.save(target, optimize=True)


def contact_sheet(metadata: dict) -> None:
    stations = metadata["stationValues"]
    cols = 5
    thumb = (352, 220)
    label_h = 34
    header_h = 68
    rows = math.ceil(len(stations) / cols)
    canvas = Image.new("RGB", (cols * thumb[0], header_h + rows * (thumb[1] + label_h)), "#11161b")
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 16), f"Summerglass Island 02 — {metadata['seed']} — stations every 100 m",
              fill="#f3efe6", font=font(30))
    for index, station in enumerate(stations):
        source = RAW / f"station-{station:04d}.png"
        image = fit(Image.open(source).convert("RGB"), thumb)
        x = (index % cols) * thumb[0]
        y = header_h + (index // cols) * (thumb[1] + label_h)
        canvas.paste(image, (x, y))
        draw.rectangle((x, y + thumb[1], x + thumb[0], y + thumb[1] + label_h), fill="#11161b")
        label = f"{station} m" if station != stations[-1] else f"{station} m / exit"
        draw.text((x + 10, y + thumb[1] + 5), label, fill="#f3efe6", font=font(21))
    canvas.save(OUT / "contact-sheet.png", optimize=True)


def horizontal_panel(entries: list[tuple[Path, str]], target: Path, header: str) -> None:
    panel = (640, 400)
    title_h = 58
    header_lines = header.splitlines()
    header_h = 22 + (34 * len(header_lines))
    canvas = Image.new("RGB", (panel[0] * len(entries), header_h + title_h + panel[1]), "#11161b")
    draw = ImageDraw.Draw(canvas)
    for line_index, line in enumerate(header_lines):
        draw.text((20, 12 + line_index * 34), line, fill="#f3efe6", font=font(28))
    for index, (path, title) in enumerate(entries):
        x = index * panel[0]
        draw.text((x + 16, header_h + 14), title, fill="#f3efe6", font=font(23))
        canvas.paste(fit(Image.open(path).convert("RGB"), panel), (x, header_h + title_h))
    canvas.save(target, optimize=True)


def main() -> None:
    metadata = json.loads(Path(sys.argv[1]).read_text())
    contact_sheet(metadata)
    for spec in metadata["openSpecs"]:
        labelled_frame(RAW / f"open-{spec['item']}.png", OUT / f"open-{spec['item']}.png",
                       f"{round(spec['stationM'])} m — {spec['caption']}")
    heading_station = metadata["headings"]["stationM"]
    horizontal_panel(
        [(RAW / f"heading-{heading}.png", f"Heading {heading}°") for heading in metadata["headings"]["valuesDeg"]],
        OUT / "headings.png",
        f"Island 02 at the same {heading_station} m station — default seed {metadata['seed']}",
    )
    comparison = metadata["comparison"]
    horizontal_panel(
        [
            (RAW / "compare-01.png", f"Island 01 — {metadata['island01Seed']}"),
            (RAW / "compare-02.png", f"Island 02 — {metadata['seed']}"),
        ],
        OUT / "compare-01-vs-02.png",
        (
            "Matched 900 m camera; sun azimuth matched to local travel "
            f"(Island 01 heading {comparison['island01HeadingDeg']:.1f}°)\n"
            f"sun elevation {comparison['island01SunElevationDeg']:.1f}° / "
            f"{comparison['island02SunElevationDeg']:.1f}°"
        ),
    )


if __name__ == "__main__":
    main()
