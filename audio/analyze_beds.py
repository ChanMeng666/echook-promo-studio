"""Measure what audio/synth_music.py and audio/synth_sfx.py delivered.

Reads the WAVs back from disk (not the synth's own buffers) and prints, per bed:
exact duration, sha256, integrated loudness and true peak (ffmpeg ebur128, an
independent meter from the synth's), per-bar RMS, the 1-4 kHz level in the voice
window against the full sections, an onset on every full-section downbeat, and
the ring-out. Writes a spectrogram PNG per file into .cache/audio/.

Exit code 1 when an acceptance number is missed.

    python audio/analyze_beds.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
CACHE = os.path.join(ROOT, ".cache", "audio")

VOICE_MARGIN_DB = 12.0     # voice window must sit this far under the full sections, 1-4 kHz
ONSET_TOL_MS = 10.0
PEAK_MAX_DB = -3.0
LUFS_RANGE = (-18.5, -15.5)

failures: list[str] = []


def db(x: float) -> float:
    return 20 * np.log10(max(float(x), 1e-12))


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def sha(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def ebur128(path: str) -> tuple[float, float]:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = p.stderr[p.stderr.rfind("Summary:"):] if "Summary:" in p.stderr else ""
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", tail)
    tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)
    if not i or not tp:
        raise RuntimeError("ebur128 printed no summary for " + path + "\n" + p.stderr[-800:])
    return float(i.group(1)), float(tp.group(1))


def spectrogram(path: str, name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, name + ".png")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-lavfi",
                    "showspectrumpic=s=1600x640:legend=1:scale=log:fscale=log:drange=90", out], check=True)
    return out


def load(path: str) -> tuple[int, np.ndarray]:
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768.0
    return sr, (x if x.ndim == 2 else x[:, None])


def onset_offset_ms(mono: np.ndarray, sr: int, t: float) -> float:
    """Where the biggest energy step near `t` is, relative to `t`: the instant
    that maximises (energy of the 15 ms after) / (energy of the 15 ms before),
    searched +-45 ms in 0.25 ms steps. 15 ms is longer than one cycle of the
    lowest bass note, so a zero crossing in a sub tail cannot pose as an onset
    (a 4 ms frame did exactly that)."""
    win, hop = int(0.015 * sr), int(0.00025 * sr)
    c = int(round(t * sr))
    cs = np.concatenate([[0.0], np.cumsum(mono ** 2)])
    cand = np.arange(max(win, c - int(0.045 * sr)), min(len(mono) - win, c + int(0.045 * sr)), hop)
    ratio = (cs[cand + win] - cs[cand] + 1e-9) / (cs[cand] - cs[cand - win] + 1e-9)
    return (cand[int(np.argmax(ratio))] / sr - t) * 1000.0


def analyse_bed(cut: str, bed: dict, meta: dict, bar_sec: float) -> None:
    path = os.path.join(ROOT, "public", bed["file"])
    sr, x = load(path)
    n = len(x)
    mono = x.mean(1)
    print(f"\n=== bed-{cut}  {path}")
    print(f"  sha256 {sha(path)}")
    ok = sr == 48000 and x.shape[1] == 2 and n == bed["durationSec"] * 48000
    print(f"  {sr} Hz, {x.shape[1]} ch, {n} samples = {n / sr:.6f} s  (want {bed['durationSec'] * 48000})  {'OK' if ok else 'FAIL'}")
    if not ok:
        failures.append(f"bed-{cut}: format/duration")

    i_lufs, tp = ebur128(path)
    peak = db(np.abs(x).max())
    print(f"  integrated {i_lufs:.2f} LUFS   true peak {tp:.2f} dBTP   sample peak {peak:.2f} dBFS   "
          f"crest {peak - db(rms(x)):.1f} dB")
    if not (LUFS_RANGE[0] <= i_lufs <= LUFS_RANGE[1]):
        failures.append(f"bed-{cut}: loudness {i_lufs}")
    if peak > PEAK_MAX_DB or tp > PEAK_MAX_DB:
        failures.append(f"bed-{cut}: peak {peak:.2f} / true peak {tp:.2f}")

    bar_n = int(round(bar_sec * sr))
    nb = bed["bars"]
    band = sosfiltfilt(butter(4, [1000, 4000], btype="band", fs=sr, output="sos"), x, axis=0)
    low = sosfiltfilt(butter(4, 150, btype="low", fs=sr, output="sos"), x, axis=0)
    top = sosfiltfilt(butter(4, 6000, btype="high", fs=sr, output="sos"), x, axis=0)
    name_of = {}
    for s in bed["sections"]:
        for b in range(s["fromBar"], s["toBar"] + 1):
            name_of[b] = s["name"]
    print("  bar  section     RMS dBFS  1-4k dBFS  <150 Hz dBFS  >6 kHz dBFS")
    for b in range(1, nb + 1):
        sl = slice((b - 1) * bar_n, b * bar_n)
        print(f"  {b:3d}  {name_of[b]:10s}  {db(rms(x[sl])):7.1f}   {db(rms(band[sl])):7.1f}   {db(rms(low[sl])):7.1f}      {db(rms(top[sl])):7.1f}")

    bd = bed["breakdown"]
    full_bars = [b for b in range(1, nb + 1) if not (bd["fromBar"] <= b <= bd["toBar"]) and b < nb - 1]
    full = np.concatenate([band[(b - 1) * bar_n: b * bar_n] for b in full_bars])
    w0, w1 = meta["voiceWindowSec"]
    win = band[int(w0 * sr): int(w0 * sr) + int(1.5 * sr)]
    margin = db(rms(full)) - db(rms(win))
    # the loudest 100 ms inside the window, so a late leak cannot hide in an average
    hop = int(0.1 * sr)
    worst = max(db(rms(win[i:i + hop])) for i in range(0, len(win) - hop + 1, hop // 2))
    print(f"  voice window bar {meta['voiceBar']} [{w0:.3f} .. {w0 + 1.5:.3f} s]  1-4 kHz: {db(rms(win)):.1f} dBFS "
          f"(loudest 100 ms {worst:.1f})  vs full sections {db(rms(full)):.1f} dBFS  ->  {margin:.1f} dB below "
          f"(worst 100 ms {db(rms(full)) - worst:.1f} dB below)  need >= {VOICE_MARGIN_DB}  "
          f"{'OK' if db(rms(full)) - worst >= VOICE_MARGIN_DB else 'FAIL'}")
    print(f"    whole-band level in the window {db(rms(x[int(w0 * sr): int(w0 * sr) + int(1.5 * sr)])):.1f} dBFS")
    if db(rms(full)) - worst < VOICE_MARGIN_DB:
        failures.append(f"bed-{cut}: voice window margin {margin:.1f}")
    lb = meta["liftBar"]
    drop = meta["dropBar"]
    print(f"  lift bar {lb} RMS {db(rms(x[(lb - 1) * bar_n: lb * bar_n])):.1f} dBFS  ->  drop bar {drop} RMS "
          f"{db(rms(x[(drop - 1) * bar_n: drop * bar_n])):.1f} dBFS (loudest bar: "
          f"{1 + int(np.argmax([rms(x[b * bar_n:(b + 1) * bar_n]) for b in range(nb)]))})")

    # an onset on every downbeat outside the breakdown
    offs = []
    for b in [b for b in range(1, nb + 1) if not (bd["fromBar"] <= b <= bd["toBar"])]:
        t = bed["downbeats"][b - 1]
        if t == 0:
            first = int(np.argmax(np.abs(mono) > 10 ** (-40 / 20)))
            offs.append((b, first / sr * 1000))
        else:
            offs.append((b, onset_offset_ms(mono, sr, t)))
    bad = [(b, o) for b, o in offs if abs(o) > ONSET_TOL_MS]
    print(f"  downbeat onsets, {len(offs)} full-section bars: offsets min {min(o for _, o in offs):+.1f} ms  "
          f"max {max(o for _, o in offs):+.1f} ms  outside +-{ONSET_TOL_MS:.0f} ms: {bad if bad else 'none'}")
    if bad:
        failures.append(f"bed-{cut}: downbeat onsets {bad}")
    print(f"    first sample above -40 dBFS at {int(np.argmax(np.abs(mono) > 0.01)) / sr * 1000:.2f} ms; "
          f"RMS of the first 100 ms {db(rms(x[: sr // 10])):.1f} dBFS")

    # the ending
    stop = bed["arrangementStopsSec"]
    tail = np.abs(x).max(1)
    above = np.nonzero(tail > 10 ** (-60 / 20))[0]
    silent_from = (above[-1] + 1) / sr if len(above) else 0.0
    print(f"  arrangement stops {stop:.3f} s (final chord {meta['finalChordSec']:.3f} s); below -60 dBFS from "
          f"{silent_from:.3f} s; ring-out {silent_from - stop:.2f} s; last 50 ms RMS {db(rms(x[-int(0.05 * sr):])):.1f} dBFS; "
          f"last sample {int(round(float(tail[-1]) * 32768))}")
    for off in (0.5, 1.0, 1.4):
        i = int((meta["finalChordSec"] + off) * sr)
        print(f"    {off:.1f} s after the final chord: {db(rms(x[i: i + int(0.1 * sr)])):.1f} dBFS")
    if db(rms(x[-int(0.05 * sr):])) > -60:
        failures.append(f"bed-{cut}: does not ring out to silence")
    if stop > meta["finalChordSec"] + 0.25:
        failures.append(f"bed-{cut}: something is struck after the final chord")
    print(f"  spectrogram {spectrogram(path, 'bed-' + cut)}")


def analyse_sfx(sfx: dict) -> None:
    print("\n=== sfx")
    print("  role     kind       dur s   anchor s  peak dBFS  RMS dBFS  1-4k share  centroid Hz  gainDb  sha256[:12]")
    for role, r in sfx["roles"].items():
        path = os.path.join(ROOT, "public", r["file"])
        sr, x = load(path)
        mono = x.mean(1)
        band = sosfiltfilt(butter(4, [1000, 4000], btype="band", fs=sr, output="sos"), mono)
        share = np.sum(band ** 2) / max(np.sum(mono ** 2), 1e-12)
        spec = np.abs(np.fft.rfft(mono)) ** 2
        cen = float((np.fft.rfftfreq(len(mono), 1 / sr) * spec).sum() / spec.sum())
        ok = abs(len(x) / sr - r["durationSec"]) < 1e-4 and sr == 48000
        print(f"  {role:8s} {r['kind']:9s}  {len(x) / sr:6.3f}  {r['anchorSec']:7.4f}   {db(np.abs(x).max()):7.2f}   "
              f"{db(rms(x)):7.1f}   {100 * share:6.1f} %   {cen:9.0f}   {r['gainDb']:5.1f}   {sha(path)[:12]}"
              f"{'' if ok else '  DURATION MISMATCH'}")
        if not ok:
            failures.append(f"sfx {role}: duration/format")
        spectrogram(path, "sfx-" + role)
    print(f"  spectrograms in {CACHE}")


def main() -> None:
    with open(os.path.join(ROOT, "src", "data", "music.json"), encoding="utf8") as f:
        music = json.load(f)
    for cut in ("60", "30", "15"):
        analyse_bed(cut, music["beds"][cut], music["meta"]["beds"][cut], music["barSec"])
    sfx_path = os.path.join(ROOT, "src", "data", "sfx.json")
    if os.path.exists(sfx_path):
        with open(sfx_path, encoding="utf8") as f:
            analyse_sfx(json.load(f))
    print("\n" + ("ALL ACCEPTANCE NUMBERS MET" if not failures else "FAILED: " + "; ".join(failures)))
    print("No human has listened to any of these files; everything above is measurement.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
