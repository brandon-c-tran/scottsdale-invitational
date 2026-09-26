/* Both parts of a profile save must settle before a guest leaves the editor.
   Repeating a save is safe: an uploaded photo replaces the same player's key. */
export async function savePlayerProfile({ player, profile, save, upload }) {
  const { photo, ...fields } = profile;
  let result;
  try { result = await save(player, fields); }
  catch { return { ok:false, error:"Couldn't save your profile. Try again." }; }
  if (result?.ok !== true) {
    return { ...result, ok:false, error:result?.error || "Couldn't save your profile. Try again." };
  }
  if (!photo) return result;

  /* Photo data travels through HTTP, never the profile action. A successful
     profile write does not mean this second write succeeded. Retain the draft
     on failure so retry can submit the same fields and photo. */
  let photoResult;
  try { photoResult = await upload(player, photo); }
  catch { /* Convert a network exception into the same recoverable result. */ }
  return photoResult?.ok === true ? result
    : { ok:false, error:photoResult?.error || "Couldn't save your photo. Try again.", profileSaved:true };
}
