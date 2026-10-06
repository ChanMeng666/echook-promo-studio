import React from "react";

import { clamp01, easeOutBack, prog } from "../core/ease";
import type { Rect } from "../core/layout-core";
import { FILM_FONT } from "../fonts";
import { DEMO } from "./demo";
import { toastOf, webhookOf } from "./product";
import { T } from "./tokens";

/** A bell made of two rounded boxes: a generic "notification" glyph, nobody's mark. */
const Bell: React.FC<{ size: number; color: string; on: string }> = ({ size, color, on }) => (
  <div style={{ flex: "none", width: size, height: size, borderRadius: size * 0.26, background: color, position: "relative" }}>
    <div style={{ position: "absolute", left: size * 0.3, top: size * 0.24, width: size * 0.4, height: size * 0.4, borderRadius: `${size * 0.2}px ${size * 0.2}px 0 0`, background: on }} />
    <div style={{ position: "absolute", left: size * 0.22, top: size * 0.62, width: size * 0.56, height: size * 0.08, borderRadius: size, background: on }} />
    <div style={{ position: "absolute", left: size * 0.44, top: size * 0.73, width: size * 0.12, height: size * 0.08, borderRadius: size, background: on }} />
  </div>
);

/** A generic desktop toast carrying the title and body the product's runner sends for this event. */
export const Toast: React.FC<{ event: string; rect: Rect; t: number }> = ({ event, rect, t }) => {
  const toast = toastOf(event);
  const inn = easeOutBack(prog(t, 0, 0.36));
  const u = rect.h / 100;
  return (
    <div style={{
      position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: "border-box", borderRadius: 14 * u,
      background: "#20242d", border: "1px solid #3a4150", boxShadow: `0 ${14 * u}px ${40 * u}px rgba(0,0,0,0.6)`,
      transform: `translateX(${(1 - clamp01(inn)) * 60 * u}px)`, opacity: 0.55 + 0.45 * clamp01(inn),
      display: "flex", alignItems: "center", gap: 14 * u, padding: `0 ${18 * u}px`,
    }}>
      <Bell size={46 * u} color={T.green} on="#0b0d0c" />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 * u }}>
        <div style={{ fontFamily: FILM_FONT.voice, fontSize: 21 * u, fontWeight: 700, color: T.white, whiteSpace: "nowrap" }}>{toast.title}</div>
        <div style={{ fontFamily: FILM_FONT.voice, fontSize: 18.5 * u, fontWeight: 500, color: "#c3c9d4", whiteSpace: "nowrap" }}>{toast.body}</div>
      </div>
    </div>
  );
};

/** Somebody else's window: a document, as grey bars. It carries no claim, so it is stylised, and blurred. */
export const OtherApp: React.FC<{ rect: Rect }> = ({ rect }) => {
  const u = rect.w / 100;
  const rows = [62, 88, 80, 91, 54, 0, 84, 90, 71, 86, 40];
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 2.2 * u, overflow: "hidden", background: "#e9e6df" }}>
      <div style={{ height: 6 * u, background: "#d3cfc6", display: "flex", alignItems: "center", padding: `0 ${2.4 * u}px`, gap: 1.2 * u }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ width: 1.5 * u, height: 1.5 * u, borderRadius: u, background: "#b3aea3" }} />)}
      </div>
      <div style={{ padding: `${5 * u}px ${8 * u}px`, filter: `blur(${0.35 * u}px)` }}>
        <div style={{ fontFamily: FILM_FONT.voice, fontWeight: 700, fontSize: 5.4 * u, color: "#5d584e", marginBottom: 4 * u }}>{DEMO.otherAppTitle}</div>
        {rows.map((w, i) => <div key={i} style={{ height: 2.1 * u, width: `${w}%`, marginBottom: 2.6 * u, borderRadius: u, background: "#c4bfb4" }} />)}
      </div>
    </div>
  );
};

/**
 * A generic phone lock screen with one notification: the title and body the
 * product's webhook sends in its ntfy format, and the schema of its raw one.
 */
export const Phone: React.FC<{ event: string; rect: Rect; t: number }> = ({ event, rect, t }) => {
  const ntfy = webhookOf(event, "ntfy");
  const rawHook = webhookOf(event, "raw");
  const title = (ntfy.headers as { Title?: string }).Title ?? "";
  const body = String(ntfy.payload);
  const schema = (rawHook.payload as { schema: string }).schema;
  const u = rect.w / 100;
  const inn = easeOutBack(prog(t, 0, 0.4));
  const lit = clamp01(prog(t, -0.1, 0.25));
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: "border-box", borderRadius: 13 * u, background: "#07080b", border: `${1.2 * u}px solid #2c313c`, padding: 2.4 * u, boxShadow: "0 30px 70px rgba(0,0,0,0.6)" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 10.5 * u, overflow: "hidden", position: "relative", background: `linear-gradient(165deg, #2a2a5c 0%, #4b3a6e 45%, #b0694a ${(96 - lit * 6).toFixed(1)}%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `rgba(4,5,10,${(0.55 - lit * 0.4).toFixed(3)})` }} />
        <div style={{ position: "absolute", left: "36%", top: 3 * u, width: "28%", height: 4.2 * u, borderRadius: 3 * u, background: "#07080b" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 15 * u, textAlign: "center", fontFamily: FILM_FONT.voice, color: T.white }}>
          <div style={{ fontSize: 5.6 * u, fontWeight: 500, opacity: 0.85 }}>{DEMO.phoneDay}</div>
          <div style={{ fontSize: 27 * u, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{DEMO.phoneClock}</div>
        </div>
        <div style={{
          position: "absolute", left: 4 * u, right: 4 * u, top: 62 * u, boxSizing: "border-box", borderRadius: 5.5 * u, padding: `${4.2 * u}px ${4.6 * u}px`,
          background: "rgba(246,244,238,0.94)", boxShadow: `0 ${3 * u}px ${9 * u}px rgba(0,0,0,0.35)`,
          transform: `translateY(${(1 - clamp01(inn)) * 14 * u}px) scale(${0.94 + 0.06 * clamp01(inn)})`, opacity: 0.5 + 0.5 * clamp01(inn),
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2.6 * u, marginBottom: 2 * u }}>
            <Bell size={8.5 * u} color="#11141a" on={T.green} />
            <div style={{ fontFamily: FILM_FONT.voice, fontSize: 5.9 * u, fontWeight: 700, color: "#15171c", whiteSpace: "nowrap" }}>{title}</div>
          </div>
          <div style={{ fontFamily: FILM_FONT.voice, fontSize: 5.7 * u, fontWeight: 500, color: "#2a2d35", lineHeight: 1.24 }}>{body}</div>
          <div style={{ fontFamily: FILM_FONT.mono, fontSize: 3.9 * u, color: "#6c7280", marginTop: 2.4 * u, whiteSpace: "nowrap" }}>{schema}</div>
        </div>
      </div>
    </div>
  );
};
