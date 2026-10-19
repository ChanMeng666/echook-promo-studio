<div align="center">

# echook film

**The promo film for [echook](https://github.com/ChanMeng666/echook), made in code with Remotion: a replica of the product's terminal interface that is a pure function of time, set in a procedurally painted watercolour world, cut to a synthesised score.**

</div>

![The film opens on a painted desk at dusk; the terminal on the monitor is a live replica](docs/images/frame-01.jpg)

## The film

### echook film

<!-- FILM: echook-film · 16:9 · 60 s (also 30 s and 15 s, each in 16:9 and 9:16) — Chan uploads the video here in GitHub's web editor -->

▶ Watch on YouTube: https://youtu.be/43vcdxFDbTg

## How it's made

- **A coded replica, not a screen recording.** The terminal, status line, sound chips, toast and phone notification are React components that take a time and return a picture, so the vertical cuts are a re-layout, not a crop.
- **Product content is baked from the product.** `npm run bake` runs echook's real CLI and status-line script in a throwaway home; gates trace every text node on screen back to that data.
- **The sound effects are the product's own files**, played at the moment the replica shows that event; the waveforms on screen are their real peaks.
- **A painted world in Python.** A watercolour-and-ink engine (numpy + OpenCV, `art/`) paints the room as depth layers for parallax. No SVG illustration, no AI images.
- **A written score.** `audio/` synthesises the music at 128 BPM, so 60 / 30 / 15 s are exactly 32 / 16 / 8 bars and every cut lands on a bar line.
- **Gates with mutation evidence.** `npm run verify` runs the gate suite; `capture/mutate.mjs` breaks each invariant and expects it to go red.

## Make your own

Needs Node 22+, `ffmpeg` and `ffprobe` on `PATH`, and about 4 GB of free memory.

```bash
npm install
npm run verify    # the gates
npm run render    # gates, then six masters in out/masters/, measured
```

The baked data, painted plates and synthesised audio are committed, so a fresh clone renders without Python. To re-bake, clone [echook](https://github.com/ChanMeng666/echook) next to this repo as `../claude-code-audio-hooks` (or set `ECHOOK_PRODUCT_DIR`) and run `npm run bake`; to repaint or re-score, use Python 3 with numpy, scipy, opencv-python and pillow (`npm run art`, `npm run audio`).

## Licence

- Code: [MIT](LICENSE).
- The films, the score, the painted art and the stills made by Chan Meng in this repo: [CC BY 4.0](LICENSE-MEDIA.md).
- Excluded, under their own terms: echook's logo and product sounds (copied from [echook](https://github.com/ChanMeng666/echook), MIT), the fonts JetBrains Mono and Space Grotesk (SIL Open Font License), and npm and Python libraries such as Remotion (their own licences). "Claude Code", "Cursor" and "Codex" are named as plain words only; the film is not affiliated with or endorsed by their makers.

More detail: [docs/overview.md](docs/overview.md)
