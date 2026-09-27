import React, { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, wagerMult,
  disp, teamLabel, snakeTeam, resolveWager, resolveCurrentContest, wagerMatchesContest,
  resolveWeekendOperation, pokerClock, pokerDenoms, stageEntrantView,
} from "../../../shared/core.js";
import { resolveShowScene } from "../../../shared/show.js";
import { Avatar, AvatarStack, BetChipCluster } from "../identity/PlayerIdentity.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { wagerPickLabel, mergeWagerLines } from "../wagers/Wagers.jsx";
import {
  TV_LEAD_CHANGE_MS, fmt, signed, mmss, editionLabel, payoutLine, tvCanvasFit, tvSceneView, ambientIndex,
  nextOpenMatch, latestResultOf, resultPresentation, resultMomentPhase, resultMomentFor, advanceMoment,
  bracketStrip, pokerTableRows, tvConnection, tickerItems,
} from "./tvModel.js";
import { useServerNow } from "./serverClock.js";
import "./tv.css";

const reducedMotionNow = () => typeof window !== "undefined"
  && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

function useCanvasFit() {
  const read = () => typeof window === "undefined"
    ? tvCanvasFit(1920, 1080) : tvCanvasFit(window.innerWidth, window.innerHeight);
  const [fit, setFit] = useState(read);
  useEffect(() => {
    const onResize = () => setFit(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return fit;
}

const Move = ({ delta, className = "tv-move" }) => !delta ? <span className={className} /> : (
  <span className={`${className} ${delta > 0 ? "is-up" : "is-down"}`}
    aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)}`}>
    {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}</span>
);

/* ─────────── the prize ───────────
   An actually-turned trophy: every part is a real solid of revolution built
   from a ring of facets, back faces culled. Flat facet tones, no glow. */
function trophyRing({ key, topR, botR, h, yTop, n, hue, lo = 0.72 }) {
  const slant = Math.hypot(h, topR - botR);
  const tilt = Math.atan2(topR - botR, h) * 180 / Math.PI;
  const wTop = 2 * topR * Math.tan(Math.PI / n) + 0.6;
  const wBot = 2 * botR * Math.tan(Math.PI / n) + 0.6;
  const w = Math.max(wTop, wBot);
  const rMid = (topR + botR) / 2;
  const inset = t => 50 - 50 * (t / w);
  return Array.from({ length:n }, (_, i) => {
    const mix = Math.round(100 - (100 - lo * 100) * (1 - Math.cos(i * 2 * Math.PI / n)) / 2);
    return (
      <div key={`${key}${i}`} style={{
        position:"absolute", left:"50%", top:0, width:w, height:slant, marginLeft:-w / 2,
        backgroundColor:`var(${hue})`,
        background:`color-mix(in srgb, var(${hue}) ${mix}%, var(--ink0))`,
        backfaceVisibility:"hidden",
        clipPath:`polygon(${inset(wTop)}% 0%, ${100 - inset(wTop)}% 0%, ${100 - inset(wBot)}% 100%, ${inset(wBot)}% 100%)`,
        transform:`translateY(${yTop + h / 2 - slant / 2}px) rotateY(${i * 360 / n}deg) `
          + `translateZ(${rMid}px) rotateX(${-tilt}deg)`,
      }} />
    );
  });
}
function TrophyHero({ size = 190, plate = "FIELD DAY" }) {
  const S = size;
  const cupTop = 0.27 * S, cupBot = 0.115 * S;
  const parts = [
    { key:"rim",  topR:0.285 * S, botR:0.275 * S, h:0.045 * S, yTop:0.04 * S, n:20, hue:"--sun", lo:0.8 },
    { key:"cup",  topR:cupTop,    botR:cupBot,    h:0.29 * S,  yTop:0.085 * S, n:20, hue:"--sun" },
    { key:"neck", topR:cupBot,    botR:0.045 * S, h:0.045 * S, yTop:0.375 * S, n:16, hue:"--sun", lo:0.62 },
    { key:"stem", topR:0.042 * S, botR:0.042 * S, h:0.115 * S, yTop:0.42 * S,  n:14, hue:"--sun", lo:0.6 },
    { key:"coll", topR:0.05 * S,  botR:0.15 * S,  h:0.05 * S,  yTop:0.535 * S, n:18, hue:"--sun", lo:0.68 },
    { key:"base", topR:0.16 * S,  botR:0.16 * S,  h:0.045 * S, yTop:0.585 * S, n:20, hue:"--sun", lo:0.7 },
    { key:"blk",  topR:0.185 * S, botR:0.185 * S, h:0.1 * S,   yTop:0.63 * S,  n:22, hue:"--accent", lo:0.66 },
  ];
  return (
    <div style={{ width:S, height:S * 0.82, perspective:5.5 * S, flexShrink:0 }} aria-hidden="true">
      <div data-trophy style={{ position:"relative", width:"100%", height:"100%", transformStyle:"preserve-3d",
        transform:"rotateX(-8deg)", animation:"si-trophy 16s linear infinite" }}>
        {parts.map(p => trophyRing(p))}
        <div style={{ position:"absolute", left:"50%", top:0, width:0.55 * S, height:0.55 * S,
          marginLeft:-0.275 * S, borderRadius:"50%", backgroundColor:"var(--ink0)",
          transform:`translateY(${0.045 * S - 0.275 * S}px) rotateX(90deg)` }} />
        {[1, -1].map(dir => (
          <svg key={dir} width={S} height={S * 0.82} viewBox="0 0 100 82"
            style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--ink0)" strokeWidth="6.4" strokeLinecap="round"/>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round"/>
          </svg>
        ))}
        {[0, 180].map(deg => (
          <div key={deg} style={{ position:"absolute", left:"50%", top:0, width:0.3 * S, height:0.1 * S,
            marginLeft:-0.15 * S, display:"flex", alignItems:"center", justifyContent:"center",
            backfaceVisibility:"hidden", fontFamily:"var(--fd-display)", fontWeight:700, fontSize:0.052 * S,
            letterSpacing:"0.06em", color:"var(--bone)", whiteSpace:"nowrap",
            transform:`translateY(${0.63 * S}px) rotateY(${deg}deg) translateZ(${0.187 * S}px)` }}>
            {plate}</div>
        ))}
      </div>
    </div>
  );
}

/* the champion card: the same leader(s) phones crown, in chips */
function ChampionCard({ state, champion, coChamps }) {
  return (
    <div className="tv-champion">
      <div style={{ display:"flex", justifyContent:"center", margin:"-24px 0 -10px" }}>
        <TrophyHero size={250} plate="FIELD DAY" />
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:16 }}>
        {coChamps.map(c => <Avatar key={c.player} state={state} p={c.player} size={120}
          style={{ border:"3px solid var(--sun)" }} />)}
      </div>
      <div className="tv-champion-tag">Champion</div>
      <div className="tv-champion-name">{coChamps.map(c => disp(state, c.player)).join(" & ")}</div>
      <div className="tv-body">{fmt(champion.pts)} chips</div>
      {coChamps.length > 1 && <div className="tv-body" style={{ marginTop:8 }}>
        Tied. One pressure putt decides it.</div>}
    </div>
  );
}

function Masthead({ state, onDeckEv, showOnDeck, connection, lastUpdateAt }) {
  const offline = connection.mode === "reconnecting";
  const since = lastUpdateAt ? new Date(lastUpdateAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }) : null;
  return (
    <header className="tv-mast">
      <FDMark size={64} variant="night" />
      <div className="tv-display tv-mast-title">Field Day</div>
      <div className="tv-mast-edition">{editionLabel()}</div>
      {offline ? (
        <span className="tv-status is-offline" role="status"><i />
          {since ? `Reconnecting · last update ${since}` : "Reconnecting"}</span>
      ) : (
        <span className={`tv-status${state.live ? " is-live" : ""}`}><i />
          {state.live ? "Weekend live" : "Check-in"}</span>
      )}
      {showOnDeck && onDeckEv && (
        <div className="tv-ondeck">
          <span className="tv-label" style={{ color:"var(--live2)" }}>Betting open</span>
          <b>{onDeckEv.name}</b>
        </div>
      )}
    </header>
  );
}

function Ticker({ state, items }) {
  return (
    <div className="tv-ticker">
      <div className="tv-ticker-track" style={{ animationDuration:`${Math.max(28, items.length * 10)}s` }}>
        {[0, 1].map(k => (
          <span key={k} style={{ display:"inline-flex", alignItems:"center" }} aria-hidden={k === 1 || undefined}>
            {items.map((it, i) => (
              <span key={i} className="tv-ticker-item">
                <span className={`tv-ticker-tag${it.tone === "var(--sun)" ? " on-sun" : ""}`}
                  style={{ background:it.tone }}>{it.tag}</span>
                {(it.players || []).map(p => <Avatar key={p} state={state} p={p} size={34} />)}
                <span className="tv-ticker-text">{it.text}</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* all thirteen, the leader on sun with dark ink, rank arrows from the last move */
function StandingsBoard({ state, standings, allTied, rankDeltas = {}, title }) {
  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);
  return (
    <div className="tv-board">
      {title && <div className="tv-display tv-title" style={{ fontSize:56 }}>{title}</div>}
      {leader && (
        <div className="tv-leader">
          <div className="tv-rank">1</div>
          <Avatar state={state} p={leader.player} size={68} />
          <div>
            <div className="tv-name">{disp(state, leader.player)}</div>
            <div className="tv-sub">{leader.wins} win{leader.wins === 1 ? "" : "s"}
              {leader.betNet !== 0 ? ` · bets ${signed(leader.betNet)}` : ""}</div>
          </div>
          <Move delta={rankDeltas[leader.player]} />
          <div key={leader.pts} className="tv-pts" style={{ animation:"si-pop .5s ease-out" }}>{fmt(leader.pts)}</div>
        </div>
      )}
      <div className="tv-board-cols">
        {[rest.slice(0, half), rest.slice(half)].map((col, ci) => (
          <div key={ci} style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {col.map(r => (
              <div key={r.player} className={`tv-row${!allTied && r.rank === 2 ? " is-silver"
                : !allTied && r.rank === 3 ? " is-bronze" : ""}`}>
                <div className="tv-rank">{allTied ? "·" : r.rank}</div>
                <Avatar state={state} p={r.player} size={52} />
                <div className="tv-name">{disp(state, r.player)}</div>
                <Move delta={rankDeltas[r.player]} />
                <div key={r.pts} className="tv-pts" style={{ animation:"si-pop .5s ease-out" }}>{fmt(r.pts)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* compact standings rail beside a live event; during poker it lists the
   dealt starting chips and marks busted seats */
function Rail({ state, standings, allTied, rankDeltas = {}, poker = null }) {
  if (poker) {
    const rows = pokerTableRows(state, standings);
    return (
      <aside className="tv-rail">
        <div className="tv-rail-head tv-label">Starting chips</div>
        {rows.map(r => (
          <div key={r.player} className={`tv-rail-row${r.busted ? " is-out" : ""}`}>
            <Avatar state={state} p={r.player} size={36} />
            <span className="tv-name">{disp(state, r.player)}</span>
            {r.busted ? <span className="tv-out-tag">Out</span> : <span className="tv-pts">{fmt(r.starting)}</span>}
          </div>
        ))}
      </aside>
    );
  }
  return (
    <aside className="tv-rail">
      <div className="tv-rail-head tv-label">Standings</div>
      {standings.map((r, i) => (
        <div key={r.player} className={`tv-rail-row${i === 0 && !allTied ? " is-lead" : ""}`}>
          <span className="tv-rank">{allTied ? "·" : r.rank}</span>
          <Avatar state={state} p={r.player} size={36} />
          <span className="tv-name">{disp(state, r.player)}</span>
          <Move delta={rankDeltas[r.player]} />
          <span className="tv-pts">{fmt(r.pts)}</span>
        </div>
      ))}
    </aside>
  );
}

/* the current contest, large, with the chips riding each side. A bracket
   match IS the up-now banner: gold outline, round named once. */
function ContestBoard({ state, events, ev, contest }) {
  const open = (state.wagers || []).filter(w => wagerMatchesContest(w, contest)
    && resolveWager(state, w, events).status === "pending");
  const keyOf = w => contest.kind === "match" ? w.teamIdx : contest.kind === "ffa"
    ? (w.pickTeam ? contest.sides.find(side => side.players.length === w.pickPlayers?.length
      && side.players.every(p => w.pickPlayers.includes(p)))?.key : w.pick) : w.pickKey;
  const betting = contest.phase === "betting-open";
  const n = contest.sides.length;
  const compact = n > 4;
  const cols = n === 2 ? "1fr auto 1fr" : n <= 4 ? "1fr 1fr" : n <= 9 ? "repeat(3,1fr)" : "repeat(4,1fr)";
  const upNow = contest.kind === "match";
  const cards = contest.sides.map(side => {
    const bets = open.filter(w => keyOf(w) === side.key);
    const total = bets.reduce((sum, w) => sum + w.stake, 0);
    return (
      <div key={String(side.key)} className="tv-side">
        <AvatarStack state={state} players={side.players} size={compact ? 44 : 64} max={4} />
        <div className="tv-side-name">{side.players.map(p => disp(state, p)).join(" & ")}</div>
        <BetChipCluster chips={bets.map(w => ({ p:w.player, val:w.stake }))} size={compact ? 36 : 52} max={5} />
        <div className="tv-side-total">{total ? `${fmt(total)} in chips` : "No chips yet"}</div>
      </div>
    );
  });
  return (
    <div className={`tv-contest${upNow ? " is-up-now" : ""}`}>
      <div className="tv-display tv-contest-head">{upNow ? `Up now · ${contest.label}` : contest.label}</div>
      <div className={`tv-sides${compact ? " is-compact" : ""}`} style={{ gridTemplateColumns:cols }}>
        {n === 2 ? [cards[0], <div key="vs" className="tv-vs">VS</div>, cards[1]] : cards}
      </div>
      <div className="tv-contest-foot">{betting ? "Betting open" : "Bets locked"} · Winner pays {contest.kind === "ffa" ? "2 to 1" : "1 to 1"}</div>
    </div>
  );
}

function BracketStrip({ state, ev, hot }) {
  const rounds = bracketStrip(state, ev, hot);
  if (!rounds) return null;
  return (
    <div className="tv-strip" aria-label="Bracket">
      {rounds.map(round => (
        <div key={round.name} className="tv-strip-round">
          <div className="tv-label">{round.name}</div>
          <div className="tv-strip-matches">
            {round.matches.map(match => (
              <div key={match.key} className={`tv-strip-match${match.hot ? " is-hot" : ""}`}>
                {match.sides.map((side, i) => (
                  <div key={i} className={`tv-strip-side${side.won ? " is-won" : side.lost ? " is-lost" : ""}`}>
                    {side.players.length
                      ? <AvatarStack state={state} players={side.players} size={30} max={3} />
                      : <span className="tv-label">TBD</span>}
                    {side.won && <span className="tv-label">Won</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StageStrip({ state, ev }) {
  const st = state.stages?.[ev.id];
  if (!st) return null;
  return (
    <div className="tv-strip" aria-label={st.kind === "heats" ? "Heats" : "Pools"}>
      {st.groups.map((group, gi) => (
        <div key={gi} className="tv-strip-round">
          <div className="tv-label">{group.name}</div>
          <div className="tv-strip-match">
            <div className="tv-strip-side">
              {group.entrants.map(key => {
                const view = stageEntrantView(state, st, key);
                const through = (group.through || []).includes(key);
                return <span key={String(key)} style={{ opacity:group.through?.length && !through ? 0.35 : 1 }}>
                  <AvatarStack state={state} players={view.players} size={30} max={2} /></span>;
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdvanceMoment({ state, moment }) {
  return (
    <div className="tv-advance" role="status">
      <div className="tv-label">{moment.round}</div>
      <div style={{ display:"flex", gap:16 }}>
        {moment.players.map(p => <Avatar key={p} state={state} p={p} size={120} ring />)}
      </div>
      <div className="tv-display tv-advance-name">{moment.name}</div>
      <div key={moment.id} className="tv-display tv-advance-stamp">{moment.verb}</div>
    </div>
  );
}

function LeadChange({ state, leader, previous }) {
  if (!leader) return null;
  const names = leader.players.map(p => disp(state, p));
  return (
    <div className="tv-leadchange" role="status">
      <AvatarStack state={state} players={leader.players} size={48} max={3} />
      <b>{names.join(" and ")} {names.length > 1 ? "lead" : "leads"} · {fmt(leader.pts)}</b>
      {previous && (
        <span className="tv-prev">
          <AvatarStack state={state} players={previous.players} size={36} max={2} />
          {previous.players.map(p => disp(state, p)).join(" and ")}
        </span>
      )}
    </div>
  );
}

const ROW_STEP = 60;
/* one result, told twice: a podium climbing third to first, then all thirteen
   rows moving from where they stood to where they stand, each change split
   into the event award and the bets on it (poker: final stacks). */
function ResultSequence({ state, model, phase, directedStep = null }) {
  if (!model) return null;
  const unitText = item => item.unit === "stack" ? `${fmt(item.amount)} chips`
    : item.amount ? `+${fmt(item.amount)}${item.players.length > 1 ? " each" : ""}` : "";
  if (phase.phase === "podium") {
    const shown = new Set(model.revealOrder.slice(0, Math.min(model.revealOrder.length, phase.revealed)).map(p => p.place));
    const at = place => model.podium.find(item => item.place === place);
    return (
      <div className="tv-pane" style={{ paddingBottom:10 }}>
        <div className="tv-label" style={{ color:"var(--sun)", textAlign:"center" }}>
          Final · {model.eventName}{model.kind === "stacks" ? " · final stacks" : ""}</div>
        <div className="tv-podium">
          {[2, 1, 3].map(place => {
            const item = at(place);
            if (!item || !shown.has(place)) return <div key={place} className="tv-place-slot" />;
            return (
              <div key={place} className={`tv-place${place === 1 ? " is-first" : ""}`}>
                <div className="tv-label">{place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}</div>
                <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
                  {item.players.map(p => <Avatar key={p} state={state} p={p} size={place === 1 ? 128 : 92} ring={place === 1} />)}
                </div>
                <div className="tv-display tv-place-name">{teamLabel(state, { players:item.players })}</div>
                {unitText(item) && <div className="tv-place-amount">{unitText(item)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const order = phase.sorted ? model.rows.map(row => row.player) : model.beforeOrder;
  const leaderSet = new Set(model.leader?.players || []);
  return (
    <div className="tv-pane" style={{ paddingTop:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:24, height:70, marginBottom:6 }}>
        <div className="tv-display tv-title" style={{ fontSize:52 }}>
          {model.kind === "stacks" ? "Final stacks" : directedStep ? "Standings updated" : "Standings"}</div>
        <div className="tv-label">{model.eventName}</div>
        <div style={{ marginLeft:"auto" }}>
          {phase.sorted && model.leadChanged && <LeadChange state={state} leader={model.leader} previous={model.previousLeader} />}
        </div>
      </div>
      <div className="tv-move-list" style={{ height:ROW_STEP * model.rows.length }}>
        {model.rows.map(row => {
          const index = order.indexOf(row.player);
          const pts = phase.sorted ? row.after : row.before;
          const rank = phase.sorted ? row.rankAfter : row.rankBefore;
          return (
            <div key={row.player} className={`tv-move-row${phase.sorted && leaderSet.has(row.player) ? " is-lead" : ""}${row.busted ? " is-out" : ""}`}
              style={{ top:index * ROW_STEP }}>
              <span className="tv-rank">{rank}</span>
              {phase.sorted ? <Move delta={row.move} /> : <span className="tv-move" />}
              <Avatar state={state} p={row.player} size={40} />
              <span className="tv-name">{disp(state, row.player)}</span>
              {model.kind === "stacks" ? (
                <span className="tv-split">{row.busted ? "Busted" : `Started ${fmt(row.before)}`}</span>
              ) : (<>
                <span className="tv-split">{row.award ? <>Event <b>{signed(row.award)}</b></> : null}</span>
                <span className="tv-split">{row.bets ? <>Bets <b>{signed(row.bets)}</b></> : null}</span>
              </>)}
              <span key={pts} className="tv-pts">{fmt(pts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntroOverlay({ ev, EventSpotlight, phaseOf }) {
  const ph = phaseOf ? phaseOf(ev) : { bg:"var(--sun)" };
  return (
    <div className="tv-intro fd-night" role="status" aria-label={`Up next: ${ev.name}`}>
      <div className="tv-intro-band" style={{ background:ph.bg }} />
      <div className="tv-label" style={{ color:"var(--sun)" }}>Up next · {payoutLine(ev)}</div>
      {EventSpotlight ? <EventSpotlight gameId={ev.game} big /> : <GameMark id={ev.game} size={200} />}
      <div className="tv-display tv-intro-name">{ev.name}</div>
    </div>
  );
}

function TVPoker({ state, standings, now }) {
  const pk = state.poker;
  if (!pk) return null;
  if (!pk.startedAt) {
    return (
      <div className="tv-pane">
        <div style={{ display:"flex", alignItems:"center", gap:24, marginBottom:18 }}>
          <GameMark id="poker" size={84} />
          <div>
            <div className="tv-label">Championship Poker</div>
            <div className="tv-display" style={{ fontSize:56, color:"var(--bone)" }}>Starting chips</div>
          </div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <div className="tv-display" style={{ fontSize:64, color:"var(--sun)" }}>{fmt(pk.total)}</div>
            <div className="tv-label">chips in play</div>
          </div>
        </div>
        <div className="tv-buyin-grid">
          {pokerTableRows(state, standings).map(r => {
            const d = pokerDenoms(r.starting);
            return (
              <div key={r.player} className="tv-buyin-cell">
                <Avatar state={state} p={r.player} size={48} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="tv-name">{disp(state, r.player)}</div>
                  <div className="tv-denoms">{d.map(x => `${x.n} x ${x.v}`).join(" + ") || "0"}</div>
                </div>
                <div className="tv-display" style={{ fontSize:44, color:"var(--sun)" }}>{fmt(r.starting)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const clk = pokerClock(pk, now);
  return (
    <>
      <div className="tv-pane tv-center" style={{ gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <GameMark id="poker" size={64} />
          <span className="tv-label">Level {clk.idx + 1} of {pk.levels.length}</span>
        </div>
        <div className="tv-display tv-blinds">{fmt(clk.sb)} / {fmt(clk.bb)}</div>
        <div className="tv-label">Blinds</div>
        <div className={`tv-clock${!clk.paused && !clk.final && clk.msLeft < 60000 ? " is-late" : ""}`}>
          {clk.paused ? "Paused" : clk.final ? "Final level" : mmss(clk.msLeft)}</div>
        {clk.paused && <div className="tv-body">{mmss(clk.msLeft)} left in this level</div>}
        <div className="tv-body">{ROSTER.length - pk.outs.length} still in</div>
      </div>
      <Rail state={state} standings={standings} poker />
    </>
  );
}

/* the draft, broadcast style: the on-the-clock captain, the last pick, the
   team columns filling, the pool waiting. Flat outline, no pulsing glow. */
function TVDraft({ state, ev, d }) {
  const T = d.teams.length;
  const poolEmpty = d.pool.length === 0;
  const onClock = poolEmpty ? -1 : snakeTeam(d.picks.length, T);
  const cur = onClock >= 0 ? d.teams[onClock].captain : null;
  const last = d.picks[d.picks.length - 1];
  const round = Math.floor(d.picks.length / T) + 1;
  return (
    <div className="tv-pane">
      <div style={{ display:"flex", alignItems:"center", gap:26, marginBottom:16 }}>
        {poolEmpty ? (
          <div className="tv-display" style={{ fontSize:60, color:"var(--sun)" }}>Draft complete</div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <Avatar state={state} p={cur} size={96} ring />
            <div>
              <div className="tv-label">{ev.name} draft · round {round}, pick {d.picks.length + 1}</div>
              <div className="tv-display" style={{ fontSize:60, color:"var(--bone)" }}>{disp(state, cur)} is on the clock</div>
            </div>
          </div>
        )}
        {last && (
          <div key={d.picks.length} className="tv-card" style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:16,
            padding:"12px 22px", border:"2px solid var(--ink)", animation:"si-flag .55s ease-out both" }}>
            <span className="tv-label">Pick {d.picks.length}</span>
            <Avatar state={state} p={last.player} size={56} />
            <div>
              <div className="tv-display" style={{ fontSize:36 }}>{disp(state, last.player)}</div>
              <div className="tv-label">to {disp(state, d.teams[last.team].captain)}</div>
            </div>
          </div>
        )}
      </div>
      <div className="tv-draft-cols" style={{ gridTemplateColumns:`repeat(${T},1fr)` }}>
        {d.teams.map((t, i) => (
          <div key={i} className={`tv-draft-team${i === onClock ? " is-clock" : ""}`}>
            <div style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:10, marginBottom:8,
              borderBottom:"1.5px solid var(--ink)" }}>
              <Avatar state={state} p={t.captain} size={40} />
              <span className="tv-display" style={{ fontSize:32, flex:1, overflow:"hidden", textOverflow:"ellipsis",
                whiteSpace:"nowrap" }}>{disp(state, t.captain)}</span>
              <span className="tv-display" style={{ fontSize:30, color:"var(--muted)" }}>{t.players.length}</span>
            </div>
            {t.players.map(p => (
              <div key={p} className="tv-draft-player">
                <Avatar state={state} p={p} size={36} /><span>{disp(state, p)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {!poolEmpty && (
        <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:14 }}>
          <span className="tv-label" style={{ flexShrink:0 }}>Still available</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {d.pool.map(p => <Avatar key={p} state={state} p={p} size={44} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function DirectedScene({ state, events, scene, now, standings, rankDeltas, reducedMotion }) {
  const kind = scene.active.kind;
  if (kind === "standings")
    return <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={false}
      rankDeltas={rankDeltas} title="Standings" /></div>;
  if (kind === "champion") {
    const coChamps = scene.standings.filter(row => row.rank === 1);
    return <div className="tv-pane tv-center"><ChampionCard state={state} champion={scene.standings[0]} coChamps={coChamps} /></div>;
  }
  if (kind === "opening") {
    return (
      <div className="tv-pane tv-center">
        <FDMark size={scene.stepKey === "title" ? 150 : 120} variant="night" />
        <div className="tv-display" style={{ fontSize:170, lineHeight:0.82, color:"var(--sun)", marginTop:26 }}>Field Day</div>
        <div className="tv-mast-edition" style={{ fontSize:32, marginTop:22 }}>{editionLabel()}</div>
      </div>
    );
  }
  if (kind === "winner") {
    const model = resultPresentation(state, events, scene.active.eventId);
    const anchor = scene.stepKey === "standings" ? Number(scene.active.updatedAt) : Number(scene.active.startedAt);
    const phase = resultMomentPhase(anchor, now, { reducedMotion, step:scene.stepKey });
    return <ResultSequence state={state} model={model} phase={phase} directedStep={scene.stepKey} />;
  }
  return null;
}

/* ═════════════ the TV ═════════════ */
function TVMode({ standings, state, events, onDeckEv, allTied, champion, coChamps, showControlEnabled,
  rankDeltas = {}, connection: connectionInput = {}, onExit, EventSpotlight, phaseOf, now: nowOverride }) {
  const tickNow = useServerNow(nowOverride === undefined ? 1000 : 0);
  const now = nowOverride ?? tickNow;
  const fit = useCanvasFit();
  const reducedMotion = reducedMotionNow();
  const connection = tvConnection(connectionInput);
  const lastUpdateAt = useLastUpdate(connectionInput.version);

  const operation = useMemo(() => resolveWeekendOperation(state, events), [state, events]);
  const showScene = useMemo(() => showControlEnabled ? resolveShowScene(state, events) : null,
    [showControlEnabled, state, events]);
  const sceneView = tvSceneView(showScene, now);
  const operationEv = operation.event;
  const operationLifecycle = operation.lifecycle;

  const liveBracketEv = useMemo(() => {
    const c = events.filter(e => state.brackets[e.id] && state.draws[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const liveStageEv = useMemo(() => {
    const c = events.filter(e => state.stages[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const draftLive = useMemo(() => {
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      const ev = events.find(e => e.id === eid);
      if (ev && d) return { ev, d };
    }
    return null;
  }, [state.drafts, events]);
  const latest = useMemo(() => latestResultOf(state, events), [state, events]);
  const nextEv = events.find(e => !state.results[e.id] && !state.shelved[e.id] && e.id !== operationEv?.id);
  const allW = useMemo(() => (state.wagers || []).map(w => ({ w, r:resolveWager(state, w, events) })),
    [state, events]);
  const openBook = mergeWagerLines(allW.filter(x => x.r.status === "pending")).slice(0, 9);
  const joinNeeded = Object.keys(state.profiles || {}).length < ROSTER.length;
  const qrUrl = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(window.location.origin);
      qr.make();
      return qr.createDataURL(8, 0);
    } catch { return null; }
  }, []);

  const lifecycleLive = operationEv && ["betting-locked", "in-progress", "result-entry"].includes(operationLifecycle?.phase);
  const liveEv = onDeckEv || liveBracketEv || liveStageEv || (lifecycleLive ? operationEv : null);
  const activeBracketEv = liveEv && state.brackets[liveEv.id] && state.draws[liveEv.id] ? liveEv : null;
  const activeStageEv = liveEv && state.stages[liveEv.id] ? liveEv : null;
  const liveCrew = (liveEv && state.draws[liveEv.id]?.roles) || draftLive?.d.roles || [];
  const upNext = activeBracketEv ? nextOpenMatch(state.brackets[activeBracketEv.id]) : null;
  const upNextDraw = activeBracketEv ? state.draws[activeBracketEv.id] : null;
  const liveContest = liveEv ? resolveCurrentContest(state, liveEv) : null;
  const advance = liveEv ? advanceMoment(state, liveEv, now) : null;

  const resultMoment = resultMomentFor(state, events, now, sceneView, showScene);
  const resultModel = useMemo(() => resultMoment ? resultPresentation(state, events, resultMoment.eventId) : null,
    [state, events, resultMoment?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a lead change outside a result moment still gets its card */
  const leaderKey = !allTied && standings[0] ? standings.filter(r => r.rank === 1).map(r => r.player).sort().join("+") : "";
  const leadRef = useRef(null);
  const [leadCard, setLeadCard] = useState(null);
  useEffect(() => {
    const prev = leadRef.current;
    leadRef.current = { key:leaderKey, players:standings.filter(r => r.rank === 1).map(r => r.player), pts:standings[0]?.pts };
    if (prev === null || !leaderKey || prev.key === leaderKey || state.frozen) return;
    setLeadCard({ leader:{ players:leadRef.current.players, pts:standings[0].pts },
      previous:prev.key ? { players:prev.players, pts:prev.pts } : null, until:now + TV_LEAD_CHANGE_MS });
  }, [leaderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ambient = useMemo(() => {
    const s = ["board"];
    if (champion) return s;
    if (joinNeeded && qrUrl) s.push("join");
    if (nextEv) s.push("next");
    if (latest) s.push("latest");
    if (openBook.length) s.push("book");
    return s;
  }, [champion, joinNeeded, qrUrl, nextEv, latest, openBook.length]);
  /* server time picks the card, so every TV in the house shows the same one;
     reduced motion still rotates, it just cuts instead of fading */
  const scene = ambient[ambientIndex(ambient.length, now)] || "board";

  const items = tickerItems({ state, events, standings, allTied, draftLive, liveCrew, latest, upNext, upNextDraw,
    onDeckEv, openWon:mergeWagerLines(allW.filter(x => x.r.status === "won")), nextEv, now });

  const directed = sceneView?.covers && sceneView.mode === "scene";
  const introEv = sceneView?.mode === "intro-overlay" ? events.find(e => e.id === sceneView.eventId) : null;
  const showTicker = !(directed && sceneView.ticker === false) && connection.mode !== "loading";

  let content, liveShown = false;
  if (connection.mode === "loading") {
    content = <div className="tv-pane tv-center" role="status">
      <FDMark size={120} variant="night" />
      <div className="tv-display" style={{ fontSize:72, color:"var(--bone)", marginTop:24 }}>Connecting</div>
    </div>;
  } else if (directed) {
    content = <DirectedScene state={state} events={events} scene={showScene} now={now}
      standings={standings} rankDeltas={rankDeltas} reducedMotion={reducedMotion} />;
  } else if (champion) {
    content = <div className="tv-pane tv-center"><ChampionCard state={state} champion={champion} coChamps={coChamps} /></div>;
  } else if (resultModel) {
    content = <ResultSequence state={state} model={resultModel}
      phase={resultMomentPhase(resultMoment.anchor, now, { reducedMotion })} />;
  } else if (state.poker && !state.results[state.poker.id]) {
    content = <TVPoker state={state} standings={standings} now={now} />;
  } else if (draftLive) {
    content = <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />;
  } else if (liveEv) {
    liveShown = true;
    const inContest = liveContest && ["betting-open", "betting-locked", "in-progress"].includes(liveContest.phase);
    content = <>
      <div className="tv-pane" style={{ position:"relative" }}>
        <div className="tv-live-head">
          <GameMark id={liveEv.game} size={88} />
          <div>
            <div className="tv-label">{operationEv?.id === liveEv.id && operationLifecycle
              ? operationLifecycle.label : onDeckEv ? "Betting open" : "Live"}</div>
            <div className="tv-display tv-live-name">{liveEv.name}</div>
          </div>
        </div>
        {inContest ? <ContestBoard state={state} events={events} ev={liveEv} contest={liveContest} />
          : (
            <div className="tv-card tv-center" style={{ flex:1, padding:36 }}>
              <div className="tv-label">{operationLifecycle?.label}</div>
              <div className="tv-display" style={{ fontSize:64, color:"var(--bone)", margin:"10px 0" }}>{liveEv.name}</div>
              <div className="tv-body">{operationLifecycle?.nextAction?.label || "Waiting for the commissioner"}</div>
            </div>
          )}
        {activeBracketEv && <BracketStrip state={state} ev={activeBracketEv} hot={upNext ? [upNext.r, upNext.m] : null} />}
        {!activeBracketEv && activeStageEv && <StageStrip state={state} ev={activeStageEv} />}
        {advance && <AdvanceMoment state={state} moment={advance} />}
      </div>
      <Rail state={state} standings={standings} allTied={allTied} rankDeltas={rankDeltas} />
    </>;
  } else if (scene === "join") {
    content = <div className="tv-pane tv-center" style={{ flexDirection:"row", gap:110 }}>
      <div style={{ textAlign:"left" }}>
        <FDMark size={130} variant="night" />
        <div className="tv-display" style={{ fontSize:140, lineHeight:0.9, color:"var(--sun)", margin:"26px 0 10px" }}>Field<br />Day</div>
        <div className="tv-mast-edition" style={{ fontSize:28 }}>{editionLabel()}</div>
        <div className="tv-body" style={{ color:"var(--bone)", marginTop:22 }}>Scan to check in.</div>
      </div>
      <div className="tv-qr">
        <img src={qrUrl} alt="Scan to join" />
        <div className="tv-display" style={{ fontSize:28, color:"var(--ink0)", marginTop:10 }}>Player check-in</div>
      </div>
    </div>;
  } else if (scene === "next" && nextEv) {
    const ph = phaseOf ? phaseOf(nextEv) : { bg:"var(--paper2)", fg:"var(--ink)" };
    content = <div className="tv-pane tv-center">
      <div className="tv-label" style={{ marginBottom:18 }}>Next up</div>
      <GameMark id={nextEv.game} size={130} />
      <div style={{ background:ph.bg, color:ph.fg, border:"2px solid var(--ink0)", borderRadius:16,
        padding:"44px 90px", marginTop:20, maxWidth:1200 }}>
        <div className="tv-display" style={{ fontSize:110, lineHeight:0.95 }}>{nextEv.name}</div>
        <div style={{ font:"700 30px/1.2 var(--fd-body)", marginTop:14 }}>{payoutLine(nextEv)}</div>
      </div>
      {nextEv.desc && <div className="tv-body" style={{ marginTop:22, maxWidth:1100 }}>{nextEv.desc}</div>}
    </div>;
  } else if (scene === "latest" && latest) {
    const model = resultPresentation(state, events, latest.ev.id);
    content = model ? <ResultSequence state={state} model={model} phase={{ phase:"podium", revealed:3 }} /> : null;
  } else if (scene === "book") {
    content = <div className="tv-pane tv-center">
      <div className="tv-label">Betting</div>
      <div className="tv-display" style={{ fontSize:64, color:"var(--bone)", marginBottom:24 }}>
        {openBook.length} open wager{openBook.length === 1 ? "" : "s"}</div>
      <div style={{ display:"grid", gridTemplateColumns:openBook.length > 4 ? "1fr 1fr 1fr" : "1fr", gap:"12px 24px",
        width:"100%", maxWidth:1700, textAlign:"left" }}>
        {openBook.map(x => {
          const l = wagerPickLabel(state, x.w, events);
          return (
            <div key={x.w.id} className="tv-card" style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 18px" }}>
              <Avatar state={state} p={x.w.player} size={48} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ font:"700 26px/1.2 var(--fd-body)", color:"var(--ink)" }}>
                  {disp(state, x.w.player)} put {fmt(x.w.stake)} on {l.pick}</div>
                <div className="tv-denoms" style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.ctx}</div>
              </div>
              <span className="tv-display" style={{ fontSize:34, color:"var(--olive)" }}>
                +{fmt(wagerMult(x.w) * x.w.stake)}</span>
            </div>
          );
        })}
      </div>
    </div>;
  } else {
    content = <div className="tv-pane"><StandingsBoard state={state} standings={standings} allTied={allTied}
      rankDeltas={rankDeltas} /></div>;
  }

  const showLeadCard = leadCard && now < leadCard.until && !directed && !resultModel && !champion;

  return (
    <div className="tv-stage fd-night">
      <div className="tv-canvas" data-tv-canvas
        style={{ left:fit.left, top:fit.top, transform:`scale(${fit.scale})` }}>
        <Masthead state={state} onDeckEv={onDeckEv} connection={connection} lastUpdateAt={lastUpdateAt}
          showOnDeck={!champion && !directed && !liveShown} />
        <main className="tv-main" style={connection.mode === "reconnecting" ? { opacity:0.72 } : undefined}>
          {content}
          {showLeadCard && <div className="tv-leadchange-float">
            <LeadChange state={state} leader={leadCard.leader} previous={leadCard.previous} /></div>}
        </main>
        {showTicker && <Ticker state={state} items={items} />}
        {introEv && <IntroOverlay ev={introEv} EventSpotlight={EventSpotlight} phaseOf={phaseOf} />}
      </div>
      <button type="button" className="tv-exit" onClick={onExit} aria-label="Exit TV mode">Exit TV</button>
    </div>
  );
}

/* local wall time of the last snapshot, for the reconnecting label */
function useLastUpdate(version) {
  const [at, setAt] = useState(null);
  useEffect(() => { if (version) setAt(Date.now()); }, [version]);
  return at;
}

export { TVMode, ChampionCard, TrophyHero };
