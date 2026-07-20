"""Build the hero gif: a cursor scribbles out equation [7] on p. 2556 and the
real network (projection rule, all five pages stored) heals it back.

Same maths as hopfield.js: state is spin, field h_i = sum_s xi_i^s (Ginv m)_s,
neurons updated in random chunks (async), no dense T.
"""
import numpy as np
from PIL import Image, ImageDraw

rng = np.random.default_rng(7)

SRC = ["media/page-%d.png" % i for i in (2, 3, 4, 5, 6)]
PAGE = 2                      # index of p. 2556 — the page equation [7] is on
W = 760
INK = 155
CROP = (40, 500, 430, 760)    # x0, y0, x1, y1 in work coords: eqs [7] and [8]
SCALE = 2
PAPER = (236, 232, 223)
INKCOL = (24, 22, 20)
OUT = "media/hero-scribble.gif"

# ---------- load + binarize all five pages ----------
imgs = [Image.open(s).convert("RGB") for s in SRC]
H = round(W * imgs[0].size[1] / imgs[0].size[0])
N = W * H
pats = []
for im in imgs:
    a = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float32)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    pats.append((lum < INK).astype(np.int8).ravel())
print("N =", N, "| pages:", len(pats))

xi = np.stack([2 * p - 1 for p in pats]).astype(np.float32)   # (5, N)
G = xi @ xi.T
Ginv = np.linalg.inv(G.astype(np.float64)).astype(np.float32)

s = (2 * pats[PAGE] - 1).astype(np.float32).copy()            # working state

# ---------- rendering ----------
def frame(state, cursor=None, dragging=False):
    bits = (state > 0).reshape(H, W)
    rgb = np.where(bits[:, :, None], np.array(INKCOL, np.uint8),
                   np.array(PAPER, np.uint8))
    img = Image.fromarray(rgb[CROP[1]:CROP[3], CROP[0]:CROP[2]])
    img = img.resize(((CROP[2] - CROP[0]) * SCALE, (CROP[3] - CROP[1]) * SCALE),
                     Image.NEAREST)
    if cursor is not None:
        cx = (cursor[0] - CROP[0]) * SCALE
        cy = (cursor[1] - CROP[1]) * SCALE
        d = ImageDraw.Draw(img)
        if dragging:                       # brush footprint
            r = BRUSH * SCALE
            d.ellipse([cx - r, cy - r, cx + r, cy + r],
                      outline=(179, 64, 46), width=3)
        # classic pointer, big enough to read at gif size: white fill, hard
        # black border drawn as a stroked outline over the same polygon
        k = 2.3
        tpl = [(0, 0), (0, 17), (4.5, 12.5), (8, 19),
               (11, 17.5), (7.5, 11), (13, 10.5)]
        arrow = [(cx + x * k, cy + y * k) for x, y in tpl]
        d.polygon(arrow, fill=(255, 255, 255))
        d.line(arrow + [arrow[0]], fill=(18, 16, 14), width=4, joint='curve')
    return img

BRUSH = int(W * 0.028)

def brush_at(state, cx, cy):
    y0, y1 = max(0, int(cy) - BRUSH), min(H, int(cy) + BRUSH + 1)
    x0, x1 = max(0, int(cx) - BRUSH), min(W, int(cx) + BRUSH + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mask = ((xx - cx) ** 2 + (yy - cy) ** 2) <= BRUSH ** 2
    mask &= rng.random(mask.shape) < 0.5
    sub = state.reshape(H, W)[y0:y1, x0:x1]
    sub[mask] *= -1

frames, durs = [], []

def add(img, ms):
    frames.append(img)
    durs.append(ms)

# ---------- 1. clean page, cursor arrives ----------
for k in range(5):
    t = k / 4
    add(frame(s, cursor=(60 + t * 90, 690 - t * 40)), 90)

# ---------- 2. scribble across equations [7] and [8] ----------
path = []
for k in range(26):
    t = k / 25
    x = 70 + t * 330
    y = 600 + 42 * np.sin(t * 7.5) + 30 * t
    path.append((x, y))
for i, (x, y) in enumerate(path):
    brush_at(s, x, y)
    if i % 2 == 0 or i == len(path) - 1:
        add(frame(s, cursor=(x, y), dragging=True), 55)

# ---------- 3. let go ----------
add(frame(s, cursor=path[-1]), 140)
for k in range(3):
    add(frame(s, cursor=(path[-1][0] + 18 * (k + 1), path[-1][1] + 22 * (k + 1))), 90)
add(frame(s), 320)

# ---------- 4. heal: the real dynamics ----------
chunk = N // 13
order = rng.permutation(N)
cur = 0
passflips = 0
for step in range(60):
    m = xi @ s
    w = Ginv @ m
    h = w @ xi
    if cur + chunk > N:
        order = rng.permutation(N)
        cur = 0
    idx = order[cur:cur + chunk]
    wrapped = cur + chunk >= N
    cur += chunk
    newv = np.where(h[idx] > 0, 1.0, np.where(h[idx] < 0, -1.0, s[idx]))
    flips = int((newv != s[idx]).sum())
    s[idx] = newv
    passflips += flips
    add(frame(s), 55)
    if wrapped:
        if passflips == 0 and step > 4:
            break
        passflips = 0

# ---------- 5. hold the restored page ----------
err = int(((s > 0) != (pats[PAGE] > 0)).sum())
print("pixels wrong after healing:", err, "of", N)
add(frame(s), 1100)

frames = [f.convert('P', palette=Image.ADAPTIVE, colors=8) for f in frames]
frames[0].save(OUT, save_all=True, append_images=frames[1:], loop=0,
               duration=durs, optimize=True, disposal=2)
print("wrote", OUT, "|", len(frames), "frames |", frames[0].size)
