/**
 * A stand-in for `remotion` so the gates can paint the film's own scene
 * components to static markup in Node. Only what the scenes import is here;
 * a new import makes the bundle fail, which is the tripwire working.
 */
import React from "react";

export const AbsoluteFill: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>
);
export const Img: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => <img src={src} style={style} />;
export const staticFile = (p: string): string => "static:" + p;
