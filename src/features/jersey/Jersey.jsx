import React, { useId } from "react";
import { disp } from "../../../shared/core.js";
import { JERSEY_NAME_MAX, cleanBackName, jerseyName } from "../../../shared/guestSetup.js";
import { SizeRow } from "../travel/Travel.jsx";
import "./jersey.css";
import { Icon } from "../../ui/Icon.jsx";

/* The back of the jersey as it will print: the name across the shoulders,
   the number, the size on the collar tag. Neutral cloth, because only these
   three are the guest's to confirm. */
function JerseyBack({ name, num, size }) {
  const long = (name || "").length > 8;
  return (
    <svg className="fd-jersey-art" viewBox="0 0 240 250" role="img"
      aria-label={`Jersey back: ${name || "no name"}, number ${num === "" || num == null ? "none" : num}, size ${size || "none"}`}>
      <path className="fd-jersey-cloth" d="M88 12 Q120 24 152 12 L198 28 L234 76 L204 100 L188 86 L188 242
        Q120 248 52 242 L52 86 L36 100 L6 76 L42 28 Z" />
      <path className="fd-jersey-collar" d="M88 12 Q120 24 152 12" />
      <rect className="fd-jersey-tag" x="109" y="22" width="22" height="14" rx="2" />
      <text className="fd-jersey-tag-text" x="120" y="32.5" textAnchor="middle">{size || "?"}</text>
      <text className={`fd-jersey-name${name ? "" : " is-empty"}`} x="120" y="70" textAnchor="middle"
        {...(long ? { textLength:136, lengthAdjust:"spacingAndGlyphs" } : {})}>{name || "NAME"}</text>
      <text className={`fd-jersey-num${num === "" || num == null ? " is-empty" : ""}`} x="120" y="182"
        textAnchor="middle">{num === "" || num == null ? "00" : num}</text>
    </svg>
  );
}

/* The profile's Jersey section. The sheet owns the draft (the number is the
   same field the Card section edits) and its one button confirms. */
function JerseySection({ state, me, display, backName, setBackName, num, setNum, size, setSize, locked, confirmed }) {
  const errorId = useId();
  const fallback = jerseyName({ display }, me);
  const clean = cleanBackName(backName);
  const name = clean === undefined ? backName.toUpperCase() : clean || fallback;
  const takenBy = num !== "" ? Object.entries(state.profiles || {})
    .find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
  const problem = clean === undefined ? `Letters only, up to ${JERSEY_NAME_MAX}`
    : takenBy ? `${disp(state, takenBy[0])} already has ${Number(num)}` : "";
  return (
    <div className="fd-jersey">
      <div className="fd-jersey-stage">
        <JerseyBack name={name} num={num} size={size} />
        {locked ? <p className="fd-jersey-status">Jerseys are ordered</p>
          : confirmed && <p className="fd-jersey-status is-ok"><Icon name="check" size={14} />Confirmed</p>}
      </div>
      <div className="fd-profile-name-row">
        <label className="fd-profile-field">
          <span>Name on back</span>
          <input value={backName} placeholder={fallback} maxLength={JERSEY_NAME_MAX + 4} disabled={locked}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Name on back"
            aria-invalid={clean === undefined} aria-describedby={problem ? errorId : undefined}
            onChange={e => setBackName(e.target.value)} />
        </label>
        <label className="fd-profile-field fd-profile-number-field">
          <span>No.</span>
          <input value={num} inputMode="numeric" placeholder="00" aria-label="Jersey number" disabled={locked}
            aria-invalid={!!takenBy} aria-describedby={problem ? errorId : undefined}
            onChange={e => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
      </div>
      {problem && <div id={errorId} className="fd-profile-number-error" role="status">{problem}</div>}
      <div className="fd-jersey-size">
        {locked ? <p className="fd-jersey-locked-size">Size <strong>{size || "not set"}</strong></p>
          : <SizeRow lb="Size, T-shirt and jersey" value={size} onPick={setSize} />}
      </div>
    </div>
  );
}

export { JerseyBack, JerseySection };
