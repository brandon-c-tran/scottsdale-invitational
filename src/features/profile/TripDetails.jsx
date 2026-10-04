import React, { useId } from "react";
import { NEEDS_MAX, cleanVenmo } from "../../../shared/guestSetup.js";

/* Venmo for splitting costs; drinking, because four games are drinking
   games and a non-drinker plays them with something else; food or drink
   needs. All three are the commissioner's and the guest's only. */
function TripDetails({ venmo, setVenmo, drinking, setDrinking, needs, setNeeds }) {
  const errorId = useId();
  const badVenmo = venmo.trim() !== "" && cleanVenmo(venmo) === undefined;
  return (
    <div className="fd-trip-details">
      <label className="fd-profile-field">
        <span>Venmo</span>
        <span className="fd-trip-venmo">
          <i aria-hidden="true">@</i>
          <input value={venmo} onChange={e => setVenmo(e.target.value)} placeholder="username" maxLength={31}
            autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Venmo username"
            aria-invalid={badVenmo} aria-describedby={badVenmo ? errorId : undefined} />
        </span>
      </label>
      {badVenmo && <div id={errorId} className="fd-profile-number-error" role="status">
        Letters, numbers, - and _ only</div>}
      <div className="fd-trip-question">Drinking this weekend?</div>
      <div className="fd-trip-choice" role="group" aria-label="Drinking this weekend?">
        <button type="button" aria-pressed={drinking === true} onClick={() => setDrinking(true)}>Yes</button>
        <button type="button" aria-pressed={drinking === false} onClick={() => setDrinking(false)}>Not drinking</button>
      </div>
      <label className="fd-profile-field">
        <span>Food or drink needs</span>
        <input value={needs} onChange={e => setNeeds(e.target.value)} maxLength={NEEDS_MAX}
          placeholder="Allergies, gluten-free" aria-label="Food or drink needs" />
      </label>
    </div>
  );
}

export { TripDetails };
