import React from "react";
import { Img, staticFile } from "remotion";

import { applyView, layerView, type Size, type View } from "../core/camera";
import type { Layout, Rect } from "../core/layout-core";
import art from "../data/art.json";

export type PlateId = "desk" | "away";

interface PlateLayer { file: string; depth: number; name: string }
export interface Plate {
  width: number; height: number; layers: PlateLayer[];
  screenRect?: Rect; mugRect?: Rect; steamRect?: Rect; captionRect?: Rect;
}

const PLATES = art.plates as unknown as Record<string, Plate>;

/** 9:16 has its own painting of each place, not a crop of the 16:9 one. */
export const plateFor = (id: PlateId, layout: Layout): Plate => {
  const p = PLATES[layout.wide ? id : `${id}-portrait`];
  if (!p) throw new Error(`art.json has no plate ${id} for ${layout.aspect}`);
  return p;
};

/** Where a plate rect lands in the frame under a view (the subject's depth follows the view exactly). */
export const onFrame = (view: View, r: Rect): Rect => applyView(view, r);

/**
 * A painted place, assembled by depth. The view says where the camera is;
 * each layer moves by its own depth. `t` only drives the ambient sway and
 * the steam, both pure functions of it.
 */
export const Painted: React.FC<{
  plate: Plate; view: View; t: number; frame: Size;
  /** 0..1: soften and darken the world so a floating window can sit on it */
  soft?: number;
  style?: React.CSSProperties;
}> = ({ plate, view, t, frame, soft = 0, style }) => {
  const sway = { x: Math.sin(t * 0.42) * 5, y: Math.cos(t * 0.31) * 2.5 };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: frame.width, height: frame.height, overflow: "hidden", backgroundColor: "#15142a", ...style }}>
      <div style={{ position: "absolute", inset: 0, filter: soft > 0 ? `blur(${(soft * 14).toFixed(2)}px) saturate(${1 + soft * 0.15})` : undefined }}>
        {plate.layers.map((l) => {
          const v = layerView(view, l.depth, plate, frame, sway);
          const base: React.CSSProperties = {
            position: "absolute", left: 0, top: 0, width: plate.width, height: plate.height, transformOrigin: "0 0",
            transform: `translate(${v.tx.toFixed(3)}px, ${v.ty.toFixed(3)}px) scale(${v.s.toFixed(5)})`,
          };
          if (l.name !== "steam") return <Img key={l.name} src={staticFile(l.file)} style={base} />;
          // steam: two passes of the same layer rising out of phase, each fading as it climbs
          return [0, 0.5].map((phase) => {
            const p = (((t * 0.22 + phase) % 1) + 1) % 1;
            return (
              <Img key={l.name + phase} src={staticFile(l.file)} style={{
                ...base, opacity: Math.sin(Math.PI * p) * 0.9,
                transform: `translate(${(v.tx + Math.sin(t * 0.9 + phase * 6) * 6 * v.s).toFixed(3)}px, ${(v.ty - (p - 0.35) * 70 * v.s).toFixed(3)}px) scale(${v.s.toFixed(5)})`,
              }} />
            );
          });
        })}
      </div>
      {soft > 0 ? <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(10,11,22,${(soft * 0.62).toFixed(3)})` }} /> : null}
    </div>
  );
};
