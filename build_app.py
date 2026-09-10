#!/usr/bin/env python3
"""Build the Coast2Coast single-bundle deploy artifacts.

Produces app/{0..N-1}.b64 : base64(gzip(json({h,c,j,d}))) split into N chunks.
  h = DOM skeleton injected into #app
  c = minified CSS
  j = minified JS bundle (executed via new Function)
  d = map of data-file path -> parsed JSON (read via window.__C2C_DATA__)

Keep chunks small: long base64 runs are transcribed by hand into the Vercel
deploy call, and short chunks are far less error-prone.
"""
import base64
import gzip
import hashlib
import json
import math
import os
import re
import sys

sys.path.insert(0, '/tmp')
from minifier import strip_comments_and_minify  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
CHUNKS = 44


def read(path):
    with open(os.path.join(ROOT, path), 'r', encoding='utf-8') as f:
        return f.read()


def minify_css(src):
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'\s+', ' ', src)
    src = re.sub(r'\s*([{}:;,])\s*', r'\1', src)
    src = re.sub(r';}', '}', src)
    return src.strip()


def build_js():
    libs = ['js/icons.js', 'js/sunengine.js', 'js/geo.js', 'js/store.js', 'js/weather.js']
    parts = [strip_comments_and_minify(read(f)) for f in libs]
    parts.append(strip_comments_and_minify(read('js/app.js')))
    return ';\n'.join(parts)


def build_data():
    return {
        'data/manifest.json': json.loads(read('data/manifest.json')),
        'data/zones.json': json.loads(read('data/zones.json')),
        'data/routes/ground-truth.json': json.loads(read('data/routes/ground-truth.json')),
        'data/routes/loop1-10day.json': json.loads(read('data/routes/loop1-10day.json')),
    }


def main():
    skeleton = read('app_skeleton.html')
    payload = {
        'h': skeleton,
        'c': minify_css(read('css/styles.css')),
        'j': build_js(),
        'd': build_data(),
    }
    text = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    raw = text.encode('utf-8')
    comp = gzip.compress(raw, compresslevel=9, mtime=0)
    assert gzip.decompress(comp) == raw
    b64 = base64.b64encode(comp).decode('ascii')
    assert json.loads(gzip.decompress(base64.b64decode(b64)).decode('utf-8')) == payload

    out = os.path.join(ROOT, 'app')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))

    per = ((math.ceil(len(b64) / CHUNKS) + 3) // 4) * 4
    pieces = [b64[i * per:(i + 1) * per] for i in range(CHUNKS)]
    pieces = [p for p in pieces if p]
    assert ''.join(pieces) == b64
    for i, p in enumerate(pieces):
        with open(os.path.join(out, f'{i}.b64'), 'w', encoding='utf-8') as f:
            f.write(p)

    print(f'payload json : {len(raw)} bytes')
    print(f'gzip         : {len(comp)} bytes')
    print(f'base64       : {len(b64)} chars')
    print(f'chunks       : {len(pieces)} x {per} (last {len(pieces[-1])})')
    print('h/c/j        :', len(payload['h']), len(payload['c']), len(payload['j']))
    print('d keys       :', list(payload['d'].keys()))
    for i in range(len(pieces)):
        data = open(os.path.join(out, f'{i}.b64'), 'rb').read()
        print(f'{i:2d} {hashlib.md5(data).hexdigest()} {len(data)}')
    if len(pieces) != CHUNKS:
        print(f'WARNING: produced {len(pieces)} chunks, index.html/sw.js expect {CHUNKS}')


if __name__ == '__main__':
    main()
