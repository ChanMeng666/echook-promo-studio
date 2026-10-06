#!/usr/bin/env node
/**
 * Checks that read the DELIVERED files, because nothing else can contradict
 * the model: black frames, flashes, what happens across each cut, and whether
 * each product sound is actually in the mix at its cue time.
 *
 *   node capture/check-masters.mjs [--only 60l]      prints, and merges into out/masters/MANIFEST.json
 *
 * Nobody hears anything here. "Present" means: in the 300–3400 Hz band, the
 * half-second after a product sound's cue is louder than the half-second
 * before it. That is evidence the file is in the mix where the picture says,
 * not evidence that it sounds right.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadCore } from "./load-core.mjs";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : "all";
const m = await loadCore();
const FPS = m.layout.FPS;
const tagOf = (d) => d.cut + (d.aspect === "landscape" ? "l" : "v");
const targets = m.layout.DELIVERABLES.filter((d) => only === "all" || d.cut === only || tagOf(d) === only);
const manifestPath = "out/masters/MANIFEST.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { masters: {} };
let red = 0, looked = 0;

const ff = (args, opts = {}) => spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { maxBuffer: 1 << 30, ...opts });
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

for (const d of targets) {
  const file = join("out/masters", d.file);
  if (!existsSync(file)) { console.error(`check: ${d.file} is not rendered`); red++; continue; }
  looked++;
  const problems = [];
  const tl = m.timeline.timelineFor(d.cut);

  // picture: mean luma per frame, at a size that makes this cheap
  const y = ff(["-i", file, "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"]);
  const px = 64 * 36, frames = Math.floor(y.stdout.length / px);
  const luma = Array.from({ length: frames }, (_, i) => { let s = 0; for (let k = 0; k < px; k++) s += y.stdout[i * px + k]; return s / px; });
  // frame-to-frame difference of the small frames (0..255), to see what a cut does
  const diff = Array.from({ length: frames }, (_, i) => { if (i === 0) return 0; let s = 0; for (let k = 0; k < px; k++) s += Math.abs(y.stdout[i * px + k] - y.stdout[(i - 1) * px + k]); return s / px; });
  if (frames !== tl.totalFrames) problems.push(`${frames} frames decoded, expected ${tl.totalFrames}`);
  const darkest = Math.min(...luma), darkAt = luma.indexOf(darkest);
  if (darkest < 6) problems.push(`a near-black frame at ${(darkAt / FPS).toFixed(2)} s (mean luma ${darkest.toFixed(1)})`);
  // flashes (WCAG 2.3.1): opposing luminance swings of >= 10% of full scale, at most 3 in any second
  const swings = []; let dir = 0, ref = luma[0];
  for (let i = 1; i < frames; i++) {
    const dl = luma[i] - ref;
    if (Math.abs(dl) >= 25.5 && Math.sign(dl) !== dir) { swings.push(i); dir = Math.sign(dl); ref = luma[i]; }
    else if (Math.sign(dl) === dir || dir === 0) { if (dir >= 0 ? luma[i] > ref : luma[i] < ref) ref = luma[i]; }
  }
  let worst = 0;
  for (const s of swings) worst = Math.max(worst, swings.filter((x) => x >= s && x < s + FPS).length);
  if (worst > 3) problems.push(`${worst} luminance swings inside one second`);
  // every cut: the change on the cut frame, and whether a dark or blank frame sits on it
  const cutsReport = tl.beats.slice(1).map((b) => {
    const f = b.startFrame;
    const around = luma.slice(Math.max(0, f - 2), f + 3);
    const dip = Math.min(...around) < 0.45 * Math.min(luma[Math.max(0, f - 6)], luma[Math.min(frames - 1, f + 6)]);
    if (dip) problems.push(`luma dips across the cut into ${b.scene.id} at ${b.startSec} s`);
    return { into: b.scene.id, atSec: b.startSec, diffOnCut: +diff[f].toFixed(1), diffBefore: +diff[f - 1].toFixed(1), diffAfter: +diff[f + 1].toFixed(1), lumaBefore: +luma[f - 1].toFixed(1), lumaAfter: +luma[f].toFixed(1) };
  });
  const bd = ff(["-i", file, "-vf", "blackdetect=d=0.03:pix_th=0.08", "-an", "-f", "null", "-"], { encoding: "utf8" });
  const blacks = (bd.stderr.match(/black_start:[^\n]*/g) ?? []);
  if (blacks.length) problems.push(`blackdetect: ${blacks.join("; ")}`);

  // sound: band-limited level after vs before each product cue, on the delivered audio
  const a = ff(["-i", file, "-vn", "-ac", "1", "-ar", "16000", "-af", "highpass=f=300,lowpass=f=3400", "-f", "f32le", "-"]);
  const pcm = new Float32Array(a.stdout.buffer, a.stdout.byteOffset, Math.floor(a.stdout.length / 4));
  const rms = (from, to) => { const i0 = Math.max(0, Math.round(from * 16000)), i1 = Math.min(pcm.length, Math.round(to * 16000)); let s = 0; for (let i = i0; i < i1; i++) s += pcm[i] * pcm[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
  const cues = m.cues.cuesFor(d.cut).filter((c) => c.kind === "product");
  const sounds = cues.map((c) => {
    const after = db(rms(c.atSec, c.atSec + 0.5)), before = db(rms(c.atSec - 0.6, c.atSec - 0.1));
    const rise = after - before;
    if (!(Number.isFinite(rise) && rise >= 3)) problems.push(`${c.name} (${c.theme}) at ${c.atSec.toFixed(2)} s: speech-band level rises only ${rise.toFixed(1)} dB at its cue`);
    return { event: c.name, theme: c.theme, atSec: +c.atSec.toFixed(3), bandDbBefore: +before.toFixed(1), bandDbAfter: +after.toFixed(1), riseDb: +rise.toFixed(1) };
  });
  if (!sounds.length) problems.push("no product cue to look for");
  const overall = db(rms(0, pcm.length / 16000));
  if (overall < -50) problems.push(`the audio is near-silent (${overall.toFixed(1)} dB in band)`);

  console.log(`\n${d.file}`);
  console.log(`  picture: ${frames} frames, darkest mean luma ${darkest.toFixed(1)} at ${(darkAt / FPS).toFixed(2)} s, blackdetect ${blacks.length}, worst ${worst} swing(s)/s`);
  for (const c of cutsReport) console.log(`  cut -> ${c.into.padEnd(10)} @${String(c.atSec).padEnd(7)} diff ${c.diffBefore} | ${c.diffOnCut} | ${c.diffAfter}   luma ${c.lumaBefore} -> ${c.lumaAfter}`);
  for (const s of sounds) console.log(`  sound ${s.event.padEnd(26)} ${s.theme.padEnd(7)} @${s.atSec.toFixed(2).padStart(6)} s  band ${s.bandDbBefore} -> ${s.bandDbAfter} dB  (rise ${s.riseDb} dB)`);
  for (const p of problems) console.error("  ✗ " + p);
  if (problems.length) red++;
  if (manifest.masters[d.file]) manifest.masters[d.file].delivered = { darkestMeanLuma: +darkest.toFixed(1), blackSegments: blacks.length, worstSwingsPerSecond: worst, cuts: cutsReport, productSounds: sounds, problems };
}
if (!looked) { console.error("check: VACUOUS — looked at 0 masters"); process.exit(1); }
if (existsSync(manifestPath)) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(red ? `\n${red} master(s) with problems` : `\n${looked} master(s) checked, no problems`);
process.exit(red ? 1 : 0);
