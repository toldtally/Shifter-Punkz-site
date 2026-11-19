#!/usr/bin/env python3
"""Build the static pages from the design-canvas artboards.

Usage: python3 tools/build.py <folder holding the *.dc.html artboards>

Public pages (repo root): index.html, trpg.html.
Beta pages (beta/): sign-in and account, wired to Supabase by assets/beta-*.js.
Links to pages that aren't published yet become "SOON" chips. Spoiler data
that a page no longer shows is stripped from the source (this repo is public).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "design"

FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E"
           "%3Crect width='28' height='28' fill='%230B0A12'/%3E"
           "%3Cpath d='M4 4h12l8 8v12H12L4 16z' fill='none' stroke='%23FF2E88' stroke-width='2.5'/%3E"
           "%3Cpath d='M10 10h6v6h-6z' fill='%232EE6F0'/%3E%3C/svg%3E")

EXTRA_CSS = """
[data-soon]{opacity:.5;cursor:not-allowed!important;pointer-events:auto}
[data-soon] .soon-chip{margin-left:6px;padding:1px 6px;border:1px solid currentColor;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}
@media (max-width: 720px){
  p.hero-gl{width:auto!important;height:auto!important;max-width:100%!important}
  .hero-bg{justify-content:center!important;align-items:flex-end!important;padding:0 16px 20px!important;font-size:10px}
  .hero-bg > *{opacity:.45}
}
[aria-busy="true"]{opacity:.6;pointer-events:none}
"""

SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
ALL = ["Main", "TRPG", "Auth", "Account", "Character", "MyCharacters", "GMSheet", "GMTables"]

MSG = ('<sc-if value="{{hasMsg}}" hint-placeholder-val="{{ false }}"><p role="status" aria-live="polite" '
       'style="margin: 0; padding: 10px 12px; background: #0B0A12; border-left: 3px solid {{msgColor}}; '
       'font-size: 13.5px; line-height: 1.55; color: #E4E1F0">{{msg}}</p></sc-if>\n')

SETPW = '''<sc-if value="{{isSetPw}}" hint-placeholder-val="{{ false }}">
          <div style="display: flex; flex-direction: column; gap: 16px">
            <div style="display: flex; flex-direction: column; gap: 6px">
              <p style="margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: 0.14em; color: #4ADE80">ACCESS GRANTED // INVITE</p>
              <h2 style="margin: 0; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 26px; color: #FFFFFF">{{setPwTitle}}</h2>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #A9A5C2">{{setPwSub}}</p>
            </div>
            <sc-if value="{{setPwNeedsName}}" hint-placeholder-val="{{ true }}">
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label for="sp-name" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.1em; color: #A9A5C2">{{t.displayName}}</label>
                <input id="sp-name" class="fld" type="text" maxlength="30" value="{{setPwName}}" placeholder="{{t.displayPh}}">
              </div>
            </sc-if>
            <div style="display: flex; flex-direction: column; gap: 6px">
              <label for="sp-pw" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.1em; color: #A9A5C2">{{setPwLabel}}</label>
              <input id="sp-pw" class="fld" type="password" autocomplete="new-password" placeholder="••••••••">
              <span style="font-size: 12px; color: #8C88A6">{{t.pwHint}}</span>
            </div>
            <sc-if value="{{setPwNeedsName}}" hint-placeholder-val="{{ true }}">
              <div style="display: flex; flex-direction: column; gap: 8px">
                <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.1em; color: #A9A5C2">{{t.roleLabel}}</span>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">
                  <sc-for list="{{roles}}" as="rl" hint-placeholder-count="2">
                    <button type="button" aria-pressed="{{rl.pressed}}" onClick="{{rl.pick}}" style="{{rl.style}}"><span style="display: block; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 16px; color: {{rl.accent}}">{{rl.name}}</span><span style="display: block; margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: #A9A5C2">{{rl.desc}}</span></button>
                  </sc-for>
                </div>
              </div>
            </sc-if>
            ''' + MSG + '''            <button type="button" onClick="{{savePassword}}" style="min-height: 52px; border: 0; cursor: pointer; background: #FF2E88; color: #0B0A12; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 17px; letter-spacing: 0.06em">{{setPwBtn}}</button>
          </div>
        </sc-if>
'''

PAGES = [
    dict(src="Main.dc.html", out="index.html", title="Shifter Punkz",
         desc="Shifter Punkz — จักรวาลกึ่งไซเบอร์พังก์ในกรุงเทพ 26XX ผ่านแอนิเมชัน TRPG เกมดิจิทัล และบอร์ดเกม",
         links={"Main": "index.html", "TRPG": "trpg.html"}, beta="session-nav.js", session_nav=True),
    dict(src="TRPG.dc.html", out="trpg.html", title="Shifter Punkz TRPG",
         desc="Shifter Punkz TRPG — เกมเล่นบทบาทสมมติระบบ D8 Dice Pool เล่นเป็น Shifter, Norms หรือ C.P.D.",
         links={"Main": "index.html", "TRPG": "trpg.html"}, beta="session-nav.js", session_nav=True),
    dict(src="Auth.dc.html", out="beta/auth.html", title="เข้าสู่ระบบ · Shifter Punkz",
         desc="เข้าสู่ระบบ Shifter Punkz (beta)", beta="beta-auth.js",
         links={"Main": "../index.html", "TRPG": "../trpg.html", "Account": "account.html", "Auth": "auth.html"},
         markup=[
             ('<button type="button" onClick="{{submit}}"', MSG + '<button type="button" onClick="{{submit}}"', 2),
             ('<button type="button" onClick="{{logout}}"', MSG + '<button type="button" onClick="{{logout}}"', 1),
             ('<a href="#forgot"', '<a href="#forgot" onClick="{{forgot}}"', 1),
             ('<input id="avatar" type="file" accept="image/*"', '<input id="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange="{{onAvatar}}"', 1),
             ('<input id="news" type="checkbox"', '<input id="news" type="checkbox" checked', 1),
             ('USER ID // SP-000127', 'USER ID // {{publicId}}', 1),
         ]),
    dict(src="Account.dc.html", out="beta/account.html", title="ตั้งค่าบัญชี · Shifter Punkz",
         desc="ตั้งค่าบัญชี Shifter Punkz (beta)", beta="beta-account.js",
         links={"Main": "../index.html", "TRPG": "../trpg.html", "Account": "account.html", "Auth": "auth.html"},
         markup=[
             ('<input id="acc-avatar" type="file" accept="image/*"', '<input id="acc-avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange="{{onAvatar}}"', 1),
             ('value="player@example.com" readonly', 'value="{{email}}" readonly', 1),
             ('SP-000127', '{{publicId}}', 1),
             ('aria-hidden="true">{{initial}}</div>', 'aria-hidden="true"><sc-if value="{{avatarUrl}}" hint-placeholder-val="{{ false }}"><img src="{{avatarUrl}}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block"></sc-if><sc-if value="{{noAvatar}}" hint-placeholder-val="{{ true }}">{{initial}}</sc-if></div>', 1),
             (r're:<a href="auth.html"([^>]*)>\{\{t\.logout\}\}</a>', r'<a href="auth.html" onClick="{{logout}}"\1>{{t.logout}}</a>', 1),
             (r're:<a href="auth.html"([^>]*)>\{\{t\.delConfirm\}\}</a>', r'<a href="auth.html" onClick="{{doDelete}}"\1>{{t.delConfirm}}</a>', 1),
         ]),
]


CHEVRON = ('<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5L5 7l3.5-3.5" '
           'fill="none" stroke="currentColor" stroke-width="1.6"></path></svg>')
MENU_ITEM = ("display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 16px; text-decoration: none; "
             "font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 14px")


def session_nav(body):
    """Public pages: signed-in testers get their name + a Settings / Log out menu instead of the login chip."""
    pat = re.compile(r'<span role="link" aria-disabled="true" title="Coming soon" data-soon[^>]*>\{\{t\.navLogin\}\}<span class="soon-chip">SOON</span></span>')
    m = pat.search(body)
    assert m, "login chip not found"
    user = f'''<div data-sp-menu style="position: relative" onKeyDown="{{{{spKey}}}}">
        <button type="button" onClick="{{{{spToggle}}}}" aria-haspopup="true" aria-expanded="{{{{spExpanded}}}}" style="display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px 0 4px; border: 1px solid {{{{spColor}}}}; background: transparent; cursor: pointer; color: #FFFFFF; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 14px">
          <span style="width: 30px; height: 30px; overflow: hidden; background: #1D1930; border: 1px solid #3A3655; display: flex; align-items: center; justify-content: center; font-size: 13px; color: {{{{spColor}}}}" aria-hidden="true"><sc-if value="{{{{spAvatar}}}}"><img src="{{{{spAvatar}}}}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block"></sc-if><sc-if value="{{{{spNoAvatar}}}}">{{{{spInitial}}}}</sc-if></span><span>{{{{spName}}}}</span>{CHEVRON}
        </button>
        <sc-if value="{{{{spMenuOpen}}}}">
          <div role="menu" style="position: absolute; z-index: 40; top: calc(100% + 6px); right: 0; min-width: 210px; display: flex; flex-direction: column; background: #151225; border: 1px solid #3A3655; box-shadow: 0 14px 34px rgba(0,0,0,0.55)">
            <span role="menuitem" aria-disabled="true" data-soon style="{MENU_ITEM}; color: #2EE6F0; border-bottom: 1px solid #2A2740">{{{{spCharsLabel}}}}<span class="soon-chip">SOON</span></span>
            <sc-if value="{{{{spIsGm}}}}">
              <span role="menuitem" aria-disabled="true" data-soon style="{MENU_ITEM}; color: #FFD400; border-bottom: 1px solid #2A2740">{{{{spSessionsLabel}}}}<span class="soon-chip">SOON</span></span>
            </sc-if>
            <sc-if value="{{{{spNotGm}}}}">
              <button type="button" role="menuitem" onClick="{{{{spAskSessions}}}}" aria-expanded="{{{{spWarnExpanded}}}}" style="{MENU_ITEM}; width: 100%; border: 0; border-bottom: 1px solid #2A2740; background: transparent; cursor: pointer; text-align: left; color: #FFD400">{{{{spSessionsLabel}}}}<span style="margin-left: auto; padding: 1px 6px; border: 1px solid #FFD400; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.08em">GM</span></button>
              <sc-if value="{{{{spWarn}}}}">
                <div role="alert" style="display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; background: #1F1A06; border-bottom: 1px solid #2A2740">
                  <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #EDE3B8">{{{{spWarnText}}}}</p>
                  <a href="beta/account.html#role" style="align-self: flex-start; display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; background: #FFD400; color: #0B0A12; text-decoration: none; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 13px">{{{{spSwitchLabel}}}}</a>
                </div>
              </sc-if>
            </sc-if>
            <a role="menuitem" href="beta/account.html" style="{MENU_ITEM}; color: #D8D6E8; border-bottom: 1px solid #2A2740">{{{{spSettingsLabel}}}}</a>
            <a role="menuitem" href="#" onClick="{{{{spLogout}}}}" style="{MENU_ITEM}; color: #FF3D6E">{{{{spLogoutLabel}}}}</a>
          </div>
        </sc-if>
      </div>'''
    swap = '<sc-if value="{{spSignedOut}}">%s</sc-if><sc-if value="{{spSignedIn}}">%s</sc-if>' % (m.group(0), user)
    return body[:m.start()] + swap + body[m.end():]


def strip_spoilers(name, js):
    if name == "Main.dc.html":
        # DAF & DIZ are under wraps: drop their character data and origin blurb.
        js = re.sub(r"\n\s*twinsSub: L\((?:[^()]|\([^()]*\))*\),", "", js)
        js = re.sub(r"chars: \[\n.*?\n\s*\],?", "chars: [],", js, flags=re.S)
        assert "DAF" not in js and "DIZ" not in js and "ฝาแฝด" not in js, "spoiler left in Main"
    return js


def lock_links(markup, locked):
    if not locked:
        return markup
    pat = re.compile(r'<a ([^>]*?)href="(?:%s)\.dc\.html[^"]*"([^>]*)>(.*?)</a>' % "|".join(locked), re.S)

    def swap(m):
        pre = m.group(1).strip()
        head = (pre + ' ') if 'role=' in pre else ('role="link" ' + (pre + ' ' if pre else ''))
        return '<span %saria-disabled="true" title="Coming soon" data-soon%s>%s<span class="soon-chip">SOON</span></span>' % (
            head, m.group(2), m.group(3))
    return pat.sub(swap, markup)


def build(cfg):
    name, out = cfg["src"], cfg["out"]
    src = (SRC / name).read_text(encoding="utf-8")
    helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S).group(1).strip()
    body = re.search(r"<x-dc>(.*?)</x-dc>", src, re.S).group(1)
    body = re.sub(r"<helmet>.*?</helmet>", "", body, flags=re.S).strip()
    js = re.search(r"<script type=\"text/x-dc\"[^>]*>(.*?)</script>", src, re.S).group(1).strip()

    links = cfg["links"]
    for page, target in links.items():
        body = body.replace('href="%s.dc.html' % page, 'href="%s' % target)
        js = js.replace("'%s.dc.html'" % page, "'%s'" % target)
    locked = [p for p in ALL if p not in links]
    body = lock_links(body, locked)
    if cfg.get("session_nav"):
        body = session_nav(body)
    # JS-built hrefs to unpublished pages fall back to the current page.
    for page in locked:
        js = js.replace("'%s.dc.html'" % page, "'#'")
        assert "%s.dc.html" % page not in body + js, "%s still linked in %s" % (page, name)
    for old, new, count in cfg.get("markup", []):
        if old.startswith("re:"):
            body, n = re.subn(old[3:], new, body, flags=re.S)
            assert n == count, "%s: expected %d of %r, found %d" % (name, count, old, n)
            continue
        assert body.count(old) == count, "%s: expected %d of %r, found %d" % (name, count, old, body.count(old))
        body = body.replace(old, new)
    if cfg.get("beta"):
        # set-password panel for invite / recovery links sits first inside the auth card
        if name == "Auth.dc.html":
            anchor = '<sc-if value="{{notDone}}"'
            assert body.count(anchor) == 1, "Auth: card anchor missing"
            body = body.replace(anchor, SETPW + '        ' + anchor)
    js = strip_spoilers(name, js)
    helmet = helmet.replace("</style>", EXTRA_CSS + "</style>")

    depth = out.count("/")
    up = "../" * depth
    scripts = '<script src="%sassets/dc.js"></script>\n' % up
    if cfg.get("beta"):
        scripts = ('<script src="%s"></script>\n' % SUPABASE_JS + scripts
                   + '<script src="%sassets/sp.js"></script>\n' % up)
        mount = '</script>\n<script src="%sassets/%s"></script>' % (up, cfg["beta"])
        robots = '<meta name="robots" content="noindex">\n' if out.startswith("beta/") else ""
    else:
        mount = "DC.mount(Component, document.getElementById('app'));\n</script>"
        robots = ""

    html = f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{cfg['title']}</title>
<meta name="description" content="{cfg['desc']}">
{robots}<meta property="og:title" content="{cfg['title']}">
<meta property="og:description" content="{cfg['desc']}">
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
{scripts}<script>
{js}
{mount}
</body>
</html>
"""
    path = ROOT / out
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    print("wrote", out, len(html), "bytes")


for cfg in PAGES:
    build(cfg)
