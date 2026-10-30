/* The Trivia question bank's records (docs/TRIVIA-QBANK.md), Worker only:
   answers live here and never in a client bundle (tests scan that nothing
   under src/ or shared/ imports this folder). One file per category, each
   an array of records (shared/triviaQBank.js cleanQBankRecord is the rule
   book), and `recommended.json`, the board the integrator picked: the plan's
   shape ({ columns:[{ category, name, slots:[qid|null] x5 }] x7 }) without
   `updatedAt`, or null.

   A record that fails the rules is left out here (npm test names it). The
   bank can be swapped for a test or a rehearsal (`useQBank`), never by a
   client. */
import nba from "./nba.json" with { type:"json" };
import kim from "./kim.json" with { type:"json" };
import lore from "./lore.json" with { type:"json" };
/* "aux" is a reserved file name on Windows (a device), so its file is aux-bank.json */
import aux from "./aux-bank.json" with { type:"json" };
import web from "./web.json" with { type:"json" };
import sound from "./sound.json" with { type:"json" };
import sil from "./sil.json" with { type:"json" };
import recommended from "./recommended.json" with { type:"json" };
import { cleanQBankPlan, cleanQBankRecord } from "../../shared/triviaQBank.js";

export const QBANK_FILES = Object.freeze({ nba, kim, lore, aux, web, sound, sil });

function load(lists, plan) {
  const records = [];
  const byId = new Map();
  for (const list of lists) for (const raw of Array.isArray(list) ? list : []) {
    const { record } = cleanQBankRecord(raw);
    if (!record || byId.has(record.id)) continue;
    records.push(record);
    byId.set(record.id, record);
  }
  const cleaned = plan ? cleanQBankPlan(plan, byId) : null;
  return { records, byId, recommended:cleaned?.plan ? { ...cleaned.plan, updatedAt:0 } : null };
}

let bank = load(Object.values(QBANK_FILES), recommended);

/* the bank as the Worker reads it: { records, byId, recommended } */
export const qbank = () => bank;
export const qbankRecord = id => bank.byId.get(id) || null;

/* a test's or a rehearsal's own bank, until the returned restore runs */
export function useQBank({ records = [], recommended:plan = null } = {}) {
  const before = bank;
  bank = load([records], plan);
  return () => { bank = before; };
}
