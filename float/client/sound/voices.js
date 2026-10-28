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
    Object.freeze({ id:"ready", file:"ready.mp3", onset:44, dur:329, f0:256.4 }),
    Object.freeze({ id:"hey", file:"hey.mp3", onset:63, dur:295, f0:393.8 }),
    Object.freeze({ id:"ba", file:"ba.mp3", onset:24, dur:227, f0:214.1 }),
    Object.freeze({ id:"spin", file:"spin.mp3", onset:37, dur:486, f0:0 }),
    Object.freeze({ id:"one", file:"one.mp3", onset:70, dur:364, f0:404.6 }),
    Object.freeze({ id:"two", file:"two.mp3", onset:26, dur:298, f0:86.5 }),
    Object.freeze({ id:"three", file:"three.mp3", onset:139, dur:413, f0:373.7 }),
    Object.freeze({ id:"four", file:"four.mp3", onset:131, dur:372, f0:296 }),
    Object.freeze({ id:"drink", file:"drink.mp3", onset:76, dur:464, f0:237.1 }),
    Object.freeze({ id:"herewego", file:"herewego.mp3", onset:54, dur:586, f0:166.4 }),
    Object.freeze({ id:"title-paddle", file:"title-paddle.mp3", onset:76, dur:807, f0:304.1 }),
    Object.freeze({ id:"title-rock", file:"title-rock.mp3", onset:83, dur:760, f0:312.8 }),
    Object.freeze({ id:"title-spin", file:"title-spin.mp3", onset:36, dur:825, f0:0 }),
    Object.freeze({ id:"title-drop", file:"title-drop.mp3", onset:82, dur:657, f0:329.1 }),
    Object.freeze({ id:"crowd-hey-1", file:"crowd-hey-1.mp3", onset:57, dur:302, f0:153.1 }),
    Object.freeze({ id:"crowd-hey-2", file:"crowd-hey-2.mp3", onset:60, dur:318, f0:234.6 }),
    Object.freeze({ id:"crowd-hey-3", file:"crowd-hey-3.mp3", onset:95, dur:444, f0:135.3 }),
    Object.freeze({ id:"crowd-hey-4", file:"crowd-hey-4.mp3", onset:59, dur:349, f0:0 }),
    Object.freeze({ id:"crowd-hey-5", file:"crowd-hey-5.mp3", onset:46, dur:318, f0:137.4 }),
    Object.freeze({ id:"crowd-hey-6", file:"crowd-hey-6.mp3", onset:65, dur:490, f0:0 }),
  ]),
});
