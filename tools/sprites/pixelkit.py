"""Ferramentas de desenho de pixel art: partes com sombreamento automático, contorno e brilho."""
import math
import numpy as np
from PIL import Image, ImageDraw


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c, t, f):
    return tuple(int(round(c[i] + (t[i] - c[i]) * f)) for i in range(3))


def ramp(base, hi=None, sh=None, light=0.38, dark=0.45):
    """(realce, base, sombra) a partir da cor base."""
    b = hexc(base)[:3]
    h = hexc(hi)[:3] if hi else mix(b, (255, 250, 230), light)
    s = hexc(sh)[:3] if sh else mix(b, (18, 10, 40), dark)
    return (h + (255,), b + (255,), s + (255,))


def flat(color):
    c = hexc(color)
    return (c, c, c)


def rot(p, ang, o=(0, 0)):
    a = math.radians(ang)
    x, y = p[0], p[1]
    return (o[0] + x * math.cos(a) - y * math.sin(a), o[1] + x * math.sin(a) + y * math.cos(a))


def at(p, ang, dist):
    a = math.radians(ang)
    return (p[0] + math.cos(a) * dist, p[1] + math.sin(a) * dist)


def quad(p1, p2, w1, w2=None):
    """Polígono de um membro entre p1 e p2 com larguras w1 e w2."""
    if w2 is None:
        w2 = w1
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    return [(p1[0] + nx * w1 / 2, p1[1] + ny * w1 / 2), (p2[0] + nx * w2 / 2, p2[1] + ny * w2 / 2),
            (p2[0] - nx * w2 / 2, p2[1] - ny * w2 / 2), (p1[0] - nx * w1 / 2, p1[1] - ny * w1 / 2)]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = np.zeros((h, w, 4), np.uint8)
        self.glows = []

    def _mask(self, fn):
        m = Image.new('L', (self.w, self.h), 0)
        fn(ImageDraw.Draw(m))
        return np.array(m) > 0

    def part(self, fn, rmp, shade=True, sep=True, sep_k=0.55):
        """Desenha uma parte com 3 tons (luz vinda de cima/esquerda) e separa das partes de trás."""
        mask = self._mask(fn)
        if not mask.any():
            return mask
        hi, base, sh = rmp
        if sep:
            ring = self._dilate(mask) & ~mask & (self.img[:, :, 3] > 0)
            self.img[ring, :3] = (self.img[ring, :3] * sep_k).astype(np.uint8)
        col = np.zeros((self.h, self.w, 4), np.uint8)
        col[mask] = base
        if shade:
            up = np.zeros_like(mask); up[1:, :] = mask[:-1, :]
            left = np.zeros_like(mask); left[:, 1:] = mask[:, :-1]
            down = np.zeros_like(mask); down[:-1, :] = mask[1:, :]
            right = np.zeros_like(mask); right[:, :-1] = mask[:, 1:]
            right2 = np.zeros_like(mask); right2[:, :-2] = mask[:, 2:]
            down2 = np.zeros_like(mask); down2[:-2, :] = mask[2:, :]
            hil = mask & (~up | ~left)
            shd = mask & (~down | ~right | (~right2 & ~down2))
            col[shd] = sh
            col[hil & ~shd] = hi
        self.img[mask] = col[mask]
        return mask

    def px(self, x, y, color):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.img[y, x] = hexc(color) if isinstance(color, str) else color

    def line(self, p1, p2, color, width=1):
        self.part(lambda d: d.line([p1, p2], fill=255, width=width), flat(color), shade=False, sep=False)

    @staticmethod
    def _dilate(m):
        n = m.copy()
        n[1:, :] |= m[:-1, :]; n[:-1, :] |= m[1:, :]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]
        return n

    def outline(self, color='#0e0a12'):
        a = self.img[:, :, 3] > 0
        o = self._dilate(a) & ~a
        self.img[o] = hexc(color)

    def glow(self, cx, cy, r, color, strength=110):
        self.glows.append((cx, cy, r, hexc(color)[:3], strength))

    def apply_glows(self):
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        for cx, cy, r, c, s in self.glows:
            d = np.hypot(xx - cx, yy - cy)
            for rr, alpha in ((r, s * 0.45), (r * 0.62, s * 0.8)):
                ring = (d <= rr)
                empty = self.img[:, :, 3] < alpha
                sel = ring & empty
                self.img[sel] = c + (int(alpha),)
        self.glows = []

    def image(self):
        return Image.fromarray(self.img, 'RGBA')
