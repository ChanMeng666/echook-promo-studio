#!/usr/bin/env node
/**
 * Measure the loudness of the product sounds the film plays, so the mix can
 * set each one to the same level with a GAIN (the files themselves are the
 * product's and are never altered). The product ships them between about -12
 * and -25 LUFS; played at one fixed gain, the quiet ones would sink under the
 * bed and the loud ones would jump out.
 *
 *   node scripts/measure-product-sounds.mjs [--check]
 *
 * Reads public/audio/product/* as listed in product.generated.json
 * (filmSounds) and writes src/data/product-levels.json:
 *   { "<publicPath>": { sha256, lufs, truePeakDb } }
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "src/data/product-levels.json";
const product = JSON.parse(readFileSync("src/replica/data/product.generated.json", "utf8"));
const out = {};
for (const s of product.filmSounds) {
  const file = join("public", s.publicPath);
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (sha256 !== s.sha256) { console.error(`measure: ${file} is not the file the bake recorded`); process.exit(1); }
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const at = r.stderr.lastIndexOf("Summary:");
  if (at < 0) { console.error(`measure: no ebur128 summary for ${file}`); process.exit(1); }
  const tail = r.stderr.slice(at);
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]), truePeakDb = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeakDb)) { console.error(`measure: could not read the summary for ${file}`); process.exit(1); }
  out[s.publicPath] = { sha256, lufs, truePeakDb };
}
const text = JSON.stringify(out, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") !== text) { console.error(`measure: ${OUT} is stale; run node scripts/measure-product-sounds.mjs`); process.exit(1); }
  console.log(`measure: ${OUT} matches ${Object.keys(out).length} files`);
} else {
  writeFileSync(OUT, text);
  console.log(`measure: wrote ${OUT} (${Object.keys(out).length} files)`);
}
