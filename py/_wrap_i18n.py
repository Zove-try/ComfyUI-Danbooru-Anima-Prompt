# -*- coding: utf-8 -*-
"""Wrap display string literals with animaTxt(). Does not touch widget values."""
import os, re

JS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js"))
I18N = os.path.join(JS, "00_anima_i18n.js")

SKIP = {"00_anima_i18n.js", "sortable.min.js", "_extract_zh_strings.py"}

raw = open(I18N, encoding="utf-8").read()
en = {}
for m in re.finditer(r'"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"', raw):
    k = m.group(1).encode("utf-8").decode("unicode_escape") if False else m.group(1)
    en[m.group(1)] = m.group(2)

# keys from EN object only (between var EN = { and };
block = re.search(r"var EN = \{([\s\S]*?)\n    \};", raw)
keys = set()
if block:
    for m in re.finditer(r'^\s*"((?:\\.|[^"\\])*)"\s*:', block.group(1), re.M):
        keys.add(m.group(1).replace('\\"', '"'))

keys = sorted(keys, key=len, reverse=True)

PREFIXES = [
    r"textContent\s*:\s*",
    r"placeholder\s*:\s*",
    r"title\s*:\s*",
    r"label\s*:\s*",
    r"tooltip\s*:\s*",
    r"\.textContent\s*=\s*",
    r"\.placeholder\s*=\s*",
    r"\.title\s*=\s*",
    r"this\.title\s*=\s*",
    r"\bl:\s*",
    r"mkBtn\([^,]+,\s*",
]

def wrap_file(text):
    n = 0
    for zh in keys:
        if "animaTxt(\"" + zh + "\")" in text and text.count('"' + zh + '"') <= text.count('animaTxt("' + zh + '")'):
            # still wrap remaining unwrapped
            pass
        lit_dq = '"' + zh.replace('\\', '\\\\').replace('"', '\\"') + '"'
        lit_sq = "'" + zh.replace("\\", "\\\\").replace("'", "\\'") + "'"
        wrapped = 'animaTxt("' + zh.replace('\\', '\\\\').replace('"', '\\"') + '")'
        for pref in PREFIXES:
            pat = re.compile("(" + pref + ")" + re.escape(lit_dq))
            text, c = pat.subn(r"\1" + wrapped, text)
            n += c
            pat = re.compile("(" + pref + ")" + re.escape(lit_sq))
            text, c = pat.subn(r"\1" + wrapped, text)
            n += c
    return text, n

def ensure_import(text):
    needle = 'import "./00_anima_i18n.js";'
    if needle in text or "import './00_anima_i18n.js'" in text:
        return text, False
    m = re.search(r'^import .+$', text, re.M)
    if m:
        insert_at = m.end()
        return text[:insert_at] + "\n" + needle + text[insert_at:], True
    if "app.registerExtension" in text or "from \"/scripts/app.js\"" in text:
        return needle + "\n" + text, True
    return text, False

changed = []
for fn in os.listdir(JS):
    if not fn.endswith(".js") or fn in SKIP:
        continue
    path = os.path.join(JS, fn)
    text = open(path, encoding="utf-8").read()
    orig = text
    nl = "\r\n" if "\r\n" in text[:4000] else "\n"
    text = text.replace("\r\n", "\n")
    text, n = wrap_file(text)
    added = False
    if n or "animaTxt(" in text:
        text, added = ensure_import(text)
    if text.replace("\r\n", "\n") != orig.replace("\r\n", "\n") or n:
        if nl == "\r\n":
            text = text.replace("\n", "\r\n")
        open(path, "w", encoding="utf-8", newline="").write(text)
        changed.append((fn, n, added))

print("en keys", len(keys))
for row in changed:
    print("%s wraps=%s import=%s" % row)
print("files", len(changed))
