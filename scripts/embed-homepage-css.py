#!/usr/bin/env python3
"""Inline the homepage's maintained stylesheets verbatim into its document head."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
STYLESHEETS = (
    ROOT / "assets/css/site-theme.css",
    ROOT / "assets/css/homepage.css",
)
MARKER = '<style id="homepage-inline-styles">'


def main() -> None:
    html = HTML.read_text(encoding="utf-8")
    inline_css = "\n\n".join(path.read_text(encoding="utf-8").rstrip() for path in STYLESHEETS)
    style_block = f"  {MARKER}\n{inline_css}\n  </style>"
    if MARKER in html:
        start = html.index("  " + MARKER)
        end = html.index("</style>", start) + len("</style>")
        html = html[:start] + style_block + html[end:]
    else:
        old_links = (
            '  <link rel="stylesheet" href="assets/css/site-theme.css">\n'
            '  <link rel="stylesheet" href="assets/css/homepage.css">'
        )
        if old_links not in html:
            raise SystemExit("Expected homepage stylesheet links were not found; refusing to rewrite.")
        html = html.replace(old_links, style_block, 1)
    HTML.write_text(html, encoding="utf-8")
    print(f"Embedded {sum(path.stat().st_size for path in STYLESHEETS):,} stylesheet bytes from maintained CSS sources.")


if __name__ == "__main__":
    main()
