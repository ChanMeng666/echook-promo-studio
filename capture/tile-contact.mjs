#!/usr/bin/env node
/**
 * Tile whatever stills are on disk into contact sheets, one or more per folder.
 * A separate process on purpose: tiling depends only on files and must not be
 * downstream of a render that can fail.
 *
 *   node capture/tile-contact.mjs [filter] [cellWidth] [perSheet]
 *
 * Each cell is labelled with its second (burnt in from the file name).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve("out/stills");
const only = process.argv[2];
const cell = Number(process.argv[3] ?? 480);
const perSheet = Number(process.argv[4] ?? 0);
let made = 0;
for (const d of existsSync(root) ? readdirSync(root) : []) {
  const dir = join(root, d);
  if (!statSync(dir).isDirectory() || (only && !d.includes(only))) continue;
  const files = readdirSync(dir).filter((f) => /^\d{3}-.*\.png$/.test(f)).sort();
  if (!files.length) continue;
  const portrait = d.includes("Vertical");
  const cw = portrait ? Math.round(cell * 0.5) : cell;
  const cols = portrait ? 8 : 5;
  const chunk = perSheet || (portrait ? 32 : 30);
  for (let s = 0; s * chunk < files.length; s++) {
    const part = files.slice(s * chunk, (s + 1) * chunk);
    const tmp = resolve(".cache", "sheet-" + process.pid + "-" + made);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    part.forEach((f, i) => {
      const label = f.replace(/^\d{3}-/, "").replace(".png", "");
      // label each cell as it is scaled, so the sheet says which second it is
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(dir, f), "-vf",
        `scale=${cw}:-1,drawbox=x=0:y=0:w=92:h=24:color=black@0.7:t=fill,drawtext=text='${label}':x=5:y=5:fontsize=15:fontcolor=white:font=Consolas`,
        "-frames:v", "1", join(tmp, String(i).padStart(3, "0") + ".png")]);
    });
    const c = Math.min(part.length, cols);
    const rows = Math.ceil(part.length / c);
    const out = join(root, `sheet-${basename(dir)}${s ? "-" + (s + 1) : ""}.png`);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(tmp, "%03d.png"), "-vf", `tile=${c}x${rows}:margin=6:padding=4:color=0x222222`, "-frames:v", "1", out]);
    rmSync(tmp, { recursive: true, force: true });
    console.log(`sheet: ${out} (${part.length} frames, ${c}x${rows})`);
    made++;
  }
}
if (!made) { console.error("sheet: nothing to tile"); process.exit(1); }
