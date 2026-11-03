"""Vistas de frente e de costas dos heróis (parado de frente, andando para baixo/cima).
Usa a mesma escala, pivô e paletas da vista de lado; cada classe e cada conjunto de armadura
tem a sua versão simétrica. As ações são 'idle_front', 'walk_front' e 'walk_back'."""
import math
from pixelkit import Canvas, ramp, flat, quad, at
import heroes
from heroes import BUILD, FW, FH, FOOT_Y, GOLD, SILVER, SKIN, K, gem, hair_ramp

VIEW_ACTIONS = {'idle_front': ('idle', 'front'), 'walk_front': ('walk', 'front'), 'walk_back': ('walk', 'back'), 'idle_back': ('idle', 'back')}


def split(action):
    return VIEW_ACTIONS.get(action, (action, 'side'))


class FrontBody:
    """Articulações de frente/costas. 'r' = lado direito do personagem (à esquerda de quem olha, de frente)."""

    def __init__(self, base_action, i, view):
        b = BUILD
        self.b = b
        self.view = view
        n = heroes.FRAMES[base_action]
        ph = i / n * 2 * math.pi
        walk = base_action == 'walk'
        bob = (0.5 - 0.5 * math.cos(ph)) if not walk else (0.5 + 0.5 * math.cos(2 * ph))
        self.ph = ph
        cx = b['cx']
        self.cx = cx
        self.top = b['torso_top'] + bob
        self.hip_y = b['hip_y'] + bob * 0.5
        hr = b['head']
        self.head = (cx, self.top - hr - 3 + (0.4 * math.sin(ph) if not walk else 0))
        sw = 7
        self.sh_r = (cx - sw, self.top + 3)
        self.sh_l = (cx + sw, self.top + 3)
        lift_r = max(0.0, math.sin(ph)) * 3.0 if walk else 0.0
        lift_l = max(0.0, -math.sin(ph)) * 3.0 if walk else 0.0
        self.lift = (lift_r, lift_l)
        self.hip_r = (cx - 3, self.hip_y)
        self.hip_l = (cx + 3, self.hip_y)
        self.foot_r = (cx - 4, FOOT_Y - lift_r)
        self.foot_l = (cx + 4, FOOT_Y - lift_l)
        # braços: pendem ao lado do corpo e balançam ao andar (de frente, o balanço aparece como subir/descer a mão)
        sw_r = math.sin(ph) * 1.6 if walk else 0.4 * math.sin(ph)
        breathe = 0 if walk else 0.6 - 0.6 * math.cos(ph)
        self.el_r = (self.sh_r[0] - 2, self.sh_r[1] + 8 - sw_r * 0.4)
        self.ha_r = (self.sh_r[0] - 2.5 + breathe * 0.3, self.sh_r[1] + 15 - sw_r)
        self.el_l = (self.sh_l[0] + 2, self.sh_l[1] + 8 + sw_r * 0.4)
        self.ha_l = (self.sh_l[0] + 2.5 - breathe * 0.3, self.sh_l[1] + 15 + sw_r)
        # mão que segura a arma: direita do personagem (de frente fica à esquerda; de costas, à direita)
        if view == 'back':
            self.weapon_hand = self.ha_l
        else:
            self.weapon_hand = self.ha_r


# ---------------------------------------------------------------- partes simétricas
def leg(c, hip, foot, r, w=6):
    knee = ((hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2)
    c.part(lambda d: d.polygon(quad(hip, knee, w + 1, w), fill=255), r)
    c.part(lambda d: d.polygon(quad(knee, (foot[0], foot[1] - 4), w, w - 1), fill=255), r)
    return knee


def boot_shape(c, foot, r, h=5, w=7):
    fx, fy = foot
    c.part(lambda d: d.polygon([(fx - w / 2, fy - h), (fx + w / 2, fy - h), (fx + w / 2 + 0.5, fy - 1), (fx + w / 2 - 1, fy), (fx - w / 2 + 1, fy), (fx - w / 2 - 0.5, fy - 1)], fill=255), r)


def arm(c, sh, el, ha, sleeve, hand, w=5):
    c.part(lambda d: d.polygon(quad(sh, el, w + 1, w), fill=255), sleeve)
    c.part(lambda d: d.polygon(quad(el, ha, w, w - 1), fill=255), sleeve)
    c.part(lambda d: d.ellipse([ha[0] - 2.5, ha[1] - 2.5, ha[0] + 2.5, ha[1] + 2.5], fill=255), hand)


def torso(c, B, r, sw=8, ww=6, dy=0):
    t, hy, cx = B.top + dy, B.hip_y, B.cx
    pts = [(cx - sw, t + 1), (cx - sw + 3, t - 1), (cx + sw - 3, t - 1), (cx + sw, t + 1),
           (cx + ww + 1, hy - 5), (cx + ww, hy + 1), (cx - ww, hy + 1), (cx - ww - 1, hy - 5)]
    c.part(lambda d: d.polygon(pts, fill=255), r)


def pads(c, B, r, trim=GOLD, spikes=0, size=5):
    for sx, sy, sgn in ((B.sh_r[0] - 1, B.sh_r[1], -1), (B.sh_l[0] + 1, B.sh_l[1], 1)):
        c.part(lambda d, sx=sx, sy=sy: d.ellipse([sx - size, sy - size + 1, sx + size, sy + size - 1], fill=255), r)
        c.part(lambda d, sx=sx, sy=sy: d.arc([sx - size, sy - size + 1, sx + size, sy + size - 1], 200, 340, fill=255, width=2), trim, sep=False)
        for k in range(spikes):
            bx = sx + sgn * (k * 3 - 1)
            c.part(lambda d, bx=bx, sy=sy: d.polygon([(bx - 1.5, sy - size + 2), (bx + sgn * 1.5, sy - size - 4 - k), (bx + 1.5, sy - size + 2)], fill=255), trim, sep=False)


def face_skin(c, B, r=None):
    hx, hy = B.head
    hr = BUILD['head']
    c.part(lambda d: d.rounded_rectangle([hx - hr, hy - hr, hx + hr, hy + hr + 1], radius=int(hr * 0.75), fill=255), r or SKIN)
    c.part(lambda d: d.rectangle([hx - 2, hy + hr - 1, hx + 2, hy + hr + 3], fill=255), r or SKIN, sep=False)


def face(c, B, color='#1a1426', glow=None, cheeks=True, mouth=True, dy=0):
    """Rosto de frente: dois olhos grandes, bochechas e boca."""
    hx, hy = B.head
    y0 = hy + dy * K
    for ex in (hx - 4.5, hx + 2):
        c.part(lambda d, ex=ex: d.rectangle([ex, y0 - 1, ex + 2, y0 + 3], fill=255), flat(color), shade=False, sep=False)
        c.px(ex, y0 - 1, '#ffffff')
        c.px(ex + 2, y0 + 2, glow or '#6a8aff')
    if glow:
        c.glow(hx, y0 + 1, 6, glow, 70)
    if cheeks:
        c.px(hx - 6, hy + 5, '#f08a8a'); c.px(hx + 6, hy + 5, '#f08a8a')
    if mouth:
        c.px(hx - 0.5, y0 + 6, '#7a3a3a'); c.px(hx + 0.5, y0 + 6, '#7a3a3a')


def sym(pts, cx):
    """Polígono simétrico: recebe a metade esquerda (de cima para baixo) e espelha."""
    return pts + [(2 * cx - x, y) for x, y in reversed(pts)]


# ---------------------------------------------------------------- capacete de cada classe (sem equipamento)
def dk_helm(c, B, ARM, view):
    hx, hy = B.head
    dome = sym([(hx, hy - 8 * K), (hx - 4 * K, hy - 7.5 * K), (hx - 7.5 * K, hy - 3 * K), (hx - 7 * K, hy + 5 * K), (hx - 3 * K, hy + 7 * K)], hx)
    c.part(lambda d: d.polygon(dome, fill=255), ARM)
    for s in (-1, 1):
        horn = [(hx + s * 5 * K, hy - 4 * K), (hx + s * 10 * K, hy - 9 * K), (hx + s * 9 * K, hy - 15 * K), (hx + s * 7 * K, hy - 10 * K), (hx + s * 3 * K, hy - 7 * K)]
        c.part(lambda d, horn=horn: d.polygon(horn, fill=255), GOLD, sep=False)
    c.part(lambda d: d.polygon([(hx - 1.5 * K, hy - 7.5 * K), (hx, hy - 10 * K), (hx + 1.5 * K, hy - 7.5 * K)], fill=255), GOLD, sep=False)
    if view == 'front':
        c.part(lambda d: d.polygon(sym([(hx, hy - 2 * K), (hx - 5.5 * K, hy - 1.5 * K), (hx - 5.5 * K, hy + 4 * K), (hx - 2 * K, hy + 6 * K)], hx), fill=255), ramp('#4a5480', '#6a78a8', '#262c4a'))
        c.part(lambda d: d.line([(hx - 5 * K, hy + 1 * K), (hx + 5 * K, hy + 1 * K)], fill=255, width=1), flat('#0e0a12'), shade=False, sep=False)
        c.part(lambda d: d.line([(hx, hy + 1 * K), (hx, hy + 5 * K)], fill=255, width=1), flat('#0e0a12'), shade=False, sep=False)
        c.px(hx - 3 * K, hy + 1 * K, '#9ae4ff'); c.px(hx + 3 * K, hy + 1 * K, '#9ae4ff')
    else:
        c.part(lambda d: d.line([(hx, hy - 7 * K), (hx, hy + 6 * K)], fill=255, width=1), GOLD, shade=False, sep=False)


def draw_hero_view(cls, base_action, view, i, hair=None, layer='full'):
    """Herói de frente/costas. layer: 'full' (com arma padrão), 'back' (corpo inteiro, sem arma) ou 'front' (vazio)."""
    real = Canvas(FW, FH)
    if layer == 'front':
        return real
    c = real
    full = layer == 'full'
    B = FrontBody(base_action, i, view)
    hx, hy = B.head
    front = view == 'front'
    t = B.top

    if cls == 'dark_knight':
        ARM = ramp('#343c62', '#56628e', '#1a1e38')
        LEG = ramp('#2a3150', '#4a5478', '#161a30')
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            k = leg(c, hip, foot, LEG)
            c.part(lambda d, k=k: d.ellipse([k[0] - 2.5, k[1] - 2.5, k[0] + 2.5, k[1] + 2.5], fill=255), GOLD, sep=False)
            boot_shape(c, foot, ramp('#24283e'))
        arm(c, B.sh_r, B.el_r, B.ha_r, ARM, ramp('#2a2e44'))
        arm(c, B.sh_l, B.el_l, B.ha_l, ARM, ramp('#2a2e44'))
        torso(c, B, ARM)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 5, t + 2), (B.cx, t + 12), (B.cx + 5, t + 2), (B.cx + 3, t + 2), (B.cx, t + 8), (B.cx - 3, t + 2)], fill=255), GOLD, sep=False)
            gem(c, B.cx, t + 12, '#5ac8ff')
        else:
            c.part(lambda d: d.line([(B.cx, t + 1), (B.cx, B.hip_y - 4)], fill=255, width=2), GOLD, shade=False, sep=False)
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), GOLD)
        c.part(lambda d: d.polygon([(B.cx - 7, B.hip_y - 1), (B.cx + 7, B.hip_y - 1), (B.cx + 8, B.hip_y + 6), (B.cx - 8, B.hip_y + 6)], fill=255), LEG)
        dk_helm(c, B, ARM, view)
        pads(c, B, ARM, spikes=2)
        if full:
            weapon(cls, 'default_dk', c, B, view, base_action, i)

    elif cls == 'dark_wizard':
        ROBE = ramp('#2a4fa8', '#5a86e0', '#162c66')
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            leg(c, hip, foot, ROBE)
            boot_shape(c, foot, ramp('#1d1430'))
        arm(c, B.sh_r, B.el_r, B.ha_r, ROBE, SKIN)
        arm(c, B.sh_l, B.el_l, B.ha_l, ROBE, SKIN)
        sway = math.sin(B.ph) * 1.2 if base_action == 'walk' else 0
        robe = [(B.cx - 7, t + 1), (B.cx + 7, t + 1), (B.cx + 11 + sway, FOOT_Y - 3), (B.cx - 11 + sway, FOOT_Y - 3)]
        c.part(lambda d: d.polygon(robe, fill=255), ROBE)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 1.5, t + 3), (B.cx + 1.5, t + 3), (B.cx + 2.5, FOOT_Y - 3), (B.cx - 2.5, FOOT_Y - 3)], fill=255), GOLD, sep=False)
            gem(c, B.cx, B.hip_y - 3, '#5ac8ff')
        c.part(lambda d: d.line([(B.cx - 11 + sway, FOOT_Y - 3), (B.cx + 11 + sway, FOOT_Y - 3)], fill=255, width=2), GOLD, sep=False)
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 4, B.cx + 7, B.hip_y - 2], fill=255), GOLD, sep=False)
        if front:
            face_skin(c, B)
            hood = [(hx, hy - 12 * K), (hx - 4 * K, hy - 9 * K), (hx - 8 * K, hy - 2 * K), (hx - 8 * K, hy + 7 * K), (hx - 5 * K, hy + 7 * K), (hx - 6 * K, hy - 1 * K), (hx - 3 * K, hy - 4 * K)]
            c.part(lambda d: d.polygon(sym(hood, hx), fill=255), ROBE)
            c.part(lambda d: d.line([(hx - 4 * K, hy - 9 * K), (hx, hy - 12 * K), (hx + 4 * K, hy - 9 * K)], fill=255, width=1), GOLD, sep=False)
            face(c, B, glow='#7ad0ff', mouth=False)
            c.part(lambda d: d.polygon([(hx - 3 * K, hy + 4 * K), (hx + 3 * K, hy + 4 * K), (hx, hy + 8 * K)], fill=255), ramp('#d8d8e8'), sep=False)
        else:
            hood = [(hx, hy - 12 * K), (hx - 4 * K, hy - 9 * K), (hx - 8 * K, hy - 2 * K), (hx - 8 * K, hy + 7 * K), (hx - 3 * K, hy + 9 * K)]
            c.part(lambda d: d.polygon(sym(hood, hx), fill=255), ROBE)
            c.part(lambda d: d.line([(hx, hy - 11 * K), (hx, hy + 8 * K)], fill=255, width=1), GOLD, shade=False, sep=False)
        pads(c, B, ROBE, size=4)
        if full:
            weapon(cls, 'thunder_staff', c, B, view, base_action, i)

    elif cls == 'fairy_elf':
        HAIR = hair_ramp(hair or '#f2d36b')
        GRN = ramp('#3f8a3a', '#7ac85a', '#1e4a1e')
        if front:   # cabelo comprido atrás dos ombros
            c.part(lambda d: d.polygon(sym([(hx, hy - 6 * K), (hx - 8 * K, hy - 3 * K), (hx - 10 * K, hy + 9), (hx - 9 * K, hy + 20), (hx - 4 * K, hy + 16)], hx), fill=255), HAIR)
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            leg(c, hip, foot, SKIN, w=5)
            boot_shape(c, foot, GRN, h=7)
        arm(c, B.sh_r, B.el_r, B.ha_r, SKIN, GRN, w=4)
        arm(c, B.sh_l, B.el_l, B.ha_l, SKIN, GRN, w=4)
        torso(c, B, GRN, sw=7, ww=5)
        c.part(lambda d: d.polygon([(B.cx - 6, B.hip_y - 2), (B.cx + 6, B.hip_y - 2), (B.cx + 9, B.hip_y + 7), (B.cx + 3, B.hip_y + 5), (B.cx, B.hip_y + 8), (B.cx - 3, B.hip_y + 5), (B.cx - 9, B.hip_y + 7)], fill=255), GRN)
        c.part(lambda d: d.rectangle([B.cx - 6, B.hip_y - 4, B.cx + 6, B.hip_y - 2], fill=255), GOLD, sep=False)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 4, t + 1), (B.cx, t + 6), (B.cx + 4, t + 1)], fill=255), GOLD, sep=False)
        face_skin(c, B)
        for s in (-1, 1):   # orelhas pontudas
            c.part(lambda d, s=s: d.polygon([(hx + s * 6 * K, hy - 1 * K), (hx + s * 11 * K, hy - 5 * K), (hx + s * 6.5 * K, hy + 2 * K)], fill=255), SKIN, sep=False)
        if front:
            bangs = [(hx, hy - 8.5 * K), (hx - 4 * K, hy - 8 * K), (hx - 7.5 * K, hy - 4 * K), (hx - 7.5 * K, hy + 3 * K), (hx - 5.5 * K, hy - 1 * K), (hx - 3 * K, hy - 3.5 * K), (hx - 1 * K, hy - 2 * K)]
            c.part(lambda d: d.polygon(sym(bangs, hx), fill=255), HAIR)
            face(c, B, color='#2a6a2a')
        else:
            c.part(lambda d: d.polygon(sym([(hx, hy - 9 * K), (hx - 5 * K, hy - 8 * K), (hx - 7.5 * K, hy - 3 * K), (hx - 7 * K, hy + 6 * K), (hx - 4.5 * K, hy + 20), (hx - 1.5 * K, hy + 22)], hx), fill=255), HAIR)
            for k in (-3, 0, 3):
                c.part(lambda d, k=k: d.line([(hx + k * K, hy - 7 * K), (hx + k * 1.3 * K, hy + 20)], fill=255, width=1), HAIR, shade=False, sep=False)
        c.part(lambda d: d.line([(hx - 6 * K, hy - 6 * K), (hx + 6 * K, hy - 6 * K)], fill=255, width=1), GOLD, sep=False)
        if front:
            gem(c, hx, hy - 6 * K, '#7aff6a')
        pads(c, B, GRN, size=4)
        if full:
            weapon(cls, 'default_elf', c, B, view, base_action, i)

    elif cls == 'magic_gladiator':
        AR = ramp('#6a6aa8', '#b0b0e0', '#33335e')
        TRIM = ramp('#a8b8ff', '#ffffff', '#5a6aa8')
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            k = leg(c, hip, foot, AR)
            c.part(lambda d, k=k: d.ellipse([k[0] - 2.5, k[1] - 2.5, k[0] + 2.5, k[1] + 2.5], fill=255), TRIM, sep=False)
            boot_shape(c, foot, ramp('#2a2a48'))
        arm(c, B.sh_r, B.el_r, B.ha_r, AR, ramp('#2a2a48'))
        arm(c, B.sh_l, B.el_l, B.ha_l, AR, ramp('#2a2a48'))
        torso(c, B, AR)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 6, t + 2), (B.cx, t + 9), (B.cx + 6, t + 2), (B.cx, t + 14)], fill=255), ramp('#4a3a8a'), sep=False)
            gem(c, B.cx, t + 8, '#c06bff')
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), TRIM)
        c.part(lambda d: d.polygon([(B.cx - 7, B.hip_y - 1), (B.cx + 7, B.hip_y - 1), (B.cx + 9, B.hip_y + 7), (B.cx - 9, B.hip_y + 7)], fill=255), ramp('#4a3a8a'))
        face_skin(c, B)
        if front:
            c.part(lambda d: d.polygon(sym([(hx, hy - 8.5 * K), (hx - 5 * K, hy - 7.5 * K), (hx - 8 * K, hy - 3 * K), (hx - 8 * K, hy + 4 * K), (hx - 6 * K, hy + 4 * K), (hx - 6 * K, hy - 2 * K), (hx - 2 * K, hy - 3 * K)], hx), fill=255), AR)
            face(c, B, color='#3a2a6a')
        else:
            c.part(lambda d: d.polygon(sym([(hx, hy - 8.5 * K), (hx - 5 * K, hy - 7.5 * K), (hx - 8 * K, hy - 3 * K), (hx - 8 * K, hy + 5 * K), (hx - 3 * K, hy + 7 * K)], hx), fill=255), AR)
        c.part(lambda d: d.polygon([(hx - 1.5 * K, hy - 8 * K), (hx, hy - 15 * K), (hx + 1.5 * K, hy - 8 * K)], fill=255), TRIM, sep=False)
        pads(c, B, AR, trim=TRIM, spikes=1)
        if full:
            weapon(cls, 'default_mg', c, B, view, base_action, i)

    elif cls == 'dark_lord':
        RED = ramp('#a8281e', '#e8583a', '#5a1010')
        WING = ramp('#7a1414', '#b83a2a', '#3a0808')

        def bat_pair():
            wy = t - 2 + (1 if (i // 2) % 2 else 0)
            for s in (-1, 1):
                bx = B.cx + s * 3
                pts = [(bx, wy + 4), (bx + s * 10, wy - 12), (bx + s * 20, wy - 9), (bx + s * 22, wy + 5), (bx + s * 17, wy + 2), (bx + s * 16, wy + 13), (bx + s * 11, wy + 8), (bx + s * 8, wy + 16), (bx + s * 3, wy + 11)]
                c.part(lambda d, pts=pts: d.polygon(pts, fill=255), WING)
        if front:
            bat_pair()
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            k = leg(c, hip, foot, RED)
            c.part(lambda d, k=k: d.ellipse([k[0] - 2.5, k[1] - 2.5, k[0] + 2.5, k[1] + 2.5], fill=255), GOLD, sep=False)
            boot_shape(c, foot, ramp('#3a1010'))
        arm(c, B.sh_r, B.el_r, B.ha_r, RED, ramp('#3a1010'))
        arm(c, B.sh_l, B.el_l, B.ha_l, RED, ramp('#3a1010'))
        torso(c, B, RED)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 5, t + 2), (B.cx, t + 11), (B.cx + 5, t + 2), (B.cx + 3, t + 2), (B.cx, t + 7), (B.cx - 3, t + 2)], fill=255), GOLD, sep=False)
            gem(c, B.cx, t + 11, '#ffd36b')
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), GOLD)
        c.part(lambda d: d.polygon([(B.cx - 8, B.hip_y - 1), (B.cx + 8, B.hip_y - 1), (B.cx + 10, B.hip_y + 9), (B.cx - 10, B.hip_y + 9)], fill=255), WING)
        c.part(lambda d: d.rounded_rectangle([hx - 6.5 * K, hy - 7 * K, hx + 6.5 * K, hy + 6 * K], radius=4, fill=255), RED)
        for k, h in ((-4, 9), (0, 12), (4, 9)):
            c.part(lambda d, k=k, h=h: d.polygon([(hx + k * K - 1.5, hy - 6 * K), (hx + k * K, hy - 6 * K - h), (hx + k * K + 1.5, hy - 6 * K)], fill=255), GOLD, sep=False)
        if front:
            c.part(lambda d: d.rectangle([hx - 5 * K, hy - 1 * K, hx + 5 * K, hy + 1 * K], fill=255), flat('#0e0a12'), shade=False, sep=False)
            c.px(hx - 3 * K, hy, '#ffd36b'); c.px(hx + 3 * K, hy, '#ffd36b')
        pads(c, B, RED, spikes=2)
        if not front:
            bat_pair()
        if full:
            weapon(cls, 'lord_scepter', c, B, view, base_action, i)

    else:  # summoner
        HAIR = hair_ramp(hair or '#ff6ab8')
        PUR = ramp('#5a2a8a', '#9a5ad8', '#2a1046')
        CAPE = ramp('#2e1a50', '#4a2e7a', '#160a28')
        sway = math.sin(B.ph) * 1.5 if base_action == 'walk' else 0
        if front:
            c.part(lambda d: d.polygon([(B.cx - 8, t + 1), (B.cx + 8, t + 1), (B.cx + 13 + sway, FOOT_Y - 2), (B.cx - 13 + sway, FOOT_Y - 2)], fill=255), CAPE)
            c.part(lambda d: d.polygon(sym([(hx, hy - 6 * K), (hx - 8 * K, hy - 3 * K), (hx - 10 * K, hy + 8), (hx - 9 * K, hy + 20), (hx - 4 * K, hy + 16)], hx), fill=255), HAIR)
        for hip, foot in ((B.hip_r, B.foot_r), (B.hip_l, B.foot_l)):
            leg(c, hip, foot, PUR, w=5)
            boot_shape(c, foot, ramp('#24122a'))
        arm(c, B.sh_r, B.el_r, B.ha_r, PUR, SKIN, w=4)
        arm(c, B.sh_l, B.el_l, B.ha_l, PUR, SKIN, w=4)
        torso(c, B, PUR, sw=7, ww=5)
        c.part(lambda d: d.polygon([(B.cx - 7, B.hip_y - 2), (B.cx + 7, B.hip_y - 2), (B.cx + 11, B.hip_y + 11), (B.cx, B.hip_y + 8), (B.cx - 11, B.hip_y + 11)], fill=255), PUR)
        c.part(lambda d: d.rectangle([B.cx - 6, B.hip_y - 4, B.cx + 6, B.hip_y - 2], fill=255), GOLD, sep=False)
        if front:
            c.part(lambda d: d.polygon([(B.cx - 4, t + 1), (B.cx, t + 6), (B.cx + 4, t + 1)], fill=255), GOLD, sep=False)
            gem(c, B.cx, t + 5, '#ff7ad9')
        else:   # capa cobrindo as costas
            c.part(lambda d: d.polygon([(B.cx - 8, t), (B.cx + 8, t), (B.cx + 12 + sway, FOOT_Y - 3), (B.cx + 4, FOOT_Y - 1), (B.cx - 4, FOOT_Y - 1), (B.cx - 12 + sway, FOOT_Y - 3)], fill=255), CAPE)
            c.part(lambda d: d.line([(B.cx - 12 + sway, FOOT_Y - 3), (B.cx + 12 + sway, FOOT_Y - 3)], fill=255, width=1), GOLD, shade=False, sep=False)
        face_skin(c, B)
        if front:
            bangs = [(hx, hy - 8.5 * K), (hx - 4 * K, hy - 8 * K), (hx - 7.5 * K, hy - 4 * K), (hx - 7.5 * K, hy + 4 * K), (hx - 5.5 * K, hy - 1 * K), (hx - 2 * K, hy - 4 * K), (hx, hy - 2.5 * K)]
            c.part(lambda d: d.polygon(sym(bangs, hx), fill=255), HAIR)
            face(c, B, color='#6a1a6a')
        else:
            c.part(lambda d: d.polygon(sym([(hx, hy - 9 * K), (hx - 5 * K, hy - 8 * K), (hx - 7.5 * K, hy - 3 * K), (hx - 7 * K, hy + 6 * K), (hx - 4.5 * K, hy + 18), (hx - 1 * K, hy + 20)], hx), fill=255), HAIR)
        c.part(lambda d: d.polygon([(hx - 2.5 * K, hy - 7 * K), (hx, hy - 11 * K), (hx + 2.5 * K, hy - 7 * K)], fill=255), GOLD, sep=False)
        pads(c, B, PUR, size=4)
        if full:
            weapon(cls, 'default_sum', c, B, view, base_action, i)

    real.outline()
    real.apply_glows()
    return real


# ---------------------------------------------------------------- armas de frente/costas
def weapon(cls, base, c, B, view, base_action, i):
    """Arma na mão direita do personagem (de frente: à esquerda de quem olha; de costas: à direita)."""
    import equipment as E
    hand = B.weapon_hand
    s = -1 if view == 'front' else 1          # lado para onde a arma fica
    sway = math.sin(B.ph) * 3 if base_action == 'walk' else math.sin(B.ph) * 1.2
    if base == 'default_dk':
        heroes.weapon_greatsword(c, hand, 90 - s * 12 + sway)
    elif base == 'default_mg':
        heroes.weapon_spearblade(c, hand, -90 + s * 8 + sway * 0.5)
    elif base == 'default_elf':
        heroes.weapon_bow(c, (hand[0] + s * 1, hand[1] - 2), False)
    elif base == 'default_sum':
        heroes.weapon_staff(c, hand, -90 + s * 6 + sway * 0.5, '#c05aff', length=30, shaft='#4a2a6a')
    else:
        kind, kw = E.WEAPONS[base]
        if kind == 'sword':
            E.sword(c, hand, 90 - s * 12 + sway, **kw)
        elif kind == 'staff':
            heroes.weapon_staff(c, hand, -90 + s * 6 + sway * 0.5, kw['orb'], length=kw['length'], shaft=kw['shaft'])
        elif kind == 'skull':
            E.skull_staff(c, hand, -90 + s * 6 + sway * 0.5)
        elif kind == 'bow':
            heroes.weapon_bow(c, (hand[0] + s * 1, hand[1] - 2), False, color=kw['color'], arrow_glow=kw['arrow_glow'])
        elif kind == 'scepter':
            heroes.weapon_scepter(c, hand, -90 + s * 8 + sway * 0.5, flame=kw['flame'])
        elif kind == 'book':
            E.book(c, (hand[0] + (-9 if s < 0 else 0), hand[1] + 1), kw['color'], kw['glow'])


def draw_weapon_view(cls, base, base_action, view, i):
    c = Canvas(FW, FH)
    B = FrontBody(base_action, i, view)
    weapon(cls, base, c, B, view, base_action, i)
    c.outline()
    c.apply_glows()
    return c


# ---------------------------------------------------------------- peças dos conjuntos de frente/costas
def helm_view(c, B, st, shape, view):
    hx, hy = B.head
    m, t = st['main'], st['trim']
    front = view == 'front'
    if shape == 'leather':
        c.part(lambda d: d.polygon(sym([(hx, hy - 8.5 * K), (hx - 4 * K, hy - 8 * K), (hx - 7.5 * K, hy - 3 * K), (hx - 7.5 * K, hy + 3 * K), (hx - 6 * K, hy + (3 if front else 6) * K), (hx - 5.5 * K, hy - 1.5 * K)], hx), fill=255), m)
        c.part(lambda d: d.line([(hx - 7 * K, hy - 2 * K), (hx + 7 * K, hy - 2 * K)], fill=255, width=1), t, shade=False, sep=False)
    elif shape == 'bronze':
        c.part(lambda d: d.polygon(sym([(hx, hy - 9 * K), (hx - 4 * K, hy - 8.5 * K), (hx - 8 * K, hy - 3 * K), (hx - 8 * K, hy + 5 * K), (hx - 5.5 * K, hy + 5 * K), (hx - 5.5 * K, hy - 1.5 * K)], hx), fill=255), m)
        if front:
            c.part(lambda d: d.rectangle([hx - 1, hy - 2 * K, hx + 1, hy + 4 * K], fill=255), m, sep=False)
        c.part(lambda d: d.polygon([(hx - 2 * K, hy - 8.5 * K), (hx, hy - 14 * K), (hx + 2 * K, hy - 8.5 * K)], fill=255), t, sep=False)
    elif shape == 'scale':
        c.part(lambda d: d.polygon(sym([(hx, hy - 10 * K), (hx - 4 * K, hy - 9 * K), (hx - 8.5 * K, hy - 3 * K), (hx - 8 * K, hy + 6 * K), (hx - 3 * K, hy + 8 * K)], hx), fill=255), m)
        for k in range(3):
            c.part(lambda d, k=k: d.line([(hx - 6 * K, hy - 6 * K + k * 4), (hx + 6 * K, hy - 6 * K + k * 4)], fill=255, width=1), st['dark'], shade=False, sep=False) if not front or k == 0 else None
        if front:
            c.part(lambda d: d.line([(hx - 6 * K, hy + 1 * K), (hx + 6 * K, hy + 1 * K)], fill=255, width=2), flat('#0e0a12'), shade=False, sep=False)
            c.px(hx - 3 * K, hy + 1 * K, st['eye']); c.px(hx + 3 * K, hy + 1 * K, st['eye'])
        c.part(lambda d: d.line([(hx - 4 * K, hy - 9 * K), (hx + 4 * K, hy - 9 * K)], fill=255, width=1), t, sep=False)
    else:  # dragon
        c.part(lambda d: d.polygon(sym([(hx, hy - 10 * K), (hx - 4.5 * K, hy - 9 * K), (hx - 9 * K, hy - 3 * K), (hx - 9 * K, hy + 6 * K), (hx - 3 * K, hy + 9 * K)], hx), fill=255), m)
        if front:
            c.part(lambda d: d.line([(hx - 6.5 * K, hy + 1 * K), (hx + 6.5 * K, hy + 1 * K)], fill=255, width=2), flat('#0e0a12'), shade=False, sep=False)
            c.part(lambda d: d.line([(hx, hy + 1 * K), (hx, hy + 6 * K)], fill=255, width=1), flat('#0e0a12'), shade=False, sep=False)
            c.px(hx - 3.5 * K, hy + 1 * K, st['eye']); c.px(hx + 3.5 * K, hy + 1 * K, st['eye'])
            c.glow(hx, hy + 1 * K, 5, st['eye'], 80)
        for s in (-1, 1):
            horn = [(hx + s * 6 * K, hy - 5 * K), (hx + s * 13 * K, hy - 10 * K), (hx + s * 12 * K, hy - 17 * K), (hx + s * 9 * K, hy - 11 * K), (hx + s * 3 * K, hy - 8 * K)]
            c.part(lambda d, horn=horn: d.polygon(horn, fill=255), t, sep=False)
        c.part(lambda d: d.polygon([(hx - 3 * K, hy - 9 * K), (hx, hy - 13 * K), (hx + 3 * K, hy - 9 * K)], fill=255), t, sep=False)


def chest_view(c, B, st, shape, view):
    b = B.b
    t, hy, cx = B.top, B.hip_y, B.cx
    sw, ww = b['sh_w'], b['waist_w']
    m, tr = st['main'], st['trim']
    front = view == 'front'
    pts = [(cx - sw + 1, t + 1), (cx - sw + 3, t - 1), (cx + sw - 3, t - 1), (cx + sw - 1, t + 1), (cx + ww + 2, hy - 4), (cx - ww - 2, hy - 4)]
    c.part(lambda d: d.polygon(pts, fill=255), m)
    if not front:
        c.part(lambda d: d.line([(cx, t + 1), (cx, hy - 5)], fill=255, width=1), st['dark'], shade=False, sep=False)
        if shape in ('scale',):
            for k in range(4):
                y = t + 3 + k * 4
                c.part(lambda d, y=y: d.line([(cx - sw + 3, y), (cx + sw - 3, y)], fill=255, width=1), st['dark'], shade=False, sep=False)
    elif shape == 'leather':
        c.part(lambda d: d.line([(cx - 4, t + 2), (cx + 4, hy - 6)], fill=255, width=1), st['dark'], shade=False, sep=False)
    elif shape == 'bronze':
        c.part(lambda d: d.polygon([(cx - 5, t + 2), (cx, t + 9), (cx + 5, t + 2)], fill=255), tr, sep=False)
    elif shape == 'scale':
        for k in range(4):
            y = t + 3 + k * 4
            c.part(lambda d, y=y: d.line([(cx - sw + 3, y), (cx + sw - 3, y)], fill=255, width=1), st['dark'], shade=False, sep=False)
        gem(c, cx, t + 5, '#9ae4ff')
    else:
        c.part(lambda d: d.polygon([(cx - 6, t + 2), (cx, t + 12), (cx + 6, t + 2), (cx + 3, t + 2), (cx, t + 8), (cx - 3, t + 2)], fill=255), tr, sep=False)
        gem(c, cx, t + 12, '#ff5a2a')
        c.glow(cx, t + 12, 4, '#ff7a2a', 70)
    c.part(lambda d: d.rectangle([cx - 7, hy - 4, cx + 7, hy - 2], fill=255), tr, sep=False)


def glove_view(c, el, ha, st):
    mid = (el[0] + (ha[0] - el[0]) * 0.35, el[1] + (ha[1] - el[1]) * 0.35)
    c.part(lambda d: d.polygon(quad(mid, ha, 6, 6), fill=255), st['main'])
    c.part(lambda d: d.polygon(quad(mid, (mid[0] + (ha[0] - mid[0]) * 0.25, mid[1] + (ha[1] - mid[1]) * 0.25), 7, 7), fill=255), st['trim'], sep=False)
    c.part(lambda d: d.ellipse([ha[0] - 3, ha[1] - 3, ha[0] + 3, ha[1] + 3], fill=255), st['main'], sep=False)


def boot_view(c, hip, foot, st):
    fx, fy = foot
    knee = ((hip[0] + fx) / 2, (hip[1] + fy) / 2)
    top = (knee[0], knee[1] + 1)
    c.part(lambda d: d.polygon(quad(top, (fx, fy - 4), 8, 7), fill=255), st['main'])
    c.part(lambda d: d.polygon([(fx - 4.5, fy - 6), (fx + 4.5, fy - 6), (fx + 5, fy - 1), (fx + 4, fy), (fx - 4, fy), (fx - 5, fy - 1)], fill=255), st['main'], sep=False)
    c.part(lambda d: d.polygon(quad(top, (top[0], top[1] + 2.5), 9, 9), fill=255), st['trim'], sep=False)
    c.part(lambda d: d.rectangle([fx - 4.5, fy - 1, fx + 4.5, fy], fill=255), st['dark'], shade=False, sep=False)


def draw_equip_view(cls, piece, set_name, base_action, view, i):
    import equipment as E
    st = E.SETS[set_name]
    shape = st.get('shape', set_name)
    B = FrontBody(base_action, i, view)
    c = Canvas(FW, FH)
    if piece == 'helm':
        helm_view(c, B, st, shape, view)
    elif piece == 'armor_mid':
        chest_view(c, B, st, shape, view)
        pads(c, B, st['main'], trim=st['trim'], spikes=st['spikes'], size=st['pad'])
        if st.get('aura'):
            c.glow(B.cx, B.top + 8, 9, st['aura'], 60)
    elif piece == 'gloves_mid':
        glove_view(c, B.el_r, B.ha_r, st)
        glove_view(c, B.el_l, B.ha_l, st)
    elif piece == 'boots':
        boot_view(c, B.hip_r, B.foot_r, st)
        boot_view(c, B.hip_l, B.foot_l, st)
    # armor_front / gloves_front: vazios de frente/costas (tudo fica na camada do meio)
    c.outline()
    c.apply_glows()
    return c
