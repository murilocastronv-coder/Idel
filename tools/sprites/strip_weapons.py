"""Tira a arma desenhada nos heróis (para a arma da loja de cash aparecer no lugar).

Para cada classe, a arma de um quadro de referência é marcada à mão (faixas e círculos).
Em cada quadro das outras animações esse mesmo desenho é procurado (deslocado e girado);
os pixels que batem são apagados e o lugar/ângulo da arma é guardado no manifest (wseg),
para o jogo desenhar a arma nova exatamente ali.

Gera heroes/<classe>_nw.png e heroes/<classe>_<visual>_nw.png.
Uso: python3 tools/sprites/strip_weapons.py [classe ...]
"""
import json
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites')
FW = 96

# vista -> (linha, quadro de referência, formas da arma, segmentos cabo->ponta)
# formas: ('b', x1, y1, x2, y2, meia_largura) faixa  |  ('c', x, y, raio) círculo
STAFF_F = ([('b', 69, 89, 73, 20, 2.2), ('c', 73.5, 28, 7.5)], [(69, 89, 73, 20)])
STAFF_B = ([('b', 27, 58, 23, 18, 2.2), ('c', 23, 26, 7.5)], [(27, 58, 23, 18)])
STAFF_S = ([('b', 61, 82, 57, 18, 2.2), ('c', 57, 22, 4)], [(61, 82, 57, 18)])
WEAPONS = {
    'dark_knight': {
        'side': (0, 0, [('b', 31, 53, 68, 88, 2.6)], [(31, 53, 68, 88)]),
        'side_b': (1, 3, [('b', 33, 66, 67, 88, 2.6)], [(33, 66, 67, 88)], [1]),
        'front': (5, 0, [('b', 34, 65, 15, 88, 2.6)], [(34, 65, 15, 88)]),
        'back': (8, 0, [('b', 66, 64, 84, 86, 2.6)], [(66, 64, 84, 86)]),
        'back_b': (7, 4, [('b', 66, 66, 81, 80, 2.6)], [(66, 66, 81, 80)], [7]),
    },
    'magic_gladiator': {
        'side': (0, 0, [('b', 51, 68, 74, 82, 2.6)], [(51, 68, 74, 82)]),
        'side_b': (1, 4, [('b', 54, 46, 79, 75, 2.6)], [(54, 46, 79, 75)], [1]),
        'front': (5, 0, [('b', 64, 64, 79, 82, 2.6)], [(64, 64, 79, 82)]),
        'front_b': (6, 1, [('b', 66, 62, 82, 78, 2.6)], [(66, 62, 82, 78)], [6]),
        'front2': (5, 0, [('b', 31, 64, 17, 83, 2.6)], [(31, 64, 17, 83)]),
        'front2_b': (6, 1, [('b', 32, 63, 14, 75, 2.6)], [(32, 63, 14, 75)], [6]),
        'back': (8, 0, [('b', 61, 66, 80, 70, 3)], [(61, 66, 80, 70)]),
        'back2': (8, 0, [('b', 34, 66, 16, 70, 3)], [(34, 66, 16, 70)]),
    },
    'dark_wizard': {'side': (1, 0) + STAFF_S, 'front': (5, 0) + STAFF_F, 'back': (8, 0) + STAFF_B},
    'summoner': {'side': (1, 0) + STAFF_S, 'front': (5, 0) + STAFF_F, 'back': (8, 0) + STAFF_B},
    'dark_lord': {
        'front': (5, 0, [('b', 69, 89, 73, 19, 2.2), ('c', 73, 30, 8)], [(69, 89, 73, 19)]),
        'back': (8, 0, [('b', 27, 58, 21, 19, 2.2), ('c', 21, 30, 8)], [(27, 58, 21, 19)]),
    },
    'fairy_elf': {
        'front': (5, 0, [('b', 14, 71, 50, 74, 2.6), ('b', 50, 74, 66, 62, 2.6), ('b', 66, 62, 81, 42, 2.8), ('b', 55, 57, 74, 88, 2),
                         ('b', 16, 71, 80, 43, 1.8)],
                  [(20, 72, 80, 43)]),
        'front_b': (6, 1, [('b', 22, 69, 52, 72, 2.6), ('b', 52, 72, 66, 61, 2.6), ('b', 66, 61, 80, 43, 2.8), ('b', 58, 58, 73, 87, 2),
                           ('b', 24, 69, 79, 44, 1.8)],
                    [(26, 69, 79, 44)], [6]),
    },
}
# ataque e morte ficam com a arma do desenho (mexe demais para achar); o jogo não desenha a nova nelas
# a elfa segura o arco na frente do corpo inteiro: apagar deixa buracos e o arco novo não fica na mão.
# Em vez disso o arco do desenho vira uma camada própria (heroes/<classe>_bow.png) e o jogo pinta ela
# com as cores do arco da loja: continua segurado certo em todos os quadros, inclusive no ataque.
RECOLOR = {'fairy_elf'}
INPAINT = set()


def wood(px):
    r, g, b = px[..., 0].astype(int), px[..., 1].astype(int), px[..., 2].astype(int)
    return (px[..., 3] > 0) & (r > g + 25) & (r >= b + 5) & (g < r * 0.66) & (r < 210)
VIEW_ROWS = {'side': [0, 1, 3], 'front': [5, 6], 'back': [7, 8]}
WIDE_ROWS = set()


TOL = 46  # diferença máxima de cor (soma RGB) para contar como o mesmo pixel da arma


def keys(a):
    """RGB por pixel (transparente = -999, nunca bate)."""
    k = a[..., :3].astype(np.int64)
    k[a[..., 3] < 128] = -999
    return k


def in_shape(x, y, s):
    if s[0] == 'c':
        return (x - s[1]) ** 2 + (y - s[2]) ** 2 <= s[3] ** 2
    _, x1, y1, x2, y2, hw = s
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= hw * hw


def template(K, shapes):
    pts = [(x, y, *K[y, x]) for y in range(FW) for x in range(FW) if K[y, x, 0] >= 0 and any(in_shape(x, y, s) for s in shapes)]
    return np.array(pts, dtype=np.int64)


def match(K, T, gx, gy, wide):
    """Melhor (ângulo, dx, dy) para o desenho T neste quadro; devolve (pontuação, ângulo, dx, dy, pixels que batem)."""
    rng = 30 if wide else 12
    angs = range(-180, 180, 6) if wide else range(-44, 45, 4)
    sh = np.arange(-rng, rng + 1)
    DX, DY = np.meshgrid(sh, sh)
    DX, DY = DX.ravel(), DY.ravel()
    pad = rng + 40
    P = np.full((FW + 2 * pad, FW + 2 * pad, 3), -999, dtype=np.int64)
    P[pad:pad + FW, pad:pad + FW] = K
    TC = T[:, 2:5]
    best = (0, 0, 0, 0)
    for a in angs:
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        rx = np.rint(c * (T[:, 0] - gx) - s * (T[:, 1] - gy) + gx).astype(int)
        ry = np.rint(s * (T[:, 0] - gx) + c * (T[:, 1] - gy) + gy).astype(int)
        X = rx[:, None] + DX[None, :] + pad
        Y = ry[:, None] + DY[None, :] + pad
        ok = np.clip(X, 0, P.shape[1] - 1), np.clip(Y, 0, P.shape[0] - 1)
        hits = (np.abs(P[ok[1], ok[0]] - TC[:, None, :]).sum(-1) <= TOL).sum(0)
        i = int(np.argmax(hits))
        if hits[i] > best[0]:
            best = (int(hits[i]), a, int(DX[i]), int(DY[i]))
    sc, a, dx, dy = best
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    rx = np.rint(c * (T[:, 0] - gx) - s * (T[:, 1] - gy) + gx).astype(int) + dx
    ry = np.rint(s * (T[:, 0] - gx) + c * (T[:, 1] - gy) + gy).astype(int) + dy
    ins = (rx >= 0) & (rx < FW) & (ry >= 0) & (ry < FW)
    m = np.zeros((FW, FW), bool)
    good = ins.copy()
    good[ins] = np.abs(K[ry[ins], rx[ins]] - T[ins, 2:5]).sum(-1) <= TOL
    m[ry[good], rx[good]] = True
    return sc / len(T), a, dx, dy, m


def band(K, T, shapes, gx, gy, a, dx, dy):
    """Pixels dentro da arma encontrada (com 1 px de folga) e com cor de arma."""
    grow = [(sh[0], *sh[1:-1], sh[-1] + 2) for sh in shapes]
    c, s = math.cos(math.radians(-a)), math.sin(math.radians(-a))
    pal = T[:, 2:5]
    m = np.zeros((FW, FW), bool)
    for y in range(FW):
        for x in range(FW):
            if K[y, x, 0] < 0:
                continue
            ux, uy = x - dx - gx, y - dy - gy
            rx, ry = c * ux - s * uy + gx, s * ux + c * uy + gy
            if any(in_shape(rx, ry, g) for g in grow) and (np.abs(pal - K[y, x]).sum(-1) <= TOL).any():
                m[y, x] = True
    return m


def tf(x, y, gx, gy, a, dx, dy):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    return round(c * (x - gx) - s * (y - gy) + gx + dx, 1), round(s * (x - gx) + c * (y - gy) + gy + dy, 1)


def inpaint(cell, mask, before):
    """Pixels apagados que ficam dentro do corpo: preenche de fora para dentro com a cor mais comum dos vizinhos."""
    from collections import Counter
    from scipy import ndimage as nd
    keep = before & ~mask
    todo = nd.binary_closing(keep, structure=np.ones((3, 3)), iterations=6) & mask
    known = keep.copy()
    for need in (5, 4, 3, 2, 1) * 4:
        changed = []
        for y, x in zip(*np.nonzero(todo & ~known)):
            cols = [tuple(cell[y + j, x + i]) for j in (-1, 0, 1) for i in (-1, 0, 1)
                    if (i or j) and 0 <= y + j < FW and 0 <= x + i < FW and known[y + j, x + i] and int(cell[y + j, x + i][:3].sum()) < 420]
            if len(cols) >= need:
                changed.append((y, x, Counter(cols).most_common(1)[0][0]))
        for y, x, c in changed:
            cell[y, x] = c
            known[y, x] = True


def specks(cell, mask):
    """Apaga pedacinhos soltos (até 4 px) que sobraram da arma perto do que foi apagado."""
    from scipy import ndimage as nd
    near = nd.binary_dilation(mask, iterations=2)
    lab, n = nd.label(cell[..., 3] > 0, structure=np.ones((3, 3)))
    for i in range(1, n + 1):
        c = lab == i
        if c.sum() <= 4 and (c & near).any():
            cell[c] = 0


def fill(cell, mask):
    """Tapa os buracos que ficaram dentro do corpo com a cor do vizinho."""
    a = cell
    hole = mask.copy()
    for _ in range(3):
        op = a[..., 3] > 0
        nxt = []
        for y, x in zip(*np.nonzero(hole)):
            nb = [(y + j, x + i) for j in (-1, 0, 1) for i in (-1, 0, 1) if (i or j) and 0 <= y + j < FW and 0 <= x + i < FW and op[y + j, x + i] and not hole[y + j, x + i]]
            lr = (x > 0 and op[y, x - 1]) and any(op[y, x + i] for i in range(1, 4) if x + i < FW)
            ud = (y > 0 and op[y - 1, x]) and any(op[y + j, x] for j in range(1, 4) if y + j < FW)
            if len(nb) >= 5 or (len(nb) >= 3 and (lr or ud)):
                nxt.append((y, x, a[nb[0]]))
        for y, x, c in nxt:
            a[y, x] = c
            hole[y, x] = False
        if not nxt:
            break


ACTION_OF_ROW = {0: 'idle', 1: 'walk', 2: 'attack', 3: 'hit', 4: 'death', 5: 'idle_front', 6: 'walk_front', 7: 'walk_back', 8: 'idle_back'}


def frames_of(meta, r, cols):
    return meta['actions'].get(ACTION_OF_ROW[r], {}).get('frames', cols)


def main():
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    import sys
    only = set(sys.argv[1:])
    for cls, views in WEAPONS.items():
        if only and cls not in only:
            continue
        meta = man['heroes'][cls]
        base = np.array(Image.open(os.path.join(ROOT, 'heroes', cls + '.png')).convert('RGBA'))
        cols = base.shape[1] // FW
        masks = {}
        best = {}  # (grupo, linha, quadro) -> (pontuação, máscara, segmentos)
        for view, entry in views.items():
            rr, rf, shapes, segs = entry[:4]
            group = view.split('_')[0]
            rows = entry[4] if len(entry) > 4 else VIEW_ROWS[group.rstrip('2')]
            ref = base[rr * FW:(rr + 1) * FW, rf * FW:(rf + 1) * FW]
            T = template(keys(ref), shapes)
            gx, gy = segs[0][0], segs[0][1]
            for r in rows:
                for f in range(frames_of(meta, r, cols)):
                    K = keys(base[r * FW:(r + 1) * FW, f * FW:(f + 1) * FW])
                    sc, a, dx, dy, m = match(K, T, gx, gy, False)
                    if sc < 0.25 or sc <= best.get((group, r, f), (0,))[0]:
                        continue
                    m |= band(K, T, shapes, gx, gy, a, dx, dy)
                    best[(group, r, f)] = (sc, m, [[*tf(x1, y1, gx, gy, a, dx, dy), *tf(x2, y2, gx, gy, a, dx, dy)] for x1, y1, x2, y2 in segs])
        wseg = {}
        for (group, r, f), (sc, m, sg) in sorted(best.items(), key=lambda kv: kv[0][0]):
            masks[(r, f)] = masks.get((r, f), np.zeros((FW, FW), bool)) | m
            row = wseg.setdefault(str(r), [None] * frames_of(meta, r, cols))
            row[f] = (row[f] or []) + sg
        for r in sorted(wseg, key=int):
            print(cls, r, ''.join('.' if x is None else str(len(x)) for x in wseg[r]))
        if cls in RECOLOR:
            layer = np.zeros_like(base)
            for (r, f), m in masks.items():
                cell = base[r * FW:(r + 1) * FW, f * FW:(f + 1) * FW]
                sel = m & wood(cell)
                layer[r * FW:(r + 1) * FW, f * FW:(f + 1) * FW][sel] = cell[sel]
            # ataque: o arco fica na frente do corpo, longe do cabelo
            for f in range(frames_of(meta, 2, cols)):
                cell = base[2 * FW:3 * FW, f * FW:(f + 1) * FW]
                sel = wood(cell)
                sel[:, :57] = False
                layer[2 * FW:3 * FW, f * FW:(f + 1) * FW][sel] = cell[sel]
            Image.fromarray(layer).save(os.path.join(ROOT, 'heroes', cls + '_bow.png'), optimize=True)
            meta['bowLayer'] = 'heroes/' + cls + '_bow.png'
            for k in ('wseg', 'nw'):
                meta.pop(k, None)
            for fn in os.listdir(os.path.join(ROOT, 'heroes')):
                if fn.startswith(cls) and fn.endswith('_nw.png'):
                    os.remove(os.path.join(ROOT, 'heroes', fn))
            continue
        meta['wseg'] = wseg
        meta['nw'] = True
        # arma original recortada (vista de frente): o jogo desenha ela na mão nos quadros em que o desenho não tem arma
        # (ex.: Lorde andando de frente/de lado, Mago parado de lado)
        rr, rf, shapes, segs = views['front'][:4]
        keepw = np.zeros((FW, FW), bool)
        for y in range(FW):
            for x in range(FW):
                keepw[y, x] = any(in_shape(x, y, sh) for sh in shapes)
        for suf in [''] + ['_' + k for k in (meta.get('looks') or {})]:
            src = os.path.join(ROOT, 'heroes', cls + suf + '.png')
            if not os.path.exists(src):
                continue
            cell = np.array(Image.open(src).convert('RGBA'))[rr * FW:(rr + 1) * FW, rf * FW:(rf + 1) * FW].copy()
            cell[~keepw] = 0
            Image.fromarray(cell).save(os.path.join(ROOT, 'heroes', cls + suf + '_wpn.png'), optimize=True)
        meta['wpn'] = True
        looks = [''] + ['_' + k for k in (meta.get('looks') or {})]
        for suf in looks:
            src = os.path.join(ROOT, 'heroes', cls + suf + '.png')
            if not os.path.exists(src):
                continue
            im = np.array(Image.open(src).convert('RGBA'))
            for (r, f), m in masks.items():
                cell = im[r * FW:(r + 1) * FW, f * FW:(f + 1) * FW]
                before = cell[..., 3] > 0
                cell[m] = 0
                if cls in INPAINT:
                    inpaint(cell, m, before)
                fill(cell, m)
                specks(cell, m)
            Image.fromarray(im).save(os.path.join(ROOT, 'heroes', cls + suf + '_nw.png'), optimize=True)
    with open(man_path, 'w') as fh:
        json.dump(man, fh, indent=1)


if __name__ == '__main__':
    main()
