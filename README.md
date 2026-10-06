# echook promo studio

The source of a promo film for [echook](https://github.com/ChanMeng666/echook) — audio and
out-of-band notifications, and a status line, for terminal coding agents. The film is code:
a Remotion project whose picture is a **replica** of the product's terminal, status line,
toast and webhook notification, fed by the product's own data, set in a painted room, cut
to a synthesised score, and held to gates.

Nothing here is published by this repository. Masters are written to `out/masters/` and
are not committed.

## Deliverables

Three lengths x two aspects, 30 fps, H.264 + AAC 48 kHz, -16 LUFS, true peak <= -1.5 dBTP.

| composition | file | frames |
|---|---|---|
| `Echook-60-Landscape` | `out/masters/echook_60s_landscape_1920x1080.mp4` | 1800 |
| `Echook-60-Vertical` | `out/masters/echook_60s_vertical_1080x1920.mp4` | 1800 |
| `Echook-30-Landscape` | `out/masters/echook_30s_landscape_1920x1080.mp4` | 900 |
| `Echook-30-Vertical` | `out/masters/echook_30s_vertical_1080x1920.mp4` | 900 |
| `Echook-15-Landscape` | `out/masters/echook_15s_landscape_1920x1080.mp4` | 450 |
| `Echook-15-Vertical` | `out/masters/echook_15s_vertical_1080x1920.mp4` | 450 |

`out/masters/MANIFEST.json` (committed) records, for each delivered file, its sha256, frame
count, measured loudness and true peak, what was found at every cut, whether each product
sound is present at its cue, and the film and product commits.

## Commands

```
npm install
npm run bake          # product repo -> src/replica/data/product.generated.json + public/audio/product/
npm run verify        # the gate suite (re-runs the bake in --check mode)
node capture/mutate.mjs               # break each invariant, expect red, restore
node capture/stills.mjs --comp Echook-60-Landscape     # frame 0, every 2 s, and the hand-over frames
node capture/tile-contact.mjs         # contact sheets from whatever stills are on disk
npm run render                        # gates -> bundle once -> six masters, one at a time -> loudness -> manifest
node scripts/render.mjs --only 60l    # one master (15|30|60 + l|v), or --only 30 for both aspects
node capture/check-masters.mjs        # read the delivered files again
```

The product repo is expected at `../claude-code-audio-hooks` (override with
`ECHOOK_PRODUCT_DIR`) and is only ever read. `ffmpeg` and `ffprobe` must be on `PATH`.
Rendering uses at most three browser tabs and waits for 4 GB of free memory.

## How it is put together

```
docs/brief.md               the brief, the constraints registry (C1-C14), the story
docs/decisions.md           what was decided and why; the gates' mutation evidence; the look rounds
docs/copy-clearance.md      a row for every film-voice line and every demo-session string

scripts/bake-product-data.mjs       runs the product's real CLI and status-line script in a throwaway home
scripts/measure-product-sounds.mjs  loudness of the product sounds the film plays -> src/data/product-levels.json
scripts/render.mjs                  gates -> render -> two-pass loudnorm -> measure the delivered file
art/                        the painted plates (Python), -> public/art + src/data/art.json
audio/                      the score and the film-furniture effects (Python), -> public/audio + src/data/*.json

src/core/timeline.ts        the ONLY frame arithmetic; a boundary is a downbeat of the cut's own bed
src/core/layout-core.ts     the deliverables table, safe areas, where things sit in each aspect
src/core/camera.ts          views over a painted plate: translate + scale, parallax by depth
src/edits.ts                one EDL per length, in bars
src/scenes.ts               the scene library
src/copy.ts                 every film-voice word
src/cues.ts                 the cue sheet, derived by walking the cut
src/replica/demo.ts         the demo session: the only invented content
src/replica/screenplays.ts  when things happen in each scene, per cut; terminalAt(script, t) -> state
src/replica/product.ts      typed access to the baked data
src/replica/*.tsx           Terminal + StatusLine, SoundChip, SoundWall, ThemeToggle, Ripple, Toast, Phone
src/components/             Painted (the plates), the eight scenes, the film's type
src/Film.tsx, Root.tsx      beats as sequences; audio in one place

capture/verify.mjs          the gates
capture/paint.mjs           paints the real scene components to markup in Node, for the gates
capture/mutate.mjs          mutation evidence
capture/stills.mjs, tile-contact.mjs, check-masters.mjs
```

Three rules hold the film honest:

- **Everything the product says or measures is baked from the product** — event names,
  counts, voice-line texts, waveforms (peaks of the real mp3s), the status line (the real
  script's ANSI output for demo payloads, parsed into coloured spans), the CLI's JSON, the
  toast and webhook text. The `strings` and `numbers` gates paint every beat of all six
  compositions and trace each text node back to the baked data, the cleared copy or the
  one demo file. The sounds heard are the product's own mp3 files, level-matched by gain.
- **The replica is a pure function of time.** `terminalAt(script, t)` and the scenes take a
  second and return a picture; there are no CSS transitions, no clocks and no randomness.
- **Intent in bars and seconds; one file converts to frames.**

The film says on screen what it is: `Interface recreated in code · sounds are echook's own
files · demo session`, for the whole EVENTS beat of every cut.

## What a person still has to do

No person has watched or listened to these films. The gates prove structure and
consistency, and the stills were looked at frame by frame, but the music, the level of the
product's voice lines against it, the timing of sound against picture and the overall
feel are unjudged. Every film-voice line in `docs/copy-clearance.md` is pending the
maintainer's approval.
