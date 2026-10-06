"""Film furniture, synthesised: six ROLES, one file each.

These are the film's own sounds -- camera travel, a key tick, a card arriving.
The EVENT sounds heard in the film are the product's real mp3s and are not made
here. A cue names a role; `src/data/sfx.json` maps the role to a file, its
measured anchor and its level.

  move    soft whoosh for camera travel / a scene change      texture
  type    one soft key tick                                   transient
  appear  a card or chip arriving                             transient
  ripple  airy swell under the sound-ring visual              texture
  toggle  the theme switch: two small clicks                  transient
  end     the end card settling, in the bed's key (A)         transient

`ripple` plays next to a product voice line, so it is built from air above
5 kHz and a soft tone below 400 Hz and leaves 1-4 kHz almost empty.

anchorSec is the instant that should land on the action: for a transient the
first sample within 12 dB of the peak; for `move` the crest of the swell (it is
meant to straddle a cut); for `ripple` the first moment its smoothed envelope is
within 12 dB of its maximum.

Seeded, 48 kHz stereo 16-bit WAV; two runs give byte-identical files.

    python audio/synth_sfx.py
"""

from __future__ import annotations

import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "public", "audio", "sfx")
MANIFEST = os.path.join(ROOT, "src", "data", "sfx.json")


def t(dur: float) -> np.ndarray:
    return np.arange(int(round(dur * SR))) / SR


def noise(seed: int, n: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def band(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def tine(m: float, dur: float, decay: float) -> np.ndarray:
    x = t(dur)
    f = hz(m)
    return (np.sin(2 * np.pi * f * x) * np.exp(-x / decay)
            + 0.22 * np.sin(2 * np.pi * f * 4.0 * x) * np.exp(-x / (0.15 * decay))) * np.minimum(1, x / 0.003)


def stereo(left: np.ndarray, right: np.ndarray | None = None) -> np.ndarray:
    return np.stack([left, left if right is None else right], 1)


def move() -> np.ndarray:
    """Breath, not wind: band-passed noise whose centre glides up under a swell.
    The two sides use different noise, so it has width without a pan."""
    dur = 0.62
    x = t(dur)
    sides = []
    for seed in (301, 302):
        n = noise(seed, len(x))
        out = np.zeros_like(x)
        for i in range(9):
            a = i / 8
            f = 380 * (11 ** a)
            out += band(n, f * 0.72, f * 1.38) * np.exp(-(((x / dur) - (0.14 + 0.66 * a)) / 0.17) ** 2)
        sides.append(out * np.sin(np.pi * np.clip(x / dur, 0, 1)) ** 1.3)
    return stereo(*sides)


def key() -> np.ndarray:
    x = t(0.055)
    tick = band(noise(211, len(x)), 2600, 9000) * np.exp(-x / 0.0055)
    body = 0.5 * np.sin(2 * np.pi * 560 * x) * np.exp(-x / 0.008)
    return stereo((tick + body) * np.minimum(1, x / 0.0006))


def appear() -> np.ndarray:
    """A droplet -- a fast upward glide -- with a small tine on top (E6)."""
    x = t(0.30)
    f = 400 + 560 * (1 - np.exp(-x / 0.02))
    drop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.045) * np.minimum(1, x / 0.002)
    ting = tine(88, 0.30, 0.07)
    return stereo(drop + 0.35 * ting)


def ripple() -> np.ndarray:
    """Air above 5 kHz that opens and closes, over a soft A3 + E4 bloom."""
    dur = 1.5
    x = t(dur)
    env = np.minimum(1, x / 0.22) ** 1.5 * np.exp(-np.maximum(0, x - 0.22) / 0.38)
    sides = []
    for seed in (401, 402):
        air = band(noise(seed, len(x)), 5200, 11000, order=4)
        tone = (np.sin(2 * np.pi * 220.0 * x) + 0.6 * np.sin(2 * np.pi * 329.63 * x + seed)) * 0.5
        sides.append((air * 0.55 + tone * 0.9) * env)
    return stereo(*sides)


def toggle() -> np.ndarray:
    """A switch: a low click, then a slightly higher one 55 ms later."""
    x = t(0.16)

    def one(seed: int, f: float) -> np.ndarray:
        y = t(0.09)
        return (np.sin(2 * np.pi * f * y) * np.exp(-y / 0.011)
                + 0.55 * band(noise(seed, len(y)), 1800, 7000) * np.exp(-y / 0.0035)) * np.minimum(1, y / 0.0006)

    out = np.zeros_like(x)
    a, b = one(501, 300), one(502, 410)
    out[: len(a)] += a
    o = int(0.055 * SR)
    out[o:o + len(b)] += 0.8 * b[: len(out) - o]
    return stereo(out)


def end() -> np.ndarray:
    """The end card: a low bloom on A and a soft A-major tine stack with a
    breath of air. The bed's own cadence carries the harmony; this adds weight."""
    dur = 2.0
    x = t(dur)
    sub = (np.sin(2 * np.pi * 55.0 * x) + 0.6 * np.sin(2 * np.pi * 110.0 * x)) * np.exp(-x / 0.45) * np.minimum(1, x / 0.004)
    sides = []
    for side, seed in enumerate((601, 602)):
        air = band(noise(seed, len(x)), 2500, 10000) * np.exp(-x / 0.22) * 0.10
        ch = np.zeros_like(x)
        for j, m in enumerate((57, 69, 76, 85)):
            s = tine(m, 1.7, 0.42)
            o = int(j * 0.028 * SR)
            pan = 0.5 + (0.35 if (j + side) % 2 else -0.35) * (j > 0)
            ch[o:o + len(s)] += s[: len(ch) - o] * pan
        sides.append(sub + air + 0.5 * ch)
    return stereo(*sides)


def anchor(x: np.ndarray, how: str) -> float:
    mono = np.abs(x).max(1)
    if how == "first-strong-sample":
        return int(np.argmax(mono >= mono.max() * 10 ** (-12 / 20))) / SR
    k = int(0.02 * SR)                           # 20 ms RMS envelope
    env = np.sqrt(np.convolve(mono ** 2, np.ones(k) / k, mode="same"))
    if how == "crest":
        return int(np.argmax(env)) / SR
    return int(np.argmax(env >= env.max() * 10 ** (-12 / 20))) / SR


#        role      builder  kind         peak dBFS  fade s  gainDb  anchor rule
ROLES = [
    ("move",   move,   "texture",   -6.0, 0.08, -15.0, "crest"),
    ("type",   key,    "transient", -3.0, 0.01, -20.0, "first-strong-sample"),
    ("appear", appear, "transient", -3.0, 0.03, -14.0, "first-strong-sample"),
    ("ripple", ripple, "texture",   -6.0, 0.25, -18.0, "first-strong-envelope"),
    ("toggle", toggle, "transient", -3.0, 0.02, -13.0, "first-strong-sample"),
    ("end",    end,    "transient", -3.0, 0.40, -9.0,  "first-strong-sample"),
]


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    roles = {}
    for name, build, kind, peak_db, fade, gain_db, rule in ROLES:
        x = build()
        n = int(fade * SR)
        x[-n:] *= np.linspace(1, 0, n)[:, None]
        x -= x.mean(0)[None, :]
        x *= 10 ** (peak_db / 20) / np.abs(x).max()
        pcm = np.round(x * 32767).astype(np.int16)
        wavfile.write(os.path.join(OUT, name + ".wav"), SR, pcm)
        roles[name] = {
            "file": f"audio/sfx/{name}.wav",
            "durationSec": round(len(pcm) / SR, 4),
            "anchorSec": round(anchor(pcm / 32768.0, rule), 4),
            "gainDb": gain_db,
            "kind": kind,
        }
        print(f"  {name:7s} {kind:9s} {roles[name]['durationSec']:.3f} s  anchor {roles[name]['anchorSec'] * 1000:6.1f} ms  "
              f"peak {peak_db:.1f} dBFS  gain {gain_db:.0f} dB")
    manifest = {
        "roles": roles,
        # additive, not part of the contract
        "meta": {
            "source": "synthesised by audio/synth_sfx.py in this repository; no samples, no vendor",
            "commercialUse": True,
            "sampleRate": SR, "channels": 2, "bitDepth": 16,
            "anchorRule": {name: rule for name, _, _, _, _, _, rule in ROLES},
            "note": "gainDb is a starting level under a bed at about -17 LUFS; nobody has listened to these files.",
        },
    }
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", encoding="utf8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {len(roles)} files + src/data/sfx.json")


if __name__ == "__main__":
    main()
