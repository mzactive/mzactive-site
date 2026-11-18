#!/usr/bin/env python3
"""Create responsive WebP derivatives without modifying original photographs or logos."""
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / "assets/images"
OUTPUT_ROOT = IMAGE_ROOT / "responsive"
TARGET_WIDTHS = (320, 480, 640, 768, 960, 1280, 1600)
QUALITY = 76


class ImageSourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: set[Path] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "img":
            return
        values = dict(attrs)
        src = values.get("src")
        if not src:
            return
        local_path = urlsplit(src).path
        candidate = (ROOT / local_path).resolve()
        if candidate.is_relative_to(IMAGE_ROOT) and candidate.is_file():
            self.sources.add(candidate)


def referenced_sources() -> list[Path]:
    parser = ImageSourceParser()
    for html_path in ROOT.rglob("*.html"):
        parser.feed(html_path.read_text(encoding="utf-8"))

    # CSS background photographs are not represented by <img> tags.
    for css_path in ROOT.rglob("*.css"):
        css = css_path.read_text(encoding="utf-8")
        for match in re.finditer(r"url\([\"']?([^\"')]+\.(?:jpe?g|png|webp))[\"']?\)", css, re.I):
            source = (css_path.parent / match.group(1)).resolve()
            if source.is_relative_to(IMAGE_ROOT) and source.is_file():
                parser.sources.add(source)

    return sorted(
        path for path in parser.sources
        if "approved-originals" not in path.parts
        and OUTPUT_ROOT not in path.parents
        and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )


def candidate_widths(source_width: int) -> list[int]:
    widths = {width for width in TARGET_WIDTHS if width < source_width}
    # When a source exceeds 960px, 960px is a useful cap for ordinary sports
    # cards; avoid adding a near-original full-size candidate. Smaller photos
    # retain their native-width candidate so they are never enlarged needlessly.
    if source_width <= 960:
        widths.add(source_width)
    return sorted(widths)


def encode_variants(source: Path) -> tuple[int, int]:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        has_alpha = "A" in image.getbands()
        image = image.convert("RGBA" if has_alpha else "RGB")
        icc_profile = opened.info.get("icc_profile")
        source_width, source_height = image.size
        relative_parent = source.parent.relative_to(IMAGE_ROOT)
        output_dir = OUTPUT_ROOT / relative_parent
        output_dir.mkdir(parents=True, exist_ok=True)
        original_bytes = source.stat().st_size
        written_bytes = 0
        kept_names: set[str] = set()

        for width in candidate_widths(source_width):
            height = max(1, round(source_height * width / source_width))
            derivative = image if width == source_width else image.resize(
                (width, height), Image.Resampling.LANCZOS
            )
            output = output_dir / f"{source.stem}-{width}w.webp"
            derivative.save(
                output,
                "WEBP",
                quality=QUALITY,
                method=6,
                exact=False,
                icc_profile=icc_profile,
            )
            with Image.open(output) as check:
                if check.size != (width, height) or check.format != "WEBP":
                    raise RuntimeError(f"Invalid WebP output: {output}")
            output_bytes = output.stat().st_size
            if output_bytes >= original_bytes:
                output.unlink()
                continue
            kept_names.add(output.name)
            written_bytes += output_bytes

        # Remove stale variants when the width/quality policy is revised.
        for stale in output_dir.glob(f"{source.stem}-*w.webp"):
            if stale.name not in kept_names:
                stale.unlink()

        return original_bytes, written_bytes


def main() -> None:
    sources = referenced_sources()
    if not sources:
        raise SystemExit("No local photographs found in HTML/CSS references.")
    original_total = 0
    derivative_total = 0
    for source in sources:
        original, derivatives = encode_variants(source)
        original_total += original
        derivative_total += derivatives
        print(f"{source.relative_to(ROOT)}: {original:,} B source -> {derivatives:,} B across responsive WebP widths")
    print(f"Processed {len(sources)} original photographs; source files were not modified.")
    print(f"Source total: {original_total:,} B; generated set total: {derivative_total:,} B")


if __name__ == "__main__":
    main()
