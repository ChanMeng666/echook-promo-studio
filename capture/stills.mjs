#!/usr/bin/env node
/**
 * The look loop's camera. One bundle, one browser, sequential.
 *
 *   node capture/stills.mjs --comp Echook-60-Landscape                 the standard set
 *   node capture/stills.mjs --comp Echook-60-Landscape --at 0,2.4,7.9  ad-hoc seconds (full size, kept)
 *   node capture/stills.mjs --comp a,b --reuse                         reuse out/bundle
 *
 * The standard set is frame 0, one frame every --every seconds (default 2),
 * and the hand-over frames at -0.2 / +0.1 / +0.4 s around every scene
 * boundary of that composition's own timeline (read from the film's own
 * modules, not retyped). Frames land in out/stills/<comp>/ named by contiguous
 * index with the second as a suffix (an image-sequence reader stops at the
 * first gap in an index). Tiling is a separate process: capture/tile-contact.mjs.
 */
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadCore } from "./load-core.mjs";

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const comps = (opt("--comp") ?? "").split(",").filter(Boolean);
if (!comps.length) { console.error("stills: --comp <id>[,<id>] is required"); process.exit(1); }
const scale = Number(opt("--scale", "1"));
const m = await loadCore();
const FPS = m.layout.FPS;

const bundleDir = resolve("out/bundle");
const serveUrl = argv.includes("--reuse") && existsSync(join(bundleDir, "index.html"))
  ? bundleDir
  : await bundle({ entryPoint: resolve("src/index.ts"), outDir: bundleDir });
const browser = await openBrowser("chrome", { chromiumOptions: { gl: "angle" } });

let shot = 0;
for (const id of comps) {
  const d = m.layout.DELIVERABLES.find((x) => x.id === id);
  if (!d) { console.error(`stills: no deliverable ${id}`); process.exit(1); }
  const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser });
  const total = composition.durationInFrames / FPS;
  const adhoc = !!opt("--at");
  let seconds;
  if (adhoc) seconds = opt("--at").split(",").map(Number);
  else {
    const every = Number(opt("--every", "2"));
    const grid = Array.from({ length: Math.ceil(total / every) }, (_, i) => i * every);
    const cuts = m.timeline.timelineFor(d.cut).beats.slice(1).map((b) => b.startSec);
    const hand = cuts.flatMap((b) => [b - 0.2, b + 0.1, b + 0.4]);
    seconds = [...new Set([0, ...grid, ...hand, total - 1 / FPS].map((s) => Math.round(s * FPS) / FPS))].filter((s) => s >= 0 && s < total).sort((a, b) => a - b);
  }
  const dir = resolve(opt("--out", join("out/stills", id + (adhoc ? "-at" : ""))));
  if (!adhoc) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [i, sec] of seconds.entries()) {
    const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(sec * FPS)));
    const name = adhoc ? `at-${sec.toFixed(2)}s.png` : `${String(i).padStart(3, "0")}-${sec.toFixed(2)}s.png`;
    await renderStill({ composition, serveUrl, output: join(dir, name), frame, imageFormat: "png", scale, puppeteerInstance: browser, chromiumOptions: { gl: "angle" } });
    shot++;
  }
  console.log(`stills: ${id} — ${seconds.length} frame(s) -> ${dir}`);
}
await browser.close({ silent: true });
if (shot === 0) { console.error("stills: VACUOUS — shot nothing"); process.exit(1); }
