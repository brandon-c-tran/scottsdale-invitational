import React, { useState } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { rosterOf, SIZES, AIRLINES, arrivalsOpen, hasArrived, cleanLeg, legText, legTime } from "../../../shared/core.js";
import { landedAt } from "../arrivals/arrivalsModel.js";
import { serverNow } from "../../lib/serverClock.js";
import { jerseyConfirmed, jerseyName } from "../../../shared/guestSetup.js";
import { DISPLAY, SANS, GOLD_GRAD, label } from "../../ui/theme.js";
import { Btn } from "../../ui/controls.jsx";
import "./travel.css";

/* ─────────── everyone flies in ───────────
   Stylized US, positions from real longitude/latitude, every route drawing
   itself into Scottsdale and a chip running the line behind it. */
/* everything is real geography, projected once: x = (lon+125)/55, y = (49-lat)/24.
   The country is drawn as a dot field rather than a traced coastline, so it
   reads as a map at a glance without a hand-drawn outline to get wrong. */
const geo = (lon, lat) => [(lon + 125) / 55 * 100, (49 - lat) / 24 * 100];

const US_LL = [
  [-124.7,48.4],[-124.2,43.3],[-122.4,37.8],[-120.6,34.5],[-117.1,32.5],[-114.7,32.7],
  [-111.0,31.3],[-108.2,31.3],[-106.5,31.8],[-104.5,29.7],[-103.0,29.0],[-99.1,26.4],
  [-97.1,25.9],[-95.0,29.0],[-93.8,29.7],[-91.0,29.2],[-89.0,29.2],[-88.0,30.3],
  [-85.0,29.7],[-84.0,30.0],[-82.8,27.9],[-82.0,26.5],[-80.4,25.2],[-80.1,27.0],
  [-81.4,30.7],[-79.2,33.0],[-77.0,35.0],[-75.5,37.0],[-75.5,39.0],[-74.0,40.5],
  [-71.5,41.3],[-70.0,42.0],[-70.7,43.5],[-67.0,44.8],[-71.5,45.0],[-76.0,44.0],
  [-79.0,43.3],[-83.0,42.0],[-83.5,45.8],[-88.0,48.2],[-95.0,49.0],[-104.0,49.0],
  [-117.0,49.0],
].map(([lo, la]) => geo(lo, la));

const inUS = (x, y) => {
  let hit = false;
  for (let i = 0, j = US_LL.length - 1; i < US_LL.length; j = i++) {
    const [xi, yi] = US_LL[i], [xj, yj] = US_LL[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

const US_DOTS = (() => {
  const step = 2.6, out = [];
  for (let y = 1; y < 100; y += step)
    for (let x = 1; x < 100; x += step) if (inUS(x, y)) out.push([x, y]);
  return out;
})();

const TRAVEL_CITIES = [
  { n:"San Francisco", ll:[-122.4,37.8], dx:3.6,  dy:-4.2, a:"start" },
  { n:"San Diego",     ll:[-117.2,32.7], dx:-1,   dy:6.6,  a:"middle" },
  { n:"Tulsa",         ll:[-96.0,36.2],  dx:0,    dy:-4.6, a:"middle" },
  { n:"Dallas",        ll:[-96.8,32.8],  dx:4,    dy:1.2,  a:"start" },
  { n:"Austin",        ll:[-97.7,30.3],  dx:-4,   dy:1.2,  a:"end" },
  { n:"Baton Rouge",   ll:[-91.2,30.5],  dx:4,    dy:1.2,  a:"start" },
  { n:"New York",      ll:[-74.0,40.7],  dx:-4.5, dy:-4.6, a:"end" },
].map(c => { const [x, y] = geo(...c.ll); return { ...c, x, y }; });

const TRAVEL_DEST = (() => { const [x, y] = geo(-111.9, 33.5); return { x, y }; })();

function TravelMap() {
  const arc = c => {
    const mx = (c.x + TRAVEL_DEST.x) / 2;
    const lift = 9 + Math.abs(c.x - TRAVEL_DEST.x) * 0.3;
    return `M${c.x} ${c.y} Q${mx} ${Math.min(c.y, TRAVEL_DEST.y) - lift} ${TRAVEL_DEST.x} ${TRAVEL_DEST.y}`;
  };
  return (
    <svg viewBox="-5 -3 110 104" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
      aria-hidden="true" style={{ display:"block", overflow:"hidden", maxWidth:"100%", maxHeight:"100%" }}>
      <g style={{ animation:"si-fade .8s ease-out both" }}>
        {US_DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.62" fill="var(--muted)" opacity="0.45" />)}
      </g>
      {TRAVEL_CITIES.map((c, i) => (
        <path key={"r" + c.n} d={arc(c)} fill="none" stroke="var(--accent2)" strokeWidth="0.8"
          strokeLinecap="round" strokeDasharray="140" pathLength="140"
          style={{ "--len":140, animation:`si-route 1.1s ease-out ${0.3 + i * 0.18}s both` }} />
      ))}
      {/* the travelling chips. animateMotion translates from the element's own
          position, so these must stay at the origin (any cx/cy would double up
          and throw them off the map). Hidden until their leg begins, or all
          seven stack up in the corner waiting. */}
      {TRAVEL_CITIES.map((c, i) => (
        <circle className="fd-travel-motion" key={"m" + c.n} r="1.7" fill="var(--sun)" stroke="var(--ink0)"
          strokeWidth="0.5" opacity="0">
          <set attributeName="opacity" to="1" begin={`${1.2 + i * 0.18}s`} />
          <animateMotion dur="3.6s" begin={`${1.2 + i * 0.18}s`} repeatCount="indefinite" path={arc(c)} />
        </circle>
      ))}
      {TRAVEL_CITIES.map((c, i) => (
        <g key={c.n} style={{ animation:`si-in .4s ease-out ${i * 0.18}s both` }}>
          <circle cx={c.x} cy={c.y} r="1.9" fill="var(--paper)" stroke="var(--bone)" strokeWidth="0.9"/>
          <text x={c.x + c.dx} y={c.y + c.dy} textAnchor={c.a} fontFamily={SANS} fontWeight="700"
            fontSize="3.4" fill="var(--muted2)" letterSpacing="0.15">{c.n.toUpperCase()}</text>
        </g>
      ))}
      <circle cx={TRAVEL_DEST.x} cy={TRAVEL_DEST.y} r="4.6" fill="none" stroke="var(--sun)" strokeWidth="0.9"
        style={{ animation:"si-land 2.2s ease-in-out infinite" }} />
      <circle cx={TRAVEL_DEST.x} cy={TRAVEL_DEST.y} r="2.8" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="0.8"/>
      <text x={TRAVEL_DEST.x} y={TRAVEL_DEST.y - 8} textAnchor="middle" fontFamily={DISPLAY} fontWeight="700"
        fontSize="6" fill="var(--signal-text, var(--sun))" letterSpacing="0.3">SCOTTSDALE</text>
    </svg>
  );
}

/* The venue is a reveal, not a diagram. The real overhead shot communicates
   the house, pool, pickleball, basketball, and volleyball in one clean frame. */
function HouseArt() {
  return (
    <div style={{ position:"relative", aspectRatio:"16 / 9", background:"var(--paper2)", overflow:"hidden" }}>
      <img src="/airbnb-compound-field-day.webp" alt=""
        width="1440" height="810" loading="eager" decoding="async"
        style={{ width:"100%", height:"100%", display:"block", objectFit:"cover",
          filter:"saturate(.94) contrast(1.02)" }} />
    </div>
  );
}

/* Two cards, each one subject. The house owns its own check-in window, so
   nobody has to work out what those times belong to; travel owns the airport
   and the host's flights, since both are about getting there. */
const CARD = { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14,
  marginBottom:12, overflow:"hidden" };

/* the label-over-value pair, used by both split rows */
function InfoCell({ lb, v, first }) {
  return (
    <div style={{ flex:1, minWidth:0, padding:"11px 14px",
      borderLeft: first ? "none" : "1px solid var(--line)" }}>
      <div style={{ ...label, marginBottom:4 }}>{lb}</div>
      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--ink)",
        lineHeight:1.35 }}>{v}</div>
    </div>
  );
}

function VenueCard({ lg, compact = false }) {
  const mapUrl = lg.venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lg.venue)}` : null;
  const inL = cleanLeg(lg.hostIn), outL = cleanLeg(lg.hostOut);
  const hostLegs = [
    inL && ["Lands", inL.note || (legTime(inL.time) && `Fri ${legTime(inL.time)}`)],
    outL && ["Leaves", outL.note || (legTime(outL.time) && `Sun ${legTime(outL.time)}`)],
  ].filter(x => x && x[1]);
  return (
    <div>
      <div style={CARD}>
        {!compact && <HouseArt />}
        <div style={{ padding:"12px 14px", borderTop:compact ? undefined : "1px solid var(--line)" }}>
          <div style={{ ...label, marginBottom:5 }}>The house</div>
          {/* the address ships in core, so there is no honest empty state to
              write copy for: if it is somehow blank, say nothing */}
          {lg.venue && <div style={{ fontFamily:SANS, fontWeight:600, fontSize:15.5, lineHeight:1.45,
            userSelect:"text", color:"var(--ink)" }}>{lg.venue}</div>}
          {lg.venueNote && <div style={{ fontFamily:SANS, fontSize:13, color:"var(--muted2)", marginTop:5,
            lineHeight:1.5 }}>{lg.venueNote}</div>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:4, minHeight:44, marginTop:2, fontFamily:SANS, fontWeight:600, fontSize:15,
                color:"var(--lamp-info)", textDecoration:"none" }}>Open in Maps<Icon name="open" size={16} /></a>
          )}
        </div>
        {(lg.checkIn || lg.checkOut) && (
          <div style={{ display:"flex", borderTop:"1px solid var(--line)" }}>
            <InfoCell lb="Check in" v={lg.checkIn || "TBD"} first />
            <InfoCell lb="Checkout" v={lg.checkOut || "TBD"} />
          </div>
        )}
      </div>
      {(lg.airport || hostLegs.length > 0) && (
        <div style={CARD}>
          {lg.airport && (
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px" }}>
              <span style={{ display:"flex", flexShrink:0, color:"var(--accent2)" }}><Icon name="plane" size={20} lit /></span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ ...label, marginBottom:3 }}>Fly into</div>
                <div style={{ fontFamily:SANS, fontSize:13, color:"var(--muted2)" }}>{lg.airportName}</div>
              </div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, letterSpacing:"0.06em",
                color:"var(--signal-text, var(--sun))", lineHeight:1 }}>{lg.airport}</div>
            </div>
          )}
          {hostLegs.length > 0 && (
            /* the flight codes matter to nobody but Brandon; the times are how
               people work out who they are sharing a ride with */
            <div style={{ borderTop: lg.airport ? "1px solid var(--line)" : "none" }}>
              <div style={{ ...label, padding:"10px 14px 0" }}>My flights</div>
              <div style={{ display:"flex" }}>
                {hostLegs.map(([lb, v], i) => <InfoCell key={lb} lb={lb} v={v} first={i === 0} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* The editable flight. Dressed as a boarding pass this read as something
   already filled in, so entry gets real bordered fields with captions under
   them: three boxes on a page of cards say "type here" without a word. */
function FlightEntry({ leg: raw, dir, setLeg }) {
  const leg = raw || {};
  const set = patch => setLeg({ ...leg, ...patch });
  const box = { background:"var(--paper)", border:"1.5px solid var(--line)", borderRadius:10,
    height:48, display:"flex", alignItems:"center", padding:"0 8px", boxSizing:"border-box" };
  const bare = { background:"none", border:"none", padding:0, minWidth:0,
    width:"100%", height:"100%", minHeight:44, boxSizing:"border-box", color:"var(--ink)" };
  const cap = { ...label, marginTop:5, color:"var(--muted)" };
  return (
    <div className="fd-flight-entry-wrap"><div className="fd-flight-entry">
      <div style={{ minWidth:0 }}>
        <div style={box}>
          <input value={leg.air || ""} list="fd-airlines" placeholder="UA" autoCapitalize="characters"
            aria-label="Airline"
            onChange={e => set({ air: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) })}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:16, letterSpacing:"0.1em" }} />
        </div>
        <div style={cap}>Airline</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={box}>
          <input value={leg.num || ""} inputMode="numeric" placeholder="1885" aria-label="Flight number"
            onChange={e => set({ num: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:16 }} />
        </div>
        <div style={cap}>Flight no.</div>
      </div>
      <div className="fd-flight-time" style={{ minWidth:0 }}>
        <div style={box}>
          <input type="time" value={leg.time || ""} onChange={e => set({ time: e.target.value })}
            aria-label={dir === "out" ? "Departure time" : "Landing time"}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:16,
              color: leg.time ? "var(--ink)" : "var(--muted)" }} />
        </div>
        <div style={cap}>{dir === "out" ? "Takes off" : "Lands"}</div>
      </div>
    </div></div>
  );
}

/* One boarding pass, read only: this is how a saved leg prints back. A row
   of the flights board: who (their photo chip, `person`, else the plane),
   the flight code, then the time and which way. `codeless` keeps a code
   out (the host's: only his times matter to anyone else). */
function FlightPass({ leg: raw, dir, small, edit, setLeg, person = null, codeless = false }) {
  if (edit) return <FlightEntry leg={raw} dir={dir} setLeg={setLeg} />;
  const leg = cleanLeg(raw);
  if (!leg) return null;
  if (leg.note) return (
    <div className="fd-flight-pass is-note">{person}<span className="fd-flight-pass-note">{leg.note}</span></div>
  );
  const t = legTime(leg.time);
  return (
    <div className={`fd-flight-pass${small ? " is-small" : ""}`}>
      <span className="fd-flight-pass-who">{person || <Icon name="plane" size={small ? 16 : 18} lit />}</span>
      {!codeless && <span className="fd-flight-pass-code">{leg.air && <small>{leg.air}</small>}{leg.num && <b>{leg.num}</b>}</span>}
      <span className="fd-flight-pass-when">
        {t && <b>{t}</b>}
        <small>{dir === "out" ? "Leaves Sun" : "Lands Fri"}</small>
      </span>
    </div>
  );
}

/* label, a way out, and the pass */
function LegField({ lb, dir, leg, setLeg }) {
  const filled = leg && (leg.air || leg.num || leg.time);
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
        <span style={label}>{lb}</span>
        {filled && (
          <button onClick={() => setLeg(null)} style={{ marginLeft:"auto", background:"none",
            border:"none", cursor:"pointer", minHeight:44, minWidth:44, padding:0, fontFamily:SANS, fontWeight:700, fontSize:12,
            letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted)" }}>Clear</button>
        )}
      </div>
      <FlightPass leg={leg} dir={dir} edit setLeg={setLeg} />
    </div>
  );
}

/* the carrier list both editors share */
function TravelLists() {
  return <datalist id="fd-airlines">{AIRLINES.map(a => <option key={a} value={a} />)}</datalist>;
}

/* one apparel size. Brandon uses the T-shirt answer for the jersey too. */
function SizeRow({ lb, value, onPick, allowClear }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ ...label, marginBottom:6 }}>{lb}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5 }}>
        {SIZES.map(sz => (
          <button key={sz} onClick={() => onPick(allowClear && value === sz ? null : sz)}
            aria-label={`${lb}: ${sz}`} aria-pressed={value === sz}
            style={{ fontFamily:SANS, fontWeight:700, fontSize:13, height:48, padding:0, borderRadius:10,
              cursor:"pointer", background: value === sz ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)",
              color: value === sz ? "var(--ink0)" : "var(--ink)",
              border: value === sz ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{sz}</button>
        ))}
      </div>
    </div>
  );
}

/* travel entry, shared by onboarding and the profile sheet. Ask the question
   outright and give it two equal answers: a quiet link next to a form reads
   as decoration, and whoever has not booked cannot tell it is meant for them.
   Nothing shows until you answer, so the question IS the instruction. */
function TravelFields({ booked, setBooked, flightIn, setFlightIn, flightOut, setFlightOut }) {
  const opt = on => ({ fontFamily:SANS, fontWeight:700, fontSize:14, height:48, padding:0,
    borderRadius:10, cursor:"pointer",
    background: on ? `var(--selection-fill, ${GOLD_GRAD})` : "var(--paper2)", color: on ? "var(--ink0)" : "var(--ink)",
    border: on ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" });
  return (
    <div>
      <TravelLists />
      {/* a field prompt, not a second headline: the panel title above is the
          display face, so the questions inside it are set in the body face */}
      <div style={{ fontFamily:SANS, fontWeight:600, fontSize:15, color:"var(--ink)",
        marginBottom:8 }}>Booked your flights?</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:14 }}>
        <button onClick={() => setBooked(true)} aria-pressed={booked === true} style={opt(booked === true)}>Yes</button>
        <button onClick={() => { setBooked(false); setFlightIn(null); setFlightOut(null); }}
          aria-pressed={booked === false} style={opt(booked === false)}>Not yet</button>
      </div>
      {booked === true && (
        <>
          <LegField lb="Landing Friday" dir="in" leg={flightIn} setLeg={setFlightIn} />
          <LegField lb="Leaving Sunday" dir="out" leg={flightOut} setLeg={setFlightOut} />
        </>
      )}
      {booked === false && (
        <div style={{ fontFamily:SANS, fontSize:13.5, color:"var(--muted2)", lineHeight:1.55,
          marginBottom:12 }}>
          Once you book, tap your player icon in the header to add your flights.
        </div>
      )}
    </div>
  );
}

/* everything Brandon orders and plans from, as tab-separated text: it pastes
   straight into a spreadsheet or a supplier form. Blanks stay blank, because
   a guessed size is worse than a missing one. */
function sheetText(state) {
  const head = ["Player", "Name", "No", "T-shirt / Jersey", "Jersey name", "Jersey confirmed", "Flights booked",
    "Chip", "Skin", "Lands Fri", "Leaves Sun", "Venmo", "Drinking", "Food or drink needs"];
  const rows = rosterOf(state).map(p => {
    const pr = state.profiles?.[p] || {};
    /* the column already says which leg it is, so the cell is just the flight */
    const t = leg => {
      const l = cleanLeg(leg);
      if (!l) return "";
      if (l.note) return l.note;
      return [[l.air, l.num].filter(Boolean).join(" "), legTime(l.time)].filter(Boolean).join(" ");
    };
    const yesNo = value => value === true ? "Yes" : value === false ? "No" : "";
    const jersey = state.profiles?.[p] ? jerseyConfirmed(pr, p) : null;
    return [p, pr.display && pr.display !== p ? pr.display : "", pr.num ?? "", pr.size || "",
      state.profiles?.[p] ? jerseyName(pr, p) : "", yesNo(jersey),
      yesNo(pr.flightsBooked),
      pr.color || "", pr.skin || "", t(pr.flightIn), t(pr.flightOut),
      pr.venmo ? `@${pr.venmo}` : "", yesNo(pr.drinking), pr.needs || ""]
      /* a tab or newline typed into a field would break the row */
      .map(cell => String(cell).replace(/[\t\r\n]+/g, " "));
  });
  return [head, ...rows].map(r => r.join("\t")).join("\n");
}

/* ─────────── locker room (pre-weekend roster wall; Board takes over when live) ─────────── */
/* GM's weekend sheet: the address and host flights everyone reads during
   onboarding and in the guide. Saved as one action */
const LOGI_FIELDS = [
  { k:"venue", label:"House address", ph:"10848 North Aberdeen Road, Scottsdale, AZ",
    autoComplete:"street-address" },
  { k:"venueNote", label:"Arrival notes", ph:"Door code, parking",
    multiline:true, optional:true },
  { k:"checkIn", label:"Check-in", ph:"Fri Oct 30, 4:00 PM" },
  { k:"checkOut", label:"Checkout", ph:"Sun Nov 1, 10:00 AM" },
];

function LogisticsEditor({ state, onSave }) {
  const lg = state.logistics || {};
  const [form, setForm] = useState(() =>
    Object.fromEntries(LOGI_FIELDS.map(f => [f.k, lg[f.k] || ""])));
  const [hostIn, setHostIn] = useState(lg.hostIn || null);
  const [hostOut, setHostOut] = useState(lg.hostOut || null);
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  const dirty = LOGI_FIELDS.some(f => form[f.k] !== (lg[f.k] || ""))
    || !same(hostIn, lg.hostIn) || !same(hostOut, lg.hostOut);
  const field = { background:"var(--paper2)", border:"1.5px solid var(--line)", borderRadius:10,
    color:"var(--ink)", outline:"none", width:"100%", padding:"12px 13px",
    fontFamily:SANS, fontWeight:600, fontSize:15, boxSizing:"border-box" };
  return (
    <div>
      <div>
        {LOGI_FIELDS.map(f => {
          const inputProps = {
            value:form[f.k],
            placeholder:f.ph,
            "aria-label":f.label,
            maxLength:240,
            autoComplete:f.autoComplete,
            onChange:e => setForm(x => ({ ...x, [f.k]:e.target.value })),
            style:{ ...field, minHeight:f.multiline ? 82 : 48,
              resize:f.multiline ? "vertical" : undefined },
          };
          return (
            <label key={f.k} style={{ display:"block", marginBottom:14 }}>
              <span style={{ ...label, display:"block", marginBottom:6 }}>
                {f.label}{f.optional && <span style={{ fontWeight:600, textTransform:"none",
                  letterSpacing:0 }}> · optional</span>}
              </span>
              {f.multiline ? <textarea {...inputProps} /> : <input {...inputProps} />}
            </label>
          );
        })}
      </div>
      <div style={{ borderTop:"1px solid var(--line)", paddingTop:16, marginTop:4 }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, textTransform:"uppercase",
          color:"var(--ink)", marginBottom:14 }}>Your flights</div>
        <TravelLists />
        <LegField lb="You land Friday" dir="in" leg={hostIn} setLeg={setHostIn} />
        <LegField lb="You leave Sunday" dir="out" leg={hostOut} setLeg={setHostOut} />
      </div>
      <Btn disabled={!dirty} onClick={() => onSave({ ...form, hostIn, hostOut })}
        style={{ width:"100%", marginTop:8 }}>Save trip details</Btn>
    </div>
  );
}

function TravelApparelSheet({ state, onSize, onLock, onNotify }) {
  const copySheet = st => {
    const txt = sheetText(st);
    const fallback = () => {
      try { window.prompt("Copy the sheet", txt); }
      catch { onNotify?.("Could not copy"); }
    };
    if (!navigator.clipboard?.writeText) return fallback();
    navigator.clipboard.writeText(txt)
      .then(() => onNotify?.("Sheet copied"))
      /* Clipboard is blocked outside HTTPS and in some in-app browsers. */
      .catch(fallback);
  };
  const profs = state.profiles || {};
  const roster = rosterOf(state);
  const checkedIn = roster.filter(p => profs[p]).length;
  const shirts = roster.filter(p => profs[p]?.size).length;
  const flights = roster.filter(p => profs[p]?.flightsBooked === true
    || profs[p]?.flightIn || profs[p]?.flightOut).length;
  const jerseys = roster.filter(p => profs[p] && jerseyConfirmed(profs[p], p)).length;
  const locked = !!state.jerseysLocked;
  /* arrivals: while the door is open, who is in, so pickups know */
  const door = arrivalsOpen(state);
  const here = roster.filter(p => hasArrived(state, p)).length;
  const now = serverNow();
  const arrival = p => hasArrived(state, p) ? "here"
    : (landedAt(profs[p]?.flightIn?.time) ?? Infinity) <= now ? "landed" : "road";
  const stat = { background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:10,
    padding:"9px 4px", textAlign:"center" };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${door ? 5 : 4},1fr)`, gap:6, marginBottom:12 }}>
        {[...(door ? [["Here", here]] : []), [door ? "Joined" : "Checked in", checkedIn], ["Shirts", shirts], ["Jerseys", jerseys], ["Flights", flights]].map(([lb, value]) => (
          <div key={lb} style={stat}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:23, color:"var(--ink)",
              lineHeight:1 }}>{value}/{roster.length}</div>
            <div style={{ ...label, marginTop:4 }}>{lb}</div>
          </div>
        ))}
      </div>
      {onLock && <div className="fd-profile-vibration" style={{ borderTop:0, marginBottom:6 }}>
        <span>Jerseys ordered<small style={{ display:"block", color:"var(--muted2)", fontSize:12 }}>
          Locks every jersey name, number and size</small></span>
        <button type="button" role="switch" className="fd-switch" aria-checked={locked}
          aria-label="Jerseys ordered" onClick={() => onLock(!locked)}><span /></button>
      </div>}
      <Btn kind="ghost" onClick={() => copySheet(state)} style={{ width:"100%", marginBottom:14 }}>
        Copy sheet</Btn>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 58px 76px", gap:8,
        padding:"0 8px 7px", borderBottom:"1px solid var(--line)" }}>
        {["Player", "No.", "Shirt"].map(x => <span key={x} style={{ ...label,
          textAlign:x === "Player" ? "left" : "center" }}>{x}</span>)}
      </div>
      {roster.map(p => {
        const pr = profs[p];
        const legs = [pr?.flightIn && `In: ${legText(pr.flightIn, "in")}`,
          pr?.flightOut && `Out: ${legText(pr.flightOut, "out")}`].filter(Boolean);
        const travelStatus = legs.length ? legs.join(" · ")
          : pr?.flightsBooked === false ? "Flights not booked" : "No flight response";
        const jerseyStatus = pr ? `${jerseyName(pr, p)} · ${jerseyConfirmed(pr, p) ? "confirmed" : "not confirmed"}` : "";
        const details = pr ? [pr.venmo && `@${pr.venmo}`,
          pr.drinking === false ? "Not drinking" : pr.drinking === true ? "Drinking" : null,
          pr.needs].filter(Boolean).join(" · ") : "";
        return (
          <div key={p} style={{ padding:"10px 8px", borderBottom:"1px solid var(--line)" }}>
            <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 58px 76px",
              gap:8, alignItems:"center" }}>
              <span style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, fontFamily:SANS, fontWeight:700, fontSize:14,
                color:pr ? "var(--ink)" : "var(--muted)" }}>
                <span style={{ minWidth:0, overflowWrap:"anywhere" }}>{p}</span></span>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, textAlign:"center",
                color:pr?.num != null ? "var(--accent2)" : "var(--muted)" }}>
                {pr?.num != null ? `#${pr.num}` : "·"}</span>
              <select value={pr?.size || ""} aria-label={`${p} shirt size`}
                onChange={e => onSize(p, e.target.value || null)}
                style={{ width:"100%", height:44, background:"var(--paper2)", border:"1px solid var(--line)",
                  borderRadius:8, color:pr?.size ? "var(--ink)" : "var(--muted)", fontFamily:SANS,
                  fontWeight:700, fontSize:13, textAlign:"center", outline:"none" }}>
                <option value="">Size</option>
                {SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            {door && <div style={{ ...label, display:"flex", alignItems:"center", gap:8, marginTop:6,
              color:arrival(p) === "road" ? "var(--muted)" : "var(--lamp-info)" }}>
              <i className={`fd-insert is-info${arrival(p) === "road" ? " is-done" : arrival(p) === "landed" ? " is-pending" : ""}`}
                style={{ "--lamp":"var(--lamp-info)" }} aria-hidden="true" />
              {{ here:"Here", landed:"Landed", road:"On the way" }[arrival(p)]}</div>}
            <div style={{ fontFamily:SANS, fontSize:12, lineHeight:1.45, marginTop:5,
              color:legs.length ? "var(--muted2)" : "var(--muted)" }}>{travelStatus}</div>
            {jerseyStatus && <div style={{ fontFamily:SANS, fontSize:12, lineHeight:1.45, marginTop:2,
              color:"var(--muted2)" }}>Jersey: {jerseyStatus}</div>}
            {details && <div style={{ fontFamily:SANS, fontSize:12, lineHeight:1.45, marginTop:2,
              color:"var(--muted2)" }}>{details}</div>}
          </div>
        );
      })}
    </div>
  );
}

export {
  TRAVEL_CITIES, TravelMap, HouseArt, CARD, InfoCell, VenueCard, FlightEntry, FlightPass, LegField, TravelLists, SizeRow, TravelFields, sheetText, LogisticsEditor, TravelApparelSheet
};
