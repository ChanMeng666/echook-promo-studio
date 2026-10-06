/**
 * Pure timing helpers. No clocks, no randomness: everything here is a function
 * of its arguments, so frame 900 can be painted before frame 12.
 */

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

/** Progress of `t` through [from, to], clamped. A zero-length window is a step. */
export const prog = (t: number, from: number, to: number): number =>
  to <= from ? (t >= from ? 1 : 0) : clamp01((t - from) / (to - from));

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const easeOutCubic = (p: number): number => 1 - (1 - clamp01(p)) ** 3;
export const easeOutExpo = (p: number): number => (p >= 1 ? 1 : 1 - 2 ** (-10 * clamp01(p)));
export const easeInOutCubic = (p: number): number => {
  const x = clamp01(p);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOutBack = (p: number): number => {
  const x = clamp01(p) - 1;
  return 1 + 2.2 * x * x * x + 1.2 * x * x;
};

/** An eased 0→1 that starts at `from` and takes `dur` seconds. */
export const rise = (t: number, from: number, dur: number, ease = easeOutCubic): number =>
  ease(prog(t, from, from + dur));

/** In, hold, out. */
export const envelope = (t: number, from: number, to: number, fade = 0.25): number =>
  Math.min(prog(t, from, from + fade), 1 - prog(t, to - fade, to));

/** Seeded integer hash in [0,1): the only entropy source (typing rhythm, twinkle). */
export const hash = (seed: number, n: number): number => {
  let h = (seed * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** How many characters of `text` are typed at progress p, with an uneven hand. */
export const typed = (text: string, p: number, seed = 1): string => {
  const n = text.length;
  if (p <= 0) return "";
  if (p >= 1) return text;
  // cumulative per-key delay: spaces and punctuation take a little longer
  let total = 0;
  const cum: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = text[i];
    total += 0.6 + hash(seed, i) * 0.8 + (c === " " ? 0.5 : 0) + (c === "," || c === "." ? 1.2 : 0);
    cum.push(total);
  }
  const target = p * total;
  let k = 0;
  while (k < n && cum[k] <= target) k++;
  return text.slice(0, k);
};
