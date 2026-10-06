#!/usr/bin/env node
/**
 * Mutation evidence for the gates: break one invariant, run the gate that
 * claims to lock it, expect RED, restore. A mutation that stays green means
 * the gate is decorative.
 *
 *   node capture/mutate.mjs            run every mutation, print the table
 *
 * Each mutation edits one file (or moves one asset) and is undone in a
 * `finally`, so an interrupted run leaves at most one restorable change; the
 * script refuses to start on a tree where its targets are already modified.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const MUTATIONS = [
  { gate: "timeline", what: "the 60 s HOOK is cut to 3 bars (the EDL no longer sums to the bed)", file: "src/edits.ts",
    find: '{ scene: "hook", bars: 4,', put: '{ scene: "hook", bars: 3,' },
  { gate: "timeline", what: "a frame literal outside core/timeline.ts", file: "src/Film.tsx",
    find: "from={beat.startFrame} durationInFrames={beat.durationInFrames}", put: "from={beat.startFrame} durationInFrames={90}" },
  { gate: "strings", what: "a label nobody cleared and the product does not say", file: "src/components/Scenes.tsx",
    find: "<span>{LABEL.worksIn}</span>", put: "<span>Loved by developers on</span>" },
  { gate: "numbers", what: "a typed number on the count line", file: "src/components/Scenes.tsx",
    find: "const parts = countParts(COUNTS);", put: 'const parts = [...countParts(COUNTS), "1234567 sounds"];' },
  { gate: "numbers", what: "a fourth tile lit on the wall (the count line says three)", file: "src/replica/product.ts",
    find: 'e.kind === "event" && e.defaultOn;', put: 'e.defaultOn || e.name === "subagent_stop";' },
  { gate: "copy", what: "a line that says the stop sound means the task is done (C2), uncleared", file: "src/copy.ts",
    find: '["You don\'t have to watch."]', put: '["You will know when the task is done."]' },
  { gate: "honesty", what: "the honesty caption is up for 2 s", file: "src/replica/screenplays.ts",
    find: "honesty: { from: 0, to: dur },", put: "honesty: { from: 0, to: 2 }," },
  { gate: "audio", what: "the chime starts while the voice line is still sounding (C9)", file: "src/replica/screenplays.ts",
    find: "const voiceAt = bb(1, 1), toggleAt = bb(1, 4), chimeAt = bb(2, 1);", put: "const voiceAt = bb(1, 1), toggleAt = bb(1, 4), chimeAt = bb(1, 3);" },
  { gate: "audio", what: "a product sound placed off the beat", file: "src/replica/screenplays.ts",
    find: 'const soundAt = cut === "60" ? bb(1, 3) : bb(1, 2);', put: 'const soundAt = cut === "60" ? bb(1, 3) + 0.2 : bb(1, 2);' },
  { gate: "assets", what: "a sound file the film names is missing", move: "public/audio/sfx/move.wav" },
  { gate: "purity", what: "a CSS transition in a component", file: "src/components/Type.tsx",
    find: 'whiteSpace: "nowrap", letterSpacing: "0.005em"', put: 'whiteSpace: "nowrap", letterSpacing: "0.005em", transition: "opacity 1s"' },
];

const run = (gate) => {
  const r = spawnSync("node", ["capture/verify.mjs", "--skip-bake", "--only", gate], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").find((l) => l.trim().startsWith(gate + ":")) ?? "";
  const why = out.split("\n").find((l) => l.includes("✗")) ?? "";
  return { code: r.status, line: line.trim(), why: why.trim() };
};

const rows = []; let bad = 0;
for (const mu of MUTATIONS) {
  const base = run(mu.gate);
  if (base.code !== 0) { console.error(`mutate: ${mu.gate} is already red before mutating — fix that first`); process.exit(1); }
  let res;
  if (mu.move) {
    if (!existsSync(mu.move)) { console.error("mutate: " + mu.move + " is not there"); process.exit(1); }
    renameSync(mu.move, mu.move + ".mutated-away");
    try { res = run(mu.gate); } finally { renameSync(mu.move + ".mutated-away", mu.move); }
  } else {
    const before = readFileSync(mu.file, "utf8");
    if (!before.includes(mu.find)) { console.error(`mutate: ${mu.file} no longer contains the text for "${mu.what}"`); process.exit(1); }
    writeFileSync(mu.file, before.replace(mu.find, mu.put));
    try { res = run(mu.gate); } finally { writeFileSync(mu.file, before); }
  }
  const after = run(mu.gate);
  const ok = res.code !== 0 && /FAIL/.test(res.line) && after.code === 0;
  if (!ok) bad++;
  rows.push(`| ${mu.gate} | ${mu.what} | ${ok ? "RED" : "STAYED GREEN"} | ${res.why.replace(/\|/g, "/").slice(0, 150)} | ${after.code === 0 ? "green" : "RED"} |`);
  console.log(rows.at(-1));
}
console.log("\n| gate | mutation | result | first failure printed | restored |\n|---|---|---|---|---|\n" + rows.join("\n"));
console.log(bad ? `\n${bad} mutation(s) did not redden their gate` : `\nall ${rows.length} mutations reddened their gate and restored green`);
process.exit(bad ? 1 : 0);
