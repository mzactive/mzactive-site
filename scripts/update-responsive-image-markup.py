#!/usr/bin/env python3
"""Add srcset/sizes/dimensions for generated photo variants without rewriting page markup."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PHOTO_PATH = re.compile(r'\bsrc="([^"]+)"')
WIDTH_PATH = re.compile(r"-(\d+)w\.webp$")


def image_sizes(page: Path, tag: str, source: Path) -> str:
    alt = re.search(r'\balt="([^"]*)"', tag)
    alt_text = alt.group(1) if alt else ""
    classes = re.search(r'\bclass="([^"]*)"', tag)
    class_text = classes.group(1) if classes else ""
    path = source.as_posix()

    if page.name == "index.html":
        if "data-en-alt=" in tag and "Runners training together outdoors" in tag:
            return "(max-width: 520px) 100vw, (max-width: 1440px) 52vw, 720px"
        if "women-coach-recruitment" in path:
            if "Woman coach" in alt_text:
                return "(max-width: 520px) 55vw, 45vw"
            return "min(390px, 100vw)"
        if "sport-card-art" in class_text or ('loading="lazy"' in tag and not alt_text):
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


def update_page(page: Path) -> int:
    html = page.read_text(encoding="utf-8")
    changed = 0

    def update_tag(match: re.Match[str]) -> str:
        nonlocal changed
        tag = match.group(0)
        original_tag = tag
        src_match = PHOTO_PATH.search(tag)
        if not src_match:
            # The original brand image is deliberately left untouched.
            return tag
        source_url = src_match.group(1)
        source_path = Path(urlsplit(source_url).path)
        if not source_path.as_posix().startswith("assets/images/"):
            return tag
        source = ROOT / source_path
        if not source.is_file() or "approved-originals" in source.parts:
            return tag
        responsive_dir = ROOT / "assets/images/responsive" / source_path.relative_to("assets/images").parent
        variants = []
        for candidate in sorted(responsive_dir.glob(f"{source.stem}-*w.webp")):
            width_match = WIDTH_PATH.search(candidate.name)
            if width_match:
                variants.append((int(width_match.group(1)), candidate.relative_to(ROOT).as_posix()))
        if not variants:
            return tag

        attrs = []
        srcset = ", ".join(
            f"{url} {width}w" for width, url in sorted(variants, key=lambda item: item[0])
        )
        srcset_match = re.search(r'\bsrcset="[^"]*"', tag)
        if srcset_match:
            tag = tag[:srcset_match.start()] + f'srcset="{srcset}"' + tag[srcset_match.end():]
        else:
            attrs.append(f'srcset="{srcset}"')
        if "sizes=" not in tag:
            attrs.append(f'sizes="{image_sizes(page, tag, source_path)}"')
        if "width=" not in tag or "height=" not in tag:
            with Image.open(source) as image:
                width, height = image.size
            if "width=" not in tag:
                attrs.append(f'width="{width}"')
            if "height=" not in tag:
                attrs.append(f'height="{height}"')
        if attrs:
            tag = tag[:-1].rstrip() + " " + " ".join(attrs) + ">"
        if tag != original_tag:
            changed += 1
        return tag

    updated = re.sub(r"<img\b[^>]*>", update_tag, html)
    if updated != html:
        page.write_text(updated, encoding="utf-8")
    return changed


def main() -> None:
    count = 0
    for page in (ROOT / "index.html", ROOT / "events.html"):
        if page.exists():
            changed = update_page(page)
            count += changed
            print(f"{page.relative_to(ROOT)}: updated {changed} photo tags")
    print(f"Updated {count} photo tags. Every original src remains as its fallback; logos are unchanged.")


if __name__ == "__main__":
    main()
