/* Float's music on the room's clock (pure). One bed plays at a time, bar
   by bar (soundKit floatRace, floatVamp, floatLounge: cut recipes, so a
   bar that rings when the bed changes fades out clean):

     lobby, feedback  the lounge: eight bars rocking D, A, B minor, A, on the
                      server's own bar grid (every screen in a room in step),
                      its sections coming and going over 32 bars
     intro, grid      the vamp: a palm-muted pedal on B, from the bar line
                      after the title's sting
     countdown, race  the race: bar 0 on the gun (laid during the countdown so
                      it lands on time), each bar's arrangement chosen as it
                      is laid: the leg, the final, the phrase (a fill on its
                      eighth bar, a crash on its first), and the live tense
     cut              the lounge between rounds, after the button and the stings
     podium           nothing while the fanfare and the winner's pose have the
                      room; then the lounge again under the finalists

   Intensity is horizontal and vertical at once: each bar is its own recipe
   (so the arrangement switches on the bar line), and the race's tense
   (1..5) layers the hat, the ghost notes, the tremolo, the kick and the
   roll in as the leader nears the takeout, eases back to 3 when the first
   rider is in, and builds again as the cap runs out. At The Drop the bar
   the leader reaches the lip on suspends (the band holds on a tremolo and a
   riser) and the bar after the first landing hits. */
import { CAP_MS, legOf, roarAt } from "./cup.js";

/* one bar, 120 a minute in four (soundKit FLOAT_BAR_S) */
export const BAR_MS = 2000;
/* a bar is chosen and laid this far ahead of its start */
export const MUSIC_LEAD_MS = 650;
/* the title's sting has this long before the vamp's first bar line (the Cup's intro rings longer) */
export const TITLE_HOLD_MS = 2200;
export const INTRO_HOLD_MS = 3800;
/* between rounds: the button and the stings first */
export const CUT_HOLD_MS = 3200;
/* the podium: the fanfare and the winner's pose alone, then the lounge again under the finalists */
export const PODIUM_HOLD_MS = 6500;
/* the lounge's turn and its sections (bars) */
export const LOUNGE_BARS = 8, LOUNGE_SECTIONS = 4;

/* the next bar line of a grid anchored at `anchor`, at or after `at` */
export const barLine = (at, anchor = 0) => anchor + Math.ceil((at - anchor) / BAR_MS) * BAR_MS;

/* The bed for where the Cup is (null: none). key changes when the bed
   must start over; anchor is its bar 0; from is the first instant a bar
   may start. */
export function musicTrack(mem, { reduced = false } = {}) {
  const v = mem?.view;
  if (reduced || !v) return null;
  switch (v.phase) {
    case "lobby": case "feedback": return { key:"lounge", mode:"lounge", anchor:0, from:-Infinity };
    case "cut": {
      const at = (Number.isFinite(mem.cutAt) ? mem.cutAt : v.startAt ?? v.s ?? 0) + CUT_HOLD_MS;
      return { key:`cut:${v.round}`, mode:"lounge", cut:true, anchor:0, from:barLine(at) };
    }
    case "intro": case "grid": {
      const start = Number.isFinite(mem.phaseAt) ? mem.phaseAt : v.startAt ?? v.s ?? 0;
      const from = start + (mem.titled === `${v.phase}:${v.round}` ? (v.phase === "intro" ? INTRO_HOLD_MS : TITLE_HOLD_MS) : 0);
      return { key:`vamp:${v.phase}:${v.round}`, mode:"vamp", anchor:from, from };
    }
    case "podium": {
      const start = Number.isFinite(mem.phaseAt) ? mem.phaseAt : v.startAt ?? v.s ?? 0;
      return { key:`podium:${v.round}`, mode:"lounge", anchor:0, from:barLine(start + PODIUM_HOLD_MS) };
    }
    case "countdown": case "race": {
      const gun = mem.gun?.round === v.round ? mem.gun.at : null;
      if (!Number.isFinite(gun)) return null;
      return { key:`race:${v.round}:${Math.round(gun)}`, mode:"race", anchor:gun, from:gun, leg:Math.min(3, v.leg), final:v.final };
    }
    default: return null;
  }
}

/* the first bar a track lays from `now` (the next bar line still ahead) */
export function firstBar(track, now, lead = 60) {
  const from = Math.max(Number.isFinite(track.from) ? track.from : -Infinity, now + lead);
  return Math.max(0, Math.ceil((from - track.anchor) / BAR_MS));
}
export const barAt = (track, index) => track.anchor + index * BAR_MS;

/* The race's tense as a bar starting at `at` will play it. Before anyone
   is in, it follows the leader (the rider furthest down the leg still on
   the water) over the last 18% and never falls back; once the first rider
   is in, it eases to 3 and builds as the cap runs out. */
export function raceTense(mem, at) {
  const firstIn = mem.firstIn?.round === mem.view?.round ? mem.firstIn.at : null;
  if (Number.isFinite(firstIn)) {
    const capEnd = Number.isFinite(mem.view?.endsAt) && mem.view.endsAt > firstIn ? mem.view.endsAt : firstIn + CAP_MS;
    const left = capEnd - at;
    return left <= 6000 ? 5 : left <= 14000 ? 4 : 3;
  }
  const f = Number(mem.pack?.leaderFrac) || 0;
  const byLeader = f >= 0.97 ? 5 : f >= 0.935 ? 4 : f >= 0.9 ? 3 : f >= 0.86 ? 2 : f >= 0.82 ? 1 : 0;
  return Math.max(byLeader, mem.peakTense?.round === mem.view?.round ? mem.peakTense.level : 0);
}

/* The Drop: "suspend" for the bar the leader reaches the lip in (nobody
   over yet, at the leader's pace); "land" for the first bar after the first
   rider lands. */
export function dropState(mem, at) {
  const v = mem.view, info = mem.course;
  if (!v || !info?.falls?.length) return null;
  const leg = legOf(info, v.leg);
  if (!leg) return null;
  const landed = mem.landed?.round === v.round ? mem.landed.at : null;
  if (Number.isFinite(landed)) return at > landed && at - landed <= BAR_MS ? "land" : null;
  const lead = mem.pack?.leaderS, speed = Math.max(0.5, Number(mem.pack?.speed) || 2);
  if (!Number.isFinite(lead)) return null;
  const fall = info.falls.find(f => f.top >= leg.base && f.top <= leg.end && lead < f.top);
  if (!fall) return null;
  /* where the leader will be when the bar starts, and when it ends */
  const since = at - (Number(mem.pack?.s) || at);
  const start = lead + speed * since / 1000, end = start + speed * BAR_MS / 1000;
  return start < fall.top && end >= fall.top - 1 ? "suspend" : null;
}

/* the cue for bar `index` of a track */
export function barCue(track, index, mem = null) {
  const at = barAt(track, index);
  if (track.mode === "lounge") {
    const n = Math.round(at / BAR_MS);
    return { id:"floatLounge", at, opts:{ bar:((n % LOUNGE_BARS) + LOUNGE_BARS) % LOUNGE_BARS,
      section:((Math.floor(n / LOUNGE_BARS) % LOUNGE_SECTIONS) + LOUNGE_SECTIONS) % LOUNGE_SECTIONS, cut:!!track.cut } };
  }
  if (track.mode === "vamp") return { id:"floatVamp", at, opts:{ bar:index % 2 } };
  const tense = mem ? raceTense(mem, at) : 0;
  const drop = mem ? dropState(mem, at) : null;
  /* the first bar after the first rider is in hits the crash */
  const firstIn = mem?.firstIn?.round === mem?.view?.round ? mem.firstIn.at : null;
  const welcome = Number.isFinite(firstIn) && at > firstIn && at - firstIn <= BAR_MS;
  return { id:"floatRace", at, opts:{ leg:track.leg, final:!!track.final, bar:index % 4, phrase:index % 8, tense,
    fill:index % 8 === 7, crash:(index > 0 && index % 8 === 0) || welcome, first:index === 0, ...(drop ? { drop } : {}) } };
}

/* every bar of a track starting in [from, to) */
export function barsBetween(track, from, to, mem = null) {
  const out = [];
  for (let i = Math.max(0, Math.ceil((from - track.anchor) / BAR_MS)); barAt(track, i) < to; i++) out.push(barCue(track, i, mem));
  return out;
}

/* the roar a waterfall throws ahead of the pack, for the river (0..1) */
export const roarFor = (mem, s) => roarAt(mem?.course, s);
