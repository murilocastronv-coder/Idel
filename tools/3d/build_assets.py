"""Prepara os arquivos 3D do jogo em public/assets/3d e public/js/vendor/three.

- Heróis, esqueleto, touro, armas e animações do Lenda 97 (glTF em JSON) viram .glb binário.
- Monstros e NPCs do repositório Nova-versao-mu (.glb) têm as texturas reduzidas para carregar rápido no celular.
- Copia o three.js r147 (MIT) e os módulos usados (GLTFLoader, SkeletonUtils, RoomEnvironment, bloom).

Uso: python3 tools/3d/build_assets.py <pasta do Lenda_97> <pasta do Nova-versao-mu> <pasta do three.js r147>
"""
import base64
import collections
import io
import json
import os
import shutil
import struct
import sys
import gzip

import numpy as np

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', '3d')
VENDOR = os.path.join(ROOT, 'public', 'js', 'vendor', 'three')

THREE_FILES = ['build/three.min.js', 'examples/js/loaders/GLTFLoader.js', 'examples/js/utils/SkeletonUtils.js',
               'examples/js/environments/RoomEnvironment.js', 'examples/js/shaders/CopyShader.js',
               'examples/js/shaders/LuminosityHighPassShader.js', 'examples/js/postprocessing/EffectComposer.js',
               'examples/js/postprocessing/RenderPass.js', 'examples/js/postprocessing/ShaderPass.js',
               'examples/js/postprocessing/UnrealBloomPass.js', 'examples/js/postprocessing/MaskPass.js', 'LICENSE']

NOVA = ['mob_goblin', 'mob_skeleton', 'mob_wolf', 'mob_frostwolf', 'mob_yeti', 'mob_cguard', 'mob_necro', 'mob_hag',
        'mob_morvak', 'mob_boss', 'mob_boar', 'npc_brant', 'npc_elric', 'npc_guardiao', 'npc_mira', 'npc_selene', 'npc_torvin']


def pad4(n):
    return (n + 3) & ~3


def write_glb(j, bin_data, path):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (pad4(len(js)) - len(js))
    bin_data += b'\0' * (pad4(len(bin_data)) - len(bin_data))
    total = 12 + 8 + len(js) + (8 + len(bin_data) if bin_data else 0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        if bin_data:
            f.write(struct.pack('<II', len(bin_data), 0x004E4942) + bin_data)


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8:off + 8 + bl]


def json_to_glb(src, dst):
    j = json.load(open(src))
    bin_data = b''
    if j.get('buffers'):
        uri = j['buffers'][0].get('uri', '')
        if uri.startswith('data:'):
            bin_data = base64.b64decode(uri.split(',', 1)[1])
            del j['buffers'][0]['uri']
            j['buffers'][0]['byteLength'] = len(bin_data)
    write_glb(j, bin_data, dst)


def shrink_glb(src, dst, max_color=512, max_other=256):
    """Reduz as texturas embutidas e reempacota o buffer (acessores continuam apontando para os mesmos bufferViews)."""
    j, bin_data = read_glb(src)
    views = j['bufferViews']
    img_views = {}
    roles = {}
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr:
            roles[pbr['baseColorTexture']['index']] = 'color'
        if 'emissiveTexture' in m:
            roles[m['emissiveTexture']['index']] = 'color'
    tex_src = {i: t.get('source') for i, t in enumerate(j.get('textures', []))}
    img_role = {tex_src[t]: r for t, r in roles.items() if t in tex_src}
    for ii, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im:
            continue
        v = views[im['bufferView']]
        raw = bin_data[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        pic = Image.open(io.BytesIO(raw))
        lim = max_color if img_role.get(ii) == 'color' else max_other
        if max(pic.size) > lim:
            k = lim / max(pic.size)
            pic = pic.resize((max(1, round(pic.size[0] * k)), max(1, round(pic.size[1] * k))), Image.LANCZOS)
        out = io.BytesIO()
        if pic.mode in ('RGBA', 'LA') or im.get('mimeType') == 'image/png':
            pic.save(out, 'PNG', optimize=True)
            im['mimeType'] = 'image/png'
        else:
            pic.convert('RGB').save(out, 'JPEG', quality=82, optimize=True)
            im['mimeType'] = 'image/jpeg'
        img_views[im['bufferView']] = out.getvalue()
    # pesos, cores e índices ocupam bem menos em inteiros (o three.js lê os formatos normalizados)
    acc = j['accessors']
    usage = {}
    for m in j['meshes']:
        for p in m['primitives']:
            for k, a in p['attributes'].items():
                usage[a] = k
            if 'indices' in p:
                usage[p['indices']] = 'INDICES'
    shared = collections.Counter(a.get('bufferView') for a in acc)
    for ai, kind in usage.items():
        a = acc[ai]
        vi = a.get('bufferView')
        if vi is None or shared[vi] != 1 or views[vi].get('byteStride') or vi in img_views:
            continue
        v = views[vi]
        raw = bin_data[v.get('byteOffset', 0) + a.get('byteOffset', 0):]
        ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        if kind in ('WEIGHTS_0', 'COLOR_0') and a['componentType'] == 5126:
            arr = np.frombuffer(raw, np.float32, a['count'] * ncomp)
            q = np.clip(np.round(arr * 255), 0, 255).astype(np.uint8)
            if kind == 'WEIGHTS_0':
                q = q.reshape(-1, 4).astype(np.int32)
                d = 255 - q.sum(1)
                idx = q.argmax(1)
                q[np.arange(len(q)), idx] += d
                q = np.clip(q, 0, 255).astype(np.uint8).reshape(-1)
            img_views[vi] = q.tobytes()
            a['componentType'] = 5121
            a['normalized'] = True
            a['byteOffset'] = 0
            a.pop('min', None); a.pop('max', None)
        elif kind == 'INDICES' and a['componentType'] == 5125:
            arr = np.frombuffer(raw, np.uint32, a['count'])
            if arr.max() < 65535:
                img_views[vi] = arr.astype(np.uint16).tobytes()
                a['componentType'] = 5123
                a['byteOffset'] = 0
    new = bytearray()
    for vi, v in enumerate(views):
        data = img_views.get(vi)
        if data is None:
            data = bin_data[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        while len(new) % 4:
            new.append(0)
        v['byteOffset'] = len(new)
        v['byteLength'] = len(data)
        new += data
    j['buffers'] = [{'byteLength': len(new)}]
    write_glb(j, bytes(new), dst)


def main():
    lenda, nova, three = sys.argv[1:4]
    os.makedirs(os.path.join(OUT, 'lenda', 'armas'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'nova'), exist_ok=True)
    os.makedirs(VENDOR, exist_ok=True)
    for f in THREE_FILES:
        shutil.copy(os.path.join(three, f), os.path.join(VENDOR, os.path.basename(f)))
    man = json.load(open(os.path.join(lenda, 'models', 'manifest.json')))
    files = [man['animacoes']['arquivo']] + list(man['modelos'].values()) + list(man['armas'].values())
    for f in files:
        dst = os.path.join(OUT, 'lenda', f.replace('.json', '.glb'))
        json_to_glb(os.path.join(lenda, 'models', f), dst)
    man['animacoes']['arquivo'] = man['animacoes']['arquivo'].replace('.json', '.glb')
    man['modelos'] = {k: v.replace('.json', '.glb') for k, v in man['modelos'].items()}
    man['armas'] = {k: v.replace('.json', '.glb') for k, v in man['armas'].items()}
    with open(os.path.join(OUT, 'lenda', 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)
    os.makedirs(os.path.join(OUT, 'retratos'), exist_ok=True)
    for f in os.listdir(os.path.join(lenda, 'assets', 'retratos')):
        shutil.copy(os.path.join(lenda, 'assets', 'retratos', f), os.path.join(OUT, 'retratos', f))
    for name in NOVA:
        shrink_glb(os.path.join(nova, name + '.glb'), os.path.join(OUT, 'nova', name + '.glb'))
    # cópias .gz: o servidor entrega comprimido quando o navegador aceita
    for base in (OUT, VENDOR):
        for dp, _, fs in os.walk(base):
            for f in fs:
                if f.endswith(('.glb', '.js', '.json')):
                    src = os.path.join(dp, f)
                    with open(src, 'rb') as a, gzip.open(src + '.gz', 'wb', compresslevel=9) as b:
                        b.write(a.read())
    total = 0
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            total += os.path.getsize(os.path.join(dp, f))
    print('ok: %.1f MB em public/assets/3d' % (total / 1e6))


if __name__ == '__main__':
    main()
