/**
 * The film's own voice: every word on screen that is NOT the product's own
 * string and NOT demo-session content. React-free. Each line has a row in
 * docs/copy-clearance.md, and `npm run verify` fails on a line with no row.
 *
 * Line breaks are authored per aspect and rendered nowrap: the same sentence
 * breaks differently at 1920 and at 1080 wide, and a bad break should show up
 * as an overflow, not as a silent reflow.
 *
 * Numbers never appear here as digits (C11): `countLine` takes them from the
 * baked product data.
 */

import type { Aspect } from "./core/layout-core";

export interface CopyLine {
  id: string;
  lines: Readonly<Record<Aspect, readonly string[]>>;
}

const line = (id: string, landscape: string[], portrait: string[] = landscape): CopyLine =>
  ({ id, lines: { landscape, portrait } });

export const COPY = {
  hook1: line("hook1", ["Your agent is working."]),
  hook2: line("hook2", ["You don't have to watch."]),
  away: line("away", ["echook calls", "you back."]),
  events: line("events", ["Every event has its own sound."], ["Every event has", "its own sound."]),
  themes: line("themes", ["Voice or chimes."]),
  channelDesk: line("channelDesk", ["At your desk."], ["At your", "desk."]),
  channelWindow: line("channelWindow", ["In another window."], ["In another", "window."]),
  channelPhone: line("channelPhone", ["On your phone."], ["On your", "phone."]),
  talk: line("talk", ["Set it up by asking your agent."], ["Set it up by", "asking your agent."]),
  statusline: line("statusline", ["A status line that keeps context and quota in view."], ["A status line that keeps", "context and quota in view."]),
  /** the 15 s cut has one bar for the status line: the same claim in five words */
  statuslineShort: line("statuslineShort", ["Context and quota in view."]),
  end: line("end", ["Hear your agent."]),
} as const;

/** Small labels that are the film's words, not the product's. */
export const LABEL = {
  themeVoice: "Voice",
  themeChimes: "Chimes",
  worksIn: "Works in",
  licence: "MIT · open source",
  /** the three editors, as plain words (C5); the gate checks the count against the baked data */
  editors: ["Claude Code", "Cursor", "Codex"],
} as const;

/** The honesty caption (C6), verbatim. The separator is where it may break. */
export const HONESTY_PARTS = ["Interface recreated in code", "sounds are echook's own files", "demo session"] as const;
export const HONESTY_SEP = " · ";
export const HONESTY = HONESTY_PARTS.join(HONESTY_SEP);
export const HONESTY_LINES: Readonly<Record<Aspect, readonly string[]>> = {
  landscape: [HONESTY],
  portrait: [HONESTY_PARTS[0] + HONESTY_SEP.trimEnd(), HONESTY_PARTS.slice(1).join(HONESTY_SEP)],
};

/** The count line. The words are the film's; the numbers are the product's. */
export const COUNT_WORDS = { events: "events", variants: "variants", onByDefault: "on by default" } as const;
export const countParts = (c: { events: number; variants: number; defaultOnEvents: number }): string[] => [
  `${c.events} ${COUNT_WORDS.events}`,
  `${c.variants} ${COUNT_WORDS.variants}`,
  `${c.defaultOnEvents} ${COUNT_WORDS.onByDefault}`,
];

/** Every film-voice string, flat, for the clearance gate. */
export const allCopy = (): string[] => [
  ...Object.values(COPY).flatMap((c) => [c.lines.landscape.join(" "), c.lines.portrait.join(" ")]),
  LABEL.themeVoice, LABEL.themeChimes, LABEL.worksIn, LABEL.licence, ...LABEL.editors,
  HONESTY,
  ...Object.values(COUNT_WORDS),
];
