"""Equipamento visível no herói: armas (uma por item) e peças de armadura (elmo, armadura, luvas, botas)
de cada conjunto. Cada peça é desenhada na mesma pose/articulação do herói, quadro a quadro."""
from pixelkit import Canvas, ramp, flat, at, quad
import heroes
from heroes import (Body, BUILD, FW, FH, FOOT_Y, GOLD, SILVER, pose_for, pauldron, gem,
                    weapon_staff, weapon_bow, weapon_spearblade, weapon_scepter)


def kind_of(cls, action):
    kind = {'dark_knight': 'melee', 'magic_gladiator': 'melee', 'dark_lord': 'melee', 'fairy_elf': 'bow'}.get(cls, 'caster')
    if cls == 'dark_lord' and action == 'attack':
        kind = 'caster'
    return kind


def body_for(cls, action, i):
    P = pose_for(action, i, kind_of(cls, action))
    return P, Body(P, BUILD)


# ---------------------------------------------------------------- armas
def sword(c, hand, ang, length=27, width=6, blade=SILVER, edge='#7ad0ff', guard=GOLD, grip='#5a3a1c', glow=None, wavy=False):
    tip = at(hand, ang, length)
    base = at(hand, ang, 4)
    pom = at(hand, ang + 180, 5)
    c.part(lambda d: d.polygon(quad(pom, hand, 3, 3), fill=255), ramp(grip))
    g1, g2 = at(base, ang + 90, 4 + width // 2), at(base, ang - 90, 4 + width // 2)
    c.part(lambda d: d.polygon(quad(g1, g2, 3, 3), fill=255), guard)
    if wavy:
        pts = []
        n = 5
        for k in range(n + 1):
            p = at(base, ang, 1 + (length - 3) * k / n)
            pts.append(at(p, ang + 90, (width / 2) * (1 if k % 2 else 0.6)))
        for k in range(n, -1, -1):
            p = at(base, ang, 1 + (length - 3) * k / n)
            pts.append(at(p, ang - 90, (width / 2) * (0.6 if k % 2 else 1)))
        pts.insert(n + 1, tip)
        c.part(lambda d: d.polygon(pts, fill=255), blade)
    else:
        c.part(lambda d: d.polygon(quad(at(base, ang, 1), tip, width, 1), fill=255), blade)
    c.line(at(base, ang, 3), at(tip, ang + 180, 3), edge)
    if glow:
        c.glow(*at(hand, ang, length * 0.6), 7, glow, 80)
    return tip


def book(c, hand, color, glow):
    hx, hy = hand
    pts = [(hx - 1, hy - 7), (hx + 8, hy - 9), (hx + 9, hy + 2), (hx, hy + 4)]
    c.part(lambda d: d.polygon(pts, fill=255), ramp(color))
    c.part(lambda d: d.polygon([(hx + 1, hy - 6), (hx + 7, hy - 7), (hx + 8, hy + 1), (hx + 2, hy + 2)], fill=255), ramp('#efe4c8'), sep=False)
    c.part(lambda d: d.line([(hx + 4, hy - 7), (hx + 5, hy + 2)], fill=255, width=1), ramp(color), shade=False, sep=False)
    gem(c, hx + 4, hy - 3, glow)
    c.glow(hx + 4, hy - 3, 7, glow, 90)


def skull_staff(c, hand, ang):
    top = at(hand, ang, 22)
    bottom = at(hand, ang + 180, 9)
    c.part(lambda d: d.polygon(quad(bottom, top, 3, 3), fill=255), ramp('#d8d0b0', '#ffffff', '#7a7058'))
    sk = at(top, ang, 4)
    c.part(lambda d: d.ellipse([sk[0] - 4, sk[1] - 4, sk[0] + 4, sk[1] + 3], fill=255), ramp('#ece4cc', '#ffffff', '#8a8068'))
    c.px(sk[0] - 1, sk[1] - 1, '#ff3a2a'); c.px(sk[0] + 2, sk[1] - 1, '#ff3a2a')
    c.glow(sk[0], sk[1], 6, '#ff5a3a', 70)
    return sk


WEAPON_DEFAULT_ANGLE = {'sword': 55, 'staff': -95, 'scepter': -80, 'bow': 0, 'book': 0}

WEAPONS = {
    # espadas
    'short_sword': ('sword', dict(length=18, width=4, edge='#e8f4ff', guard=SILVER)),
    'kris': ('sword', dict(length=21, width=5, blade=ramp('#b8a0d8', '#ffffff', '#5a4a7a'), edge='#e0b0ff', guard=GOLD, wavy=True)),
    'broad_blade': ('sword', dict(length=24, width=8, edge='#ffe08a', guard=GOLD, grip='#3a2a1a')),
    'legion_sword': ('sword', dict(length=29, width=6, edge='#7ad0ff', guard=GOLD, glow='#5ac8ff')),
    # cajados
    'skull_staff': ('skull', {}),
    'serpent_staff': ('staff', dict(orb='#5aff8a', shaft='#3a6a2a', length=30)),
    'thunder_staff': ('staff', dict(orb='#4a9aff', shaft='#c99a2e', length=33)),
    # arcos
    'short_bow': ('bow', dict(color='#8a5a2a', arrow_glow='#ffe08a')),
    'elven_bow': ('bow', dict(color='#3f8a3a', arrow_glow='#7aff6a')),
    'silver_bow': ('bow', dict(color='#c8cede', arrow_glow='#9ae4ff')),
    # cetros
    'small_scepter': ('scepter', dict(flame=('#ffb02e', '#ffe08a'))),
    'lord_scepter': ('scepter', dict(flame=('#ff7a2a', '#ffd36b'))),
    'great_scepter': ('scepter', dict(flame=('#c05aff', '#ffb0ff'))),
    # livros
    'spirit_book': ('book', dict(color='#2a5ab8', glow='#7ad0ff')),
    'curse_book': ('book', dict(color='#6a1a5a', glow='#ff5ad8')),
    'souls_book': ('book', dict(color='#3a1a6a', glow='#c05aff')),
}
# arma "padrão" de cada classe (usada em retratos e na página inicial)
DEFAULT_WEAPON = {'dark_knight': 'default_dk', 'dark_wizard': 'thunder_staff', 'fairy_elf': 'default_elf',
                  'magic_gladiator': 'default_mg', 'dark_lord': 'lord_scepter', 'summoner': 'default_sum'}
CLASS_WEAPONS = {
    'dark_knight': ['short_sword', 'kris', 'broad_blade', 'legion_sword', 'default_dk'],
    'magic_gladiator': ['short_sword', 'kris', 'broad_blade', 'legion_sword', 'skull_staff', 'serpent_staff', 'thunder_staff', 'default_mg'],
    'dark_wizard': ['skull_staff', 'serpent_staff', 'thunder_staff'],
    'fairy_elf': ['short_bow', 'elven_bow', 'silver_bow', 'default_elf'],
    'dark_lord': ['small_scepter', 'lord_scepter', 'great_scepter'],
    'summoner': ['spirit_book', 'curse_book', 'souls_book', 'default_sum'],
}


def draw_weapon(cls, base, action, i):
    P, B = body_for(cls, action, i)
    c = Canvas(FW, FH)
    hand = B.ha_f
    if base == 'default_dk':
        heroes.weapon_greatsword(c, hand, P['w'] if P['w'] is not None else 55)
    elif base == 'default_mg':
        weapon_spearblade(c, hand, P['w'] if P['w'] is not None else -60)
    elif base == 'default_elf':
        weapon_bow(c, hand, P.get('draw', 0) == 1)
    elif base == 'default_sum':
        weapon_staff(c, hand, P['w'] if P['w'] is not None else -95, '#c05aff', length=30, shaft='#4a2a6a')
    else:
        kind, kw = WEAPONS[base]
        if kind == 'sword':
            sword(c, hand, P['w'] if P['w'] is not None else 55, **kw)
        elif kind == 'staff':
            weapon_staff(c, hand, P['w'] if P['w'] is not None else -95, kw['orb'], length=kw['length'], shaft=kw['shaft'])
        elif kind == 'skull':
            skull_staff(c, hand, P['w'] if P['w'] is not None else -95)
        elif kind == 'bow':
            weapon_bow(c, hand, P.get('draw', 0) == 1, color=kw['color'], arrow_glow=kw['arrow_glow'])
        elif kind == 'scepter':
            weapon_scepter(c, hand, P['w'] if P['w'] is not None else -80, flame=kw['flame'])
        elif kind == 'book':
            book(c, hand, kw['color'], kw['glow'])
    c.outline()
    c.apply_glows()
    return c


# ---------------------------------------------------------------- armaduras
SETS = {
    'leather': dict(main=ramp('#8a5a2e', '#c8945a', '#4a2a12'), trim=ramp('#c8945a', '#f0d0a0', '#6a4a22'), dark=ramp('#5a3a1c'), eye=None, spikes=0, pad=3),
    'bronze': dict(main=ramp('#b8743a', '#f0b070', '#6a3a12'), trim=GOLD, dark=ramp('#6a3a12'), eye=None, spikes=1, pad=4),
    'scale': dict(main=ramp('#3f7a8a', '#8ac8d8', '#1a3a48'), trim=SILVER, dark=ramp('#1a3a48'), eye='#9ae4ff', spikes=1, pad=4),
    'dragon': dict(main=ramp('#8a1a1a', '#e04a3a', '#3a0808'), trim=GOLD, dark=ramp('#2a0606'), eye='#ffb02e', spikes=2, pad=5),
}
PIECES = ['boots', 'armor_mid', 'gloves_mid', 'helm', 'armor_front', 'gloves_front']


def helm(c, B, st, name):
    hx, hy = B.head
    m, t = st['main'], st['trim']
    if name == 'leather':
        c.part(lambda d: d.polygon([(hx - 7, hy + 3), (hx - 7, hy - 4), (hx - 3, hy - 8), (hx + 4, hy - 8), (hx + 7, hy - 3), (hx + 7, hy - 1), (hx - 2, hy - 1), (hx - 3, hy + 5)], fill=255), m)
        c.part(lambda d: d.line([(hx - 6, hy - 2), (hx + 7, hy - 2)], fill=255, width=1), t, shade=False, sep=False)
    elif name == 'bronze':
        c.part(lambda d: d.polygon([(hx - 7, hy + 4), (hx - 7, hy - 4), (hx - 3, hy - 9), (hx + 4, hy - 9), (hx + 8, hy - 3), (hx + 8, hy - 1), (hx + 4, hy - 1), (hx + 4, hy + 3), (hx + 2, hy + 3), (hx + 2, hy - 1), (hx - 2, hy - 1), (hx - 2, hy + 6)], fill=255), m)
        c.part(lambda d: d.polygon([(hx - 3, hy - 9), (hx, hy - 14), (hx + 4, hy - 13), (hx + 3, hy - 9)], fill=255), t, sep=False)
    elif name == 'scale':
        c.part(lambda d: d.polygon([(hx - 7, hy + 6), (hx - 8, hy - 3), (hx - 4, hy - 9), (hx + 3, hy - 10), (hx + 8, hy - 5), (hx + 9, hy + 2), (hx + 7, hy + 6), (hx + 2, hy + 8), (hx - 3, hy + 8)], fill=255), m)
        c.part(lambda d: d.line([(hx + 1, hy + 1), (hx + 9, hy + 1)], fill=255, width=2), flat('#0e0a12'), shade=False, sep=False)
        for k in range(3):
            c.part(lambda d, k=k: d.line([(hx - 6, hy - 5 + k * 4), (hx, hy - 6 + k * 4)], fill=255, width=1), st['dark'], shade=False, sep=False)
        c.px(hx + 5, hy + 1, st['eye']); c.px(hx + 7, hy + 1, st['eye'])
        c.part(lambda d: d.line([(hx - 4, hy - 9), (hx + 4, hy - 10)], fill=255, width=1), t, sep=False)
    else:  # dragon
        c.part(lambda d: d.polygon([(hx - 8, hy + 6), (hx - 8, hy - 3), (hx - 4, hy - 9), (hx + 3, hy - 10), (hx + 9, hy - 5), (hx + 10, hy + 2), (hx + 8, hy + 7), (hx + 2, hy + 9), (hx - 3, hy + 9)], fill=255), m)
        c.part(lambda d: d.line([(hx + 1, hy + 1), (hx + 10, hy + 1)], fill=255, width=2), flat('#0e0a12'), shade=False, sep=False)
        c.px(hx + 5, hy + 1, st['eye']); c.px(hx + 8, hy + 1, st['eye'])
        c.glow(hx + 6, hy + 1, 4, st['eye'], 80)
        # chifres e crista
        c.part(lambda d: d.polygon([(hx - 6, hy - 5), (hx - 13, hy - 10), (hx - 12, hy - 17), (hx - 9, hy - 11), (hx - 3, hy - 8)], fill=255), t, sep=False)
        c.part(lambda d: d.polygon([(hx + 4, hy - 8), (hx + 7, hy - 15), (hx + 12, hy - 18), (hx + 10, hy - 12), (hx + 8, hy - 6)], fill=255), t, sep=False)
        c.part(lambda d: d.polygon([(hx - 4, hy - 9), (hx, hy - 13), (hx + 4, hy - 10)], fill=255), t, sep=False)


def chest(c, B, st, name):
    b = B.b
    t, hy, cx = B.top, B.hip_y, B.cx
    sw, ww = b['sh_w'], b['waist_w']
    m, tr = st['main'], st['trim']
    pts = [(cx - sw + 1, t + 1), (cx - sw + 3, t - 1), (cx + sw - 3, t - 1), (cx + sw - 1, t + 1), (cx + ww + 2, hy - 4), (cx - ww - 2, hy - 4)]
    c.part(lambda d: d.polygon(pts, fill=255), m)
    if name == 'leather':
        c.part(lambda d: d.line([(cx - 3, t + 2), (cx + 4, hy - 6)], fill=255, width=1), st['dark'], shade=False, sep=False)
    elif name == 'bronze':
        c.part(lambda d: d.polygon([(cx - 4, t + 2), (cx + 1, t + 9), (cx + 6, t + 2)], fill=255), tr, sep=False)
    elif name == 'scale':
        for k in range(4):
            y = t + 3 + k * 4
            c.part(lambda d, y=y: d.line([(cx - sw + 3, y), (cx + sw - 3, y)], fill=255, width=1), st['dark'], shade=False, sep=False)
        gem(c, cx + 1, t + 5, '#9ae4ff')
    else:
        c.part(lambda d: d.polygon([(cx - 5, t + 2), (cx + 1, t + 12), (cx + 7, t + 2), (cx + 4, t + 2), (cx + 1, t + 8), (cx - 2, t + 2)], fill=255), tr, sep=False)
        gem(c, cx + 1, t + 12, '#ff5a2a')
        c.glow(cx + 1, t + 12, 4, '#ff7a2a', 70)
    # cinto
    c.part(lambda d: d.rectangle([cx - 7, hy - 4, cx + 7, hy - 2], fill=255), tr, sep=False)


def glove(c, B, side, st):
    el, ha = (B.el_f, B.ha_f) if side == 'f' else (B.el_b, B.ha_b)
    mid = (el[0] + (ha[0] - el[0]) * 0.35, el[1] + (ha[1] - el[1]) * 0.35)
    c.part(lambda d: d.polygon(quad(mid, ha, 6, 6), fill=255), st['main'])
    c.part(lambda d: d.polygon(quad(mid, (mid[0] + (ha[0] - mid[0]) * 0.25, mid[1] + (ha[1] - mid[1]) * 0.25), 7, 7), fill=255), st['trim'], sep=False)
    c.part(lambda d: d.ellipse([ha[0] - 3, ha[1] - 3, ha[0] + 3, ha[1] + 3], fill=255), st['main'], sep=False)


def boot(c, B, side, st):
    hip, foot = (B.hip_f, B.foot_f) if side == 'f' else (B.hip_b, B.foot_b)
    k = B.knee(hip, foot)
    fx, fy = foot
    top = (k[0] + (fx - k[0]) * 0.15, k[1] + (fy - k[1]) * 0.15)
    c.part(lambda d: d.polygon(quad(top, (fx, fy - 4), 8, 7), fill=255), st['main'])
    c.part(lambda d: d.polygon([(fx - 4, fy - 6), (fx + 3, fy - 6), (fx + 3, fy - 3), (fx + 7, fy - 2), (fx + 7, fy), (fx - 5, fy), (fx - 5, fy - 3)], fill=255), st['main'], sep=False)
    c.part(lambda d: d.polygon(quad(top, (top[0] + (fx - top[0]) * 0.18, top[1] + (fy - top[1]) * 0.18), 9, 9), fill=255), st['trim'], sep=False)
    c.part(lambda d: d.rectangle([fx - 5, fy - 1, fx + 7, fy], fill=255), st['dark'], shade=False, sep=False)


def draw_equip(cls, piece, set_name, action, i):
    P, B = body_for(cls, action, i)
    st = SETS[set_name]
    c = Canvas(FW, FH)
    if piece == 'helm':
        helm(c, B, st, set_name)
    elif piece == 'armor_mid':
        pauldron(c, B, 'b', st['main'], trim=st['trim'], spikes=max(0, st['spikes'] - 1), size=st['pad'] - 1)
        chest(c, B, st, set_name)
    elif piece == 'armor_front':
        # ombreira da frente um pouco abaixo do ombro, para não cobrir o rosto
        B.sh_f = (B.sh_f[0] - 1, B.sh_f[1] + 2)
        pauldron(c, B, 'f', st['main'], trim=st['trim'], spikes=st['spikes'], size=st['pad'])
    elif piece == 'gloves_mid':
        glove(c, B, 'b', st)
    elif piece == 'gloves_front':
        glove(c, B, 'f', st)
    elif piece == 'boots':
        boot(c, B, 'b', st)
        boot(c, B, 'f', st)
    c.outline()
    c.apply_glows()
    return c
