/**
 * Colour and type tokens. React-free.
 *
 * The product's colours: brand green is the fill of the product's own logo
 * (public/echook-logo.svg, #16F800); the status line's colours are baked per
 * span and are not restated here. The rest is the film's furniture.
 */

export const T = {
  /** brand green: an accent, never a flat area (C8) */
  green: "#16F800",
  greenDim: "rgba(22,248,0,0.16)",
  greenLine: "rgba(22,248,0,0.55)",
  /** the terminal */
  termBg: "#0b0d0c",
  termBar: "#141816",
  termLine: "#1f2623",
  termFg: "#d7dcd8",
  termDim: "#7d8882",
  termFaint: "#4b5650",
  termUser: "#f2f5f3",
  /** film furniture */
  night: "#0a0c12",
  dusk: "#1b1a3a",
  ink: "#17161f",
  paper: "#f1e9d8",
  amber: "#f2b25c",
  card: "#11141a",
  cardLine: "#252a35",
  white: "#f6f4ee",
} as const;

/** The honest name of a mono cell: JetBrains Mono's advance is 0.6 em. */
export const MONO_ADVANCE = 0.6;
export const TERM_LINE = 1.42;
