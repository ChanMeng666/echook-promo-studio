#!/usr/bin/env node
/**
 * The gate suite. Every gate executes the film's OWN modules (bundled with
 * esbuild and run in Node), prints how many things it looked at, and treats
 * zero as a failure. A non-finite measurement fails.
 *
 *   node capture/verify.mjs [--skip-bake] [--only timeline,audio]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadCore } from "./load-core.mjs";
import { loadPainter, textNodes } from "./paint.mjs";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
let red = 0;
const want = (name) => !only || only.includes(name);
const report = (name, count, fails, note = "") => {
  for (const f of fails.slice(0, 25)) console.error("    ✗ " + f);
  if (fails.length > 25) console.error("    … and " + (fails.length - 25) + " more");
  if (count === 0) { console.error("  " + name + ": VACUOUS — looked at 0 things"); red++; return; }
  console.log("  " + name + ": " + (fails.length ? "FAIL" : "ok") + " — " + count + " checked" + (note ? " (" + note + ")" : "") + ", " + fails.length + " failing");
  if (fails.length) red++;
};
const finite = (v, what) => { if (!Number.isFinite(v)) throw new Error(what + " is not finite (" + v + ")"); return v; };

const m = await loadCore();
const FPS = m.layout.FPS;
const P = m.product;
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = walk("src").filter((p) => /\.(ts|tsx)$/.test(p));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const EXPECT_FRAMES = { "15": 450, "30": 900, "60": 1800 };

console.log("gates:");

// 1 ── bake: the committed product data is what the product repo says today
if (want("bake")) {
  if (argv.includes("--skip-bake")) console.log("  bake: SKIPPED by --skip-bake (never for a release)");
  else try {
    execFileSync("node", ["scripts/bake-product-data.mjs", "--check"], { stdio: "pipe" });
    report("bake", P.events.length, [], "product " + P.source.version + " @ " + P.source.commit.slice(0, 7) + ", re-baked and compared");
  } catch (e) { report("bake", 1, [String(e.stderr || e.message).trim().slice(0, 600)]); }
}

// 2 ── assets: every file the film names exists
if (want("assets")) {
  const fails = []; let n = 0;
  const need = [
    ...Object.values(m.music.beds).map((x) => x.file),
    ...Object.values(m.sfx.roles).map((x) => x.file),
    ...P.filmSounds.map((x) => x.publicPath),
    ...Object.values(m.art.plates).flatMap((p) => p.layers.map((l) => l.file)),
    "echook-logo.svg",
  ];
  for (const id of ["desk", "away", "desk-portrait", "away-portrait"]) { n++; if (!m.art.plates[id]) fails.push("art.json has no plate " + id); }
  for (const id of ["desk", "desk-portrait"]) { n++; if (!m.art.plates[id]?.screenRect) fails.push(id + ": no screenRect"); }
  for (const id of ["away", "away-portrait"]) { n++; if (!m.art.plates[id]?.captionRect) fails.push(id + ": no captionRect"); }
  n++; if (!m.art.paper?.file) fails.push("art.json has no paper plate (THEMES falls back to a flat colour)"); else need.push(m.art.paper.file);
  for (const f of need) { n++; if (!existsSync(join("public", f))) fails.push("missing public/" + f); }
  // the logo is the product's own file, unmodified (C8)
  n++;
  try {
    const theirs = execFileSync("git", ["-C", "../claude-code-audio-hooks", "show", P.source.commit + ":public/echook-logo.svg"], { encoding: "utf8", maxBuffer: 1e8 });
    if (theirs.replace(/\r\n/g, "\n") !== readFileSync("public/echook-logo.svg", "utf8").replace(/\r\n/g, "\n")) fails.push("public/echook-logo.svg differs from the product's at " + P.source.commit.slice(0, 7));
  } catch (e) { fails.push("could not read the product's logo: " + String(e.message).slice(0, 120)); }
  // no SVG but the logo (C8)
  const svgs = walk("public").filter((p) => /\.svg$/i.test(p));
  n++; if (svgs.length !== 1) fails.push("expected exactly one SVG in public/, found " + svgs.join(", "));
  for (const p of SRC) { n++; if (/<svg[\s>]|<path[\s>]/.test(strip(readFileSync(p, "utf8")))) fails.push(p + ": inline SVG"); }
  report("assets", n, fails);
}

// 3 ── timeline: exact frame counts, boundaries on the bed's bar lines, no flash, no frame arithmetic elsewhere
if (want("timeline")) {
  const fails = []; let n = 0; const dump = {};
  for (const cut of m.layout.CUT_IDS) {
    const tl = m.timeline.timelineFor(cut); const bed = m.music.beds[cut];
    n++; fails.push(...tl.problems);
    const frames = tl.beats.reduce((a, x) => a + x.durationInFrames, 0);
    if (frames !== EXPECT_FRAMES[cut] || tl.totalFrames !== EXPECT_FRAMES[cut]) fails.push("cut " + cut + ": " + frames + " frames, expected " + EXPECT_FRAMES[cut]);
    if (finite(bed.durationSec, "bed duration") !== m.layout.CUT_SECONDS[cut]) fails.push("bed " + cut + ": " + bed.durationSec + " s");
    const bars = tl.beats.reduce((a, x) => a + x.bars, 0);
    if (bars !== bed.bars) fails.push("cut " + cut + ": the EDL is " + bars + " bars, the bed " + bed.bars);
    for (const beat of tl.beats) {
      n++;
      const id = "cut " + cut + " " + beat.scene.id;
      if (finite(beat.durationSec, id + " duration") < 0.5) fails.push(id + ": " + beat.durationSec + " s is a flash, not a shot");
      const off = Math.min(...bed.downbeats.map((d) => Math.abs(d - beat.startSec)));
      if (finite(off, id + " bar offset") > 1 / FPS) fails.push(id + " starts " + off.toFixed(3) + " s off a bar line");
      // the bed was arranged for this scene over these bars
      const sec = bed.sections.find((s) => s.name.toLowerCase() === beat.scene.id);
      if (!sec) fails.push(id + ": the bed has no section of that name");
      else if (sec.fromBar !== beat.fromBar || sec.toBar !== beat.fromBar + beat.bars - 1) fails.push(id + ": bars " + beat.fromBar + "–" + (beat.fromBar + beat.bars - 1) + ", the bed's section is " + sec.fromBar + "–" + sec.toBar);
      // nothing in the beat's screenplay is scheduled after the beat is over
      const play = m.plays.PLAYS[beat.scene.id][cut];
      for (const x of [...play.sounds, ...play.fx]) { n++; if (finite(x.at, id + " mark") >= beat.durationSec) fails.push(id + ": a mark at " + x.at.toFixed(2) + " s is past the beat (" + beat.durationSec + " s)"); }
    }
    const away = tl.beats.find((b) => b.scene.id === "away");
    n++; if (!away || bed.breakdown.fromBar !== away.fromBar || bed.breakdown.toBar !== away.fromBar + away.bars - 1) fails.push("cut " + cut + ": the bed's breakdown is not over AWAY");
    dump[cut] = { totalSec: tl.totalSec, totalFrames: tl.totalFrames, boundaries: tl.beats.slice(1).map((x) => x.startSec), beats: tl.beats.map((x) => ({ scene: x.scene.id, fromBar: x.fromBar, bars: x.bars, startSec: x.startSec, sec: x.durationSec, frames: x.durationInFrames })) };
  }
  for (const p of SRC) {
    if (p.replace(/\\/g, "/").endsWith("core/timeline.ts")) continue;
    const text = strip(readFileSync(p, "utf8")); n++;
    const hit = /(durationInFrames|from|frame)\s*=\s*\{\s*\d+\s*\}/.exec(text) || /[*/]\s*FPS\b/.exec(text) || /\bFPS\s*[*/]/.exec(text);
    if (hit) fails.push(p + ": frame arithmetic outside core/timeline.ts → " + hit[0]);
  }
  mkdirSync("out", { recursive: true });
  writeFileSync("out/timeline.json", JSON.stringify(dump, null, 2) + "\n");
  report("timeline", n, fails, "wrote out/timeline.json");
}

// the film, painted: every beat of every composition, sampled, as text
let painted = null;
const paintAll = async () => {
  if (painted) return painted;
  const paint = await loadPainter();
  painted = [];
  for (const d of m.layout.DELIVERABLES) for (const beat of m.timeline.timelineFor(d.cut).beats) {
    for (let t = 0; t < beat.durationSec; t += 0.25) {
      painted.push({ comp: d.id, cut: d.cut, aspect: d.aspect, scene: beat.scene.id, t, filmSec: beat.startSec + t, nodes: textNodes(paint(beat.scene.id, d.cut, t, beat.durationSec, d.width, d.height)) });
    }
  }
  return painted;
};

// 4 ── strings + numbers: everything written on screen is the product's, the film's cleared copy, or the one demo file
if (want("strings") || want("numbers")) {
  const frames = await paintAll();
  // what the product says: every string and number in the baked data (peak arrays are waveforms, not text)
  const productStrings = [];
  const collect = (v, key) => {
    if (key === "peaks") return;
    if (typeof v === "string") productStrings.push(v);
    else if (typeof v === "number") productStrings.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => collect(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, k);
  };
  collect(P, "");
  // what the film derives from it, by the film's own functions
  const derived = [m.productApi.PRODUCT_URL, m.productApi.PRODUCT_NAME];
  for (const e of P.events) for (const theme of P.themes) {
    const s = m.productApi.soundOf(e.name, theme);
    derived.push("“" + e.voiceText + "”", s.durationSec.toFixed(1) + " s", s.file + " · " + s.durationSec.toFixed(1) + " s");
  }
  for (const s of P.talk.steps) derived.push(m.plays.stableJson(s));
  const demo = [...m.demo.demoStrings(), ...m.demo.DEMO.earlier.tools.map((t) => t.target), ...m.demo.DEMO.tools.flatMap((t) => [t.verb, t.target, ...(t.added ? ["+" + t.added] : []), ...(t.removed ? ["-" + t.removed] : [])]), "run"];
  const copy = m.copy.allCopy();
  const hay = (list) => "\n" + list.join("\n") + "\n";
  const H = { product: hay(productStrings), derived: hay(derived), demo: hay(demo), copy: hay(copy) };
  const sFails = new Set(), nFails = new Set(); const seen = new Set(); let digits = 0;
  for (const f of frames) for (const node of f.nodes) {
    const key = node; if (seen.has(key)) continue; seen.add(key);
    if (!/[\p{L}\p{N}]/u.test(node)) continue; // punctuation and glyphs carry no claim
    const where = Object.keys(H).filter((k) => H[k].includes(node));
    if (!where.length) sFails.add(JSON.stringify(node) + " (" + f.comp + " " + f.scene + " @" + f.t.toFixed(2) + " s) is not the product's, the demo file's or cleared copy");
    if (/\d/.test(node)) {
      digits++;
      // a number is never the film's own word (C11): it must come from the bake, or the demo file
      if (!where.some((k) => k !== "copy")) nFails.add(JSON.stringify(node) + " (" + f.comp + " " + f.scene + " @" + f.t.toFixed(2) + " s): a number with no source in the baked data or the demo file");
    }
  }
  if (want("strings")) report("strings", seen.size, [...sFails], frames.length + " painted frames, " + productStrings.length + " product strings");
  if (want("numbers")) {
    const fails = [...nFails]; let n = digits;
    const check = (ok, msg) => { n++; if (!ok) fails.push(msg); };
    const C = P.counts;
    check(P.events.filter((e) => e.kind === "event").length === C.events, "counts.events equals the canonical events listed");
    check(P.events.filter((e) => e.kind === "variant").length === C.variants, "counts.variants equals the variants listed");
    check(P.events.length === C.slots, "the wall has one tile per slot");
    check(P.events.filter(m.productApi.isLit).length === C.defaultOnEvents, "the tiles lit on the wall number counts.defaultOnEvents");
    check(m.copy.LABEL.editors.length === C.editors, "the editors named number counts.editors");
    check(P.themes.length === C.themes, "counts.themes equals the themes listed");
    check(copy.every((c) => !/\d/.test(c)), "no digit is typed in the film's copy (C11)");
    const parts = m.copy.countParts(C).join(" ");
    check(parts.includes(String(C.events)) && parts.includes(String(C.variants)) && parts.includes(String(C.defaultOnEvents)), "the count line carries the baked counts");
    const cost = P.statusline.payloads.green.cost;
    const add = m.demo.DEMO.tools.reduce((a, t) => a + (t.added ?? 0), 0), del = m.demo.DEMO.tools.reduce((a, t) => a + (t.removed ?? 0), 0);
    check(add === cost.total_lines_added && del === cost.total_lines_removed, "the demo session's +" + add + "/-" + del + " equals the status line's +" + cost.total_lines_added + "/-" + cost.total_lines_removed);
    check(P.statusline.payloads.green.workspace.repo.owner + "/" + P.statusline.payloads.green.workspace.repo.name === m.demo.DEMO.repo, "the demo repo is the one in the baked status-line payload");
    // the count line is really on screen, with those numbers
    const wall = frames.filter((f) => f.scene === "events" && f.nodes.includes(String(C.variants)) && f.nodes.includes(String(C.events)));
    for (const d of m.layout.DELIVERABLES) check(wall.some((f) => f.comp === d.id), d.id + " shows the count line");
    report("numbers", n, fails, digits + " distinct numeric text nodes traced");
  }
}

// 5 ── copy: every film-voice line is cleared, reads in its time, and makes no banned claim
if (want("copy")) {
  const fails = []; let n = 0;
  const clearance = existsSync("docs/copy-clearance.md") ? readFileSync("docs/copy-clearance.md", "utf8") : null;
  if (!clearance) fails.push("docs/copy-clearance.md is missing — a missing table clears nothing");
  const BANNED = [
    [/task is (done|complete)/i, "C2"], [/work is done/i, "C2"], [/knows? when .* done/i, "C2"], [/\b(all )?done\b/i, "C2"], [/finished the (task|job|work)/i, "C2"],
    [/terminal ?sequence|\bOSC\b|terminal bell|window title|PreModelSwitch|pomodoro|wellness|breath|\btimers?\b|gamif|streak|opens? (a |the )?(url|link|browser)/i, "C3"],
    [/\bfast(er|est)?\b|save[sd]? (hours|time)|\d+\s?x\b|never miss|instant(ly)?|in seconds|guarantee|productiv|effortless/i, "C4"],
  ];
  const lines = [...new Set([...m.copy.allCopy(), ...m.demo.demoStrings()])];
  for (const text of lines) {
    n++;
    if (clearance && !clearance.includes("`" + text + "`")) fails.push("uncleared: " + JSON.stringify(text));
    for (const [re, rule] of BANNED) if (re.test(text)) fails.push("banned by " + rule + " " + re + " in " + JSON.stringify(text));
  }
  // reading time: a warning line a script can compute; the test is still the reading
  for (const cut of m.layout.CUT_IDS) for (const beat of m.timeline.timelineFor(cut).beats) {
    for (const c of m.plays.PLAYS[beat.scene.id][cut].captions) {
      n++;
      const words = c.copy.lines.landscape.join(" ").split(/\s+/).length;
      const has = Math.min(c.to, beat.durationSec) - c.from;
      const needs = Math.max(0.9, words * 0.26);
      if (!(finite(has, "caption time") >= needs)) fails.push("cut " + cut + " " + beat.scene.id + ": " + JSON.stringify(c.copy.lines.landscape.join(" ")) + " — " + words + " words need " + needs.toFixed(1) + " s, has " + has.toFixed(2) + " s");
    }
  }
  report("copy", n, fails, lines.length + " lines against " + BANNED.length + " banned patterns");
}

// 6 ── honesty: the C6 caption, >= 3 s continuous, once, inside the safe frame, in every composition
if (want("honesty")) {
  const fails = []; let n = 0; const FLOOR = 3;
  const frames = await paintAll();
  const first = m.copy.HONESTY_PARTS[0];
  for (const d of m.layout.DELIVERABLES) {
    n++;
    const L = m.layout.deriveLayout(d.width, d.height);
    const r = L.honesty, s = L.safe;
    if (r.x < s.x || r.y < s.y || r.x + r.w > s.x + s.w || r.y + r.h > s.y + s.h) fails.push(d.id + ": the honesty box is not inside the safe frame");
    // as painted: which sampled frames carry the whole caption, exactly once
    const mine = frames.filter((f) => f.comp === d.id);
    let run = 0, best = 0, prev = null;
    for (const f of mine) {
      const text = f.nodes.join(" ");
      const count = text.split(first).length - 1;
      const whole = m.copy.HONESTY_PARTS.every((p) => text.includes(p));
      if (count > 1) fails.push(d.id + " @" + f.filmSec.toFixed(2) + " s: the honesty caption is on screen " + count + " times");
      if (count === 1 && whole) { run = prev !== null && f.filmSec - prev < 0.26 ? run + (f.filmSec - prev) : 0.25; best = Math.max(best, run); prev = f.filmSec; } else { run = 0; prev = null; }
    }
    if (!(finite(best, "honesty run") >= FLOOR)) fails.push(d.id + ": honesty caption up for " + best.toFixed(2) + " s continuously, floor is " + FLOOR + " s");
    // as scheduled: the screenplay's own window
    const tl = m.timeline.timelineFor(d.cut);
    const sched = Math.max(0, ...tl.beats.map((b) => { const h = m.plays.PLAYS[b.scene.id][d.cut].honesty; return h ? Math.min(h.to, b.durationSec) - h.from : 0; }));
    if (!(sched >= FLOOR)) fails.push(d.id + ": scheduled for " + sched.toFixed(2) + " s");
  }
  n++; if (m.copy.HONESTY !== "Interface recreated in code · sounds are echook’s own files · demo session".replace("’", "'")) fails.push("the honesty caption is not the registry's wording (C6)");
  report("honesty", n, fails, "floor " + FLOOR + " s, sampled every 0.25 s");
}

// 7 ── audio: the cue sheet is derived, C9 holds, every file exists, nothing runs past the cut
if (want("audio")) {
  const fails = []; let n = 0; const sheets = [];
  const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join("public", f)], { encoding: "utf8" }).trim());
  for (const cut of m.layout.CUT_IDS) {
    const cues = m.cues.cuesFor(cut); const total = m.layout.CUT_SECONDS[cut];
    const product = cues.filter((c) => c.kind === "product");
    sheets.push(cut + " s: " + cues.length + " cues (" + product.length + " product)");
    if (!product.length) fails.push("cut " + cut + ": no product sound — the film would demonstrate nothing");
    for (const c of cues) {
      n++;
      const id = "cut " + cut + " " + c.name + " @" + c.atSec.toFixed(2) + " s";
      if (!existsSync(join("public", c.file))) { fails.push(id + ": " + c.file + " missing"); continue; }
      if (finite(c.startSec, id + " start") < 0) fails.push(id + ": starts before the film");
      if (finite(c.startSec + c.durationSec, id + " end") > total + 1e-6) fails.push(id + ": runs to " + (c.startSec + c.durationSec).toFixed(2) + " s, past the " + total + " s cut");
      const real = probe(c.file);
      if (!(Math.abs(finite(real, id + " probed duration") - c.durationSec) < 0.06)) fails.push(id + ": manifest says " + c.durationSec + " s, the file is " + real.toFixed(3) + " s");
      if (c.kind === "product") {
        const f = P.filmSounds.find((x) => x.publicPath === c.file);
        if (Math.abs(c.atSec - c.startSec - f.onsetSec) > 1e-6) fails.push(id + ": not anchored on its onset");
        // its onset is on a beat of the bed
        const beatOff = Math.abs(c.atSec / m.music.beatSec - Math.round(c.atSec / m.music.beatSec)) * m.music.beatSec;
        if (finite(beatOff, id + " beat offset") > 1 / FPS) fails.push(id + ": onset is " + beatOff.toFixed(3) + " s off a beat");
      }
    }
    // C9: one product sound at a time, >= 0.3 s apart
    for (let i = 1; i < product.length; i++) {
      n++;
      const gap = product[i].startSec - (product[i - 1].startSec + product[i - 1].durationSec);
      if (!(finite(gap, "gap") >= m.cues.MIN_PRODUCT_GAP_SEC - 1e-6)) fails.push("cut " + cut + ": " + product[i - 1].name + " and " + product[i].name + " are " + gap.toFixed(2) + " s apart (C9 floor " + m.cues.MIN_PRODUCT_GAP_SEC + " s)");
    }
    for (let t = 0; t < total; t += 0.05) {
      const live = cues.filter((c) => c.startSec <= t && c.startSec + c.durationSec > t).length;
      if (live > 3) { fails.push("cut " + cut + ": " + live + " cues sounding at " + t.toFixed(2) + " s"); break; }
    }
    // the duck is a duck: measured from the duck gain alone
    const steps = total * 20;
    const ducked = Array.from({ length: steps }, (_, i) => m.cues.duckDbAt(i / 20, cues)).filter((d) => d < -0.5).length / steps;
    n++; if (!(finite(ducked, "duck coverage") <= 0.3)) fails.push("cut " + cut + ": the bed is ducked " + (ducked * 100).toFixed(0) + "% of the time — that is a trim, not a duck");
    n++; if (!(ducked > 0)) fails.push("cut " + cut + ": the bed never ducks under a product sound");
    n++; if (cues.filter((c) => c.name === "end").length !== 1) fails.push("cut " + cut + ": expected exactly one end cue");
    sheets[sheets.length - 1] += ", ducked " + (ducked * 100).toFixed(0) + "%";
    n++; const bed = probe(m.music.beds[cut].file); if (!(Math.abs(finite(bed, "bed duration") - total) < 0.02)) fails.push("bed " + cut + ": the file is " + bed + " s");
  }
  n++; if (m.sfx.meta.commercialUse !== true) fails.push("the sfx set is not cleared for commercial use");
  // the per-file gains rest on measurements of exactly the bytes the bake copied
  n++;
  try { execFileSync("node", ["scripts/measure-product-sounds.mjs", "--check"], { stdio: "pipe" }); }
  catch (e) { fails.push(String(e.stderr || e.message).trim().slice(0, 200)); }
  report("audio", n, fails, sheets.join("; "));
}

// 8 ── purity: nothing in the picture runs on the wall clock
if (want("purity")) {
  const fails = []; let n = 0;
  const BANS = [
    [/\btransition\s*:/, "a CSS transition"], [/\banimation\s*:/, "a CSS animation"], [/@keyframes/, "@keyframes"], [/will-?change/i, "will-change"],
    [/Date\.now|performance\.now|new Date\(|Math\.random|requestAnimationFrame/, "a clock or randomness"], [/\buse(State|Effect|Ref|LayoutEffect)\b/, "a stateful hook"],
  ];
  for (const p of SRC) {
    const text = strip(readFileSync(p, "utf8")); n++;
    for (const [re, what] of BANS) if (re.test(text)) fails.push(p + ": " + what);
  }
  report("purity", n, fails);
}

console.log(red ? "\n" + red + " gate(s) RED" : "\nall gates green");
process.exit(red ? 1 : 0);
