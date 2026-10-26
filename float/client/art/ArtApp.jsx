/* The art showcase (/float/art): every critter in a floatie on a night
   river (or in a studio), a detail view to try every hat, shade, floatie,
   pose and state, the medallion close up, and the portraits. Scriptable by
   URL for scripts/float-art-shots.mjs (see showcase.js). */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Showcase, sampleEntrant, samplePhoto, SAMPLE_COLORS, SAMPLE_SKINS, CRITTERS, HATS, SHADES, POSES, FLOATIES } from "./showcase.js";
import { riderPortrait } from "./index.js";

const VIEWS = [
  { id: "lineup", name: "Lineup" }, { id: "detail", name: "Detail" }, { id: "floaties", name: "Floaties" },
  { id: "poses", name: "Poses" }, { id: "states", name: "States" }, { id: "medallion", name: "Medallion" },
  { id: "faces", name: "Faces" }, { id: "wardrobe", name: "Wardrobe" }, { id: "chips", name: "Chips" }, { id: "portraits", name: "Portraits" }, { id: "race", name: "Pack" },
];
const STATE_KEYS = { drink: "handsOff", handsOff: "handsOff", swim: "swim", sad: "sad", out: "sad", celebrate: "celebrate" };

function readParams() {
  const q = new URLSearchParams(window.location.search);
  const num = k => (q.has(k) ? Number(q.get(k)) : undefined);
  const state = q.get("state");
  return {
    view: q.get("view") || "lineup",
    stage: q.get("stage") || "night",
    look: { critter: q.get("critter") || undefined, hat: q.get("hat") || undefined, shades: q.get("shades") || undefined, floatie: q.get("floatie") || undefined },
    pose: q.get("pose") || null,
    state: state && STATE_KEYS[state] ? { [STATE_KEYS[state]]: true } : null,
    t: num("t"), freeze: q.get("freeze") === "1", photo: q.get("photo") === "1",
    color: q.get("color") ? `#${q.get("color").replace(/^#/, "")}` : undefined, number: num("number"), skin: q.get("skin") || undefined,
    yaw: num("yaw"), still: q.get("still") === "1", detail: q.get("detail") || undefined, hud: q.get("hud") !== "0",
    zoom: q.get("zoom") === "1", one: q.get("one") === "1", paddle: state === "paddle",
  };
}

const CSS = `
.fa { position:fixed; inset:0; overflow:hidden;
  font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
.fa canvas.fa-gl { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
.fa-labels { position:absolute; inset:0; pointer-events:none; }
.fa-label { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:3px; white-space:nowrap; color:#f4efe4; }
.fa-label-name { font-weight:800; font-size:15px; letter-spacing:.02em; padding:5px 12px 6px; border-radius:999px;
  background:rgba(10,12,28,.62); border:1px solid rgba(255,255,255,.12); box-shadow:0 6px 22px rgba(0,0,0,.35); }
.fa-label-sub { font-size:12px; font-weight:700; letter-spacing:.03em; padding:2px 9px; border-radius:999px; background:rgba(10,12,28,.45); }
.fa-top { position:absolute; top:22px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:6px; padding:6px;
  border-radius:999px; background:rgba(12,14,32,.7); border:1px solid rgba(255,255,255,.1); color:#f4efe4;
  box-shadow:0 10px 40px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); }
.fa-mark { display:flex; align-items:baseline; gap:8px; padding:0 14px 0 12px; }
.fa-mark b { font-weight:900; font-size:19px; letter-spacing:.01em; }
.fa-mark span { font-size:10px; font-weight:800; letter-spacing:.22em; text-transform:uppercase; opacity:.55; }
.fa-tab { appearance:none; border:0; background:transparent; color:inherit; font:inherit; font-weight:700; font-size:14px; padding:9px 15px;
  border-radius:999px; cursor:pointer; opacity:.7; transition:background-color .32s cubic-bezier(.32,.72,0,1), opacity .2s ease; }
.fa-tab[aria-pressed="true"] { background:rgba(255,255,255,.14); opacity:1; box-shadow:inset 0 1px 0 rgba(255,255,255,.12); }
@media (hover:hover) and (pointer:fine) { .fa-tab:hover { opacity:1; } }
.fa-stage { position:absolute; top:22px; right:22px; display:flex; gap:4px; padding:5px; border-radius:999px; background:rgba(12,14,32,.7);
  border:1px solid rgba(255,255,255,.1); color:#f4efe4; backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); }
.fa-panel { position:absolute; top:96px; right:22px; bottom:22px; width:318px; overflow:auto; padding:6px; border-radius:26px; color:#f4efe4;
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); box-shadow:0 24px 60px rgba(0,0,0,.4);
  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); scrollbar-width:thin; }
.fa-panel-in { border-radius:21px; background:rgba(10,12,28,.66); box-shadow:inset 0 1px 0 rgba(255,255,255,.07); padding:16px 16px 6px; }
.fa-sec { margin-bottom:16px; }
.fa-sec h3 { margin:0 0 8px; font-size:10px; font-weight:800; letter-spacing:.22em; text-transform:uppercase; opacity:.5; }
.fa-chips { display:flex; flex-wrap:wrap; gap:6px; }
.fa-chip { appearance:none; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:inherit; font:inherit; font-size:13px;
  font-weight:700; padding:7px 11px; border-radius:999px; cursor:pointer;
  transition:background-color .28s cubic-bezier(.32,.72,0,1), border-color .28s cubic-bezier(.32,.72,0,1), transform .16s cubic-bezier(.23,1,.32,1); }
.fa-chip:active { transform:scale(.96); }
.fa-chip[aria-pressed="true"] { background:#f4efe4; color:#11131f; border-color:#f4efe4; }
.fa-swatch { width:26px; height:26px; border-radius:50%; border:2px solid rgba(255,255,255,.18); cursor:pointer; padding:0; }
.fa-swatch[aria-pressed="true"] { border-color:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.18); }
.fa-stats { position:absolute; left:22px; bottom:22px; font-size:12px; font-weight:700; letter-spacing:.04em; padding:8px 14px; border-radius:999px; color:#f4efe4;
  background:rgba(12,14,32,.62); border:1px solid rgba(255,255,255,.09); font-variant-numeric:tabular-nums; opacity:.85; }
.fa-portraits { position:absolute; inset:96px 40px 40px; display:grid; grid-template-columns:repeat(auto-fill, minmax(196px, 1fr)); gap:18px; overflow:auto; align-content:start; color:#f4efe4; }
.fa-card { border-radius:26px; padding:6px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); }
.fa-card-in { border-radius:21px; overflow:hidden; background:radial-gradient(120% 90% at 50% 25%, var(--c) 0%, rgba(10,12,28,.92) 72%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08); display:flex; flex-direction:column; align-items:center; padding:14px 10px 12px; }
.fa-card img { width:100%; aspect-ratio:1; display:block; }
.fa-card b { font-size:15px; font-weight:800; margin-top:6px; }
.fa-card span { font-size:11px; font-weight:700; letter-spacing:.06em; opacity:.6; margin-top:2px; }
@media (prefers-reduced-motion: reduce) { .fa-tab, .fa-chip { transition:none; } }
`;

export default function ArtApp() {
  const params = useMemo(readParams, []);
  const canvasRef = useRef(null), labelsRef = useRef(null), showRef = useRef(null);
  const [view, setView] = useState(params.view);
  const [stage, setStage] = useState(params.stage);
  const [look, setLook] = useState(() => ({ critter: "capybara", hat: "cowboy", shades: "none", floatie: "classic",
    ...Object.fromEntries(Object.entries(params.look).filter(([, v]) => v)) }));
  const [pose, setPose] = useState(params.pose);
  const [state, setState] = useState(params.state || {});
  const [color, setColor] = useState(params.color || SAMPLE_COLORS[0]);
  const [skin, setSkin] = useState(params.skin || "star");
  const [photo, setPhoto] = useState(params.photo);
  const [stats, setStats] = useState(null);
  const [portraits, setPortraits] = useState([]);

  /* the scene, once */
  useEffect(() => {
    const show = new Showcase(canvasRef.current, labelsRef.current, { onStats: setStats });
    showRef.current = show;
    window.__floatArt = { show, stats: () => show.stats(), seek: t => show.seek(t), freeze: f => { show.frozen = f; } };
    let raf = 0, last = performance.now();
    const loop = now => { show.frame(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const onResize = () => show.resize();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); show.dispose(); delete window.__floatArt; };
  }, []);

  /* the view, whenever it or the look changes */
  useEffect(() => {
    const show = showRef.current;
    if (!show) return undefined;
    document.body.dataset.ready = "0";
    let cancelled = false;
    const done = () => { if (cancelled) return; show.frame(0); requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) document.body.dataset.ready = "1"; })); };
    if (view === "portraits") {
      show.clear();
      const list = CRITTERS.map((c, i) => sampleEntrant(i, { photo: i % 4 === 0 ? samplePhoto() : null }));
      Promise.all(list.map(e => riderPortrait(e, { size: 384 }).then(src => ({ e, src }))))
        .then(rows => { if (!cancelled) { setPortraits(rows); setTimeout(done, 80); } });
    } else {
      show.setView(view, { stage, look, pose, stateObj: state, photo, color, skin, number: params.number, yaw: params.yaw, zoom: params.zoom, one: params.one, paddle: params.paddle,
        still: params.still || params.freeze, detail: params.detail });
      if (params.t !== undefined) { show.seek(params.t); show.frozen = params.freeze; }
      setTimeout(done, 40);
    }
    return () => { cancelled = true; };
  }, [view, stage, look, pose, state, photo, color, skin]);

  /* drag to turn the detail turntable */
  useEffect(() => {
    const el = canvasRef.current;
    const down = e => { const s = showRef.current; if (!s || s.view !== "detail") return; s.spin.drag = { x: e.clientX, yaw: s.spin.yaw }; };
    const move = e => { const s = showRef.current; if (!s?.spin.drag) return; s.spin.yaw = s.spin.drag.yaw + (e.clientX - s.spin.drag.x) * 0.01; };
    const up = () => { const s = showRef.current; if (s) s.spin.drag = null; };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const stroke = side => showRef.current?.items[0]?.rider?.critter.setStroke(side);
  const toggle = k => setState(s => ({ ...s, [k]: !s[k] }));
  const chip = (on, label, onClick, key) => <button key={key || label} type="button" className="fa-chip" aria-pressed={!!on} onClick={onClick}>{label}</button>;
  const hud = params.hud;
  const bg = view === "portraits" ? "#0b0f26" : stage === "studio" ? "#ddd8cf" : "#070c24";

  return <main className="fa" style={{ background: bg }}>
    <style>{CSS}</style>
    <canvas ref={canvasRef} className="fa-gl" style={{ visibility: view === "portraits" ? "hidden" : "visible" }} />
    <div ref={labelsRef} className="fa-labels" style={{ display: hud && view !== "portraits" ? "block" : "none" }} />
    {hud && <nav className="fa-top" aria-label="Views">
      <div className="fa-mark"><b>Float</b><span>Art</span></div>
      {VIEWS.map(v => <button key={v.id} type="button" className="fa-tab" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.name}</button>)}
    </nav>}
    {hud && view !== "portraits" && <div className="fa-stage">
      {[["night", "Night river"], ["studio", "Studio"]].map(([id, name]) => <button key={id} type="button" className="fa-tab" aria-pressed={stage === id} onClick={() => setStage(id)}>{name}</button>)}
    </div>}
    {hud && view === "detail" && <aside className="fa-panel"><div className="fa-panel-in">
      <div className="fa-sec"><h3>Critter</h3><div className="fa-chips">{CRITTERS.map(c => chip(look.critter === c.id, c.name, () => setLook(l => ({ ...l, critter: c.id }))))}</div></div>
      <div className="fa-sec"><h3>Floatie</h3><div className="fa-chips">{FLOATIES.map(f => chip(look.floatie === f.id, f.name, () => setLook(l => ({ ...l, floatie: f.id }))))}</div></div>
      <div className="fa-sec"><h3>Hat</h3><div className="fa-chips">{HATS.map(h => chip(look.hat === h.id, h.name, () => setLook(l => ({ ...l, hat: h.id }))))}</div></div>
      <div className="fa-sec"><h3>Shades</h3><div className="fa-chips">{SHADES.map(s => chip(look.shades === s.id, s.name, () => setLook(l => ({ ...l, shades: s.id }))))}</div></div>
      <div className="fa-sec"><h3>Pose</h3><div className="fa-chips">{chip(!pose, "None", () => setPose(null), "none")}{POSES.map(p => chip(pose === p.id, p.name, () => setPose(p.id)))}</div></div>
      <div className="fa-sec"><h3>Race</h3><div className="fa-chips">
        {chip(false, "Paddle L", () => stroke("L"))}{chip(false, "Paddle R", () => stroke("R"))}
        {chip(state.handsOff, "Drink", () => toggle("handsOff"))}{chip(state.swim, "Swim", () => toggle("swim"))}
        {chip(state.sad, "Out", () => toggle("sad"))}{chip(state.celebrate, "Celebrate", () => toggle("celebrate"))}
      </div></div>
      <div className="fa-sec"><h3>Color</h3><div className="fa-chips">{SAMPLE_COLORS.map(c => <button key={c} type="button" className="fa-swatch" aria-label={c} aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}</div></div>
      <div className="fa-sec"><h3>Chip</h3><div className="fa-chips">{chip(photo, "Photo", () => setPhoto(true))}{chip(!photo, "Number", () => setPhoto(false))}</div>
        <div className="fa-chips" style={{ marginTop: 8 }}>{SAMPLE_SKINS.map(s => chip(skin === s, s, () => setSkin(s)))}</div></div>
    </div></aside>}
    {view === "portraits" && <section className="fa-portraits">{portraits.map(({ e, src }) => <div key={e.look.critter} className="fa-card" style={{ "--c": e.color }}>
      <div className="fa-card-in">{src && <img src={src} alt="" />}<b>{e.name}</b><span>{CRITTERS.find(c => c.id === e.look.critter)?.name}</span></div></div>)}</section>}
    {hud && stats && view !== "portraits" && <div className="fa-stats">{stats.fps} fps · {stats.calls} draws · {Math.round(stats.triangles / 1000)}k tris · {stats.riders} riders · {stats.perRider} tris/rider</div>}
  </main>;
}
