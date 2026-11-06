"""Troca os ícones das peças dos conjuntos da loja de cash (festive_XX) pelos conjuntos desenhados à mão.

Uso:
    python3 tools/sprites/import_sets.py <pasta_objects_exportada>

Cada pacote da loja tem uma cor (tom); cada cor usa um conjunto novo:
vermelho -> Soberano Solar em tom carmesim, azul -> Guardião de Aço, verde -> Sentinela Esmeralda,
dourado -> Soberano Solar, roxo -> Arauto Astral.
"""
import colorsys
import glob
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'icons')
SETS = {'steel': 'Steel_Guardian', 'emerald': 'Emerald_Sentinel', 'solar': 'Solar_Sovereign', 'astral': 'Astral_Herald'}
PIECES = {'helm': ('helmet',), 'armor': ('chest',), 'pants': ('leg',), 'gloves': ('glove', 'gauntle'), 'boots': ('boots', 'armored')}
TONE_SET = ['crimson', 'steel', 'emerald', 'solar', 'astral']  # ordem dos tons em PREMIUM_SET_PACKS (índice % 5)


def load(src, prefix, piece):
    for d in sorted(glob.glob(os.path.join(src, prefix + '_*'))):
        name = os.path.basename(d)[len(prefix) + 1:].lower()
        if piece == 'boots' and 'boots' not in name and not name.startswith('golden_armored'):
            continue
        if any(name.startswith(k) or ('_' + k) in name or name.startswith('golden_' + k) for k in PIECES[piece]):
            return Image.open(glob.glob(os.path.join(d, 'rotations', '*.png'))[0]).convert('RGBA')
    raise SystemExit(f'peça não encontrada: {prefix} {piece}')


def crimson(im):
    """Soberano Solar puxado para o vermelho (o pacote vermelho da loja)."""
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.05 < h < 0.2 and s > 0.25:  # dourado -> carmesim
                h = (h - 0.12) % 1
                r, g, b = (round(c * 255) for c in colorsys.hsv_to_rgb(h, min(1, s * 1.05), v * 0.92))
            px[x, y] = (r, g, b, a)
    return im


def fit(im, size):
    im = im.crop(im.getbbox())
    k = min((size - 2) / im.size[0], (size - 2) / im.size[1], 1)
    if k < 1:
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.NEAREST)
    c = Image.new('RGBA', (size, size))
    c.alpha_composite(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2))
    return c


def build(src):
    meta = json.load(open(os.path.join(ROOT, 'items.json')))
    atlas = Image.open(os.path.join(ROOT, 'items.png')).convert('RGBA')
    size, cols, index = meta['size'], meta['cols'], meta['index']
    icons = {}
    for key, prefix in SETS.items():
        for piece in PIECES:
            icons[(key, piece)] = fit(load(src, prefix, piece), size)
    for piece in PIECES:
        icons[('crimson', piece)] = crimson(icons[('solar', piece)].copy())
    done = 0
    for base, i in index.items():
        parts = base.split('_')
        if len(parts) != 3 or parts[0] != 'festive' or parts[2] not in PIECES:
            continue
        n = int(parts[1])
        x, y = (i % cols) * size, (i // cols) * size
        atlas.paste(Image.new('RGBA', (size, size)), (x, y))
        atlas.alpha_composite(icons[(TONE_SET[(n - 1) % 5], parts[2])], (x, y))
        done += 1
    atlas.save(os.path.join(ROOT, 'items.png'), optimize=True)
    print('ícones trocados:', done)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    build(sys.argv[1])
