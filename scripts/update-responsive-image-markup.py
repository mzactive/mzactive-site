#!/usr/bin/env python3
"""Add responsive WebP <source> elements while retaining original <img> fallbacks."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PHOTO_PATH = re.compile(r'\bsrc="([^"]+)"')
WIDTH_PATH = re.compile(r"-(\d+)w\.webp$")
PICTURE_OPEN = '<picture class="responsive-photo" style="display:contents">'
GENERATED_PICTURE = re.compile(
    r'<picture class="responsive-photo" style="display:contents">.*?</picture>', re.S
)


def image_sizes(page: Path, tag: str, source: Path) -> str:
    alt_match = re.search(r'\balt="([^"]*)"', tag)
    alt_text = alt_match.group(1) if alt_match else ""
    path = source.as_posix()

    if page.name == "index.html":
        if "data-en-alt=" in tag and "Runners training together outdoors" in tag:
            return "(max-width: 520px) 100vw, (max-width: 1440px) 52vw, 720px"
        if "women-coach-recruitment" in path:
            if "Woman coach" in alt_text:
                return "(max-width: 520px) 55vw, 45vw"
            # The join dialog photo fills a modal column, not a small sport-card slot.
            return "min(390px, 100vw)"
        if 'loading="lazy"' in tag and not alt_text:
            return "(max-width: 720px) 24vw, 12vw"
        if "padel-group" in path and "MZ Active padel players" in alt_text:
            return "(max-width: 520px) 100vw, 40vw"
    if page.name == "events.html":
        if 'fetchpriority="high"' in tag:
            return "100vw"
        if "qatar-finish-line" in path:
            return "(max-width: 780px) 92vw, 30vw"
        if "community-run" in path and "Doha Corniche" in alt_text:
            return "(max-width: 780px) 92vw, 30vw"
        if "community-run" in path:
            return "(max-width: 780px) 92vw, 45vw"
        return "(max-width: 780px) 92vw, 30vw"
    return "100vw"


def photo_source(tag: str, page: Path) -> tuple[str, str, str] | None:
    src_match = PHOTO_PATH.search(tag)
    if not src_match:
        return None
    source_url = src_match.group(1)
    source_path = Path(urlsplit(source_url).path)
    if not source_path.as_posix().startswith("assets/images/"):
        return None
    source = ROOT / source_path
    if not source.is_file() or "approved-originals" in source.parts:
        return None

    responsive_dir = ROOT / "assets/images/responsive" / source_path.relative_to("assets/images").parent
    variants = []
    for candidate in responsive_dir.glob(f"{source.stem}-*w.webp"):
        width_match = WIDTH_PATH.search(candidate.name)
        if width_match:
            variants.append((int(width_match.group(1)), candidate.relative_to(ROOT).as_posix()))
    if not variants:
        return None

    srcset = ", ".join(
        f"{url} {width}w" for width, url in sorted(variants, key=lambda item: item[0])
    )
    sizes = image_sizes(page, tag, source_path)
    return source.as_posix(), srcset, sizes


def image_tag_with_dimensions(tag: str, source: Path) -> str:
    # srcset/sizes belong on <source>; the <img> remains a pure original-format fallback.
    tag = re.sub(r'\s+(?:srcset|sizes)="[^"]*"', "", tag)
    width_match = re.search(r'\bwidth="(\d+)"', tag)
    height_match = re.search(r'\bheight="(\d+)"', tag)
    if not width_match or not height_match:
        with Image.open(source) as image:
            width, height = image.size
        if not width_match:
            tag = tag[:-1].rstrip() + f' width="{width}">'
        if not height_match:
            tag = tag[:-1].rstrip() + f' height="{height}">'
    return tag


def make_picture(tag: str, page: Path) -> str:
    result = photo_source(tag, page)
    if not result:
        return tag
    source_path, srcset, sizes = result
    tag = image_tag_with_dimensions(tag, Path(source_path))
    source_tag = f'<source data-responsive-webp type="image/webp" srcset="{srcset}" sizes="{sizes}">'
    return f"{PICTURE_OPEN}{source_tag}{tag}</picture>"


def update_page(page: Path) -> int:
    original = page.read_text(encoding="utf-8")
    changed_blocks = 0

    def refresh_picture(match: re.Match[str]) -> str:
        nonlocal changed_blocks
        block = match.group(0)
        image = re.search(r"<img\b[^>]*>", block)
        refreshed = make_picture(image.group(0), page)
        if refreshed != block:
            changed_blocks += 1
        return refreshed

    html = GENERATED_PICTURE.sub(refresh_picture, original)

    def wrap_unwrapped(match: re.Match[str]) -> str:
        nonlocal changed_blocks
        tag = match.group(0)
        prefix = html[:match.start()]
        if prefix.rfind(PICTURE_OPEN) > prefix.rfind("</picture>"):
            return tag
        wrapped = make_picture(tag, page)
        if wrapped != tag:
            changed_blocks += 1
        return wrapped

    html = re.sub(r"<img\b[^>]*>", wrap_unwrapped, html)
    if html != original:
        page.write_text(html, encoding="utf-8")
    return changed_blocks


def main() -> None:
    total = 0
    for page in (ROOT / "index.html", ROOT / "events.html"):
        if page.exists():
            changed = update_page(page)
            total += changed
            print(f"{page.relative_to(ROOT)}: refreshed {changed} responsive picture block(s)")
    print(f"Refreshed {total} responsive photo blocks. Original src fallbacks and logos are preserved.")


if __name__ == "__main__":
    main()
