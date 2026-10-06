# Decisions

Append-only. Each entry: what was decided, why, what was rejected. The brief and the
constraints registry are in `docs/brief.md`.

**D1 — Replica, not capture (2026-10-06).** echook's "interface" is a terminal session,
a status line, an OS toast and a set of sound files. All of it is rebuilt as pure
functions of time and fed by `npm run bake`, which runs the product's own CLI and
status-line script against a throwaway home. Rejected: screen recording (cannot be
re-laid-out for 9:16, cannot be re-timed to music, would show the maintainer's real
session).

**D2 — The sound effects of the film are the product (2026-10-06).** Every event sound
heard is the product's own mp3, played at the moment the replica shows that event.
Synthesised effects are limited to film furniture (camera moves, card arrivals).
Rejected: a separate designed SFX set, which would have the film demonstrating sounds
the product does not ship.

**D3 — Two worlds (2026-10-06).** The product keeps its true terminal colours; everything
that is not the product is a procedurally painted watercolour bitmap (`art/paint.py`),
so a viewer never confuses film furniture with interface. No SVG except the product's
own logo file; no generated images.

**D4 — Synthesised score on a fixed grid (2026-10-06).** 128 BPM so that 60 / 30 / 15 s
are exactly 32 / 16 / 8 bars. No licensed take existed and a music service cannot be
driven from this repo. `src/data/music.json` is shaped so a recorded take can replace
it. No human has listened to it yet — the weakest-evidenced part of the film.

**D5 — Three lengths, two aspects (2026-10-06).** 60 / 30 / 15 s x 16:9 / 9:16. No
120 s cut: the product has no "variety" chapter that would not repeat the 60.

**D6 — English on screen (2026-10-06).** The product's strings are English and C1
forbids retyping or translating them.

**D7 — `stop` is never called "done" (2026-10-06).** See C2. The product's voice line
"Task complete" is shown as the sound's name, and the film's own copy says "finishes
a turn" / "needs you".

**D8 — Intent in bars; one screenplay table per scene per cut (2026-10-06).** The EDLs
(`src/edits.ts`) are written in bars and `core/timeline.ts` turns a bar count into
seconds by reading the bed's own downbeat list, so a boundary is a bar line by
construction. What happens inside a beat is that scene's screenplay for that cut
(`src/replica/screenplays.ts`), written as bar/beat positions; the scenes paint from it,
the cue sheet places sounds from it, and the gates read it. Rejected: one long
screenplay per scene with a `from`/`to` window and a playback rate (the tamaiti shape) —
a product sound cannot be played at 1.4x, and a short cut here drops events rather than
running them faster. No bar count from the brief's table was changed.

**D9 — The terminal is a monitor's screen in HOOK and a floating window afterwards
(2026-10-06).** In HOOK (and the small desk panel in CHANNELS) the Terminal is mounted
in the painted monitor's `screenRect`. From EVENTS on it is a floating window over the
same desk, out of focus. Why: the painted screen is 1.6:1; a caption band under it
leaves 1344 px of width at 1080p, which is 19.6 px mono at 110 columns — fine for an
establishing shot, too small to read a status line from. The floating window is
1760 px wide (25.8 px mono). In 9:16 the monitor shows the 58-column terminal
(16 rows, most of them the status line — which is what a real narrow terminal does)
and the floating window is the tall version of the same thing. Rejected: pushing
until the monitor overfills the frame (the status line leaves the bottom of the
frame); a different column count per shot (the status line's row breaks are baked
per width and may not be re-flowed by the film).

**D10 — A third baked width (2026-10-06).** Asked the bake package for 110 columns
(`medium`) because 150 columns cannot reach 22 px mono inside 1920 px. Landscape uses
`medium`, vertical uses `narrow` (58); `wide` is baked but not shown.

**D11 — "3 on by default" lights three tiles (2026-10-06).** The wall lights the
canonical events that sound with no configuration (`counts.defaultOnEvents` = 3:
notification, stop, permission_request). Four variants of `notification` are also
effectively on by default (`counts.defaultOnVariants`), but they inherit from their
parent; lighting seven tiles under a caption that says three would contradict itself,
and saying seven would contradict the product's own status line ("3/39 Sounds"). A
`numbers` check pins lit tiles == the baked count.

**D12 — Which sounds are heard where (2026-10-06).** Constraint: C9 (one product sound
at a time, 0.3 s apart) and the real durations (permission-request.mp3 is 3.4 s).
60 s: AWAY stop/voice · EVENTS permission_request, notification_idle_prompt, stop, and
on the wall stop_failure_rate_limit · THEMES stop/voice then stop/chime · CHANNELS
permission_request. 30 s: AWAY stop · EVENTS notification_idle_prompt + rate limit on
the wall · CHANNELS permission_request. 15 s: AWAY stop · the wall's rate limit.
TALK has no product sound in any cut: the user has just muted it. Every onset sits on
a beat of the bed (gate). `notification-urgent.mp3` and `chime-permission-request.mp3`
are baked but unused.

**D13 — Product sounds are levelled by gain, never altered (2026-10-06).** The files
ship between -11.6 and -25.4 LUFS. Each is played with the gain that brings it to
-18 LUFS, capped by its own true peak (`scripts/measure-product-sounds.mjs` ->
`src/data/product-levels.json`, keyed by the sha256 the bake recorded). The bed sits
7 dB down and ducks a further 9 dB under a product sound from its onset to the end of
its audible part (from the baked peaks), deepest wins. Furniture sfx never duck the
bed. No ripple sfx is played under a voice line: the product's sound is heard alone.

**D14 — The talk JSON is shown without its volatile fields (2026-10-06).** The bake
blanks `until` / `until_iso` (they change every run). The film prints the remaining
keys of the real result and marks the cut with an ellipsis inside the braces, rather
than printing `null` for fields that are not null in a real run.

**D15 — TTS is not shown (2026-10-06).** C12 allowed a caption only. CHANNELS already
carries three panels and three labels; a fourth claim in the same seven seconds would
not be read. The film therefore says nothing about TTS.

**D16 — Honesty caption placement (2026-10-06).** Up for the whole EVENTS beat in
every cut (11.25 / 5.6 / 3.75 s; floor 3 s), once, in the bottom of the safe frame in
both aspects. Not repeated on the end card ("never doubled").

**D17 — Gates and their mutation evidence (2026-10-06).** `node capture/mutate.mjs`
breaks one invariant at a time, runs the gate that claims it, and restores:

| gate | mutation | result | first failure printed |
|---|---|---|---|
| timeline | the 60 s HOOK is cut to 3 bars | RED | cut 60: beats sum to 31 bars, the bed has 32 |
| timeline | a frame literal outside core/timeline.ts | RED | src/Film.tsx: frame arithmetic outside core/timeline.ts |
| strings | a label nobody cleared and the product does not say | RED | "Loved by developers on" ... is not the product's, the demo file's or cleared copy |
| numbers | a typed number on the count line | RED | "1234567" ...: a number with no source in the baked data or the demo file |
| numbers | a fourth tile lit on the wall | RED | the tiles lit on the wall number counts.defaultOnEvents |
| copy | a line saying the task is done (C2), uncleared | RED | uncleared: "You will know when the task is done." |
| honesty | the honesty caption is up for 2 s | RED | Echook-15-Landscape: honesty caption up for 2.00 s continuously, floor is 3 s |
| audio | the chime starts while the voice is sounding (C9) | RED | cut 60: stop and stop are -0.24 s apart (C9 floor 0.3 s) |
| audio | a product sound placed off the beat | RED | cut 60 permission_request @31.14 s: onset is 0.200 s off a beat |
| assets | a sound file the film names is missing | RED | missing public/audio/sfx/move.wav |
| purity | a CSS transition in a component | RED | src/components/Type.tsx: a CSS transition |

The `strings`/`numbers`/`honesty` gates do not read source text: they bundle the real
scene components (only `remotion` and the web-font loader are replaced by stand-ins in
`capture/stubs/`), paint every beat of all six compositions to markup every 0.25 s,
and trace each text node to the baked data, the demo file or the cleared copy. What
they cannot see: pixels. Overlap, clipping and legibility are the look loop's job.
C8's green-area rule has no gate; it was judged on stills (green is line work, small
type and a 210 px logo disc; nothing approaches 15 % of the frame).

**D18 — The look rounds (2026-10-06).** Stills for both aspects: frame 0, every 2 s,
and -0.2 / +0.1 / +0.4 s around every cut; contact sheets tiled in a separate process;
every sheet opened, and full-size stills opened wherever the question was size or
legibility. What each round found:

- *Round 1 (60 s landscape, 17 full-size frames).* Frame 0's caption was half inside its
  mask and read as cropped (floor raised to 0.9). The status bars' unfilled cells were
  nearly invisible. A chip's voice text ran into its waveform. Tile names on the wall
  broke mid-word (`permission_reque/st`); they now break at underscores, three lines.
  THEMES: the inactive chip was faded with opacity and went grey on paper; the chime's
  file name overflowed. CHANNELS: the toast body was clipped at "npm tes"; panels sat
  high in the frame. STATUSLINE: session text showed through the magnifier. END: the
  card sat in the top 60 % of the frame.
- *Round 2 (60 s vertical).* Terminal lines were squashed on top of each other wherever
  the session overflowed (flex shrink) — invisible in landscape, where it never
  overflows. The JSON line was clipped instead of wrapping. THEMES, CHANNELS and END
  left the lower half of the safe frame empty; each was re-laid out for 9:16.
- *Round 3 (first full contact sheets, 60 s).* CHANNELS opened on one panel and two
  thirds of an empty frame for nearly two seconds: all three panels are now there from
  the first frame, asleep, and each wakes when its channel fires. AWAY held 3.75 s on an
  empty room before the sound; the sound now lands on bar 2 beat 3. The vertical HOOK
  hardly moved; it now starts at cover and pushes until the monitor spans the frame.
  The vertical magnifier was no larger than the terminal under it; in 9:16 the context
  bar gets its own line.
- *Round 4 (30 s and 15 s sheets).* The count line rose, dropped and rose again (its
  frame-0 floor was applied only on the first frame) — seen only because the hand-over
  frames at +0.1 and +0.4 s disagreed. The vertical magnifier overflowed in the green
  state (it was sized from the current state's label; it is now one size for all three).
  The 15 s STATUSLINE had no caption and an empty band; it gets a five-word line.
- *Round 5 (the first delivered masters, read back by `capture/check-masters.mjs`).*
  The cut from HOOK to AWAY jumped in brightness (the caption scrim vanished on the
  cut): the scrim now leaves over the last 0.4 s; measured frame difference on that cut
  went from 10.6 to 0.4. THEMES was a white card between two dark scenes (mean luma
  22 -> 198 -> 34): the paper is now lamplit. A dim CHANNELS label re-rose when its
  panel woke.

Not changed, on purpose: the monitor in HOOK has an empty upper half (a bottom-anchored
session in a tall screen is what it looks like); the wall's tile names are a texture at
1080p, not something to read — the count line under them is the claim; the cut from
AWAY to EVENTS goes from a bright room to a dark screen in one frame (it is on the bar
line where the bed's lift arrives).

**D19 — Mastering is a fixed gain and a peak limiter, not loudnorm (2026-10-06).** The
first masters measured -16.1 LUFS / -2.2 dBTP and looked right, but the arithmetic did
not close: raw true peak (-3.4) plus the gain needed (+6.0) is +2.7, not -2.1. ffmpeg's
`loudnorm`, asked for `linear=true`, had fallen silently into its dynamic mode (it does
when the requested gain would break the peak target) and was riding the gain through
the film. `scripts/render.mjs` now applies one gain for the whole film and a limiter at
-2.2 dBFS, corrects the gain once against the delivered file, and writes into the
manifest how much the peaks were reduced (4.7-5.1 dB at most; the speech peaks of the
product's voice lines sit about 18 dB above the mix's loudness). The picture stream is
copied. The six masters were re-mastered from the same raw renders (`--reuse-raw`), so
their picture is the render of commit 43ac3bf; the manifest's `filmCommit` is the
commit of the re-master, which differs from it only in `scripts/render.mjs`.
Nobody has listened to either version.
