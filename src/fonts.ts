import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

// Narrowed on purpose: an unnarrowed import fetches every weight and subset in
// every render worker.
const mono = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });
const grotesk = loadGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] });

export const FILM_FONT = {
  /** the product's world: a terminal face. Emoji in the status line fall through to the system's. */
  mono: `${mono.fontFamily}, "Cascadia Mono", Consolas, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", monospace`,
  /** the film's voice: a grotesk, so a caption is never mistaken for terminal text */
  voice: `${grotesk.fontFamily}, "Segoe UI", sans-serif`,
};
