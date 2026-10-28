/* The host's voice (written by scripts/float-voice.mjs; do not edit by
   hand): the clips under public/float/groove/voice/, as the clip path
   registers them. Each: id (soundKit GROOVE_LINES and GROOVE_CROWD), file,
   onset (ms: the beat point, the first rise past 30% of the peak), dur (ms),
   f0 (Hz at the beat, 0 unpitched). The engine reads its own marks from
   the decoded samples; these are the script's, for the tests and a look.
   The voice is AI-generated (OpenAI text-to-speech): a release's credits
   say so. */
export const VOICE = Object.freeze({
  base:"/float/groove/voice/",
  voice:"coral",
  clips:Object.freeze([
    Object.freeze({ id:"ready", file:"ready.mp3", onset:53, dur:305, f0:203.2 }),
    Object.freeze({ id:"hey", file:"hey.mp3", onset:51, dur:251, f0:334.1 }),
    Object.freeze({ id:"ba", file:"ba.mp3", onset:24, dur:227, f0:206.1 }),
    Object.freeze({ id:"spin", file:"spin.mp3", onset:37, dur:486, f0:0 }),
    Object.freeze({ id:"one", file:"one.mp3", onset:52, dur:347, f0:294 }),
    Object.freeze({ id:"two", file:"two.mp3", onset:25, dur:251, f0:412.1 }),
    Object.freeze({ id:"three", file:"three.mp3", onset:139, dur:413, f0:370.6 }),
    Object.freeze({ id:"four", file:"four.mp3", onset:128, dur:358, f0:312.8 }),
    Object.freeze({ id:"drink", file:"drink.mp3", onset:76, dur:464, f0:237.1 }),
    Object.freeze({ id:"herewego", file:"herewego.mp3", onset:54, dur:586, f0:167 }),
    Object.freeze({ id:"title-paddle", file:"title-paddle.mp3", onset:64, dur:713, f0:393.8 }),
    Object.freeze({ id:"title-rock", file:"title-rock.mp3", onset:83, dur:760, f0:312.8 }),
    Object.freeze({ id:"title-spin", file:"title-spin.mp3", onset:36, dur:825, f0:0 }),
    Object.freeze({ id:"title-drop", file:"title-drop.mp3", onset:137, dur:1004, f0:324.3 }),
    Object.freeze({ id:"lastcall", file:"lastcall.mp3", onset:83, dur:687, f0:267.3 }),
    Object.freeze({ id:"crowd-hey-1", file:"crowd-hey-1.mp3", onset:57, dur:302, f0:152.1 }),
    Object.freeze({ id:"crowd-hey-2", file:"crowd-hey-2.mp3", onset:60, dur:318, f0:235.8 }),
    Object.freeze({ id:"crowd-hey-3", file:"crowd-hey-3.mp3", onset:78, dur:399, f0:146.5 }),
    Object.freeze({ id:"crowd-hey-4", file:"crowd-hey-4.mp3", onset:70, dur:315, f0:315 }),
    Object.freeze({ id:"crowd-hey-5", file:"crowd-hey-5.mp3", onset:46, dur:318, f0:136.5 }),
    Object.freeze({ id:"crowd-hey-6", file:"crowd-hey-6.mp3", onset:65, dur:490, f0:0 }),
    Object.freeze({ id:"crowd-ooh-1", file:"crowd-ooh-1.mp3", onset:33, dur:636, f0:140.9 }),
    Object.freeze({ id:"crowd-ooh-2", file:"crowd-ooh-2.mp3", onset:28, dur:952, f0:206.1 }),
    Object.freeze({ id:"crowd-ooh-3", file:"crowd-ooh-3.mp3", onset:0, dur:632, f0:0 }),
    Object.freeze({ id:"crowd-ooh-4", file:"crowd-ooh-4.mp3", onset:16, dur:563, f0:350 }),
    Object.freeze({ id:"crowd-aww-1", file:"crowd-aww-1.mp3", onset:42, dur:1012, f0:109.7 }),
    Object.freeze({ id:"crowd-aww-2", file:"crowd-aww-2.mp3", onset:30, dur:767, f0:154.2 }),
    Object.freeze({ id:"crowd-aww-3", file:"crowd-aww-3.mp3", onset:34, dur:503, f0:109.2 }),
    Object.freeze({ id:"crowd-aww-4", file:"crowd-aww-4.mp3", onset:11, dur:539, f0:196 }),
  ]),
});
