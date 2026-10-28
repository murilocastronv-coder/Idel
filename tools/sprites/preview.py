import sys
from PIL import Image
from heroes import draw_hero
CLS = ['dark_knight', 'dark_wizard', 'fairy_elf', 'magic_gladiator', 'dark_lord', 'summoner']
acts = sys.argv[2].split(',') if len(sys.argv) > 2 else ['idle:0']
S = 5
W, H = 96, 96
out = Image.new('RGBA', (W * S * len(acts), H * S * len(CLS)), (40, 46, 70, 255))
for r, cls in enumerate(CLS):
    for k, a in enumerate(acts):
        act, i = a.split(':')
        im = draw_hero(cls, act, int(i)).image().resize((W * S, H * S), Image.NEAREST)
        out.alpha_composite(im, (k * W * S, r * H * S))
out.save(sys.argv[1])
