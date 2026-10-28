"""Asas e capas (Chaos Machine). Desenhadas com as mesmas poses do herói (Body/pose_for),
então acompanham cada quadro de idle, andar, ataque, dano e morte. Ficam atrás do corpo."""
import math
from pixelkit import Canvas, ramp, flat, at
from heroes import FOOT_Y
from equipment import body_for

# quadro maior que o do herói para as pontas das asas não cortarem; o herói fica deslocado em (DX, DY)
WFW, WFH, DX, DY = 144, 120, 48, 22
PIVOT = (40 + DX, FOOT_Y + DY)

GOLD = ramp('#e2a93a', '#ffe08a', '#9a6418')


def darker(r, f=0.62):
    return tuple((int(c[0] * f), int(c[1] * f), int(c[2] * f), 255) for c in r)


STYLES = {
    # nível 1
    'wings_satan': dict(kind='bat', span=38, col=ramp('#a82a2a', '#e8604a', '#4a0c14'), bone=ramp('#3a1a1a', '#6a3030', '#1a0a0a')),
    'wings_heaven': dict(kind='feather', span=34, col=ramp('#dfe8fa', '#ffffff', '#8a98c0')),
    'wings_elf': dict(kind='leaf', span=32, col=ramp('#5ac83a', '#b8ff8a', '#1e6a24')),
    'wings_curse': dict(kind='bat', span=36, col=ramp('#6a3a9a', '#a87ae0', '#22103a'), bone=ramp('#2a1a3a', '#4a3a5a', '#120a1a')),
    # nível 2 (maiores, com detalhes dourados ou brilho)
    'wings_dragon': dict(kind='bat', span=50, col=ramp('#c03218', '#ff8a3a', '#4a0a06'), bone=GOLD, claws=True),
    'wings_soul': dict(kind='feather', span=46, col=ramp('#4aa8f0', '#e0f6ff', '#183c8a'), tips=ramp('#ffffff', '#ffffff', '#a8d8ff')),
    'wings_spirit': dict(kind='feather', span=46, col=ramp('#e8c050', '#fff6c0', '#8a6418'), tips=ramp('#8aff6a', '#d8ffb8', '#2a7a2a')),
    'wings_darkness': dict(kind='bat', span=50, col=ramp('#3a2a5a', '#7a5ab0', '#120822'), bone=ramp('#b02a2a', '#ff5a4a', '#4a0a0a'), claws=True),
    'wings_despair': dict(kind='thorn', span=48, col=ramp('#b0407a', '#ff8ac8', '#3a0a26'), bone=ramp('#4a1030', '#8a2a5a', '#1a0612')),
    # capas do Dark Lord
    'cape_lord': dict(kind='cape', col=ramp('#5a2290', '#9a5ad8', '#220a3a'), trim=GOLD, inner=ramp('#2a1040', '#4a2a6a', '#12061e')),
    'cape_emperor': dict(kind='cape', col=ramp('#a01818', '#e8503a', '#3a0606'), trim=GOLD, inner=ramp('#1a0a0a', '#3a1a1a', '#0a0404'), fur=True, big=True),
}

GLOW = {'wings_dragon': '#ff6a2a', 'wings_soul': '#7ad0ff', 'wings_spirit': '#ffe08a', 'wings_darkness': '#a04aff',
        'wings_despair': '#ff6ab8', 'cape_emperor': '#ff5a3a'}

# batida das asas por quadro (graus; positivo = mais aberta para cima)
FLAP = {
    'idle': [0, 5, 9, 5],
    'walk': [2, 12, 18, 8],
    'attack': [-6, 6, 14, 4],
    'hit': [-10],
    'death': [-14, -20, -20, -20],
}


def root_of(B):
    return (B.cx - 3, B.top + 4)


def rotp(p, o, ang):
    a = math.radians(ang)
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * math.cos(a) - y * math.sin(a), o[1] + x * math.sin(a) + y * math.cos(a))


def bat_wing(c, R, flap, span, col, bone, scale=1.0, claws=False, thorn=False):
    s = span * scale
    rot = lambda p: rotp(p, R, flap * 0.8)   # bater a asa = girar tudo no ombro
    Wr = at(R, -104, s * 0.52)
    W = rot(Wr)                              # punho: sobe atrás do ombro
    T = rot(at(Wr, -142, s * 0.6))           # ponta: alta, para trás
    F1 = rot(at(Wr, -176, s * 0.7))
    F2 = rot(at(Wr, 152, s * 0.76))
    F3 = rot(at(Wr, 122, s * 0.7))
    E = (R[0] - 1, R[1] + s * 0.24)
    mid = lambda a, b, k=0.5: (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)

    def notch(a, b, depth):
        m = mid(a, b)
        nx, ny = (b[1] - a[1]), -(b[0] - a[0])
        L = math.hypot(nx, ny) or 1
        return (m[0] + nx / L * depth, m[1] + ny / L * depth)
    d = s * 0.15
    if thorn:
        poly = [R, W, at(mid(W, T, 0.4), -110, 3), T, notch(T, F1, -d), at(F1, 160, 3), F1, notch(F1, F2, -d), at(F2, 130, 3), F2, notch(F2, F3, -d), F3, notch(F3, E, -d * 0.7), E]
    else:
        poly = [R, W, T, notch(T, F1, -d), F1, notch(F1, F2, -d), F2, notch(F2, F3, -d), F3, notch(F3, E, -d * 0.7), E]
    c.part(lambda dr: dr.polygon(poly, fill=255), col, sep=False)
    c.part(lambda dr: dr.line([R, W, T], fill=255, width=3), bone, shade=False, sep=False)
    for f in (F1, F2, F3):
        end = f
        c.part(lambda dr, end=end, f=f: dr.line([W, end], fill=255, width=1 if f is F3 else 2), bone, shade=False, sep=False)
    c.part(lambda dr: dr.ellipse([W[0] - 2, W[1] - 2, W[0] + 2, W[1] + 2], fill=255), bone, sep=False)
    if claws:
        for p in (W, T):
            tip = (p[0] - 2, p[1] - 5)
            c.part(lambda dr, p=p, tip=tip: dr.polygon([(p[0] - 1.5, p[1] + 1), (p[0] + 1.5, p[1]), tip], fill=255), ramp('#f0f0f0', '#ffffff', '#9a9aa8'), sep=False)


def feather_wing(c, R, flap, span, col, scale=1.0, tips=None, leaf=False):
    s = span * scale
    rot = lambda p: rotp(p, R, flap * 0.8)
    Wr = at(R, -98, s * 0.5)
    Tr = at(Wr, -152, s * 0.5)
    rows = []
    n = 7 if not leaf else 5
    for k in range(n):        # primárias: do punho até a ponta, longas, caindo para trás
        f = k / (n - 1)
        base = (Wr[0] + (Tr[0] - Wr[0]) * f, Wr[1] + (Tr[1] - Wr[1]) * f)
        rows.append((base, 112 + f * 34, s * (0.56 + 0.2 * f), (4.4 if not leaf else 7.5) * scale))
    m = 4 if not leaf else 3
    for k in range(m):        # secundárias: do ombro ao punho
        f = k / (m - 1)
        base = (R[0] + (Wr[0] - R[0]) * f, R[1] + (Wr[1] - R[1]) * f)
        rows.append((base, 104 + f * 6, s * (0.34 + 0.16 * f), (4.2 if not leaf else 6.5) * scale))
    for base, ang, ln, w in sorted(rows, key=lambda r: -r[2]):
        tip = at(base, ang, ln)
        side, side2 = at(base, ang + 90, w / 2), at(base, ang - 90, w / 2)
        midp = at(base, ang, ln * (0.55 if leaf else 0.7))
        m1, m2 = at(midp, ang + 90, w * (0.75 if leaf else 0.55)), at(midp, ang - 90, w * (0.75 if leaf else 0.55))
        poly = [rot(q) for q in (side, m1, tip, m2, side2)]
        c.part(lambda dr, poly=poly: dr.polygon(poly, fill=255), col, sep=True, sep_k=0.8)
        if tips is not None:
            tp = at(tip, ang + 180, ln * 0.3)
            tri = [rot(at(tp, ang + 90, w * 0.42)), rot(tip), rot(at(tp, ang - 90, w * 0.42))]
            c.part(lambda dr, tri=tri: dr.polygon(tri, fill=255), tips, sep=False)
        if leaf:
            vein = [rot(base), rot(at(base, ang, ln * 0.85))]
            c.part(lambda dr, vein=vein: dr.line(vein, fill=255, width=1), darker(col, 0.7), shade=False, sep=False)
    W, T = rot(Wr), rot(Tr)
    c.part(lambda dr: dr.polygon([(R[0] - 1, R[1] + 2), (R[0] + 2, R[1] - 2), (W[0] + 2, W[1] - 1), (T[0], T[1] - 1), (T[0] + 1, T[1] + 2), (W[0] - 1, W[1] + 3)], fill=255), col, sep=False)


def cape(c, B, P, st, i, action):
    t = B.top
    sway = {'walk': [4, 8, 4, 8], 'idle': [0, 1, 2, 1], 'attack': [2, 5, 7, 4], 'hit': [6], 'death': [0, 0, 0, 0]}.get(action, [0])
    sw = sway[min(i, len(sway) - 1)]
    big = 4 if st.get('big') else 0
    cx = B.cx
    bottom = FOOT_Y + DY - 1
    # contorno da capa: larga atrás do corpo, até o chão, com barra ondulada
    left = cx - 26 - big - sw
    hem = [(cx + 7, bottom - 3), (cx + 1, bottom), (cx - 6, bottom - 2), (cx - 12, bottom + 1), (cx - 19 - sw * 0.5, bottom - 1), (left, bottom - 4)]
    poly = [(cx - 9, t - 1), (cx + 6, t - 1), (cx + 8, t + 14)] + hem + [(left + 3 + sw * 0.3, t + 22), (cx - 18 - big - sw * 0.4, t + 8)]
    c.part(lambda dr: dr.polygon([(x + 1, y + 1) for x, y in poly], fill=255), st['inner'], sep=False)
    c.part(lambda dr: dr.polygon(poly, fill=255), st['col'])
    # dobras do tecido
    for k, (x0, x1) in enumerate(((cx - 6, cx - 9 - sw * 0.4), (cx - 12, cx - 17 - sw * 0.6), (cx - 17 - big * 0.5, cx - 23 - big - sw * 0.8))):
        c.part(lambda dr, x0=x0, x1=x1: dr.line([(x0, t + 6), (x1, bottom - 3)], fill=255, width=1), darker(st['col'], 0.7), shade=False, sep=False)
    # barra e borda dourada
    c.part(lambda dr: dr.line(hem, fill=255, width=2), st['trim'], shade=False, sep=False)
    c.part(lambda dr: dr.line([(cx - 18 - big - sw * 0.4, t + 8), (left + 3 + sw * 0.3, t + 22), (left, bottom - 4)], fill=255, width=1), st['trim'], shade=False, sep=False)
    # brasão nas costas
    ex, ey = cx - 15 - big * 0.5 - sw * 0.4, t + 20
    c.part(lambda dr: dr.polygon([(ex, ey - 5), (ex + 4, ey - 1), (ex, ey + 5), (ex - 4, ey - 1)], fill=255), st['trim'], sep=False)
    c.part(lambda dr: dr.ellipse([ex - 1.5, ey - 2, ex + 1.5, ey + 1], fill=255), ramp('#ff5a8a', '#ffb0c8', '#8a1030') if st.get('fur') else ramp('#5ad0ff', '#c8f4ff', '#1a5a9a'), sep=False)
    # gola alta atrás da cabeça
    col = ramp('#f0e6d0', '#ffffff', '#a89878') if st.get('fur') else st['col']
    collar = [(cx - 11, t + 3), (cx - 15 - big, t - 12 - big), (cx - 9, t - 7), (cx - 6, t - 16 - big), (cx - 2, t - 7), (cx + 2, t - 11 - big * 0.5), (cx + 4, t + 1)]
    c.part(lambda dr: dr.polygon(collar, fill=255), col, sep=False)
    c.part(lambda dr: dr.line(collar[:-1], fill=255, width=1), st['trim'], shade=False, sep=False)
    if st.get('fur'):
        for k in range(5):
            x = cx - 10 + k * 3.2
            c.part(lambda dr, x=x: dr.ellipse([x - 2.5, t - 3, x + 2.5, t + 2], fill=255), col, sep=False)


def draw_wings(cls, base, action, i, layer='back'):
    P, B = body_for(cls, action, i)
    # desloca o corpo para o quadro maior
    B.cx += DX; B.top += DY
    B.head = (B.head[0] + DX, B.head[1] + DY)
    for k in ('sh_f', 'sh_b'):
        v = getattr(B, k); setattr(B, k, (v[0] + DX, v[1] + DY))
    st = STYLES[base]
    c = Canvas(WFW, WFH)
    if st['kind'] == 'cape':
        cape(c, B, P, st, i, action)
        if layer == 'over':
            # parte que cai por cima das costas do herói (só atrás da linha da coluna)
            cut = int(round(B.cx - 7))
            c.img[:, cut:, :] = 0
    else:
        seq = FLAP.get(action, [0])
        fl = seq[min(i, len(seq) - 1)]
        R = root_of(B)
        far = (R[0] + 7, R[1] - 2)
        span = st['span']
        if st['kind'] in ('bat', 'thorn'):
            bat_wing(c, far, fl - 10, span * 0.9, darker(st['col']), darker(st['bone']), thorn=st['kind'] == 'thorn')
            bat_wing(c, R, fl, span, st['col'], st['bone'], claws=st.get('claws', False), thorn=st['kind'] == 'thorn')
        else:
            leaf = st['kind'] == 'leaf'
            feather_wing(c, far, fl - 10, span * 0.9, darker(st['col']), leaf=leaf, tips=darker(st['tips']) if st.get('tips') else None)
            feather_wing(c, R, fl, span, st['col'], leaf=leaf, tips=st.get('tips'))
    c.outline()
    return c
