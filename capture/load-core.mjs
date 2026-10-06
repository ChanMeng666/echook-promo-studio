/**
 * Bundle the film's React-free core with esbuild and import it in Node, so a
 * gate or a capture tool executes the SAME modules the renderer does rather
 * than a re-derivation of them.
 */
import { build } from "esbuild";
import { resolve } from "node:path";

const ENTRY = [
  'export * as layout from "./core/layout-core";',
  'export * as timeline from "./core/timeline";',
  'export * as camera from "./core/camera";',
  'export * as cues from "./cues";',
  'export * as copy from "./copy";',
  'export * as scenes from "./scenes";',
  'export * as edits from "./edits";',
  'export * as plays from "./replica/screenplays";',
  'export * as demo from "./replica/demo";',
  'export * as productApi from "./replica/product";',
  'export * as tokens from "./replica/tokens";',
  'export { default as music } from "./data/music.json";',
  'export { default as sfx } from "./data/sfx.json";',
  'export { default as art } from "./data/art.json";',
  'export { default as product } from "./replica/data/product.generated.json";',
].join("\n");

export const loadCore = async () => {
  const b = await build({
    stdin: { contents: ENTRY, resolveDir: resolve("src"), sourcefile: "gate-entry.ts", loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", loader: { ".json": "json" }, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
