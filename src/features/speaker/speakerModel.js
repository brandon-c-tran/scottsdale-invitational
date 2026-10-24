/* The Speaker row and sheet as data. `status` is /api/spotify/status (null
   until it answers). Pure. */

/* the commissioner menu's value for the Speaker row: the chosen speaker,
   else what stands between him and one */
export function speakerValue(status) {
  if (!status || status.ok === false && status.configured === undefined) return null;
  if (!status.configured) return "Set up";
  if (status.reconnect) return "Reconnect";
  if (!status.connected) return "Not connected";
  return status.device?.name || "No speaker";
}

/* where the sheet opens: checking, setup (no app secrets), connect, or connected */
export function speakerStage(status) {
  if (!status) return "checking";
  if (!status.configured) return "setup";
  if (!status.connected) return "connect";
  return "connected";
}

/* a device in the speaker list: its name, marked when Spotify will not
   play on it */
export function deviceLabel(device) {
  if (!device) return "";
  return device.restricted ? `${device.name}, unavailable` : device.name;
}

/* The speakers to pick from (Oct 23): Spotify's list as it answered, and
   the saved speaker even while Spotify cannot see it (a speaker drops off
   the list while it sleeps), first, so the sheet only ever marks the
   speaker the server will play on. `known` is false until the list has
   answered; nothing reads as offline before then. */
export function speakerRows(devices = [], saved = null, { known = true } = {}) {
  const rows = (Array.isArray(devices) ? devices : []).filter(device => device && typeof device.id === "string" && device.id)
    .map(device => ({ id:device.id, name:device.name || "Spotify device", active:device.active === true,
      restricted:device.restricted === true, seen:true }));
  if (saved?.id && !rows.some(row => row.id === saved.id))
    rows.unshift({ id:saved.id, name:saved.name || "Saved speaker", active:false, restricted:false, seen:known ? false : null });
  return rows;
}

/* what a speaker row says beside its name, if anything */
export function speakerNote(row, { playing = false } = {}) {
  if (!row) return "";
  if (row.restricted) return "Unavailable";
  if (row.seen === false) return "Offline";
  if (row.active && playing) return "Playing";
  return "";
}
