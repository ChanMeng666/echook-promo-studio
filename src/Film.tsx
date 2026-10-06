import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { AwayScene, ChannelsScene, EndScene, EventsScene, HookScene, StatusScene, TalkScene, ThemesScene, type SceneProps } from "./components/Scenes";
import { deriveLayout, type CutId, type Layout } from "./core/layout-core";
import { frameToSec, localSecond, secToFrame, timelineFor, type Beat } from "./core/timeline";
import { bedFile, bedGainAt, cuesFor, dbToGain } from "./cues";
import { FILM_FONT } from "./fonts";
import { T } from "./replica/tokens";
import type { SceneId } from "./scenes";

/** Every component reads the layout from here, never from the video config directly. */
export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  return React.useMemo(() => deriveLayout(width, height), [width, height]);
};

const VIEWS: Record<SceneId, React.FC<SceneProps>> = {
  hook: HookScene, away: AwayScene, events: EventsScene, themes: ThemesScene,
  channels: ChannelsScene, talk: TalkScene, statusline: StatusScene, end: EndScene,
};

const BeatView: React.FC<{ beat: Beat; cut: CutId }> = ({ beat, cut }) => {
  const frame = useCurrentFrame(); // sequence-local
  const layout = useLayout();
  const View = VIEWS[beat.scene.id];
  return <View cut={cut} t={localSecond(frame)} dur={beat.durationSec} layout={layout} />;
};

/** Sound lives in exactly one place, above the picture, outside every scene. */
const FilmAudio: React.FC<{ cut: CutId }> = ({ cut }) => {
  const cues = React.useMemo(() => cuesFor(cut), [cut]);
  return (
    <>
      <Audio src={staticFile(bedFile(cut))} volume={(f) => bedGainAt(frameToSec(f), cues)} />
      {cues.map((c, i) => (
        <Sequence key={i} from={secToFrame(c.startSec)} durationInFrames={secToFrame(c.durationSec) + secToFrame(0.1)} layout="none" name={`${c.kind} ${c.name}`}>
          <Audio src={staticFile(c.file)} volume={dbToGain(c.gainDb)} />
        </Sequence>
      ))}
    </>
  );
};

export const Film: React.FC<{ cut: CutId }> = ({ cut }) => {
  const tl = timelineFor(cut);
  return (
    <AbsoluteFill style={{ backgroundColor: T.night, fontFamily: FILM_FONT.voice }}>
      {tl.beats.map((beat) => (
        <Sequence key={beat.index} name={`${beat.index} ${beat.scene.id}`} from={beat.startFrame} durationInFrames={beat.durationInFrames} layout="none">
          <BeatView beat={beat} cut={cut} />
        </Sequence>
      ))}
      <FilmAudio cut={cut} />
    </AbsoluteFill>
  );
};
