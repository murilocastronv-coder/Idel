"""Efeitos de magia: projéteis, impactos, explosões em área, meia-lua de espada e cura."""
import math
import numpy as np
from pixelkit import Canvas, ramp, flat, hexc, quad, at

FX_COLORS = {
    'fire': ('#ff4d1f', '#ffb02e', '#fff2a8'),
    'ice': ('#3a9aff', '#9ae4ff', '#ffffff'),
    'energy': ('#2a6aff', '#59c7ff', '#e8faff'),
    'arrow': ('#3aa82a', '#7aff6a', '#e8ffe0'),
    'dark': ('#6a1aa8', '#c06bff', '#f0d8ff'),
    'spirit': ('#c02a8a', '#ff7ad9', '#ffe0f4'),
    'lightning': ('#a89a1a', '#ffff6a', '#ffffff'),
    'holy': ('#2aa86a', '#9affd0', '#ffffff'),
    'blood': ('#a81a1a', '#ff5a4a', '#ffd0c8'),
}


def _orb(c, cx, cy, r, cols, flick):
    d, m, l = cols
    c.part(lambda dr: dr.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=255), flat(d), shade=False, sep=False)
    c.part(lambda dr: dr.ellipse([cx - r + 0.5, cy - r + 0.5, cx + r - 0.5, cy + r - 0.5], fill=255), flat(m), shade=False, sep=False)
    c.part(lambda dr: dr.ellipse([cx - r / 2 - flick, cy - r / 2 - 1, cx + r / 3, cy + r / 3 - 1], fill=255), flat(l), shade=False, sep=False)


def projectile(kind, i):
    """24x24, voando para a direita."""
    c = Canvas(24, 24)
    cols = FX_COLORS.get(kind, FX_COLORS['energy'])
    if kind == 'arrow':
        c.line((2, 12), (17, 12), '#d8c8a8')
        c.part(lambda d: d.polygon([(2, 9), (6, 12), (2, 15)], fill=255), flat('#efe4c8'), shade=False, sep=False)
        c.part(lambda d: d.polygon([(16, 9), (22, 12), (16, 15)], fill=255), flat(cols[1]), shade=False, sep=False)
        for k in range(3):
            c.px(4 + k * 4 - i % 2, 12 + (1 if k % 2 else -1), cols[1])
        c.outline('#0e0a12')
        c.glow(19, 12, 4, cols[1], 120)
    elif kind == 'ice':
        c.part(lambda d: d.polygon([(4, 12), (12, 8), (21, 12), (12, 16)], fill=255), ramp(cols[1], cols[2], cols[0]), sep=False)
        for k in range(3):
            c.px(2 + k * 2, 12 + ((i + k) % 3) - 1, cols[2])
        c.outline('#0e1a2a')
        c.glow(13, 12, 7, cols[1], 90)
    else:
        r = 5 + (i % 2)
        for k in range(4):  # rastro
            c.px(4 - k + (i % 2), 12 + ((i + k) % 3) - 1, cols[1])
            c.px(7 - k, 11 + ((i + k * 2) % 3), cols[0])
        _orb(c, 14, 12, r, cols, i % 2)
        if kind in ('fire', 'dark', 'spirit'):
            for k in range(3):
                a = (i * 40 + k * 120) % 360
                p = at((14, 12), a, r + 2)
                c.px(p[0], p[1], cols[1])
        c.outline('#0e0a12')
        c.glow(14, 12, 10, cols[1], 80)
    c.apply_glows()
    return c


def impact(kind, i):
    """32x32, 4 quadros: estrela de impacto."""
    c = Canvas(32, 32)
    cols = FX_COLORS.get(kind, FX_COLORS['energy'])
    r = [4, 8, 11, 13][i]
    rays = 8
    for k in range(rays):
        a = k * 360 / rays + i * 10
        p1 = at((16, 16), a, r * 0.35)
        p2 = at((16, 16), a, r)
        w = [3, 3, 2, 1][i]
        col = cols[1] if k % 2 == 0 else cols[2]
        c.part(lambda d, p1=p1, p2=p2, w=w: d.polygon(quad(p1, p2, w, 1), fill=255), flat(col), shade=False, sep=False)
    if i < 3:
        rr = [4, 4, 2][i]
        _orb(c, 16, 16, rr, cols, 0)
    c.apply_glows()
    return c


def burst(kind, i):
    """64x64, 6 quadros: explosão em área (anel + pilares de energia)."""
    c = Canvas(64, 64)
    cols = FX_COLORS.get(kind, FX_COLORS['fire'])
    p = i / 5
    rx, ry = 6 + p * 24, 3 + p * 10
    cy = 48
    th = max(1, int(4 - p * 3))
    c.part(lambda d: d.ellipse([32 - rx, cy - ry, 32 + rx, cy + ry], outline=255, width=th), flat(cols[1]), shade=False, sep=False)
    if i < 5:
        c.part(lambda d: d.ellipse([32 - rx * 0.6, cy - ry * 0.6, 32 + rx * 0.6, cy + ry * 0.6], outline=255, width=1), flat(cols[2]), shade=False, sep=False)
    # pilares/estilhaços subindo
    rng = np.random.RandomState(7 + len(kind))
    for k in range(9):
        a = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(0.3, 1.0) * rx
        x = 32 + math.cos(a) * dist
        y = cy + math.sin(a) * dist * (ry / max(rx, 1))
        h = (1 - abs(p - 0.4)) * rng.uniform(10, 30)
        if h <= 2:
            continue
        col = cols[k % 3]
        c.part(lambda d, x=x, y=y, h=h: d.polygon([(x - 2, y), (x, y - h), (x + 2, y)], fill=255), flat(col), shade=False, sep=False)
    if i < 3:
        _orb(c, 32, cy - 6 - i * 4, 7 - i, cols, 0)
    c.apply_glows()
    return c


def crescent(kind, i):
    """48x48, 4 quadros: meia-lua do golpe de espada (para a direita)."""
    c = Canvas(48, 48)
    cols = FX_COLORS.get(kind, FX_COLORS['energy'])
    start = -80 + i * 20
    span = 120
    r_out, r_in = 18 + i, 12 + i * 2
    pts = []
    for k in range(13):
        a = math.radians(start + span * k / 12)
        pts.append((20 + math.cos(a) * r_out, 24 + math.sin(a) * r_out))
    for k in range(12, -1, -1):
        a = math.radians(start + span * k / 12)
        pts.append((14 + math.cos(a) * r_in, 24 + math.sin(a) * r_in))
    if i < 4:
        c.part(lambda d: d.polygon(pts, fill=255), ramp(cols[1], cols[2], cols[0]), sep=False)
    c.glow(30, 24, 14, cols[1], 60 if i < 3 else 30)
    c.apply_glows()
    return c


def heal(kind, i):
    c = Canvas(32, 32)
    cols = FX_COLORS['holy']
    for k, (x, y0) in enumerate([(8, 26), (16, 22), (24, 27)]):
        y = y0 - i * 4 - k
        if y < 3:
            continue
        c.part(lambda d, x=x, y=y: d.rectangle([x - 1, y - 3, x + 1, y + 3], fill=255), flat(cols[1]), shade=False, sep=False)
        c.part(lambda d, x=x, y=y: d.rectangle([x - 3, y - 1, x + 3, y + 1], fill=255), flat(cols[1]), shade=False, sep=False)
        c.px(x, y, cols[2])
    c.apply_glows()
    return c
