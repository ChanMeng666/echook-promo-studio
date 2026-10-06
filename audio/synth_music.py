"""The music bed, synthesised: one written arrangement PER CUT LENGTH.

128 BPM, 4/4, A major. A bar is exactly 1.875 s = 90 000 samples at 48 kHz, so
60 / 30 / 15 s are 32 / 16 / 8 bars with nothing left over and the beat grid in
`src/data/music.json` is the score's own bar table, not a measurement.

What each bed is written to do (docs/brief.md, section 4 and 5):

  * a hit on beat 1 of bar 1 -- no ambient intro;
  * AWAY is a breakdown: drums and bass out, soft pad + sparse high bell. In the
    VOICE bar (where the film plays the product's own "Task complete") every
    track but the pad is muted and the pad is low-passed, so the 1-4 kHz band
    is close to empty for the first ~1.55 s of that bar; the next bar is a lift
    into EVENTS, the drop;
  * in EVENTS / THEMES / CHANNELS the product's sounds play over the bed, so the
    high lead rests there and the energy is kick, bass, hats, pad and a low
    marimba figure whose fundamentals sit under 700 Hz;
  * END lands on the tonic, the last chord is struck on the downbeat of the
    final bar and rings out to silence inside the file. No fade as an ending
    (the last 0.3 s carries a taper that only cleans a tail already ~40 dB down).

No sidechain pumping is baked in: the film ducks the bed under its own cues.
Everything is seeded; two runs give byte-identical files.

    python audio/synth_music.py   # public/audio/music/bed-{60,30,15}.wav + src/data/music.json
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter, sosfilt, sosfiltfilt

SR = 48000
BPM = 128.0
BEAT_N = 22500            # samples per beat (exact at 128 BPM / 48 kHz)
BAR_N = BEAT_N * 4
SIX_N = BEAT_N // 4
BEAT = BEAT_N / SR
BAR = BAR_N / SR
SWING_N = int(0.14 * SIX_N)   # the off 16ths sit a little late

TARGET_LUFS = -17.0
CEILING = 10 ** (-3.5 / 20)   # the soft clipper's asymptote; sample peak stays under it
VOICE_WINDOW_SEC = 1.55       # how long the voice bar stays empty in the mids

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT_AUDIO = os.path.join(ROOT, "public", "audio", "music")
OUT_DATA = os.path.join(ROOT, "src", "data", "music.json")

# ---------------------------------------------------------------- harmony
# A major, I - vi - IV - V with 7ths/9ths. Pad voicings share tones and move by
# step: the top voice walks B - G# - F# - F#.
CHORDS = {
    "I":   {"bass": 33, "pad": (61, 64, 68, 71), "stab": (57, 64, 61)},   # Amaj9
    "vi":  {"bass": 42, "pad": (57, 61, 64, 68), "stab": (54, 61, 57)},   # F#m9
    "IV":  {"bass": 38, "pad": (57, 61, 64, 66), "stab": (54, 57, 62)},   # Dmaj9
    "V":   {"bass": 40, "pad": (57, 62, 64, 66), "stab": (52, 59, 57)},   # E9sus4
    "V7":  {"bass": 40, "pad": (59, 62, 66, 68), "stab": (52, 59, 56)},   # E9
}

# the lead, eighths per bar (None = rest); A major pentatonic plus the odd G#
LEAD_HOOK = {
    "I":  [76, None, 73, 76, None, 81, None, 78],
    "vi": [76, None, 73, 76, None, 80, None, 76],
    "IV": [78, None, 73, 78, None, 81, None, 76],
    "V":  [76, None, 71, 76, None, 83, 81, 78],
}
LEAD_TALK = {
    "I":  [73, None, 76, None, 81, None, 76, None],
    "vi": [73, None, 76, None, 80, None, 76, 73],
    "IV": [78, None, 76, None, 73, None, 69, None],
    "V":  [71, None, 76, None, 78, 76, None, 83],
}
LEAD_ENDPRE = {
    "IV": [78, None, 81, None, 85, None, 81, 78],
    "V":  [80, None, 76, None, 83, None, 80, 83],
}
LEAD_HOOK["V7"], LEAD_TALK["V7"], LEAD_ENDPRE["V7"] = LEAD_HOOK["V"], LEAD_TALK["V"], LEAD_ENDPRE["V"]

BASS_A = [(0, 0.9, 0), (1.5, 0.4, 0), (2, 0.9, 0), (3.5, 0.4, 12)]
BASS_B = [(0, 0.6, 0), (0.75, 0.25, 0), (1.5, 0.45, 12), (2, 0.6, 0), (2.75, 0.25, 0), (3.5, 0.4, 7)]

# ---------------------------------------------------------------- the scores
# (section, style, chord) per bar. Section names are the film's scene names.
def _bars(section: str, style: str, chords: str) -> list[tuple[str, str, str]]:
    return [(section, style, c) for c in chords.split()]


SCORES = {
    60: (_bars("HOOK", "hook", "I vi IV V")
         + [("AWAY", "break", "IV"), ("AWAY", "break", "vi"), ("AWAY", "voice", "IV"), ("AWAY", "lift", "V")]
         + _bars("EVENTS", "events", "I vi IV V I vi")
         + _bars("THEMES", "themes", "IV V")
         + _bars("CHANNELS", "channels", "I vi IV V")
         + _bars("TALK", "talk", "I vi IV V")
         + _bars("STATUSLINE", "status", "I vi IV V")
         + [("END", "endpre", "IV"), ("END", "endpre", "V7"), ("END", "endhit", "I"), ("END", "final", "I")]),
    30: (_bars("HOOK", "hook", "I vi")
         + [("AWAY", "break", "vi"), ("AWAY", "voice", "IV"), ("AWAY", "lift", "V")]
         + _bars("EVENTS", "events", "I vi V")
         + _bars("CHANNELS", "channels", "I vi")
         + _bars("TALK", "talk", "IV V")
         + _bars("STATUSLINE", "status", "IV V7")
         + [("END", "endhit", "I"), ("END", "final", "I")]),
    15: (_bars("HOOK", "hook", "I")
         + [("AWAY", "voice", "IV"), ("AWAY", "lift", "V")]
         + _bars("EVENTS", "events", "I IV")
         + _bars("STATUSLINE", "status", "V7")
         + [("END", "endhit", "I"), ("END", "final", "I")]),
}

# ---------------------------------------------------------------- voices
def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def tgrid(dur: float) -> np.ndarray:
    return np.arange(int(round(dur * SR))) / SR


def noise(seed: int, n: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, f: float, order: int = 4) -> np.ndarray:
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


@lru_cache(maxsize=None)
def kick() -> np.ndarray:
    """Soft and round: a short pitch drop into a 46 Hz body, almost no click."""
    t = tgrid(0.42)
    f = 46 + 105 * np.exp(-t / 0.030)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.13)
    knock = 0.18 * np.sin(2 * ph) * np.exp(-t / 0.018)
    return (body + knock) * np.minimum(1, t / 0.0015) * np.minimum(1, (t[-1] - t) / 0.02)


@lru_cache(maxsize=None)
def bass(m: int, n: int) -> np.ndarray:
    """Sub pluck: a sine with a second harmonic that dies faster than the body."""
    t = np.arange(n + int(0.03 * SR)) / SR
    f = hz(m)
    x = (np.sin(2 * np.pi * f * t)
         + 0.50 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.22)
         + 0.20 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.07))
    dur = n / SR
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.55) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.008))
    return np.tanh(1.25 * x) / 1.25 * env


@lru_cache(maxsize=None)
def marimba(m: int, bright: float = 1.0, tau: float = 0.30) -> np.ndarray:
    """Mallet on a bar: the fundamental, the 4th partial for a few ms, a knock."""
    t = tgrid(min(2.6, 7 * tau))
    f = hz(m)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
         + 0.32 * bright * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / (0.18 * tau))
         + 0.10 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.012))
    return x * np.minimum(1, t / 0.002)


@lru_cache(maxsize=None)
def bell(m: int, tau: float = 0.5, index: float = 2.0) -> np.ndarray:
    """FM bell (carrier : modulator = 1 : 3.5), the index decaying into a sine."""
    t = tgrid(min(3.0, 7 * tau))
    f = hz(m)
    mod = index * np.exp(-t / 0.11) * np.sin(2 * np.pi * 3.5 * f * t)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / tau) * np.minimum(1, t / 0.002)


@lru_cache(maxsize=None)
def pad(notes: tuple, n: int, bright: float, attack: float, release: float) -> np.ndarray:
    """Airy stereo pad: two slightly detuned additive voices per note, one per
    side. `bright` 0..1 opens the harmonic roll-off."""
    t = np.arange(n + int(release * 4 * SR)) / SR
    dur = n / SR
    nh = int(round(4 + 6 * bright))
    p = 2.5 - 0.9 * bright
    out = np.zeros((len(t), 2))
    for k, m in enumerate(notes):
        for side, det in enumerate((-0.06, 0.06)):
            f = hz(m + det)
            for h in range(1, nh + 1):
                out[:, side] += np.sin(2 * np.pi * f * h * t + 1.7 * k + 0.9 * h + side) / h ** p
    env = np.minimum(1, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))
    trem = 1 + 0.05 * np.sin(2 * np.pi * 0.31 * t)
    return out * (env * trem)[:, None] / len(notes)


@lru_cache(maxsize=None)
def hat(seed: int, is_open: bool = False) -> np.ndarray:
    t = tgrid(0.32 if is_open else 0.07)
    x = highpass(noise(seed, len(t)), 7200)
    return x * np.exp(-t / (0.085 if is_open else 0.016)) * np.minimum(1, t / 0.001)


@lru_cache(maxsize=None)
def clap(seed: int) -> np.ndarray:
    """Three close bursts and a tail, kept dark (0.8-2.6 kHz) so it stays out of
    the way of a voice line."""
    t = tgrid(0.26)
    x = bandpass(noise(seed, len(t)), 800, 2600)
    env = sum(np.where(t >= d, np.exp(-(t - d) / 0.007), 0.0) for d in (0.0, 0.009, 0.019))
    env = env + np.where(t >= 0.019, 0.55 * np.exp(-(t - 0.019) / 0.065), 0.0)
    return x * env


@lru_cache(maxsize=None)
def rim(seed: int) -> np.ndarray:
    t = tgrid(0.08)
    return (np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.011)
            + 0.5 * bandpass(noise(seed, len(t)), 1500, 5000) * np.exp(-t / 0.004)) * np.minimum(1, t / 0.0008)


@lru_cache(maxsize=None)
def snare(seed: int) -> np.ndarray:
    t = tgrid(0.2)
    return (0.7 * bandpass(noise(seed, len(t)), 400, 5200) * np.exp(-t / 0.05)
            + 0.6 * np.sin(2 * np.pi * 196 * t) * np.exp(-t / 0.035)) * np.minimum(1, t / 0.001)


@lru_cache(maxsize=None)
def crash(seed: int) -> np.ndarray:
    t = tgrid(1.7)
    x = highpass(noise(seed, len(t)), 4800)
    return x * np.exp(-t / 0.42) * np.minimum(1, t / 0.002)


@lru_cache(maxsize=None)
def riser(seed: int, n: int, f0: float, f1: float, power: float) -> np.ndarray:
    """A band of noise whose centre climbs, getting louder to its last sample."""
    src = noise(seed, n)
    u = np.arange(n) / n
    out = np.zeros(n)
    for i in range(10):
        a = i / 9
        fc = f0 * (f1 / f0) ** a
        out += bandpass(src, fc * 0.75, min(fc * 1.35, 0.45 * SR)) * np.exp(-((u - a) / 0.17) ** 2)
    out *= u ** power
    cut = int(0.006 * SR)
    out[-cut:] *= np.linspace(1, 0, cut)
    return out


# ---------------------------------------------------------------- mixing desk
class Desk:
    """Two buses, each with a dry signal and a reverb send: `pad` (stays through
    the voice window, low-passed) and `main` (muted through it)."""

    def __init__(self, n: int, seed: int):
        self.n = n
        self.bus = {k: [np.zeros((n, 2)), np.zeros((n, 2))] for k in ("pad", "main")}
        self.rng = np.random.default_rng(seed)
        self.last_onset = 0

    def vel(self, spread: float = 0.08) -> float:
        return 1.0 + spread * float(self.rng.uniform(-1, 1))

    def late(self, max_ms: float = 3.0) -> int:
        return int(self.rng.uniform(0, max_ms) * SR / 1000)

    def add(self, bus: str, i0: int, x: np.ndarray, gain: float, pan: float = 0.0, send: float = 0.15) -> None:
        if i0 >= self.n or i0 < 0:
            return
        x = x[: self.n - i0]
        if x.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            x = np.stack([x * l, x * r], 1)
        dry, wet = self.bus[bus]
        dry[i0:i0 + len(x)] += x * gain
        wet[i0:i0 + len(x)] += x * (gain * send)
        self.last_onset = max(self.last_onset, i0)


def at(bar: int, beat: float = 0.0) -> int:
    return bar * BAR_N + int(round(beat * BEAT_N))


def lead_note(d: Desk, i0: int, m: int, gain: float, pan: float, echo: bool = True) -> None:
    """A marimba note with a dotted-eighth ping-pong echo written into the score."""
    d.add("main", i0 + d.late(), marimba(m, 1.0, 0.30), gain * d.vel(), pan, 0.28)
    if echo:
        step = int(0.75 * BEAT_N)
        d.add("main", i0 + step, marimba(m, 0.5, 0.24), gain * 0.30, -pan * 1.6, 0.35)
        d.add("main", i0 + 2 * step, marimba(m, 0.3, 0.20), gain * 0.11, pan * 1.6, 0.4)


def stack(d: Desk, i0: int, notes: list[int], gain: float, tau: float, strum_ms: float = 18.0) -> None:
    """A bell chord, strummed bottom to top and spread across the stereo field."""
    for j, m in enumerate(notes):
        pan = (j / max(1, len(notes) - 1) - 0.5) * 1.1
        d.add("main", i0 + int(j * strum_ms * SR / 1000), bell(m, tau, 1.8), gain * (1 - 0.05 * j), pan, 0.4)


def drums(d: Desk, bar: int, style: str, fill: bool) -> None:
    kicks = {
        "hook": [(0, 1.0), (1.5, 0.6), (2, 0.92)] + ([(3.5, 0.55)] if bar % 2 else []),
        "talk": [(0, 1.0), (2, 0.92), (2.75, 0.5)],
        "endpre": [(0, 1.0), (1, 0.9), (2, 0.95), (3, 0.9)],
    }.get(style, [(0, 1.0), (1, 0.9), (2, 0.96), (3, 0.9)])
    for beat, v in kicks:
        d.add("main", at(bar, beat), kick(), 0.58 * v, 0.0, 0.02)

    for beat in (1, 3):
        if fill and beat == 3:
            continue
        if style == "hook":
            d.add("main", at(bar, beat), rim(31 + beat), 0.24 * d.vel(), -0.2, 0.3)
        else:
            g = {"talk": 0.20, "themes": 0.22}.get(style, 0.26)
            d.add("main", at(bar, beat), clap(41 + beat), g * d.vel(), -0.12, 0.3)

    if style in ("events", "channels", "status"):
        accents = (0.55, 0.26, 0.85, 0.34)
        for s in range(16):
            i0 = at(bar) + s * SIX_N + (SWING_N if s % 2 else 0) + d.late(2.0)
            d.add("main", i0, hat(500 + s % 8), 0.34 * accents[s % 4] * d.vel(0.15), 0.32, 0.08)
    else:
        for e in range(8):
            off = e % 2 == 1
            is_open = off and style == "themes" and e in (3, 7)
            i0 = at(bar) + e * 2 * SIX_N + d.late(2.0)
            d.add("main", i0, hat(520 + e, is_open), (0.30 if off else 0.16) * d.vel(0.15), 0.32, 0.08)
        if style in ("hook", "talk"):          # a ghost 16th before beats 2 and 4, swung
            for s in (3, 11):
                d.add("main", at(bar) + s * SIX_N + SWING_N, hat(540 + s), 0.12 * d.vel(0.2), 0.32, 0.08)

    if fill:                                    # a small roll into the next section
        for j, v in enumerate((0.45, 0.6, 0.8, 1.0)):
            d.add("main", at(bar, 3) + j * SIX_N, snare(60 + j), 0.24 * v, 0.25 - 0.17 * j, 0.25)
        d.add("main", at(bar, 2), riser(70, 2 * BEAT_N, 1500, 9000, 2.5), 0.07, 0.0, 0.3)


def bass_line(d: Desk, bar: int, chord: str, pattern: list) -> None:
    root = CHORDS[chord]["bass"]
    for beat, ln, up in pattern:
        m = root + up
        if m > 47:                              # keep the pickup notes in the sub's octave
            m -= 12
        d.add("main", at(bar, beat), bass(m, int(ln * BEAT_N)), 0.27 * d.vel(0.05), 0.0, 0.0)


def low_figure(d: Desk, bar: int, chord: str, style: str) -> None:
    """The marimba under the product's sounds: fundamentals below 700 Hz."""
    notes = CHORDS[chord]["stab"]
    if style == "channels":                    # an eighth-note arpeggio, up and back
        seq = [notes[0], notes[1], notes[2], notes[1] + 12, notes[2], notes[1], notes[0] + 12, notes[1]]
        slots = [(e * 0.5, m) for e, m in enumerate(seq)]
    elif style == "themes":
        slots = [(0, notes[0]), (1.5, notes[1]), (2.5, notes[2])]
    else:                                       # 3 + 3 + 2
        slots = [(0, notes[0]), (0.75, notes[1]), (1.5, notes[2]), (2, notes[0] + 12), (2.75, notes[1]), (3.5, notes[2])]
    for j, (beat, m) in enumerate(slots):
        acc = 1.0 if beat in (0, 2) else 0.74
        d.add("main", at(bar, beat) + d.late(), marimba(m, 0.22, 0.26), 0.30 * acc * d.vel(),
              0.38 if j % 2 else -0.38, 0.22)


def render(cut: int) -> tuple[dict, dict]:
    score = SCORES[cut]
    nbars = len(score)
    n = nbars * BAR_N
    assert n == cut * SR, (cut, n)
    d = Desk(n, seed=1280 + cut)
    voice_bar = next(i for i, (_, style, _) in enumerate(score) if style == "voice")
    drop_bar = next(i for i, (_, style, _) in enumerate(score) if style == "events")

    for bar, (section, style, chord) in enumerate(score):
        c = CHORDS[chord]
        nxt = score[bar + 1] if bar + 1 < nbars else None
        section_ends = nxt is not None and nxt[0] != section
        fill = section_ends and style in ("events", "themes", "channels", "talk", "status", "endpre", "hook") \
            and nxt[1] not in ("break", "voice")
        first_of_section = bar == 0 or score[bar - 1][0] != section

        # ---- AWAY: the breakdown
        if style == "break":
            d.add("pad", at(bar), pad(c["pad"], BAR_N, 0.25, 0.35, 0.35), 0.30, 0, 0.5)
            for beat, m, g in ((0, 88, 1.0), (1.5, 85, 0.7), (2.5, 81, 0.55)) if bar % 2 == 0 else ((0, 85, 0.9), (1.5, 83, 0.6)):
                d.add("main", at(bar, beat), bell(m, 0.42, 1.4), 0.10 * g, 0.3 - 0.3 * beat, 0.5)
                d.add("main", at(bar, beat + 0.75), bell(m, 0.3, 0.8), 0.03 * g, -0.4, 0.5)
            continue
        if style == "voice":
            # pad only, dark; the desk mutes everything else through the window
            d.add("pad", at(bar), pad(c["pad"], BAR_N, 0.0, 0.25, 0.3), 0.085, 0, 0.3)
            d.add("pad", at(bar), pad((c["bass"] + 12,), BAR_N, 0.0, 0.3, 0.3), 0.025, 0, 0.0)
            continue
        if style == "lift":
            d.add("pad", at(bar), pad(c["pad"], BAR_N, 0.8, 1.4, 0.12), 0.36, 0, 0.5)
            d.add("main", at(bar), riser(71, BAR_N, 400, 8500, 2.0), 0.15, 0.0, 0.35)
            hits = [0, 0.5, 1, 1.5] + [2 + 0.25 * j for j in range(7)]     # the last 16th is left empty
            for j, beat in enumerate(hits):
                d.add("main", at(bar, beat), snare(80 + j % 4), 0.09 + 0.19 * (j / (len(hits) - 1)) ** 1.5,
                      -0.2 + 0.04 * j, 0.25)
            for e, m in enumerate([64, 66, 69, 71, 74, 76, 78, 81]):
                d.add("main", at(bar, e * 0.5), marimba(m, 0.7, 0.22), 0.13 + 0.022 * e, -0.3 + 0.085 * e, 0.3)
            continue

        # ---- END: the cadence
        if style == "endhit":
            d.add("pad", at(bar), pad((57, 61, 64, 71), BAR_N, 0.45, 0.02, 0.5), 0.34, 0, 0.5)
            d.add("main", at(bar), kick(), 0.58, 0, 0.02)
            d.add("main", at(bar), bass(33, int(3.2 * BEAT_N)), 0.30, 0, 0.0)
            d.add("main", at(bar), crash(91), 0.07, 0.1, 0.3)
            stack(d, at(bar), [57, 64, 69, 73, 76, 83], 0.13, 0.5)
            for e, m in enumerate([None, 88, 85, 81, 76, 73, 71, 69]):
                if m is not None:
                    lead_note(d, at(bar, e * 0.5), m, 0.26 * (1 - 0.07 * e), 0.15 if e % 2 else -0.15, echo=False)
            for e in range(1, 8):
                d.add("main", at(bar) + e * 2 * SIX_N, hat(520 + e), (0.24 if e % 2 else 0.12) * (1 - 0.08 * e), 0.32, 0.08)
            d.add("main", at(bar, 2), kick(), 0.36, 0, 0.02)
            continue
        if style == "final":
            # the last chord: struck once on the downbeat and left alone
            d.add("pad", at(bar), pad((57, 64, 69, 73), int(0.5 * BEAT_N), 0.3, 0.01, 0.28), 0.34, 0, 0.4)
            d.add("main", at(bar), kick(), 0.54, 0, 0.02)
            low = bass(33, int(1.6 * BEAT_N))
            d.add("main", at(bar), low * np.exp(-np.arange(len(low)) / SR / 0.35), 0.32, 0, 0.0)
            stack(d, at(bar), [57, 64, 69, 73, 76, 83, 85], 0.16, 0.30, strum_ms=22.0)
            continue

        # ---- full sections
        bright = {"hook": 0.5, "talk": 0.45, "themes": 0.5}.get(style, 0.6)
        d.add("pad", at(bar), pad(c["pad"], BAR_N, bright, 0.06 if first_of_section else 0.12, 0.25), 0.21, 0, 0.45)
        if style in ("events", "channels", "status"):       # an octave of air on top
            d.add("pad", at(bar), pad(tuple(m + 12 for m in c["pad"][1:]), BAR_N, 0.2, 0.3, 0.25), 0.09, 0, 0.5)

        drums(d, bar, style, fill)
        bass_line(d, bar, chord, BASS_A if style in ("hook", "talk") else BASS_B)

        if style in ("events", "themes", "channels", "status"):
            low_figure(d, bar, chord, style)

        if style in ("hook", "talk", "status", "endpre"):
            fig = {"hook": LEAD_HOOK, "status": LEAD_HOOK, "talk": LEAD_TALK, "endpre": LEAD_ENDPRE}[style][chord]
            for e, m in enumerate(fig):
                if m is None:
                    continue
                acc = 1.0 if e in (0, 5) else 0.78
                g = 0.24 if style == "status" else 0.28
                lead_note(d, at(bar, e * 0.5), m, g * acc, 0.2 if e % 2 else -0.2)
                if style == "status" and e in (0, 5):       # a bell an octave up on the accents
                    d.add("main", at(bar, e * 0.5), bell(m + 12, 0.28, 1.2), 0.06, 0.45, 0.45)

        if first_of_section and bar != 0:
            d.add("main", at(bar), crash(90 + bar % 3), 0.15 if bar == drop_bar else 0.07, 0.1, 0.3)

    # the two arrivals: the opening hit and the drop
    d.add("main", 0, crash(89), 0.09, 0.1, 0.3)
    stack(d, 0, [57, 64, 69, 73, 76], 0.14, 0.45)
    stack(d, at(drop_bar), [57, 64, 69, 73, 76, 81], 0.15, 0.5)
    arrangement_stops = d.last_onset / SR

    # ---- one small room
    t = tgrid(1.5)
    ir = np.random.default_rng(7).standard_normal((len(t), 2)) * np.exp(-t / 0.30)[:, None]
    ir[: int(0.012 * SR)] = 0
    ir = sosfilt(butter(2, [300, 7000], btype="band", fs=SR, output="sos"), ir, axis=0)
    ir /= np.sqrt((ir ** 2).sum(0))[None, :]

    def room(wet: np.ndarray) -> np.ndarray:
        return np.stack([fftconvolve(wet[:, ch], ir[:, ch])[:n] for ch in (0, 1)], 1)

    pad_sig = d.bus["pad"][0] + 0.8 * room(d.bus["pad"][1])
    main_sig = d.bus["main"][0] + 0.8 * room(d.bus["main"][1])

    # ---- the voice window: main out, pad low-passed (zero-phase, so the
    # crossfade between the open and the closed pad cannot comb)
    ts = np.arange(n) / SR
    v0 = voice_bar * BAR
    w = np.clip((ts - (v0 - 0.20)) / 0.17, 0, 1) * np.clip(((v0 + VOICE_WINDOW_SEC + 0.10) - ts) / 0.10, 0, 1)
    w = (0.5 - 0.5 * np.cos(np.pi * w))[:, None]
    dark = sosfiltfilt(butter(4, 600, btype="low", fs=SR, output="sos"), pad_sig, axis=0)
    mix = pad_sig * (1 - w) + dark * w + main_sig * (1 - w)

    mix = sosfilt(butter(2, 28, btype="high", fs=SR, output="sos"), mix, axis=0)
    # a little air: a first-order shelf, about +3.5 dB above 6 kHz, nothing at 1-4 kHz
    mix = mix + 0.5 * sosfilt(butter(1, 6000, btype="high", fs=SR, output="sos"), mix, axis=0)

    # ---- master: soft saturation into a fixed ceiling, level set by loudness
    mix /= np.abs(mix).max()
    lo, hi = 0.02, 8.0
    for _ in range(26):
        g = np.sqrt(lo * hi)
        if lufs(CEILING * np.tanh(mix * g / CEILING)) < TARGET_LUFS:
            lo = g
        else:
            hi = g
    g = np.sqrt(lo * hi)
    drive_db = 20 * np.log10(g / CEILING)
    mix = CEILING * np.tanh(mix * g / CEILING)

    taper = int(0.30 * SR)                       # cleans the tail; the ending is the ring-out
    mix[-taper:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, taper)))[:, None]

    pcm = np.round(mix * 32767).astype(np.int16)
    os.makedirs(OUT_AUDIO, exist_ok=True)
    wavfile.write(os.path.join(OUT_AUDIO, f"bed-{cut}.wav"), SR, pcm)

    sections: list[dict] = []
    for bar, (section, _, _) in enumerate(score):
        if sections and sections[-1]["name"] == section:
            sections[-1]["toBar"] = bar + 1
        else:
            sections.append({"name": section, "fromBar": bar + 1, "toBar": bar + 1})
    away = next(s for s in sections if s["name"] == "AWAY")
    bed = {
        "file": f"audio/music/bed-{cut}.wav",
        "durationSec": cut,
        "bars": nbars,
        "downbeats": [round(i * BAR, 6) for i in range(nbars)],
        "sections": sections,
        "breakdown": {"fromBar": away["fromBar"], "toBar": away["toBar"]},
        "arrangementStopsSec": round(arrangement_stops, 4),
    }
    extra = {
        "voiceBar": voice_bar + 1,
        "voiceWindowSec": [round(v0, 6), round(v0 + VOICE_WINDOW_SEC, 6)],
        "liftBar": voice_bar + 2,
        "dropBar": drop_bar + 1,
        "finalChordSec": round((nbars - 1) * BAR, 6),
        "chords": [c for _, _, c in score],
    }
    print(f"bed-{cut}.wav  {nbars} bars  {len(pcm) / SR:.6f} s  "
          f"peak {20 * np.log10(np.abs(pcm).max() / 32768):.2f} dBFS  "
          f"{lufs(pcm / 32768.0):.2f} LUFS (own meter)  master drive {drive_db:+.1f} dB over ceiling  "
          f"arrangement stops {arrangement_stops:.3f} s")
    return bed, extra


# ---------------------------------------------------------------- loudness
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
K_HIGH = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def lufs(x: np.ndarray) -> float:
    """Integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks, both gates)."""
    y = lfilter(*K_HIGH, lfilter(*K_SHELF, x, axis=0), axis=0)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    cs = np.concatenate([np.zeros((1, y.shape[1])), np.cumsum(y ** 2, axis=0)])
    starts = np.arange(0, len(y) - block + 1, hop)
    z = ((cs[starts + block] - cs[starts]) / block).sum(1)
    with np.errstate(divide="ignore"):
        l = -0.691 + 10 * np.log10(z)
    z = z[l > -70]
    if not len(z):
        return -np.inf
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def main() -> None:
    beds, extras = {}, {}
    for cut in (60, 30, 15):
        beds[str(cut)], extras[str(cut)] = render(cut)
    data = {
        "bpm": BPM, "barSec": BAR, "beatSec": BEAT,
        "beds": beds,
        # not part of the contract in docs/brief.md section 6; additive
        "meta": {
            "source": "synthesised by audio/synth_music.py in this repository; original score, no samples, no generated-music service",
            "commercialUse": True,
            "key": "A major",
            "progression": "Amaj9 - F#m9 - Dmaj9 - E9sus4 (E9 before the final tonic)",
            "sampleRate": SR, "channels": 2, "bitDepth": 16,
            "targetLufs": TARGET_LUFS,
            "beds": extras,
        },
    }
    os.makedirs(os.path.dirname(OUT_DATA), exist_ok=True)
    with open(OUT_DATA, "w", encoding="utf8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("wrote src/data/music.json")


if __name__ == "__main__":
    main()
