import React from "react";

import type { Rect } from "../core/layout-core";
import { FILM_FONT } from "../fonts";
import { DEMO } from "./demo";
import { PRODUCT, statusRender, type Span, type StatusRender, type StatusWidth } from "./product";
import type { PaintedLine, TermState } from "./screenplays";
import { MONO_ADVANCE, T, TERM_LINE } from "./tokens";

const PALETTE = PRODUCT.statusline.palette as Record<string, string>;
/** the terminal's own green and red, as the status line's palette resolves them */
const ADD = PALETTE["32"], DEL = PALETTE["31"], WARN = PALETTE["33"];

const FULL = "█", SHADE = "░";
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
/** A terminal draws emoji two cells wide. */
const cellsOf = (g: string): number => {
  const cp = g.codePointAt(0) ?? 0;
  return cp >= 0x1f000 || cp === 0x26a1 || g.includes("️") ? 2 : 1;
};

/** One baked span, painted cell by cell so columns hold whatever font a glyph falls back to. */
const Cells: React.FC<{ span: Span; f: number }> = ({ span, f }) => {
  const cw = f * MONO_ADVANCE;
  const color = span.fg ?? T.termFg;
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const { segment: g } of segmenter.segment(span.text)) {
    const n = cellsOf(g);
    const block = g === FULL || g === SHADE;
    out.push(
      <span key={i++} style={{ display: "inline-block", width: cw * n, height: f * TERM_LINE, textAlign: "center", verticalAlign: "top", overflow: "visible", whiteSpace: "pre" }}>
        {block
          ? <span style={{ display: "inline-block", width: cw + 0.6, height: f * 0.92, marginTop: f * 0.25, background: color, opacity: g === SHADE ? 0.3 : 1 }} />
          : n === 2 ? <span style={{ fontSize: f * 0.86 }}>{g}</span> : g}
      </span>,
    );
  }
  return (
    <span style={{ color, background: span.bg ?? undefined, fontWeight: span.bold ? 700 : 400, opacity: span.dim ? 0.5 : 1 }}>{out}</span>
  );
};

/** The status line, painted from the baked render exactly: spans, colours, row breaks. */
export const StatusLine: React.FC<{ render: StatusRender; f: number; flash?: number }> = ({ render, f, flash = 0 }) => (
  <div style={{ fontFamily: FILM_FONT.mono, fontSize: f, lineHeight: TERM_LINE, color: T.termFg, position: "relative" }}>
    {flash > 0 ? <div style={{ position: "absolute", inset: `${-f * 0.3}px ${-f * 0.5}px`, borderRadius: f * 0.3, background: `rgba(255,255,255,${(flash * 0.07).toFixed(3)})` }} /> : null}
    {render.rows.map((row, r) => (
      <div key={r} style={{ height: f * TERM_LINE, whiteSpace: "nowrap", position: "relative" }}>
        {row.map((s, i) => <Cells key={i} span={s} f={f} />)}
      </div>
    ))}
  </div>
);

const Dot: React.FC<{ f: number; color: string; hollow?: boolean }> = ({ f, color, hollow }) => (
  <span style={{ display: "inline-block", width: f * 0.46, height: f * 0.46, borderRadius: f, marginRight: f * 0.62, marginLeft: f * 0.07, verticalAlign: "middle", position: "relative", top: -f * 0.06,
    background: hollow ? "transparent" : color, boxShadow: hollow ? `inset 0 0 0 ${Math.max(1.5, f * 0.09)}px ${color}` : undefined }} />
);

const VERB_COLOR: Record<string, string> = { read: T.termDim, edit: WARN, write: ADD, run: PALETTE["36"] };

const Line: React.FC<{ p: PaintedLine; f: number }> = ({ p, f }) => {
  const { line, text, age } = p;
  // every entrance has a floor: a line arrives, it does not pop from nothing
  const a = age >= 0.2 ? 1 : 0.55 + 0.45 * (age / 0.2);
  const base: React.CSSProperties = { height: f * TERM_LINE, whiteSpace: "pre", opacity: a, overflow: "hidden", textOverflow: "clip" };
  switch (line.k) {
    case "user":
      return (
        <div style={{ ...base, color: T.termUser, fontWeight: 700, marginTop: f * 0.5, marginBottom: f * 0.35 }}>
          <span style={{ color: T.green }}>{"› "}</span>{text}
        </div>
      );
    case "tool":
      return (
        <div style={{ ...base, color: T.termFg }}>
          <Dot f={f} color={VERB_COLOR[line.tool.verb]} />
          <span style={{ color: T.termDim }}>{line.tool.verb.padEnd(6)}</span>{text}
          {line.tool.added ? <span style={{ color: ADD }}>{"  +" + line.tool.added}</span> : null}
          {line.tool.removed ? <span style={{ color: DEL }}>{" -" + line.tool.removed}</span> : null}
        </div>
      );
    case "cmd":
      return (
        <div style={{ ...base, color: T.termUser }}>
          <Dot f={f} color={VERB_COLOR.run} /><span style={{ color: T.termDim }}>{"run".padEnd(6)}</span><span style={{ fontWeight: 700 }}>{text}</span>
        </div>
      );
    case "json":
      return <div style={{ ...base, color: ADD, paddingLeft: f * 1.15 + f * MONO_ADVANCE * 6 }}>{text}</div>;
    case "agent":
      return <div style={{ ...base, color: T.termFg, marginTop: f * 0.35 }}>{text}</div>;
    case "note": {
      const c = line.tone === "ask" ? WARN : line.tone === "wait" ? T.amber : ADD;
      return (
        <div style={{ ...base, color: c, fontWeight: line.tone === "ok" ? 400 : 700 }}>
          <Dot f={f} color={c} hollow={line.tone !== "ok"} />{text}
        </div>
      );
    }
  }
};

/**
 * A generic terminal window running an agent session. Dumb: it paints the
 * state it is given into the rect it is given. The type size is derived from
 * the rect and the column count, so the same component is a monitor's screen
 * in the painted desk and a floating window on its own.
 */
export const Terminal: React.FC<{
  rect: Rect; cols: number; statusWidth: StatusWidth; state: TermState;
  /** a title bar: on for the floating window, off inside the painted monitor */
  chrome?: boolean;
  radius?: number;
  /** 0..1: quieten the session so the status line is the subject */
  hush?: number;
  shadow?: boolean;
  opacity?: number;
}> = ({ rect, cols, statusWidth, state, chrome = true, radius = 14, hush = 0, shadow = true, opacity = 1 }) => {
  const padX = rect.w * 0.019;
  const f = (rect.w - 2 * padX) / cols / MONO_ADVANCE;
  const render = statusRender(state.status, statusWidth);
  const flash = state.statusAge >= 0 && state.statusAge < 0.6 ? 1 - state.statusAge / 0.6 : 0;
  const dots = [0, 1, 2].map((i) => (state.spin + i * 2) % 6 < 3);
  return (
    <div style={{
      position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: radius, overflow: "hidden", opacity,
      background: T.termBg, fontFamily: FILM_FONT.mono, fontSize: f, lineHeight: TERM_LINE, color: T.termFg, display: "flex", flexDirection: "column",
      boxShadow: shadow ? `0 0 0 1px ${T.termLine}, 0 24px 60px -12px rgba(0,0,0,0.65), 0 60px 120px -40px rgba(0,0,0,0.6)` : undefined,
    }}>
      {chrome ? (
        <div style={{ height: f * 1.9, flex: "none", background: T.termBar, borderBottom: `1px solid ${T.termLine}`, display: "flex", alignItems: "center", padding: `0 ${padX}px`, gap: f * 0.4 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: f * 0.5, height: f * 0.5, borderRadius: f, background: T.termFaint }} />)}
          <div style={{ flex: 1, textAlign: "center", color: T.termDim, fontSize: f * 0.82, marginRight: f * 2.3 }}>{DEMO.title}</div>
        </div>
      ) : null}
      {/* the session: bottom-anchored, older lines run off the top like any terminal */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: `0 ${padX}px`, opacity: 1 - hush * 0.62 }}>
        {state.lines.map((p, i) => <Line key={i} p={p} f={f} />)}
        <div style={{ height: f * TERM_LINE, marginTop: f * 0.3, color: T.termDim, whiteSpace: "pre", visibility: state.busy ? "visible" : "hidden" }}>
          {dots.map((on, i) => <span key={i} style={{ display: "inline-block", width: f * 0.34, height: f * 0.34, borderRadius: f, marginRight: f * 0.26, background: T.green, opacity: on ? 1 : 0.25, verticalAlign: "middle" }} />)}
          {" " + DEMO.working}
        </div>
      </div>
      {/* the prompt */}
      <div style={{ flex: "none", margin: `${f * 0.4}px ${padX}px ${f * 0.45}px`, padding: `${f * 0.32}px ${f * 0.7}px`, border: `1px solid ${T.termLine}`, borderRadius: f * 0.4, height: f * TERM_LINE, whiteSpace: "pre", color: T.termUser, opacity: 1 - hush * 0.5 }}>
        <span style={{ color: T.green, fontWeight: 700 }}>{"› "}</span>{state.input}
        <span style={{ display: "inline-block", width: f * 0.55, height: f * 1.05, background: T.termUser, opacity: state.caret ? 0.9 : 0, verticalAlign: "middle", position: "relative", top: -f * 0.05 }} />
      </div>
      {/* the status line, pinned to the bottom */}
      <div style={{ flex: "none", padding: `${f * 0.1}px ${padX}px ${f * 0.55}px` }}>
        <StatusLine render={render} f={f} flash={flash} />
      </div>
    </div>
  );
};
