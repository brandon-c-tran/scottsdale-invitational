/* The question bank's test fixtures (worker/triviaQBank/_fixtures.json,
   built by scripts/tq/fixtures.mjs): a full 7 x 5 board of stand-in
   records, one clue of every kind. `withFixtureBank()` swaps them in as the
   Worker's bank and hands back the restore. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { useQBank } from "../../worker/triviaQBank/index.js";

export const FIXTURES = JSON.parse(readFileSync(fileURLToPath(new URL("../../worker/triviaQBank/_fixtures.json", import.meta.url)), "utf8"));
export const FIXTURE_PLAN = FIXTURES.plan;
export const fixture = id => FIXTURES.records.find(record => record.id === id);
export const withFixtureBank = ({ recommended = null } = {}) => useQBank({ records:FIXTURES.records, recommended });
