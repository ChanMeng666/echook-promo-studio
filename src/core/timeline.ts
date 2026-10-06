/**
 * THE ONLY FRAME ARITHMETIC IN THE REPO.
 *
 * Intent is written in bars (the EDLs) and in seconds or beats (screenplays,
 * the cue sheet). This file converts to frames once; no other file may contain
 * a frame literal, and `npm run verify` greps for one.
 */

import { CUT_SECONDS, FPS, type CutId } from "./layout-core";
import { EDITS, type Edit } from "../edits";
import { SCENES, type Scene } from "../scenes";
import music from "../data/music.json";

export const secToFrame = (sec: number): number => Math.round(sec * FPS);
export const frameToSec = (frame: number): number => frame / FPS;

export const BAR_SEC: number = music.barSec;
export const BEAT_SEC: number = music.beatSec;
export const downbeatsFor = (cut: CutId): readonly number[] => music.beds[cut].downbeats;

/** A position inside a beat, written as the musician would: bar 3 beat 1 (both 1-based). */
export const bb = (bar: number, beat = 1): number => (bar - 1) * BAR_SEC + (beat - 1) * BEAT_SEC;

export interface Beat {
  index: number;
  edit: Edit;
  scene: Scene;
  prev?: Scene;
  next?: Scene;
  /** 1-based first bar of the bed this beat starts on */
  fromBar: number;
  bars: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFrame: number;
  durationInFrames: number;
}

export interface ResolvedCut { cut: CutId; totalSec: number; totalFrames: number; beats: Beat[]; problems: string[] }

export const resolveCut = (cut: CutId): ResolvedCut => {
  const edits = EDITS[cut];
  const totalSec = CUT_SECONDS[cut];
  const totalFrames = secToFrame(totalSec);
  const downbeats = downbeatsFor(cut);
  const problems: string[] = [];
  const beats: Beat[] = [];
  let bar = 0; // bars consumed so far
  edits.forEach((edit, index) => {
    const last = index === edits.length - 1;
    // a boundary IS a measured downbeat of this cut's bed, never bpm x n
    const startSec = downbeats[bar];
    const endBar = bar + edit.bars;
    const endSec = endBar >= downbeats.length ? totalSec : downbeats[endBar];
    if (startSec === undefined) problems.push(`cut ${cut}: ${edit.scene} starts on bar ${bar + 1}, past the bed's ${downbeats.length} bars`);
    if (last && endBar !== downbeats.length) problems.push(`cut ${cut}: beats sum to ${endBar} bars, the bed has ${downbeats.length}`);
    const startFrame = secToFrame(startSec ?? 0);
    // the last beat absorbs the rounding, so the frame total is exact
    const endFrame = last ? totalFrames : secToFrame(endSec);
    beats.push({
      index, edit, scene: SCENES[edit.scene],
      prev: index > 0 ? SCENES[edits[index - 1].scene] : undefined,
      next: !last ? SCENES[edits[index + 1].scene] : undefined,
      fromBar: bar + 1, bars: edit.bars,
      startSec: startSec ?? 0, endSec, durationSec: endSec - (startSec ?? 0),
      startFrame, durationInFrames: endFrame - startFrame,
    });
    bar = endBar;
  });
  return { cut, totalSec, totalFrames, beats, problems };
};

const built = {
  "15": resolveCut("15"),
  "30": resolveCut("30"),
  "60": resolveCut("60"),
} satisfies Record<CutId, ResolvedCut>;

export const timelineFor = (cut: CutId): ResolvedCut => built[cut];
export const totalFramesFor = (cut: CutId): number => built[cut].totalFrames;

/** Seconds since this beat began, for a SEQUENCE-LOCAL frame. */
export const localSecond = (localFrame: number): number => frameToSec(localFrame);
