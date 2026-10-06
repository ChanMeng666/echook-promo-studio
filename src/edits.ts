/**
 * The edit decision lists: one per cut length, in BARS of that cut's own bed
 * (src/data/music.json: 128 BPM, a bar is 1.875 s). core/timeline.ts turns a
 * bar count into seconds by reading the bed's measured downbeats, so every
 * boundary below is a bar line by construction.
 *
 * Short cuts drop beats; they do not speed everything up. What happens inside
 * a beat is that scene's screenplay for that cut (src/replica/screenplays.ts).
 */

import type { CutId } from "./core/layout-core";
import type { SceneId } from "./scenes";

export interface Edit {
  scene: SceneId;
  /** on-screen length, in bars */
  bars: number;
  /** why this beat is this long */
  why: string;
}

export const EDITS: Readonly<Record<CutId, readonly Edit[]>> = {
  "60": [
    { scene: "hook", bars: 4, why: "Two short lines (4 + 5 words) and a push from the whole desk to the monitor: 7.5 s." },
    { scene: "away", bars: 4, why: "The bed's breakdown. One bar to walk away, one of quiet, then the product's own voice line (1.3 s) heard alone and a four-word line." },
    { scene: "events", bars: 6, why: "Three real sounds in turn (3.4 s + 1.0 s + 1.3 s with gaps) take four bars; the wall and the count line take two. The honesty caption runs the whole beat." },
    { scene: "themes", bars: 2, why: "The voice file (1.3 s) then the chime file (2.0 s), one bar each." },
    { scene: "channels", bars: 4, why: "Three panels, one per bar, and a bar to see all three together." },
    { scene: "talk", bars: 4, why: "Type five words, run one command, read one line of JSON, see the status line change." },
    { scene: "statusline", bars: 4, why: "Three baked states, a bar each, after a bar to arrive on the status line." },
    { scene: "end", bars: 4, why: "One bar for the three editors as plain words, three for the end card; the arrangement stops inside the last bar and rings out." },
  ],
  "30": [
    { scene: "hook", bars: 2, why: "Both lines, one bar each." },
    { scene: "away", bars: 3, why: "Breakdown. Walk away, hear the voice line alone, read four words." },
    { scene: "events", bars: 3, why: "One event with its sound, then the wall and the count. 5.6 s also carries the honesty caption." },
    { scene: "channels", bars: 2, why: "Three panels arriving on beats; the permission sound is 3.4 s." },
    { scene: "talk", bars: 2, why: "The sentence is already half typed; command, JSON and the muted status line." },
    { scene: "statusline", bars: 2, why: "Green, yellow, red." },
    { scene: "end", bars: 2, why: "The end card, with the editors as one row of it." },
  ],
  "15": [
    { scene: "hook", bars: 1, why: "One line of five words and the desk." },
    { scene: "away", bars: 2, why: "Breakdown. The callback is the film in one gesture." },
    { scene: "events", bars: 2, why: "The wall and the count; 3.75 s carries the honesty caption (floor 3 s)." },
    { scene: "statusline", bars: 1, why: "The context bar climbing through its three colours." },
    { scene: "end", bars: 2, why: "The end card." },
  ],
};
