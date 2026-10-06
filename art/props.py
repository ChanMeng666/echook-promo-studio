"""The things in the room, each described as how it is painted: reserve the shape,
lay the local colour, drop a shadow glaze on the side away from the light,
lift a highlight, then draw it in pen."""

from __future__ import annotations

import numpy as np

from engine import (INK, Shapes, Sheet, arc_pts, bezier, blur, fbm, leaf_poly, rng, rrect_pts,
                    smoothstep)

SHADOW = "#3b3868"        # the violet every shadow shares, so the plates sit in one evening
WARM = "#ffbe5c"          # lamp light
COOL = "#8fd0cf"          # the screen's spill


def norm(v):
    v = np.asarray(v, np.float32)
    return v / (np.linalg.norm(v) + 1e-6)


# -- sky and town (the far layer) ---------------------------------------------

def paint_sky(sky: Sheet, S: Shapes, horizon: float, s: float, seed: int, sky_top: float = 0.0) -> None:
    """The whole dusk gradient is fitted between sky_top and the horizon, so a window
    anywhere on a plate looks out on the same evening."""
    H, W = S.h, S.w
    hz = float(horizon - sky_top)
    Y = S.Y - sky_top
    kw = dict(wobble=26 * s, wobble_cell=320 * s, soft=22 * s, edge=0.0, granulate=0.45,
              streak=0.14, streak_cell=34 * s, streak_stretch=14)
    sky.glaze(smoothstep(hz * 0.80, -hz * 0.25, Y), "#1f2a60", 1.45, bloom=0.4, bloom_cell=460 * s, **kw)
    sky.glaze(smoothstep(-hz * 0.2, hz * 0.42, Y) * smoothstep(hz * 0.98, hz * 0.40, Y), "#6558a0", 0.95,
              bloom=0.5, bloom_cell=380 * s, **kw)
    sky.glaze(smoothstep(hz * 0.50, hz * 0.97, Y), "#f09a78", 0.55, bloom=0.4, bloom_cell=300 * s, **kw)
    sky.glaze(smoothstep(hz * 0.78, hz * 1.0, Y), "#f7c583", 0.45, bloom=0.3, bloom_cell=300 * s, **kw)
    # cloud bands: damp strokes that dried with a hard lower edge
    r = rng(seed + 2)
    for i in range(7):
        cy = r.uniform(0.12, 0.86) * hz
        cx = r.uniform(0.0, 1.0) * W
        if i == 0:
            cy = 0.70 * hz
        band = fbm(H, W, 150 * s, seed + 20 + i, 4, stretch=5.0)
        env = np.exp(-(((Y - cy) / (r.uniform(22, 50) * s)) ** 2) - (((S.X - cx) / (r.uniform(340, 820) * s)) ** 2))
        m = smoothstep(0.50, 0.62, band) * env
        low = cy > hz * 0.55
        sky.glaze(m, "#5a4a8e" if low else "#2a2f66", 0.5 if low else 0.6, wobble=10 * s, soft=4 * s,
                  edge=0.55, edge_w=8 * s, bloom=0.3)
    # the first stars: dots of masking fluid
    import cv2
    stars = np.zeros((H, W), np.uint8)
    for _ in range(46):
        x, y = r.uniform(0, W), sky_top + r.uniform(-0.1, 0.5) * hz
        cv2.circle(stars, (int(x * 4), int(max(y, 0) * 4)), int(r.choice([1.1, 1.3, 1.6, 2.2]) * s * 4), 255, -1, cv2.LINE_AA, 2)
    sky.lift(stars.astype(np.float32) / 255, 0.9, soft=0.8 * s)
    sky.A[:] = 1.0


def paint_town(sky: Sheet, S: Shapes, horizon: float, s: float, seed: int) -> None:
    """Two rows of roofs against the last light, a few windows already lit."""
    H, W = S.h, S.w
    r = rng(seed)
    rows = [  # base, hmin, hmax, wmin, wmax, colour, strength, lit probability, ink darkness
        (horizon, 70, 250, 90, 230, "#6f6aa6", 1.0, 0.10, 0.35),
        (horizon + 60 * s, 30, 150, 120, 300, "#2b2c58", 1.55, 0.16, 0.6),
    ]
    for ri, (base, hmin, hmax, wmin, wmax, colour, strength, lit_p, inkd) in enumerate(rows):
        polys, wins, dark, roofs = [], [], [], []
        x = -80.0 * s
        while x < W + 80 * s:
            bw = r.uniform(wmin, wmax) * s
            bh = r.uniform(hmin, hmax) * s
            top = base - bh
            kind = r.choice(["flat", "flat", "pitch", "step", "pitch"])
            wtop = top
            if kind == "flat":
                polys.append([(x, top), (x + bw, top), (x + bw, H), (x, H)])
                roofs.append([(x, top), (x + bw, top)])
            elif kind == "pitch":
                rise = bw * r.uniform(0.18, 0.32)
                peak = x + bw * r.uniform(0.4, 0.6)
                polys.append([(x, top + rise), (peak, top), (x + bw, top + rise), (x + bw, H), (x, H)])
                roofs.append([(x, top + rise), (peak, top), (x + bw, top + rise)])
                wtop = top + rise
                if r.random() < 0.6:                                  # a chimney
                    cxm = x + bw * r.uniform(0.15, 0.85)
                    polys.append([(cxm, top - 6 * s), (cxm + 16 * s, top - 6 * s), (cxm + 16 * s, top + rise), (cxm, top + rise)])
            else:
                inset = bw * r.uniform(0.15, 0.3)
                up = r.uniform(26, 60) * s
                polys.append([(x, top), (x + bw, top), (x + bw, H), (x, H)])
                polys.append([(x + inset, top - up), (x + bw - inset * 0.6, top - up), (x + bw - inset * 0.6, top), (x + inset, top)])
                roofs.append([(x, top), (x + inset, top), (x + inset, top - up), (x + bw - inset * 0.6, top - up),
                              (x + bw - inset * 0.6, top), (x + bw, top)])
            ww, wh = r.uniform(8, 11) * s, r.uniform(12, 17) * s
            px, py = ww + r.uniform(12, 18) * s, wh + r.uniform(13, 20) * s
            wy = wtop + 20 * s
            warm_floor = r.random() < 0.5
            while wy < base + 90 * s:
                wx = x + 14 * s
                row_lit = warm_floor and r.random() < 0.25
                while wx + ww < x + bw - 12 * s:
                    u = r.random()
                    q = [(wx, wy), (wx + ww, wy), (wx + ww, wy + wh), (wx, wy + wh)]
                    if u < lit_p or (row_lit and u < 0.6):
                        wins.append(q)
                    elif u > 0.72:
                        dark.append(q)
                    wx += px
                wy += py
            x += bw + r.uniform(-10, 16) * s
        sky.block(S.polys(polys), colour, strength, wobble=2.0 * s, wobble_cell=50 * s, edge=0.45, edge_w=6 * s,
                  bloom=0.5, bloom_cell=130 * s, granulate=0.45)
        if dark:
            sky.glaze(S.polys(dark), "#23244c", 0.35, wobble=0, soft=0.7 * s, edge=0.2, edge_w=2, bloom=0)
        if wins:
            lit = S.polys(wins)
            sky.lift(blur(lit, 7 * s) * 1.6, 0.30, soft=1)             # the glow around a lit window
            sky.glaze(np.clip(blur(lit, 7 * s) * 1.6, 0, 1), WARM, 0.22, wobble=0, soft=1, edge=0, bloom=0)
            sky.lift(lit, 0.96, soft=0.6 * s)
            sky.glaze(lit, "#ffb040", 0.62, wobble=0.6, soft=0.6 * s, edge=0.5, edge_w=2 * s, bloom=0, granulate=0.1)
        for rf in roofs:
            if r.random() < 0.8:
                sky.ink_poly(rf, width=1.5 * s, closed=False, over=3 * s, darkness=inkd, tremor=0.6)
        # aerials
        for _ in range(int(W / (420 * s))):
            ax = r.uniform(0, W)
            ay = base - r.uniform(hmin, hmax) * s * 0.9
            sky.ink_line((ax, ay + 40 * s), (ax + r.normal(0, 2), ay - r.uniform(20, 60) * s), width=1.2 * s,
                         darkness=inkd, over=1)
    sky.A[:] = 1.0


# -- the window (in the room layer) -------------------------------------------

def window(room: Sheet, S: Shapes, rect, cols: int, rows: int, s: float, frame="#7b7392", sill=True) -> None:
    """A sash window: the panes are cut out of the layer, the frame is painted and inked."""
    x0, y0, x1, y1 = rect
    fw = 30 * s                      # outer frame
    mw = 13 * s                      # glazing bars
    outer = S.rect(x0 - fw, y0 - fw, x1 + fw, y1 + fw)
    shape = room.block(outer, frame, 0.95, wobble=1.6 * s, wobble_cell=90 * s, edge=0.4, edge_w=5 * s,
                       bloom=0.45, bloom_cell=160 * s, streak=0.2, streak_cell=18 * s)
    # the reveal: the frame's inner faces are in shadow on the top and lit side
    room.glaze(S.rect(x0 - fw, y0 - fw, x1 + fw, y0 - fw * 0.35) * shape, SHADOW, 0.45, wobble=1, soft=2, edge=0.2)
    panes, pane_rects = [], []
    pw = (x1 - x0 - mw * (cols - 1)) / cols
    ph = (y1 - y0 - mw * (rows - 1)) / rows
    for j in range(rows):
        for i in range(cols):
            px0 = x0 + i * (pw + mw)
            py0 = y0 + j * (ph + mw)
            pane_rects.append((px0, py0, px0 + pw, py0 + ph))
            panes.append([(px0, py0), (px0 + pw, py0), (px0 + pw, py0 + ph), (px0, py0 + ph)])
    hole = room.warp(S.polys(panes), 1.4 * s, 80 * s)
    room.cut(hole, soft=0.8)
    # pen: outer frame, then each pane with its own four pulls
    room.ink_poly([(x0 - fw, y0 - fw), (x1 + fw, y0 - fw), (x1 + fw, y1 + fw), (x0 - fw, y1 + fw)],
                  width=2.6 * s, over=7 * s)
    for (a, b, c, d) in pane_rects:
        room.ink_poly([(a, b), (c, b), (c, d), (a, d)], width=1.9 * s, over=5 * s, darkness=0.85)
        # a second, lighter line for the putty edge on two sides
        room.ink_line((a + 5 * s, b + 6 * s), (a + 5 * s, d - 3 * s), width=1.1 * s, darkness=0.45, over=0)
        room.ink_line((a + 5 * s, d - 5 * s), (c - 4 * s, d - 5 * s), width=1.1 * s, darkness=0.45, over=0)
    if sill:
        sx0, sx1 = x0 - fw - 34 * s, x1 + fw + 34 * s
        sy0, sy1 = y1 + fw, y1 + fw + 34 * s
        ledge = room.block(S.poly([(sx0 + 12 * s, sy0), (sx1 - 12 * s, sy0), (sx1, sy1), (sx0, sy1)]),
                           "#a79db4", 0.8, wobble=1.4 * s, edge=0.4, edge_w=4 * s, bloom=0.4, bloom_cell=120 * s)
        room.glaze(S.rect(sx0, sy1 - 2 * s, sx1, sy1 + 26 * s), SHADOW, 0.6, wobble=3 * s, soft=5 * s, edge=0,
                   wet=5 * s)                                           # the sill's own shadow on the wall
        room.ink_line((sx0, sy1), (sx1, sy1), width=2.6 * s, over=6 * s)
        room.ink_line((sx0 + 12 * s, sy0), (sx0, sy1), width=1.8 * s, over=2 * s)
        room.ink_line((sx1 - 12 * s, sy0), (sx1, sy1), width=1.8 * s, over=2 * s)


def curtain(room: Sheet, S: Shapes, x0, x1, y0, y1, s: float, seed: int, colour="#c9b8a6") -> None:
    """A drawn-back curtain: vertical folds, each a streak of shadow run wet into the cloth."""
    r = rng(seed)
    n = 40
    ys = np.linspace(y0, y1, n)
    sway = (x1 - x0) * 0.10 * np.sin(np.linspace(0, 2.2, n))
    right = np.stack([x1 + sway + r.normal(0, 2 * s, n).cumsum() * 0.3, ys], 1)
    left = np.stack([np.full(n, x0), ys], 1)
    poly = np.concatenate([left, right[::-1]])
    shape = room.block(S.poly(poly), colour, 0.9, wobble=3 * s, wobble_cell=140 * s, edge=0.45, edge_w=6 * s,
                       bloom=0.5, bloom_cell=200 * s, streak=0.35, streak_cell=22 * s, streak_stretch=16,
                       vertical=True)
    folds = int((x1 - x0) / (46 * s))
    for i in range(folds):
        fx = x0 + (i + r.uniform(0.2, 0.9)) * (x1 - x0) / folds
        top = (fx + r.normal(0, 6 * s), y0)
        bot = (fx + sway[-1] * (fx - x0) / (x1 - x0) + r.normal(0, 8 * s), y1)
        c = bezier(top, ((top[0] + bot[0]) / 2 + r.normal(0, 10 * s), (y0 + y1) / 2), bot, 40)
        room.glaze(S.stroke(c, r.uniform(10, 24) * s) * shape, SHADOW, r.uniform(0.35, 0.7), wobble=2 * s,
                   soft=3 * s, edge=0.15, wet=5 * s, bloom=0.3)
        if r.random() < 0.75:
            a, b = sorted(r.uniform(0.02, 0.98, 2))
            if b - a > 0.2:
                room.ink(c[int(a * 39):int(b * 39) + 1], width=1.5 * s, darkness=0.7, tremor=1.2)
    room.ink(right, width=2.2 * s, tremor=1.2)
    room.ink_line((x0, y0), (x1 + sway[0], y0), width=1.8 * s, over=3 * s)


# -- desk things --------------------------------------------------------------

def monitor(d: Sheet, S: Shapes, scr, desk_y: float, s: float) -> None:
    """A flat monitor seen square-on. The screen itself is forced flat afterwards."""
    x, y, w, h = scr
    b, chin = 20 * s, 34 * s
    ox0, oy0, ox1, oy1 = x - b, y - b, x + w + b, y + h + chin
    cx = x + w / 2
    foot_y = desk_y + 78 * s
    # stand first: it is behind the panel
    base = d.block(S.ellipse(cx, foot_y, 230 * s, 30 * s), "#3a3b52", 1.25, wobble=1.5 * s, edge=0.5, edge_w=4 * s,
                   bloom=0.4, bloom_cell=90 * s)
    d.glaze(S.ellipse(cx + 30 * s, foot_y + 6 * s, 190 * s, 20 * s) * base, SHADOW, 0.5, wobble=2, soft=4, edge=0, wet=4)
    neck = d.block(S.poly([(cx - 58 * s, oy1 - 10 * s), (cx + 58 * s, oy1 - 10 * s), (cx + 70 * s, foot_y - 4 * s),
                           (cx - 70 * s, foot_y - 4 * s)]), "#34354c", 1.35, wobble=1.5 * s, edge=0.45,
                   edge_w=4 * s, bloom=0.4, bloom_cell=70 * s)
    d.lift(S.rect(cx - 44 * s, oy1 + 8 * s, cx - 30 * s, foot_y - 20 * s), 0.35, soft=4 * s)
    panel = d.block(S.rect(ox0, oy0, ox1, oy1, 16 * s), "#3d3f5a", 1.3, wobble=1.3 * s, wobble_cell=120 * s,
                    edge=0.4, edge_w=5 * s, bloom=0.35, bloom_cell=200 * s, granulate=0.5)
    # the top edge catches the last of the window light
    d.lift(S.rect(ox0 + 20 * s, oy0 + 3 * s, ox1 - 20 * s, oy0 + 8 * s), 0.4, soft=2 * s)
    d.ink_poly(rrect_pts(ox0, oy0, ox1, oy1, 16 * s, 3), width=3.0 * s, over=0, tremor=0.6)
    d.ink_poly([(x - 3 * s, y - 3 * s), (x + w + 3 * s, y - 3 * s), (x + w + 3 * s, y + h + 3 * s), (x - 3 * s, y + h + 3 * s)],
               width=1.6 * s, over=2 * s, tremor=0.4, darkness=0.9)
    d.ink_line((ox0 + 6 * s, oy1 + 3 * s), (ox1 - 8 * s, oy1 + 3 * s), width=2.0 * s, over=4 * s, darkness=0.8)
    d.ink_line((cx - 58 * s, oy1), (cx - 70 * s, foot_y - 6 * s), width=2.2 * s, over=2 * s)
    d.ink_line((cx + 58 * s, oy1), (cx + 70 * s, foot_y - 6 * s), width=2.2 * s, over=2 * s)
    d.ink_curve(arc_pts(cx, foot_y, 230 * s, 30 * s, 8, 352, 90), width=2.3 * s, parts=2)
    d.hatch(S.poly([(cx + 10 * s, oy1 + 6 * s), (cx + 56 * s, oy1 + 6 * s), (cx + 66 * s, foot_y - 10 * s),
                    (cx + 16 * s, foot_y - 10 * s)]), angle=62, spacing=8 * s, width=1.2 * s, darkness=0.55)


def keyboard(d: Sheet, S: Shapes, quad, s: float, rows: int = 5, cols: int = 15, seed: int = 5) -> None:
    """quad: back-left, back-right, front-right, front-left."""
    bl, br, fr, fl = [np.asarray(p, np.float32) for p in quad]
    body = d.block(S.poly(rrect_quad(bl, br, fr, fl)), "#3f4058", 1.2, wobble=1.6 * s, edge=0.5, edge_w=4 * s,
                   bloom=0.4, bloom_cell=120 * s)
    lip = 12 * s
    d.glaze(S.poly([fl, fr, fr + [0, lip], fl + [0, lip]]), "#2a2b40", 1.3, wobble=1.2 * s, soft=1, edge=0.4,
            edge_w=3, cover=True)

    def at(u, v):
        top = bl + (br - bl) * u
        bot = fl + (fr - fl) * u
        return top + (bot - top) * v

    r = rng(seed)
    keys = []
    mu, mv = 0.022, 0.09
    for j in range(rows):
        v0 = mv + (1 - 2 * mv) * j / rows
        v1 = mv + (1 - 2 * mv) * (j + 0.80) / rows
        if j == rows - 1:
            spans = [(0, 1.3), (1.3, 2.5), (2.5, 3.7), (3.7, 10.2), (10.2, 11.4), (11.4, 12.6), (12.6, 13.8), (13.8, 15)]
        else:
            off = [0, 0.5, 0.75, 1.25, 0][j % 5]
            edges = [0] + [off + k for k in range(1, cols)] + [cols]
            edges = sorted(set(e for e in edges if 0 <= e <= cols))
            spans = list(zip(edges[:-1], edges[1:]))
        for a, b in spans:
            if b - a < 0.3:
                continue
            u0 = mu + (1 - 2 * mu) * (a + 0.10) / cols
            u1 = mu + (1 - 2 * mu) * (b - 0.10) / cols
            keys.append([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)])
    km = S.polys(keys)
    d.lift(km, 0.5, soft=0.8 * s)
    d.glaze(km, "#9aa3bd", 0.28, wobble=0.8, soft=0.7 * s, edge=0.5, edge_w=2 * s, bloom=0.3, bloom_cell=60 * s)
    d.ink_poly([bl, br, fr, fl], width=2.3 * s, over=5 * s)
    d.ink_line(fl + [0, lip], fr + [0, lip], width=2.0 * s, over=3 * s, darkness=0.9)
    for j in range(1, rows):
        v = mv + (1 - 2 * mv) * (j - 0.10) / rows
        d.ink_line(at(mu, v), at(1 - mu, v), width=1.0 * s, darkness=0.5, over=0, tremor=0.5)


def rrect_quad(bl, br, fr, fl):
    return np.array([bl, br, fr, fl], np.float32)


def mug(d: Sheet, S: Shapes, cx: float, by: float, w: float, h: float, s: float, colour="#c2553a",
        light: int = 1, handle: int = -1, coffee: bool = True):
    """A mug, lit from the `light` side (+1 = right). Returns its rect (x, y, w, h)."""
    ry = w * 0.15
    top = by - h
    wb = w * 0.88
    hx = cx + handle * (w / 2 - w * 0.02)
    hcy = top + h * 0.50
    a0, a1 = (-105, 105) if handle > 0 else (75, 285)
    harc = arc_pts(hx, hcy, w * 0.30, h * 0.29, a0, a1, 40)
    hshape = d.block(S.stroke(harc, w * 0.105), colour, 1.2, wobble=1.2 * s, edge=0.5, edge_w=3 * s, bloom=0.3,
                     bloom_cell=40 * s)
    d.glaze(hshape * (S.Y > hcy), SHADOW, 0.5, wobble=1, soft=3 * s, edge=0, wet=3 * s)
    body_pts = np.concatenate([
        [(cx + w / 2, top)],
        arc_pts(cx, by - ry * 0.85, wb / 2, ry * 0.85, 0, 180, 30),
        [(cx - w / 2, top)],
        arc_pts(cx, top, w / 2, ry, 180, 360, 30),
    ])
    body = d.block(S.poly(body_pts), colour, 1.15, wobble=1.5 * s, wobble_cell=70 * s, edge=0.5, edge_w=5 * s,
                   bloom=0.5, bloom_cell=90 * s, granulate=0.4)
    # form shadow on the side away from the light, laid wet so it has no edge on the lit side
    turn = smoothstep(0.15, -0.55, (S.X - cx) / (w / 2) * light)
    d.glaze(body * turn, SHADOW, 0.85, wobble=2 * s, soft=4 * s, edge=0.1, wet=7 * s, bloom=0.3)
    d.glaze(body * turn * smoothstep(top, by, S.Y), "#5a2a2a", 0.35, wobble=2 * s, soft=4 * s, edge=0, wet=6 * s)
    # highlight: a strip of nearly bare paper
    hxs = cx + light * w * 0.24
    d.lift(S.rect(hxs - w * 0.035, top + ry + h * 0.08, hxs + w * 0.035, by - ry - h * 0.12, w * 0.03), 0.62, soft=3 * s)
    # the rim and what is inside
    d.block(S.ellipse(cx, top, w / 2, ry), "#e9d3c0", 0.55, wobble=0.8 * s, edge=0.4, edge_w=2.5 * s, bloom=0.2)
    if coffee:
        d.block(S.ellipse(cx, top + ry * 0.22, w / 2 * 0.86, ry * 0.70), "#4b2d1f", 1.35, wobble=0.8 * s, edge=0.5,
                edge_w=3 * s, bloom=0.4, bloom_cell=40 * s)
        d.lift(S.ellipse(cx - light * w * 0.12, top + ry * 0.12, w * 0.13, ry * 0.16), 0.5, soft=3 * s)
    else:
        d.glaze(S.ellipse(cx - light * w * 0.08, top + ry * 0.2, w / 2 * 0.8, ry * 0.66), SHADOW, 0.6, wobble=1,
                soft=3 * s, edge=0.2, wet=3 * s)
    # pen
    d.ink_line((cx - w / 2, top), (cx - wb / 2, by - ry * 0.85), width=2.3 * s, over=1)
    d.ink_line((cx + w / 2, top), (cx + wb / 2, by - ry * 0.85), width=2.3 * s, over=1)
    d.ink_curve(arc_pts(cx, by - ry * 0.85, wb / 2, ry * 0.85, 2, 178, 40), width=2.4 * s)
    d.ink_curve(arc_pts(cx, top, w / 2, ry, 100, 455, 60), width=2.0 * s, parts=2)
    d.ink_curve(arc_pts(cx, top + ry * 0.22, w / 2 * 0.86, ry * 0.70, 15, 165, 30), width=1.3 * s, darkness=0.7)
    d.ink_curve(arc_pts(hx, hcy, w * 0.30 + w * 0.052, h * 0.29 + w * 0.052, a0 + 4, a1 - 4, 40), width=2.1 * s)
    d.ink_curve(arc_pts(hx, hcy, w * 0.30 - w * 0.052, h * 0.29 - w * 0.052, a0 + 10, a1 - 10, 30), width=1.6 * s,
                darkness=0.85)
    x0 = min(cx - w / 2, hx - w * 0.36) if handle < 0 else cx - w / 2
    x1 = max(cx + w / 2, hx + w * 0.36) if handle > 0 else cx + w / 2
    return dict(x=int(round(x0)), y=int(round(top - ry)), w=int(round(x1 - x0)), h=int(round(h + ry)))


def lamp(d: Sheet, S: Shapes, base, elbow, head, aim, s: float, shade="#d59a3c") -> dict:
    """An anglepoise: a round foot, two arms, a conical shade whose mouth glows."""
    base, elbow, head = [np.asarray(p, np.float32) for p in (base, elbow, head)]
    u = norm(aim)
    v = np.array([-u[1], u[0]], np.float32)
    metal = "#34364e"
    L, R, rn = 190 * s, 128 * s, 36 * s
    mouth = head + u * L
    # arms (behind the shade)
    for a, b in [(base + [0, -18 * s], elbow), (elbow, head)]:
        arm = d.block(S.stroke([a, b], 13 * s), metal, 1.4, wobble=0.8 * s, edge=0.4, edge_w=2.5 * s, bloom=0.2)
        n = norm(b - a)
        nn = np.array([-n[1], n[0]], np.float32) * 6.5 * s
        d.ink_line(a + nn, b + nn, width=1.8 * s, over=2 * s)
        d.ink_line(a - nn, b - nn, width=1.8 * s, over=2 * s)
    for c in (elbow, head):
        d.block(S.ellipse(c[0], c[1], 13 * s, 13 * s), "#2a2b40", 1.5, wobble=0.6 * s, edge=0.4, edge_w=2 * s, bloom=0)
        d.ink_curve(arc_pts(c[0], c[1], 13 * s, 13 * s, 20, 370, 24), width=1.6 * s)
    # the foot
    foot = d.block(S.ellipse(base[0], base[1], 120 * s, 24 * s), metal, 1.35, wobble=1.2 * s, edge=0.5, edge_w=4 * s,
                   bloom=0.4, bloom_cell=80 * s)
    d.block(S.poly([(base[0] - 120 * s, base[1]), (base[0] + 120 * s, base[1]), (base[0] + 120 * s, base[1] + 16 * s),
                    (base[0] - 120 * s, base[1] + 16 * s)]) + S.ellipse(base[0], base[1] + 16 * s, 120 * s, 24 * s),
            "#26273a", 1.5, wobble=1.0 * s, edge=0.4, edge_w=3 * s, bloom=0.3)
    foot = d.block(S.ellipse(base[0], base[1], 120 * s, 24 * s), metal, 1.2, wobble=1.0 * s, edge=0.5, edge_w=4 * s,
                   bloom=0.4, bloom_cell=80 * s)
    d.lift(S.ellipse(base[0] - 20 * s, base[1] - 4 * s, 70 * s, 8 * s), 0.35, soft=4 * s)
    d.ink_curve(arc_pts(base[0], base[1], 120 * s, 24 * s, 10, 365, 60), width=2.1 * s, parts=2)
    d.ink_curve(arc_pts(base[0], base[1] + 16 * s, 120 * s, 24 * s, 0, 180, 40), width=2.3 * s)
    # the shade: mouth ellipse first (its far lip), then the cone over its near half
    ang = float(np.degrees(np.arctan2(v[1], v[0])))
    glow = d.block(S.ellipse(mouth[0], mouth[1], R, R * 0.36, ang), "#fff0b8", 0.5, wobble=1.0 * s, edge=0.5,
                   edge_w=4 * s, bloom=0.2)
    d.glaze(glow, WARM, 0.35, wobble=1, soft=2 * s, edge=0.6, edge_w=7 * s, bloom=0.3)
    d.lift(S.ellipse(mouth[0], mouth[1], R * 0.5, R * 0.16, ang), 0.85, soft=6 * s)        # the bulb's glare
    cone_pts = np.concatenate([[head - v * rn, head + v * rn],
                               arc_pts(mouth[0], mouth[1], R, R * 0.36, 0, -180, 30, rot=ang)[::1]])
    # the near edge of the mouth is the half of the ellipse on the head's side
    near = arc_pts(mouth[0], mouth[1], R, R * 0.36, 0, -180, 30, rot=ang)
    if np.dot(near[15] - mouth, u) > 0:
        near = arc_pts(mouth[0], mouth[1], R, R * 0.36, 0, 180, 30, rot=ang)
    cone_pts = np.concatenate([[head - v * rn], [head + v * rn], near])
    cone = d.block(S.poly(cone_pts), shade, 1.25, wobble=1.4 * s, wobble_cell=70 * s, edge=0.5, edge_w=5 * s,
                   bloom=0.5, bloom_cell=80 * s, granulate=0.4)
    side = (S.X - head[0]) * v[0] + (S.Y - head[1]) * v[1]
    d.glaze(cone * smoothstep(-R * 0.2, R * 0.9, side * (1 if v[1] < 0 else -1)), SHADOW, 0.75, wobble=2 * s,
            soft=4 * s, edge=0.1, wet=6 * s)
    d.glaze(cone, "#8a3d22", 0.3, wobble=2 * s, soft=3 * s, edge=0.3, bloom=0.5, bloom_cell=50 * s)
    cap = d.block(S.ellipse(head[0], head[1], rn * 1.05, rn * 0.6, ang), metal, 1.4, wobble=0.8 * s, edge=0.4,
                  edge_w=2 * s, bloom=0.2)
    d.ink_line(head - v * rn, near[-1] if np.linalg.norm(near[-1] - (head - v * rn)) < np.linalg.norm(near[0] - (head - v * rn)) else near[0],
               width=2.3 * s, over=2 * s)
    d.ink_line(head + v * rn, near[0] if np.linalg.norm(near[0] - (head + v * rn)) < np.linalg.norm(near[-1] - (head + v * rn)) else near[-1],
               width=2.3 * s, over=2 * s)
    d.ink_curve(arc_pts(mouth[0], mouth[1], R, R * 0.36, 0, 360, 70, rot=ang), width=2.0 * s, parts=2)
    d.ink_curve(arc_pts(head[0], head[1], rn * 1.05, rn * 0.6, 0, 360, 30, rot=ang), width=1.6 * s)
    return dict(mouth=mouth, u=u)


def plant(d: Sheet, S: Shapes, cx: float, by: float, pw: float, ph: float, s: float, seed: int,
          leaves: int = 17, reach: float = 300.0, spread: float = 1.0, pot="#d9b48c", light: int = 1,
          dusk: float = 0.0) -> None:
    """A pot plant: stems fanning from the pot, one reserved wash per leaf, a midrib in pen."""
    r = rng(seed)
    top = by - ph
    greens = ["#9ab873", "#74a068", "#528564", "#3f6f5f"]
    order = sorted(range(leaves), key=lambda i: r.random())
    specs = []
    for i in range(leaves):
        ang = (i / (leaves - 1) - 0.5) * 2 * spread + r.normal(0, 0.10)
        ln = reach * s * r.uniform(0.62, 1.0) * (1.0 - 0.25 * abs(ang) / max(spread, 1e-3))
        root = np.array([cx + r.normal(0, pw * 0.12), top + 6 * s], np.float32)
        droop = 0.18 * ln * np.sign(ang) * abs(ang) ** 1.3
        tip = root + [np.sin(ang) * ln + droop, -np.cos(ang) * ln + abs(droop) * 0.9]
        ctrl = root + [np.sin(ang) * ln * 0.35, -np.cos(ang) * ln * 0.62]
        stem = bezier(root, ctrl, tip, 30)
        specs.append((ang, stem, ln))
    front = []
    for k in order:
        ang, stem, ln = specs[k]
        if abs(ang) > spread * 0.72 and r.random() < 0.6:
            front.append(k)
            continue
        _leaf(d, S, stem, ln, s, r, greens, light, dusk)
    # the pot
    rim_h = ph * 0.2
    body = d.block(S.poly([(cx - pw * 0.50, top + rim_h), (cx + pw * 0.50, top + rim_h), (cx + pw * 0.37, by),
                           (cx - pw * 0.37, by)]) + S.ellipse(cx, by, pw * 0.37, pw * 0.055),
                   pot, 1.0, wobble=1.4 * s, edge=0.5, edge_w=4 * s, bloom=0.5, bloom_cell=70 * s, granulate=0.45)
    rim = d.block(S.rect(cx - pw * 0.56, top, cx + pw * 0.56, top + rim_h, 4 * s), pot, 0.85, wobble=1.2 * s, edge=0.5,
                  edge_w=3 * s, bloom=0.3, bloom_cell=60 * s)
    both = np.maximum(body, rim)
    d.glaze(both * smoothstep(0.1, -0.7, (S.X - cx) / (pw / 2) * light), SHADOW, 0.8, wobble=2 * s, soft=4 * s,
            edge=0.1, wet=6 * s)
    d.glaze(S.rect(cx - pw * 0.5, top + rim_h, cx + pw * 0.5, top + rim_h + 9 * s) * body, SHADOW, 0.5, wobble=1,
            soft=2 * s, edge=0)
    d.ink_poly([(cx - pw * 0.56, top), (cx + pw * 0.56, top), (cx + pw * 0.56, top + rim_h), (cx - pw * 0.56, top + rim_h)],
               width=2.0 * s, over=3 * s)
    d.ink_line((cx - pw * 0.50, top + rim_h), (cx - pw * 0.37, by), width=2.2 * s, over=1)
    d.ink_line((cx + pw * 0.50, top + rim_h), (cx + pw * 0.37, by), width=2.2 * s, over=1)
    d.ink_curve(arc_pts(cx, by, pw * 0.37, pw * 0.055, 4, 176, 30), width=2.2 * s)
    for k in front:
        ang, stem, ln = specs[k]
        _leaf(d, S, stem, ln, s, r, greens, light, dusk)


def _leaf(d, S, stem, ln, s, r, greens, light, dusk):
    k0 = int(len(stem) * r.uniform(0.34, 0.46))
    base, tip = stem[k0], stem[-1]
    width = ln * r.uniform(0.11, 0.16)
    bend = r.normal(0, ln * 0.035) + (tip[0] - base[0]) * 0.06
    poly, spine = leaf_poly(base, tip, bend, width, fat=0.62)
    d.ink(stem[:k0 + 2], width=2.0 * s, darkness=0.9, tremor=0.5)
    col = greens[int(r.integers(0, len(greens)))]
    shape = d.block(S.poly(poly), col, 0.95 + 0.25 * r.random(), wobble=1.8 * s, wobble_cell=40 * s, edge=0.7,
                    edge_w=3.5 * s, bloom=0.8, bloom_cell=36 * s, granulate=0.4)
    # a darker green charged in at the base while the leaf was wet
    d.glaze(shape * smoothstep(0.75, 0.0, np.hypot(S.X - base[0], S.Y - base[1]) / (ln * 0.6)), "#2b5a52", 0.5,
            wobble=2 * s, soft=3 * s, edge=0, wet=5 * s, bloom=0.4, bloom_cell=30 * s)
    # one half of the blade turns from the light
    half, _ = leaf_poly(base, tip, bend + width * 0.55 * light, width * 0.55, fat=0.62)
    d.glaze(S.poly(half) * shape, "#1f3d44", 0.38, wobble=1.5 * s, soft=1.5 * s, edge=0.3, edge_w=3 * s, wet=2 * s)
    if dusk > 0:
        d.glaze(shape, SHADOW, dusk, wobble=0, soft=1.5, edge=0.2, bloom=0.4, bloom_cell=40 * s)
    d.ink(spine[1:-1], width=1.5 * s, darkness=0.8, tremor=0.5, lift=0.4)
    if r.random() < 0.7:
        edge = poly[: len(poly) // 2] if r.random() < 0.5 else poly[len(poly) // 2:]
        d.ink(edge[2:-1], width=1.3 * s, darkness=0.7, tremor=0.6, lift=0.35)


def kettle(d: Sheet, S: Shapes, cx: float, by: float, rr: float, hgt: float, s: float, light: int = -1,
           spout: int = 1, body_col="#8f9ab3") -> None:
    """A stovetop kettle: a squat dome, a swan spout, a bail handle over the lid."""
    t = np.linspace(0, np.pi, 60)
    bx = cx + rr * np.sign(np.cos(t)) * np.abs(np.cos(t)) ** 0.5
    byy = by - rr * 0.07 - hgt * np.sin(t) ** 0.78
    dome = np.stack([bx, byy], 1)
    foot = arc_pts(cx, by - rr * 0.07, rr, rr * 0.07, 180, 0, 20)       # left -> bottom -> right
    body_pts = np.concatenate([dome, foot])
    topy = by - rr * 0.07 - hgt
    dark = "#262738"
    # handle: behind the body, in front of nothing
    hc = (cx, topy + hgt * 0.16)
    harc = arc_pts(hc[0], hc[1], rr * 0.74, hgt * 0.74, 188, 352, 50)
    d.block(S.stroke(harc, rr * 0.085), dark, 1.6, wobble=1.0 * s, edge=0.4, edge_w=3 * s, bloom=0.3, bloom_cell=40 * s)
    d.lift(S.stroke(arc_pts(hc[0], hc[1] - rr * 0.015, rr * 0.74, hgt * 0.74, 215, 262, 20), rr * 0.018), 0.45, soft=2 * s)
    d.ink_curve(arc_pts(hc[0], hc[1], rr * 0.74 + rr * 0.045, hgt * 0.74 + rr * 0.045, 188, 352, 50), width=2.2 * s, parts=2)
    d.ink_curve(arc_pts(hc[0], hc[1], rr * 0.74 - rr * 0.045, hgt * 0.74 - rr * 0.045, 192, 348, 50), width=1.7 * s,
                darkness=0.85)
    # spout
    p0 = np.array([cx + spout * rr * 0.80, by - hgt * 0.36], np.float32)
    p1 = np.array([cx + spout * rr * 1.32, by - hgt * 0.42], np.float32)
    p2 = np.array([cx + spout * rr * 1.50, by - hgt * 0.96], np.float32)
    sc = bezier(p0, p1, p2, 30)
    wds = np.linspace(rr * 0.40, rr * 0.13, 30)
    sp = d.block(S.stroke(sc, wds), body_col, 1.05, wobble=1.0 * s, edge=0.5, edge_w=3.5 * s, bloom=0.4, bloom_cell=40 * s)
    d.glaze(sp * smoothstep(by - hgt, by - hgt * 0.3, S.Y), SHADOW, 0.7, wobble=1, soft=3 * s, edge=0.1, wet=4 * s)
    g = np.gradient(sc, axis=0)
    nrm = np.stack([-g[:, 1], g[:, 0]], 1)
    nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6)
    d.ink(sc + nrm * wds[:, None] / 2, width=2.2 * s)
    d.ink(sc - nrm * wds[:, None] / 2, width=2.2 * s)
    d.ink_curve(arc_pts(p2[0], p2[1], rr * 0.07, rr * 0.035, 0, 360, 16), width=1.4 * s)
    # body
    body = d.block(S.poly(body_pts), body_col, 1.05, wobble=1.6 * s, wobble_cell=90 * s, edge=0.5, edge_w=6 * s,
                   bloom=0.55, bloom_cell=110 * s, granulate=0.5)
    turn = smoothstep(0.0, -0.9, (S.X - cx) / rr * light)
    d.glaze(body * turn, SHADOW, 1.0, wobble=3 * s, soft=5 * s, edge=0.1, wet=9 * s, bloom=0.3)
    d.glaze(body * smoothstep(by - hgt * 0.30, by, S.Y), "#3c3a5c", 0.55, wobble=3 * s, soft=4 * s, edge=0.2, wet=6 * s)
    # what a polished side picks up: the warm room on one flank, the dusk window on the other
    d.glaze(body * S.gauss(cx + light * rr * 0.55, by - hgt * 0.42, rr * 0.30, hgt * 0.42), WARM, 0.5, wobble=2 * s,
            soft=4 * s, edge=0, wet=5 * s)
    d.lift(S.stroke(bezier((cx + light * rr * 0.60, by - hgt * 0.72), (cx + light * rr * 0.80, by - hgt * 0.45),
                           (cx + light * rr * 0.74, by - hgt * 0.20), 20), rr * 0.07) * body, 0.72, soft=3 * s)
    d.lift(S.stroke(bezier((cx - light * rr * 0.74, by - hgt * 0.62), (cx - light * rr * 0.86, by - hgt * 0.42),
                           (cx - light * rr * 0.80, by - hgt * 0.24), 20), rr * 0.035) * body, 0.4, soft=3 * s)
    # lid and knob
    d.block(S.ellipse(cx, topy + hgt * 0.035, rr * 0.44, rr * 0.085), "#6f7892", 1.1, wobble=0.8 * s, edge=0.5,
            edge_w=3 * s, bloom=0.3)
    d.block(S.ellipse(cx, topy - rr * 0.04, rr * 0.10, rr * 0.085), dark, 1.5, wobble=0.6 * s, edge=0.4, edge_w=2 * s,
            bloom=0.2)
    d.ink(dome[2:31], width=2.5 * s)
    d.ink(dome[29:58][::-1], width=2.5 * s)
    d.ink_curve(foot, width=2.4 * s)
    d.ink_curve(arc_pts(cx, by - hgt * 0.16, rr * 0.985, rr * 0.07, 12, 168, 30), width=1.3 * s, darkness=0.6)
    d.ink_curve(arc_pts(cx, topy + hgt * 0.035, rr * 0.44, rr * 0.085, 0, 360, 40), width=1.8 * s, parts=2)
    d.ink_curve(arc_pts(cx, topy - rr * 0.04, rr * 0.10, rr * 0.085, 150, 400, 20), width=1.6 * s)
    d.hatch(S.poly(body_pts) * (turn > 0.75) * (S.Y > by - hgt * 0.62), angle=68, spacing=10 * s, width=1.2 * s,
            darkness=0.45)


def cast_shadow(d: Sheet, S: Shapes, cx, cy, rx, ry, strength=0.75, s=1.0, angle=0.0) -> None:
    m = S.ellipse(cx, cy, rx, ry, angle)
    d.glaze(m, SHADOW, strength, wobble=3 * s, soft=4 * s, edge=0.12, edge_w=6 * s, wet=7 * s, bloom=0.3,
            bloom_cell=60 * s)
    d.glaze(S.ellipse(cx, cy, rx * 0.6, ry * 0.55, angle), SHADOW, strength * 0.5, wobble=2 * s, soft=3 * s, edge=0,
            wet=4 * s, bloom=0)


def steam_layer(S: Shapes, cx: float, top: float, w: float, rise: float, s: float, seed: int):
    """Steam is light, not pigment: a separate layer of warm white with alpha.
    Three wisps that curl as they climb, thin and break up, each a soft ribbon."""
    r = rng(seed)
    H, W = S.h, S.w
    a = np.zeros((H, W), np.float32)
    for k in range(3):
        n = 70
        t = np.linspace(0, 1, n)
        ph = r.uniform(0, 6.28)
        reach = rise * (0.72, 1.0, 0.84)[k]
        amp = w * (0.05 + 0.30 * t ** 1.2)
        x = cx + (k - 1) * w * 0.24 + amp * np.sin(ph + t * r.uniform(5.0, 7.0)) + w * 0.30 * t ** 2 * (k - 0.6)
        y = top - t * reach
        width = w * (0.10 + 0.26 * t ** 0.8)
        ribbon = S.stroke(np.stack([x, y], 1), width)
        # it leaves the cup thin, is fullest a third of the way up, and is gone by the top
        u = np.clip((top - S.Y) / reach, 0, 1)
        ribbon *= smoothstep(0.0, 0.12, u) * (1 - u) ** 1.1
        a += (0.50 * blur(ribbon, 22 * s) + 0.42 * blur(ribbon, 8 * s)) * (1.0, 1.0, 0.8)[k]
    breakup = fbm(H, W, 80 * s, seed + 7, 4)
    curl = fbm(H, W, 26 * s, seed + 9, 3)
    a *= (0.45 + 1.1 * breakup) * (0.8 + 0.4 * curl)
    a = np.clip(a * 1.5, 0, 0.85)
    rgb = np.ones((H, W, 3), np.float32) * np.array([0.995, 0.975, 0.93], np.float32)[None, None, :]
    return rgb, a
