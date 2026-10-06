"""Procedural watercolour plates for the echook film.

No SVG, no generated imagery: every plate is a bitmap painted by code (see
engine.py for how a wash and a pen line are modelled, props.py for how each
object is painted). Each scene is split by depth into full-plate RGBA layers,
far to near, for the film to parallax; they stack with ordinary alpha blending.

    python art/paint.py                 # paint everything
    python art/paint.py --only desk     # one plate (art.json is merged, not replaced)

Writes public/art/<plate>/<layer>.webp, src/data/art.json and a flattened
.cache/art-preview/<plate>/preview.jpg. Deterministic: seeded throughout.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import (Paper, Shapes, Sheet, arc_pts, bezier, blur, fbm, leaf_poly, over, rng, save_webp,  # noqa: E402
                    smoothstep, hex_rgb, to_u8)
import props as P  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "public", "art")
PREVIEW = os.path.join(ROOT, ".cache", "art-preview")
ART_JSON = os.path.join(ROOT, "src", "data", "art.json")
SCREEN = "#0b0d0c"


# -- layouts ------------------------------------------------------------------
# All numbers are plate pixels. One scene function paints both orientations.

DESK = {
    "desk": dict(
        W=2880, H=1620, seed=100, horizon=800,
        window=(210, 140, 1320, 850), win_grid=(3, 2), curtain=(-80, 250),
        screen=(900, 300, 1160, 725), desk_y=1150, vp=(1440, 380),
        lamp=dict(base=(2500, 1262), elbow=(2660, 800), head=(2420, 548), aim=(-0.60, 0.80)),
        pool=(2140, 1345, 560, 190), wall_glow=(2330, 800, 700, 560),
        plant=dict(cx=520, by=1318, pw=190, ph=170, reach=440, leaves=17, spread=1.05),
        mug=dict(cx=2165, by=1418, w=150, h=165),
        keyboard=[(1140, 1272), (1820, 1272), (1872, 1402), (1088, 1402)],
        chair=dict(cx=1470, top=1462, half=470),
    ),
    "desk-portrait": dict(
        W=1620, H=2880, seed=200, horizon=760,
        window=(150, 430, 1470, 1300), win_grid=(3, 2), curtain=None,
        screen=(170, 880, 1280, 800), desk_y=1850, vp=(810, 900),
        lamp=dict(base=(1370, 2075), elbow=(1545, 1840), head=(1385, 1730), aim=(-0.80, 0.60)),
        pool=(1010, 2120, 520, 210), wall_glow=(1500, 1500, 500, 500),
        plant=dict(cx=215, by=2030, pw=170, ph=150, reach=250, leaves=14, spread=1.0),
        mug=dict(cx=330, by=2235, w=150, h=165),
        keyboard=[(500, 2020), (1150, 2020), (1200, 2160), (450, 2160)],
        chair=dict(cx=810, top=2400, half=450),
    ),
}

AWAY = {
    "away": dict(
        W=2880, H=1620, seed=300, horizon=905,
        window=(1300, 160, 2690, 940), win_grid=(3, 2),
        counter_y=1140, front_y=1475, tiles=(1010, 1140),
        wall_glow=(420, 420, 1150, 900),
        mug=dict(cx=1560, by=1350, w=250, h=265),
        kettle=dict(cx=2090, by=1300, rr=210, hgt=292),
        plant=dict(cx=2530, by=1290, pw=180, ph=160, reach=400, leaves=17, spread=1.05),
        foliage=dict(root=(-60, 1760), reach=760, a0=-0.25, a1=1.25),
        caption=(170, 170, 1000, 740),
    ),
    "away-portrait": dict(
        W=1620, H=2880, seed=400, horizon=1840,
        window=(250, 1120, 1380, 1880), win_grid=(2, 2),
        counter_y=2060, front_y=2440, tiles=(1950, 2060),
        wall_glow=(500, 700, 1100, 900),
        mug=dict(cx=640, by=2250, w=270, h=285),
        kettle=dict(cx=1160, by=2205, rr=195, hgt=272),
        plant=dict(cx=235, by=2190, pw=165, ph=150, reach=360, leaves=15, spread=0.95),
        foliage=dict(root=(-80, 3000), reach=640, a0=-0.1, a1=1.1),
        caption=(140, 420, 1340, 600),
    ),
}


def log(msg: str) -> None:
    print(msg, flush=True)


# -- shared -------------------------------------------------------------------

def paint_far(paper: Paper, S: Shapes, seed: int, horizon: float, s: float = 1.0) -> Sheet:
    sky = Sheet(paper, seed)
    P.paint_sky(sky, S, horizon, s, seed)
    P.paint_town(sky, S, horizon, s, seed + 50)
    return sky


def paint_wall(room: Sheet, S: Shapes, base: str, glow, s: float = 1.0, shadow: float = 0.85, warm: float = 0.4) -> np.ndarray:
    """The wall: one broad wash, then the evening laid over it everywhere the lamp does not reach."""
    H, W = S.h, S.w
    full = np.ones((H, W), np.float32)
    room.glaze(full, base, 0.9, wobble=0, soft=0, edge=0, bloom=0.5, bloom_cell=520 * s, granulate=0.45,
               streak=0.16, streak_cell=40 * s, streak_stretch=14, vertical=True, cover=True)
    lit = S.gauss(*glow, power=2.4)
    lit = np.clip(lit * (0.75 + 0.5 * fbm(H, W, 380 * s, room.seed + 3, 3)), 0, 1)
    room.glaze((1 - lit) ** 1.3, P.SHADOW, shadow, wobble=30 * s, wobble_cell=300 * s, soft=14 * s, edge=0,
               bloom=0.55, bloom_cell=420 * s, granulate=0.5, streak=0.2, streak_cell=50 * s, streak_stretch=10,
               vertical=True)
    room.glaze(lit ** 1.5, P.WARM, warm, wobble=20 * s, wobble_cell=300 * s, soft=14 * s, edge=0, bloom=0.4,
               bloom_cell=300 * s, granulate=0.3)
    # the wall was laid in several passes: each leaves a soft shape with a pooled edge
    for i in range(6):
        n = fbm(H, W, 520 * s, room.seed + 60 + i * 7, 4)
        patch = smoothstep(0.50, 0.53, n) * smoothstep(0.75, 0.70, n)
        room.glaze(patch, base if i % 2 else P.SHADOW, 0.07 + 0.03 * (i % 3), wobble=8 * s, soft=2.5 * s, edge=0.8,
                   edge_w=12 * s, bloom=0.3, granulate=0.3)
    # a few back-runs where the wall wash was still damp
    r = rng(room.seed + 11)
    runs = np.zeros((H, W), np.float32)
    for _ in range(5):
        cv2.circle(runs, (int(r.uniform(0, W)), int(r.uniform(0, H))), int(r.uniform(70, 200) * s), 1.0, -1)
    runs = room.warp(runs, 50 * s, 110 * s)
    ring = np.clip(blur(runs, 3 * s) - blur(runs, 12 * s), 0, 1) * 2
    room.lift(runs, 0.10, soft=10 * s)
    room.glaze(ring, base, 0.28, wobble=0, soft=1.5 * s, edge=0, bloom=0)
    return lit


def finish(sheet: Sheet, soften: float = 0.0):
    rgb, a = sheet.rgb(), np.clip(sheet.A, 0, 1)
    if soften > 0:                       # the near layer is a little out of focus
        pm = blur(rgb * a[:, :, None], soften)
        a = blur(a, soften)
        rgb = np.where(a[:, :, None] > 1e-4, pm / np.maximum(a[:, :, None], 1e-4), rgb)
    return np.clip(rgb, 0, 1), a


def export(name: str, W: int, H: int, layers: list, extra: dict) -> dict:
    """layers: (layer name, depth, rgb, alpha-or-None). Writes webp + preview, returns the art.json entry."""
    flat = None
    entry = dict(width=W, height=H, layers=[])
    for lname, depth, rgb, a in layers:
        path = os.path.join(OUT, name, f"{lname}.webp")
        size = save_webp(path, rgb, a, quality=90)
        log(f"  wrote art/{name}/{lname}.webp  {size / 1024:.0f} KB")
        entry["layers"].append(dict(file=f"art/{name}/{lname}.webp", depth=depth, name=lname))
        flat = rgb.copy() if flat is None else over(flat, rgb, a if a is not None else np.ones((H, W), np.float32))
    entry.update(extra)
    os.makedirs(os.path.join(PREVIEW, name), exist_ok=True)
    Image.fromarray(to_u8(flat), "RGB").save(os.path.join(PREVIEW, name, "preview.jpg"), "JPEG", quality=92)
    return entry


# -- the desk at dusk ---------------------------------------------------------

def paint_desk(name: str) -> dict:
    L = DESK[name]
    W, H, seed = L["W"], L["H"], L["seed"]
    log(f"plate: {name}  {W}x{H}")
    s = 1.0
    paper = Paper(H, W, seed=11)
    S = Shapes(H, W)

    # 0 -- far: the evening sky and the town
    far = paint_far(paper, S, seed + 1, L["horizon"])
    far_rgb, _ = finish(far)
    del far

    # 1 -- room: the wall, the window frame (panes cut out), a curtain
    room = Sheet(paper, seed + 2)
    paint_wall(room, S, "#b7a39d", L["wall_glow"], shadow=0.62, warm=0.5)
    wx0, wy0, wx1, wy1 = L["window"]
    # the window's cool light spills onto the wall around it
    room.lift(S.gauss((wx0 + wx1) / 2, (wy0 + wy1) / 2, (wx1 - wx0) * 0.75, (wy1 - wy0) * 0.8, 3.0) * 0.6, 0.22, soft=20)
    P.window(room, S, L["window"], *L["win_grid"], s)
    if L["curtain"]:
        P.curtain(room, S, L["curtain"][0], L["curtain"][1], -40, L["desk_y"] + 60, s, seed + 21)
    room_rgb, room_a = finish(room)
    del room

    # 2 -- desk: the table and everything on it
    d = Sheet(paper, seed + 3)
    dy = L["desk_y"]
    X, Y = S.X, S.Y
    top = d.block(S.poly([(-60, dy), (W + 60, dy), (W + 60, H + 60), (-60, H + 60)]), "#b27c4f", 0.95, wobble=2.0,
                  wobble_cell=300, edge=0.45, edge_w=7, bloom=0.5, bloom_cell=340, granulate=0.45, streak=0.42,
                  streak_cell=14, streak_stretch=40)
    d.glaze(top, "#8a5a3a", 0.35, wobble=0, soft=1, edge=0, bloom=0.6, bloom_cell=200, streak=0.6, streak_cell=7,
            streak_stretch=70)
    px, py, prx, pry = L["pool"]
    pool = S.gauss(px, py, prx, pry, 2.6)
    sx, sy, sw, sh = L["screen"]
    spill = S.gauss(sx + sw / 2, dy + 150, sw * 0.50, 150, 2.2)
    lit = np.clip(pool + 0.55 * spill, 0, 1)
    d.glaze(top * (1 - lit) ** 1.2, P.SHADOW, 0.62, wobble=14, wobble_cell=200, soft=10, edge=0, bloom=0.5,
            bloom_cell=300, granulate=0.5, streak=0.3, streak_cell=18, streak_stretch=30)
    d.glaze(top * smoothstep(dy, H, Y) * (1 - pool), "#2c2a55", 0.30, wobble=10, soft=10, edge=0, bloom=0.4,
            bloom_cell=260)                                         # nearer the viewer, further from any light
    d.lift(top * pool ** 1.4, 0.38, soft=8)
    d.glaze(top * pool ** 1.2, P.WARM, 0.42, wobble=12, wobble_cell=160, soft=8, edge=0.25, edge_w=18, bloom=0.4,
            bloom_cell=200)
    d.lift(top * spill, 0.30, soft=8)
    d.glaze(top * spill, P.COOL, 0.50, wobble=10, soft=8, edge=0, bloom=0.4, bloom_cell=160, wet=10)
    # the far edge of the desk and two plank seams running to the vanishing point
    d.ink_line((-20, dy + 1), (W * 0.38, dy + 2), width=2.6, over=0)
    d.ink_line((W * 0.36, dy + 2), (W + 20, dy + 1), width=2.6, over=0)
    vx, vy = L["vp"]
    for fx in (0.13, 0.37, 0.64, 0.88):
        x_far = fx * W
        x_near = vx + (x_far - vx) * (H + 80 - vy) / (dy - vy)
        d.ink_line((x_far, dy + 10), (x_near, H + 80), width=1.5, darkness=0.5, over=0, tremor=1.2)

    lp = L["lamp"]
    mg = L["mug"]
    pl = L["plant"]
    kb = L["keyboard"]
    kcx = (kb[0][0] + kb[1][0]) / 2
    # cast shadows first: they belong to the table
    P.cast_shadow(d, S, sx + sw / 2 + 20, dy + 96, 270, 26, 0.8)
    P.cast_shadow(d, S, kcx - 20, kb[2][1] + 16, (kb[2][0] - kb[3][0]) / 2 + 6, 20, 0.75)
    P.cast_shadow(d, S, mg["cx"] - mg["w"] * 0.75, mg["by"] - 2, mg["w"] * 0.95, mg["w"] * 0.16, 0.85)
    P.cast_shadow(d, S, pl["cx"] - pl["pw"] * 0.4, pl["by"] + 2, pl["pw"] * 0.75, pl["pw"] * 0.10, 0.6)
    P.cast_shadow(d, S, lp["base"][0] + 30, lp["base"][1] + 26, 150, 22, 0.7)

    P.plant(d, S, pl["cx"], pl["by"], pl["pw"], pl["ph"], s, seed + 31, leaves=pl["leaves"], reach=pl["reach"],
            spread=pl["spread"], light=1, dusk=0.22)
    P.monitor(d, S, L["screen"], dy, s)
    P.lamp(d, S, lp["base"], lp["elbow"], lp["head"], lp["aim"], s)
    P.keyboard(d, S, kb, s)
    # the screen lights the nearest keys
    d.glaze(S.poly(kb) * S.gauss(kcx, kb[0][1], (kb[1][0] - kb[0][0]) * 0.5, 90, 2.0), P.COOL, 0.22, wobble=4, soft=6,
            edge=0, bloom=0.3)
    P.mug(d, S, mg["cx"], mg["by"], mg["w"], mg["h"], s, light=1, handle=-1)
    d.spatter(top * (Y > dy + 40), "#5a3a2a", 60, 2.0, 0.5)
    desk_rgb, desk_a = finish(d)
    del d
    # the screen is not painted: it is a flat, exact rectangle for the film's terminal
    desk_rgb[sy:sy + sh, sx:sx + sw] = hex_rgb(SCREEN)[None, None, :]
    desk_a[sy:sy + sh, sx:sx + sw] = 1.0

    # 3 -- near: the top of the chair back, darker and a little out of focus
    n = Sheet(paper, seed + 4)
    ch = L["chair"]
    ccx, ct, hw = ch["cx"], ch["top"], ch["half"]
    rad = 150.0
    top_curve = np.concatenate([
        arc_pts(ccx - hw + rad, ct + rad, rad, rad, 180, 270, 16),
        arc_pts(ccx + hw - rad, ct + rad, rad, rad, 270, 360, 16),
    ])
    # the back bows up a little in the middle
    top_curve[:, 1] -= 26 * np.cos((top_curve[:, 0] - ccx) / hw * np.pi / 2)
    poly = np.concatenate([top_curve, [(ccx + hw + 26, H + 80), (ccx - hw - 26, H + 80)]])
    back = n.block(S.poly(poly), "#3a3d66", 1.25, wobble=4, wobble_cell=160, edge=0.6, edge_w=10, bloom=0.6,
                   bloom_cell=180, granulate=0.6, streak=0.3, streak_cell=9, streak_stretch=1)
    n.glaze(back * smoothstep(ct + 30, H, Y), "#16172c", 0.6, wobble=6, soft=12, edge=0, bloom=0.5, bloom_cell=200, wet=10)
    n.glaze(back * smoothstep(ccx + hw * 0.2, ccx - hw, X), P.SHADOW, 0.45, wobble=6, soft=12, edge=0, wet=10)
    # the lamp and the screen find the top edge
    rim = S.stroke(top_curve[6:27] + [0, 15], 13)
    n.lift(rim * back, 0.5, soft=6)
    n.glaze(rim * back * smoothstep(ccx - hw * 0.4, ccx + hw, X), P.WARM, 0.4, wobble=2, soft=6, edge=0)
    n.ink(top_curve[:17], width=3.6, tremor=1.0)
    n.ink(top_curve[15:][::-1], width=3.6, tremor=1.0)
    n.ink_line(top_curve[0], (ccx - hw - 24, H + 60), width=3.4, over=0)
    n.ink_line(top_curve[-1], (ccx + hw + 24, H + 60), width=3.4, over=0)
    seam = top_curve[3:29] * [0.93, 1] + [ccx * 0.07, 50]
    n.ink(seam, width=1.7, darkness=0.55, tremor=1.4)
    n.hatch(back * (Y > ct + 80) * (X < ccx - hw * 0.45), angle=78, spacing=15, width=1.6, darkness=0.45)
    near_rgb, near_a = finish(n, soften=2.6)
    del n

    return export(name, W, H, [
        ("far", 0.0, far_rgb, None),
        ("room", 0.3, room_rgb, room_a),
        ("desk", 0.6, desk_rgb, desk_a),
        ("near", 1.0, near_rgb, near_a),
    ], dict(screenRect=dict(x=sx, y=sy, w=sw, h=sh)))


# -- away: a mug by the kitchen window ----------------------------------------

def paint_away(name: str) -> dict:
    L = AWAY[name]
    W, H, seed = L["W"], L["H"], L["seed"]
    log(f"plate: {name}  {W}x{H}")
    s = 1.0
    paper = Paper(H, W, seed=13)
    S = Shapes(H, W)
    X, Y = S.X, S.Y

    far = paint_far(paper, S, seed + 1, L["horizon"])
    far_rgb, _ = finish(far)
    del far

    # 1 -- room: a warm lamp-lit wall (the calm space for a caption), the window, a band of tiles
    room = Sheet(paper, seed + 2)
    paint_wall(room, S, "#d2b08e", L["wall_glow"], shadow=0.78, warm=0.42)
    wx0, wy0, wx1, wy1 = L["window"]
    P.window(room, S, L["window"], *L["win_grid"], s, frame="#8a7f98")
    ty0, ty1 = L["tiles"]
    cy = L["counter_y"]
    tiles = room.block(S.rect(-60, ty0, W + 60, cy + 30), "#d8cdbf", 0.75, wobble=1.5, wobble_cell=200, edge=0.3,
                       edge_w=5, bloom=0.5, bloom_cell=220, granulate=0.4)
    lit = S.gauss(*L["wall_glow"], power=2.4)
    room.glaze(tiles * (1 - lit) ** 1.2, P.SHADOW, 0.8, wobble=10, soft=10, edge=0, bloom=0.5, bloom_cell=260)
    room.glaze(tiles * lit, P.WARM, 0.25, wobble=10, soft=10, edge=0, bloom=0.3)
    r = rng(seed + 5)
    tw = 118.0
    room.ink_line((-30, ty0), (W + 30, ty0), width=2.2, over=0)
    room.ink_line((-30, (ty0 + cy) / 2 + 4), (W + 30, (ty0 + cy) / 2 + 4), width=1.3, darkness=0.5, over=0, tremor=1.2)
    x = -40.0
    row = 0
    while x < W + 40:
        for j, (a, b) in enumerate([(ty0, (ty0 + cy) / 2 + 4), ((ty0 + cy) / 2 + 4, cy)]):
            xx = x + (tw / 2 if j else 0)
            room.ink_line((xx, a + 3), (xx + r.normal(0, 1.5), b - 2), width=1.2, darkness=0.45, over=0, tremor=0.6)
        if r.random() < 0.3:                         # one tile in a few is a shade darker
            room.glaze(S.rect(x + 4, ty0 + 4, x + tw - 4, (ty0 + cy) / 2), "#a9a0b4", 0.3, wobble=1.5, soft=1.2,
                       edge=0.4, edge_w=4, bloom=0.4, bloom_cell=40)
        x += tw
        row += 1
    room_rgb, room_a = finish(room)
    del room

    # 2 -- counter: the worktop, the mug, the kettle, a plant
    c = Sheet(paper, seed + 3)
    fy = L["front_y"]
    top = c.block(S.poly([(-60, cy), (W + 60, cy), (W + 60, fy), (-60, fy)]), "#c69664", 0.95, wobble=1.8,
                  wobble_cell=300, edge=0.45, edge_w=7, bloom=0.5, bloom_cell=340, granulate=0.45, streak=0.45,
                  streak_cell=12, streak_stretch=46)
    c.glaze(top, "#96633c", 0.3, wobble=0, soft=1, edge=0, bloom=0.6, bloom_cell=200, streak=0.6, streak_cell=6,
            streak_stretch=80)
    mg, kt, pl = L["mug"], L["kettle"], L["plant"]
    glow = S.gauss(mg["cx"] - 420, (cy + fy) / 2, 1250, 420, 2.4)
    c.glaze(top * (1 - glow) ** 1.2, P.SHADOW, 0.85, wobble=14, wobble_cell=200, soft=10, edge=0, bloom=0.5,
            bloom_cell=300, streak=0.3, streak_cell=18, streak_stretch=30)
    c.lift(top * glow ** 2, 0.22, soft=10)
    c.glaze(top * glow ** 1.5, P.WARM, 0.3, wobble=12, soft=8, edge=0, bloom=0.4, bloom_cell=200)
    face = c.block(S.poly([(-60, fy), (W + 60, fy), (W + 60, H + 60), (-60, H + 60)]), "#7d5a48", 1.25, wobble=1.6,
                   wobble_cell=300, edge=0.45, edge_w=8, bloom=0.5, bloom_cell=300, granulate=0.5, streak=0.3,
                   streak_cell=10, streak_stretch=50)
    c.glaze(face, P.SHADOW, 0.9, wobble=6, soft=8, edge=0, bloom=0.5, bloom_cell=260)
    c.lift(S.rect(-60, fy - 5, W + 60, fy + 1), 0.4, soft=1.5)          # the worn front arris catches light
    c.ink_line((-20, cy + 1), (W * 0.45, cy + 2), width=2.5, over=0)
    c.ink_line((W * 0.43, cy + 2), (W + 20, cy + 1), width=2.5, over=0)
    c.ink_line((-20, fy + 2), (W * 0.6, fy + 1), width=3.0, over=0)
    c.ink_line((W * 0.58, fy + 1), (W + 20, fy + 2), width=3.0, over=0)
    c.ink_line((-20, fy + 30), (W + 20, fy + 31), width=1.4, darkness=0.5, over=0, tremor=1.4)
    # shadows fall away from the room's lamp (it is up and to the left)
    P.cast_shadow(c, S, mg["cx"] + mg["w"] * 0.85, mg["by"] + 2, mg["w"] * 1.05, mg["w"] * 0.15, 0.95)
    P.cast_shadow(c, S, kt["cx"] + kt["rr"] * 0.75, kt["by"] + 4, kt["rr"] * 1.35, kt["rr"] * 0.16, 0.9)
    P.cast_shadow(c, S, pl["cx"] + pl["pw"] * 0.5, pl["by"] + 2, pl["pw"] * 0.8, pl["pw"] * 0.10, 0.7)

    P.plant(c, S, pl["cx"], pl["by"], pl["pw"], pl["ph"], s, seed + 31, leaves=pl["leaves"], reach=pl["reach"],
            spread=pl["spread"], light=-1, pot="#e3d2bb", dusk=0.15)
    P.kettle(c, S, kt["cx"], kt["by"], kt["rr"], kt["hgt"], s, light=-1, spout=-1)
    mug_rect = P.mug(c, S, mg["cx"], mg["by"], mg["w"], mg["h"], s, light=-1, handle=1)
    c.spatter(top, "#5a3a2a", 50, 2.0, 0.5)
    counter_rgb, counter_a = finish(c)
    del c

    # 3 -- steam: light, with alpha, on its own layer so the film can move it
    steam_top = mg["by"] - mg["h"] - 4
    rise = mg["h"] * 2.3
    steam_rgb, steam_a = P.steam_layer(S, mg["cx"], steam_top + 14, mg["w"] * 0.8, rise, s, seed + 41)
    steam_rect = dict(x=int(mg["cx"] - mg["w"] * 0.95), y=int(steam_top - rise), w=int(mg["w"] * 1.9), h=int(rise + 14))

    # 4 -- near: leaves of a house plant in the corner, dark and out of focus
    n = Sheet(paper, seed + 4)
    fo = L["foliage"]
    r = rng(seed + 44)
    root = np.array(fo["root"], np.float32)
    k = 9
    for i in range(k):
        ang = fo["a0"] + (fo["a1"] - fo["a0"]) * (i + r.uniform(0.1, 0.9)) / k
        ln = fo["reach"] * r.uniform(0.62, 1.0)
        tip = root + [np.sin(ang) * ln, -np.cos(ang) * ln]
        ctrl = root + [np.sin(ang - 0.25) * ln * 0.5, -np.cos(ang - 0.25) * ln * 0.55]
        stem = bezier(root, ctrl, tip, 40)
        k0 = int(40 * r.uniform(0.35, 0.5))
        poly, spine = leaf_poly(stem[k0], tip, r.normal(0, ln * 0.03), ln * r.uniform(0.12, 0.17), fat=0.6)
        n.ink(stem[:k0 + 2], width=4.5, darkness=0.9)
        leaf = n.block(S.poly(poly), ["#2b4a47", "#213b3f", "#34574a"][i % 3], 1.6, wobble=3, wobble_cell=60, edge=0.5,
                       edge_w=7, bloom=0.6, bloom_cell=70, granulate=0.5)
        half, _ = leaf_poly(stem[k0], tip, ln * 0.06, ln * 0.07, fat=0.6)
        n.glaze(S.poly(half) * leaf, "#12202c", 0.6, wobble=3, soft=3, edge=0.3, wet=4)
        n.ink(spine[1:-1], width=3.0, darkness=0.8, lift=0.4)
    near_rgb, near_a = finish(n, soften=3.4)
    del n

    cx_, cy_, cw_, chh = L["caption"]
    return export(name, W, H, [
        ("far", 0.0, far_rgb, None),
        ("room", 0.3, room_rgb, room_a),
        ("counter", 0.6, counter_rgb, counter_a),
        ("steam", 0.65, steam_rgb, steam_a),
        ("near", 1.0, near_rgb, near_a),
    ], dict(mugRect=mug_rect, steamRect=steam_rect, captionRect=dict(x=cx_, y=cy_, w=cw_, h=chh)))


# -- paper --------------------------------------------------------------------

def paint_paper() -> dict:
    """A sheet of the same paper with the faintest warm wash and two back-runs, for cards."""
    S_ = 2880
    log(f"paper  {S_}x{S_}")
    paper = Paper(S_, S_, seed=51)
    sh = Sheet(paper, 600)
    full = np.ones((S_, S_), np.float32)
    sh.glaze(full, "#efe2c8", 0.42, wobble=0, soft=0, edge=0, bloom=0.5, bloom_cell=620, granulate=0.6, streak=0.12,
             streak_cell=60, streak_stretch=10)
    n = fbm(S_, S_, 760, 611, 4)
    sh.glaze(smoothstep(0.44, 0.68, n), "#ead2b4", 0.26, wobble=40, soft=30, edge=0.5, edge_w=24, bloom=0.5,
             bloom_cell=520, granulate=0.6, wet=30)
    sh.glaze(smoothstep(0.58, 0.40, n), "#dcd6e6", 0.22, wobble=40, soft=30, edge=0.4, edge_w=24, bloom=0.5,
             bloom_cell=520, granulate=0.6, wet=30)
    r = rng(650)
    runs = np.zeros((S_, S_), np.float32)
    for _ in range(4):
        cv2.circle(runs, (int(r.uniform(0, S_)), int(r.uniform(0, S_))), int(r.uniform(110, 280)), 1.0, -1)
    runs = sh.warp(runs, 70, 130)
    ring = np.clip(blur(runs, 4) - blur(runs, 18), 0, 1) * 2
    sh.lift(runs, 0.25, soft=14)
    sh.glaze(ring, "#e6cfae", 0.4, wobble=0, soft=2, edge=0, bloom=0)
    rgb = sh.rgb()
    size = save_webp(os.path.join(OUT, "paper.webp"), rgb, None, quality=88)
    log(f"  wrote art/paper.webp  {size / 1024:.0f} KB")
    os.makedirs(os.path.join(PREVIEW, "paper"), exist_ok=True)
    Image.fromarray(to_u8(rgb), "RGB").save(os.path.join(PREVIEW, "paper", "preview.jpg"), "JPEG", quality=92)
    return dict(file="art/paper.webp", width=S_, height=S_)


# -- main ---------------------------------------------------------------------

PLATES = ["desk", "away", "desk-portrait", "away-portrait"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=PLATES + ["paper"], action="append")
    a = ap.parse_args()
    want = a.only or PLATES + ["paper"]
    cv2.setRNGSeed(0)
    data = dict(plates={}, paper={})
    if a.only and os.path.exists(ART_JSON):
        with open(ART_JSON, encoding="utf-8") as f:
            data = json.load(f)
    t0 = time.time()
    for name in PLATES:
        if name in want:
            data["plates"][name] = paint_desk(name) if name.startswith("desk") else paint_away(name)
    if "paper" in want:
        data["paper"] = paint_paper()
    data["plates"] = {k: data["plates"][k] for k in PLATES if k in data["plates"]}
    os.makedirs(os.path.dirname(ART_JSON), exist_ok=True)
    with open(ART_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    log(f"done in {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
