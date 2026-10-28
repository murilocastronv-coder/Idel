"""Valida o dicionário e gera public/js/i18n-en.js."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from en import EN

def renum(s):
    it = iter(range(100))
    return re.sub(r'\{\d+\}', lambda m: '{%d}' % next(it), s)

pats = []
for k in EN:
    if re.search(r'\{(\d+|n)\}', k):
        rx = ''.join('(.*?)' if re.fullmatch(r'\{(\d+|n)\}', p) else re.escape(p) for p in re.split(r'(\{(?:\d+|n)\})', k))
        pats.append(re.compile('^' + rx + '$'))
keys = json.load(open(os.path.join(HERE, 'strings.json'), encoding='utf8'))
CODE = re.compile(r"^(\[|\.|#|\{\"|[A-Z][a-z]+(-[A-Z][a-z]+)+$|[A-Z_]+$|Arrow|Escape|HttpOnly|Path=|Max-Age|SameSite|Secure|; Secure|en-|pt-|width=|text/|image/|application/|\?v=|manifest|\./|\{0\}://|\{0\}/#|\{0\}=;|style=|act |btn |islot|item \{0\}|a,button|button\[|600 |\(prefers|default-src|script-src|style-src|img-src|font-src|connect-src|frame-|form-action|base-uri|camera=|max-age|http|https:|SIGINT|SIGTERM|GET|POST|HEAD|DENY|XXXX|\[server\]|\[world\]|\[api\]|effects:|Legends$|MU Idle$|.*DESC|&|×$|\{n\}$|\{0\}s$|\{0\} MP|\{0\} Zen$|\{0\}× · \{1\}|\{\d\} MP · |\{\d\}× · |\{0\}× · |\{1\} · \{2\} MP)")
missing = []
for k in keys:
    if CODE.search(k): continue
    if k in EN or renum(k) in EN: continue
    sample = re.sub(r'\{(\d+|n)\}', 'Zz9', k)
    if any(p.match(sample) for p in pats): continue
    missing.append(k)
print('faltando:', len(missing))
for m in missing: print('  ', m)
unused = [k for k in EN if not re.search(r'\{', k) and k not in keys and renum(k) not in keys]
out = 'window.I18N_EN = ' + json.dumps(EN, ensure_ascii=False, indent=0) + ';\n'
open(os.path.join(ROOT, 'public/js/i18n-en.js'), 'w', encoding='utf8').write('// gerado por tools/i18n/build.py — não edite aqui\n' + out)
print('ok:', len(EN), 'entradas; sem uso (só informativo):', len(unused))
