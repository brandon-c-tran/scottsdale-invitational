import React, { useId, useRef, useState } from "react";
import { CHIP_COLORS, CHIP_SKINS, disp } from "../../../shared/core.js";
import { DISPLAY, SANS, label } from "../../ui/theme.js";
import PhotoCropper from "../../PhotoCropper.jsx";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { SizeRow } from "../travel/Travel.jsx";
import { PlayerPass } from "./PlayerPass.jsx";

const CHIP_SKIN_META = {
  ticks: "Classic", plain: "Clean", dash: "Split", quad: "Four block",
  dots: "Pips", ring: "Double ring", saw: "Zigzag", flame: "Petal",
  star: "Starburst", bolt: "Chevron", wave: "Ripple", crown: "Crown",
};

function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto, num, setNum, size, setSize, onChip, showSize = true }) {
  const identity = usePlayerIdentity(me);
  const fileRef = useRef(null);
  const numberErrorId = useId();
  const [cropSource, setCropSource] = useState(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const takenBy = num !== "" ? Object.entries(state.profiles || {})
    .find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
  const onFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result);
    reader.readAsDataURL(f);
    /* Allow choosing the same file again after cancelling the crop. */
    e.target.value = "";
  };
  return (
    <div className="fd-profile-editor">
      {me && (state.live ? <details className="fd-profile-preview"><summary>Player card preview</summary>
        <PlayerPass state={state} p={me} display={display} num={num} photo={photo} compact />
      </details> : <PlayerPass state={state} p={me} display={display} num={num} photo={photo} compact />)}
      <div className="fd-profile-controls">
        <div aria-hidden="true" className="fd-profile-color-rail"
          style={{ background:me ? identity.color : "var(--accent)" }} />
        <div className="fd-profile-fields">
          <div className="fd-profile-photo-row">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="fd-profile-photo-button" aria-label={current ? "Change your photo" : "Add your photo"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>
              </svg>
              <span>{current ? "Change photo" : "Add a photo"}</span>
              <span aria-hidden="true" className="fd-profile-photo-action">{current ? "↗" : "+"}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
            {cropSource && (
              <PhotoCropper src={cropSource} onCancel={() => setCropSource(null)}
                onConfirm={cropped => { setPhoto(cropped); setCropSource(null); }} />
            )}
          </div>
          <div className="fd-profile-name-row">
            <label className="fd-profile-field">
              <span>Display name</span>
              <input value={display} onChange={e => setDisplay(e.target.value)} maxLength={16}
                aria-label="Display name" autoComplete="nickname" />
            </label>
            <label className="fd-profile-field fd-profile-number-field">
              <span>No.</span>
              <input value={num} inputMode="numeric" placeholder="00" aria-label="Player number"
                aria-invalid={!!takenBy} aria-describedby={takenBy ? numberErrorId : undefined}
                onChange={e => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </label>
          </div>
          {takenBy && (
            <div id={numberErrorId} className="fd-profile-number-error" role="status">
              {disp(state, takenBy[0])} already has {Number(num)}.
            </div>
          )}
        </div>
        {onChip && me && <ChipPicker state={state} me={me} onChip={onChip} num={num} embedded />}
      </div>
      {showSize && (
        <div style={{ marginTop:18 }}>
          <SizeRow lb="T-shirt size" value={size} onPick={setSize} allowClear />
        </div>
      )}
    </div>
  );
}

function ChipPicker({ state, me, onChip, num, embedded = false }) {
  const mine = state.profiles?.[me] || {};
  /* the preview has to follow the number field, not the saved profile, or
     picking a skin while changing your number shows you the old one */
  const stamp = num !== undefined && num !== "" && num !== null ? Number(num) : mine.num;
  const owner = hex => Object.entries(state.profiles || {}).find(([p, pr]) => pr?.color === hex)?.[0];
  /* Once live, an established chip is locked. A guest who never claimed a
     color still gets one claim: the pattern is chosen here, and the color tap
     saves both together. */
  const lateClaim = !!state.live && !mine.color;
  const locked = !!state.live && !lateClaim;
  const { skin:savedSkin } = usePlayerIdentity(me);
  const [draftSkin, setDraftSkin] = useState(null);
  const skin = lateClaim ? draftSkin || mine.skin || CHIP_SKINS[0] : savedSkin;
  const patterns = <PatternPicker me={me} skin={skin} locked={locked} stamp={stamp}
    onPick={sk => lateClaim ? setDraftSkin(sk) : onChip(undefined, sk)} />;
  if (locked) return <div className="fd-profile-chip-locked">
    <ChipFace p={me} size={48} stamp={stamp} />
    <div><strong>{CHIP_SKIN_META[skin] || "Classic"} pattern</strong><p>Chips are locked for the weekend.</p></div>
  </div>;
  return (
    <div className="fd-chip-picker" style={{ background:"var(--paper)", border:embedded ? "none" : "1px solid var(--line)",
      borderTop:embedded ? "1px solid var(--line)" : undefined,
      borderRadius:embedded ? 0 : 14, padding:embedded ? "14px 12px 13px" : 12 }}>
      {!embedded && <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:15 }}>
        <div style={{ position:"relative", width:80, height:80, flexShrink:0, display:"grid", placeItems:"center" }}>
          <span aria-hidden="true" style={{ position:"absolute", inset:4, borderRadius:"50%",
            background:"var(--sun-tint)", border:"1px solid var(--line)" }} />
          <div style={{ position:"relative" }}>
            <ChipFace p={me} size={70} stamp={stamp} />
          </div>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:10, letterSpacing:"0.16em",
            textTransform:"uppercase", color:"var(--accent2)", marginBottom:4 }}>Chip design</div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:26, lineHeight:1,
            textTransform:"uppercase", color:"var(--ink)" }}>Your chip</div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", lineHeight:1.45, marginTop:5 }}>
            {mine.color ? `${CHIP_SKIN_META[skin] || "Classic"} pattern` : "Choose a color and pattern."}
          </div>
        </div>
      </div>}
      {lateClaim && patterns}
      {lateClaim && <p className="fd-chip-late-note">Claiming a color locks your chip for the weekend.</p>}
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10,
        marginBottom:8 }}>
        <div style={{ ...label, fontSize:10 }}>Choose your color</div>
        {!mine.color && <div style={{ fontFamily:SANS, fontSize:10.5, color:"var(--muted)" }}>
          First come, first served
        </div>}
      </div>
      <div className="fd-chip-colors">
        {CHIP_COLORS.map(c => {
          const by = owner(c.hex);
          const isMine = by === me;
          const taken = by && !isMine;
          return (
            <button type="button" key={c.hex} disabled={taken || locked}
              onClick={() => lateClaim ? onChip(c.hex, skin) : onChip(isMine ? null : c.hex, undefined)}
              aria-label={taken ? `Color taken by ${disp(state, by)}`
                : isMine ? "Release selected chip color" : `Claim chip color ${c.hex}`}
              aria-pressed={isMine}
              title={taken ? `Taken by ${disp(state, by)}` : undefined}
              style={{ position:"relative", width:"100%", aspectRatio:"1", borderRadius:"50%", padding:3,
                display:"grid", placeItems:"center", cursor: taken || locked ? "default" : "pointer",
                background:isMine ? "var(--sun-tint)" : "transparent",
                border: isMine ? "2px solid var(--sun)" : "1px solid transparent",
                opacity: taken ? 0.42 : locked && !isMine ? 0.55 : 1 }}>
              <span style={{ position:"relative", display:"grid", placeItems:"center", width:"100%",
                aspectRatio:"1", maxWidth:34, borderRadius:"50%", background:c.hex,
                border:"1.5px solid var(--bone-line)" }}>
                {taken && <span style={{ fontFamily:SANS, fontWeight:800, fontSize:8.5,
                  color: c.light ? "var(--ink0)" : "var(--bone)" }}>
                  {(disp(state, by) || "").slice(0, 2).toUpperCase()}</span>}
                {isMine && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                    stroke={c.light ? "var(--ink0)" : "var(--bone)"} strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3.2 8.3 3 3 6.6-6.6" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!lateClaim && patterns}
    </div>
  );
}

function PatternPicker({ me, skin, locked, stamp, onPick }) {
  return (
    <>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10,
        marginBottom:8 }}>
        <div style={{ ...label, fontSize:10 }}>Choose your pattern</div>
      </div>
      <div className="fd-chip-patterns">
        {CHIP_SKINS.map(sk => (
          <button type="button" key={sk} disabled={locked} onClick={() => onPick(sk)}
            aria-label={`Chip pattern ${CHIP_SKIN_META[sk] || sk}`} aria-pressed={skin === sk}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              gap:5, minHeight:72, padding:"7px 4px 6px",
              borderRadius:10, cursor: locked ? "default" : "pointer",
              background:skin === sk ? "var(--sun-tint)" : "var(--paper2)",
              border: skin === sk ? "1.5px solid var(--sun)" : "1px solid var(--line)",
              boxShadow:skin === sk ? "inset 0 -2px 0 var(--sun)" : "none",
              opacity: locked && skin !== sk ? 0.55 : 1 }}>
            <ChipFace p={me} size={42} skin={sk} stamp={stamp} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5,
              color:skin === sk ? "var(--ink)" : "var(--muted2)", lineHeight:1.1 }}>
              {CHIP_SKIN_META[sk] || sk}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export { ProfileEditor, ChipPicker };
