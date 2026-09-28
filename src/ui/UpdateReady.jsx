import React from "react";

/* A newer build is live. A small chip in the header, beside the connection
   status, never floating over the page. Phones also reload on their own the
   next time they come back to the foreground with no sheet open; the TV
   reloads itself when idle and never shows this. */
export function UpdateChip({ onReload }) {
  return <button type="button" className="fd-update-chip" onClick={onReload}
    aria-label="Update ready. Reload">
    <span>Update</span>
  </button>;
}
