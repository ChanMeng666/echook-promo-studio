import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";

import { applyView, clampCover, coverView, lerpView, rectView, type Size, type View } from "../core/camera";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, prog } from "../core/ease";
import { STATUS_WIDTH, type CutId, type Layout, type Rect } from "../core/layout-core";
import { COPY, LABEL, countParts, type CopyLine } from "../copy";
import art from "../data/art.json";
import { FILM_FONT } from "../fonts";
import { Phone, OtherApp, Toast } from "../replica/Channels";
import { COUNTS, EVENTS, PRODUCT_NAME, PRODUCT_URL, statusRender, statusSegment, type StatusState } from "../replica/product";
import { AWAY, CHANNELS, END, EVENTS_PLAY, HOOK, STATUSLINE, TALK, THEMES, terminalAt, type TermScript } from "../replica/screenplays";
import { Ripple, SoundChip, SoundWall, ThemeToggle, tileRect } from "../replica/Sound";
import { StatusLine, Terminal } from "../replica/Terminal";
import { MONO_ADVANCE, T } from "../replica/tokens";
import { Painted, plateFor } from "./Painted";
import { Arrive, Captions, Honesty, Lines, Rise } from "./Type";

export interface SceneProps {
  cut: CutId;
  /** seconds since the beat began, and the beat's length */
  t: number;
  dur: number;
  layout: Layout;
}

const sizeOf = (l: Layout): Size => ({ width: l.width, height: l.height });
const COLS = { medium: 110, narrow: 58 } as const;
const colsOf = (l: Layout): number => COLS[STATUS_WIDTH[l.aspect]];

/** The two ends of the desk camera: the whole desk, and the monitor as the subject. */
const deskViews = (layout: Layout): { wide: View; near: View } => {
  const plate = plateFor("desk", layout);
  const frame = sizeOf(layout);
  return { wide: coverView(plate, frame, 1.05), near: clampCover(rectView(plate.screenRect!, layout.monitor), plate, frame) };
};

/** A terminal as the painted monitor's screen. */
const ScreenTerminal: React.FC<{ layout: Layout; view: View; script: TermScript; t: number }> = ({ layout, view, script, t }) => {
  const r = applyView(view, plateFor("desk", layout).screenRect!);
  return <Terminal rect={r} cols={colsOf(layout)} statusWidth={STATUS_WIDTH[layout.aspect]} state={terminalAt(script, t)} chrome={false} radius={r.w * 0.006} shadow={false} />;
};

/** The desk, out of focus and dimmed: the ground a floating terminal sits on. */
const DeskSoft: React.FC<{ layout: Layout; t: number; dark?: number }> = ({ layout, t, dark = 0 }) => (
  <>
    <Painted plate={plateFor("desk", layout)} view={deskViews(layout).near} t={t} frame={sizeOf(layout)} soft={1} />
    {dark > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(8,9,16,${(dark * 0.8).toFixed(3)})` }} /> : null}
  </>
);

const Night: React.FC<{ layout: Layout; t: number }> = ({ layout, t }) => (
  <AbsoluteFill style={{ background: `radial-gradient(120% 90% at ${50 + Math.sin(t * 0.3) * 6}% ${layout.wide ? 30 : 38}%, #1c1b3c 0%, ${T.night} 62%)` }} />
);

const PAPER = art.paper as { file?: string };
const Paper: React.FC<{ layout: Layout; t: number }> = ({ layout, t }) => {
  const size = Math.max(layout.width, layout.height) * 1.12;
  return (
    <AbsoluteFill style={{ backgroundColor: T.paper, overflow: "hidden" }}>
      {PAPER.file ? <Img src={staticFile(PAPER.file)} style={{ position: "absolute", width: size, height: size, left: (layout.width - size) / 2 + Math.sin(t * 0.25) * 14, top: (layout.height - size) / 2 + Math.cos(t * 0.2) * 9 }} /> : null}
    </AbsoluteFill>
  );
};

// ── HOOK ────────────────────────────────────────────────────────────────────

export const HookScene: React.FC<SceneProps> = ({ cut, t, dur, layout }) => {
  const play = HOOK[cut];
  const { wide, near } = deskViews(layout);
  const view = lerpView(wide, near, easeInOutCubic(prog(t, 0, dur * 0.96)), sizeOf(layout));
  return (
    <AbsoluteFill>
      <Painted plate={plateFor("desk", layout)} view={view} t={t} frame={sizeOf(layout)} />
      <ScreenTerminal layout={layout} view={view} script={play.term} t={t} />
      <Captions marks={play.captions} t={t} layout={layout} size={layout.captionSize * 1.12} />
    </AbsoluteFill>
  );
};

// ── AWAY ────────────────────────────────────────────────────────────────────

export const AwayScene: React.FC<SceneProps> = ({ cut, t, dur, layout }) => {
  const play = AWAY[cut];
  const frame = sizeOf(layout);
  const W = layout.width;
  const p = easeInOutCubic(prog(t, 0, play.travelSec));
  const span = W * 1.07; // the two rooms, and the wall between them
  const desk = deskViews(layout).near;
  const plate = plateFor("away", layout);
  const settle = easeOutCubic(prog(t, 0, dur));
  // the camera is still moving a little as it lands, then drifts in
  const base = coverView(plate, frame, 1.1 + 0.035 * settle);
  const view = clampCover({ ...base, tx: base.tx + (1 - p) * W * 0.03 }, plate, frame);
  const since = t - play.soundAt;
  const wall = applyView(coverView(plate, frame, 1.1), plate.captionRect!);
  const size = layout.wide ? 98 : 92;
  const box: Rect = layout.wide
    ? { x: Math.max(layout.safe.x, wall.x), y: wall.y + 40, w: wall.w, h: size * 2.6 }
    : { x: layout.safe.x, y: Math.max(layout.safe.y + 10, wall.y), w: layout.safe.w, h: size * 2.6 };
  const chip: Rect = layout.wide ? { x: box.x, y: box.y + box.h + 28, w: 600, h: 118 } : { x: layout.safe.x + 28, y: box.y + box.h + 30, w: layout.safe.w - 56, h: 150 };
  const mark = play.captions[0];
  return (
    <AbsoluteFill style={{ backgroundColor: "#0c0b17" }}>
      {p < 1 ? (
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${(-p * span).toFixed(2)}px)` }}>
          <Painted plate={plateFor("desk", layout)} view={{ ...desk, tx: desk.tx - p * W * 0.03 }} t={t} frame={frame} />
          <ScreenTerminal layout={layout} view={{ ...desk, tx: desk.tx - p * W * 0.03 }} script={HOOK[cut].term} t={1e6} />
        </div>
      ) : null}
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${((1 - p) * span).toFixed(2)}px)` }}>
        <Painted plate={plate} view={view} t={t} frame={frame} />
        {/* the wall the words sit on, a shade darker so they hold */}
        <div style={{ position: "absolute", left: box.x - 140, top: box.y - 120, width: box.w + 280, height: box.h + 420, background: "radial-gradient(closest-side, rgba(20,14,22,0.5), rgba(20,14,22,0))", opacity: clamp01(prog(since, -0.2, 0.5)) }} />
        {/* the sound arrives from the room we left */}
        <Ripple cx={-W * 0.06} cy={layout.height * (layout.wide ? 0.46 : 0.42)} t={since} maxR={Math.hypot(layout.width, layout.height) * 0.82} count={5} everySec={0.2} lifeSec={1.7} weight={layout.wide ? 4 : 5} />
        {t >= mark.from ? <Lines copy={mark.copy} layout={layout} box={box} size={size} sec={t - mark.from} align={layout.wide ? "left" : "center"} shadow="0 3px 22px rgba(10,6,14,0.6)" /> : null}
        <SoundChip event={play.sounds[0].event} theme={play.sounds[0].theme} t={since} rect={chip} />
      </div>
    </AbsoluteFill>
  );
};

// ── EVENTS ──────────────────────────────────────────────────────────────────

const CountLine: React.FC<{ layout: Layout; sec: number }> = ({ layout, sec }) => {
  const parts = countParts(COUNTS);
  const rows = layout.wide ? [parts.join(" · ")] : [parts.slice(0, 2).join(" · "), parts[2]];
  const digits = (w: string): string | undefined => (/^\d+$/.test(w) ? T.green : undefined);
  return (
    <div style={{ position: "absolute", left: layout.caption.x, top: layout.caption.y, width: layout.caption.w, height: layout.caption.h, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {rows.map((r, i) => <Rise key={i} text={r} size={layout.captionSize} sec={sec - i * 0.1} color={T.white} accent={digits} floor={sec < 0.01} />)}
    </div>
  );
};

export const EventsScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = EVENTS_PLAY[cut];
  const toWall = play.wallAt <= play.wallFrom ? 1 : easeInOutCubic(prog(t, play.wallFrom, play.wallAt));
  const wide = layout.wide;
  const slot = 150;
  const term: Rect = wide ? layout.window : { ...layout.window, y: layout.window.y + slot + 16, h: layout.window.h - slot - 16 };
  const chipRect = (i: number): Rect => wide
    ? { x: term.x + term.w - 600 - 34, y: term.y + 76 + i * 128, w: 600, h: 114 }
    : { x: layout.window.x, y: layout.window.y, w: layout.window.w, h: slot };
  const wallCols = wide ? 11 : 6;
  const pick = play.pick;
  const pickIndex = pick ? EVENTS.findIndex((e) => e.name === pick.event) : -1;
  const pickTile = pickIndex >= 0 ? tileRect(layout.stage, wallCols, pickIndex) : null;
  const pickChip: Rect = wide
    ? { x: layout.stage.x + (layout.stage.w - 720) / 2, y: layout.stage.y + layout.stage.h * 0.36, w: 720, h: 132 }
    : { x: layout.stage.x + 30, y: layout.stage.y + layout.stage.h * 0.34, w: layout.stage.w - 60, h: 160 };
  return (
    <AbsoluteFill>
      <DeskSoft layout={layout} t={t} dark={toWall} />
      <Arrive sec={t}>
        {toWall < 1 ? (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - toWall, transform: `scale(${(1 - 0.12 * toWall).toFixed(4)})`, transformOrigin: "50% 42%" }}>
            <Terminal rect={term} cols={colsOf(layout)} statusWidth={STATUS_WIDTH[layout.aspect]} state={terminalAt(play.term, t)} />
            {play.fires.map((f, i) => {
              const since = t - f.at;
              const next = play.fires[i + 1];
              // in 9:16 there is one slot: a chip leaves when the next one fires
              if (!wide && next && t >= next.at) return null;
              return <SoundChip key={f.event} event={f.event} theme={f.theme} t={since} rect={chipRect(i)} quiet={next && t >= next.at ? 1 : 0} />;
            })}
          </div>
        ) : null}
        {toWall > 0 ? (
          <div style={{ position: "absolute", inset: 0, opacity: toWall }}>
            <SoundWall rect={layout.stage} cols={wallCols} t={t - play.wallAt + 0.25} pick={pick ? { event: pick.event, t: t - pick.at } : undefined} />
            {pick && pickTile ? (
              <>
                <Ripple cx={pickTile.x + pickTile.w / 2} cy={pickTile.y + pickTile.h / 2} t={t - pick.at} maxR={layout.width * 0.3} count={3} lifeSec={1.1} />
                <SoundChip event={pick.event} theme={pick.theme} t={t - pick.at} rect={pickChip} />
              </>
            ) : null}
          </div>
        ) : null}
      </Arrive>
      <Captions marks={play.captions} t={t} layout={layout} />
      {t >= play.countFrom && toWall > 0.5 ? <CountLine layout={layout} sec={t - play.countFrom - 0.15} /> : null}
      {t >= play.honesty.from && t < play.honesty.to ? <Honesty layout={layout} /> : null}
    </AbsoluteFill>
  );
};

// ── THEMES ──────────────────────────────────────────────────────────────────

export const ThemesScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = THEMES[cut];
  const wide = layout.wide;
  const s = layout.stage;
  const p = easeInOutCubic(prog(t, play.toggleAt - 0.14, play.toggleAt + 0.14));
  const tog: Rect = { x: s.x + s.w / 2 - 130, y: s.y + (wide ? 130 : 200), w: 260, h: 108 };
  const cw = wide ? 830 : s.w - 40, ch = wide ? 190 : 200;
  const chipA: Rect = wide ? { x: s.x + s.w / 2 - cw - 22, y: s.y + 400, w: cw, h: ch } : { x: s.x + 20, y: s.y + 440, w: cw, h: ch };
  const chipB: Rect = wide ? { x: s.x + s.w / 2 + 22, y: s.y + 400, w: cw, h: ch } : { x: s.x + 20, y: s.y + 440 + ch + 40, w: cw, h: ch };
  const label = (text: string, on: number, left: boolean): React.ReactNode => (
    <div style={{
      position: "absolute", top: tog.y, height: tog.h, display: "flex", alignItems: "center", fontFamily: FILM_FONT.voice, fontWeight: 700, fontSize: wide ? 92 : 76, letterSpacing: "-0.02em",
      color: T.ink, opacity: 0.38 + 0.62 * on, ...(left ? { right: layout.width - tog.x + 40 } : { left: tog.x + tog.w + 40 }),
    }}>{text}</div>
  );
  return (
    <AbsoluteFill>
      <Paper layout={layout} t={t} />
      <Arrive sec={t}>
        {label(LABEL.themeVoice, 1 - p, true)}
        <ThemeToggle rect={tog} p={p} />
        {label(LABEL.themeChimes, p, false)}
        <SoundChip event={play.event} theme="default" t={t - play.voiceAt} rect={chipA} quiet={p} always />
        <SoundChip event={play.event} theme="custom" t={t - play.chimeAt} rect={chipB} quiet={1 - p} always />
      </Arrive>
      <Captions marks={play.captions} t={t} layout={layout} color={T.ink} scrim={null} />
    </AbsoluteFill>
  );
};

// ── CHANNELS ────────────────────────────────────────────────────────────────

const Panel: React.FC<{ rect: Rect; since: number; children: React.ReactNode; label: CopyLine; layout: Layout; illus: Rect; first?: boolean }> = ({ rect, since, children, label, layout, illus, first }) => {
  if (since < 0) return null;
  const a = first ? 1 : easeOutBack(prog(since, 0, 0.4));
  const wide = layout.wide;
  const size = wide ? 46 : 62;
  return (
    <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 26, background: "#12141c", border: "1px solid #272c39", overflow: "hidden", transform: `translateY(${((1 - clamp01(a)) * 30).toFixed(2)}px) scale(${(0.95 + 0.05 * clamp01(a)).toFixed(4)})`, opacity: 0.5 + 0.5 * clamp01(a), boxShadow: "0 30px 80px -30px rgba(0,0,0,0.7)" }}>
      <div style={{ position: "absolute", left: illus.x, top: illus.y, width: illus.w, height: illus.h, overflow: "hidden", borderRadius: 18 }}>{children}</div>
      <Lines copy={label} layout={layout} size={size} sec={since - 0.08} floor={first}
        align={wide ? "center" : "left"}
        box={wide ? { x: 0, y: illus.y + illus.h, w: rect.w, h: rect.h - illus.y - illus.h } : { x: illus.x + illus.w + 36, y: 0, w: rect.w - illus.w - illus.x - 36, h: rect.h }} />
    </div>
  );
};

export const ChannelsScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = CHANNELS[cut];
  const wide = layout.wide;
  const s = layout.stage;
  const gap = wide ? 36 : 22;
  const top = layout.safe.y + 14;
  const heights = wide ? [0, 0, 0] : [0.27, 0.27, 0.46].map((k) => (layout.safe.y + layout.safe.h - top - 2 * gap) * k);
  const pw = wide ? (s.w - 2 * gap) / 3 : s.w;
  const ph = wide ? 920 : 0;
  const rects: Rect[] = wide
    ? [0, 1, 2].map((i) => ({ x: s.x + i * (pw + gap), y: 62, w: pw, h: ph }))
    : [0, 1, 2].map((i) => ({ x: s.x, y: top + heights.slice(0, i).reduce((a, b) => a + b + gap, 0), w: pw, h: heights[i] }));
  const illus = (r: Rect): Rect => wide ? { x: 14, y: 14, w: r.w - 28, h: r.h - 28 - 110 } : { x: 12, y: 12, w: 540, h: r.h - 24 };
  const il = rects.map(illus);
  // the desk, small: the same painting, framed on the monitor and the lamp
  const plate = plateFor("desk", layout);
  const sr = plate.screenRect!;
  const dFrame: Size = { width: il[0].w, height: il[0].h };
  const dView = clampCover(rectView({ x: sr.x - sr.w * (wide ? 0.3 : 0.16), y: sr.y, w: sr.w * (wide ? 1.5 : 1.6), h: sr.h }, { x: 0, y: wide ? -30 : 10, w: dFrame.width, h: dFrame.height }), plate, dFrame);
  const screen = applyView(dView, sr);
  const sinceSound = t - play.soundAt;
  const away = plateFor("away", layout);
  const pFrame: Size = { width: il[2].w, height: il[2].h };
  const phoneW = wide ? il[2].w * 0.74 : 400;
  return (
    <AbsoluteFill>
      <Night layout={layout} t={t} />
      <Arrive sec={t}>
        <Panel rect={rects[0]} since={t - play.deskAt} label={COPY.channelDesk} layout={layout} illus={il[0]} first>
          <Painted plate={plate} view={dView} t={t} frame={dFrame} />
          <Terminal rect={screen} cols={colsOf(layout)} statusWidth={STATUS_WIDTH[layout.aspect]} state={terminalAt(EVENTS_PLAY["60"].term, 1.2)} chrome={false} radius={3} shadow={false} />
          <Ripple cx={screen.x + screen.w / 2} cy={screen.y + screen.h / 2} t={sinceSound} maxR={dFrame.width * 0.7} count={4} lifeSec={1.6} />
          <SoundChip event={play.event} theme="default" t={sinceSound} rect={wide ? { x: 16, y: dFrame.height - 106, w: dFrame.width - 32, h: 90 } : { x: 10, y: dFrame.height - 86, w: dFrame.width - 20, h: 76 }} />
        </Panel>
        <Panel rect={rects[1]} since={t - play.toastAt} label={COPY.channelWindow} layout={layout} illus={il[1]}>
          <div style={{ position: "absolute", inset: 0, background: "#3b3f4c" }} />
          <OtherApp rect={{ x: il[1].w * 0.06, y: il[1].h * (wide ? 0.2 : 0.12), w: il[1].w * 0.88, h: il[1].h }} />
          <Toast event={play.event} t={t - play.toastAt - 0.25} rect={wide ? { x: 16, y: 26, w: il[1].w - 32, h: 150 } : { x: 14, y: 16, w: il[1].w - 28, h: 124 }} />
        </Panel>
        <Panel rect={rects[2]} since={t - play.phoneAt} label={COPY.channelPhone} layout={layout} illus={il[2]}>
          <Painted plate={away} view={coverView(away, pFrame, 1.05)} t={t} frame={pFrame} soft={0.8} />
          <Phone event="notification_idle_prompt" t={t - play.phoneAt - 0.3} rect={{ x: (il[2].w - phoneW) / 2, y: wide ? 34 : 22, w: phoneW, h: phoneW * 2.05 }} />
        </Panel>
      </Arrive>
    </AbsoluteFill>
  );
};

// ── TALK ────────────────────────────────────────────────────────────────────

export const TalkScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = TALK[cut];
  return (
    <AbsoluteFill>
      <DeskSoft layout={layout} t={t} />
      <Arrive sec={t}>
        <Terminal rect={layout.window} cols={colsOf(layout)} statusWidth={STATUS_WIDTH[layout.aspect]} state={terminalAt(play.term, t)} />
      </Arrive>
      <Captions marks={play.captions} t={t} layout={layout} />
    </AbsoluteFill>
  );
};

// ── STATUSLINE ──────────────────────────────────────────────────────────────

const SEGMENTS = ["Context:", "API Quota:", "Weekly:"] as const;

/** The three segments the scene is about, lifted out of the baked render and set large. */
const Magnifier: React.FC<{ layout: Layout; state: StatusState; rect: Rect; age: number; arrive: number }> = ({ layout, state, rect, age, arrive }) => {
  const render = statusRender(state, STATUS_WIDTH[layout.aspect]);
  const rows = SEGMENTS.map((k) => statusSegment(render, k));
  const cells = Math.max(...rows.map((r) => r.reduce((n, s) => n + [...s.text].length + 1, 0)));
  const f = Math.min((rect.w * 0.9) / cells / MONO_ADVANCE, rect.h / 5.2);
  const a = easeOutCubic(arrive);
  return (
    <div style={{
      position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: "border-box", borderRadius: 22, background: "#0d100f",
      border: `2px solid ${T.greenLine}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.75), 0 0 40px rgba(22,248,0,0.10)", opacity: 0.6 + 0.4 * a, transform: `scale(${(0.94 + 0.06 * a).toFixed(4)})`,
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", paddingLeft: rect.w * 0.05, gap: f * 0.28,
    }}>
      {rows.map((spans, i) => (
        <div key={i} style={{ transform: i === 0 ? `scale(${(1 + 0.05 * Math.max(0, 1 - age / 0.4)).toFixed(4)})` : undefined, transformOrigin: "0 50%" }}>
          <StatusLine render={{ ...render, rows: [spans] }} f={i === 0 ? f : f * (layout.wide ? 0.8 : 0.92)} />
        </div>
      ))}
    </div>
  );
};

export const StatusScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = STATUSLINE[cut];
  const state = terminalAt(play.term, t);
  const arrive = prog(t, 0.05, play.arriveSec);
  const w = layout.window;
  const mag: Rect = layout.wide
    ? { x: w.x + w.w * 0.12, y: w.y + 96, w: w.w * 0.76, h: 330 }
    : { x: w.x + 24, y: w.y + 84, w: w.w - 48, h: 300 };
  return (
    <AbsoluteFill>
      <DeskSoft layout={layout} t={t} />
      <Arrive sec={t}>
        <Terminal rect={w} cols={colsOf(layout)} statusWidth={STATUS_WIDTH[layout.aspect]} state={state} hush={easeOutCubic(arrive)} />
        <Magnifier layout={layout} state={state.status} rect={mag} age={state.statusAge} arrive={cut === "15" ? 1 : arrive} />
      </Arrive>
      <Captions marks={play.captions} t={t} layout={layout} />
    </AbsoluteFill>
  );
};

// ── END ─────────────────────────────────────────────────────────────────────

const Editors: React.FC<{ size: number; color: string; dot: string }> = ({ size, color, dot }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: size * 0.42, fontFamily: FILM_FONT.voice, fontSize: size, fontWeight: 700, color, whiteSpace: "nowrap", letterSpacing: "-0.015em" }}>
    {LABEL.editors.map((e, i) => (
      <React.Fragment key={e}>
        {i > 0 ? <div style={{ width: size * 0.16, height: size * 0.16, borderRadius: size, background: dot }} /> : null}
        <div>{e}</div>
      </React.Fragment>
    ))}
  </div>
);

export const EndScene: React.FC<SceneProps> = ({ cut, t, layout }) => {
  const play = END[cut];
  const wide = layout.wide;
  const since = t - play.cardAt;
  const a = (at: number): number => easeOutCubic(prog(since, at, at + 0.45));
  const k = wide ? 1 : 1.0;
  const mark = Math.max(0.7, easeOutBack(prog(since, 0, 0.5)));
  const logo = (wide ? 210 : 300) * k;
  const urlSize = wide ? 66 : 47;
  const cx = layout.width / 2, cy = wide ? 380 : layout.safe.y + 400;
  return (
    <AbsoluteFill>
      <Night layout={layout} t={t} />
      {since < 0 ? (
        // the three editors, as plain words
        <div style={{ position: "absolute", left: layout.safe.x, width: layout.safe.w, top: layout.safe.y, height: layout.safe.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 26 }}>
          <div style={{ fontFamily: FILM_FONT.voice, fontSize: wide ? 40 : 44, fontWeight: 500, color: "#aab0c0" }}>{LABEL.worksIn}</div>
          {wide ? <Rise text={LABEL.editors.join(" · ")} size={104} sec={t} color={T.white} floor /> : LABEL.editors.map((e, i) => <Rise key={e} text={e} size={112} sec={t - i * 0.12} color={T.white} floor />)}
        </div>
      ) : (
        <>
          <Ripple cx={cx} cy={cy - 70 * k} t={since - 0.05} maxR={layout.width * 0.55} count={3} everySec={0.3} lifeSec={2.4} weight={2} />
          <div style={{ position: "absolute", left: layout.safe.x, width: layout.safe.w, top: wide ? 176 : layout.safe.y + 130, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: wide ? "row" : "column", alignItems: "center", gap: wide ? 34 : 34, transform: `scale(${mark.toFixed(4)})`, opacity: Math.min(1, mark + 0.15) }}>
              {/* the product's own mark, unmodified; its black field is clipped to the disc */}
              <div style={{ width: logo, height: logo, borderRadius: "50%", overflow: "hidden", flex: "none" }}>
                <Img src={staticFile("echook-logo.svg")} style={{ width: logo, height: logo }} />
              </div>
              <div style={{ fontFamily: FILM_FONT.voice, fontSize: 168 * k, fontWeight: 700, color: T.white, letterSpacing: "-0.045em", lineHeight: 1 }}>{PRODUCT_NAME}</div>
            </div>
            <div style={{ marginTop: wide ? 34 : 56, opacity: a(0.2) }}>
              <Rise text={COPY.end.lines[layout.aspect][0]} size={wide ? 62 : 68} sec={since - 0.2} color={T.white} weight={500} />
            </div>
            <div style={{ marginTop: wide ? 56 : 110, padding: `${urlSize * 0.36}px ${urlSize * 0.7}px`, borderRadius: urlSize * 0.5, border: `3px solid ${T.green}`, background: "rgba(22,248,0,0.07)", opacity: 0.4 + 0.6 * a(0.4), transform: `translateY(${((1 - a(0.4)) * 16).toFixed(2)}px)` }}>
              <div style={{ fontFamily: FILM_FONT.mono, fontSize: urlSize, fontWeight: 700, color: T.green, whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>{PRODUCT_URL}</div>
            </div>
            <div style={{ marginTop: wide ? 46 : 100, opacity: a(0.65), display: "flex", flexDirection: wide ? "row" : "column", alignItems: "center", gap: wide ? 34 : 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: FILM_FONT.voice, fontSize: wide ? 30 : 34, fontWeight: 500, color: "#aab0c0", whiteSpace: "nowrap" }}>
                <span>{LABEL.worksIn}</span><Editors size={wide ? 30 : 34} color={T.white} dot="#6d7486" />
              </div>
              {wide ? <div style={{ width: 2, height: 30, background: "#3a4050" }} /> : null}
              <div style={{ fontFamily: FILM_FONT.voice, fontSize: wide ? 30 : 34, fontWeight: 500, color: "#aab0c0", whiteSpace: "nowrap" }}>{LABEL.licence}</div>
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
