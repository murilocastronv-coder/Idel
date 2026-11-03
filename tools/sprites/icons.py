"""Ícones detalhados (48x48) de todos os itens do jogo, no estilo pixel art rico:
sombreamento em 5 tons, contorno colorido, acabamentos em ouro, gemas facetadas, pelúcia
e brilhos. Gera public/assets/icons/items.png (atlas) + items.json (índice por base).

Uso: python3 tools/sprites/icons.py
"""
import json
import math
import os
import subprocess
import sys
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pixelkit import Canvas, hexc, mix, ramp, ramp5  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'icons')
S = 48
COLS = 24

GOLD = ramp('#e2a936', '#fff2a8', '#6e3f0c')
SILVER = ramp('#c4ccd8', '#ffffff', '#4c5470')
STEEL = ramp('#a6b2c4', '#f2f6ff', '#3e4660')
FUR = ramp('#e6ecf4', '#ffffff', '#8c9ab4')
WOOD = ramp('#8a5630', '#c89058', '#3c2010')
LEATHER = ramp('#6e4026', '#a8704a', '#2e180c')
DARK = ramp('#3a3448', '#6a6080', '#141020')
BONE = ramp('#e8dcc0', '#fffbea', '#8a7a5a')
CREAM = ramp('#f4ead0', '#ffffff', '#b8a07a')
HOLLY = ramp('#2f9a46', '#7ee08a', '#0e4a20')
BERRY = ramp('#e0283a', '#ff9a9a', '#6a0a14')


class IC(Canvas):
    def line(self, p1, p2, color, width=1):
        col = hexc(color) if isinstance(color, str) else tuple(color[:3]) + (255,)
        self.part(lambda d: d.line([tuple(p1), tuple(p2)], fill=255, width=width), (col, col, col), shade=False, sep=False)

    def px(self, x, y, color):
        if not isinstance(color, str):
            color = tuple(color[:3]) + (255,)
        super().px(x, y, color)


def R(c, **k):
    return c if isinstance(c, tuple) else ramp(c, **k)


# ---------------------------------------------------------------- materiais
MATS = {
    'leather': dict(main='#8a5a34', trim='#c49a62', gem='#6ab0ff', tier=0),
    'bronze': dict(main='#b5723a', trim='#f0c060', gem='#4aa8ff', tier=1),
    'scale': dict(main='#3c8a84', trim='#d0d8e2', gem='#5ef0c8', tier=2),
    'dragon': dict(main='#b0262c', trim='#e6b23a', gem='#ffd040', tier=3),
    'storm': dict(main='#2f5fc8', trim='#dfe6f0', gem='#7aeaff', glow='#7aeaff', tier=4),
    'phoenix': dict(main='#e8661a', trim='#ffc640', gem='#ff2a3a', glow='#ffb040', tier=5),
    'abyss': dict(main='#4c2278', trim='#b49af0', gem='#d060ff', glow='#b050ff', tier=6),
    'chaos': dict(main='#3a3446', trim='#e6b23a', gem='#ff6a2a', glow='#ff7a2a', tier=4),
    'elven': dict(main='#3f8f48', trim='#e6c050', gem='#9aff7a', tier=1),
    'silver': dict(main='#9aa8bc', trim='#ffffff', gem='#7ac8ff', tier=2),
    'oak': dict(main='#8a5630', trim='#b0b8c8', gem='#d0a060', tier=0),
    'skull': dict(main='#6a5a48', trim='#e8dcc0', gem='#a0ff6a', tier=0),
    'serpent': dict(main='#2f7a4a', trim='#e6b23a', gem='#9aff5a', tier=1),
    'thunder': dict(main='#3450a8', trim='#ffd84a', gem='#fff07a', glow='#fff07a', tier=2),
    'spirit': dict(main='#3a6ab0', trim='#e6b23a', gem='#9ad8ff', tier=0),
    'curse': dict(main='#5a2050', trim='#c8a0d8', gem='#ff5ab0', tier=1),
    'souls': dict(main='#2a2a5a', trim='#e6b23a', gem='#9a7aff', glow='#9a7aff', tier=2),
    'small': dict(main='#8a6a4a', trim='#c8a060', gem='#6ab0ff', tier=0),
    'lord': dict(main='#7a2a8a', trim='#e6b23a', gem='#ff6ad0', tier=1),
    'great': dict(main='#2a4a8a', trim='#ffd84a', gem='#7aeaff', tier=2),
    'life': dict(main='#2f9a5a', trim='#e6b23a', gem='#6aff9a', tier=1),
    'ice': dict(main='#5aa8d8', trim='#e8f4ff', gem='#bff4ff', tier=2),
    'wind': dict(main='#3a9a8a', trim='#e6b23a', gem='#7affd8', tier=1),
    'flame': dict(main='#c8361a', trim='#ffc640', gem='#ff6a2a', glow='#ffa040', tier=4),
    'broken': dict(main='#6a6a72', trim='#8a8a92', gem='#9aa3b5', tier=0),
}
WEAPON_MAT = {'short_sword': 'leather', 'kris': 'bronze', 'broad_blade': 'scale', 'legion_sword': 'dragon',
              'short_bow': 'leather', 'elven_bow': 'elven', 'silver_bow': 'silver', 'broken_sword': 'broken'}
FEST_TRIMS = ['#e6b23a', '#dfe6f0', '#f0a088', '#a8e8ff', '#ffd870', '#c8a8ff']
FEST_GEMS = ['#ffd040', '#7aeaff', '#ff4a8a', '#9aff7a', '#ff6a2a', '#d060ff']


def mat_for(key, b):
    m = None
    if key.startswith('festive_'):
        n = int(key.split('_')[1])
        v = (n - 1) // 5
        tone = b.get('color') or b.get('ic') or '#db3039'
        return dict(main=tone, trim=FEST_TRIMS[v % 6], gem=FEST_GEMS[(n - 1) % 6], tier=3 + v % 4,
                    festive=True, variant=v, n=n, glow=FEST_GEMS[(n - 1) % 6] if v >= 3 else None)
    if key in WEAPON_MAT:
        m = dict(MATS[WEAPON_MAT[key]])
    else:
        for p in key.replace('ring_', '').replace('necklace_', '').split('_'):
            if p in MATS:
                m = dict(MATS[p])
                break
    if m is None:
        c = b.get('ic') or b.get('color') or '#9aa3b5'
        m = dict(main=c, trim='#e6b23a', gem=c, tier={'legendary': 6, 'epic': 4, 'rare': 3}.get(b.get('rarity'), 2))
    if b.get('ic') and key.startswith(('wings', 'cape', 'jewel', 'devil', 'kundun', 'loch', 'feather', 'tear', 'orb', 'soul', 'flame', 'horn', 'scroll', 'reset')):
        m['main'] = m['gem'] = b['ic']
    return m


def H(seed):
    return zlib.crc32(seed.encode())


# ---------------------------------------------------------------- utilidades
def poly(c, pts, rmp, **k):
    return c.part(lambda d: d.polygon([tuple(p) for p in pts], fill=255), R(rmp), **k)


def ell(c, box, rmp, **k):
    return c.part(lambda d: d.ellipse(box, fill=255), R(rmp), **k)


def rect(c, box, rmp, **k):
    return c.part(lambda d: d.rectangle(box, fill=255), R(rmp), **k)


def thick(c, pts, w, rmp, **k):
    return c.part(lambda d: d.line([tuple(p) for p in pts], fill=255, width=w, joint='curve'), R(rmp), **k)


def recolor(c, mask, src, dst):
    a, b = ramp5(R(src)), ramp5(R(dst))
    img = c.img
    for s, t in zip(a, b):
        sel = mask & (img[:, :, 0] == s[0]) & (img[:, :, 1] == s[1]) & (img[:, :, 2] == s[2])
        img[sel, :3] = t


def sparkle(c, x, y, big=False, col='#ffffff'):
    c.px(x, y, col)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        c.px(x + dx, y + dy, '#fff6c8')
    if big:
        for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            c.px(x + dx, y + dy, '#fff0a0')


def gem(c, cx, cy, r, color, cut='round'):
    """Gema facetada: mesa clara, facetas escuras e reflexo."""
    rm = ramp(color, light=0.55, dark=0.55)
    if cut == 'diamond':
        poly(c, [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], GOLD)
        poly(c, [(cx, cy - r + 1), (cx + r - 1, cy), (cx, cy + r - 1), (cx - r + 1, cy)], rm, sep=False)
    elif cut == 'oval':
        ell(c, (cx - r, cy - r - 1, cx + r, cy + r + 1), GOLD)
        ell(c, (cx - r + 1, cy - r, cx + r - 1, cy + r), rm, sep=False)
    else:
        ell(c, (cx - r, cy - r, cx + r, cy + r), GOLD)
        ell(c, (cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1), rm, sep=False)
    if r >= 3:
        c.px(cx - r // 2, cy - r // 2, '#ffffff')
        c.px(cx - r // 2 + 1, cy - r // 2, mix(hexc(color), (255, 255, 255), 0.7) + (255,))
        c.px(cx + r // 2 - 1, cy + r // 2 - 1, rm[2])


def holly(c, x, y, s=1.0):
    poly(c, [(x, y), (x - 6 * s, y - 3 * s), (x - 9 * s, y + 1 * s), (x - 4 * s, y + 2 * s)], HOLLY)
    poly(c, [(x, y), (x + 6 * s, y - 3 * s), (x + 9 * s, y + 1 * s), (x + 4 * s, y + 2 * s)], HOLLY)
    for dx, dy in ((-1.5, 0), (1.5, 0), (0, -2)):
        ell(c, (x + dx * s - 1.6, y + dy * s - 1.6, x + dx * s + 1.6, y + dy * s + 1.6), BERRY, sep=False)


def snowflake(c, cx, cy, r, col='#ffffff'):
    for k in range(6):
        a = math.radians(k * 60 - 90)
        x2, y2 = cx + math.cos(a) * r, cy + math.sin(a) * r
        c.line((cx, cy), (x2, y2), col)
        for f in (0.55,):
            bx, by = cx + math.cos(a) * r * f, cy + math.sin(a) * r * f
            for da in (-50, 50):
                b = a + math.radians(da)
                c.line((bx, by), (bx + math.cos(b) * r * 0.32, by + math.sin(b) * r * 0.32), col)
    c.px(cx, cy, '#fffbe0')


def mirror(c):
    c.img[:, S // 2:] = c.img[:, :S // 2][:, ::-1]


class Axis:
    """Coordenadas ao longo de um eixo diagonal (armas)."""
    def __init__(self, ox, oy, ang=-45):
        a = math.radians(ang)
        self.o = (ox, oy)
        self.d = (math.cos(a), math.sin(a))
        self.n = (-self.d[1], self.d[0])

    def __call__(self, u, v=0):
        return (self.o[0] + u * self.d[0] + v * self.n[0], self.o[1] + u * self.d[1] + v * self.n[1])

    def pts(self, uv):
        return [self(u, v) for u, v in uv]


# ---------------------------------------------------------------- armas
def sword(c, m, key, b):
    t = m['tier']
    fest = m.get('festive')
    A = Axis(13, 35)
    style = 'kris' if key == 'kris' else 'broad' if key in ('broad_blade',) or 'axe' in key else 'short' if key in ('short_sword', 'broken_sword') else ['long', 'broad', 'flame', 'long'][H(key) % 4] if t >= 3 else 'long'
    L = {'short': 31, 'long': 39, 'broad': 37, 'kris': 37, 'flame': 39}[style]
    if key == 'broken_sword':
        L = 20
    w = {'short': 5, 'long': 6, 'broad': 8, 'kris': 5.6, 'flame': 6.4}[style]
    blade_r = STEEL if not fest else FUR
    if t >= 4 and not fest:
        blade_r = ramp(mix(hexc('#c8d4e8'), hexc(m['main']), 0.25) and '#%02x%02x%02x' % mix(hexc('#c8d4e8'), hexc(m['main']), 0.3), '#ffffff', '#3a4060')
    if 'axe' in key:
        # machado de duas mãos: cabo longo + lâmina em lua
        L = 36
        thick(c, A.pts([(-11, 0), (L, 0)]), 4, WOOD)
        poly(c, A.pts([(L - 12, -1), (L - 9, -12), (L - 2, -14), (L + 1, -8), (L - 2, -1)]), STEEL)
        poly(c, A.pts([(L - 12, 1), (L - 9, 10), (L - 3, 11), (L - 2, 1)]), STEEL)
        rect(c, (A(L - 7)[0] - 2, A(L - 7)[1] - 2, A(L - 7)[0] + 2, A(L - 7)[1] + 2), GOLD)
        gem(c, *map(round, A(L - 7)), 2, m['gem'])
        c.glow(*A(L - 6, -6), 9, m.get('glow') or m['gem'], 70)
        return
    if style == 'kris':
        edge = []
        for k in range(0, 9):
            u = 2 + k * (L - 6) / 8
            edge.append((u, -w / 2 + (1.2 if k % 2 else -0.4)))
        back = [(u, -v) for u, v in reversed(edge)]
        blade = A.pts(edge + [(L, 0)] + back)
    elif style == 'flame':
        edge = [(2 + k * (L - 6) / 6, -w / 2 - (1 if k % 2 else 0)) for k in range(7)]
        back = [(u, -v) for u, v in reversed(edge)]
        blade = A.pts(edge + [(L, 0)] + back)
    else:
        tip = 6 if style != 'broad' else 7
        blade = A.pts([(2, -w / 2), (L - tip, -w / 2), (L, 0), (L - tip, w / 2), (2, w / 2)])
        if key == 'broken_sword':
            blade = A.pts([(2, -w / 2), (L - 2, -w / 2), (L, -0.5), (L - 3, 0.8), (L - 1, w / 2), (2, w / 2)])
    bm = poly(c, blade, blade_r)
    if fest:
        yy, xx = np.mgrid[0:S, 0:S]
        stripe = ((xx + yy * 0 - yy) // 1 % 1 == 0) & ((((xx - yy) // 3) % 2) == 0)
        stripe = ((((xx + yy) // 3) % 2) == 0) & bm
        recolor(c, stripe, FUR, R(m['main']))
    else:
        # vinco central e fio claro
        c.line(A(3, 0), A(L - 7, 0), ramp5(blade_r)[2] if style != 'broad' else ramp5(blade_r)[3])
        c.line(A(4, -1), A(L - 8, -1), '#ffffff')
    if t >= 4 or fest:
        c.glow(*A(L * 0.6), 12, m.get('glow') or m['gem'] if not fest else '#ffffff', 60 if not fest else 45)
    # guarda
    gw = 8 + min(t, 4)
    poly(c, A.pts([(-1, -gw), (1.5, -gw + 1), (2.5, 0), (1.5, gw - 1), (-1, gw), (0.5, 0)]), GOLD if t >= 1 or fest else STEEL)
    if t >= 3 or fest:
        for s in (-1, 1):
            ell(c, (A(0.3, s * gw)[0] - 1.6, A(0.3, s * gw)[1] - 1.6, A(0.3, s * gw)[0] + 1.6, A(0.3, s * gw)[1] + 1.6), GOLD, sep=False)
    gem(c, *map(round, A(0.6, 0)), 2 if t < 3 else 3, m['gem'])
    # empunhadura com tiras
    gm = thick(c, A.pts([(-1, 0), (-9, 0)]), 4, LEATHER if not fest else R(m['main']))
    for k in range(-8, -1, 2):
        c.line(A(k, -1.5), A(k + 0.6, 1.5), ramp5(LEATHER if not fest else R(m['main']))[0])
    # pomo
    px, py = A(-11, 0)
    ell(c, (px - 2.6, py - 2.6, px + 2.6, py + 2.6), GOLD)
    if t >= 2 or fest:
        gem(c, round(px), round(py), 1, m['gem'])
    if fest:
        holly(c, *map(round, A(1, -5)), 0.7)
    if t >= 5:
        sparkle(c, *map(round, A(L - 3, -3)), True)


def bow(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    A = Axis(27, 27, -45)
    limb = R(m['main']) if t >= 2 or fest else WOOD
    pts_up = [A(u, -10 * (1 - (u / 22) ** 2) + (2.5 if abs(u) > 19 else 0)) for u in range(0, 23, 2)]
    pts_dn = [A(-u, -10 * (1 - (u / 22) ** 2) + (2.5 if abs(u) > 19 else 0)) for u in range(0, 23, 2)]
    # corda
    c.line(A(21, -1), A(-21, -1), '#e8e4d8')
    # flecha armada
    if t >= 1:
        c.line(A(0, 12), A(0, -16), ramp5(WOOD)[0])
        poly(c, A.pts([(-2, -14), (0, -19), (2, -14)]), STEEL)
        poly(c, A.pts([(-2.5, 8), (0, 6), (0, 10)]), R(m['gem']), sep=False)
        poly(c, A.pts([(2.5, 8), (0, 6), (0, 10)]), R(m['gem']), sep=False)
    um = thick(c, pts_up, 5, limb)
    dm = thick(c, pts_dn, 5, limb)
    if fest:
        yy, xx = np.mgrid[0:S, 0:S]
        recolor(c, (um | dm) & ((((xx + yy) // 3) % 2) == 0), limb, FUR)
    else:
        for pts in (pts_up, pts_dn):
            c.line(pts[2], pts[-2], ramp5(limb)[0])
    # pontas douradas recurvas
    for s in (1, -1):
        tx, ty = A(21.5 * s, -2)
        ell(c, (tx - 2.2, ty - 2.2, tx + 2.2, ty + 2.2), GOLD)
        if t >= 3 or fest:
            gem(c, round(tx), round(ty), 1, m['gem'])
    # empunhadura
    gx, gy = A(0, -10)
    poly(c, A.pts([(-4, -13), (4, -13), (4, -7.5), (-4, -7.5)]), LEATHER if not fest else R(m['main']))
    for k in (-2.5, 2.5):
        c.line(A(k, -13), A(k, -7.5), ramp5(GOLD)[1])
    if t >= 2 or fest:
        gem(c, round(gx), round(gy), 2, m['gem'], 'diamond')
    if fest:
        holly(c, round(gx) - 1, round(gy) - 5, 0.65)
    if t >= 4:
        c.glow(gx, gy, 10, m.get('glow') or m['gem'], 55)
    if t >= 5:
        sparkle(c, *map(round, A(14, -9)), True)


def staff(c, m, key, b):
    t = m['tier']
    A = Axis(19, 29, -50)
    shaft = WOOD if t < 2 else R(m['main']) if t < 4 else DARK
    thick(c, A.pts([(-24, 0), (10, 0)]), 4, shaft)
    for u in (-14, -4):
        thick(c, A.pts([(u, 0), (u + 2, 0)]), 4, GOLD, sep=False)
    hx, hy = A(15, 0)
    if 'skull' in key:
        ell(c, (hx - 6, hy - 7, hx + 6, hy + 4), BONE)
        rect(c, (hx - 3, hy + 2, hx + 3, hy + 6), BONE)
        for dx in (-3, 2):
            ell(c, (hx + dx - 1.5, hy - 3, hx + dx + 1.5, hy), DARK, sep=False)
            c.px(hx + dx, hy - 2, m['gem'])
        c.glow(hx, hy - 2, 9, m['gem'], 60)
        return
    # garras segurando a orbe
    for s in (-1, 1):
        thick(c, [A(9, s * 2), A(13, s * 6), A(18, s * 5), A(19, s * 3)], 2, GOLD)
    orb = m.get('glow') or m['gem']
    ell(c, (hx - 5, hy - 5, hx + 5, hy + 5), ramp(orb, light=0.6, dark=0.5))
    c.px(hx - 2, hy - 2, '#ffffff'); c.px(hx - 1, hy - 2, '#ffffff'); c.px(hx - 2, hy - 1, '#ffffff')
    if 'thunder' in key or 'storm' in key or 'lightning' in key:
        c.line((hx - 1, hy - 3), (hx + 1, hy), '#fff8c0'); c.line((hx + 1, hy), (hx - 1, hy + 3), '#fff8c0')
    if 'serpent' in key:
        thick(c, [A(-10, 3), A(-6, -3), A(-2, 3), A(2, -3), A(6, 3)], 2, HOLLY)
    c.glow(hx, hy, 11 + t, orb, 80)
    if t >= 4:
        sparkle(c, round(hx + 6), round(hy - 6), True)


def scepter(c, m, key, b):
    t = m['tier']
    A = Axis(18, 30, -50)
    thick(c, A.pts([(-14, 0), (10, 0)]), 3, GOLD if t >= 1 else WOOD)
    thick(c, A.pts([(-15, 0), (-12, 0)]), 5, GOLD, sep=False)
    hx, hy = A(14, 0)
    # cabeça de maça com flanges
    for k in range(6 + (t >= 3) * 2):
        a = k * (360 / (6 + (t >= 3) * 2))
        x2, y2 = hx + math.cos(math.radians(a)) * 8, hy + math.sin(math.radians(a)) * 8
        thick(c, [(hx, hy), (x2, y2)], 3, R(m['trim']))
    ell(c, (hx - 5, hy - 5, hx + 5, hy + 5), R(m['main']))
    gem(c, round(hx), round(hy), 3, m['gem'], 'diamond')
    if t >= 2:
        c.glow(hx, hy, 12, m.get('glow') or m['gem'], 70)
    if t >= 4:
        sparkle(c, round(hx - 7), round(hy - 7), True)


def book(c, m, key, b):
    t = m['tier']
    # páginas (lado direito/inferior)
    poly(c, [(13, 9), (39, 7), (40, 40), (14, 43)], CREAM)
    for y in range(12, 41, 3):
        c.line((37, y - 2), (39, y - 2), ramp5(CREAM)[2])
    # capa
    cover = R(m['main'])
    poly(c, [(9, 8), (35, 6), (36, 39), (10, 42)], cover)
    poly(c, [(9, 8), (13, 7.6), (14, 41.6), (10, 42)], R(ramp5(cover)[2][:3] and '#%02x%02x%02x' % ramp5(cover)[2][:3]))
    # moldura dourada
    for y in (11, 36):
        c.line((15, y), (32, y - 1), ramp5(GOLD)[1])
    for (x, y) in ((33, 8), (33, 37), (12, 9), (12, 39)):
        poly(c, [(x - 2, y - 2), (x + 2, y - 2), (x + 2, y + 2), (x - 2, y + 2)], GOLD, sep=False)
    # emblema
    cx, cy = 23, 23
    if t >= 1:
        poly(c, [(cx, cy - 9), (cx + 7, cy), (cx, cy + 9), (cx - 7, cy)], GOLD)
    gem(c, cx, cy, 4, m['gem'], 'round')
    if 'curse' in key:
        for s in (-1, 1):
            thick(c, [(cx + s * 4, cy - 5), (cx + s * 8, cy - 10)], 2, BONE)
    if t >= 2:
        c.glow(cx, cy, 12, m.get('glow') or m['gem'], 65)
    if t >= 4:
        sparkle(c, 34, 12, True)


def shield(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    outer = [(8, 6), (40, 6), (41, 22), (36, 33), (24, 43), (12, 33), (7, 22)]
    inner = [(11, 9), (37, 9), (38, 22), (33.5, 31), (24, 39.5), (14.5, 31), (10, 22)]
    body = R(m['main']) if not key.startswith('oak') else WOOD
    poly(c, outer, GOLD if t >= 2 or fest else R(m['trim']))
    bm = poly(c, inner, body, sep=False)
    if key.startswith('oak'):
        for x in (17, 24, 31):
            c.line((x, 10), (x, 38 - abs(x - 24) // 2), ramp5(WOOD)[2])
    if fest:
        snowflake(c, 24, 22, 9)
        holly(c, 24, 9, 0.8)
        gem(c, 24, 22, 2, m['gem'])
    else:
        if t >= 3:
            # emblema alado
            for s in (-1, 1):
                poly(c, [(24, 18), (24 + s * 12, 13), (24 + s * 10, 19), (24 + s * 12, 22), (24, 25)], R(m['trim']))
        elif t >= 1:
            rect(c, (22, 11, 26, 36), R(m['trim']), sep=False)
            rect(c, (13, 19, 35, 23), R(m['trim']), sep=False)
        ell(c, (19, 16, 29, 26), GOLD)
        gem(c, 24, 21, 3, m['gem'])
        # rebites
        for (x, y) in ((11, 9), (37, 9), (10, 22), (38, 22), (24, 39)):
            c.px(x, y, ramp5(GOLD)[0])
    if t >= 4:
        c.glow(24, 21, 13, m.get('glow') or m['gem'], 55)
        sparkle(c, 36, 10, True)


# ---------------------------------------------------------------- armaduras
def helm(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    main = R(m['main']) if not key.startswith('leather') else LEATHER
    trim = R(m['trim'])
    # adornos de trás: chifres/asas/crina
    if fest:
        pass
    elif t >= 5:
        for s in (-1, 1):
            poly(c, [(24 + s * 11, 18), (24 + s * 21, 6), (24 + s * 19, 14), (24 + s * 23, 13), (24 + s * 15, 24)], trim)
    elif t >= 3:
        for s in (-1, 1):
            thick(c, [(24 + s * 11, 15), (24 + s * 17, 9), (24 + s * 18, 2)], 3, BONE)
    elif t >= 1:
        thick(c, [(24, 6), (26, 2), (31, 1), (35, 4)], 3, R(m['gem']))
    if fest:
        # barrete com pompom caído
        poly(c, [(13, 18), (24, 2), (36, 8), (41, 17), (35, 18)], main)
        ell(c, (37, 13, 45, 21), FUR)
    ell(c, (11, 6, 37, 32), main)
    # placa facial
    poly(c, [(12, 18), (36, 18), (35, 33), (29, 41), (19, 41), (13, 33)], main if fest else R(m['main']) if t else LEATHER)
    # faixa da testa
    rect(c, (11, 16, 37, 20), FUR if fest else trim, sep=False)
    if fest:
        for x in range(13, 36, 3):
            c.px(x, 17, '#ffffff')
        rect(c, (11, 20, 37, 22), GOLD, sep=False)
    # viseira em T
    poly(c, [(15, 23), (33, 23), (33, 26), (26, 26), (26, 36), (22, 36), (22, 26), (15, 26)], DARK, sep=False)
    c.line((16, 24), (21, 24), '#5a5070')
    if t >= 2 or fest:
        for x in (14, 34):
            for y in (28, 32):
                c.px(x, y, ramp5(GOLD)[0])
    # crista central
    if not fest:
        thick(c, [(24, 6), (24, 16)], 3, trim, sep=False)
    gem(c, 24, 18, 2 if t < 3 else 3, m['gem'], 'diamond' if t >= 3 else 'round')
    if fest:
        holly(c, 16, 15, 0.6)
    if t >= 4:
        c.glow(24, 18, 9, m.get('glow') or m['gem'], 50)
        sparkle(c, 33, 9, True)


def armor(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    main = R(m['main']) if not key.startswith('leather') else LEATHER
    trim = R(m['trim'])
    # tronco
    poly(c, [(14, 9), (34, 9), (37, 24), (35, 41), (24, 44), (13, 41), (11, 24)], main)
    # gola
    if fest:
        ell(c, (13, 4, 35, 14), FUR)
    else:
        poly(c, [(17, 6), (31, 6), (33, 11), (24, 15), (15, 11)], trim)
    # placas peitorais
    if not fest:
        for s in (-1, 1):
            poly(c, [(24, 14), (24 + s * 10, 12), (24 + s * 11, 23), (24, 27)], main)
        c.line((24, 14), (24, 40), ramp5(main)[2])
        for y in (31, 35):
            c.line((16, y), (32, y), ramp5(main)[2])
    else:
        rect(c, (21, 13, 27, 43), FUR, sep=False)
        for y in (18, 25, 32):
            ell(c, (22.5, y - 1.5, 25.5, y + 1.5), GOLD, sep=False)
    # cinto
    rect(c, (12, 36, 36, 40), DARK if fest else LEATHER, sep=False)
    rect(c, (21, 35, 27, 41), GOLD, sep=False)
    rect(c, (23, 37, 25, 39), DARK, sep=False)
    # ombreiras
    for s in (-1, 1):
        cx = 24 + s * 15
        if fest:
            ell(c, (cx - 7, 8, cx + 7, 21), main)
            ell(c, (cx - 7, 17, cx + 7, 23), FUR, sep=False)
        else:
            ell(c, (cx - 7, 7, cx + 7, 21), main)
            c.part(lambda d, cx=cx: d.arc((cx - 7, 7, cx + 7, 21), 180, 360, fill=255, width=2), trim, shade=False, sep=False)
            if t >= 3:
                poly(c, [(cx - 2, 7), (cx + s * 3, 0), (cx + 3 * s, 8)], trim)
    gem(c, 24, 20, 3 if t >= 2 or fest else 2, m['gem'], 'diamond' if t >= 4 else 'round')
    if fest:
        holly(c, 30, 15, 0.6)
    if t >= 4:
        c.glow(24, 20, 10, m.get('glow') or m['gem'], 50)
        sparkle(c, 9, 9, True)


def pants(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    main = R(m['main']) if not key.startswith('leather') else LEATHER
    trim = R(m['trim'])
    for s in (-1, 1):
        poly(c, [(24, 11), (24 + s * 12, 11), (24 + s * 13, 30), (24 + s * 11, 42), (24 + s * 3, 42), (24 + s * 1, 26)], main)
        if fest:
            rect(c, (24 + s * 2 if s > 0 else 12, 37, 36 if s > 0 else 22, 43), FUR, sep=False)
        else:
            ell(c, (24 + s * 7.5 - 4, 24, 24 + s * 7.5 + 4, 31), trim)
            if t >= 2:
                gem(c, round(24 + s * 7.5), 27, 1, m['gem'])
            c.line((24 + s * 11, 14), (24 + s * 12, 30), ramp5(main)[2] if s > 0 else ramp5(main)[0])
    # cinto
    rect(c, (11, 6, 37, 12), DARK if fest else LEATHER)
    rect(c, (20, 5, 28, 13), GOLD, sep=False)
    gem(c, 24, 9, 2, m['gem'])
    if t >= 3 and not fest:
        for s in (-1, 1):
            poly(c, [(24 + s * 4, 12), (24 + s * 12, 12), (24 + s * 10, 20), (24 + s * 4, 18)], trim)
    if fest:
        holly(c, 16, 9, 0.55)
    if t >= 4:
        c.glow(24, 9, 8, m.get('glow') or m['gem'], 45)
        sparkle(c, 37, 20, True)


def gloves(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    main = R(m['main']) if not key.startswith('leather') else LEATHER
    trim = R(m['trim'])
    # dedos
    for k, (x, top) in enumerate(((15, 6), (20, 3), (25, 3), (30, 6))):
        rect(c, (x, top, x + 4, 18), main)
        if not fest:
            c.line((x, top + 5), (x + 4, top + 5), ramp5(main)[2])
            c.line((x, top + 9), (x + 4, top + 9), ramp5(main)[2])
    # polegar
    thick(c, [(14, 26), (9, 20), (8, 15)], 5, main)
    # mão
    poly(c, [(14, 14), (35, 14), (36, 30), (13, 30)], main)
    if not fest:
        poly(c, [(15, 15), (34, 15), (33, 19), (16, 19)], trim, sep=False)
    # punho
    if fest:
        rect(c, (11, 28, 38, 37), FUR)
        for x in range(13, 37, 3):
            c.px(x, 30, '#ffffff')
        rect(c, (13, 37, 36, 43), main)
    else:
        poly(c, [(12, 29), (37, 29), (39, 43), (10, 43)], trim if t >= 1 else LEATHER)
        poly(c, [(14, 31), (35, 31), (36, 41), (13, 41)], main, sep=False)
        if t >= 3:
            for s in (-1, 1):
                poly(c, [(24 + s * 13, 31), (24 + s * 19, 27), (24 + s * 16, 36)], trim)
    gem(c, 24, 36 if not fest else 40, 3 if t >= 2 or fest else 2, m['gem'])
    if fest:
        holly(c, 24, 25, 0.6)
    if t >= 4:
        c.glow(24, 36, 9, m.get('glow') or m['gem'], 45)
        sparkle(c, 37, 8, True)


def boots(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    main = R(m['main']) if not key.startswith('leather') else LEATHER
    trim = R(m['trim'])
    # cano
    poly(c, [(15, 8), (31, 8), (31, 30), (15, 32)], main)
    # pé
    poly(c, [(14, 28), (31, 27), (38, 31), (41, 36), (40, 40), (14, 40)], main)
    rect(c, (13, 40, 41, 43), DARK, sep=False)
    if fest:
        rect(c, (12, 5, 34, 13), FUR)
        for x in range(14, 33, 3):
            c.px(x, 7, '#ffffff')
        rect(c, (14, 22, 32, 25), DARK, sep=False)
        rect(c, (20, 21, 26, 26), GOLD, sep=False)
        holly(c, 23, 9, 0.6)
    else:
        rect(c, (13, 6, 33, 11), trim)
        # caneleira
        poly(c, [(17, 11), (29, 11), (28, 26), (23, 30), (18, 26)], trim if t >= 1 else main, sep=t >= 1)
        poly(c, [(19, 12), (27, 12), (26, 24), (23, 27), (20, 24)], main, sep=False)
        poly(c, [(31, 31), (37, 31), (40, 37), (32, 37)], trim)
        if t >= 3:
            for s in (1,):
                poly(c, [(31, 14), (40, 6), (38, 13), (42, 12), (33, 22)], trim)
    gem(c, 23, 18 if not fest else 23, 2 if t < 3 else 3, m['gem'] if not fest else m['gem'])
    if t >= 4:
        c.glow(23, 18, 9, m.get('glow') or m['gem'], 45)
        sparkle(c, 10, 14, True)


# ---------------------------------------------------------------- asas / capa
def wings(c, m, key, b):
    tone = m['main']
    fest = m.get('festive')
    bat = any(k in key for k in ('satan', 'curse', 'darkness', 'despair', 'dragon')) and not fest
    t = min(2, int(b.get('tier', 1) or 1))
    if bat:
        mem = ramp(tone, dark=0.6)
        poly(c, [(22, 16), (14, 6), (4, 3), (1, 12), (3, 26), (6, 22), (9, 31), (13, 26), (17, 35), (20, 27), (23, 24)], mem)
        for p in ((4, 3), (3, 26), (9, 31), (17, 35)):
            thick(c, [(22, 16), (14, 8) if p == (4, 3) else ((14, 8))], 2, DARK)
            thick(c, [(14, 8), p], 1, DARK, sep=False)
        thick(c, [(22, 16), (14, 7), (4, 3)], 3, DARK)
        poly(c, [(4, 3), (1, -1), (6, 2)], BONE)
    else:
        bone = [(22, 15), (17, 9), (11, 5), (5, 4)]
        def bpt(q):
            q = q * (len(bone) - 1)
            k = min(int(q), len(bone) - 2)
            f = q - k
            return (bone[k][0] + (bone[k + 1][0] - bone[k][0]) * f, bone[k][1] + (bone[k + 1][1] - bone[k][1]) * f)
        layers = [(1.0, 5.5, 0.62), (0.68, 5, 0.5), (0.4, 4.5, 0.4)]
        if t >= 2:
            layers = [(1.12, 5.5, 0.66)] + layers
        for li, (lf, w, dk) in enumerate(layers):
            n = 9
            rm = ramp(tone, light=0.62 - li * 0.06, dark=dk)
            for i in range(n - 1, -1, -1):
                q = i / (n - 1)
                x0, y0 = bpt(q)
                ang = math.radians(92 + 16 * q)
                L = (15 + 13 * q) * lf
                x1, y1 = x0 + math.cos(ang) * L, min(45, y0 + math.sin(ang) * L)
                L = math.hypot(x1 - x0, y1 - y0) or 1
                nx, ny = -(y1 - y0) / L, (x1 - x0) / L
                pts = [(x0 + nx * w / 2, y0 + ny * w / 2), (x1 + nx * w / 2.4 - (x1 - x0) / L * 3, y1 + ny * w / 2.4 - (y1 - y0) / L * 3), (x1, y1),
                       (x1 - nx * w / 2.4 - (x1 - x0) / L * 3, y1 - ny * w / 2.4 - (y1 - y0) / L * 3), (x0 - nx * w / 2, y0 - ny * w / 2)]
                fm = poly(c, pts, rm)
                c.line((x0, y0), (x1 - (x1 - x0) / L * 2, y1 - (y1 - y0) / L * 2), ramp5(rm)[3])
                if fest and li == 0:
                    yy, xx = np.mgrid[0:S, 0:S]
                    recolor(c, fm & (np.hypot(xx - x1, yy - y1) < 5), rm, FUR)
        # arco superior
        thick(c, [(23, 15), (16, 7), (7, 4), (3, 6)], 4, ramp(tone, light=0.6, dark=0.45))
        thick(c, [(22, 14), (15, 8), (7, 5)], 1, GOLD if t >= 2 or fest else ramp(tone, light=0.8), sep=False)
    mirror(c)
    # corpo central / broche
    ell(c, (20, 11, 28, 20), GOLD)
    gem(c, 24, 15, 3, m['gem'] if not fest else m['gem'])
    if fest:
        holly(c, 24, 21, 0.6)
    c.glow(24, 15, 10 + 3 * t, tone, 70 if t >= 2 else 50)
    if t >= 2 or fest:
        sparkle(c, 6, 9, True)
        sparkle(c, 41, 30)


def cape(c, m, key, b):
    t = b.get('tier', 1)
    tone = R(m['main'])
    poly(c, [(15, 8), (33, 8), (40, 30), (42, 43), (33, 41), (24, 44), (15, 41), (6, 43), (8, 30)], tone)
    poly(c, [(19, 10), (29, 10), (33, 40), (24, 42), (15, 40)], ramp('#2a1430', dark=0.4), sep=False)
    for x in (12, 36):
        c.line((x, 18), (x + (2 if x > 24 else -3), 40), ramp5(tone)[2])
    # gola
    poly(c, [(12, 5), (36, 5), (34, 12), (14, 12)], GOLD)
    poly(c, [(10, 2), (16, 5), (14, 11)], R(m['main']))
    poly(c, [(38, 2), (32, 5), (34, 11)], R(m['main']))
    gem(c, 24, 9, 3, '#ffd040' if t >= 2 else '#7ae8ff', 'diamond')
    c.glow(24, 9, 9, m['main'], 60)
    sparkle(c, 38, 22, True)


# ---------------------------------------------------------------- joias, anéis, colares
def ring(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    second = key.endswith('ring2')
    band = SILVER if second else GOLD
    c.part(lambda d: (d.ellipse((9, 18, 39, 44), fill=255), d.ellipse((15, 24, 33, 38), fill=0)), band)
    c.line((14, 26), (17, 23), '#ffffff')
    # engaste
    poly(c, [(16, 16), (32, 16), (30, 24), (18, 24)], band)
    if second and fest:
        snowflake(c, 24, 13, 7, '#ffffff')
        gem(c, 24, 13, 3, m['gem'], 'diamond')
    else:
        gem(c, 24, 13, 7 if t >= 2 or fest else 6, m['gem'], 'oval' if not fest else 'round')
        for s in (-1, 1):
            gem(c, 24 + s * 10, 21, 2, m['trim'] if not fest else '#ffffff')
    if fest and not second:
        holly(c, 24, 40, 0.6)
    c.glow(24, 13, 10 + t, m.get('glow') or m['gem'], 55)
    sparkle(c, 33, 7, t >= 3)


def necklace(c, m, key, b):
    t, fest = m['tier'], m.get('festive')
    # corrente em U
    for k in range(17):
        a = math.radians(200 - k * (220 / 16))
        x = 24 + math.cos(a) * 15
        y = 6 - math.sin(a) * 17 * (1 if math.sin(a) < 0 else 0.25)
        y = 4 + (1 - math.cos(math.radians(k * (180 / 16) - 90 + 90)) if False else 0)
    pts = []
    for k in range(19):
        u = -1 + 2 * k / 18
        pts.append((24 + u * 17, 4 + (1 - u * u) * 20))
    for i, (x, y) in enumerate(pts):
        if 0 < i < 18 and abs(x - 24) < 3:
            continue
        ell(c, (x - 1.6, y - 1.3, x + 1.6, y + 1.3), GOLD if i % 2 else R(m['trim']), sep=False)
    # pingente
    if fest:
        poly(c, [(24, 22), (33, 32), (24, 45), (15, 32)], GOLD)
        snowflake(c, 24, 33, 7)
        gem(c, 24, 33, 3, m['gem'])
        holly(c, 24, 24, 0.55)
    else:
        if t >= 3:
            for s in (-1, 1):
                poly(c, [(24, 28), (24 + s * 11, 23), (24 + s * 8, 30), (24 + s * 10, 34), (24, 36)], R(m['trim']))
        poly(c, [(24, 22), (31, 31), (24, 44), (17, 31)], GOLD)
        gem(c, 24, 32, 5, m['gem'], 'oval')
    c.glow(24, 32, 11 + t, m.get('glow') or m['gem'], 60)
    sparkle(c, 33, 26, t >= 3)


def jewel(c, m, key, b):
    col = m['main']
    rm = ramp(col, light=0.55, dark=0.6)
    if 'tear' in key:
        poly(c, [(24, 6), (33, 24), (33, 31), (28, 38), (20, 38), (15, 31), (15, 24)], rm)
        c.line((22, 14), (18, 26), '#ffffff')
    elif 'orb' in key or 'soul_of_wizard' in key:
        ell(c, (11, 10, 37, 36), rm)
        c.part(lambda d: d.arc((14, 13, 34, 33), 200, 260, fill=255, width=2), flat_ramp('#ffffff'), shade=False, sep=False)
        ell(c, (12, 33, 36, 42), GOLD)
    elif 'flame' in key:
        poly(c, [(24, 4), (31, 15), (35, 12), (36, 26), (31, 38), (17, 38), (12, 26), (14, 14), (18, 18)], rm)
        poly(c, [(24, 16), (29, 26), (27, 34), (21, 34), (19, 26)], ramp('#fff0a0'), sep=False)
    elif 'horn' in key:
        thick(c, [(12, 40), (18, 26), (26, 14), (36, 7)], 7, BONE)
        thick(c, [(13, 39), (19, 27)], 6, rm, sep=False)
        poly(c, [(34, 4), (40, 4), (38, 10)], BONE)
    else:
        # brilhante facetado (Bless/Soul/Creation)
        pts = [(16, 8), (32, 8), (40, 18), (24, 42), (8, 18)]
        poly(c, pts, rm)
        hi, base, sh = rm
        poly(c, [(16, 8), (32, 8), (28, 18), (20, 18)], (hi, hi, base), sep=False)
        poly(c, [(8, 18), (20, 18), (24, 42)], (base, base, sh), sep=False)
        poly(c, [(40, 18), (28, 18), (24, 42)], (sh, sh, sh), sep=False)
        poly(c, [(20, 18), (28, 18), (24, 42)], rm, sep=False)
        if 'creation' in key:
            ell(c, (19, 1, 29, 7), GOLD)
        elif 'soul' in key:
            for s in (-1, 1):
                poly(c, [(24 + s * 14, 10), (24 + s * 22, 4), (24 + s * 18, 14)], FUR)
    c.glow(24, 22, 18, col, 70)
    sparkle(c, 15, 10, True)
    sparkle(c, 35, 33)


def flat_ramp(col):
    x = hexc(col)
    return (x, x, x)


def jewel_chaos(c, m, key, b):
    ell(c, (9, 9, 39, 39), GOLD)
    cols = ['#9a4aff', '#ff8a2a', '#ffe08a', '#3a7aff', '#d0302a']
    for k, col in enumerate(cols):
        a0 = k * 72 - 90
        a1 = a0 + 72
        pts = [(24, 24)] + [(24 + math.cos(math.radians(a)) * 12, 24 + math.sin(math.radians(a)) * 12) for a in range(a0, a1 + 1, 12)]
        poly(c, pts, ramp(col, light=0.5), sep=False)
    gem(c, 24, 24, 4, '#ffffff')
    c.glow(24, 24, 18, '#ff8a2a', 60)
    sparkle(c, 12, 12, True)


def box(c, m, key, b):
    tone = R(m['main'])
    t = b.get('tier', 1)
    # tampa
    poly(c, [(8, 17), (12, 9), (36, 9), (40, 17)], tone)
    rect(c, (8, 17, 40, 41), tone)
    for x in (12, 36):
        rect(c, (x - 2, 9, x + 2, 41), GOLD if t >= 2 else STEEL, sep=False)
    rect(c, (8, 17, 40, 20), GOLD if t >= 2 else STEEL, sep=False)
    rect(c, (8, 38, 40, 41), GOLD if t >= 2 else STEEL, sep=False)
    rect(c, (20, 18, 28, 28), GOLD)
    ell(c, (22, 21, 26, 25), DARK, sep=False)
    c.px(24, 25, '#141020'); c.px(24, 26, '#141020')
    if t >= 2:
        c.glow(24, 16, 16, m['main'], 60)
        sparkle(c, 38, 8, True)
    if t >= 3:
        sparkle(c, 9, 30)


def eye(c, m, key, b):
    ell(c, (6, 12, 42, 36), ramp('#5a1a24', dark=0.5))
    ell(c, (9, 14, 39, 34), ramp('#f4ece0'))
    for (x1, y1, x2, y2) in ((10, 22, 15, 21), (38, 26, 33, 25), (12, 30, 16, 27)):
        c.line((x1, y1), (x2, y2), '#d04040')
    ell(c, (16, 15, 32, 33), ramp(m['main'], light=0.5, dark=0.55))
    ell(c, (21, 18, 27, 30), DARK, sep=False)
    c.px(19, 18, '#ffffff'); c.px(20, 18, '#ffffff'); c.px(19, 19, '#ffffff')
    c.glow(24, 24, 18, m['main'], 55)


def key_icon(c, m, key, b):
    tone = m['main']
    c.part(lambda d: (d.ellipse((6, 6, 22, 22), fill=255), d.ellipse((10, 10, 18, 18), fill=0)), GOLD)
    thick(c, [(18, 18), (40, 40)], 4, GOLD)
    for (u, l) in ((32, 6), (37, 4)):
        thick(c, [(u, u), (u + l * 0.7, u - l * 0.7)], 3, GOLD)
    gem(c, 14, 14, 2, tone)
    for p in ((6, 14), (14, 6)):
        ell(c, (p[0] - 2.5, p[1] - 2.5, p[0] + 2.5, p[1] + 2.5), R(tone), sep=False)
    c.glow(14, 14, 12, tone, 60)
    sparkle(c, 30, 12)


def scroll(c, m, key, b):
    tone = m['main']
    poly(c, [(12, 10), (36, 10), (36, 38), (12, 38)], CREAM)
    for y in range(15, 34, 4):
        c.line((16, y), (32 - (y % 8), y), ramp5(CREAM)[2])
    for y in (8, 38):
        ell(c, (8, y - 3, 40, y + 3), ramp('#c8a070'))
        for x in (8, 40):
            ell(c, (x - 3, y - 3, x + 3, y + 3), R(tone), sep=False)
    # selo de cera + fita
    thick(c, [(26, 30), (24, 44)], 3, R(tone))
    thick(c, [(30, 30), (33, 44)], 3, R(tone))
    ell(c, (23, 25, 33, 35), R(tone))
    c.px(27, 28, '#ffffff')
    c.glow(28, 30, 12, tone, 55)


def feather(c, m, key, b):
    tone = m['main']
    A = Axis(12, 38, -55)
    vane = []
    for u in range(0, 33, 3):
        w = 7 * math.sin(math.pi * min(1, u / 32 + 0.05))
        vane.append((u, -w))
    back = [(u, w * 0.8) for u, w in [(u, -v) for u, v in reversed(vane)]]
    poly(c, A.pts(vane + back), ramp(tone, light=0.55, dark=0.5))
    for u in range(6, 30, 4):
        c.line(A(u, 0), A(u + 3, -5), ramp5(ramp(tone, light=0.55, dark=0.5))[0])
    thick(c, A.pts([(-6, 0), (32, 0)]), 1, CREAM, sep=False)
    c.glow(*A(16), 16, tone, 65)
    sparkle(c, *map(round, A(30, -6)), True)


def guard(c, m, key, b):
    armor(c, dict(main='#c89a2e', trim='#fff0a0', gem='#ff4a4a', tier=3), 'guard_armor', b)


def potion(c, col):
    poly(c, [(19, 4), (29, 4), (29, 8), (19, 8)], WOOD)
    rect(c, (20, 8, 28, 14), ramp('#c8dcf0', '#ffffff', '#5a6a8a'))
    ell(c, (9, 12, 39, 44), ramp('#c8dcf0', '#ffffff', '#5a6a8a'))
    ell(c, (11, 20, 37, 42), ramp(col, light=0.55, dark=0.55), sep=False)
    c.line((14, 18), (14, 30), '#ffffff')
    c.px(15, 17, '#ffffff')
    rect(c, (17, 13, 31, 15), GOLD, sep=False)
    c.glow(24, 30, 18, col, 55)
    sparkle(c, 33, 22)


DRAW = {'sword': sword, 'bow': bow, 'staff': staff, 'scepter': scepter, 'book': book, 'shield': shield,
        'helm': helm, 'armor': armor, 'pants': pants, 'gloves': gloves, 'boots': boots, 'wings': wings, 'cape': cape,
        'ring': ring, 'necklace': necklace, 'jewel': jewel, 'jewel_chaos': jewel_chaos, 'box': box, 'eye': eye,
        'key': key_icon, 'scroll': scroll, 'feather': feather, 'guard': guard}


def render(key, b):
    c = IC(S, S)
    icon = b.get('icon')
    if key.startswith('@potion'):
        potion(c, '#e0283a' if 'hp' in key else '#3a7aff')
    else:
        DRAW[icon](c, mat_for(key, b), key, b)
    glows, c.glows = c.glows, []
    c.outline()
    c.glows = glows
    c.apply_glows()
    return c.image()


def load_bases():
    js = "const g=require('./server/gamedata.js');process.stdout.write(JSON.stringify(g.ITEM_BASES))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))


def main():
    bases = load_bases()
    keys = [k for k, b in bases.items() if b.get('icon') in DRAW]
    # ícone genérico por tipo (itens sem base conhecida, loja, drops)
    generic = {}
    for k in keys:
        generic.setdefault(bases[k]['icon'], k)
    extra = {'@potion_hp': {'icon': 'potion_hp'}, '@potion_mp': {'icon': 'potion_mp'}}
    order = keys + list(extra)
    rows = (len(order) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * S, rows * S), (0, 0, 0, 0))
    index = {}
    for i, k in enumerate(order):
        img = render(k, bases.get(k) or extra[k])
        atlas.paste(img, ((i % COLS) * S, (i // COLS) * S))
        index[k] = i
    for ic, k in generic.items():
        index['@' + ic] = index[k]
    index['@potion_hp'] = index['@potion_hp']
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'items.png'), optimize=True)
    with open(os.path.join(OUT, 'items.json'), 'w') as f:
        json.dump({'size': S, 'cols': COLS, 'index': index}, f, separators=(',', ':'))
    print('ok:', len(order), 'ícones,', atlas.size)


if __name__ == '__main__':
    main()
