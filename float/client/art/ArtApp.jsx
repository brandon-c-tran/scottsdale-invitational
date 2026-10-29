/* /float/art: where Brandon reviews Float's Groove art (float/GROOVE.md).
   Every critter in every pose in three colours, the portraits, the host,
   the scenes (their layers scrolling, to check the seams), the props, the
   pixel lettering, and a flotilla put together from all of it.

   ?view=all (default) | flotilla | lastcall | looks | look&id=frog | critters | crowns | critter&id=frog | portraits | host | scenes | props | type
   &bg=water|dark|light   &freeze=1 (no motion, for screenshots)
   document.body.dataset.ready is "1" once every sprite on the page is painted. */
import React, { useEffect, useMemo, useState } from "react";
import { CRITTERS, SPECIAL_CRITTERS, HATS, SHADES } from "../../shared/looks.js";
import { SONGS } from "../../shared/chart.js";
import RiderSprite, { useGrooveArt } from "./groove/RiderSprite.jsx";
import Popup from "./groove/Popup.jsx";
import { riderSprites, riderPortrait, sceneOf, propOf, hostSprites, bartenderSprites, spriteAnchor, grooveUrl, POSES } from "./groove/index.js";
import "./groove/groove.css";

const COLORS = [["Red", "#e53935"], ["Yellow", "#fdd835"], ["Teal", "#00897b"], ["Navy", "#1a237e"]];
const RIDER_COLORS = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b", "#1e88e5", "#5e35b1", "#d81b60", "#ec407a", "#8e24aa", "#3949ab", "#7cb342", "#1a237e", "#f4511e"];
const ALL = [...CRITTERS, ...SPECIAL_CRITTERS];
const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const VIEW = query.get("view") || "all";
const FREEZE = query.get("freeze") === "1";
const BG = query.get("bg") || "water";
const BGS = { water:"#8fdbe2", dark:"#1f2430", light:"#fbf7ef" };
/* the poses the manifest lists (the kayaks added stroke-r), else the module's own */
const usePoses = () => useGrooveArt()?.poses || POSES;

const CSS = `
.fa2 { min-height: 100vh; background: #f6f1e7; color: #2a2430; font: 16px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; padding: 24px 32px 80px; box-sizing: border-box; }
.fa2 h1, .fa2 h2 { font-family: "Float Pixel", monospace; font-weight: 700; letter-spacing: .02em; margin: 0; }
.fa2 h1 { font-size: 40px; }
.fa2 h2 { font-size: 28px; margin: 40px 0 14px; }
.fa2 nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 8px; }
.fa2 nav a { font: 600 14px system-ui, sans-serif; color: #2a2430; background: #fff; border: 2px solid #2a2430; border-radius: 99px; padding: 6px 12px; text-decoration: none; }
.fa2 nav a[aria-current="page"] { background: #2a2430; color: #fff; }
.fa2-note { color: #6b6372; font-size: 14px; margin: 4px 0 0; }
.fa2-sheet { border-radius: 16px; padding: 14px; display: inline-block; }
.fa2-row { display: flex; align-items: flex-end; gap: 4px; }
.fa2-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.fa2-cell small { font: 600 12px system-ui, sans-serif; color: #6b6372; }
.fa2-critter { margin-bottom: 18px; }
.fa2-critter h3 { font: 700 18px system-ui, sans-serif; margin: 0 0 4px; }
.fa2-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.fa2-scene { position: relative; width: 960px; height: 540px; overflow: hidden; border-radius: 12px; border: 3px solid #2a2430; }
.fa2-layer { position: absolute; inset: 0; background-size: 960px 540px; background-repeat: repeat-x; }
.fa2-scroll { animation: fa2-scroll var(--dur) linear infinite; }
@keyframes fa2-scroll { from { background-position-x: 0; } to { background-position-x: -960px; } }
.fa2-props { display: flex; flex-wrap: wrap; gap: 14px; }
.fa2-prop { position: relative; background: repeating-conic-gradient(#e8e2d6 0 25%, #f6f1e7 0 50%) 0 0 / 16px 16px; border: 2px solid #2a2430; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; }
.fa2-prop img { display: block; max-width: 240px; max-height: 240px; }
.fa2-dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #ff2d75; border: 2px solid #fff; transform: translate(-50%, -50%); }
.fa2-type { display: flex; flex-wrap: wrap; gap: 36px; align-items: flex-end; padding: 28px; border-radius: 16px; background: #8fdbe2; }
.fa2-bob { animation: fa2-bob 1s ease-in-out infinite; }
@keyframes fa2-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.fa2-frozen *, .fa2-frozen *::before, .fa2-frozen *::after { animation-play-state: paused !important; }
.fa2-frozen .fg-popup { animation: none !important; }
`;

/* every rider's sprites painted before the page says it is ready */
function useReady(looks) {
  const m = useGrooveArt();
  useEffect(() => {
    if (!m) return;
    let live = true;
    Promise.all(looks.map(look => riderSprites(look).catch(() => null))).then(() => new Promise(r => setTimeout(r, 300))).then(() => {
      if (live && typeof document !== "undefined") document.body.dataset.ready = "1";
    });
    return () => { live = false; };
  }, [m]);
  return m;
}

function Nav() {
  const views = ["all", "flotilla", "lastcall", "looks", "critters", "crowns", "portraits", "host", "scenes", "props", "type"];
  return <nav>{views.map(v => <a key={v} href={`?view=${v}`} aria-current={v === VIEW ? "page" : undefined}>{v}</a>)}</nav>;
}

function Critters({ ids = ALL.map(c => c.id), size = 112 }) {
  const poses = usePoses();
  return (
    <div className="fa2-sheet" style={{ background:BGS[BG] || BGS.water }}>
      {ids.map(id => (
        <div key={id} className="fa2-critter">
          <h3>{ALL.find(c => c.id === id)?.name || id}</h3>
          {COLORS.slice(0, 3).map(([name, color]) => (
            <div key={name} className="fa2-row">
              {poses.map(pose => (
                <div key={pose} className="fa2-cell">
                  <RiderSprite critter={id} color={color} pose={pose} size={size} />
                  {name === "Red" ? <small>{pose}</small> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* the groom's crown on every pose: it should sit on the head in each */
function Crowns() {
  const poses = usePoses();
  return (
    <div className="fa2-sheet" style={{ background:BGS[BG] || BGS.water }}>
      {ALL.map((c, i) => (
        <div key={c.id} className="fa2-row">
          {poses.map(pose => <div key={pose} className="fa2-cell"><RiderSprite critter={c.id} color={RIDER_COLORS[i % RIDER_COLORS.length]} pose={pose} groom size={110} /></div>)}
        </div>
      ))}
    </div>
  );
}

/* the looks (float/shared/looks.js): every hat, every pair of glasses and the photo tee */
const SAMPLE_PHOTO = typeof window !== "undefined" ? grooveUrl("looks/sample-photo.webp") : null;
const HAT_IDS = HATS.map(h => h.id).filter(id => id !== "none");
const SHADE_IDS = SHADES.map(s => s.id).filter(id => id !== "none");
const lookCells = () => [
  ...HAT_IDS.map(hat => ({ label:hat, look:{ hat, groom:hat === "crown" } })),
  ...SHADE_IDS.map(shades => ({ label:shades, look:{ shades } })),
  { label:"photo tee", look:{ shirt:"photo", photo:SAMPLE_PHOTO } },
  { label:"all three", look:{ hat:"cowboy", shades:"aviators", shirt:"photo", photo:SAMPLE_PHOTO } },
];
/* the looks view says when every portrait is in (document.body.dataset.looks) */
const pending = { n:0 };
const looksBusy = delta => {
  pending.n += delta;
  if (typeof document !== "undefined") document.body.dataset.looks = pending.n > 0 ? "0" : "1";
};
function PortraitCell({ entrant, size = 120 }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    looksBusy(1);
    riderPortrait(entrant, { size:size * 2 }).then(u => { if (live) setUrl(u); }, () => {}).finally(() => looksBusy(-1));
    return () => { live = false; };
  }, [JSON.stringify(entrant), size]);
  return url ? <img src={url} width={size} height={size} alt="" /> : <div style={{ width:size, height:size }} />;
}
function Looks() {
  const cells = lookCells();
  return (
    <div className="fa2-sheet" style={{ background:BGS[BG] || BGS.water }}>
      <div className="fa2-row">{cells.map(c => <div key={c.label} className="fa2-cell" style={{ width:120 }}><small>{c.label}</small></div>)}</div>
      {ALL.map((c, i) => (
        <div key={c.id} className="fa2-row">
          {cells.map(cell => <PortraitCell key={cell.label} entrant={{ color:RIDER_COLORS[i % RIDER_COLORS.length], look:{ critter:c.id, ...cell.look }, groom:!!cell.look.groom, photo:cell.look.photo }} />)}
        </div>
      ))}
    </div>
  );
}
/* one critter, every look in every pose */
function LookPoses({ id }) {
  const poses = usePoses();
  return (
    <div className="fa2-sheet" style={{ background:BGS[BG] || BGS.water }}>
      {lookCells().map((cell, i) => (
        <div key={cell.label} className="fa2-row">
          <div className="fa2-cell" style={{ width:90 }}><small>{cell.label}</small></div>
          {poses.map(pose => <RiderSprite key={pose} critter={id} color={RIDER_COLORS[i % RIDER_COLORS.length]} pose={pose} size={150} {...cell.look} />)}
        </div>
      ))}
    </div>
  );
}

function Portraits() {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let live = true;
    ALL.forEach((c, i) => riderPortrait({ color:RIDER_COLORS[i % RIDER_COLORS.length], look:{ critter:c.id }, groom:c.id === "winnie" }, { size:240 })
      .then(url => { if (live) setUrls(u => ({ ...u, [c.id]:url })); }, () => {}));
    return () => { live = false; };
  }, []);
  return (
    <div className="fa2-grid">
      {ALL.map(c => (
        <div key={c.id} className="fa2-cell" style={{ background:BGS.dark, borderRadius:14, padding:8 }}>
          {urls[c.id] ? <img src={urls[c.id]} width={240} height={240} alt={c.name} /> : <div style={{ width:240, height:240 }} />}
          <small style={{ color:"#d8d2e0" }}>{c.name}</small>
        </div>
      ))}
    </div>
  );
}

function Cast({ cast, bg = BGS.water }) {
  if (!cast) return null;
  return (
    <div className="fa2-sheet fa2-row" style={{ background:bg, gap:24 }}>
      {Object.entries(cast.poses).map(([pose, url]) => (
        <div key={pose} className="fa2-cell" style={{ position:"relative" }}>
          <img src={url} width={300} height={300 * cast.box[1] / cast.box[0]} alt={pose} />
          {Object.entries(cast.anchors[pose]).map(([name, [x, y]]) => <span key={name} className="fa2-dot" title={name} style={{ left:x * 300 / cast.box[0], top:y * 300 / cast.box[0] }} />)}
          <small>{pose}</small>
        </div>
      ))}
    </div>
  );
}
const Host = () => <><Cast cast={hostSprites()} /><h2>Bartender</h2><Cast cast={bartenderSprites()} bg="#f2c4a0" /></>;

/* Last Call put together: the bar, the bartender behind the counter sliding a drink, riders in front with their grabs */
function LastCall() {
  const m = useGrooveArt();
  const bar = sceneOf("bar"), cast = bartenderSprites(), drink = propOf("drink");
  if (!m || !bar || !cast) return null;
  const W = 1280, k = W / 1920, counter = (bar.counter || 0.45) * 1080;
  const bw = 420 * k;
  const riders = CRITTERS.slice(0, 6).map((c, i) => ({ ...c, color:RIDER_COLORS[i * 2] }));
  const size = 300 * k;
  const pops = [["nice", 10], null, ["late", 730], ["nice", -20], null, ["perfect", 0]];
  return (
    <Scene id="bar" width={W}>
      <img src={cast.poses.slide} alt="" style={{ position:"absolute", width:bw, left:960 * k - cast.anchor.ground[0] * bw / cast.box[0], top:(counter + 14) * k - cast.anchors.slide.ground[1] * bw / cast.box[0] }} />
      {drink ? <img src={drink.src} alt="" style={{ position:"absolute", width:drink.w * 0.7 * k * 1.4, left:(1180 - drink.anchor[0] * 0.98) * k, top:(counter + 30 - drink.anchor[1] * 0.98) * k }} /> : null}
      {riders.map((r, i) => {
        const x = (230 + i * 290) * k, y = 1010 * k;
        const water = spriteAnchor(r.id, "idle", "water", size) || [size / 2, size * 0.86];
        const head = spriteAnchor(r.id, "idle", "head", size) || [size / 2, size * 0.2];
        return (
          <div key={r.id} style={{ position:"absolute", left:x - water[0], top:y - water[1], width:size, height:size }}>
            <RiderSprite critter={r.id} color={r.color} pose={i === 2 ? "miss" : i % 2 ? "hey" : "idle"} size={size} />
            {pops[i] ? <div style={{ position:"absolute", left:head[0], top:head[1] - 6, transform:"translate(-50%, -100%)" }}><Popup q={pops[i][0]} d={pops[i][1]} size={34} /></div> : null}
          </div>
        );
      })}
    </Scene>
  );
}

/* where a review page stands each accent (the screen places its own): x and y as shares of the scene, y on the water band */
const ACCENT_AT = { "accent-open":[0.86, 0.6], "accent-rocks":[0.88, 0.56], "accent-whirl":[0.62, 0.7], "accent-falls":[0.84, 0.44] };

function Scene({ id, children, width = 960 }) {
  const s = sceneOf(id);
  if (!s) return null;
  const k = width / s.w;
  const accent = s.accent ? propOf(s.accent) : null;
  const at = accent ? ACCENT_AT[accent.id] || [0.8, 0.6] : null;
  return (
    <div className="fa2-scene" style={{ width, height:s.h * k }}>
      {s.layers.map((layer, i) => (
        <div key={i} className={`fa2-layer ${layer.loop && layer.depth > 0 ? "fa2-scroll" : ""}`}
          style={{ backgroundImage:`url("${layer.src}")`, backgroundSize:`${width}px ${s.h * k}px`, "--dur":`${Math.round(40 / Math.max(0.05, layer.depth))}s` }} />
      ))}
      {accent ? <img src={accent.src} alt="" title={accent.id} style={{ position:"absolute", width:accent.w * k, left:(at[0] * s.w - accent.anchor[0]) * k, top:(at[1] * s.h - accent.anchor[1]) * k }} /> : null}
      {children}
    </div>
  );
}

function Scenes() {
  const ids = [...SONGS.map(song => song.scene), "lobby", "bar", "podium"];
  return <div className="fa2-grid">{ids.map(id => <div key={id}><Scene id={id} /><small className="fa2-note">{id}{SONGS.find(s => s.scene === id) ? `: ${SONGS.find(s => s.scene === id).name}` : ""}</small></div>)}</div>;
}

function Props() {
  const m = useGrooveArt();
  if (!m) return null;
  return (
    <div className="fa2-props">
      {Object.keys(m.props).map(id => {
        const p = propOf(id);
        const k = Math.min(1, 240 / Math.max(p.w, p.h));
        return (
          <div key={id} className="fa2-prop">
            <div style={{ position:"relative", width:p.w * k, height:p.h * k }}>
              <img src={p.src} width={p.w * k} height={p.h * k} alt={id} />
              <span className="fa2-dot" style={{ left:p.anchor[0] * k, top:p.anchor[1] * k }} />
            </div>
            <small>{id}{p.tint ? " (tint)" : ""}</small>
          </div>
        );
      })}
    </div>
  );
}

const SAMPLES = [["late", 30], ["nice", -10], ["perfect", 0], ["miss", null], ["ok", 120], ["early", -190]];
function Type() {
  return (
    <div className="fa2-type">
      {SAMPLES.map(([q, d]) => <Popup key={q} q={q} d={d} size={56} />)}
      {SAMPLES.slice(0, 4).map(([q, d]) => <Popup key={`s${q}`} q={q} d={d} size={28} />)}
    </div>
  );
}

/* the river put together: the open scene, the host on the bank, 13 riders in three staggered rows, popups over a few */
function Flotilla() {
  const m = useGrooveArt();
  const host = hostSprites();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (FREEZE) return undefined;
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (!m) return null;
  /* riders at the concept frame's scale: a 330 px box, the ring about 160 px wide */
  const W = 1280, k = W / 1920, size = 330 * k;
  const riders = CRITTERS.map((c, i) => ({ ...c, color:RIDER_COLORS[i], row:i % 3, col:Math.floor(i / 3) }));
  const rowY = [585, 760, 950];
  const ripple = propOf("ripple");
  const ring = size * (250 / 512);
  const pose = (i) => (FREEZE ? ["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "idle"][i % 8] : (tick + i) % 4 === 0 ? "stroke" : "idle");
  const pops = { 0:["late", 30], 4:["nice", -10], 7:["perfect", 0], 10:["miss", null] };
  return (
    <Scene id="open" width={W}>
      {host ? (
        <img src={host.poses[FREEZE ? "call" : tick % 4 === 0 ? "call" : "idle"]} alt="" style={{ position:"absolute", left:(150 - host.anchor.ground[0] * 0.55) * k, top:(470 - host.anchor.ground[1] * 0.55) * k, width:host.box[0] * 0.55 * k }} />
      ) : null}
      {riders.map((r, i) => {
        const x = (230 + r.col * 330 + r.row * 110) * k, y = rowY[r.row] * k;
        const water = spriteAnchor(r.id, "idle", "water", size) || [size / 2, size * 0.7];
        const head = spriteAnchor(r.id, "idle", "head", size) || [size / 2, size * 0.2];
        return (
          <div key={r.id} style={{ position:"absolute", left:x - water[0], top:y - water[1], width:size, height:size, zIndex:r.row }}>
            {ripple ? <img src={ripple.src} alt="" style={{ position:"absolute", width:ring * 1.35, left:water[0] - ring * 1.35 * ripple.anchor[0] / ripple.w, top:water[1] - ring * 1.35 * (ripple.h / ripple.w) * ripple.anchor[1] / ripple.h + ring * 0.1, opacity:0.9 }} /> : null}
            <div className={FREEZE ? "" : "fa2-bob"} style={{ animationDelay:`${-i * 0.13}s`, position:"relative" }}>
              <RiderSprite critter={r.id} color={r.color} pose={pose(i)} size={size} groom={r.id === "coyote"} />
            </div>
            {pops[i] ? <div style={{ position:"absolute", left:head[0], top:head[1] - 10, transform:"translate(-50%, -100%)" }}><Popup q={pops[i][0]} d={pops[i][1]} size={34} /></div> : null}
          </div>
        );
      })}
    </Scene>
  );
}

export default function ArtApp() {
  const looks = useMemo(() => {
    const ids = VIEW === "critter" ? [query.get("id") || "capybara"] : ALL.map(c => c.id);
    const colors = VIEW === "flotilla" ? [] : COLORS.slice(0, 3).map(([, c]) => c);
    const list = [];
    for (const id of ids) for (const color of colors) list.push({ critter:id, color, groom:false });
    if (VIEW === "flotilla" || VIEW === "all") CRITTERS.forEach((c, i) => list.push({ critter:c.id, color:RIDER_COLORS[i], groom:c.id === "coyote" }));
    if (VIEW === "lastcall") CRITTERS.slice(0, 6).forEach((c, i) => list.push({ critter:c.id, color:RIDER_COLORS[i * 2], groom:false }));
    if (VIEW === "look") lookCells().forEach((cell, i) => list.push({ critter:query.get("id") || "capybara", color:RIDER_COLORS[i % RIDER_COLORS.length], ...cell.look, size:256 }));
    if (VIEW === "crowns" || VIEW === "all") ALL.forEach((c, i) => list.push({ critter:c.id, color:RIDER_COLORS[i % RIDER_COLORS.length], groom:true }));
    return list;
  }, []);
  const m = useReady(looks);
  const show = v => VIEW === "all" || VIEW === v;
  return (
    <main className={`fa2 ${FREEZE ? "fa2-frozen" : ""}`}>
      <style>{CSS}</style>
      <h1>Float art</h1>
      <Nav />
      {!m ? <p className="fa2-note">Loading the art</p> : null}
      {m && show("flotilla") ? <><h2>Flotilla</h2><Flotilla /></> : null}
      {m && show("lastcall") ? <><h2>Last Call</h2><LastCall /></> : null}
      {m && show("looks") ? <><h2>Looks</h2><Looks /></> : null}
      {m && VIEW === "look" ? <><h2>{query.get("id")}: looks in every pose</h2><LookPoses id={query.get("id") || "capybara"} /></> : null}
      {m && show("critters") ? <><h2>Critters</h2><Critters /></> : null}
      {m && VIEW === "critter" ? <><h2>{query.get("id")}</h2><Critters ids={[query.get("id") || "capybara"]} size={200} /></> : null}
      {m && show("crowns") ? <><h2>The groom's crown</h2><Crowns /></> : null}
      {m && show("portraits") ? <><h2>Portraits</h2><Portraits /></> : null}
      {m && show("host") ? <><h2>Host</h2><Host /></> : null}
      {m && show("scenes") ? <><h2>Scenes</h2><Scenes /></> : null}
      {m && show("props") ? <><h2>Props</h2><Props /></> : null}
      {m && show("type") ? <><h2>Type</h2><Type /></> : null}
    </main>
  );
}
