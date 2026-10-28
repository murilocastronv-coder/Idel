"""Personagens humanoides (heróis e monstros humanoides) com poses animadas."""
import math
from pixelkit import Canvas, ramp, flat, hexc, quad, at, rot

FW, FH = 96, 96  # tamanho do quadro
F = FW
FOOT_Y = 90      # linha dos pés

SKIN = ramp('#f0c49a', '#ffe0c0', '#c48a62')          # cores-chave da pele (trocadas no jogo)
GOLD = ramp('#e2a93a', '#ffe08a', '#9a6418')
SILVER = ramp('#c8cede', '#ffffff', '#7a8098')
DARKM = ramp('#3a3448', '#5a5470', '#1e1a28')


def hair_ramp(base):
    return ramp(base)


# ---------------------------------------------------------------- poses
def pose_for(action, i, kind):
    """Retorna parâmetros de pose. kind: 'melee', 'caster', 'bow'."""
    p = dict(bob=0, lean=0, bf=(0, 0), ff=(0, 0), ua_f=75, fa_f=60, ua_b=100, fa_b=100, w=None, flash=0, hurt=False, crouch=0)
    if action == 'idle':
        p['bob'] = [0, 0, 1, 1][i]
        p['ua_f'] += [0, 2, 4, 2][i]
    elif action == 'walk':
        step = [6, 0, -6, 0][i]
        p['ff'] = (step, [0, 2, 0, 0][i])
        p['bf'] = (-step, [0, 0, 0, 2][i])
        p['bob'] = [0, 1, 0, 1][i]
        p['ua_f'] = 75 - step * 2
        p['ua_b'] = 100 + step * 3
        p['fa_b'] = 95 + step * 3
    elif action == 'attack':
        if kind == 'melee':
            p['ua_f'], p['fa_f'], p['w'] = [(-130, -150, -150), (-40, -20, -40), (35, 40, 45), (60, 55, 65)][i]
            p['lean'] = [-1, 1, 2, 1][i]
            p['ff'] = [(0, 0), (3, 0), (5, 0), (3, 0)][i]
            p['bf'] = [(0, 0), (-2, 0), (-3, 0), (-2, 0)][i]
        elif kind == 'caster':
            p['ua_f'], p['fa_f'], p['w'] = [(-50, -90, -105), (-20, -40, -70), (-5, -5, -40), (40, 30, -80)][i]
            p['flash'] = [0, 1, 2, 0][i]
            p['lean'] = [0, 1, 2, 1][i]
            p['ua_b'], p['fa_b'] = [(110, 100), (40, 10), (20, 0), (80, 90)][i]
        else:  # arco
            p['ua_f'], p['fa_f'] = [(10, 0), (0, 0), (0, 0), (40, 50)][i]
            p['ua_b'], p['fa_b'] = [(30, 0), (20, 175), (25, 170), (90, 100)][i]
            p['draw'] = [0, 1, 0, 0][i]
            p['flash'] = [0, 0, 2, 0][i]
            p['lean'] = [0, 0, -1, 0][i]
    elif action == 'hit':
        p['lean'] = -3
        p['ua_f'], p['fa_f'] = 130, 150
        p['ua_b'], p['fa_b'] = 140, 170
        p['hurt'] = True
    elif action == 'death':
        p['crouch'] = [3, 7, 0, 0][i]
        p['lean'] = -2
        p['ua_f'], p['fa_f'] = 100, 110
    return p


# ---------------------------------------------------------------- corpo
class Body:
    """Calcula as articulações de um humanoide para uma pose."""

    def __init__(self, pose, build):
        b = build
        self.b = b
        cx = b['cx'] + pose['lean'] * 0.5
        bob = pose['bob'] + pose['crouch']
        self.hip_y = b['hip_y'] + pose['crouch']
        self.cx = cx
        top = b['torso_top'] + bob
        self.top = top
        self.head = (cx + 1 + pose['lean'] * 0.5, top - b['head'] - 1)
        self.sh_f = (cx + b['sh_w'] - 2 + pose['lean'] * 0.5, top + 3)
        self.sh_b = (cx - b['sh_w'] + 2 + pose['lean'] * 0.5, top + 3)
        self.hip_f = (cx + 3, self.hip_y)
        self.hip_b = (cx - 3, self.hip_y)
        self.foot_f = (cx + 3 + pose['ff'][0], FOOT_Y - pose['ff'][1])
        self.foot_b = (cx - 3 + pose['bf'][0], FOOT_Y - pose['bf'][1])
        ua, fa = b['arm_up'], b['arm_fore']
        self.el_f = at(self.sh_f, pose['ua_f'], ua)
        self.ha_f = at(self.el_f, pose['fa_f'], fa)
        self.el_b = at(self.sh_b, pose['ua_b'], ua)
        self.ha_b = at(self.el_b, pose['fa_b'], fa)

    def knee(self, hip, foot, fwd=2):
        mx, my = (hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2
        return (mx + fwd, my)


def draw_leg(c, B, side, leg_r, boot_r, w=6, boot_h=5, knee_r=None):
    hip, foot = (B.hip_f, B.foot_f) if side == 'f' else (B.hip_b, B.foot_b)
    k = B.knee(hip, foot)
    c.part(lambda d: d.polygon(quad(hip, k, w + 1, w), fill=255), leg_r)
    c.part(lambda d: d.polygon(quad(k, (foot[0], foot[1] - boot_h + 1), w, w - 1), fill=255), leg_r)
    if knee_r:
        c.part(lambda d: d.ellipse([k[0] - 3, k[1] - 3, k[0] + 3, k[1] + 3], fill=255), knee_r)
    fx, fy = foot
    c.part(lambda d: d.polygon([(fx - 3, fy - boot_h - 2), (fx + 3, fy - boot_h - 2), (fx + 3, fy - 3), (fx + 6, fy - 2), (fx + 6, fy), (fx - 4, fy), (fx - 4, fy - 3)], fill=255), boot_r)


def draw_arm(c, B, side, sleeve_r, hand_r, w=5):
    sh, el, ha = (B.sh_f, B.el_f, B.ha_f) if side == 'f' else (B.sh_b, B.el_b, B.ha_b)
    c.part(lambda d: d.polygon(quad(sh, el, w + 1, w), fill=255), sleeve_r)
    c.part(lambda d: d.polygon(quad(el, ha, w, w - 1), fill=255), sleeve_r)
    c.part(lambda d: d.ellipse([ha[0] - 2.5, ha[1] - 2.5, ha[0] + 2.5, ha[1] + 2.5], fill=255), hand_r)


def draw_torso(c, B, r, waist=None):
    b = B.b
    t, hy, cx = B.top, B.hip_y, B.cx
    sw, ww = b['sh_w'], b['waist_w']
    pts = [(cx - sw, t + 1), (cx - sw + 3, t - 1), (cx + sw - 3, t - 1), (cx + sw, t + 1),
           (cx + ww + 1, hy - 5), (cx + ww, hy + 1), (cx - ww, hy + 1), (cx - ww - 1, hy - 5)]
    c.part(lambda d: d.polygon(pts, fill=255), r)
    return pts


def head_base(c, B, r=None):
    hx, hy = B.head
    hr = B.b['head']
    c.part(lambda d: d.rounded_rectangle([hx - hr, hy - hr, hx + hr, hy + hr + 1], radius=4, fill=255), r or SKIN)
    # pescoço
    c.part(lambda d: d.rectangle([hx - 2, hy + hr, hx + 2, hy + hr + 3], fill=255), r or SKIN, sep=False)


def eyes(c, B, color='#1a1426', glow=None, dy=0):
    hx, hy = B.head
    for ex in (hx + 1, hx + 4):
        c.px(ex, hy + dy, color)
        c.px(ex, hy + dy + 1, color)
    if glow:
        c.px(hx + 1, hy + dy, glow); c.px(hx + 4, hy + dy, glow)


# ---------------------------------------------------------------- armas
def weapon_greatsword(c, hand, ang, edge='#7ad0ff'):
    tip = at(hand, ang, 27)
    base = at(hand, ang, 4)
    pom = at(hand, ang + 180, 5)
    c.part(lambda d: d.polygon(quad(pom, hand, 3, 3), fill=255), ramp('#5a3a1c'))
    g1, g2 = at(base, ang + 90, 6), at(base, ang - 90, 6)
    c.part(lambda d: d.polygon(quad(g1, g2, 3, 3), fill=255), GOLD)
    c.part(lambda d: d.polygon(quad(at(base, ang, 1), tip, 6, 1), fill=255), SILVER)
    c.line(at(base, ang, 3), at(tip, ang + 180, 3), edge)
    return tip


def weapon_staff(c, hand, ang, orb, length=32, shaft='#c99a2e'):
    top = at(hand, ang, length - 8)
    bottom = at(hand, ang + 180, 9)
    c.part(lambda d: d.polygon(quad(bottom, top, 3, 3), fill=255), ramp(shaft))
    # garras em volta do orbe
    for k in (-40, 40):
        p1 = at(top, ang + k, 4)
        c.part(lambda d, p1=p1: d.polygon(quad(top, at(p1, ang, 4), 2, 2), fill=255), GOLD)
    oc = at(top, ang, 4)
    c.part(lambda d: d.ellipse([oc[0] - 3.5, oc[1] - 3.5, oc[0] + 3.5, oc[1] + 3.5], fill=255), ramp(orb, '#ffffff'))
    c.glow(oc[0], oc[1], 8, orb)
    return oc


def weapon_bow(c, hand, drawn, color='#9a6a2a', arrow_glow='#7aff6a'):
    hx, hy = hand
    bend = 7 if drawn else 5
    pts_top = [(hx, hy), (hx + 3, hy - 6), (hx + 3, hy - 12), (hx + 1, hy - 17)]
    pts_bot = [(hx, hy), (hx + 3, hy + 6), (hx + 3, hy + 12), (hx + 1, hy + 17)]
    for pts in (pts_top, pts_bot):
        for a, b in zip(pts, pts[1:]):
            c.part(lambda d, a=a, b=b: d.polygon(quad(a, b, 3, 3), fill=255), ramp(color, '#e8c070', '#5a3a14'), sep=False)
    sx = hx + 1 - bend
    c.line((hx + 1, hy - 17), (sx, hy), '#efe4c8')
    c.line((sx, hy), (hx + 1, hy + 17), '#efe4c8')
    c.part(lambda d: d.rectangle([hx - 1, hy - 2, hx + 1, hy + 2], fill=255), GOLD, sep=False)
    if drawn:
        c.line((sx, hy), (hx + 10, hy), '#d8c8a8')
        c.part(lambda d: d.polygon([(hx + 10, hy - 2), (hx + 14, hy), (hx + 10, hy + 2)], fill=255), flat(arrow_glow), shade=False)
        c.glow(hx + 12, hy, 5, arrow_glow)
    return (sx, hy)


def weapon_spearblade(c, hand, ang, glow='#7ab8ff'):
    tip = at(hand, ang, 30)
    butt = at(hand, ang + 180, 12)
    c.part(lambda d: d.polygon(quad(butt, at(hand, ang, 16), 3, 3), fill=255), ramp('#8a8ab8'))
    head0 = at(hand, ang, 15)
    c.part(lambda d: d.polygon([at(head0, ang + 90, 4), tip, at(head0, ang - 90, 4), at(head0, ang + 180, 2)], fill=255), ramp(glow, '#ffffff'))
    c.part(lambda d: d.polygon([at(butt, ang + 90, 3), at(butt, ang + 180, 6), at(butt, ang - 90, 3)], fill=255), ramp(glow, '#ffffff'))
    c.glow(*at(hand, ang, 22), 7, glow, 90)
    return tip


def weapon_scepter(c, hand, ang, flame=('#ff7a2a', '#ffd36b')):
    top = at(hand, ang, 20)
    bottom = at(hand, ang + 180, 8)
    c.part(lambda d: d.polygon(quad(bottom, top, 3, 3), fill=255), GOLD)
    c.part(lambda d: d.polygon([at(top, ang + 90, 4), at(top, ang, 3), at(top, ang - 90, 4), at(top, ang + 180, 2)], fill=255), GOLD)
    fc = at(top, ang, 5)
    c.part(lambda d: d.polygon([at(fc, ang + 120, 4), at(fc, ang, 6), at(fc, ang - 120, 4), at(fc, ang + 180, 2)], fill=255), ramp(flame[0], flame[1]))
    c.glow(fc[0], fc[1], 7, flame[0])
    return fc


# ---------------------------------------------------------------- classes
BUILD = dict(cx=40, head=6, torso_top=52, hip_y=70, sh_w=9, waist_w=6, arm_up=9, arm_fore=9)


def pauldron(c, B, side, r, trim=GOLD, spikes=0, size=5):
    sx, sy = B.sh_f if side == 'f' else B.sh_b
    c.part(lambda d: d.ellipse([sx - size, sy - size + 1, sx + size, sy + size - 1], fill=255), r)
    c.part(lambda d: d.arc([sx - size, sy - size + 1, sx + size, sy + size - 1], 200, 340, fill=255, width=2), trim, sep=False)
    for k in range(spikes):
        bx = sx - 2 + k * 3
        c.part(lambda d, bx=bx: d.polygon([(bx - 1, sy - size + 2), (bx + 1 + k, sy - size - 4), (bx + 2, sy - size + 2)], fill=255), trim, sep=False)


def gem(c, x, y, color):
    c.part(lambda d: d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=255), ramp(color, '#ffffff'), sep=False)


def draw_hero(cls, action, i, hair=None):
    """Desenha um quadro. Retorna Canvas."""
    kind = {'dark_knight': 'melee', 'magic_gladiator': 'melee', 'dark_lord': 'melee', 'fairy_elf': 'bow'}.get(cls, 'caster')
    if cls == 'dark_lord' and action == 'attack':
        kind = 'caster'
    P = pose_for(action, i, kind)
    c = Canvas(FW, FH)
    B = Body(P, BUILD)
    hx, hy = B.head
    flash = P['flash']

    if cls == 'dark_knight':
        ARM = ramp('#343c62', '#56628e', '#1a1e38')
        LEG = ramp('#2a3150', '#4a5478', '#161a30')
        draw_leg(c, B, 'b', LEG, ramp('#24283e'), knee_r=GOLD)
        draw_arm(c, B, 'b', ARM, ramp('#2a2e44'))
        draw_torso(c, B, ARM)
        t = B.top
        c.part(lambda d: d.polygon([(B.cx - 5, t + 2), (B.cx + 1, t + 12), (B.cx + 6, t + 2), (B.cx + 4, t + 2), (B.cx + 1, t + 8), (B.cx - 3, t + 2)], fill=255), GOLD, sep=False)
        gem(c, B.cx + 1, t + 12, '#5ac8ff')
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), GOLD)
        c.part(lambda d: d.polygon([(B.cx - 6, B.hip_y - 1), (B.cx + 7, B.hip_y - 1), (B.cx + 8, B.hip_y + 6), (B.cx - 7, B.hip_y + 6)], fill=255), LEG)
        draw_leg(c, B, 'f', LEG, ramp('#24283e'), knee_r=GOLD)
        # elmo com chifres
        # elmo: casco arredondado, viseira com fenda luminosa, crista e chifres curvos
        c.part(lambda d: d.polygon([(hx - 6, hy + 5), (hx - 7, hy - 3), (hx - 4, hy - 7), (hx + 2, hy - 8), (hx + 6, hy - 5), (hx + 8, hy + 1), (hx + 7, hy + 5), (hx + 2, hy + 7), (hx - 3, hy + 7)], fill=255), ARM)
        c.part(lambda d: d.polygon([(hx + 1, hy - 2), (hx + 8, hy - 1), (hx + 8, hy + 4), (hx + 3, hy + 6), (hx + 1, hy + 4)], fill=255), ramp('#4a5480', '#6a78a8', '#262c4a'))
        c.part(lambda d: d.line([(hx + 2, hy + 1), (hx + 8, hy + 1)], fill=255, width=1), flat('#0e0a12'), shade=False, sep=False)
        c.px(hx + 5, hy + 1, '#9ae4ff'); c.px(hx + 7, hy + 1, '#9ae4ff')
        c.part(lambda d: d.polygon([(hx - 4, hy - 7), (hx + 1, hy - 9), (hx + 5, hy - 6), (hx + 1, hy - 7)], fill=255), GOLD, sep=False)
        c.part(lambda d: d.polygon([(hx - 5, hy - 4), (hx - 10, hy - 9), (hx - 9, hy - 15), (hx - 7, hy - 10), (hx - 3, hy - 7)], fill=255), GOLD, sep=False)
        c.part(lambda d: d.polygon([(hx + 4, hy - 6), (hx + 6, hy - 12), (hx + 10, hy - 15), (hx + 8, hy - 10), (hx + 7, hy - 5)], fill=255), GOLD, sep=False)
        c.part(lambda d: d.line([(hx - 6, hy + 4), (hx + 1, hy + 6)], fill=255, width=1), GOLD, sep=False)
        pauldron(c, B, 'b', ARM, spikes=2, size=5)
        weapon_greatsword(c, B.ha_f, P['w'] if P['w'] is not None else 55)
        pauldron(c, B, 'f', ARM, spikes=3, size=6)
        draw_arm(c, B, 'f', ARM, ramp('#2a2e44'))

    elif cls == 'dark_wizard':
        ROBE = ramp('#2a4fa8', '#5a86e0', '#162c66')
        draw_leg(c, B, 'b', ROBE, ramp('#1d1430'))
        draw_arm(c, B, 'b', ROBE, SKIN)
        draw_leg(c, B, 'f', ROBE, ramp('#1d1430'))
        t = B.top
        # túnica longa que cobre as pernas
        c.part(lambda d: d.polygon([(B.cx - 7, t + 1), (B.cx + 7, t + 1), (B.cx + 10 + P['ff'][0] * 0.4, FOOT_Y - 3), (B.cx - 10 + P['bf'][0] * 0.4, FOOT_Y - 3)], fill=255), ROBE)
        c.part(lambda d: d.polygon([(B.cx - 1, t + 3), (B.cx + 2, t + 3), (B.cx + 3, FOOT_Y - 3), (B.cx - 2, FOOT_Y - 3)], fill=255), GOLD, sep=False)
        c.part(lambda d: d.line([(B.cx - 10 + P['bf'][0] * 0.4, FOOT_Y - 3), (B.cx + 10 + P['ff'][0] * 0.4, FOOT_Y - 3)], fill=255, width=2), GOLD, sep=False)
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 4, B.cx + 7, B.hip_y - 2], fill=255), GOLD, sep=False)
        gem(c, B.cx + 1, B.hip_y - 3, '#5ac8ff')
        # capuz
        head_base(c, B)
        c.part(lambda d: d.polygon([(hx - 7, hy + 6), (hx - 7, hy - 4), (hx - 2, hy - 11), (hx + 4, hy - 9), (hx + 7, hy - 3), (hx + 7, hy - 1), (hx - 2, hy - 1), (hx - 3, hy + 6)], fill=255), ROBE)
        c.part(lambda d: d.line([(hx - 2, hy - 10), (hx + 6, hy - 3)], fill=255, width=1), GOLD, sep=False)
        c.part(lambda d: d.rectangle([hx, hy + 3, hx + 5, hy + 6], fill=255), ramp('#d8d8e8'), sep=False)
        eyes(c, B, glow='#7ad0ff')
        pauldron(c, B, 'b', ROBE, size=4)
        pauldron(c, B, 'f', ROBE, size=5)
        weapon_staff(c, B.ha_f, P['w'] if P['w'] is not None else -95, '#4a9aff')
        draw_arm(c, B, 'f', ROBE, SKIN)
        if flash:
            c.glow(B.ha_b[0] + 3, B.ha_b[1], 5 + flash * 2, '#7ad0ff', 150)

    elif cls == 'fairy_elf':
        HAIR = hair_ramp(hair or '#f2d36b')
        GRN = ramp('#3f8a3a', '#7ac85a', '#1e4a1e')
        # cabelo longo atrás
        c.part(lambda d: d.polygon([(hx - 6, hy - 5), (hx + 2, hy - 7), (hx - 1, hy + 10), (hx - 6 - P['bob'], hy + 26), (hx - 11, hy + 22), (hx - 9, hy + 6)], fill=255), HAIR)
        draw_leg(c, B, 'b', SKIN, GRN)
        draw_arm(c, B, 'b', SKIN, GRN)
        draw_torso(c, B, GRN)
        t = B.top
        c.part(lambda d: d.polygon([(B.cx - 6, B.hip_y - 2), (B.cx + 7, B.hip_y - 2), (B.cx + 9, B.hip_y + 7), (B.cx + 3, B.hip_y + 5), (B.cx, B.hip_y + 9), (B.cx - 4, B.hip_y + 5), (B.cx - 8, B.hip_y + 7)], fill=255), GRN)
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 4, B.cx + 7, B.hip_y - 2], fill=255), GOLD, sep=False)
        c.part(lambda d: d.polygon([(B.cx - 4, t + 1), (B.cx + 1, t + 7), (B.cx + 6, t + 1)], fill=255), GOLD, sep=False)
        draw_leg(c, B, 'f', SKIN, GRN)
        head_base(c, B)
        c.part(lambda d: d.polygon([(hx - 5, hy - 1), (hx - 11, hy - 6), (hx - 6, hy + 2)], fill=255), SKIN, sep=False)  # orelha
        c.part(lambda d: d.polygon([(hx - 7, hy - 4), (hx - 4, hy - 8), (hx + 3, hy - 8), (hx + 7, hy - 4), (hx + 7, hy - 1), (hx + 3, hy - 4), (hx - 1, hy - 3), (hx - 4, hy + 3), (hx - 7, hy + 4)], fill=255), HAIR)
        c.part(lambda d: d.line([(hx - 5, hy - 6), (hx + 6, hy - 6)], fill=255, width=1), GOLD, sep=False)
        gem(c, hx + 1, hy - 6, '#7aff6a')
        eyes(c, B, color='#2a6a2a')
        c.px(hx + 3, hy + 4, '#c46a6a')
        pauldron(c, B, 'f', GRN, size=4)
        bow_hand = B.ha_f
        weapon_bow(c, bow_hand, P.get('draw', 0) == 1)
        draw_arm(c, B, 'f', SKIN, GRN)
        if flash:
            c.glow(bow_hand[0] + 14, bow_hand[1], 6, '#7aff6a', 150)

    elif cls == 'magic_gladiator':
        AR = ramp('#6a6aa8', '#b0b0e0', '#33335e')
        TRIM = ramp('#a8b8ff', '#ffffff', '#5a6aa8')
        draw_leg(c, B, 'b', AR, ramp('#2a2a48'), knee_r=TRIM)
        draw_arm(c, B, 'b', AR, ramp('#2a2a48'))
        draw_torso(c, B, AR)
        t = B.top
        c.part(lambda d: d.polygon([(B.cx - 6, t + 2), (B.cx + 1, t + 9), (B.cx + 7, t + 2), (B.cx + 1, t + 14)], fill=255), ramp('#4a3a8a'), sep=False)
        gem(c, B.cx + 1, t + 8, '#c06bff')
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), TRIM)
        c.part(lambda d: d.polygon([(B.cx - 6, B.hip_y - 1), (B.cx + 7, B.hip_y - 1), (B.cx + 9, B.hip_y + 7), (B.cx - 8, B.hip_y + 7)], fill=255), ramp('#4a3a8a'))
        draw_leg(c, B, 'f', AR, ramp('#2a2a48'), knee_r=TRIM)
        head_base(c, B)
        c.part(lambda d: d.polygon([(hx - 7, hy + 2), (hx - 7, hy - 4), (hx - 3, hy - 8), (hx + 5, hy - 7), (hx + 7, hy - 2), (hx + 2, hy - 2), (hx - 2, hy + 3)], fill=255), AR)
        c.part(lambda d: d.polygon([(hx - 3, hy - 8), (hx - 1, hy - 15), (hx + 2, hy - 7)], fill=255), TRIM, sep=False)
        eyes(c, B, color='#3a2a6a', glow=None)
        pauldron(c, B, 'b', AR, trim=TRIM, spikes=1, size=5)
        weapon_spearblade(c, B.ha_f, P['w'] if P['w'] is not None else -60)
        pauldron(c, B, 'f', AR, trim=TRIM, spikes=2, size=6)
        draw_arm(c, B, 'f', AR, ramp('#2a2a48'))

    elif cls == 'dark_lord':
        RED = ramp('#a8281e', '#e8583a', '#5a1010')
        WING = ramp('#7a1414', '#b83a2a', '#3a0808')
        # asas de morcego atrás
        wy = B.top - 2 + [0, 1, 1, 0][i % 4]
        for side in (-1, 1):
            base_x = B.cx + side * 2
            pts = [(base_x, wy + 4), (base_x + side * 10, wy - 12), (base_x + side * 22, wy - 8), (base_x + side * 24, wy + 6),
                   (base_x + side * 19, wy + 3), (base_x + side * 18, wy + 14), (base_x + side * 13, wy + 9), (base_x + side * 10, wy + 18), (base_x + side * 4, wy + 12)]
            c.part(lambda d, pts=pts: d.polygon(pts, fill=255), WING)
        draw_leg(c, B, 'b', RED, ramp('#3a1010'), knee_r=GOLD)
        draw_arm(c, B, 'b', RED, ramp('#3a1010'))
        draw_torso(c, B, RED)
        t = B.top
        c.part(lambda d: d.polygon([(B.cx - 5, t + 2), (B.cx + 1, t + 11), (B.cx + 6, t + 2), (B.cx + 4, t + 2), (B.cx + 1, t + 7), (B.cx - 3, t + 2)], fill=255), GOLD, sep=False)
        gem(c, B.cx + 1, t + 11, '#ffd36b')
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 3, B.cx + 7, B.hip_y - 1], fill=255), GOLD)
        c.part(lambda d: d.polygon([(B.cx - 7, B.hip_y - 1), (B.cx + 8, B.hip_y - 1), (B.cx + 10, B.hip_y + 9), (B.cx - 9, B.hip_y + 9)], fill=255), WING)
        draw_leg(c, B, 'f', RED, ramp('#3a1010'), knee_r=GOLD)
        c.part(lambda d: d.rounded_rectangle([hx - 6, hy - 7, hx + 6, hy + 6], radius=4, fill=255), RED)
        for k, h in ((-5, 9), (-1, 12), (3, 10)):
            c.part(lambda d, k=k, h=h: d.polygon([(hx + k - 1, hy - 6), (hx + k + 1, hy - 6 - h), (hx + k + 3, hy - 6)], fill=255), GOLD, sep=False)
        c.part(lambda d: d.rectangle([hx, hy - 1, hx + 6, hy + 1], fill=255), flat('#0e0a12'), shade=False, sep=False)
        c.px(hx + 3, hy, '#ffd36b'); c.px(hx + 5, hy, '#ffd36b')
        pauldron(c, B, 'b', RED, spikes=2, size=5)
        weapon_scepter(c, B.ha_f, P['w'] if P['w'] is not None else -80)
        pauldron(c, B, 'f', RED, spikes=3, size=6)
        draw_arm(c, B, 'f', RED, ramp('#3a1010'))
        if flash:
            c.glow(B.ha_b[0] + 3, B.ha_b[1], 5 + flash * 2, '#ff7a2a', 150)

    else:  # summoner
        HAIR = hair_ramp(hair or '#ff6ab8')
        PUR = ramp('#5a2a8a', '#9a5ad8', '#2a1046')
        CAPE = ramp('#2e1a50', '#4a2e7a', '#160a28')
        c.part(lambda d: d.polygon([(B.cx - 7, B.top + 1), (B.cx + 4, B.top + 1), (B.cx + 6, FOOT_Y - 6), (B.cx - 14 - P['bob'], FOOT_Y - 2), (B.cx - 12, B.top + 12)], fill=255), CAPE)
        c.part(lambda d: d.polygon([(hx - 6, hy - 5), (hx + 3, hy - 7), (hx, hy + 10), (hx - 5, hy + 24), (hx - 11, hy + 20), (hx - 9, hy + 6)], fill=255), HAIR)
        draw_leg(c, B, 'b', PUR, ramp('#24122a'))
        draw_arm(c, B, 'b', PUR, SKIN)
        draw_torso(c, B, PUR)
        t = B.top
        c.part(lambda d: d.polygon([(B.cx - 7, B.hip_y - 2), (B.cx + 8, B.hip_y - 2), (B.cx + 11, B.hip_y + 11), (B.cx + 2, B.hip_y + 8), (B.cx - 9, B.hip_y + 11)], fill=255), PUR)
        c.part(lambda d: d.rectangle([B.cx - 7, B.hip_y - 4, B.cx + 7, B.hip_y - 2], fill=255), GOLD, sep=False)
        c.part(lambda d: d.polygon([(B.cx - 4, t + 1), (B.cx + 1, t + 7), (B.cx + 6, t + 1)], fill=255), GOLD, sep=False)
        gem(c, B.cx + 1, t + 6, '#ff7ad9')
        draw_leg(c, B, 'f', PUR, ramp('#24122a'))
        head_base(c, B)
        c.part(lambda d: d.polygon([(hx - 7, hy - 4), (hx - 4, hy - 8), (hx + 3, hy - 8), (hx + 7, hy - 4), (hx + 7, hy), (hx + 4, hy - 4), (hx, hy - 3), (hx - 3, hy + 4), (hx - 7, hy + 5)], fill=255), HAIR)
        c.part(lambda d: d.polygon([(hx - 3, hy - 7), (hx, hy - 11), (hx + 3, hy - 7)], fill=255), GOLD, sep=False)
        eyes(c, B, color='#6a1a6a')
        c.px(hx + 3, hy + 4, '#c46a8a')
        pauldron(c, B, 'f', PUR, size=4)
        weapon_staff(c, B.ha_f, P['w'] if P['w'] is not None else -95, '#c05aff', length=30, shaft='#4a2a6a')
        draw_arm(c, B, 'f', PUR, SKIN)
        if flash:
            c.glow(B.ha_b[0] + 3, B.ha_b[1], 5 + flash * 2, '#ff7ad9', 150)

    c.outline()
    c.apply_glows()
    return c


HAIR_DEFAULT = {'fairy_elf': '#f2d36b', 'summoner': '#ff6ab8'}
