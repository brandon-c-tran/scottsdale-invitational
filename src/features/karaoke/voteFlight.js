/* A karaoke vote on the phone: one write in the air at a time and the
   newest tap wins (Where and When's single flight, features/geo). The tier
   lit is `pending ?? echoed`: a tap lights at once and stays lit through
   any older echo of the frame until the frame carries it, so the lit tier
   never flickers back. A refusal lets the frame's tier show again beside
   the server's reason. A write that went unanswered keeps its tier lit
   until the transport settles it (client.js `settled`): landed, it holds;
   not applied, the frame's tier shows again. Tapping the tier the server
   already has sends nothing.

   Pure: no React, no clock. `send(tier)` makes the write and resolves with
   its result; `update({ pending, error, sending })` hears every change;
   `errorOf(result)` words a refusal. */
export function voteFlight({ send, update = () => {}, errorOf = result => result?.error || "", initial = null }) {
  let wanted = null;            // the newest tap
  let echoed = initial ?? null; // the tier the latest frame carries
  let server = echoed;          // what the server is known to hold (the frame, or an acknowledged write)
  let inflight = null;
  let again = false;
  let unsure = null;            // a sent tier the transport has not settled yet
  let error = "";
  const pending = () => wanted !== null && wanted !== echoed ? wanted : null;
  const emit = () => update({ pending:pending(), error, sending:!!inflight });

  /* an unanswered write, settled later: landed, or not applied */
  function settle(tier, settled) {
    Promise.resolve(settled).then(final => {
      if (unsure !== tier) return;
      unsure = null;
      if (final?.ok === true) server = tier;
      else if (wanted === tier) { wanted = null; error = errorOf(final); }
      emit();
    }, () => {});
  }

  async function flush() {
    if (inflight) { again = true; return inflight; }
    const tier = wanted;
    if (tier === null || tier === server) {
      if (tier !== null && tier === echoed) wanted = null;
      emit();
      return null;
    }
    /* a newer tap supersedes whatever an unanswered write settles to */
    unsure = null;
    inflight = (async () => {
      try { return await send(tier); } catch (failure) { return { ok:false, error:failure?.message || "" }; }
    })();
    emit();
    const result = await inflight;
    inflight = null;
    if (result?.ok === true) { server = tier; error = ""; if (unsure === tier) unsure = null; }
    else if (result?.uncertain === true) { unsure = tier; settle(tier, result.settled); }
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
      if (!inflight && unsure === null) server = echoed;
      if (wanted !== null && wanted === echoed) { wanted = null; if (unsure === echoed) unsure = null; }
      emit();
    },
    /* the tier to light */
    lit() { return pending() ?? echoed; },
    state() { return { pending:pending(), error, sending:!!inflight, echoed, server, wanted, unsure }; },
  };
}
