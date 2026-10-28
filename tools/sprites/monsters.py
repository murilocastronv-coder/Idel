"""Monstros: geleia, goblin (e chefe goblin), aranha, esqueleto e Rei Esqueleto."""
import math
from pixelkit import Canvas, ramp, flat, quad, at
import heroes
from heroes import Body, pose_for, draw_leg, draw_arm, draw_torso, GOLD, SILVER

FOOT = heroes.FOOT_Y


def _pose(action, i):
    a = {'idle': 'idle', 'walk': 'walk', 'attack': 'attack', 'hit': 'hit', 'death': 'death'}[action]
    return pose_for(a, i, 'melee')


def goblin(action, i, elite=False):
    P = _pose(action, i)
    build = dict(cx=40, head=8, torso_top=64, hip_y=76, sh_w=8, waist_w=6, arm_up=7, arm_fore=7)
    c = Canvas(96, 96)
    B = Body(P, build)
    SK = ramp('#4f8a2a' if elite else '#6aa84f')
    TUN = ramp('#5a1a8a' if elite else '#8a3a1e')
    BOOT = ramp('#3a2418')
    draw_leg(c, B, 'b', SK, BOOT, w=5, boot_h=4)
    draw_arm(c, B, 'b', SK, SK, w=4)
    draw_torso(c, B, TUN)
    c.part(lambda d: d.rectangle([B.cx - 6, B.hip_y - 3, B.cx + 6, B.hip_y - 1], fill=255), ramp('#5a3a1c'), sep=False)
    draw_leg(c, B, 'f', SK, BOOT, w=5, boot_h=4)
    hx, hy = B.head
    c.part(lambda d: d.ellipse([hx - 8, hy - 7, hx + 7, hy + 7], fill=255), SK)
    for side in (-1, 1):
        ex = hx + side * 7
        c.part(lambda d, ex=ex, side=side: d.polygon([(ex, hy - 2), (ex + side * 8, hy - 7), (ex + side * 1, hy + 3)], fill=255), SK, sep=False)
    eye = '#ff3030' if elite else '#ffe060'
    c.px(hx + 2, hy - 1, eye); c.px(hx + 5, hy - 1, eye); c.px(hx + 2, hy, '#1b1b2a'); c.px(hx + 5, hy, '#1b1b2a')
    c.part(lambda d: d.line([(hx + 1, hy + 4), (hx + 6, hy + 4)], fill=255), flat('#2a1a10'), shade=False, sep=False)
    c.px(hx + 2, hy + 5, '#ffffff'); c.px(hx + 5, hy + 5, '#ffffff')
    if elite:
        c.part(lambda d: d.polygon([(hx - 6, hy - 6), (hx - 4, hy - 13), (hx - 1, hy - 8), (hx + 2, hy - 14), (hx + 4, hy - 8), (hx + 7, hy - 12), (hx + 6, hy - 5)], fill=255), GOLD, sep=False)
    # lança
    ang = P['w'] if P['w'] is not None else -70
    hand = B.ha_f
    tip = at(hand, ang, 22)
    c.part(lambda d: d.polygon(quad(at(hand, ang + 180, 8), tip, 2, 2), fill=255), ramp('#7a4a22'), sep=False)
    c.part(lambda d: d.polygon([at(tip, ang + 90, 3), at(tip, ang, 6), at(tip, ang - 90, 3)], fill=255), SILVER, sep=False)
    draw_arm(c, B, 'f', SK, SK, w=4)
    c.outline()
    return c


def skeleton(action, i, king=False):
    P = _pose(action, i)
    if king:
        build = dict(cx=42, head=8, torso_top=46, hip_y=68, sh_w=12, waist_w=7, arm_up=11, arm_fore=11)
    else:
        build = dict(cx=40, head=6, torso_top=54, hip_y=71, sh_w=8, waist_w=4, arm_up=9, arm_fore=9)
    c = Canvas(96, 96)
    B = Body(P, build)
    BONE = ramp('#e6dfcc', '#ffffff', '#9a917a')
    DARKB = ramp('#2a2a34')
    if king:
        CAPE = ramp('#5a1a6a', '#8a3aa8', '#2a0a34')
        c.part(lambda d: d.polygon([(B.cx - 10, B.top), (B.cx + 8, B.top), (B.cx + 6, FOOT - 6), (B.cx - 18, FOOT - 2), (B.cx - 16, B.top + 14)], fill=255), CAPE)
    lw = 4 if king else 3
    draw_leg(c, B, 'b', BONE, ramp('#5a4a3a') if king else BONE, w=lw, boot_h=3)
    draw_arm(c, B, 'b', BONE, BONE, w=lw)
    # costelas
    t, hy_ = B.top, B.hip_y
    c.part(lambda d: d.polygon([(B.cx - build['sh_w'] + 2, t), (B.cx + build['sh_w'] - 2, t), (B.cx + 4, hy_ - 6), (B.cx - 4, hy_ - 6)], fill=255), DARKB, shade=False)
    for k in range(4):
        y = t + 2 + k * 3
        w = build['sh_w'] - 2 - k
        c.part(lambda d, y=y, w=w: d.line([(B.cx - w, y), (B.cx + w, y)], fill=255, width=2), BONE, sep=False)
    c.part(lambda d: d.line([(B.cx, t), (B.cx, hy_)], fill=255, width=2), BONE, sep=False)
    c.part(lambda d: d.ellipse([B.cx - 5, hy_ - 3, B.cx + 5, hy_ + 2], fill=255), BONE)
    if king:
        c.part(lambda d: d.polygon([(B.cx - 9, t - 2), (B.cx + 10, t - 2), (B.cx + 8, t + 8), (B.cx - 7, t + 8)], fill=255), ramp('#4a4a5e'))
        c.part(lambda d: d.line([(B.cx - 8, t + 7), (B.cx + 8, t + 7)], fill=255, width=2), GOLD, sep=False)
    draw_leg(c, B, 'f', BONE, ramp('#5a4a3a') if king else BONE, w=lw, boot_h=3)
    hx, hy = B.head
    r = build['head']
    c.part(lambda d: d.rounded_rectangle([hx - r, hy - r, hx + r, hy + r - 1], radius=4, fill=255), BONE)
    c.part(lambda d: d.rectangle([hx - r + 3, hy + r - 2, hx + r - 1, hy + r + 2], fill=255), BONE)
    eye = '#ff3030' if king else '#1b1b2a'
    c.part(lambda d: d.rectangle([hx + 1, hy - 1, hx + 3, hy + 1], fill=255), flat('#1b1b2a'), shade=False, sep=False)
    c.part(lambda d: d.rectangle([hx + 5, hy - 1, hx + 6, hy + 1], fill=255), flat('#1b1b2a'), shade=False, sep=False)
    if king:
        c.px(hx + 2, hy, eye); c.px(hx + 5, hy, eye)
        c.glow(hx + 4, hy, 5, '#ff3030', 90)
        c.part(lambda d: d.polygon([(hx - 7, hy - 6), (hx - 7, hy - 14), (hx - 4, hy - 9), (hx - 1, hy - 16), (hx + 2, hy - 9), (hx + 5, hy - 15), (hx + 8, hy - 6)], fill=255), GOLD, sep=False)
    for k in range(3):
        c.px(hx + 1 + k * 2, hy + r, '#1b1b2a')
    # escudo (esqueleto comum) atrás do braço de trás
    if not king:
        sx, sy = B.ha_b
        c.part(lambda d: d.ellipse([sx - 6, sy - 7, sx + 4, sy + 7], fill=255), ramp('#6a4a2a'))
        c.part(lambda d: d.ellipse([sx - 3, sy - 2, sx + 1, sy + 2], fill=255), SILVER, sep=False)
    ang = P['w'] if P['w'] is not None else 55
    hand = B.ha_f
    L = 30 if king else 18
    tip = at(hand, ang, L)
    base = at(hand, ang, 3)
    c.part(lambda d: d.polygon(quad(at(base, ang + 90, 5 if king else 4), at(base, ang - 90, 5 if king else 4), 2, 2), fill=255), GOLD if king else ramp('#7a5a3a'))
    c.part(lambda d: d.polygon(quad(base, tip, 6 if king else 4, 1), fill=255), ramp('#9a9aa8', '#d8d8e8', '#5a5a6a') if not king else ramp('#7a3aa8', '#c06bff', '#3a1458'))
    if king:
        c.glow(*at(hand, ang, 18), 9, '#c06bff', 90)
    draw_arm(c, B, 'f', BONE, BONE, w=lw)
    c.outline()
    c.apply_glows()
    return c


def slime(action, i):
    c = Canvas(48, 40)
    if action == 'idle' or action == 'walk':
        sq = [0, 1, 2, 1][i] if action == 'idle' else [0, 2, 3, 1][i]
        dx = 0 if action == 'idle' else [0, 1, 2, 1][i]
    elif action == 'attack':
        sq = [3, -2, -3, 0][i]; dx = [0, 3, 5, 2][i]
    elif action == 'hit':
        sq, dx = 2, -2
    else:
        sq = [3, 6, 9, 11][i]; dx = 0
    G = ramp('#3faa4a', '#8af08a', '#1e5a26')
    top = 12 + sq
    w = 14 + sq // 2
    cx = 22 + dx
    c.part(lambda d: d.polygon([(cx - w, 37), (cx - w + 2, top + 10), (cx - 6, top + 2), (cx, top), (cx + 6, top + 2), (cx + w - 2, top + 10), (cx + w, 37)], fill=255), G)
    if action != 'death' or i < 3:
        c.part(lambda d: d.ellipse([cx - 9, top + 4, cx - 4, top + 8], fill=255), flat('#d8ffd8'), shade=False, sep=False)
        for ex in (cx + 1, cx + 7):
            c.part(lambda d, ex=ex: d.rectangle([ex, top + 9, ex + 2, top + 13], fill=255), flat('#1b2a1e'), shade=False, sep=False)
            c.px(ex, top + 9, '#ffffff')
        c.part(lambda d: d.line([(cx + 2, top + 17), (cx + 8, top + 17)], fill=255), flat('#1b3a20'), shade=False, sep=False)
    c.outline('#0e1a10')
    return c


def spider(action, i):
    c = Canvas(64, 48)
    ph = i % 4
    lift = 0 if action != 'attack' else [0, 3, 5, 1][i]
    dead = action == 'death'
    BODY = ramp('#3a2a4a', '#6a5080', '#1a1024')
    cx, cy = 30 + (2 if action == 'attack' and i == 2 else 0), 30 - lift
    for k in range(4):
        for side in (-1, 1):
            wig = (2 if (ph + k) % 2 == 0 else -2) if action == 'walk' else 0
            knee = (cx + side * (8 + k * 3), cy - 10 + k * 2 + wig)
            if dead:
                knee = (cx + side * (6 + k * 2), cy - 2)
            foot = (cx + side * (14 + k * 4), 44 if not dead else cy + 2)
            c.part(lambda d, knee=knee, foot=foot: d.line([(cx + side * 3, cy), knee, foot], fill=255, width=2), ramp('#241830', '#4a3a5a', '#120a18'), sep=False)
    c.part(lambda d: d.ellipse([cx - 14, cy - 10, cx + 4, cy + 8], fill=255), BODY)
    c.part(lambda d: d.ellipse([cx + 1, cy - 6, cx + 13, cy + 5], fill=255), BODY)
    for ex in (cx + 7, cx + 10):
        c.px(ex, cy - 2, '#ff4040'); c.px(ex, cy - 1, '#ff4040')
    c.part(lambda d: d.polygon([(cx - 8, cy - 6), (cx - 4, cy - 2), (cx - 8, cy + 2), (cx - 12, cy - 2)], fill=255), flat('#a83a3a'), shade=False, sep=False)
    c.outline()
    return c


def goblin_chief(action, i):
    """Chefe Goblin: maior, elmo com chifres, escudo redondo, machado e capa (silhueta própria)."""
    P = _pose(action, i)
    build = dict(cx=40, head=9, torso_top=58, hip_y=74, sh_w=11, waist_w=8, arm_up=9, arm_fore=9)
    c = Canvas(96, 96)
    B = Body(P, build)
    SK = ramp('#4f8a2a')
    MAIL = ramp('#5a5a6a', '#8a8a9a', '#2a2a36')
    CAPE = ramp('#6a1a1a', '#a83a2a', '#3a0a0a')
    c.part(lambda d: d.polygon([(B.cx - 10, B.top), (B.cx + 6, B.top), (B.cx + 4, FOOT - 8), (B.cx - 18 - P['bob'], FOOT - 4), (B.cx - 15, B.top + 10)], fill=255), CAPE)
    draw_leg(c, B, 'b', SK, ramp('#3a2418'), w=6, boot_h=5)
    # escudo redondo no braço de trás
    sx, sy = B.ha_b
    c.part(lambda d: d.ellipse([sx - 9, sy - 9, sx + 7, sy + 9], fill=255), ramp('#7a4a22', '#a8743a', '#3a2410'))
    c.part(lambda d: d.ellipse([sx - 9, sy - 9, sx + 7, sy + 9], outline=255, width=2), GOLD, sep=False)
    c.part(lambda d: d.ellipse([sx - 3, sy - 3, sx + 1, sy + 3], fill=255), SILVER, sep=False)
    draw_torso(c, B, MAIL)
    for k in range(3):
        y = B.top + 4 + k * 4
        c.part(lambda d, y=y: d.line([(B.cx - 8, y), (B.cx + 9, y)], fill=255), ramp('#3a3a46'), shade=False, sep=False)
    c.part(lambda d: d.rectangle([B.cx - 9, B.hip_y - 3, B.cx + 9, B.hip_y], fill=255), ramp('#5a3a1c'), sep=False)
    c.part(lambda d: d.ellipse([B.cx - 2, B.hip_y - 4, B.cx + 3, B.hip_y + 1], fill=255), GOLD, sep=False)
    draw_leg(c, B, 'f', SK, ramp('#3a2418'), w=6, boot_h=5)
    hx, hy = B.head
    c.part(lambda d: d.ellipse([hx - 9, hy - 7, hx + 8, hy + 8], fill=255), SK)
    for side in (-1, 1):
        ex = hx + side * 8
        c.part(lambda d, ex=ex, side=side: d.polygon([(ex, hy), (ex + side * 7, hy - 4), (ex + side * 1, hy + 4)], fill=255), SK, sep=False)
    # elmo com chifres
    c.part(lambda d: d.polygon([(hx - 9, hy - 1), (hx - 8, hy - 8), (hx, hy - 11), (hx + 8, hy - 8), (hx + 9, hy - 1)], fill=255), MAIL)
    c.part(lambda d: d.polygon([(hx - 7, hy - 7), (hx - 14, hy - 12), (hx - 13, hy - 19), (hx - 10, hy - 13), (hx - 4, hy - 10)], fill=255), ramp('#e8dcc0'), sep=False)
    c.part(lambda d: d.polygon([(hx + 6, hy - 9), (hx + 12, hy - 14), (hx + 13, hy - 20), (hx + 14, hy - 12), (hx + 8, hy - 6)], fill=255), ramp('#e8dcc0'), sep=False)
    c.px(hx + 3, hy + 1, '#ff3030'); c.px(hx + 6, hy + 1, '#ff3030')
    c.part(lambda d: d.line([(hx + 1, hy + 5), (hx + 7, hy + 5)], fill=255), flat('#2a1a10'), shade=False, sep=False)
    c.px(hx + 2, hy + 6, '#ffffff'); c.px(hx + 6, hy + 6, '#ffffff')
    # machado
    ang = P['w'] if P['w'] is not None else -60
    hand = B.ha_f
    top = at(hand, ang, 20)
    c.part(lambda d: d.polygon(quad(at(hand, ang + 180, 6), top, 3, 3), fill=255), ramp('#7a4a22'), sep=False)
    blade = [at(top, ang + 90, 2), at(at(top, ang + 90, 9), ang + 180, -2), at(at(top, ang + 90, 10), ang + 180, 8), at(top, ang + 180, 7)]
    c.part(lambda d: d.polygon(blade, fill=255), SILVER, sep=False)
    draw_arm(c, B, 'f', SK, SK, w=5)
    c.outline()
    return c


def ice_golem(action, i):
    """Golem de Gelo: corpo de blocos de gelo, cristais nos ombros e núcleo brilhante."""
    c = Canvas(96, 96)
    bob = {'idle': [0, 0, 1, 1], 'walk': [0, 1, 0, 1], 'attack': [0, -1, 1, 0], 'hit': [1], 'death': [2, 5, 0, 0]}[action][i]
    step = [4, 0, -4, 0][i] if action == 'walk' else 0
    swing = {'attack': [-14, -22, 10, 4]}.get(action, [0, 0, 0, 0])
    sw = swing[i] if action == 'attack' else 0
    ICE = ramp('#5aa8e0', '#c8f0ff', '#2a5a98')
    DEEP = ramp('#3a7ac0', '#8ad0ff', '#1a3a70')
    cx, top = 42, 40 + bob
    # pernas
    for lx, off in ((cx - 9, -step), (cx + 7, step)):
        c.part(lambda d, lx=lx, off=off: d.rectangle([lx - 5 + off, 72, lx + 5 + off, 89], fill=255), DEEP)
        c.part(lambda d, lx=lx, off=off: d.rectangle([lx - 7 + off, 84, lx + 8 + off, 90], fill=255), ICE)
    # braço de trás
    c.part(lambda d: d.polygon([(cx - 18, top + 6), (cx - 12, top + 4), (cx - 10, top + 30), (cx - 20, top + 32)], fill=255), DEEP)
    # tronco
    c.part(lambda d: d.polygon([(cx - 16, top + 2), (cx + 16, top), (cx + 14, top + 34), (cx - 14, top + 34)], fill=255), ICE)
    for (a, b2) in (((cx - 12, top + 12), (cx + 12, top + 10)), ((cx - 10, top + 24), (cx + 10, top + 23))):
        c.part(lambda d, a=a, b2=b2: d.line([a, b2], fill=255), flat('#2a5a98'), shade=False, sep=False)
    # núcleo
    c.part(lambda d: d.ellipse([cx - 4, top + 12, cx + 5, top + 21], fill=255), ramp('#9affff', '#ffffff', '#3ac8ff'), sep=False)
    c.glow(cx + 1, top + 16, 8, '#7ae8ff', 120)
    # cabeça
    c.part(lambda d: d.polygon([(cx - 6, top - 10), (cx + 8, top - 11), (cx + 9, top + 1), (cx - 5, top + 2)], fill=255), ICE)
    c.px(cx + 3, top - 5, '#0e2a4a'); c.px(cx + 6, top - 5, '#0e2a4a'); c.px(cx + 3, top - 6, '#bff8ff'); c.px(cx + 6, top - 6, '#bff8ff')
    # cristais nos ombros
    for bx, h in ((cx - 14, 12), (cx - 9, 8), (cx + 10, 14), (cx + 15, 9)):
        c.part(lambda d, bx=bx, h=h: d.polygon([(bx - 3, top + 2), (bx, top + 2 - h), (bx + 3, top + 2)], fill=255), ramp('#8ae0ff', '#ffffff', '#3a8ad8'), sep=False)
    # braço da frente (soco)
    ax, ay = cx + 16 + sw * 0.4, top + 6 + sw * 0.6
    c.part(lambda d: d.polygon([(cx + 12, top + 4), (cx + 20, top + 4), (ax + 6, ay + 22), (ax - 4, ay + 24)], fill=255), DEEP)
    c.part(lambda d: d.rectangle([ax - 6, ay + 20, ax + 8, ay + 30], fill=255), ICE)
    c.outline('#0a1626')
    c.apply_glows()
    return c


def lava_hound(action, i):
    """Cão de Lava: quadrúpede de rocha com crina de fogo e fendas brilhantes."""
    c = Canvas(80, 56)
    ph = i % 4
    run = action == 'walk'
    lunge = [0, 4, 8, 2][i] if action == 'attack' else 0
    dead = action == 'death'
    ROCK = ramp('#3a2a26', '#6a4a40', '#1a100e')
    FIRE = ramp('#ff6a1a', '#ffd36b', '#a8240a')
    by = 30 + (1 if ph % 2 and run else 0) + ([0, 4, 10, 14][i] if dead else 0)
    bx = 34 + lunge
    # pernas
    legs = [(bx - 14, -1), (bx - 8, 1), (bx + 8, -1), (bx + 14, 1)]
    for k, (lx, ph2) in enumerate(legs):
        off = (3 if (ph + k) % 2 else -3) * ph2 if run else 0
        if dead:
            continue
        c.part(lambda d, lx=lx, off=off: d.polygon(quad((lx, by + 4), (lx + off, 50), 5, 4), fill=255), ROCK)
        c.part(lambda d, lx=lx, off=off: d.rectangle([lx + off - 3, 49, lx + off + 3, 52], fill=255), ROCK)
    # corpo
    c.part(lambda d: d.ellipse([bx - 20, by - 9, bx + 16, by + 9], fill=255), ROCK)
    for k in range(3):
        x0 = bx - 12 + k * 8
        c.part(lambda d, x0=x0: d.line([(x0, by - 4), (x0 + 4, by + 3)], fill=255, width=2), FIRE, shade=False, sep=False)
    # cauda de fogo
    tail = [(bx - 19, by - 3), (bx - 30, by - 12 - (ph % 2) * 2), (bx - 26, by - 4), (bx - 33, by - 2), (bx - 20, by + 2)]
    c.part(lambda d: d.polygon(tail, fill=255), FIRE, sep=False)
    # cabeça
    hx, hy = bx + 18, by - 6 + (6 if dead else 0)
    c.part(lambda d: d.polygon([(hx - 6, hy - 6), (hx + 6, hy - 7), (hx + 14, hy - 1), (hx + 14, hy + 3), (hx + 4, hy + 6), (hx - 6, hy + 5)], fill=255), ROCK)
    jaw = 3 if action == 'attack' and i in (1, 2) else 0
    c.part(lambda d: d.polygon([(hx + 2, hy + 3 + jaw), (hx + 14, hy + 3 + jaw), (hx + 12, hy + 6 + jaw), (hx + 2, hy + 7)], fill=255), ROCK)
    if jaw:
        c.part(lambda d: d.rectangle([hx + 4, hy + 3, hx + 13, hy + 3 + jaw], fill=255), flat('#ff6a1a'), shade=False, sep=False)
    c.part(lambda d: d.polygon([(hx - 8, hy - 4), (hx - 4, hy - 14 - (ph % 2)), (hx, hy - 6), (hx + 2, hy - 13), (hx + 5, hy - 6)], fill=255), FIRE, sep=False)
    c.px(hx + 7, hy - 2, '#fff2a8'); c.px(hx + 8, hy - 2, '#ffd36b')
    c.outline('#120806')
    c.glow(hx + 2, hy - 8, 6, '#ff8a2a', 70)
    c.glow(bx - 28, by - 6, 6, '#ff6a1a', 70)
    c.apply_glows()
    return c
