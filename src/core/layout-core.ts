/**
 * The deliverables table and the per-aspect layout. React-free, so the gates
 * can execute it in Node.
 */

export const FPS = 30;

export type CutId = "15" | "30" | "60";
export const CUT_IDS: readonly CutId[] = ["15", "30", "60"];
export const CUT_SECONDS: Readonly<Record<CutId, number>> = { "15": 15, "30": 30, "60": 60 };

export type Aspect = "landscape" | "portrait";
export const SHAPES: Readonly<Record<Aspect, { width: number; height: number }>> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

export interface Deliverable { id: string; cut: CutId; aspect: Aspect; width: number; height: number; file: string }

export const DELIVERABLES: readonly Deliverable[] = CUT_IDS.flatMap((cut) =>
  (Object.keys(SHAPES) as Aspect[]).map((aspect) => {
    const { width, height } = SHAPES[aspect];
    return {
      id: `Echook-${cut}-${aspect === "landscape" ? "Landscape" : "Vertical"}`,
      cut, aspect, width, height,
      file: `echook_${cut}s_${aspect === "landscape" ? "landscape" : "vertical"}_${width}x${height}.mp4`,
    };
  }),
);

export interface Rect { x: number; y: number; w: number; h: number }

/** Where a sentence may be set. Reels / Shorts / TikTok cover the top and bottom bands in 9:16. */
export const SAFE_MARGINS: Readonly<Record<Aspect, { top: number; bottom: number; side: number }>> = {
  landscape: { top: 80, bottom: 88, side: 128 },
  portrait: { top: 250, bottom: 390, side: 92 },
};

/** Which baked status-line width each aspect's terminal uses (product.generated.json renders[].width). */
export const STATUS_WIDTH: Readonly<Record<Aspect, "medium" | "narrow">> = { landscape: "medium", portrait: "narrow" };

export interface Layout {
  width: number;
  height: number;
  aspect: Aspect;
  wide: boolean;
  /** type-safe area */
  safe: Rect;
  /** the floating terminal window: the picture's margins are deliberately not the type's */
  window: Rect;
  /** where the painted monitor's screen lands when the HOOK push arrives */
  monitor: Rect;
  /** the caption block (film voice) */
  caption: Rect;
  captionSize: number;
  /** the honesty line (C6): inside the safe frame in both aspects */
  honesty: Rect;
  honestySize: number;
  /** everything between caption and honesty that a full-frame subject (wall, cards) may use */
  stage: Rect;
}

export const deriveLayout = (width: number, height: number): Layout => {
  const aspect: Aspect = width >= height ? "landscape" : "portrait";
  const m = SAFE_MARGINS[aspect];
  const safe: Rect = { x: m.side, y: m.top, w: width - 2 * m.side, h: height - m.top - m.bottom };
  const safeBottom = safe.y + safe.h;
  if (aspect === "landscape") {
    // the subject on top, one caption line under it, the honesty line under that
    const honesty: Rect = { x: safe.x, y: safeBottom - 38, w: safe.w, h: 38 };
    const caption: Rect = { x: safe.x, y: 858, w: safe.w, h: 88 };
    const window: Rect = { x: 80, y: 40, w: 1760, h: 800 };
    const monitor: Rect = { x: 288, y: 14, w: 1344, h: 840 };
    const stage: Rect = { x: 80, y: 40, w: 1760, h: 800 };
    return { width, height, aspect, wide: true, safe, window, monitor, caption, captionSize: 54, honesty, honestySize: 23, stage };
  }
  // caption on top (under the platform's own header), the subject under it, the honesty line last
  const caption: Rect = { x: safe.x, y: safe.y + 6, w: safe.w, h: 186 };
  const honesty: Rect = { x: safe.x, y: safeBottom - 78, w: safe.w, h: 78 };
  const top = caption.y + caption.h + 22;
  const window: Rect = { x: 40, y: top, w: 1000, h: honesty.y - 20 - top };
  const monitor: Rect = { x: 16, y: top + 90, w: 1048, h: 655 };
  const stage: Rect = { x: 40, y: top, w: 1000, h: honesty.y - 20 - top };
  return { width, height, aspect, wide: false, safe, window, monitor, caption, captionSize: 62, honesty, honestySize: 27, stage };
};
