#!/usr/bin/env node
/**
 * Render the masters: gates first, one bundle, one composition at a time.
 *
 *   node scripts/render.mjs                 all six
 *   node scripts/render.mjs --only 60       one length, both aspects
 *   node scripts/render.mjs --only 60l      one master (l = landscape, v = vertical)
 *   node scripts/render.mjs --skip-gates    (look-loop renders only; never for a release)
 *
 * Per master:
 *   1. remotion render  -> out/raw/<file>          picture + the composition's own mix
 *   2. ffmpeg loudnorm  -> out/masters/<file>      two passes, linear, to -16 LUFS; the picture
 *                                                  stream is copied, not re-encoded
 *   3. measure the DELIVERED file and write out/masters/MANIFEST.json
 * Then capture/check-masters.mjs reads every delivered file (black frames,
 * flashes, cuts, product sounds present).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { freemem } from "node:os";
import { join, resolve } from "node:path";

import { loadCore } from "../capture/load-core.mjs";

const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const only = opt("--only", "all");
// the delivery ceiling is -1.5 dBTP; the AAC encode moves peaks by a few tenths, so the limiter aims lower
const TARGET = { lufs: -16, lufsTol: 0.5, tpCeiling: -1.5, tpAim: -2.2, lra: 11 };
// 15 GB machine shared with other work: never more than three tabs
const concurrency = String(Math.min(3, Number(opt("--concurrency", "3"))));
const MIN_FREE_GB = 4;

const m = await loadCore();
const tagOf = (d) => d.cut + (d.aspect === "landscape" ? "l" : "v");
const targets = m.layout.DELIVERABLES.filter((d) => only === "all" || d.cut === only || tagOf(d) === only);
if (!targets.length) { console.error(`render: nothing matches --only ${only}`); process.exit(1); }

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`render: ${cmd} ${args.slice(0, 3).join(" ")} \u2026 exited ${r.status}`); process.exit(1); }
};
const ff = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const waitForMemory = () => {
  for (let i = 0; i < 60; i++) {
    const free = freemem() / 2 ** 30;
    if (free >= MIN_FREE_GB) return;
    console.log(`   ${free.toFixed(1)} GB free, waiting for ${MIN_FREE_GB} GB \u2026`);
    sleep(30_000);
  }
  console.error(`render: still under ${MIN_FREE_GB} GB free after 30 min \u2014 not starting a render`); process.exit(1);
};

if (!argv.includes("--skip-gates")) run("node", ["capture/verify.mjs"]);

mkdirSync("out/raw", { recursive: true });
mkdirSync("out/masters", { recursive: true });
console.log("\nbundling once \u2026");
run("npx", ["remotion", "bundle", "src/index.ts", "--out-dir", "out/bundle", "--log=error"]);

const measure = (file) => {
  const r = ff(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const at = r.stderr.lastIndexOf("Summary:");
  if (at < 0) throw new Error("ebur128 printed no summary for " + file + "\n" + r.stderr.slice(-400));
  const tail = r.stderr.slice(at);
  const num = (re, what) => { const x = re.exec(tail); if (!x) throw new Error("no " + what + " in the ebur128 summary of " + file); return Number(x[1]); };
  const v = ff(["-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
  const mean = /mean_volume:\s+(-?[\d.]+) dB/.exec(v.stderr);
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/, "I"), lra: num(/LRA:\s+(-?[\d.]+) LU/, "LRA"), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/, "true peak"), meanVolumeDb: mean ? Number(mean[1]) : NaN };
};
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height,nb_frames,r_frame_rate,pix_fmt,duration,sample_rate,channels,bit_rate", "-of", "json", file], { encoding: "utf8" }));
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

const manifestPath = "out/masters/MANIFEST.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { masters: {} };
const filmCommit = git("rev-parse", "HEAD") || "uncommitted";
// the manifest itself and other packages' work in progress do not make the FILM dirty
const dirty = git("status", "--porcelain", "--", "src", "capture", "scripts", "public", "remotion.config.ts", "package.json").split("\n").filter(Boolean);
const productCommit = m.product.source.commit;

for (const t of targets) {
  const raw = join("out/raw", t.file);
  const out = join("out/masters", t.file);
  console.log(`\n\u2500\u2500 ${t.id} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  waitForMemory();
  const started = Date.now();
  run("npx", ["remotion", "render", "out/bundle", t.id, raw, "--codec=h264", "--crf=18", "--pixel-format=yuv420p", "--audio-codec=aac", "--audio-bitrate=320k", `--concurrency=${concurrency}`, "--log=error"]);

  // pass 1: measure. pass 2: apply the measured values, linear, so loudnorm cannot fall into dynamic mode
  const p1 = ff(["-i", raw, "-vn", "-af", `loudnorm=I=${TARGET.lufs}:TP=${TARGET.tpAim}:LRA=${TARGET.lra}:print_format=json`, "-f", "null", "-"]);
  const open = p1.stderr.lastIndexOf("{"), close = p1.stderr.lastIndexOf("}");
  if (open < 0 || close < open) { console.error("render: loudnorm pass 1 printed no JSON\n" + p1.stderr.slice(-400)); process.exit(1); }
  const j = JSON.parse(p1.stderr.slice(open, close + 1));
  const af = `loudnorm=I=${TARGET.lufs}:TP=${TARGET.tpAim}:LRA=${TARGET.lra}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const p2 = ff(["-y", "-i", raw, "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", out]);
  if (p2.status !== 0) { console.error(p2.stderr.slice(-600)); process.exit(1); }
  const mode = /"normalization_type"\s*:\s*"(\w+)"/.exec(p2.stderr)?.[1] ?? (Math.abs(Number(j.input_i) - TARGET.lufs) < 30 ? "linear (requested)" : "unknown");

  const loud = measure(out);
  const info = probe(out);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const cues = m.cues.cuesFor(t.cut);
  const cueSha = createHash("sha256").update(JSON.stringify(cues.map((c) => [c.file, +c.startSec.toFixed(4), c.gainDb, c.durationSec, c.duckDb]))).digest("hex");
  const problems = [];
  const expectFrames = m.timeline.totalFramesFor(t.cut);
  if (!a) problems.push("NO AUDIO STREAM");
  if (v?.codec_name !== "h264" || v?.pix_fmt !== "yuv420p") problems.push(`video is ${v?.codec_name}/${v?.pix_fmt}`);
  if (v?.width !== t.width || v?.height !== t.height) problems.push(`${v?.width}x${v?.height}, expected ${t.width}x${t.height}`);
  if (v?.r_frame_rate !== `${m.layout.FPS}/1`) problems.push(`frame rate ${v?.r_frame_rate}`);
  if (Number(v?.nb_frames) !== expectFrames) problems.push(`${v?.nb_frames} frames, expected ${expectFrames}`);
  if (a && (a.codec_name !== "aac" || Number(a.sample_rate) !== 48000)) problems.push(`audio is ${a.codec_name} ${a.sample_rate} Hz`);
  if (!(Math.abs(loud.lufs - TARGET.lufs) <= TARGET.lufsTol)) problems.push(`loudness ${loud.lufs} LUFS is outside ${TARGET.lufs} \u00b1 ${TARGET.lufsTol}`);
  if (!(loud.truePeak <= TARGET.tpCeiling)) problems.push(`true peak ${loud.truePeak} dBTP is over ${TARGET.tpCeiling}`);
  if (!(loud.meanVolumeDb > -45)) problems.push(`mean volume ${loud.meanVolumeDb} dB: an audio stream with no sound in it`);
  manifest.masters[t.file] = {
    composition: t.id, bytes: statSync(out).size, sha256: createHash("sha256").update(readFileSync(out)).digest("hex"),
    width: v?.width, height: v?.height, fps: v?.r_frame_rate, frames: Number(v?.nb_frames), videoDurationSec: Number(Number(v?.duration).toFixed(3)),
    videoCodec: v?.codec_name, pixelFormat: v?.pix_fmt, audioCodec: a?.codec_name, audioSampleRate: Number(a?.sample_rate), audioChannels: a?.channels, audioBitrate: Number(a?.bit_rate),
    loudnessLufs: loud.lufs, truePeakDbtp: loud.truePeak, loudnessRangeLu: loud.lra, meanVolumeDb: loud.meanVolumeDb,
    rawMixLufs: Number(j.input_i), rawMixTruePeakDbtp: Number(j.input_tp), normalisation: mode,
    cues: cues.length, productCues: cues.filter((c) => c.kind === "product").length, cueSha,
    renderedAt: new Date(statSync(out).mtimeMs).toISOString(), filmCommit, workingTreeDirty: dirty.length > 0, productCommit, problems,
  };
  writeFileSync(manifestPath, JSON.stringify({ target: TARGET, ...manifest }, null, 2) + "\n");
  console.log(`   ${out}  (modified ${new Date(statSync(out).mtimeMs).toISOString()})`);
  console.log(`   ${(statSync(out).size / 1e6).toFixed(1)} MB \u00b7 ${v?.width}x${v?.height} \u00b7 ${v?.nb_frames} frames \u00b7 ${loud.lufs} LUFS \u00b7 ${loud.truePeak} dBTP \u00b7 raw mix ${j.input_i} LUFS \u00b7 rendered in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const p of problems) console.error(`   \u2717 ${p}`);
  if (problems.length) process.exitCode = 1;
}
console.log(`\nwrote ${resolve(manifestPath)}`);
const chk = spawnSync("node", ["capture/check-masters.mjs", ...(only === "all" ? [] : ["--only", only])], { stdio: "inherit" });
if (chk.status !== 0) process.exitCode = 1;
