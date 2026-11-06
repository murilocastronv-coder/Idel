"""Importa os heróis desenhados à mão (pastas exportadas com rotations/ e animations/)
para o formato de folha que o jogo usa (quadros 96x96, 9 linhas por herói).

Uso:
    python3 tools/sprites/import_heroes.py <pasta_com_os_herois_exportados>

A pasta deve ter uma subpasta por herói (o nome tem que conter a chave de SOURCES).
Linhas geradas (iguais às do manifest): 0 parado (lado), 1 andando (lado), 2 ataque (lado),
3 dano, 4 morte, 5 parado (frente), 6 andando (frente), 7 andando (costas), 8 parado (costas).
"""
import glob
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
FW = FH = 96
PIVOT = [48, 90]

# classe do jogo -> pasta do herói novo
SOURCES = {
    'dark_knight': 'Cavaleiro_Carmesim',
    'dark_wizard': 'Mago_Arcano',
    'fairy_elf': 'Elfa_Esmeralda',
    'dark_lord': 'Lorde_Sombrio',
    'magic_gladiator': 'Assassin',
    'summoner': 'Mago_Arcano',
}
ANIM = {
    'idle': ['idle', 'parado'],
    'walk': ['walk', 'walking', 'andar'],
    'attack': ['attack', 'ataque_de_espada', 'ataque_de_arco', 'ataque_de_cajado'],
    'hurt': ['hurt'],
    'death': ['death'],
}
SIDE, FRONT, BACK = 'east', 'south', 'north'


def find_root(src, key):
    for d in glob.glob(os.path.join(src, '*' + key + '*')) + glob.glob(os.path.join(src, '*' + key + '*', '*')):
        if os.path.isdir(os.path.join(d, 'rotations')):
            return d
    raise SystemExit('herói não encontrado: ' + key)


def frames(root, kind, direction):
    anims = {os.path.basename(p).lower(): p for p in glob.glob(os.path.join(root, 'animations', '*'))}
    for name in ANIM[kind]:
        d = anims.get(name)
        if d and os.path.isdir(os.path.join(d, direction)):
            return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(d, direction, '*.png')))]
    return []


def cell(im, dx=0, dy=0):
    """Coloca o quadro original (80x80) numa célula 96x96 com os pés no pivô."""
    c = Image.new('RGBA', (FW, FH))
    w, h = im.size
    bottom = im.getbbox()[3] if im.getbbox() else h
    c.alpha_composite(im, (PIVOT[0] - w // 2 + dx, PIVOT[1] - bottom + 1 + dy))
    return c


def fall(im, n=6):
    """Morte para quem não tem animação própria: cai de costas girando sobre os pés."""
    out = []
    base = cell(im)
    for i in range(n):
        p = i / (n - 1)
        r = base.rotate(90 * p, resample=Image.NEAREST, center=tuple(PIVOT))
        moved = Image.new('RGBA', (FW, FH))
        moved.paste(r, (round(36 * p), -round(10 * p)), r)
        out.append(moved)
    return out


def avoid_skin_keys(im, keys):
    """O jogo troca as cores exatas de skinKeys (tom de pele). A arte nova não usa esse sistema,
    então mexe 1 ponto nessas cores para nada ser recolorido sem querer."""
    px = im.load()
    keys = {tuple(k) for k in keys}
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in keys:
                px[x, y] = (r, g, b - 1 if b else 1, a)
    return im


def build(src):
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    skin = man.get('skinKeys') or []
    for cls, key in SOURCES.items():
        root = find_root(src, key)
        idle_s, walk_s, atk_s = frames(root, 'idle', SIDE), frames(root, 'walk', SIDE), frames(root, 'attack', SIDE)
        idle_f, walk_f = frames(root, 'idle', FRONT), frames(root, 'walk', FRONT)
        idle_b, walk_b = frames(root, 'idle', BACK), frames(root, 'walk', BACK)
        hurt = frames(root, 'hurt', SIDE)
        death = frames(root, 'death', SIDE)
        hit = [cell(hurt[i]) for i in (0, 2, 4)] if len(hurt) >= 5 else [cell(idle_s[0], dx) for dx in (-2, -3, -1)]
        die = [cell(f) for f in death] if death else fall(idle_s[0])
        rows = [
            [cell(f) for f in idle_s], [cell(f) for f in walk_s], [cell(f) for f in atk_s], hit, die,
            [cell(f) for f in idle_f], [cell(f) for f in walk_f], [cell(f) for f in walk_b], [cell(f) for f in idle_b],
        ]
        cols = max(len(r) for r in rows)
        sheet = Image.new('RGBA', (FW * cols, FH * len(rows)))
        for ri, row in enumerate(rows):
            for fi, f in enumerate(row):
                sheet.alpha_composite(f, (fi * FW, ri * FH))
        avoid_skin_keys(sheet, skin)
        sheet.save(os.path.join(ROOT, 'heroes', cls + '.png'), optimize=True)
        n = [len(r) for r in rows]
        meta = man['heroes'][cls]
        meta.update({
            'fw': FW, 'fh': FH, 'pivot': PIVOT, 'full': True, 'hairKeys': None, 'defaultHair': None,
            'actions': {
                'idle': {'row': 0, 'frames': n[0], 'fps': 6},
                'walk': {'row': 1, 'frames': n[1], 'fps': 10},
                'attack': {'row': 2, 'frames': n[2], 'fps': 24, 'impactFrame': n[2] // 2},
                'hit': {'row': 3, 'frames': n[3], 'fps': 12},
                'death': {'row': 4, 'frames': n[4], 'fps': 10},
                'idle_front': {'row': 5, 'frames': n[5], 'fps': 6},
                'walk_front': {'row': 6, 'frames': n[6], 'fps': 10},
                'walk_back': {'row': 7, 'frames': n[7], 'fps': 10},
                'idle_back': {'row': 8, 'frames': n[8], 'fps': 6},
                'run': {'row': 1, 'frames': n[1], 'fps': 16},
                'run_front': {'row': 6, 'frames': n[6], 'fps': 16},
                'run_back': {'row': 7, 'frames': n[7], 'fps': 16},
            },
        })
        meta.pop('layers', None)
        print(cls, '<-', os.path.basename(root.rstrip('/')), n)
    man['version'] = int(man.get('version') or 0) + 1
    with open(man_path, 'w') as f:
        json.dump(man, f, indent=1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    build(sys.argv[1])
