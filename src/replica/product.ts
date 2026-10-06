/**
 * Typed access to the baked product data. React-free.
 *
 * Nothing here is typed by hand: every accessor reads
 * src/replica/data/product.generated.json (written by `npm run bake` from the
 * product repo) and throws on a name the bake does not carry, so a renamed
 * event is a red gate, not a blank chip.
 */

import raw from "./data/product.generated.json";

export type Theme = "default" | "custom";
export type StatusState = "green" | "yellow" | "red" | "snooze";
export type StatusWidth = "wide" | "medium" | "narrow";

export interface Span { text: string; fg: string | null; bg: string | null; bold: boolean; dim: boolean }
export interface StatusRender { state: string; width: string; columns: number; raw: string; rows: Span[][] }
export interface ProductEvent {
  name: string; kind: string; parent: string | null; defaultOn: boolean;
  audioFile: { default: string; custom: string }; voiceText: string; chimePrompt: string;
}
export interface Sound { file: string; theme: Theme; durationSec: number; peaks: number[] }
export interface FilmSound { event: string; theme: string; file: string; publicPath: string; durationSec: number; onsetSec: number }

export const PRODUCT = raw;
export const COUNTS = raw.counts;
export const EVENTS: readonly ProductEvent[] = raw.events as ProductEvent[];
export const PRODUCT_NAME: string = raw.source.repo.split("/")[1];
export const PRODUCT_URL: string = `github.com/${raw.source.repo}`;

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`product data has no ${what}`);
  return v;
};

export const eventByName = (name: string): ProductEvent => need(EVENTS.find((e) => e.name === name), `event ${name}`);

/** Lit on the wall = the canonical events that are on with no configuration (counts.defaultOnEvents of them). */
export const isLit = (e: ProductEvent): boolean => e.kind === "event" && e.defaultOn;

export const soundOf = (event: string, theme: Theme): Sound => {
  const file = eventByName(event).audioFile[theme];
  const a = need((raw.audio as Record<string, { durationSec: number; peaks: number[] }>)[`${theme}/${file}`], `audio ${theme}/${file}`);
  return { file, theme, durationSec: a.durationSec, peaks: a.peaks };
};

/** A sound the film actually plays: copied to public/ by the bake, with its measured onset. */
export const filmSound = (event: string, theme: Theme): FilmSound =>
  need((raw.filmSounds as FilmSound[]).find((s) => s.event === event && s.theme === theme), `film sound ${event}/${theme}`);

export const statusRender = (state: StatusState, width: StatusWidth): StatusRender =>
  need((raw.statusline.renders as StatusRender[]).find((r) => r.state === state && r.width === width), `status render ${state}/${width}`);

export const toastOf = (event: string) => need(raw.channels.toasts.find((t) => t.event === event), `toast ${event}`);
export const webhookOf = (event: string, format: "raw" | "ntfy") =>
  need(raw.channels.webhooks.find((w) => w.event === event && w.format === format), `webhook ${event}/${format}`);
export const talkStep = (command: string) => need(raw.talk.steps.find((s) => s.command === command), `talk step ${command}`);

/**
 * One segment of the status line, lifted out for the magnified view: its bar
 * (the spans of █ and ░ before the label) and the label up to the next
 * double-space. Every character returned is a character of the baked render.
 */
export const statusSegment = (r: StatusRender, key: string): Span[] => {
  for (const row of r.rows) {
    const i = row.findIndex((s) => s.text.includes(key));
    if (i < 0) continue;
    const out: Span[] = [];
    for (let k = i - 1; k >= 0 && /^[█░]+$/.test(row[k].text); k--) out.unshift(row[k]);
    const from = Math.max(0, row[i].text.indexOf(key) - 1);
    const gap = row[i].text.indexOf("  ", from + 1);
    const label = gap < 0 ? row[i].text.slice(from) : row[i].text.slice(from, gap);
    out.push({ ...row[i], text: label });
    // a warning marker rides directly behind its label, in its own colour
    if (gap < 0 && row[i + 1] && row[i + 1].fg && !/^[█░]+$/.test(row[i + 1].text)) out.push(row[i + 1]);
    return out;
  }
  throw new Error(`status render ${r.state}/${r.width} has no segment ${key}`);
};
