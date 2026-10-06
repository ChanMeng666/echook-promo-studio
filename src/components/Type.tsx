import React from "react";

import { easeOutCubic, easeOutExpo, prog } from "../core/ease";
import type { Layout, Rect } from "../core/layout-core";
import { HONESTY_LINES, type CopyLine } from "../copy";
import { FILM_FONT } from "../fonts";
import type { CaptionMark } from "../replica/screenplays";
import { T } from "../replica/tokens";

/** One line rising out of its own clipped band, word by word. `sec` is seconds since the line was due. */
export const Rise: React.FC<{ text: string; size: number; sec: number; color: string; weight?: number; align?: "center" | "left"; floor?: boolean; shadow?: string; accent?: (word: string) => string | undefined }> =
  ({ text, size, sec, color, weight = 700, align = "center", floor = false, shadow, accent }) => {
    const words = text.split(" ");
    return (
      <div style={{ overflow: "hidden", height: size * 1.24, display: "flex", justifyContent: align === "center" ? "center" : "flex-start", whiteSpace: "nowrap" }}>
        {words.map((w, i) => {
          // the first line of a cut starts part-way out of its mask, so frame 0 is a composition
          const base = floor ? 0.9 : 0;
          const p = Math.max(base, easeOutExpo(prog(sec, i * 0.05, i * 0.05 + 0.45)));
          return (
            <span key={i} style={{
              display: "inline-block", fontFamily: FILM_FONT.voice, fontSize: size, fontWeight: weight, color: accent?.(w) ?? color, lineHeight: 1.24,
              letterSpacing: "-0.02em", transform: `translateY(${((1 - p) * size * 1.15).toFixed(2)}px)`, marginRight: i < words.length - 1 ? size * 0.25 : 0, textShadow: shadow,
            }}>{w}</span>
          );
        })}
      </div>
    );
  };

/** A block of film-voice lines in a box. */
export const Lines: React.FC<{ copy: CopyLine; layout: Layout; box: Rect; size: number; sec: number; color?: string; align?: "center" | "left"; floor?: boolean; shadow?: string; opacity?: number; valign?: "center" | "top" }> =
  ({ copy, layout, box, size, sec, color = T.white, align = "center", floor, shadow, opacity = 1, valign = "center" }) => (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: valign === "center" ? "center" : "flex-start", opacity }}>
      {copy.lines[layout.aspect].map((l, i) => <Rise key={i} text={l} size={size} sec={sec - i * 0.1} color={color} align={align} floor={floor} shadow={shadow} />)}
    </div>
  );

/** The caption band: whichever of the beat's captions is due, with a scrim so it holds on any ground. */
export const Captions: React.FC<{ marks: readonly CaptionMark[]; t: number; layout: Layout; color?: string; scrim?: string | null; box?: Rect; size?: number }> =
  ({ marks, t, layout, color = T.white, scrim = "8,9,16", box = layout.caption, size = layout.captionSize }) => {
    const live = marks.filter((m) => t >= m.from && t < m.to);
    return (
      <>
        {scrim ? (
          <div style={{
            position: "absolute", left: 0, width: layout.width,
            ...(layout.wide ? { top: box.y - 70, height: layout.height - box.y + 70 } : { top: 0, height: box.y + box.h + 60 }),
            background: `linear-gradient(${layout.wide ? "180deg" : "0deg"}, rgba(${scrim},0) 0%, rgba(${scrim},0.78) 34%, rgba(${scrim},0.9) 100%)`,
          }} />
        ) : null}
        {live.map((m) => {
          const out = 1 - prog(t, m.to - 0.14, m.to) * 0.75;
          return <Lines key={m.copy.id} copy={m.copy} layout={layout} box={box} size={size} sec={t - m.from} color={color} floor={m.floor} opacity={out} shadow={scrim ? "0 2px 14px rgba(0,0,0,0.5)" : undefined} />;
        })}
      </>
    );
  };

/** The honesty caption (C6): whole, full opacity, inside the safe frame, for as long as its beat says. */
export const Honesty: React.FC<{ layout: Layout; color?: string; plate?: string }> = ({ layout, color = "#e9e6dd", plate = "rgba(8,9,16,0.82)" }) => (
  <div style={{ position: "absolute", left: layout.honesty.x, top: layout.honesty.y, width: layout.honesty.w, height: layout.honesty.h, display: "flex", justifyContent: "center", alignItems: "center" }}>
    <div style={{ padding: `${layout.honestySize * 0.28}px ${layout.honestySize * 0.9}px`, borderRadius: 999, background: plate, textAlign: "center" }}>
      {HONESTY_LINES[layout.aspect].map((l) => (
        <div key={l} style={{ fontFamily: FILM_FONT.voice, fontSize: layout.honestySize, fontWeight: 500, color, lineHeight: 1.28, whiteSpace: "nowrap", letterSpacing: "0.005em" }}>{l}</div>
      ))}
    </div>
  </div>
);

/** A scene that is cut to arrives: a short scale-through, never a translate (that slides captions off the edge). */
export const Arrive: React.FC<{ sec: number; children: React.ReactNode; origin?: string }> = ({ sec, children, origin = "50% 50%" }) => {
  const p = easeOutCubic(prog(sec, 0, 0.3));
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${(1.035 - 0.035 * p).toFixed(5)})`, transformOrigin: origin, opacity: 0.78 + 0.22 * p }}>{children}</div>
  );
};
