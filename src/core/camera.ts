/**
 * The camera over a painted plate. React-free.
 *
 * A view is `translate(tx, ty) scale(s)` from plate pixels to frame pixels:
 * never scale-about-a-focus, which magnifies and does not aim. Views are
 * solved from rectangles ("this plate rect lands on that frame rect") and
 * interpolated between two solved ends, scale on a log axis.
 */

import type { Rect } from "./layout-core";

export interface View { s: number; tx: number; ty: number }
export interface Size { width: number; height: number }

/** The plate covering the frame, centred, optionally pushed a little past cover. */
export const coverView = (plate: Size, frame: Size, zoom = 1): View => {
  const s = Math.max(frame.width / plate.width, frame.height / plate.height) * zoom;
  return { s, tx: (frame.width - plate.width * s) / 2, ty: (frame.height - plate.height * s) / 2 };
};

/** The view that puts plate rect `src` on frame rect `dst` (matched on width, centred on height). */
export const rectView = (src: Rect, dst: Rect): View => {
  const s = dst.w / src.w;
  return { s, tx: dst.x - src.x * s, ty: dst.y + dst.h / 2 - (src.y + src.h / 2) * s };
};

/** Coverage: never expose what is behind the plate. Aim gives way to it. */
export const clampCover = (v: View, plate: Size, frame: Size): View => {
  const s = Math.max(v.s, frame.width / plate.width, frame.height / plate.height);
  const clamp = (t: number, lo: number): number => Math.min(0, Math.max(lo, t));
  return { s, tx: clamp(v.tx, frame.width - plate.width * s), ty: clamp(v.ty, frame.height - plate.height * s) };
};

/** Between two solved views: scale on a log axis, the frame centre's plate point linearly. */
export const lerpView = (a: View, b: View, p: number, frame: Size): View => {
  const s = a.s * (b.s / a.s) ** p;
  const cx = (frame.width / 2 - a.tx) / a.s + ((frame.width / 2 - b.tx) / b.s - (frame.width / 2 - a.tx) / a.s) * p;
  const cy = (frame.height / 2 - a.ty) / a.s + ((frame.height / 2 - b.ty) / b.s - (frame.height / 2 - a.ty) / a.s) * p;
  return { s, tx: frame.width / 2 - cx * s, ty: frame.height / 2 - cy * s };
};

export const applyView = (v: View, r: Rect): Rect => ({ x: r.x * v.s + v.tx, y: r.y * v.s + v.ty, w: r.w * v.s, h: r.h * v.s });

/** The depth the plate's subject sits at: a layer at this depth follows the view exactly. */
export const REF_DEPTH = 0.6;
const PARALLAX = 0.3;
const DOLLY = 0.08;

/**
 * One layer's own view. Layers nearer than the subject travel and grow a
 * little more than it, farther ones a little less: that is all parallax is.
 * `sway` is a slow ambient drift in frame px at depth 1.
 */
export const layerView = (v: View, depth: number, plate: Size, frame: Size, sway = { x: 0, y: 0 }): View => {
  const rest = coverView(plate, frame);
  const d = depth - REF_DEPTH;
  const cx = (frame.width / 2 - v.tx) / v.s - plate.width / 2;
  const cy = (frame.height / 2 - v.ty) / v.s - plate.height / 2;
  const k = 1 + d * DOLLY * Math.log(v.s / rest.s);
  const s = v.s * k;
  // scale about the frame centre, then shift by depth
  const tx = frame.width / 2 - (frame.width / 2 - v.tx) * k - d * PARALLAX * cx * v.s + sway.x * depth;
  const ty = frame.height / 2 - (frame.height / 2 - v.ty) * k - d * PARALLAX * cy * v.s + sway.y * depth;
  return { s, tx, ty };
};
