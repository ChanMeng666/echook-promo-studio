/**
 * The screenplays: WHEN things happen in each scene, per cut, in seconds on
 * the beat's own clock. React-free.
 *
 * Positions are written as the bed counts them — bb(bar, beat) — so a product
 * sound's onset lands on a beat of the music. The scenes read these tables to
 * paint; the cue sheet (src/cues.ts) reads the same tables to place sounds; the
 * gates read them to check reading time, the honesty caption and C9. One
 * table, so a sound cannot drift off the picture that explains it.
 */

import type { CutId } from "../core/layout-core";
import { BEAT_SEC, bb } from "../core/timeline";
import { COPY, type CopyLine } from "../copy";
import { DEMO, type ToolLine } from "./demo";
import { talkStep, toastOf, type StatusState, type Theme } from "./product";

export type SfxRole = "move" | "type" | "appear" | "ripple" | "toggle" | "end";
export type SceneKey = "hook" | "away" | "events" | "themes" | "channels" | "talk" | "statusline" | "end";

export interface SoundMoment { /** when its onset should be HEARD */ at: number; event: string; theme: Theme; why: string }
export interface FxMoment { at: number; role: SfxRole; gainDb?: number; why: string }
export interface CaptionMark { copy: CopyLine; from: number; to: number; /** the first line of a cut is half risen on frame 0 */ floor?: boolean }

// ── the terminal ────────────────────────────────────────────────────────────

export type TermLine =
  | { k: "user"; at: number; text: string }
  | { k: "tool"; at: number; tool: ToolLine }
  | { k: "cmd"; at: number; text: string }
  | { k: "json"; at: number; text: string }
  | { k: "agent"; at: number; text: string; streamSec: number }
  | { k: "note"; at: number; text: string; tone: "ask" | "wait" | "ok" };

export interface TermScript {
  lines: TermLine[];
  /** what the user types at the prompt, and when it is sent */
  input?: { text: string; from: number; to: number; sendAt: number; startChars: number };
  /** the agent is busy (spinner) inside these windows */
  busy: [number, number][];
  /** which baked status-line render is up, from when */
  status: { at: number; state: StatusState }[];
}

export interface PaintedLine { line: TermLine; text: string; age: number }
export interface TermState {
  lines: PaintedLine[];
  input: string;
  caret: boolean;
  busy: boolean;
  /** which frame of the spinner, a pure function of t */
  spin: number;
  elapsedSec: number;
  status: StatusState;
  statusAge: number;
}

const typedCount = (n: number, p: number): number => (p <= 0 ? 0 : p >= 1 ? n : Math.floor(n * p));
const finite = (t: number): number => (Number.isFinite(t) ? t : 0);

/** at(script, t) → state. Pure and total: NaN is the opening frame, an overrun is the closing one. */
export const terminalAt = (script: TermScript, time: number): TermState => {
  const t = finite(time);
  const lines: PaintedLine[] = [];
  for (const line of script.lines) {
    if (line.at > t) continue;
    const age = t - line.at;
    let text = line.k === "tool" ? line.tool.target : line.text;
    if (line.k === "agent" && line.streamSec > 0) text = text.slice(0, typedCount(text.length, age / line.streamSec));
    lines.push({ line, text, age });
  }
  let input = "";
  const inp = script.input;
  if (inp && t < inp.sendAt) {
    const p = inp.to <= inp.from ? 1 : (t - inp.from) / (inp.to - inp.from);
    input = inp.text.slice(0, inp.startChars + typedCount(inp.text.length - inp.startChars, p));
  }
  const busy = script.busy.some(([a, b]) => t >= a && t < b);
  let status = script.status[0];
  for (const s of script.status) if (s.at <= t) status = s;
  return {
    lines, input, busy,
    caret: Math.floor(t / 0.53) % 2 === 0 || (!!inp && t >= inp.from && t < inp.sendAt),
    spin: Math.floor(Math.max(0, t) / 0.09),
    elapsedSec: Math.max(0, t),
    status: status.state, statusAge: t - status.at,
  };
};

const PAST = -60;
const requestLine: TermLine = { k: "user", at: PAST, text: DEMO.request };
/** the tool lines; `last` gives arrival times to the final few, everything before them is already on screen */
const toolsAt = (last: number[]): TermLine[] => DEMO.tools.map((tool, i) => ({ k: "tool", at: last[i - (DEMO.tools.length - last.length)] ?? PAST, tool }));

const perm = toastOf("permission_request");
const idle = toastOf("notification_idle_prompt");
const stopToast = toastOf("stop");
/** the command the agent asks to run is the one in the baked permission payload */
const runTool: ToolLine = { verb: "run", target: perm.stdin.tool_input!.command };

// ── HOOK ────────────────────────────────────────────────────────────────────

export interface HookPlay { captions: CaptionMark[]; term: TermScript; sounds: SoundMoment[]; fx: FxMoment[] }
const hook = (cut: CutId): HookPlay => {
  const dur = bb(cut === "60" ? 5 : cut === "30" ? 3 : 2);
  // the agent is mid-work: two lines already there, the rest arriving through the beat
  const step = dur / 4;
  const term: TermScript = {
    lines: [requestLine, ...toolsAt([step * 0.6, step * 1.8, step * 3.0])],
    busy: [[PAST, 1e9]], status: [{ at: PAST, state: "green" }],
  };
  const second = cut === "60" ? bb(3) : cut === "30" ? bb(2) : 0;
  const captions: CaptionMark[] = cut === "15"
    ? [{ copy: COPY.hook2, from: 0, to: dur - 0.08, floor: true }]
    : [{ copy: COPY.hook1, from: 0, to: second - 0.12, floor: true }, { copy: COPY.hook2, from: second, to: dur - 0.08 }];
  return { captions, term, sounds: [], fx: cut === "15" ? [] : [{ at: second, role: "appear", gainDb: -3, why: "the second hook line lands" }] };
};

// ── AWAY ────────────────────────────────────────────────────────────────────

export interface AwayPlay { travelSec: number; soundAt: number; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const away = (cut: CutId): AwayPlay => {
  const dur = bb(cut === "60" ? 5 : cut === "30" ? 4 : 3);
  const travelSec = cut === "60" ? 1.7 : cut === "30" ? 1.4 : 1.1;
  const soundAt = cut === "60" ? bb(2, 3) : cut === "30" ? bb(2) : bb(1, 4);
  return {
    travelSec, soundAt,
    captions: [{ copy: COPY.away, from: soundAt + BEAT_SEC, to: dur }],
    sounds: [{ at: soundAt, event: "stop", theme: "default", why: "the callback: the product's own voice line, heard in the bed's breakdown" }],
    fx: [],
  };
};

// ── EVENTS ──────────────────────────────────────────────────────────────────

export interface EventFire { at: number; event: string; theme: Theme }
export interface EventsPlay {
  term: TermScript;
  /** the events that fire in the terminal, each with a chip and its real sound */
  fires: EventFire[];
  /** the pull back to the wall: starts, and is complete */
  wallFrom: number; wallAt: number;
  /** one tile of the wall is picked out and heard */
  pick?: EventFire;
  countFrom: number;
  captions: CaptionMark[];
  honesty: { from: number; to: number };
  sounds: SoundMoment[]; fx: FxMoment[];
}
const events = (cut: CutId): EventsPlay => {
  const dur = bb(cut === "60" ? 7 : cut === "30" ? 4 : 3);
  const done = toolsAt([]);
  let fires: EventFire[] = []; let lines: TermLine[] = []; let busy: [number, number][] = [];
  let wallFrom = 0, wallAt = 0, pickAt = 0;
  if (cut === "60") {
    const ask = bb(1, 2), wait = bb(3, 2), stop = bb(4, 1);
    fires = [{ at: ask, event: "permission_request", theme: "default" }, { at: wait, event: "notification_idle_prompt", theme: "default" }, { at: stop, event: "stop", theme: "default" }];
    lines = [requestLine, ...done,
      { k: "tool", at: PAST, tool: runTool },
      { k: "note", at: ask, text: perm.body, tone: "ask" },
      { k: "note", at: wait, text: idle.stdin.message!, tone: "wait" },
      { k: "note", at: bb(3, 4), text: DEMO.approved, tone: "ok" },
      { k: "agent", at: bb(3, 4) + 0.15, text: stopToast.stdin.last_assistant_message!, streamSec: 0.55 }];
    busy = [[PAST, ask], [bb(3, 4), stop]];
    wallFrom = bb(4, 3); wallAt = bb(5, 1); pickAt = bb(5, 3);
  } else if (cut === "30") {
    const wait = bb(1, 2);
    fires = [{ at: wait, event: "notification_idle_prompt", theme: "default" }];
    lines = [requestLine, ...done, { k: "tool", at: PAST, tool: runTool }, { k: "note", at: PAST, text: perm.body, tone: "ask" },
      { k: "note", at: wait, text: idle.stdin.message!, tone: "wait" }];
    wallFrom = bb(1, 4); wallAt = bb(2, 2); pickAt = bb(2, 4);
  } else {
    lines = [requestLine, ...done];
    wallFrom = -1; wallAt = -0.5; pickAt = bb(1, 3);
  }
  const pick: EventFire = { at: pickAt, event: "stop_failure_rate_limit", theme: "default" };
  const captions: CaptionMark[] = cut === "15" ? [] : [{ copy: COPY.events, from: 0, to: wallAt - 0.1 }];
  return {
    term: { lines, busy, status: [{ at: PAST, state: "green" }] },
    fires, wallFrom, wallAt, pick, countFrom: Math.max(0, wallAt), captions,
    honesty: { from: 0, to: dur },
    sounds: [...fires, pick].map((f) => ({ ...f, why: `${f.event} fires on screen` })),
    fx: cut === "15" ? [] : [{ at: wallFrom, role: "move", gainDb: -2, why: "pull back to the wall" }],
  };
};

// ── THEMES ──────────────────────────────────────────────────────────────────

export interface ThemesPlay { event: string; voiceAt: number; toggleAt: number; chimeAt: number; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const themes = (): ThemesPlay => {
  const voiceAt = bb(1, 1), toggleAt = bb(1, 4), chimeAt = bb(2, 1);
  return {
    event: "stop", voiceAt, toggleAt, chimeAt,
    captions: [{ copy: COPY.themes, from: 0, to: bb(3) }],
    sounds: [
      { at: voiceAt, event: "stop", theme: "default", why: "the voice theme's file for this event" },
      { at: chimeAt, event: "stop", theme: "custom", why: "the chime theme's file for the same event" },
    ],
    fx: [{ at: toggleAt, role: "toggle", why: "the theme switch moves" }],
  };
};

// ── CHANNELS ────────────────────────────────────────────────────────────────

export interface ChannelsPlay { deskAt: number; toastAt: number; phoneAt: number; soundAt: number; event: string; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const channels = (cut: CutId): ChannelsPlay => {
  const dur = bb(cut === "60" ? 5 : 3);
  const toastAt = cut === "60" ? bb(2, 1) : bb(1, 3);
  const phoneAt = cut === "60" ? bb(3, 1) : bb(2, 1);
  const soundAt = cut === "60" ? bb(1, 3) : bb(1, 2);
  return {
    deskAt: 0, toastAt, phoneAt, soundAt, event: "permission_request",
    captions: [
      { copy: COPY.channelDesk, from: 0, to: dur },
      { copy: COPY.channelWindow, from: toastAt, to: dur },
      { copy: COPY.channelPhone, from: phoneAt, to: dur },
    ],
    sounds: [{ at: soundAt, event: "permission_request", theme: "default", why: "the sound at the desk" }],
    fx: [{ at: toastAt, role: "appear", why: "the toast arrives" }, { at: phoneAt, role: "appear", why: "the phone lights" }],
  };
};

// ── TALK ────────────────────────────────────────────────────────────────────

/** A real CLI result, shown without its volatile fields; the cut is marked with an ellipsis. */
export const stableJson = (step: { parsed: Record<string, unknown>; volatileFields: string[] }): string => {
  const keep = Object.entries(step.parsed).filter(([k]) => !step.volatileFields.includes(k));
  return `{${keep.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")}${keep.length < Object.keys(step.parsed).length ? ", …" : ""}}`;
};

export interface TalkPlay { term: TermScript; statusAt: number; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const talk = (cut: CutId): TalkPlay => {
  const dur = bb(cut === "60" ? 5 : 3);
  const step = talkStep("audio-hooks snooze 1h");
  const long = cut === "60";
  const from = long ? 0.3 : 0, to = long ? bb(1, 4) : bb(1, 2), sendAt = long ? bb(2, 1) : bb(1, 3);
  const cmdAt = long ? bb(2, 2) : bb(1, 4), jsonAt = long ? bb(2, 4) : bb(2, 1), statusAt = long ? bb(3, 1) : bb(2, 2);
  const startChars = long ? 0 : Math.floor(step.said.length * 0.55);
  const keys = step.said.length - startChars;
  const term: TermScript = {
    lines: [requestLine, ...toolsAt([]), { k: "tool", at: PAST, tool: runTool },
      { k: "agent", at: PAST, text: stopToast.stdin.last_assistant_message!, streamSec: 0 },
      { k: "user", at: sendAt, text: step.said },
      { k: "cmd", at: cmdAt, text: step.command },
      { k: "json", at: jsonAt, text: stableJson(step as { parsed: Record<string, unknown>; volatileFields: string[] }) },
      { k: "agent", at: statusAt, text: DEMO.mutedReply, streamSec: 0.3 }],
    input: { text: step.said, from, to, sendAt, startChars },
    busy: [[sendAt, statusAt]],
    status: [{ at: PAST, state: "green" }, { at: statusAt, state: "snooze" }],
  };
  return {
    term, statusAt,
    captions: [{ copy: COPY.talk, from: 0, to: dur }],
    sounds: [],
    fx: [
      // one key sound for every third character typed
      ...Array.from({ length: Math.ceil(keys / 3) }, (_, i) => ({ at: from + ((to - from) * (i * 3 + 1)) / keys, role: "type" as const, why: "typing" })),
      { at: sendAt, role: "toggle", gainDb: -4, why: "enter" },
      { at: statusAt, role: "appear", gainDb: -2, why: "the status line gains the muted segment" },
    ],
  };
};

// ── STATUSLINE ──────────────────────────────────────────────────────────────

export interface StatusPlay { term: TermScript; arriveSec: number; steps: { at: number; state: StatusState }[]; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const statusline = (cut: CutId): StatusPlay => {
  const dur = bb(cut === "60" ? 5 : cut === "30" ? 3 : 2);
  const [y, r] = cut === "60" ? [bb(2, 3), bb(3, 3)] : cut === "30" ? [bb(1, 3), bb(2, 1)] : [bb(1, 2), bb(1, 3)];
  const steps: { at: number; state: StatusState }[] = [{ at: PAST, state: "green" }, { at: y, state: "yellow" }, { at: r, state: "red" }];
  return {
    term: {
      lines: [requestLine, ...toolsAt([]), { k: "tool", at: PAST, tool: runTool },
        { k: "agent", at: PAST, text: stopToast.stdin.last_assistant_message!, streamSec: 0 }],
      busy: [], status: steps,
    },
    arriveSec: cut === "60" ? 1.2 : 0.7, steps,
    captions: [{ copy: cut === "15" ? COPY.statuslineShort : COPY.statusline, from: 0, to: dur }],
    sounds: [],
    fx: [{ at: y, role: "toggle", gainDb: -3, why: "context bar turns yellow" }, { at: r, role: "toggle", gainDb: -1, why: "context bar turns red" }],
  };
};

// ── END ─────────────────────────────────────────────────────────────────────

export interface EndPlay { /** the three editors on their own, before the card (60 s only) */ editorsUntil: number; cardAt: number; captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[] }
const end = (cut: CutId): EndPlay => {
  const cardAt = cut === "60" ? bb(2) : 0;
  return {
    editorsUntil: cardAt, cardAt,
    captions: [{ copy: COPY.end, from: cardAt + 0.3, to: 1e9 }],
    sounds: [],
    fx: [{ at: cardAt, role: "end", why: "the end card lands" }],
  };
};

// ── lookup ──────────────────────────────────────────────────────────────────

const each = <P>(f: (cut: CutId) => P): Record<CutId, P> => ({ "15": f("15"), "30": f("30"), "60": f("60") });
export const HOOK = each(hook);
export const AWAY = each(away);
export const EVENTS_PLAY = each(events);
export const THEMES = each(themes);
export const CHANNELS = each(channels);
export const TALK = each(talk);
export const STATUSLINE = each(statusline);
export const END = each(end);

export interface AnyPlay { captions: CaptionMark[]; sounds: SoundMoment[]; fx: FxMoment[]; honesty?: { from: number; to: number } }
export const PLAYS: Readonly<Record<SceneKey, Record<CutId, AnyPlay>>> = {
  hook: HOOK, away: AWAY, events: EVENTS_PLAY, themes: THEMES, channels: CHANNELS, talk: TALK, statusline: STATUSLINE, end: END,
};
