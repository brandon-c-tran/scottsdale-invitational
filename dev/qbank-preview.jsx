/* The Question bank desk, rehearsed (docs/TRIVIA-QBANK.md "The desk"): the
   real desk over the fixture bank (dev/fit/qbankDeskFixtures.js), every write
   the Worker's own reducer (worker/qbank.js through applyAction) on a
   state in memory, the bank read as GET /api/trivia/qbank answers it. No
   socket, no Durable Object; a reload starts over.

     /dev/qbank-preview.html                     the worked board (edits, marks, warnings)
     ?real=1                                     the real bank (worker/triviaQBank) on its recommended board
     ?stage=fresh|worked|empty                   the recommended board, worked, or nothing picked
     &slot=<col>:<slot>                          that slot's sheet open
     &open=<record id>                           that row open in it
     &browse=1                                   Browse all open
     &edit=<record id>                           the editor open
     &warnings=1                                 the warnings list open
     &q=<search>&category=<id>&status=<status>   the bank filtered
     &fail=1                                     every write refused (the errors)
     &slow=<ms>                                  every write takes that long (the pending guard)
     &load=fail                                  the bank does not load
     &bank=<url>                                 another bank ({ records, recommended }: a
                                                 content branch's files, its media served at
                                                 /tq/) in place of the fixtures, from nothing picked */
import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { QBankDesk } from "../src/features/trivia/QBankDesk.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { Sheet } from "../src/ui/controls.jsx";
import { deskWrite, qbankFixtureResponse, qbankFixtureState, useDeskBank } from "./fit/qbankDeskFixtures.js";
import { useQBank } from "../worker/triviaQBank/index.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const slot = /^(\d):(\d)$/.exec(params.get("slot") || "");
const initial = {
  ...(slot ? { slot:{ col:Number(slot[1]), slot:Number(slot[2]) } } : {}),
  ...(params.get("edit") ? { edit:params.get("edit") } : {}),
  ...(params.get("warnings") ? { warnings:true } : {}),
  ...(params.get("open") ? { open:params.get("open") } : {}),
  ...(params.get("browse") ? { browse:true } : {}),
  filters:{ ...(params.get("q") ? { query:params.get("q") } : {}), ...(params.get("category") ? { category:params.get("category") } : {}),
    ...(params.get("status") ? { status:params.get("status") } : {}), ...(params.get("tier") ? { tier:params.get("tier") } : {}),
    ...(params.get("mark") ? { mark:params.get("mark") } : {}) },
};
const SLOW = Number(params.get("slow")) || 0;
const FAIL = !!params.get("fail");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const BANK = params.get("bank");
const REAL = !!params.get("real");
if (BANK) useQBank(await (await fetch(BANK)).json()); else if (!REAL) useDeskBank();
const first = BANK || REAL ? { triviaPlan:null, triviaBankEdits:{}, triviaBankMarks:{} }
  : qbankFixtureState(params.get("stage") || "worked");
let latest = first;
const load = async () => {
  await wait(120);
  return params.get("load") === "fail" ? { ok:false, error:"Couldn't load the question bank. Try again." } : qbankFixtureResponse(latest);
};

function Desk() {
  const [state, setState] = useState(first);
  const [toast, setToast] = useState("");
  const onAct = useCallback(async (type, payload) => {
    if (SLOW) await wait(SLOW);
    if (FAIL) return { ok:false, error:"Offline, try again" };
    const next = structuredClone(state);
    const result = deskWrite(next, type, payload);
    if (result.ok) { latest = next; setState(next); }
    return result;
  }, [state]);
  const notify = text => { setToast(text); setTimeout(() => setToast(current => current === text ? "" : current), 2400); };
  return <Shell environment="production">
    <Sheet title="Your board" className="fd-qb-sheet" onClose={() => {}}>
      <QBankDesk state={state} onAct={onAct} notify={notify} loadQBank={load} initial={initial} />
    </Sheet>
    {toast && <div role="status" style={{ position:"fixed", left:16, right:16, bottom:24, zIndex:400, padding:"12px 16px", borderRadius:10,
      background:"var(--paper2)", color:"var(--ink)", border:"1px solid var(--line)", font:"600 14px/1.3 var(--fd-body)", textAlign:"center" }}>{toast}</div>}
  </Shell>;
}

createRoot(document.getElementById("root")).render(<Desk />);
