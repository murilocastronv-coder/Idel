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
NEW_WINGS = {'wings_satan': 'demoniaca_2', 'wings_dragon': 'draconica_4', 'wings_heaven': 'angelical_2', 'wings_soul': 'angelical_4',
             'wings_elf': 'elemental_1', 'wings_spirit': 'dourada', 'wings_life': 'elemental_2', 'wings_curse': 'sombria_2',
             'wings_despair': 'sombria_4', 'wings_darkness': 'draconica_5', 'wings_dragon_l1': 'draconica_1',
             'wings_spirit_l1': 'angelical_1', '@wings': 'angelical_3'}
FEST_FAMILY = ['demoniaca', 'cristalina', 'elemental', 'angelical', 'sombria']  # vermelho, azul, verde, dourado, roxo


def fest(n):
    return f'{FEST_FAMILY[(n - 1) % 5]}_{min(5, (n - 1) // 5 + 1)}'


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
    art = {os.path.basename(f)[:-4]: fit(Image.open(os.path.join(WINGS, f)).convert('RGBA'), size) for f in os.listdir(WINGS) if f.endswith('.png')}
    done = 0
    for base, i in meta['index'].items():
        if base.startswith('festive_') and base.endswith('_wings'):
            name = fest(int(base.split('_')[1]))
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
