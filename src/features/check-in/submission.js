/* Advancement is contingent on an acknowledged write. A retry stays on the
   same form with its draft intact. One in-flight submission per controller. */
export function createCheckInSubmission() {
  let pending = null;
  return (save, advance) => {
    if (pending) return pending;
    pending = Promise.resolve().then(save)
      .catch(() => ({ ok:false, error:"Couldn't save. Try again." }))
      .then(async result => {
        if (result?.ok !== true) {
          return { ...result, ok:false, error:result?.error || "Couldn't save. Try again." };
        }
        /* Keep the guard until advancement finishes. Errors after a successful
           acknowledgement must not be reported as a failed server write. */
        await advance();
        return result;
      })
      .finally(() => { pending = null; });
    return pending;
  };
}
