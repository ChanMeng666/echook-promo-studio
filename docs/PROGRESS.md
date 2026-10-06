# PROGRESS — film package (implementer)

**Done:** scaffold, core (timeline/layout/camera), replica (Terminal, StatusLine, SoundChip, SoundWall, ThemeToggle, Toast, Phone, Ripple), eight scenes in both aspects, derived cue sheet with per-file product gains, gate suite + 11 mutations (all red, all restored), stills/contact tooling, render + delivered-file checks. Look rounds 1–3 applied.

**Next:** open the round-3 contact sheets for all six compositions (out/stills/sheet-*.png), fix what they show, then `node scripts/render.mjs` (six masters, sequential) and read the delivered-file checks.

**Half-decided:** mix levels (bed -7 dB, product sounds to -18 LUFS by gain, duck -9 dB) are untested until the first render shows whether loudnorm stays linear; TTS is not shown at all (C12 allowed a caption, I left it out for room) — say so in the report.
