/* The win song and the bit (Oct 14). A moment's bit plays at the moment,
   and the winner's song arrives on a beat of it:

     music       the song starts ON the bit's action (the headphones click
                 on, the needle drops): the bit's `song.beat`. Its wind-up
                 runs to its `song.hold` beat and holds there until the
                 speaker is playing, so the action lands with the music
     punchline   the song starts on the bit's punchline (the upset's hit):
                 its own foley plays first and ducks under the song after
     songless    a loss or an idle vignette: no song in the bit. A win
                 song its write owes plays once the bit is over

   The Worker knows the bit (the moment model every screen reads, picked
   the same everywhere) and its start on the server clock, so it sends the
   play request early by the speaker's measured latency
   (private:spotify:latency, the Speaker sheet's "Tap on the beat") and
   the song is heard on the beat. Spotify answers 0.3 to 1.5 s after the
   request, so a music bit also waits: the Worker writes the cue as soon as
   it means to play (showControl.audio.cue), the screens hold the wind-up
   while it is pending, and the walkout record it stamps once the speaker
   took the request carries the bit and when the song is heard
   (walkout.bit, walkout.audibleAt). No cue, no wait: without Spotify the
   bit plays with its own foley and nothing else changes.

   Pure: numbers in, numbers out, so the Worker and every screen agree. */

/* the speaker's latency when nobody has measured it: Spotify Connect's
   middle (a request to sound, a Sonos or a phone) */
export const DEFAULT_LATENCY_MS = 900;
export const MAX_LATENCY_MS = 3000;
/* a pending cue holds a music bit's wind-up at most this long past its
   beat; then the bit goes on with its own foley */
export const CUE_MAX_WAIT_MS = 2600;
/* a song that follows a bit (a loss, or a bit about someone else) starts
   this long after the bit lifts off */
export const SONG_AFTER_BIT_MS = 300;
/* a song that starts by this much before its beat is still on it (the
   wind-up never jumps for less) */
export const ON_BEAT_SLACK_MS = 40;

export const SONG_STYLES = Object.freeze(["music", "punchline", "songless"]);

/* a stored latency as a whole number of ms in range, else null */
export function cleanLatency(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_LATENCY_MS) return null;
  return Math.round(ms / 10) * 10;
}
export const latencyOf = value => cleanLatency(value) ?? DEFAULT_LATENCY_MS;

/* the beat a bit's song lands on (ms into the bit), or null */
export function songBeatOf(bit) {
  const name = bit?.song?.beat;
  const ms = name ? Number(bit?.beats?.[name]) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
/* where a music bit's wind-up holds (ms into the bit), or null */
export function holdBeatOf(bit) {
  if (bit?.style !== "music") return null;
  const name = bit?.song?.hold;
  const ms = name ? Number(bit?.beats?.[name]) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/* When the Worker plays a write's win song, given the moment that write
   carries (`gag`: its bit id, window `start`, its `players`), the bit
   (registry entry), the singer and the speaker's latency:
     { mode:"now" }                         no moment: as before
     { mode:"beat", beat, audibleAt, requestAt }   on the bit's beat
     { mode:"after", requestAt }            after the bit (songless, or
                                            the bit is about someone else)
   `requestAt` is when to send the play request (server ms). */
export function songPlan({ gag = null, bit = null, singer = null, latencyMs = DEFAULT_LATENCY_MS, now = 0 } = {}) {
  if (!gag || !bit || !Number.isFinite(Number(gag.start))) return { mode:"now" };
  const latency = latencyOf(latencyMs);
  const beat = songBeatOf(bit);
  const ours = !!singer && (gag.players || []).includes(singer);
  if (bit.style !== "songless" && beat !== null && ours) {
    const audibleAt = Number(gag.start) + beat;
    return { mode:"beat", beat, audibleAt, requestAt:Math.max(Number(now) || 0, audibleAt - latency) };
  }
  const end = Number(gag.start) + (Number(bit.span) || Number(bit.ms) || 0);
  return { mode:"after", requestAt:Math.max(Number(now) || 0, end + SONG_AFTER_BIT_MS) };
}

/* When a song requested at `sentAt` is heard */
export const audibleAtFor = (sentAt, latencyMs) => Number(sentAt) + latencyOf(latencyMs);

/* The bit's second clock. A music bit runs from its `start` to its hold
   beat, holds there until the song is heard, and runs on from `origin`
   (its action on the song's first beat): origin = audibleAt - songBeat.
   With the song pending, the origin is the latest it may be (the wind-up
   held CUE_MAX_WAIT_MS past its beat); with no song coming, the start.
   `song` is { status:"none" | "pending" | "set", audibleAt }. */
export function bitOrigin(bit, start, song = null) {
  const t0 = Number(start);
  const hold = holdBeatOf(bit), beat = songBeatOf(bit);
  if (!Number.isFinite(t0) || hold === null || beat === null || !song || song.status === "none") return t0;
  if (song.status === "pending") return t0 + CUE_MAX_WAIT_MS;
  const heard = Number(song.audibleAt);
  if (!Number.isFinite(heard)) return t0;
  const origin = heard - beat;
  /* early or on time (within the slack): the action can only come as
     soon as the wind-up reaches its hold */
  if (Math.abs(origin - t0) <= ON_BEAT_SLACK_MS) return t0;
  return Math.max(t0 - (beat - hold), Math.min(origin, t0 + CUE_MAX_WAIT_MS + MAX_LATENCY_MS));
}

/* How far into the bit it is at `now`: the start's clock up to the hold,
   the hold held, then the origin's clock. */
export function bitElapsed(bit, start, origin, now) {
  const t0 = Number(start), t = Number(now);
  const hold = holdBeatOf(bit);
  const org = Number.isFinite(Number(origin)) ? Number(origin) : t0;
  const first = t - t0;
  if (hold === null || org === t0 || first < hold) return first;
  return Math.max(hold, t - org);
}

/* The clock a screen draws now: { mode:"run", base } (the bit's CSS runs
   from `base`, --tl = base - now) or { mode:"hold", at } (held at the
   hold beat while the song comes), and the next instant that changes. */
export function bitPhase(bit, start, origin, now) {
  const t0 = Number(start), t = Number(now);
  const hold = holdBeatOf(bit);
  const org = Number.isFinite(Number(origin)) ? Number(origin) : t0;
  if (hold === null || org === t0) return { mode:"run", base:t0, next:null };
  if (t < t0 + hold) return { mode:"run", base:t0, next:t0 + hold };
  if (org > t0 && t < org + hold) return { mode:"hold", at:hold, next:org + hold };
  return { mode:"run", base:org, next:null };
}

/* where a cue on the bit's clock sounds: before the hold on the start's
   clock, from the hold on on the origin's */
export const cueTime = (bit, cueAt, start, origin) => {
  const hold = holdBeatOf(bit);
  const org = Number.isFinite(Number(origin)) ? Number(origin) : Number(start);
  return (hold !== null && cueAt >= hold ? org : Number(start)) + cueAt;
};

/* ── the speaker's latency, measured: "Tap on the beat" ──
   The Speaker sheet asks for taps twice: on the phone's own clicks (the
   person's reaction to a sound with no delay) and on the speaker's (the
   same reaction plus the speaker's latency). The latency is the
   difference of the two medians, so the reaction cancels out. Each tap is
   { at, heard }: the server instant of the tap, and of the sound it
   answers (the click's, or the play request's). */
export const CALIBRATION_ROUNDS = 3;
export const TAP_WINDOW_MS = 4000;

const median = list => {
  const xs = list.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
};
/* a tap's delay from its sound, when it plausibly answers it */
const delayOf = tap => {
  const d = Number(tap?.at) - Number(tap?.heard);
  return Number.isFinite(d) && d >= 0 && d <= TAP_WINDOW_MS ? d : null;
};
export function latencyFromTaps({ clicks = [], speaker = [] } = {}) {
  const reaction = median(clicks.map(delayOf));
  const heard = median(speaker.map(delayOf));
  if (reaction === null || heard === null) return null;
  return cleanLatency(Math.max(0, heard - reaction));
}

/* The calibration's steps, one reducer: clicks first, then the speaker.
     { step:"idle" | "clicks" | "speaker" | "done", clicks, speaker, round,
       heard (the current sound's instant), latency }
   events: start; sound { at } (a sound was played, or the play request
   sent); tap { at }; next (the next round); fail; reset. */
export const CALIBRATION_IDLE = Object.freeze({ step:"idle", clicks:[], speaker:[], round:0, heard:null, latency:null, error:null });
export function calibrationStep(state = CALIBRATION_IDLE, event = {}) {
  const s = state || CALIBRATION_IDLE;
  switch (event.type) {
    case "start": return { ...CALIBRATION_IDLE, step:"clicks" };
    case "reset": return CALIBRATION_IDLE;
    case "fail": return { ...s, step:"idle", error:String(event.error || "The speaker didn't answer") };
    case "sound": return s.step === "clicks" || s.step === "speaker" ? { ...s, heard:Number(event.at) } : s;
    case "tap": {
      if ((s.step !== "clicks" && s.step !== "speaker") || !Number.isFinite(s.heard)) return s;
      const tap = { at:Number(event.at), heard:s.heard };
      if (delayOf(tap) === null) return s;
      const list = [...s[s.step], tap];
      const round = s.round + 1;
      if (round < CALIBRATION_ROUNDS) return { ...s, [s.step]:list, round, heard:null };
      if (s.step === "clicks") return { ...s, clicks:list, step:"speaker", round:0, heard:null };
      const latency = latencyFromTaps({ clicks:s.clicks, speaker:list });
      return { ...s, speaker:list, step:"done", round, heard:null, latency,
        error:latency === null ? "Those taps didn't line up. Try again" : null };
    }
    default: return s;
  }
}
