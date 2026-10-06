import React from "react";

import { clamp01, easeOutBack, easeOutCubic, prog } from "../core/ease";
import type { Rect } from "../core/layout-core";
import { FILM_FONT } from "../fonts";
import { EVENTS, eventByName, filmSound, isLit, soundOf, type ProductEvent, type Theme } from "./product";
import { T } from "./tokens";

/** Down-sample baked peaks to n bars (max of each bucket), so a small tile still shows the file's shape. */
const bars = (peaks: readonly number[], n: number): number[] =>
  Array.from({ length: n }, (_, i) => Math.max(0.04, ...peaks.slice(Math.floor((i * peaks.length) / n), Math.floor(((i + 1) * peaks.length) / n))));

/** A waveform from a real file's baked peaks, as one clipped element. `played` 0..1 lights the part already heard. */
export const Waveform: React.FC<{ peaks: readonly number[]; n: number; w: number; h: number; color: string; rest: string; played?: number; gap?: number }> = ({ peaks, n, w, h, color, rest, played = 1, gap = 0.3 }) => {
  const b = bars(peaks, n);
  const step = 100 / n;
  const poly = b.flatMap((v, i) => {
    const x0 = (i * step + (step * gap) / 2).toFixed(2), x1 = ((i + 1) * step - (step * gap) / 2).toFixed(2);
    const y0 = (50 - v * 50).toFixed(2), y1 = (50 + v * 50).toFixed(2);
    // down to the centre line between bars, so the polygon is one closed outline per bar
    return [`${x0}% 50%`, `${x0}% ${y0}%`, `${x1}% ${y0}%`, `${x1}% ${y1}%`, `${x0}% ${y1}%`, `${x0}% 50%`];
  });
  const cut = (clamp01(played) * 100).toFixed(2);
  return (
    <div style={{ width: w, height: h, clipPath: `polygon(${poly.join(",")})`, background: `linear-gradient(90deg, ${color} ${cut}%, ${rest} ${cut}%)` }} />
  );
};

/** Expanding rings: sound made visible. `t` is seconds since the sound was heard. */
export const Ripple: React.FC<{ cx: number; cy: number; t: number; maxR: number; count?: number; everySec?: number; lifeSec?: number; weight?: number; color?: string }> = ({ cx, cy, t, maxR, count = 4, everySec = 0.22, lifeSec = 1.5, weight = 3, color = T.green }) => (
  <>
    {Array.from({ length: count }, (_, k) => {
      const p = prog(t, k * everySec, k * everySec + lifeSec);
      if (p <= 0 || p >= 1) return null;
      const r = easeOutCubic(p) * maxR;
      return (
        <div key={k} style={{
          position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", boxSizing: "border-box",
          border: `${weight}px solid ${color}`, opacity: (1 - p) ** 1.4 * 0.85,
        }} />
      );
    })}
  </>
);

/**
 * One event, and the file the product plays for it: the event's name, what the
 * voice says (voice theme) or the file's name (chime theme), and the file's
 * own waveform filling as it plays. `t` is seconds since its onset was heard.
 */
export const SoundChip: React.FC<{ event: string; theme: Theme; t: number; rect: Rect; label?: string; quiet?: number; always?: boolean }> = ({ event, theme, t, rect, label, quiet = 0, always = false }) => {
  if (t < -0.02 && !always) return null;
  const e = eventByName(event);
  const s = soundOf(event, theme);
  const onset = filmSound(event, theme).onsetSec;
  const played = (t + onset) / s.durationSec;
  const playing = t >= 0 && played < 1;
  const inn = t < 0 ? 1 : easeOutBack(prog(t, 0, 0.32));
  const u = rect.h / 100; // the chip's own unit
  const dim = 1 - quiet * 0.6;
  const voiced = !!label || theme === "default";
  return (
    <div style={{
      position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: "border-box", borderRadius: 16 * u,
      background: T.card, border: `${Math.max(1.5, 1.6 * u)}px solid ${playing ? T.greenLine : T.cardLine}`,
      boxShadow: `0 ${10 * u}px ${34 * u}px rgba(0,0,0,0.55)${playing ? `, 0 0 ${26 * u}px rgba(22,248,0,0.18)` : ""}`,
      transform: `scale(${0.9 + 0.1 * inn})`, opacity: 0.6 + 0.4 * clamp01(inn),
      display: "flex", alignItems: "center", gap: 14 * u, padding: `0 ${18 * u}px`,
    }}>
      <div style={{ flex: "none", width: 44 * u, height: 44 * u, borderRadius: "50%", opacity: dim, background: playing ? T.green : "#2b3140", boxShadow: playing ? `0 0 0 ${(4 + 5 * Math.abs(Math.sin(t * 9))) * u}px ${T.greenDim}` : undefined, position: "relative" }}>
        <div style={{ position: "absolute", left: 13 * u, top: 15 * u, width: 8 * u, height: 14 * u, background: T.card, borderRadius: 1.5 * u }} />
        <div style={{ position: "absolute", left: 17 * u, top: 11 * u, width: 14 * u, height: 22 * u, background: T.card, clipPath: "polygon(0 35%, 100% 0, 100% 100%, 0 65%)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 * u, opacity: dim }}>
        <div style={{ fontFamily: FILM_FONT.mono, fontSize: 14.5 * u, color: T.green, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{e.name}</div>
        <div style={{ fontFamily: voiced ? FILM_FONT.voice : FILM_FONT.mono, fontSize: (voiced ? 23.5 : 15.5) * u, fontWeight: 700, color: T.white, whiteSpace: "nowrap", lineHeight: voiced ? 1.12 : 1.5 }}>
          {label ?? (theme === "default" ? `“${e.voiceText}”` : s.file)}
        </div>
        <div style={{ fontFamily: FILM_FONT.mono, fontSize: 12.5 * u, color: "#8791a3", whiteSpace: "nowrap" }}>{label || theme !== "default" ? `${s.durationSec.toFixed(1)} s` : `${s.file} · ${s.durationSec.toFixed(1)} s`}</div>
      </div>
      <div style={{ flex: "none", opacity: dim }}>
        <Waveform peaks={s.peaks} n={32} w={132 * u} h={56 * u} color={T.green} rest="#3a4252" played={t < 0 ? 0 : played} />
      </div>
    </div>
  );
};

/** How the wall is laid out in a rect: columns, and the tile box. */
export const wallGrid = (rect: Rect, cols: number, n = EVENTS.length): { cols: number; rows: number; tw: number; th: number; gap: number } => {
  const rows = Math.ceil(n / cols);
  const gap = Math.round(rect.w * 0.0045) + 3;
  return { cols, rows, gap, tw: (rect.w - gap * (cols - 1)) / cols, th: (rect.h - gap * (rows - 1)) / rows };
};

export const tileRect = (rect: Rect, cols: number, index: number): Rect => {
  const g = wallGrid(rect, cols);
  return { x: rect.x + (index % cols) * (g.tw + g.gap), y: rect.y + Math.floor(index / cols) * (g.th + g.gap), w: g.tw, h: g.th };
};

const Tile: React.FC<{ e: ProductEvent; r: Rect; a: number; picked: number }> = ({ e, r, a, picked }) => {
  const lit = isLit(e);
  const s = soundOf(e.name, "default");
  const on = lit || picked > 0;
  const fs = Math.min(r.h * 0.15, r.w * 0.084);
  return (
    <div style={{
      position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: "border-box", borderRadius: r.h * 0.12, overflow: "hidden",
      background: lit ? "#0e1a10" : "#10131a", border: `${on ? 2 : 1}px solid ${on ? T.green : "#232936"}`,
      boxShadow: lit ? "0 0 18px rgba(22,248,0,0.28)" : picked > 0 ? `0 0 ${22 * picked}px rgba(22,248,0,0.45)` : undefined,
      opacity: a, transform: `translateY(${(1 - a) * 14}px) scale(${1 + picked * 0.06})`,
      padding: `${r.h * 0.1}px ${r.w * 0.06}px`, display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div style={{ fontFamily: FILM_FONT.mono, fontSize: fs, lineHeight: 1.12, color: on ? T.green : "#9aa3b2", overflowWrap: "break-word", maxHeight: fs * 3.4, overflow: "hidden" }}>{e.name.replace(/_/g, "_​")}</div>
      <Waveform peaks={s.peaks} n={24} w={r.w * 0.88 - 2} h={r.h * 0.3} color={on ? T.green : "#566073"} rest={on ? T.green : "#566073"} gap={0.36} />
    </div>
  );
};

/**
 * The wall: one tile per event and per variant the product has, each with its
 * name and its own file's waveform. The canonical events that sound with no
 * configuration are lit. `t` is seconds since the wall arrived.
 */
export const SoundWall: React.FC<{ rect: Rect; cols: number; t: number; pick?: { event: string; t: number } }> = ({ rect, cols, t, pick }) => (
  <>
    {EVENTS.map((e, i) => {
      const r = tileRect(rect, cols, i);
      // a cascade, corner to corner, with a floor so the first frame is already a wall
      const delay = ((i % cols) + Math.floor(i / cols)) * 0.028;
      const a = 0.45 + 0.55 * easeOutCubic(prog(t, delay, delay + 0.35));
      const picked = pick && pick.event === e.name && pick.t >= 0 ? Math.max(0.35, 1 - prog(pick.t, 0.9, 1.6)) : 0;
      return <Tile key={e.name} e={e} r={r} a={a} picked={picked} />;
    })}
  </>
);

/** The theme switch: a track and a knob. `p` 0 = the voice theme, 1 = chimes. */
export const ThemeToggle: React.FC<{ rect: Rect; p: number }> = ({ rect, p }) => {
  const knob = rect.h * 0.78;
  const x = (rect.h - knob) / 2 + clamp01(p) * (rect.w - rect.h);
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.h, background: "#1a1e27", boxShadow: `inset 0 0 0 2px ${T.greenLine}` }}>
      <div style={{ position: "absolute", left: x, top: (rect.h - knob) / 2, width: knob, height: knob, borderRadius: "50%", background: T.green, boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }} />
    </div>
  );
};
