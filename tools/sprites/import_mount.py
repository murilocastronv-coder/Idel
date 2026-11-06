"""Montaria desenhada à mão (pasta exportada com rotations/ e animations/ em 8 direções).

Uso:
    python3 tools/sprites/import_mount.py <pasta_da_montaria> [nome]

Gera public/assets/sprites/mounts/<nome>.png (quadros 96x96) e registra em manifest.json (mounts).
Linhas: parado/andando/correndo/pulando de lado, de frente e de costas. Para cada linha guarda o
quanto a sela sobe/desce em cada quadro (seatBob), para o herói sentado acompanhar o balanço.
"""
import colorsys
import glob
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
FW = FH = 128
PIVOT = [64, 120]
VIEWS = {'': 'east', '_front': 'south', '_back': 'north'}
ACTS = {'idle': 'idle', 'walk': 'walk', 'run': 'run', 'jump': 'jump'}


def saddle_y(im):
    px = im.load()
    ys = []
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.03 < h < 0.11 and 0.3 < s < 0.8 and 0.2 < v < 0.62:
                ys.append(y)
    ys.sort()
    return ys[len(ys) // 10] if ys else 0


def saddle_x(im):
    px = im.load()
    xs = sorted(x for y in range(im.size[1]) for x in range(im.size[0]) if px[x, y][3] > 200 and
                (lambda h, s, v: 0.03 < h < 0.11 and 0.3 < s < 0.8 and 0.2 < v < 0.62)(*colorsys.rgb_to_hsv(*[c / 255 for c in px[x, y][:3]])))
    return xs[len(xs) // 2] if xs else PIVOT[0]


def main(src, name='bull'):
    root = next(d for d in glob.glob(os.path.join(src, '**', 'rotations'), recursive=True))
    root = os.path.dirname(root)
    rows, actions, bob, seat = [], {}, {}, {}
    for suf, d in VIEWS.items():
        for act, folder in ACTS.items():
            fs = sorted(glob.glob(os.path.join(root, 'animations', folder, d, '*.png')))
            if not fs:
                continue
            raw = [Image.open(f).convert('RGBA') for f in fs]
            # os quadros animados têm tamanhos diferentes: centraliza e põe os pés da linha no pivô
            bottom = raw[0].getbbox()[3]
            frames = []
            for im in raw:
                c = Image.new('RGBA', (FW, FH))
                c.alpha_composite(im, (PIVOT[0] - im.size[0] // 2, PIVOT[1] - bottom))
                frames.append(c)
            base = saddle_y(frames[0])
            if act == 'idle':
                seat[{'': 'side', '_front': 'front', '_back': 'back'}[suf]] = [saddle_x(frames[0]) - PIVOT[0], PIVOT[1] - base - (0 if suf == '' else 6)]  # de frente/costas o topo medido é o encosto da sela
            key = act + suf
            actions[key] = {'row': len(rows), 'frames': len(frames), 'fps': {'idle': 7, 'walk': 11, 'run': 15, 'jump': 12}[act]}
            bob[key] = [saddle_y(f) - base for f in frames]
            rows.append(frames)
    sheet = Image.new('RGBA', (FW * max(len(r) for r in rows), FH * len(rows)))
    for ri, row in enumerate(rows):
        for fi, f in enumerate(row):
            sheet.alpha_composite(f, (fi * FW, ri * FH))
    os.makedirs(os.path.join(ROOT, 'mounts'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'mounts', name + '.png'), optimize=True)
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    man.setdefault('mounts', {})[name] = {
        'sheet': f'mounts/{name}.png', 'fw': FW, 'fh': FH, 'pivot': PIVOT, 'actions': actions, 'seatBob': bob,
        # assento (em pixels do desenho, a partir dos pés): x da sela e altura do topo da sela
        'seat': seat,
    }
    man['version'] = int(man.get('version') or 0) + 1
    with open(man_path, 'w') as f:
        json.dump(man, f, indent=1)
    print(name, {k: v['frames'] for k, v in actions.items()}, 'seat', seat)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
