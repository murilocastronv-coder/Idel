"""Versões dos heróis com as cores de cada conjunto de armadura (o herói é um desenho completo,
então o conjunto equipado aparece tingindo a armadura, mantendo luz, sombra, pele e brilhos).

Uso:
    python3 tools/sprites/hero_looks.py [pasta_de_saida_para_previa]
Gera public/assets/sprites/heroes/<classe>_<visual>.png e registra em manifest.json (heroes[cls].looks).
"""
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
# visual: (matiz alvo 0-1, saturação alvo, ajuste de brilho)
LOOKS = {
    'steel': (0.58, 0.42, 1.05),     # Guardião de Aço (azul aço)
    'emerald': (0.38, 0.62, 1.0),    # Sentinela Esmeralda
    'solar': (0.12, 0.80, 1.12),     # Soberano Solar (dourado)
    'astral': (0.76, 0.55, 1.05),    # Arauto Astral (violeta)
    'crimson': (0.99, 0.75, 1.0),    # Soberano Carmesim
}


def tint(arr, hue, sat, bright):
    rgb = arr[..., :3].astype(np.float32) / 255
    a = arr[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # matiz
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    skin = (h > 0.03) & (h < 0.11) & (s > 0.18) & (s < 0.62) & (v > 0.5)
    shine = (v > 0.88) & (s < 0.25)
    dark = v < 0.1
    m = (a > 0) & ~skin & ~shine & ~dark
    ns = np.clip(np.maximum(s, 0.25) * 0.4 + sat * 0.6, 0, 1)
    nv = np.clip(v * bright, 0, 1)
    out = arr.copy()
    hh = np.full(h.shape, hue)
    i = np.floor(hh * 6).astype(int) % 6
    f = hh * 6 - np.floor(hh * 6)
    p, q, t = nv * (1 - ns), nv * (1 - f * ns), nv * (1 - (1 - f) * ns)
    rr = np.choose(i, [nv, q, p, p, t, nv]); gg = np.choose(i, [t, nv, nv, q, p, p]); bb = np.choose(i, [p, p, t, nv, nv, q])
    new = np.stack([rr, gg, bb], -1)
    k = 0.85
    mixed = rgb * (1 - k) + new * k
    out[..., :3] = np.where(m[..., None], np.round(mixed * 255), arr[..., :3]).astype(np.uint8)
    return out


def main(prev=None):
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    for cls, meta in man['heroes'].items():
        base = np.array(Image.open(os.path.join(ROOT, meta['sheet'])).convert('RGBA'))
        looks = {}
        for name, (hue, sat, br) in LOOKS.items():
            path = f'heroes/{cls}_{name}.png'
            Image.fromarray(tint(base, hue, sat, br), 'RGBA').save(os.path.join(ROOT, path), optimize=True)
            looks[name] = path
        meta['looks'] = looks
        print(cls, 'ok')
    man['version'] = int(man.get('version') or 0) + 1
    with open(man_path, 'w') as f:
        json.dump(man, f, indent=1)
    if prev:
        W = Image.new('RGBA', (6 * 96, 5 * 96), (60, 70, 55, 255))
        for r, cls in enumerate(['dark_knight', 'dark_wizard', 'fairy_elf', 'dark_lord', 'magic_gladiator']):
            W.alpha_composite(Image.open(os.path.join(ROOT, man['heroes'][cls]['sheet'])).crop((0, 5 * 96, 96, 6 * 96)), (0, r * 96))
            for c, name in enumerate(LOOKS):
                W.alpha_composite(Image.open(os.path.join(ROOT, f'heroes/{cls}_{name}.png')).crop((0, 5 * 96, 96, 6 * 96)), ((c + 1) * 96, r * 96))
        W.resize((W.width * 2, W.height * 2), Image.NEAREST).save(os.path.join(prev, 'looks.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
