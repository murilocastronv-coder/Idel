"""Importa os monstros desenhados à mão (pastas exportadas com rotations/ e animations/)
para o formato de folha do jogo (quadros 96x96, desenhados de lado).

Uso:
    python3 tools/sprites/import_monsters.py <pasta> [<outra_pasta> ...]

Linhas geradas: 0 parado, 1 andando, 2 ataque, 3 dano, 4 morte.
Quem não tem ataque/dano/morte desenhados ganha versões feitas a partir do andar/parado.
Os nomes antigos (slime, spider, ...) viram apelidos que apontam para os desenhos novos.
"""
import glob
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from import_heroes import FW, FH, PIVOT, cell, fall  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
SIDE = 'east'

# chave no jogo -> nome da pasta exportada (sem o sufixo -Idle), escala do desenho
SOURCES = {
    'goblin': ('Goblin_Saqueador', 1.0),
    'bull_fighter': ('Bull_Fighter', 1.0),
    'demon': ('Demonio_das_Brasas', 1.0),
    'hound': ('Hound', 1.0),
    'lich': ('Lich', 1.0),
    'giant': ('Giant', 1.1),
    'hunter': ('Hunter', 1.0),
    'forest_monster': ('Forest_Monster', 1.0),
    'agon': ('Agon', 1.0),
    'ice_monster': ('Ice_Monster', 1.0),
    'yeti': ('Yeti', 1.0),
    'elite_yeti': ('Elite_Yeti', 1.15),
    'skeleton': ('Guerreiro_Esqueleto', 1.0),
    'skeleton_king': ('Rei_Esqueleto', 1.3),
    'archlich': ('Arquilich', 1.15),
    'minotaur_lord': ('Senhor_Minotauro', 1.2),
    'ice_titan': ('Tita_de_Gelo', 1.2),
    'assassin': ('Assassin', 1.0),
}
# nomes antigos que ainda aparecem no jogo (tela inicial, eventos) -> desenho novo
ALIASES = {
    'slime': ('forest_monster', 1.0),
    'spider': ('hunter', 1.0),
    'goblin_elite': ('giant', 1.25),
    'ice_golem': ('ice_monster', 1.25),
    'lava_hound': ('hound', 1.0),
}
ANIM = {
    'idle': ['idle'], 'walk': ['walk'], 'attack': ['attack'], 'hurt': ['hurt'], 'death': ['death'],
}


def find_root(srcs, name):
    for src in srcs:
        for d in sorted(glob.glob(os.path.join(src, '*'))):
            base = os.path.basename(d)
            # "<id>-<Nome>-Idle" (o id evita confundir Yeti com Elite_Yeti)
            if base.split('-', 1)[-1].startswith(name + '-Idle'):
                for r in [d] + glob.glob(os.path.join(d, '*')):
                    if os.path.isdir(os.path.join(r, 'rotations')):
                        return r
    raise SystemExit('monstro não encontrado: ' + name)


def frames(root, kind):
    anims = {os.path.basename(p).lower(): p for p in glob.glob(os.path.join(root, 'animations', '*'))}
    for name in ANIM[kind]:
        d = anims.get(name)
        if d and os.path.isdir(os.path.join(d, SIDE)):
            return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(d, SIDE, '*.png')))]
    return []


def lunge(walk):
    """Ataque para quem não tem: avança e volta usando os quadros de andar."""
    push = [0, 2, 5, 8, 8, 5, 2, 0]
    return [cell(walk[i % len(walk)], dx) for i, dx in enumerate(push)]


def build(srcs):
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    out = {}
    for key, (name, scale) in SOURCES.items():
        root = find_root(srcs, name)
        idle, walk, atk, hurt, death = (frames(root, k) for k in ('idle', 'walk', 'attack', 'hurt', 'death'))
        rows = [
            [cell(f) for f in idle],
            [cell(f) for f in walk],
            [cell(f) for f in atk] if atk else lunge(walk),
            [cell(hurt[i]) for i in (0, 2, 4)] if len(hurt) >= 5 else [cell(idle[0], dx) for dx in (-2, -3, -1)],
            [cell(f) for f in death] if death else fall(idle[0]),
        ]
        cols = max(len(r) for r in rows)
        sheet = Image.new('RGBA', (FW * cols, FH * len(rows)))
        for ri, row in enumerate(rows):
            for fi, f in enumerate(row):
                sheet.alpha_composite(f, (fi * FW, ri * FH))
        sheet.save(os.path.join(ROOT, 'monsters', key + '.png'), optimize=True)
        n = [len(r) for r in rows]
        bb = rows[0][0].getbbox()
        out[key] = {
            'sheet': 'monsters/' + key + '.png', 'fw': FW, 'fh': FH, 'pivot': PIVOT, 'top': PIVOT[1] - bb[1],
            'actions': {
                'idle': {'row': 0, 'frames': n[0], 'fps': 6},
                'walk': {'row': 1, 'frames': n[1], 'fps': 10},
                'attack': {'row': 2, 'frames': n[2], 'fps': 16, 'impactFrame': n[2] // 2},
                'hit': {'row': 3, 'frames': n[3], 'fps': 12},
                'death': {'row': 4, 'frames': n[4], 'fps': 10},
                'run': {'row': 1, 'frames': n[1], 'fps': 16},
            },
            'scale': scale,
        }
        print(key, '<-', name, n)
    for old, (new, scale) in ALIASES.items():
        out[old] = dict(out[new], scale=scale)
        path = os.path.join(ROOT, 'monsters', old + '.png')
        if os.path.exists(path):
            os.remove(path)
    man['monsters'] = out
    man['version'] = int(man.get('version') or 0) + 1
    with open(man_path, 'w') as f:
        json.dump(man, f, indent=1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    build(sys.argv[1:])
