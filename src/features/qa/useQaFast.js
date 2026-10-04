/* The commissioner QA sheet's writes: fast-forward jumps, single contest
   steps and checkpoints. Each is ONE server action and ONE broadcast.

   Confirmation stays on the server (worker/actions.js qaGate). Outside
   production a write that only needs the progress confirmation is retried
   with it at once: a staging rehearsal is disposable and the server keeps a
   pre-reset backup. Production always stops for an explicit second tap,
   and live poker cards always do, everywhere. */
import { useCallback, useEffect, useRef, useState } from "react";
import { RESET_PROGRESS_CONFIRMATION } from "../../../shared/core.js";

export const confirmPayload = (payload, prompt) => ({
  ...payload,
  ...(prompt.poker ? { confirmPokerLive:true } : { confirm:RESET_PROGRESS_CONFIRMATION }),
});

/* what a refused write asks of the commissioner, or null */
export function qaPrompt(result, { production }) {
  if (result?.ok || !result?.extra) return null;
  if (result.extra.needsPokerConfirm) return { poker:true, message:result.error, production:false };
  if (result.extra.needsConfirm)
    return { poker:false, message:result.error, production:!!result.extra.production || production,
      auto:!production && !result.extra.production };
  return null;
}

const fmt = n => Number(n || 0).toLocaleString("en-US");
const betsDone = result => result.extra?.unchanged ? "Already placed"
  : result.extra?.mode === "clear" ? `${result.extra.cleared} bet${result.extra.cleared === 1 ? "" : "s"} cleared`
    : `${result.extra?.placed} bet${result.extra?.placed === 1 ? "" : "s"}, ${fmt(result.extra?.chips)}`;

export function useQaFast({ dispatch, environment, notify, onDone }) {
  const production = environment === "production";
  const [pending, setPending] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [checkpoints, setCheckpoints] = useState(null);
  const busy = useRef(false);

  const write = useCallback(async (type, payload, { key, done } = {}) => {
    if (busy.current) return { ok:false, error:"Busy" };
    busy.current = true;
    setPending(key || type);
    setPrompt(null);
    try {
      let result = await dispatch(type, payload);
      let asked = qaPrompt(result, { production });
      if (asked?.auto) {
        payload = confirmPayload(payload, asked);
        result = await dispatch(type, payload);
        asked = qaPrompt(result, { production });
      }
      if (asked) { setPrompt({ ...asked, type, payload, key, done }); return result; }
      if (!result.ok) { notify?.(result.error || "QA write failed"); return result; }
      if (result.extra?.checkpoints) setCheckpoints(result.extra.checkpoints);
      if (done) notify?.(typeof done === "function" ? done(result) : result.extra?.unchanged ? `Already at ${done}` : done);
      onDone?.(type, result);
      return result;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, [dispatch, production, notify, onDone]);

  const confirm = useCallback(() => {
    if (!prompt) return null;
    const { type, payload, key, done } = prompt;
    return write(type, confirmPayload(payload, prompt), { key, done });
  }, [prompt, write]);

  const loadCheckpoints = useCallback(async () => {
    const result = await dispatch("qaCheckpoints", {});
    if (result.ok) setCheckpoints(result.extra?.checkpoints || []);
    return result;
  }, [dispatch]);

  return {
    production, pending, prompt, checkpoints, confirm,
    cancel:() => setPrompt(null),
    loadCheckpoints,
    jump:(target, done) => write("qaAdvance", { target }, { key:target, done }),
    restore:(checkpoint) => write("qaRestore", { id:checkpoint.id },
      { key:`restore:${checkpoint.id}`, done:checkpoint.name }),
    save:name => write("qaCheckpointSave", { name }, { key:"save" }),
    remove:id => write("qaCheckpointDelete", { id }, { key:`delete:${id}` }),
    /* quick bets on the contest taking bets (worker/qa.js runQaBets) */
    bets:(mode, market) => write("qaBets", { mode, ...(market ? { contestId:market.contestId,
      contestRevision:market.contestRevision } : {}) }, { key:`bets:${mode}`, done:betsDone }),
  };
}

/* Load the list once when the sheet mounts. */
export function useCheckpointList(qa) {
  const { loadCheckpoints } = qa;
  useEffect(() => { loadCheckpoints(); }, [loadCheckpoints]);
}
