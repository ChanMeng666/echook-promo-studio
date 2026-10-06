import React from "react";
import { Composition } from "remotion";

import { DELIVERABLES, FPS } from "./core/layout-core";
import { totalFramesFor } from "./core/timeline";
import { Film } from "./Film";

/**
 * Six masters: three lengths x two aspects, mapped from one table.
 *
 * There is no calculateMetadata: lengths come from the EDLs through
 * core/timeline.ts, synchronously. Nothing probes a media file at render time.
 */
export const RemotionRoot: React.FC = () => (
  <>
    {DELIVERABLES.map((d) => (
      <Composition key={d.id} id={d.id} component={Film} defaultProps={{ cut: d.cut }}
        durationInFrames={totalFramesFor(d.cut)} fps={FPS} width={d.width} height={d.height} />
    ))}
  </>
);
