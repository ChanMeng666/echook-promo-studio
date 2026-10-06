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
