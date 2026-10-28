/* The host's voice (written by scripts/float-voice.mjs; do not edit by
   hand): the clips under public/float/groove/voice/, as the clip path
   registers them. Each: id (soundKit GROOVE_LINES and GROOVE_CROWD), file,
   onset (ms: the beat point, the first rise past half the peak), dur (ms),
   f0 (Hz at the beat, 0 unpitched). The engine reads its own marks from
   the decoded samples; these are the script's, for the tests and a look.
   The voice is AI-generated (OpenAI text-to-speech): a release's credits
   say so. */
export const VOICE = Object.freeze({
  base:"/float/groove/voice/",
  voice:null,
  clips:Object.freeze([]),
});
