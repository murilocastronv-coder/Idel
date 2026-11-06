"""Ícones das asas novas no atlas de itens (bolsa, loja e loja de cash).

Uso:
    python3 tools/sprites/import_wings.py

Lê os desenhos em public/assets/sprites/wings_new/ (os mesmos que aparecem no herói).
"""
import json
import os

from PIL import Image

HERE = os.path.dirname(__file__)
ICONS = os.path.join(HERE, '..', '..', 'public', 'assets', 'icons')
WINGS = os.path.join(HERE, '..', '..', 'public', 'assets', 'sprites', 'wings_new')
# mesmo mapa de public/js/sprites.js (NEW_WINGS e FEST_WINGS)
NEW_WINGS = {'wings_satan': 'satan', 'wings_dragon': 'dragon', 'wings_dragon_l1': 'satan', 'wings_curse': 'curse', 'wings_despair': 'despair',
             'wings_heaven': 'heaven', 'wings_elf': 'heaven', 'wings_life': 'heaven', 'wings_soul': 'heaven', 'wings_spirit': 'heaven',
             'wings_spirit_l1': 'heaven', 'wings_darkness': 'darkness', '@wings': 'heaven'}
FEST = ['dragon', 'despair', 'curse', 'heaven', 'darkness']  # vermelho, azul, verde, dourado, roxo


def fit(im, size):
    im = im.crop(im.getbbox())
    k = min((size - 2) / im.size[0], (size - 2) / im.size[1])
    im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.NEAREST)
    c = Image.new('RGBA', (size, size))
    c.alpha_composite(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2))
    return c


def main():
    meta = json.load(open(os.path.join(ICONS, 'items.json')))
    atlas = Image.open(os.path.join(ICONS, 'items.png')).convert('RGBA')
    size, cols = meta['size'], meta['cols']
    art = {n: fit(Image.open(os.path.join(WINGS, n + '.png')).convert('RGBA'), size) for n in set(NEW_WINGS.values()) | set(FEST)}
    done = 0
    for base, i in meta['index'].items():
        if base.startswith('festive_') and base.endswith('_wings'):
            name = FEST[(int(base.split('_')[1]) - 1) % 5]
        elif base in NEW_WINGS:
            name = NEW_WINGS[base]
        else:
            continue
        x, y = (i % cols) * size, (i // cols) * size
        atlas.paste(Image.new('RGBA', (size, size)), (x, y))
        atlas.alpha_composite(art[name], (x, y))
        done += 1
    atlas.save(os.path.join(ICONS, 'items.png'), optimize=True)
    print('ícones de asas trocados:', done)


if __name__ == '__main__':
    main()
