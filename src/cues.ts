/**
 * The cue sheet: derived by walking the cut, never hand-placed. React-free.
 *
 * WHEN comes from the screenplays (src/replica/screenplays.ts), offset by each
 * beat's start; WHAT comes from the baked product data (product sounds) and
 * src/data/sfx.json (film furniture, by role). A product sound is started so
 * that its measured onset lands on the screenplay's mark.
 */

import type { CutId } from "./core/layout-core";
import { timelineFor } from "./core/timeline";
import music from "./data/music.json";
import levels from "./data/product-levels.json";
import sfx from "./data/sfx.json";
import { filmSound, soundOf, type Theme } from "./replica/product";
import { PLAYS, type SfxRole } from "./replica/screenplays";

export interface Cue {
  kind: "product" | "sfx";
  /** the role (sfx) or the event name (product) */
  name: string;
  theme?: Theme;
  /** when it should be HEARD, in film seconds */
  atSec: number;
  /** when the file starts */
  startSec: number;
  file: string;
  durationSec: number;
  /** product sounds: when the audible part is over (the files carry a silent tail) */
  activeEndSec: number;
  gainDb: number;
  /** how far the bed ducks under this cue; 0 = it does not */
  duckDb: number;
  why: string;
}

type Role = { file: string; durationSec: number; anchorSec: number; gainDb: number; kind: string };
const ROLES = sfx.roles as Record<SfxRole, Role>;

/**
 * The product's sounds are the demonstration: they sit on top of the mix, all
 * at one loudness. The files ship between about -12 and -25 LUFS, so each gets
 * the gain that brings it to the target (never more than its own peak allows);
 * the measurements are src/data/product-levels.json.
 */
export const PRODUCT_TARGET_LUFS = -18;
export const PRODUCT_PEAK_CEILING_DB = -1.2;
const LEVELS = levels as Record<string, { sha256: string; lufs: number; truePeakDb: number }>;
export const productGainDb = (publicPath: string): number => {
  const l = LEVELS[publicPath];
  if (!l) throw new Error(`no measured level for ${publicPath}`);
  return Math.min(PRODUCT_TARGET_LUFS - l.lufs, PRODUCT_PEAK_CEILING_DB - l.truePeakDb);
};
export const PRODUCT_DUCK_DB = -9;
/** The bed's own level under everything. */
export const BED_GAIN_DB = -7;
export const DUCK = { attackSec: 0.08, releaseSec: 0.4 } as const;
/** C9 */
export const MIN_PRODUCT_GAP_SEC = 0.3;

/** Where a file's audible part ends, from its baked peaks: the last bin above 6 % of its own peak. */
const activeEnd = (durationSec: number, peaks: readonly number[]): number => {
  let last = peaks.length - 1;
  while (last > 0 && peaks[last] < 0.06) last--;
  return (durationSec * (last + 1)) / peaks.length;
};

export const cuesFor = (cut: CutId): Cue[] => {
  const tl = timelineFor(cut);
  const cues: Cue[] = [];
  const fx = (role: SfxRole, atSec: number, why: string, trimDb = 0): void => {
    const r = ROLES[role];
    const startSec = Math.max(0, atSec - r.anchorSec);
    cues.push({ kind: "sfx", name: role, atSec, startSec, file: r.file, durationSec: r.durationSec, activeEndSec: startSec + r.durationSec, gainDb: r.gainDb + trimDb, duckDb: 0, why });
  };
  for (const beat of tl.beats) {
    const play = PLAYS[beat.scene.id][cut];
    // every scene change is a breath of air; the end card has its own sound
    if (beat.index > 0 && beat.scene.id !== "end") fx("move", beat.startSec, `cut to ${beat.scene.id}`);
    for (const f of play.fx) fx(f.role, beat.startSec + f.at, `${beat.scene.id}: ${f.why}`, f.gainDb ?? 0);
    for (const s of play.sounds) {
      const f = filmSound(s.event, s.theme);
      const atSec = beat.startSec + s.at;
      const startSec = Math.max(0, atSec - f.onsetSec);
      const snd = soundOf(s.event, s.theme);
      cues.push({
        kind: "product", name: s.event, theme: s.theme, atSec, startSec, file: f.publicPath, durationSec: f.durationSec,
        activeEndSec: startSec + activeEnd(f.durationSec, snd.peaks), gainDb: productGainDb(f.publicPath), duckDb: PRODUCT_DUCK_DB,
        why: `${beat.scene.id}: ${s.why}`,
      });
    }
  }
  return cues.sort((a, b) => a.startSec - b.startSec);
};

/** The bed's duck, in dB, at a film second: per-cue, deepest wins, never summed. */
export const duckDbAt = (sec: number, cues: readonly Cue[]): number => {
  let deepest = 0;
  for (const c of cues) {
    if (c.duckDb >= 0) continue;
    const from = c.atSec, to = c.activeEndSec;
    let k = 0;
    if (sec >= from - DUCK.attackSec && sec < from) k = (sec - (from - DUCK.attackSec)) / DUCK.attackSec;
    else if (sec >= from && sec <= to) k = 1;
    else if (sec > to && sec < to + DUCK.releaseSec) k = 1 - (sec - to) / DUCK.releaseSec;
    deepest = Math.min(deepest, c.duckDb * k);
  }
  return deepest;
};

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const bedGainAt = (sec: number, cues: readonly Cue[]): number => dbToGain(BED_GAIN_DB + duckDbAt(sec, cues));
export const bedFile = (cut: CutId): string => music.beds[cut].file;
