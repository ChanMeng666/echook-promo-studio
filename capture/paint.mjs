/**
 * Paint the film's own scene components to static markup in Node and return
 * the text that would be on screen. The scenes are bundled as they are; only
 * `remotion` and the web-font loader are replaced by stand-ins (capture/stubs).
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ENTRY = [
  'import React from "react";',
  'import { renderToStaticMarkup } from "react-dom/server";',
  'import * as S from "./components/Scenes";',
  'import { deriveLayout } from "./core/layout-core";',
  "const VIEWS = { hook: S.HookScene, away: S.AwayScene, events: S.EventsScene, themes: S.ThemesScene, channels: S.ChannelsScene, talk: S.TalkScene, statusline: S.StatusScene, end: S.EndScene };",
  "export const paint = (scene, cut, t, dur, width, height) =>",
  "  renderToStaticMarkup(React.createElement(VIEWS[scene], { cut, t, dur, layout: deriveLayout(width, height) }));",
].join("\n");

export const loadPainter = async () => {
  const b = await build({
    stdin: { contents: ENTRY, resolveDir: resolve("src"), sourcefile: "paint-entry.tsx", loader: "tsx" },
    bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", loader: { ".json": "json" }, logLevel: "silent",
    // react-dom/server is CommonJS and requires Node built-ins
    banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" },
    define: { "process.env.NODE_ENV": "\"production\"" },
    plugins: [{
      name: "stand-ins",
      setup(b2) {
        b2.onResolve({ filter: /^remotion$/ }, () => ({ path: resolve("capture/stubs/remotion.tsx") }));
        b2.onResolve({ filter: /\/fonts$/ }, () => ({ path: resolve("capture/stubs/fonts.ts") }));
      },
    }],
  });
  // a file, not a data: URL — the bundle carries react-dom and is too large for one
  const dir = resolve(".cache", "paint-" + process.pid);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "paint.mjs");
  writeFileSync(file, b.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  return mod.paint;
};

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };
/** The text nodes of a markup string, trimmed, zero-width breaks removed. */
export const textNodes = (markup) => markup
  .replace(/<[^>]*>/g, "\u0001").split("\u0001")
  .map((s) => s.replace(/&(amp|lt|gt|quot|#x27);/g, (e) => ENT[e]).replace(/​/g, "").trim())
  .filter(Boolean);
