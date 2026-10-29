"""Extrai textos em português do projeto para o dicionário de tradução.
Gera tools/i18n/strings.json: lista de chaves (frases com {0},{1}... no lugar das variáveis)."""
import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JS = ['public/js/app.js', 'public/js/game.js', 'public/js/sprites.js', 'public/js/mobile.js', 'public/js/status.js', 'server/index.js', 'server/world.js', 'server/vip.js',
      'server/quests.js', 'server/gamedata.js', 'server/mailer.js', 'server/chaos.js', 'server/drops.js', 'server/invasion.js', 'server/kundun.js', 'server/equip.js', 'server/classes.js']
HTML = ['public/index.html', 'public/game.html', 'public/app.html', 'public/status.html']

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

out = {}
def add(s, src):
    s = norm(s)
    if not s or not re.search(r'[A-Za-zÀ-ÿ]', re.sub(r'\{\d+\}', '', s)):
        return
    out.setdefault(s, src)

def split_html(text):
    # separa por tags HTML; entidades simples
    parts = re.split(r'<[^<>]*>', text)
    return [p.replace('&nbsp;', ' ').replace('&amp;', '&') for p in parts]

def scan_js(code, src):
    i, n = 0, len(code)
    def read_template(i):
        # i aponta para depois do `; devolve (texto com {k}, novo i)
        buf, k = [], 0
        while i < n:
            c = code[i]
            if c == '\\': buf.append(code[i:i+2]); i += 2; continue
            if c == '`': return ''.join(buf), i + 1
            if c == '$' and i + 1 < n and code[i+1] == '{':
                depth, j = 1, i + 2
                start = j
                while j < n and depth:
                    cj = code[j]
                    if cj in '\'"':
                        j = skip_str(j)
                        continue
                    if cj == '`':
                        inner, j = read_template(j + 1)
                        for part in split_html(inner): add(part, src)
                        continue
                    if cj == '{': depth += 1
                    elif cj == '}': depth -= 1
                    j += 1
                scan_js(code[start:j-1], src)
                buf.append('{%d}' % k); k += 1
                i = j; continue
            buf.append(c); i += 1
        return ''.join(buf), i
    def skip_str(j):
        q = code[j]; j += 1
        while j < n and code[j] != q:
            if code[j] == '\\': j += 1
            if code[j] == '\n': break
            j += 1
        return j + 1
    while i < n:
        c = code[i]
        if code.startswith('//', i):
            e = code.find('\n', i); i = n if e < 0 else e; continue
        if code.startswith('/*', i):
            e = code.find('*/', i); i = n if e < 0 else e + 2; continue
        if c in '\'"':
            j = skip_str(i)
            lit = code[i+1:j-1]
            try: lit = json.loads('"' + lit.replace('"', '\\"').replace("\\'", "'") + '"')
            except Exception: pass
            for part in split_html(lit): add(part, src)
            i = j; continue
        if c == '`':
            t, i = read_template(i + 1)
            for part in split_html(t):
                # renumera placeholders da parte
                idx = iter(range(100))
                part = re.sub(r'\{\d+\}', lambda m: '{%d}' % next(idx), part)
                add(part, src)
            continue
        if c == '/' and re.match(r'[=(,:;!&|?{}\[\s]', code[max(0, i-1)] if i else ' ') and not code.startswith('//', i):
            # regex literal: pula
            j = i + 1
            while j < n and code[j] not in '/\n':
                if code[j] == '\\': j += 1
                if code[j] == '[':
                    while j < n and code[j] != ']': j += 1
                j += 1
            i = j + 1; continue
        i += 1

class H(HTMLParser):
    def __init__(self, src): super().__init__(); self.src = src; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        for k, v in attrs:
            if k in ('placeholder', 'title', 'aria-label', 'alt', 'content') and v: add(v, self.src)
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip -= 1
    def handle_data(self, d):
        if not self.skip: add(d, self.src)

for f in JS:
    p = os.path.join(ROOT, f)
    if os.path.exists(p): scan_js(open(p, encoding='utf8').read(), f)
for f in HTML:
    p = os.path.join(ROOT, f)
    if os.path.exists(p): H(f).feed(open(p, encoding='utf8').read())

import glob
for f in sorted(glob.glob(os.path.join(ROOT, 'server/migrations/*.sql'))):
    for m in re.finditer(r"'((?:[^']|'')*)'", open(f, encoding='utf8').read()):
        t = m.group(1).replace("''", "'")
        if ' ' in t and re.search(r'[a-zà-ÿ]{3}', t) and not re.match(r'\d+ (days?|day|hours?)$', t): add(t, os.path.basename(f))

# filtra código: seletores, chaves, caminhos, CSS, identificadores
def is_code(s):
    if re.fullmatch(r'[#.\[][\w\-#.\[\]="\' :>()*,]+', s): return True
    if re.fullmatch(r'[a-z0-9_]+', s) and not re.search(r'[à-ÿ]', s): return True   # chaves snake_case
    if re.fullmatch(r'[a-z]+[A-Z]\w*', s): return True                                # camelCase
    if re.fullmatch(r'[\w\-]+(/[\w\-.{}?=&]*)+', s) or s.startswith('/'): return True  # caminhos
    if re.search(r'^(rgba?|#[0-9a-f]{3,8}$|\d+px|bold |\d+(\.\d+)?(px|em|%))', s): return True
    if re.fullmatch(r'(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b.*', s, re.S): return True
    if re.fullmatch(r'[\w\-]+(\s+[\w\-]+)*', s) and re.fullmatch(r'[a-z0-9\-\s]+', s) and '-' in s: return True  # classes css
    if s in ('use strict',): return True
    return False

keys = sorted(k for k in out if not is_code(k))
json.dump(keys, open(os.path.join(os.path.dirname(__file__), 'strings.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(keys), 'textos')
