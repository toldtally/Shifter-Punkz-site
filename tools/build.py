#!/usr/bin/env python3
"""Build the public static pages from the design-canvas artboards.

Usage: python3 tools/build.py <folder holding Main.dc.html and TRPG.dc.html>

Writes index.html and trpg.html at the repo root. Pages that need sign-in
(Auth, Character, GM tools…) are not published yet; links to them become
"coming soon" chips. Spoiler data that the page no longer shows is stripped
from the source because this repo is public.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "design"

PAGES = {
    "Main.dc.html": ("index.html", "Shifter Punkz",
                     "Shifter Punkz — จักรวาลกึ่งไซเบอร์พังก์ในกรุงเทพ 26XX ผ่านแอนิเมชัน TRPG เกมดิจิทัล และบอร์ดเกม"),
    "TRPG.dc.html": ("trpg.html", "Shifter Punkz TRPG",
                     "Shifter Punkz TRPG — เกมเล่นบทบาทสมมติระบบ D8 Dice Pool เล่นเป็น Shifter, Norms หรือ C.P.D."),
}
LINKS = {"Main.dc.html": "index.html", "TRPG.dc.html": "trpg.html"}
LOCKED = ["Auth", "Account", "Character", "MyCharacters", "GMSheet", "GMTables"]

FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E"
           "%3Crect width='28' height='28' fill='%230B0A12'/%3E"
           "%3Cpath d='M4 4h12l8 8v12H12L4 16z' fill='none' stroke='%23FF2E88' stroke-width='2.5'/%3E"
           "%3Cpath d='M10 10h6v6h-6z' fill='%232EE6F0'/%3E%3C/svg%3E")

SOON_CSS = """
[data-soon]{opacity:.5;cursor:not-allowed!important;pointer-events:auto}
[data-soon] .soon-chip{margin-left:6px;padding:1px 6px;border:1px solid currentColor;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em}
html{scroll-behavior:smooth}
@media (max-width: 720px){
  p.hero-gl{width:auto!important;height:auto!important;max-width:100%!important}
  .hero-bg{justify-content:center!important;align-items:flex-end!important;padding:0 16px 20px!important;font-size:10px}
  .hero-bg > *{opacity:.45}
}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}
"""


def strip_spoilers(name, js):
    if name == "Main.dc.html":
        # DAF & DIZ are under wraps: drop their character data and origin blurb.
        js = re.sub(r"\n\s*twinsSub: L\((?:[^()]|\([^()]*\))*\),", "", js)
        js = re.sub(r"chars: \[\n.*?\n\s*\],?", "chars: [],", js, flags=re.S)
        assert "DAF" not in js and "DIZ" not in js and "ฝาแฝด" not in js, "spoiler left in Main"
    return js


def lock_links(markup):
    pat = re.compile(r'<a href="(?:%s)\.dc\.html"([^>]*)>(.*?)</a>' % "|".join(LOCKED), re.S)
    return pat.sub(lambda m: '<span role="link" aria-disabled="true" title="Coming soon" data-soon%s>%s'
                   '<span class="soon-chip">SOON</span></span>' % (m.group(1), m.group(2)), markup)


def build(name, out, title, desc):
    src = (SRC / name).read_text(encoding="utf-8")
    helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S).group(1).strip()
    body = re.search(r"<x-dc>(.*?)</x-dc>", src, re.S).group(1)
    body = re.sub(r"<helmet>.*?</helmet>", "", body, flags=re.S).strip()
    js = re.search(r"<script type=\"text/x-dc\"[^>]*>(.*?)</script>", src, re.S).group(1).strip()

    for a, b in LINKS.items():
        body = body.replace('href="%s' % a, 'href="%s' % b)
        js = js.replace("'%s'" % a, "'%s'" % b)
    body = lock_links(body)
    for page in LOCKED:
        assert "%s.dc.html" % page not in body + js, "%s still linked in %s" % (page, name)
    js = strip_spoilers(name, js)
    helmet = helmet.replace("</style>", SOON_CSS + "</style>")

    html = f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#0B0A12">
<link rel="icon" href="{FAVICON}">
{helmet}
</head>
<body>
<div id="app"></div>
<template id="dc-tpl">
{body}
</template>
<script src="assets/dc.js"></script>
<script>
{js}
DC.mount(Component, document.getElementById('app'));
</script>
</body>
</html>
"""
    (ROOT / out).write_text(html, encoding="utf-8")
    print("wrote", out, len(html), "bytes")


for name, (out, title, desc) in PAGES.items():
    build(name, out, title, desc)
