import React from "react";
import "./shell.css";
import "./experience.css";
import "./backglass.css";
import "./motion.css";

function Shell({ children, tv, arrival, environment = "production" }) {
  return <div className={`fd-shell${tv ? " fd-night" : ""}`}>
    <div className={`fd-shell-inner${tv ? " is-tv" : arrival ? " is-arrival" : ""}`}>
      {environment !== "production" && <div className="fd-environment" aria-label={`${environment} environment`}>
        {environment} · Field Day
      </div>}
      {children}
    </div>
  </div>;
}
export { Shell };
