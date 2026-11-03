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
import wings  # noqa: E402
from pixelkit import hexc, ramp5  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')
PREVIEW = os.path.join(HERE, 'preview')
# (animação, quadros, quadros por segundo): 8 quadros nas animações principais
FPS = {'idle': 8, 'walk': 16, 'attack': 24, 'hit': 12, 'death': 12}
MON_ACTIONS = [(a, heroes.FRAMES[a], FPS[a]) for a in ('idle', 'walk', 'attack', 'hit', 'death')]
# heróis: + parado de frente, andando de frente (para baixo) e de costas (para cima)
ACTIONS = MON_ACTIONS + [('idle_front', heroes.FRAMES['idle'], FPS['idle']), ('walk_front', heroes.FRAMES['walk'], FPS['walk']), ('walk_back', heroes.FRAMES['walk'], FPS['walk']), ('idle_back', heroes.FRAMES['idle'], FPS['idle'])]
MAXF = max(n for _, n, _ in ACTIONS)


def legacy(fn):
    """Monstros desenhados com listas de 4 quadros-chave: os 8 quadros passam a posição fracionária."""
    def wrap(a, i):
        n = heroes.FRAMES[a]
        orig = {'idle': 4, 'walk': 4, 'attack': 4, 'hit': 1, 'death': 4}[a]
        if orig == 1 or n == 1:
            return fn(a, 0)
        # posição fracionária nos 4 quadros-chave originais (os desenhos interpolam)
        return fn(a, heroes.key_u(a, i, orig) if a != 'death' or orig > 1 else 0)
    return wrap
CLASSES = ['dark_knight', 'dark_wizard', 'fairy_elf', 'magic_gladiator', 'dark_lord', 'summoner']


def death_frames(draw, pivot):
    """Quadros de morte: cambaleia, ajoelha, tomba de costas e fica deitado (queda suave)."""
    n = heroes.FRAMES['death']
    kneel = max(2, n // 2 - 1)
    frames = [draw('death', min(n - 1, round(k * (n - 1) / kneel))).image() for k in range(kneel)]
    base = draw('death', n - 1).image()
    rest = n - kneel
    for k in range(rest):
        q = (k + 1) / rest
        e = 1 - (1 - q) ** 2  # acelera no começo, assenta no fim
        frames.append(base.rotate(88 * e, resample=Image.NEAREST, center=pivot, translate=(30 * e, -2 * e)))
    return frames


def sheet(draw, fw, fh, pivot, rotate_death=True, actions=None):
    actions = actions or ACTIONS
    img = Image.new('RGBA', (fw * MAXF, fh * len(actions)), (0, 0, 0, 0))
    meta = {}
    for row, (act, n, fps) in enumerate(actions):
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


def runtime_actions(actions):
    """Preserva no manifest as temporizações usadas pelo cliente."""
    walk = actions.get('walk')
    if walk:
        actions['run'] = {'row': walk['row'], 'frames': walk['frames'], 'fps': max(24, walk.get('fps', 12))}
    for v in ('front', 'back'):
        w = actions.get('walk_' + v)
        if w:
            actions['run_' + v] = {'row': w['row'], 'frames': w['frames'], 'fps': max(24, w.get('fps', 12))}
    attack = actions.get('attack')
    if attack:
        attack['impactFrame'] = min(attack['frames'] - 1, round(attack['frames'] * 0.55))
    return actions


def main():
    os.makedirs(os.path.join(OUT, 'heroes'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'monsters'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'effects'), exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    manifest = {'version': 9, 'heroes': {}, 'monsters': {}, 'effects': {},
                'skinKeys': [list(c) for c in ramp5(heroes.SKIN)]}
    pivot = (heroes.BUILD['cx'], heroes.FOOT_Y)

    for cls in CLASSES:
        img, meta = sheet(lambda a, i, cls=cls: heroes.draw_hero(cls, a, i), heroes.FW, heroes.FH, pivot)
        path = f'heroes/{cls}.png'
        img.save(os.path.join(OUT, path))
        hk = None
        if cls in heroes.HAIR_DEFAULT:
            hk = [list(c) for c in ramp5(heroes.hair_ramp(heroes.HAIR_DEFAULT[cls]))]
        manifest['heroes'][cls] = {'sheet': path, 'fw': heroes.FW, 'fh': heroes.FH, 'pivot': list(pivot), 'actions': runtime_actions(meta),
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

    # asas e capas: uma folha por item, com um bloco por classe (carregada só quando alguém usa)
    manifest['wings'] = {'classes': CLASSES, 'rowsPerClass': len(ACTIONS), 'sheets': {}, 'glow': wings.GLOW,
                         'fw': wings.WFW, 'fh': wings.WFH, 'pivot': list(wings.PIVOT)}
    for base in wings.STYLES:
        blocks = []
        for cls in CLASSES:
            img, _ = sheet(lambda a, i, cls=cls, base=base: wings.draw_wings(cls, base, a, i), wings.WFW, wings.WFH, wings.PIVOT)
            blocks.append(img)
        big = Image.new('RGBA', (blocks[0].width, sum(b.height for b in blocks)), (0, 0, 0, 0))
        y = 0
        for b in blocks:
            big.alpha_composite(b, (0, y)); y += b.height
        path = f'equip/wings_{base}.png'
        big.save(os.path.join(OUT, path), optimize=True)
        manifest['wings']['sheets'][base] = path
        if wings.STYLES[base]['kind'] == 'cape':
            blocks = [sheet(lambda a, i, cls=cls, base=base: wings.draw_wings(cls, base, a, i, layer='over'), wings.WFW, wings.WFH, wings.PIVOT)[0] for cls in CLASSES]
            big = Image.new('RGBA', (blocks[0].width, sum(b.height for b in blocks)), (0, 0, 0, 0))
            y = 0
            for b in blocks:
                big.alpha_composite(b, (0, y)); y += b.height
            path = f'equip/wings_{base}_over.png'
            big.save(os.path.join(OUT, path), optimize=True)
            manifest['wings'].setdefault('over', {})[base] = path
    print('  asas e capas:', len(wings.STYLES))

    mons = {
        'slime': (legacy(monsters.slime), 48, 40, (22, 37), False, 1.0),
        'goblin': (lambda a, i: monsters.goblin(a, i), 96, 96, (40, 90), True, 1.0),
        'goblin_elite': (monsters.goblin_chief, 96, 96, (40, 90), True, 1.25),
        'ice_golem': (legacy(monsters.ice_golem), 96, 96, (42, 90), True, 1.25),
        'lava_hound': (legacy(monsters.lava_hound), 80, 56, (34, 52), False, 1.0),
        'spider': (legacy(monsters.spider), 64, 48, (30, 44), False, 1.0),
        'skeleton': (lambda a, i: monsters.skeleton(a, i), 96, 96, (40, 90), True, 1.0),
        'skeleton_king': (lambda a, i: monsters.skeleton(a, i, king=True), 96, 96, (42, 90), True, 1.5),
    }
    for name, (fn, fw, fh, pv, rot, scale) in mons.items():
        img, meta = sheet(fn, fw, fh, pv, rotate_death=rot, actions=MON_ACTIONS)
        path = f'monsters/{name}.png'
        img.save(os.path.join(OUT, path))
        manifest['monsters'][name] = {'sheet': path, 'fw': fw, 'fh': fh, 'pivot': list(pv), 'actions': runtime_actions(meta), 'scale': scale}

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
