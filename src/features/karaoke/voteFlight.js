/* A karaoke vote on the phone: one write in the air at a time and the
   newest tap wins (Where and When's single flight, features/geo). The tier
   lit is `pending ?? echoed`: a tap lights at once and stays lit through
   any older echo of the frame until the frame carries it, so the lit tier
   never flickers back. A refusal lets the frame's tier show again beside
   the server's reason; a write that went unanswered settles from the next
   frame. Tapping the tier the server already has sends nothing.

   Pure: no React, no clock. `send(tier)` makes the write and resolves with
   its result; `update({ pending, error, sending })` hears every change;
   `errorOf(result)` words a refusal. */
export function voteFlight({ send, update = () => {}, errorOf = result => result?.error || "", initial = null }) {
  let wanted = null;           // the newest tap
  let echoed = initial ?? null; // the tier the latest frame carries
  let server = echoed;         // what the server is known to hold (the frame, or an acknowledged write)
  let inflight = null;
  let again = false;
  let unsure = false;
  let error = "";
  const pending = () => wanted !== null && wanted !== echoed ? wanted : null;
  const emit = () => update({ pending:pending(), error, sending:!!inflight });

  async function flush() {
    if (inflight) { again = true; return inflight; }
    const tier = wanted;
    if (tier === null || tier === server) {
      if (tier !== null && tier === echoed) wanted = null;
      emit();
      return null;
    }
    inflight = (async () => {
      try { return await send(tier); } catch (failure) { return { ok:false, error:failure?.message || "" }; }
    })();
    emit();
    const result = await inflight;
    inflight = null;
    if (result?.ok === true) { server = tier; unsure = false; error = ""; }
    else if (result?.uncertain === true) unsure = true;
    else {
      error = errorOf(result);
      if (wanted === tier) wanted = null;
    }
    if (again) { again = false; return flush(); }
    emit();
    return result;
  }

  return {
    /* a tap on a tier: lit at once, sent when nothing else is in the air */
    tap(tier) {
      wanted = tier;
      error = "";
      emit();
      return flush();
    },
    /* the frame's own tier for you (null: none yet) */
    echo(tier) {
      echoed = tier ?? null;
      server = echoed;
      if (wanted !== null && wanted === echoed) wanted = null;
      /* an unanswered write the frame does not carry did not land */
      else if (wanted !== null && unsure && !inflight) { wanted = null; unsure = false; }
      emit();
    },
    /* the tier to light */
    lit() { return pending() ?? echoed; },
    state() { return { pending:pending(), error, sending:!!inflight, echoed, server, wanted }; },
  };
}
