"""Calcula quanto o corpo de cada herói sobe/desce em cada quadro (wbob no manifest),
para a arma desenhada por cima (armas da loja) acompanhar o passo.
Uso: python3 tools/sprites/weapon_bob.py"""
import json
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
SIDE_ROWS, FRONT_ROWS = (0, 1), (5, 6, 7, 8)


def top(sheet, row, f, fw, fh):
    bb = sheet.crop((f * fw, row * fh, f * fw + fw, row * fh + fh)).getbbox()
    return bb[1] if bb else None


def main():
    path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(path))
    for cls, meta in man['heroes'].items():
        if not meta.get('full'):
            continue
        sh = Image.open(os.path.join(ROOT, 'heroes', cls + '.png')).convert('RGBA')
        fw, fh = meta['fw'], meta['fh']
        cols = sh.width // fw
        out = {}
        for rows, ref in ((SIDE_ROWS, 0), (FRONT_ROWS, 5)):
            t0 = top(sh, ref, 0, fw, fh)
            for r in rows:
                ts = [top(sh, r, f, fw, fh) for f in range(cols)]
                out[str(r)] = [(t - t0) if t is not None else 0 for t in ts]
        meta['wbob'] = out
    with open(path, 'w') as f:
        json.dump(man, f, indent=1)


if __name__ == '__main__':
    main()
