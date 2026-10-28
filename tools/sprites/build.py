"""Gera todas as folhas de sprites + manifest.json em public/assets/sprites.

Uso: python3 tools/sprites/build.py
"""
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import heroes  # noqa: E402
import monsters  # noqa: E402
import effects  # noqa: E402
import equipment  # noqa: E402
from pixelkit import hexc  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')
PREVIEW = os.path.join(HERE, 'preview')
ACTIONS = [('idle', 4, 4), ('walk', 4, 8), ('attack', 4, 12), ('hit', 1, 1), ('death', 4, 6)]
CLASSES = ['dark_knight', 'dark_wizard', 'fairy_elf', 'magic_gladiator', 'dark_lord', 'summoner']


def death_frames(draw, pivot):
    """Quadros de morte: ajoelha, cai de costas, deitado."""
    f0 = draw('death', 0).image()
    f1 = draw('death', 1).image()
    f2 = f1.rotate(40, resample=Image.NEAREST, center=pivot, translate=(10, 0))
    f3 = f1.rotate(88, resample=Image.NEAREST, center=pivot, translate=(30, -2))
    return [f0, f1, f2, f3]


def sheet(draw, fw, fh, pivot, rotate_death=True):
    img = Image.new('RGBA', (fw * 4, fh * len(ACTIONS)), (0, 0, 0, 0))
    meta = {}
    for row, (act, n, fps) in enumerate(ACTIONS):
        if act == 'death' and rotate_death:
            frames = death_frames(draw, pivot)
        else:
            frames = [draw(act, i).image() for i in range(n)]
        for i, f in enumerate(frames):
            img.alpha_composite(f, (i * fw, row * fh))
        meta[act] = {'row': row, 'frames': len(frames), 'fps': fps}
    return img, meta


def rgb(c):
    return list(c[:3])


def main():
    os.makedirs(os.path.join(OUT, 'heroes'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'monsters'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'effects'), exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    manifest = {'version': 3, 'heroes': {}, 'monsters': {}, 'effects': {},
                'skinKeys': [rgb(c) for c in heroes.SKIN]}
    pivot = (heroes.BUILD['cx'], heroes.FOOT_Y)

    for cls in CLASSES:
        img, meta = sheet(lambda a, i, cls=cls: heroes.draw_hero(cls, a, i), heroes.FW, heroes.FH, pivot)
        path = f'heroes/{cls}.png'
        img.save(os.path.join(OUT, path))
        hk = None
        if cls in heroes.HAIR_DEFAULT:
            hk = [rgb(c) for c in heroes.hair_ramp(heroes.HAIR_DEFAULT[cls])]
        manifest['heroes'][cls] = {'sheet': path, 'fw': heroes.FW, 'fh': heroes.FH, 'pivot': list(pivot), 'actions': meta,
                                   'hairKeys': hk, 'defaultHair': heroes.HAIR_DEFAULT.get(cls)}

    # camadas do herói (corpo / braço da frente), peças de armadura e armas — equipamento visível
    os.makedirs(os.path.join(OUT, 'equip'), exist_ok=True)
    manifest['equip'] = {'sets': list(equipment.SETS), 'pieces': equipment.PIECES, 'rowsPerPiece': len(ACTIONS), 'classes': {}}
    manifest['weapons'] = {'defaults': equipment.DEFAULT_WEAPON, 'classes': {}}
    for cls in CLASSES:
        layers = {}
        for L in ('back', 'front'):
            img, _ = sheet(lambda a, i, cls=cls, L=L: heroes.draw_hero(cls, a, i, layer=L), heroes.FW, heroes.FH, pivot)
            path = f'equip/{cls}_{L}.png'
            img.save(os.path.join(OUT, path))
            layers[L] = path
        manifest['heroes'][cls]['layers'] = layers
        sets = {}
        for set_name in equipment.SETS:
            blocks = []
            for piece in equipment.PIECES:
                img, _ = sheet(lambda a, i, cls=cls, piece=piece, set_name=set_name: equipment.draw_equip(cls, piece, set_name, a, i), heroes.FW, heroes.FH, pivot)
                blocks.append(img)
            big = Image.new('RGBA', (blocks[0].width, sum(b.height for b in blocks)), (0, 0, 0, 0))
            y = 0
            for b in blocks:
                big.alpha_composite(b, (0, y)); y += b.height
            path = f'equip/{cls}_{set_name}.png'
            big.save(os.path.join(OUT, path), optimize=True)
            sets[set_name] = path
        manifest['equip']['classes'][cls] = sets
        wl = equipment.CLASS_WEAPONS[cls]
        blocks = []
        for base in wl:
            img, _ = sheet(lambda a, i, cls=cls, base=base: equipment.draw_weapon(cls, base, a, i), heroes.FW, heroes.FH, pivot)
            blocks.append(img)
        big = Image.new('RGBA', (blocks[0].width, sum(b.height for b in blocks)), (0, 0, 0, 0))
        y = 0
        for b in blocks:
            big.alpha_composite(b, (0, y)); y += b.height
        path = f'equip/{cls}_weapons.png'
        big.save(os.path.join(OUT, path), optimize=True)
        manifest['weapons']['classes'][cls] = {'sheet': path, 'list': wl}
        print('  equipamento', cls)

    mons = {
        'slime': (monsters.slime, 48, 40, (22, 37), False, 1.0),
        'goblin': (lambda a, i: monsters.goblin(a, i), 96, 96, (40, 90), True, 1.0),
        'goblin_elite': (monsters.goblin_chief, 96, 96, (40, 90), True, 1.25),
        'ice_golem': (monsters.ice_golem, 96, 96, (42, 90), True, 1.25),
        'lava_hound': (monsters.lava_hound, 80, 56, (34, 52), False, 1.0),
        'spider': (monsters.spider, 64, 48, (30, 44), False, 1.0),
        'skeleton': (lambda a, i: monsters.skeleton(a, i), 96, 96, (40, 90), True, 1.0),
        'skeleton_king': (lambda a, i: monsters.skeleton(a, i, king=True), 96, 96, (42, 90), True, 1.5),
    }
    for name, (fn, fw, fh, pv, rot, scale) in mons.items():
        img, meta = sheet(fn, fw, fh, pv, rotate_death=rot)
        path = f'monsters/{name}.png'
        img.save(os.path.join(OUT, path))
        manifest['monsters'][name] = {'sheet': path, 'fw': fw, 'fh': fh, 'pivot': list(pv), 'actions': meta, 'scale': scale}

    fx_list = []
    for k in ['fire', 'ice', 'energy', 'arrow', 'dark', 'spirit']:
        fx_list.append((f'proj_{k}', lambda i, k=k: effects.projectile(k, i), 24, 24, 4, (12, 12)))
    for k in ['fire', 'ice', 'energy', 'arrow', 'dark', 'spirit', 'lightning', 'blood']:
        fx_list.append((f'impact_{k}', lambda i, k=k: effects.impact(k, i), 32, 32, 4, (16, 16)))
    for k in ['fire', 'energy', 'dark', 'spirit', 'lightning', 'arrow']:
        fx_list.append((f'burst_{k}', lambda i, k=k: effects.burst(k, i), 64, 64, 6, (32, 48)))
    for k in ['energy', 'fire', 'dark']:
        fx_list.append((f'crescent_{k}', lambda i, k=k: effects.crescent(k, i), 48, 48, 4, (20, 24)))
    fx_list.append(('heal', lambda i: effects.heal('holy', i), 32, 32, 4, (16, 28)))
    for name, fn, fw, fh, n, pv in fx_list:
        img = Image.new('RGBA', (fw * n, fh), (0, 0, 0, 0))
        for i in range(n):
            img.alpha_composite(fn(i).image(), (i * fw, 0))
        path = f'effects/{name}.png'
        img.save(os.path.join(OUT, path))
        manifest['effects'][name] = {'sheet': path, 'fw': fw, 'fh': fh, 'frames': n, 'pivot': list(pv)}

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)

    # vitrine ampliada 3x (nearest-neighbor) para conferir
    S = 3
    rows = []
    for cls in CLASSES:
        im = Image.open(os.path.join(OUT, f'heroes/{cls}.png'))
        rows.append(im)
    w = max(r.width for r in rows) * S
    showcase = Image.new('RGBA', (heroes.FW * 4 * S * 3, heroes.FH * S * 2 * 5 // 2), (30, 36, 60, 255))
    showcase = Image.new('RGBA', (w * 3, rows[0].height * S * 2), (30, 36, 60, 255))
    for k, im in enumerate(rows):
        big = im.resize((im.width * S, im.height * S), Image.NEAREST)
        showcase.alpha_composite(big, ((k % 3) * w, (k // 3) * im.height * S))
    showcase.save(os.path.join(PREVIEW, 'herois_3x.png'))
    print('ok:', len(manifest['heroes']), 'heróis,', len(manifest['monsters']), 'monstros,', len(manifest['effects']), 'efeitos')


if __name__ == '__main__':
    main()
