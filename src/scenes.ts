/**
 * The scene library: every scene that may appear in a cut. React-free.
 *
 * A scene is reusable material; an EDL row (src/edits.ts) says how many bars
 * it is on screen in one cut, and the scene's screenplay for that cut
 * (src/replica/screenplays.ts) says what happens inside it.
 */

import type { SceneKey } from "./replica/screenplays";

export type SceneId = SceneKey;
/** the colour script: which world the beat is in */
export type Ground = "desk" | "away" | "deskSoft" | "night" | "paper";

export interface Scene {
  id: SceneId;
  intent: string;
  ground: Ground;
}

export const SCENES: Readonly<Record<SceneId, Scene>> = {
  hook: { id: "hook", ground: "desk", intent: "Open on the work: an agent busy in a terminal, on a desk at dusk. You can leave it." },
  away: { id: "away", ground: "away", intent: "Somewhere else in the home. The product's own voice line reaches you there." },
  events: { id: "events", ground: "deskSoft", intent: "Each thing the agent does has its own real sound; then all of them at once, counted." },
  themes: { id: "themes", ground: "paper", intent: "The same event in the two themes the product ships." },
  channels: { id: "channels", ground: "night", intent: "Three ways the same event reaches you: sound, desktop toast, webhook." },
  talk: { id: "talk", ground: "deskSoft", intent: "Configuration is a sentence to the agent, which runs the real command." },
  statusline: { id: "statusline", ground: "deskSoft", intent: "The second thing the product does: the status line, in three real states." },
  end: { id: "end", ground: "night", intent: "Where it works, what it is called, where to get it." },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
