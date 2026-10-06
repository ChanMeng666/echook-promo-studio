# echook promo film — brief, constraints, story, contracts

Commander's document. Every implementer reads this first. Method: the product-film
method (a coded replica of the product's own interface, rendered with Remotion, held
to gates), learned on two earlier film studios by the same maintainer.

Product repo (read-only for everyone): `../claude-code-audio-hooks`, published as
[ChanMeng666/echook](https://github.com/ChanMeng666/echook) (echook v6.7.2, commit
452fee8). Its `AGENTS.md` is the product's own truth.

## 1. The brief

1. **What the product is.** echook plays a different sound for each thing your AI coding
   agent does (finishes a turn, asks permission, hits a rate limit), can also raise a
   desktop toast or call a webhook, and pins a status line with context and quota bars
   to the bottom of the terminal. Works in Claude Code, Cursor and Codex. You set it up
   by asking your agent.
2. **Who the film is for.** Developers who use a terminal coding agent, seeing it in the
   GitHub README (16:9, often muted at first) and in social feeds (9:16).
3. **What must be understood by the end of the 15 s cut.** You can look away from the
   terminal; echook tells you by sound what happened; it is real and installable.
4. **What must never be claimed.** See the registry.
5. **Deliverables.** 60 / 30 / 15 s x 16:9 (1920x1080) / 9:16 (1080x1920) = 6 masters,
   30 fps, H.264, AAC 48 kHz, -16 LUFS +-0.5, true peak <= -1.5 dBTP.
   Composition ids: `Echook-60-Landscape`, `Echook-60-Vertical`, `-30-`, `-15-`.
   Files: `out/masters/echook_60s_landscape_1920x1080.mp4` etc.

On-screen language: English (the product's own strings are English).

## 2. Constraints registry

| id | rule | why | enforced by |
|---|---|---|---|
| C1 | Every product string, number, colour and sound on screen/in the mix comes from the product repo via `npm run bake`; nothing retyped | a replica can draw anything; a retyped number is a lie waiting to go stale | `strings` + `numbers` gates read `product.generated.json` and re-run the bake to compare |
| C2 | Never say or imply `stop` means "the task is done". Allowed verbs: "finishes a turn", "finishes", "needs you", "asks permission", "hits a rate limit". The product's own voice line "Task complete" may be heard and shown as the sound's name | AGENTS.md "`stop` does not mean task complete" — Stop fires at the end of every turn | `copy` gate banned patterns: /task is (done|complete)/i, /work is done/i, /knows? when .* done/i in film-voice copy |
| C3 | Do not show or mention `terminalSequence`, OSC, terminal bell/title, `PreModelSwitch`, pomodoro/wellness/timers/gamification, opening URLs | inert or out of scope by design (AGENTS.md critical #4, gotchas) | `copy` gate banned patterns |
| C4 | No speed/outcome claims ("faster", "save hours", "10x", "never miss") | unevidenced | `copy` gate |
| C5 | No third-party logos or trade dress. "Claude Code", "Cursor", "Codex", "Slack", "Discord", "ntfy" appear as plain words only. The terminal replica is a generic terminal window, not a pixel copy of Claude Code's TUI chrome; the toast is a generic OS toast shape; the phone is a generic lock screen | trademark; the film is not endorsed by those vendors | human judgement on stills |
| C6 | Honesty caption, >= 3 s continuous, full opacity, uncropped, in every master: `Interface recreated in code · sounds are echook's own files · demo session` | the replica is code; session data (model, cost, quota %) is a demo payload | `honesty` gate |
| C7 | Demo payload values (repo name, cost, percentages) come from one file `src/replica/demo.ts`; no real user's data, no real email, no real token counts copied from the maintainer's machine. Use repo `acme/checkout-service`, cwd `~/code/checkout-service` | privacy | single source; human check |
| C8 | Brand: logo is `public/echook-logo.svg` from the product repo, unmodified (it is the only SVG allowed; everything else is DOM/canvas/bitmap). Brand green `#16F800` on near-black. Green is an accent: never a flat area > 15 % of the visible frame | keeps the terminal the hero; neon green floods are unreadable in H.264 | `green-area` gate from layout rects (or human check if not built) |
| C9 | At most one product voice line audible at a time, >= 0.3 s gap between product sounds; music ducks under them (deepest wins, not always-on) | the sounds ARE the product demo; they must be intelligible | `audio` gate over the derived cue sheet |
| C10 | Film-voice lines (cards, captions) each have a row in `docs/copy-clearance.md` | the uncleared line is the one that slips | `copy` gate |
| C11 | Numbers allowed in film-voice copy: only those present in the baked manifest (39 events, 47 variants, 86 sounds, 33 status-line segments, 3 on by default, 2 themes, 3 editors) — always rendered from the baked data, never typed | they change every release | `numbers` gate |
| C12 | TTS is shown as a caption/bubble only; the film does not synthesise a fake TTS voice | nothing mocked up | human check |
| C13 | Never print the shell environment (`env`, `printenv`, `Get-ChildItem Env:`) | a shell environment is not the film's to read out | brief |
| C14 | Nothing is pushed to any remote, nothing uploaded | outward-facing actions need the maintainer | brief |

## 3. Look

Two worlds that never blur:

- **The product** keeps its true colours: a near-black terminal window (`#0b0d0c`-ish),
  JetBrains Mono, the status line's real ANSI colours as baked, brand green `#16F800`
  as the single accent. Sound is made visible with waveforms drawn from the REAL mp3s'
  baked peak data, and expanding ripple rings.
- **The world around it** is procedurally painted bitmap (Python, numpy + OpenCV,
  watercolour + ink line, the tamaiti `art/paint.py` approach): warm paper, dusk indigo,
  amber lamp light. No SVG, no AI images. Split into depth layers for parallax.
  Two plates: **desk** (a desk at dusk: monitor whose screen area is a known rect where
  the replica terminal is mounted, lamp, keyboard, chair back, window with evening sky)
  and **away** (somewhere else in the home: a window sill / kitchen counter with a
  steaming mug, a plant, a kettle, the evening outside). No people, no text, no logos
  in the painting.
- Cards: big confident type (Space Grotesk or similar via @remotion/google-fonts) on the
  painted paper or on near-black. Captions name object + action + result.

## 4. Music grid (fixed, so every package can work in parallel)

Synthesised score (as tamaiti D5; a SUNO take can replace it later through
`src/data/music.json`). **128 BPM, 4/4, bar = 1.875 s, beat = 0.46875 s.**
60 s = 32 bars, 30 s = 16 bars, 15 s = 8 bars. Every scene boundary is a bar line.
Each bed starts with a hit in the first beat and ends on a resolved chord that rings out
inside the cut (arrangement stops ~1 bar before the end; end card lands on the last
phrase). Each bed has a **breakdown** (drums and bass drop out, pad only) exactly over
the AWAY scene so the product's own voice line is heard in near-silence, and a lift into
EVENTS. Character: bright, modern, optimistic, light; plucks/marimba-ish lead, soft kick,
airy pad; leaves the 1–4 kHz band uncrowded for voice lines.

## 5. Story — scene library and the 60 s EDL (bars)

| # | scene | bars (60) | what happens | film-voice copy (draft, to be cleared) |
|---|---|---|---|---|
| 1 | HOOK | 1–4 | Painted desk at dusk. In the monitor: replica terminal, agent mid-work (tool lines ticking, spinner). Slow push toward the screen. Frame 0 is already a composition. | "Your agent is working." → "You don't have to watch." |
| 2 | AWAY | 5–8 | Parallax travel away from the desk to the AWAY plate (mug, steam). Music breakdown. On bar 7 beat 1 the REAL `task-complete.mp3` plays; green ripple rings arrive from off-frame (desk side); a small chip shows the sound's name + real waveform. | "echook calls you back." |
| 3 | EVENTS | 9–14 | Full terminal replica. Three events fire in turn, each with its real sound, a chip (event name, the voice line text from the audio manifest, waveform): `permission_request`, `notification_idle_prompt`, `stop`. Then pull back to a wall of sound tiles, one per event/variant (86), each tile = name + tiny real waveform; the default-on ones lit green. Honesty caption (C6) runs here. | "Every event has its own sound." → "{events} events · {variants} variants · {onByDefault} on by default" |
| 4 | THEMES | 15–16 | Same event, two themes: voice (`task-complete.mp3`) then chimes (`chime-task-complete.mp3`), a toggle moving between them, waveforms differ. | "Voice or chimes." |
| 5 | CHANNELS | 17–20 | Three ways to be told: sound at the desk · desktop toast (generic toast, real title/body strings from the runner) over a blurred other app · webhook to a phone lock screen (generic; body from the real `audio-hooks.webhook.v1` payload fields). TTS shown as a caption only. | "At your desk. In another window. On your phone." |
| 6 | TALK | 21–24 | In the terminal the user types "mute audio for an hour"; the agent runs the REAL command the product's SKILL.md maps that to and the REAL JSON result prints; the status line gains the snooze segment. | "Set it up by asking your agent." |
| 7 | STATUSLINE | 25–28 | Push in on the status line (real baked renders). Context bar steps green → yellow → red across three baked payloads; quota bars. | "A status line that keeps context and quota in view." |
| 8 | END | 29–32 | "Claude Code · Cursor · Codex" as plain words (1 bar), then the end card: logo, `echook`, "Hear your agent.", `github.com/ChanMeng666/echook` as the largest element after the mark, "MIT · open source". Music cadence + ring-out. | "Hear your agent." |

**30 s (16 bars):** HOOK 2 · AWAY 3 · EVENTS 3 (one event + the wall) · CHANNELS 2 ·
TALK 2 · STATUSLINE 2 · END 2. THEMES dropped.
**15 s (8 bars):** HOOK 1 · AWAY 2 (the callback) · EVENTS 2 (the wall + count) ·
STATUSLINE 1 · END 2. Short cuts drop beats, they do not speed everything up.

The implementer may adjust bar counts by +-1 where reading time or a sound's real
duration demands it, keeping totals and bar-line boundaries, and records why in
`docs/decisions.md`.

9:16 is a re-layout: the terminal becomes a tall narrow terminal (status line reflows —
bake it at a narrow width too), the wall becomes more rows of fewer columns, platform
chrome owns the bottom ~390 px and top ~250 px (no text there).

## 6. Repo layout and contracts between packages

```
docs/brief.md decisions.md copy-clearance.md PROGRESS.md
scripts/bake-product-data.mjs      product repo -> src/replica/data/product.generated.json
                                   + public/audio/product/*.mp3 (only the ones the film plays)
scripts/render.mjs                 gates -> render (sequential) -> loudness -> out/masters/MANIFEST.json
art/paint.py                       -> public/art/<plate>/<layer>.webp + src/data/art.json
audio/synth_music.py               -> public/audio/music/bed-{60,30,15}.wav + src/data/music.json
audio/synth_sfx.py                 -> public/audio/sfx/*.wav + src/data/sfx.json   (film furniture only:
                                      whoosh/move, tick/type, card-appear — NOT event sounds)
capture/stills.mjs tile-contact.mjs verify.mjs
src/core/timeline.ts               the ONLY frame arithmetic
src/core/layout-core.ts            deliverables table, safe areas
src/edits.ts scenes.ts copy.ts cues.ts Film.tsx Root.tsx
src/replica/                       time-pure replica: demo.ts, screenplays.ts, tokens.ts, Terminal, StatusLine,
                                   Toast, Phone, SoundChip, SoundWall, ...
```

**`src/data/music.json`** (written by audio package):
`{ bpm, barSec, beatSec, beds: { "60": { file, durationSec, bars, downbeats:[sec...], sections:[{name, fromBar, toBar}], breakdown:{fromBar,toBar}, arrangementStopsSec } , "30":…, "15":… } }`
— `sections[].name` uses the scene names above, bars are 1-based inclusive.

**`src/data/art.json`** (written by art package):
`{ plates: { desk: { width, height, layers:[{file, depth}], screenRect:{x,y,w,h} }, away: { width, height, layers:[…], mugRect:{…} } }, paper: {file} }`
— `depth` 0 = far … 1 = near; rects in plate pixels. Landscape plates >= 2880x1620
(room to push/pan at 1080p); also usable for 9:16 by panning — or paint dedicated
portrait variants `desk-portrait`, `away-portrait` (>= 1620x2880) if cropping the
landscape plate does not compose.

**`src/replica/data/product.generated.json`** (written by bake package) — shape is the
bake author's to design and document at the top of the bake script; it must contain at
least: product version + commit; counts (events, variants, sounds per theme, default-on
hooks, status-line segments, themes, editors) each derived from `audio-hooks manifest` /
the repo, never typed; the full list of events + variants with `{name, parent, defaultOn,
audioFile:{default, custom}, voiceText}`; per-mp3 `{durationSec, peaks:[~64 floats 0..1]}`
for every file in both themes; status-line renders (array of rows, each a list of
`{text, fg, bg, bold}` spans parsed from the real ANSI output) for several demo payloads
at a wide and a narrow width; real CLI JSON outputs for the commands shown in TALK;
the real toast title/body and webhook payload for the events shown in CHANNELS.

## 7. Rules for every implementer

- The product repo is read-only. Run its CLI only with `CLAUDE_PLUGIN_DATA`,
  `CLAUDE_AUDIO_HOOKS_DATA`, `HOME`/`USERPROFILE` pointed at a throwaway dir under this
  repo's `.cache/` so the maintainer's real config is never touched and no real sound or
  toast fires. Never run `audio-hooks install`, `uninstall`, `upgrade`, `test`.
- Windows 11, 15 GB RAM, 16 cores. One heavy process at a time per agent; no dev server
  left running; renders `--concurrency` <= 3; never two renders at once.
- Do not write file content containing backslashes through a shell heredoc; use the
  file-writing tool.
- Scratch files go under this repo's `.cache/` (gitignored), nowhere else on the machine.
- Commit early and after every item, only your own paths (`git add <paths>`; if the
  index is locked, wait and retry — other agents commit to the same repo). Do not push.
- Report by `SendMessage` to `main`: <= 400 words — what exists, what you verified and
  how, what you did NOT verify, anything half-decided.
