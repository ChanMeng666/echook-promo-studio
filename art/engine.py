"""A small watercolour-and-ink engine (numpy + OpenCV). No SVG, no generated imagery.

Paint is stored as OPTICAL DENSITY per channel, so glazes stack the way
transparent pigment does: a second coat multiplies the light coming back from
the paper instead of covering it. On top of that the engine models what makes
a wash look like a wash:

  * paper tooth -- a height field; pigment settles in its valleys (granulation);
  * edge pooling -- a drying wash leaves a darker rim just inside its outline;
  * back-runs / blooms -- large soft unevenness inside a wash;
  * wet-in-wet -- a wash dropped onto damp paper creeps outward unevenly;
  * brush drag -- streaks along the stroke direction;
  * reserve and lift -- light is paper that was left alone or wiped back;
  * a hand-held outline -- every mask is warped before it is filled.

Ink lines are separate strokes with a landing, a pressed body and a lift, a
slow wander plus a fine tremor, and they skip the valleys of the paper when
the nib moves fast.

A Sheet also tracks COVERAGE (alpha): which pixels a depth layer owns. Layers
are exported as ordinary RGBA images and stacked with normal blending.

Deterministic: every random draw comes from a generator seeded by the sheet's
seed and a call counter.
"""

from __future__ import annotations

import os

import cv2
import numpy as np
from PIL import Image

INK = "#1b1d2e"


# -- noise --------------------------------------------------------------------

def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(int(seed) & 0x7FFFFFFF)


def value_noise(h: int, w: int, cell: float, seed: int, stretch: float = 1.0) -> np.ndarray:
    """Smooth noise in [0,1]. `stretch` > 1 elongates it horizontally (brush drag)."""
    gh = max(2, int(h / cell) + 3)
    gw = max(2, int(w / (cell * stretch)) + 3)
    g = rng(seed).random((gh, gw)).astype(np.float32)
    # resize a fixed-cell grid and crop, so the cell size does not depend on h, w rounding
    big = cv2.resize(g, (int(gw * cell * stretch), int(gh * cell)), interpolation=cv2.INTER_CUBIC)
    return np.ascontiguousarray(big[:h, :w]).clip(0, 1)


def fbm(h: int, w: int, cell: float, seed: int, octaves: int = 4, stretch: float = 1.0) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(h, w, max(1.5, cell / (2 ** o)), seed + 101 * o, stretch)
        total += amp
        amp *= 0.5
    return out / total


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return a
    return cv2.GaussianBlur(a, (0, 0), sigma)


def smoothstep(a: float, b: float, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def hex_rgb(s: str) -> np.ndarray:
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def absorb_of(colour) -> np.ndarray:
    c = hex_rgb(colour) if isinstance(colour, str) else np.asarray(colour, np.float32)
    return -np.log(np.clip(c, 0.02, 0.999))


# -- masks --------------------------------------------------------------------

class Shapes:
    """Mask factory for one plate size. Masks are float32 [0,1], anti-aliased."""

    def __init__(self, h: int, w: int):
        self.h, self.w = h, w
        self.Y, self.X = np.mgrid[0:h, 0:w].astype(np.float32)

    def zero(self) -> np.ndarray:
        return np.zeros((self.h, self.w), np.float32)

    def _u8(self) -> np.ndarray:
        return np.zeros((self.h, self.w), np.uint8)

    @staticmethod
    def _f(u8: np.ndarray) -> np.ndarray:
        return u8.astype(np.float32) / 255.0

    def poly(self, pts) -> np.ndarray:
        m = self._u8()
        cv2.fillPoly(m, [np.round(np.asarray(pts, np.float64) * 16).astype(np.int32)], 255, cv2.LINE_AA, 4)
        return self._f(m)

    def polys(self, list_of_pts) -> np.ndarray:
        m = self._u8()
        for pts in list_of_pts:
            cv2.fillPoly(m, [np.round(np.asarray(pts, np.float64) * 16).astype(np.int32)], 255, cv2.LINE_AA, 4)
        return self._f(m)

    def rect(self, x0, y0, x1, y1, r: float = 0.0) -> np.ndarray:
        if r <= 0:
            return self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        return self.poly(rrect_pts(x0, y0, x1, y1, r))

    def ellipse(self, cx, cy, rx, ry, angle: float = 0.0, a0: float = 0.0, a1: float = 360.0) -> np.ndarray:
        m = self._u8()
        cv2.ellipse(m, (int(round(cx * 16)), int(round(cy * 16))), (int(round(rx * 16)), int(round(ry * 16))),
                    angle, a0, a1, 255, -1, cv2.LINE_AA, 4)
        return self._f(m)

    def stroke(self, pts, width) -> np.ndarray:
        """A fat brush line through pts; width may be a scalar or one value per point."""
        m = self._u8()
        p = np.asarray(pts, np.float64)
        ws = np.broadcast_to(np.asarray(width, np.float64), (len(p),))
        q = np.round(p * 16).astype(np.int32)
        for i in range(len(p) - 1):
            cv2.line(m, tuple(q[i]), tuple(q[i + 1]), 255, max(1, int(round(ws[i]))), cv2.LINE_AA, 4)
        return self._f(m)

    def gauss(self, cx, cy, rx, ry, power: float = 2.0) -> np.ndarray:
        """A soft elliptical falloff: 1 at the centre, ~0.37 at the radii."""
        d = ((self.X - cx) / rx) ** 2 + ((self.Y - cy) / ry) ** 2
        return np.exp(-(d ** (power / 2.0))).astype(np.float32)


def rrect_pts(x0, y0, x1, y1, r, n: int = 8) -> np.ndarray:
    pts = []
    for cx, cy, a0 in [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]:
        for k in range(n + 1):
            a = np.radians(a0 + 90 * k / n)
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return np.array(pts, np.float32)


def bezier(p0, p1, p2, n: int = 40) -> np.ndarray:
    t = np.linspace(0, 1, n)[:, None]
    return (((1 - t) ** 2) * np.array(p0, np.float32) + 2 * (1 - t) * t * np.array(p1, np.float32)
            + (t ** 2) * np.array(p2, np.float32)).astype(np.float32)


def arc_pts(cx, cy, rx, ry, a0, a1, n: int = 48, rot: float = 0.0) -> np.ndarray:
    a = np.radians(np.linspace(a0, a1, n))
    x, y = rx * np.cos(a), ry * np.sin(a)
    cr, sr = np.cos(np.radians(rot)), np.sin(np.radians(rot))
    return np.stack([cx + x * cr - y * sr, cy + x * sr + y * cr], 1).astype(np.float32)


def resample(pts, step: float = 3.0) -> np.ndarray:
    p = np.asarray(pts, np.float32)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    if s[-1] < 1e-3:
        return p
    n = max(2, int(s[-1] / step) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], 1).astype(np.float32)


def leaf_poly(base, tip, bend: float, width: float, n: int = 22, fat: float = 0.7):
    """A leaf: a bent spine with a width profile. Returns (polygon, spine)."""
    base, tip = np.asarray(base, np.float32), np.asarray(tip, np.float32)
    d = tip - base
    nrm0 = np.array([-d[1], d[0]], np.float32) / (np.linalg.norm(d) + 1e-6)
    mid = (base + tip) / 2 + nrm0 * bend
    c = bezier(base, mid, tip, n)
    g = np.gradient(c, axis=0)
    nrm = np.stack([-g[:, 1], g[:, 0]], 1)
    nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6)
    t = np.linspace(0, 1, n)
    wd = width * (np.sin(np.pi * np.clip(t * 0.94 + 0.03, 0, 1)) ** fat) * (1 - 0.35 * t)
    poly = np.concatenate([c + nrm * wd[:, None], (c - nrm * wd[:, None])[::-1]])
    return poly, c


# -- paper --------------------------------------------------------------------

PAPER_TONE = np.array([0.972, 0.955, 0.922], np.float32)


class Paper:
    """Cold-pressed paper: a height field (tooth) plus a warm off-white tone."""

    def __init__(self, h: int, w: int, seed: int = 7, tooth: float = 1.0):
        self.h, self.w = h, w
        grain = fbm(h, w, 2.6, seed, 2)
        fibre = fbm(h, w, 2.0, seed + 9, 2, stretch=3.5)
        floc = fbm(h, w, 11.0, seed + 19, 2)
        hf = 0.55 * grain + 0.25 * fibre + 0.20 * floc
        hf = (hf - hf.min()) / (np.ptp(hf) + 1e-6)
        self.height = hf.astype(np.float32)
        shade = 1.0 - 0.035 * tooth * (1.0 - self.height)
        self.rgb = (PAPER_TONE[None, None, :] * shade[:, :, None]).astype(np.float32)


# -- the sheet ----------------------------------------------------------------

class Sheet:
    """One depth layer: pigment as optical density D, and the coverage A it owns."""

    def __init__(self, paper: Paper, seed: int):
        self.p = paper
        self.h, self.w = paper.h, paper.w
        self.D = np.zeros((self.h, self.w, 3), np.float32)
        self.A = np.zeros((self.h, self.w), np.float32)
        self.seed = seed
        self._n = 0

    def _next(self) -> int:
        self._n += 1
        return self.seed * 1009 + self._n * 37

    def _roi(self, mask: np.ndarray, pad: float):
        x, y, w, h = cv2.boundingRect((mask > 0.004).astype(np.uint8))
        if w == 0 or h == 0:
            return None
        p = int(np.ceil(pad))
        return max(0, y - p), min(self.h, y + h + p), max(0, x - p), min(self.w, x + w + p)

    # outline wobble: a hand-held brush never follows the pencil line
    def warp(self, mask: np.ndarray, amount: float, cell: float = 60.0) -> np.ndarray:
        if amount <= 0:
            return mask
        r = self._roi(mask, amount * 2 + 4)
        s = self._next()
        if r is None:
            return mask
        y0, y1, x0, x1 = r
        h, w = y1 - y0, x1 - x0
        dx = (fbm(h, w, cell, s, 3) - 0.5) * 2 * amount
        dy = (fbm(h, w, cell, s + 5, 3) - 0.5) * 2 * amount
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        out = np.zeros_like(mask)
        out[y0:y1, x0:x1] = cv2.remap(np.ascontiguousarray(mask[y0:y1, x0:x1]), xx + dx, yy + dy,
                                      cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return out

    def glaze(self, mask: np.ndarray, colour, strength: float = 1.0, *,
              wobble: float = 4.0, wobble_cell: float = 60.0, soft: float = 1.3,
              edge: float = 0.35, edge_w: float = 6.0, granulate: float = 0.3,
              bloom: float = 0.3, bloom_cell: float = 220.0, wet: float = 0.0,
              streak: float = 0.0, streak_cell: float = 26.0, streak_stretch: float = 9.0,
              vertical: bool = False, cover: bool = False) -> None:
        """Lay one transparent wash.

        strength  pigment load (1 = the colour as given, 2 = a second coat)
        edge      extra pigment pooled at the drying edge, edge_w px wide
        granulate how strongly pigment settles into the paper's valleys
        bloom     large soft back-runs inside the wash
        wet       wet-in-wet: the wash diffuses outward by about this many px
        streak    brush drag along the stroke (horizontal, or vertical=True)
        cover     this wash defines what the layer owns (alpha)
        """
        r = self._roi(mask, wobble * 2 + soft * 3 + wet * 3 + edge_w * 3 + 6)
        s1, s2, s3, s4 = self._next(), self._next(), self._next(), self._next()
        if r is None:
            return
        y0, y1, x0, x1 = r
        h, w = y1 - y0, x1 - x0
        m = np.ascontiguousarray(mask[y0:y1, x0:x1])
        if wobble > 0:
            dx = (fbm(h, w, wobble_cell, s1, 3) - 0.5) * 2 * wobble
            dy = (fbm(h, w, wobble_cell, s1 + 5, 3) - 0.5) * 2 * wobble
            yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
            m = cv2.remap(m, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        if wet > 0:
            damp = fbm(h, w, max(6.0, wet * 3), s2, 3)       # diffusion follows the damp, not a compass
            m = np.clip(0.55 * blur(m, wet) + 0.45 * blur(m, wet * 0.35), 0, 1) * (0.7 + 0.6 * damp)
            m = np.clip(m, 0, 1)
        m = blur(m, soft)
        if cover:
            a = smoothstep(0.30, 0.72, m)
            np.maximum(self.A[y0:y1, x0:x1], a, out=self.A[y0:y1, x0:x1])
        tooth = self.p.height[y0:y1, x0:x1]
        load = m.copy()
        if bloom > 0:
            load *= 1.0 + bloom * (fbm(h, w, bloom_cell, s3, 4) - 0.5) * 2
        if streak > 0:
            if vertical:
                st = fbm(w, h, streak_cell, s4, 3, stretch=streak_stretch).T
            else:
                st = fbm(h, w, streak_cell, s4, 3, stretch=streak_stretch)
            load *= 1.0 + streak * (st - 0.5) * 2
        load *= 1.0 + granulate * (0.5 - tooth) * 2          # valleys take more pigment
        load *= 0.93 + 0.14 * fbm(h, w, 38.0, s2 + 9, 3)       # pigment never dries perfectly flat
        if edge > 0:
            rim = np.clip(m - blur(m, edge_w), 0, 1) * 2.2    # just inside the outline
            load += edge * rim * (0.6 + 0.8 * fbm(h, w, 34.0, s4 + 3, 2))
        a = absorb_of(colour)
        self.D[y0:y1, x0:x1] += a[None, None, :] * (strength * np.clip(load, 0, None))[:, :, None]

    def lift(self, mask: np.ndarray, amount: float = 0.8, soft: float = 2.0) -> None:
        """Take pigment back off (a damp brush, masking fluid): how watercolour makes light."""
        r = self._roi(mask, soft * 3 + 4)
        if r is None:
            return
        y0, y1, x0, x1 = r
        m = blur(np.ascontiguousarray(mask[y0:y1, x0:x1]), soft)
        self.D[y0:y1, x0:x1] *= (1.0 - amount * np.clip(m, 0, 1))[:, :, None]

    def block(self, mask: np.ndarray, colour, strength: float = 1.0, *, wobble: float = 3.0,
              wobble_cell: float = 60.0, reserve: float = 0.97, **kw) -> np.ndarray:
        """Paint an object over what is there: reserve its shape back to paper, then
        lay its first wash. Returns the warped shape so later glazes register to it."""
        shape = self.warp(mask, wobble, wobble_cell)
        self.lift(shape, reserve, soft=0.9)
        self.glaze(shape, colour, strength, wobble=0, cover=True, **kw)
        return shape

    def cut(self, mask: np.ndarray, soft: float = 1.0) -> None:
        """Remove coverage (a window pane the layer behind shows through)."""
        r = self._roi(mask, soft * 3 + 4)
        if r is None:
            return
        y0, y1, x0, x1 = r
        m = smoothstep(0.3, 0.7, blur(np.ascontiguousarray(mask[y0:y1, x0:x1]), soft))
        self.A[y0:y1, x0:x1] *= 1.0 - m
        self.D[y0:y1, x0:x1] *= (1.0 - m)[:, :, None]

    # -- pen and ink ----------------------------------------------------------
    def ink(self, pts, width: float = 2.4, colour: str = INK, darkness: float = 1.0,
            tremor: float = 0.8, dry: float = 0.3, land: float = 0.07, lift: float = 0.22,
            step: float = 3.0) -> None:
        """One pen stroke: it lands (a slightly heavy start), travels with varying
        pressure and a little tremor, and lifts into a taper."""
        p = resample(pts, step)
        n = len(p)
        if n < 2:
            return
        r = rng(self._next())
        t = np.linspace(0, 1, n)
        length = float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())
        rise = smoothstep(0.0, land, t)
        fall = smoothstep(0.0, lift, 1 - t)
        press = (0.42 + 0.58 * rise) * (0.12 + 0.88 * fall ** 0.8)
        press *= 1.0 + 0.16 * np.exp(-((t - land * 1.3) / max(land, 1e-3)) ** 2)     # the landing
        k = max(4, int(length / 70) + 3)
        press *= np.interp(t, np.linspace(0, 1, k), r.uniform(0.6, 1.2, k))
        wdt = np.clip(width * press, 0.45, None)
        # slow wander of the hand + fine tremor; both ends stay where aimed
        k2 = max(3, int(length / 55) + 2)
        wander = np.stack([np.interp(t, np.linspace(0, 1, k2), r.normal(0, tremor, k2)) for _ in range(2)], 1)
        ker = np.hanning(9)
        ker /= ker.sum()
        if n > 12:
            wander = np.stack([np.convolve(np.pad(wander[:, i], 4, mode="edge"), ker, "valid") for i in range(2)], 1)
        fine = r.normal(0, tremor * 0.16, (n, 2))
        env = np.sin(np.pi * t)[:, None] ** 0.5
        q = p + (wander + fine) * env
        x0, y0 = np.floor(q.min(0) - width * 3 - 2).astype(int)
        x1, y1 = np.ceil(q.max(0) + width * 3 + 2).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, self.w), min(y1, self.h)
        if x1 <= x0 or y1 <= y0:
            return
        S = 4                                                       # supersample for a clean nib
        canvas = np.zeros(((y1 - y0) * S, (x1 - x0) * S), np.uint8)
        qi = np.round((q - [x0, y0]) * S).astype(np.int32)
        # ink flow: the nib runs a little dry now and then, and recovers
        k3 = max(4, int(length / 40) + 3)
        flow = np.clip(np.interp(t, np.linspace(0, 1, k3), r.uniform(0.45, 1.5, k3)), 0.35, 1.0)
        for i in range(n - 1):
            cv2.line(canvas, tuple(qi[i]), tuple(qi[i + 1]), int(255 * flow[i]),
                     max(1, int(round(wdt[i] * S))), cv2.LINE_AA)
        m = cv2.resize(canvas, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        # thin parts of the stroke carry less ink, and a fast nib skips the valleys
        tooth = self.p.height[y0:y1, x0:x1]
        cov = np.clip(m * 1.6, 0, 1)
        m *= 1.0 - dry * smoothstep(0.42, 0.05, tooth)
        a = absorb_of(colour)
        self.D[y0:y1, x0:x1] += a[None, None, :] * (darkness * m)[:, :, None]
        np.maximum(self.A[y0:y1, x0:x1], cov, out=self.A[y0:y1, x0:x1])   # a line owns its own pixels

    def ink_line(self, a, b, width: float = 2.2, over: float = 5.0, **kw) -> None:
        """A straight-ish stroke that overshoots its corners a little, like a quick ruler-less line."""
        a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
        d = b - a
        ln = float(np.linalg.norm(d)) + 1e-6
        u = d / ln
        r = rng(self._next())
        a2 = a - u * r.uniform(0.2, 1.0) * over + r.normal(0, 1.1, 2)
        b2 = b + u * r.uniform(0.2, 1.0) * over + r.normal(0, 1.1, 2)
        if r.random() < 0.5:
            a2, b2 = b2, a2                                         # strokes are pulled either way
        self.ink(np.stack([a2, b2]), width, **kw)

    def ink_poly(self, pts, width: float = 2.2, closed: bool = True, over: float = 5.0, **kw) -> None:
        p = [np.asarray(q, np.float32) for q in pts]
        m = len(p) if closed else len(p) - 1
        for i in range(m):
            self.ink_line(p[i], p[(i + 1) % len(p)], width, over, **kw)

    def ink_curve(self, pts, width: float = 2.2, parts: int = 1, gap: float = 0.03, **kw) -> None:
        """A curve drawn in one or more pulls, with small breaks between them."""
        p = resample(pts, 3.0)
        n = len(p)
        r = rng(self._next())
        cuts = np.linspace(0, n - 1, parts + 1)
        for i in range(parts):
            a = int(cuts[i] + (gap * n * r.uniform(0.2, 1.0) if i else 0))
            b = int(cuts[i + 1] + 1)
            seg = p[a:b]
            if len(seg) > 2:
                self.ink(seg if r.random() < 0.6 else seg[::-1], width, **kw)

    def hatch(self, mask: np.ndarray, angle: float = 35.0, spacing: float = 9.0, width: float = 1.3,
              darkness: float = 0.6, jitter: float = 0.35, **kw) -> None:
        """Parallel pen hatching wherever `mask` > 0.5: the pen's way of saying shadow."""
        r0 = self._roi(mask, 2)
        r = rng(self._next())
        if r0 is None:
            return
        y0, y1, x0, x1 = r0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rad = float(np.hypot(x1 - x0, y1 - y0)) / 2
        u = np.array([np.cos(np.radians(angle)), np.sin(np.radians(angle))], np.float32)
        v = np.array([-u[1], u[0]], np.float32)
        k = -rad
        while k < rad:
            o = np.array([cx, cy], np.float32) + v * (k + r.normal(0, spacing * jitter))
            ts = np.arange(-rad, rad, 2.0, dtype=np.float32)
            pts = o[None, :] + ts[:, None] * u[None, :]
            xi = np.clip(pts[:, 0].astype(int), 0, self.w - 1)
            yi = np.clip(pts[:, 1].astype(int), 0, self.h - 1)
            inside = (mask[yi, xi] > 0.5) & (pts[:, 0] >= 0) & (pts[:, 0] < self.w) & (pts[:, 1] >= 0) & (pts[:, 1] < self.h)
            idx = np.flatnonzero(np.diff(np.concatenate([[0], inside.astype(np.int8), [0]])))
            for a, b in zip(idx[::2], idx[1::2]):
                if b - a > 5:
                    self.ink(pts[[a, b - 1]], width, darkness=darkness * r.uniform(0.7, 1.1), land=0.1, lift=0.4, **kw)
            k += spacing * r.uniform(0.8, 1.25)

    def spatter(self, mask: np.ndarray, colour, count: int, rmax: float = 2.2, strength: float = 0.6) -> None:
        """A flick of the brush: a few stray dots of pigment."""
        r = rng(self._next())
        ys, xs = np.nonzero(mask > 0.5)
        if len(ys) == 0:
            return
        dots = np.zeros((self.h, self.w), np.uint8)
        for i in r.integers(0, len(ys), count):
            cv2.circle(dots, (int(xs[i]) * 4, int(ys[i]) * 4), int(r.uniform(0.6, rmax) * 4), 255, -1, cv2.LINE_AA, 2)
        self.glaze(dots.astype(np.float32) / 255, colour, strength, wobble=0, soft=0.6, edge=0.5, edge_w=1.5,
                   bloom=0, granulate=0.2)

    # -- out ------------------------------------------------------------------
    def rgb(self) -> np.ndarray:
        return np.clip(self.p.rgb * np.exp(-self.D), 0, 1)


def to_u8(a: np.ndarray) -> np.ndarray:
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_webp(path: str, rgb: np.ndarray, alpha: np.ndarray | None = None, quality: int = 90) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if alpha is None:
        Image.fromarray(to_u8(rgb), "RGB").save(path, "WEBP", quality=quality, method=6)
    else:
        a = np.dstack([to_u8(rgb), to_u8(alpha)[:, :, None]])
        Image.fromarray(a, "RGBA").save(path, "WEBP", quality=quality, method=6, exact=True)
    return os.path.getsize(path)


def over(dst: np.ndarray, rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return dst * (1 - alpha[:, :, None]) + rgb * alpha[:, :, None]
