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
