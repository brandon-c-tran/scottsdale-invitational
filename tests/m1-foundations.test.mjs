import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_EVENTS,
  EMPTY_STATE,
  ROSTER,
  ROSTER_CONFIG,
  defaultQaParticipants,
  drawTeams,
  makeBracket,
  rosterPlayers,
  validateEventParticipants,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { hydrateStoredState } from "../worker/state.js";
import { Tournament } from "../worker/tournament.js";
import {
  buildSnapshot,
  nextRestoreVersion,
  snapshotSha256,
  validateSnapshot,
} from "../worker/snapshot.js";

const gm = { isGm:true, player:"Brandon" };
const eightBall = BUILTIN_EVENTS.find(event => event.id === "8ball");
const snapshotEntries = () => new Map([
  ["state", structuredClone(EMPTY_STATE)],
  ["version", 7],
  ["claims", { deviceA:"Brandon" }],
]);
const tournamentFor = env => new Tournament({ blockConcurrencyWhile() {} }, env);

test("roster config is additive and attendance status does not rewrite profile data", () => {
  assert.equal(ROSTER_CONFIG.length, 13);
  assert.equal(ROSTER.length, 13);

  const config12 = ROSTER_CONFIG.slice(0, 12);
  const config14 = [...ROSTER_CONFIG, { id:"Guest14", name:"Guest 14", status:"confirmed" }];
  assert.equal(rosterPlayers(config12).length, 12);
  assert.equal(rosterPlayers(config14).length, 14);
  assert.deepEqual(rosterPlayers(config14).slice(0, 13), ROSTER);

  const profiles = { Jeremy:{ display:"J", num:42 }, Brandon:{ display:"B" } };
  const attendanceChanged = ROSTER_CONFIG.map(player =>
    player.id === "Jeremy" ? { ...player, status:"out" } : player);
  assert.equal(rosterPlayers(attendanceChanged).length, 12);
  assert.deepEqual(profiles.Jeremy, { display:"J", num:42 });
});

test("strict team participation handles 12, 13, and 14 active-roster scenarios explicitly", () => {
  const active12 = ROSTER.slice(0, 12);
  const active13 = [...ROSTER];
  const active14 = [...ROSTER, "Guest14"];

  assert.equal(validateEventParticipants(eightBall, active12, active12).ok, true);
  assert.match(validateEventParticipants(eightBall, active13, active13).error, /exactly 12/i);
  assert.match(validateEventParticipants(eightBall, active14, active14).error, /exactly 12/i);

  const chosen12of14 = validateEventParticipants(eightBall, active14.slice(0, 12), active14);
  assert.equal(chosen12of14.ok, true);
  assert.equal(chosen12of14.overflow.length, 2);
});

test("server rejects oversized draws and persists exact teams plus overflow roles", () => {
  const rejectedState = structuredClone(EMPTY_STATE);
  const rejected = applyAction(rejectedState, "runDraw", {
    evId:"8ball",
    players:ROSTER,
  }, gm);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /exactly 12/i);
  assert.equal(rejectedState.draws["8ball"], undefined);

  const state = structuredClone(EMPTY_STATE);
  const players = ROSTER.slice(0, 12);
  const accepted = applyAction(state, "runDraw", {
    evId:"8ball",
    players,
    roles:[{ player:ROSTER[12], role:"referee" }],
  }, gm);
  assert.equal(accepted.ok, true);
  const draw = state.draws["8ball"];
  assert.equal(draw.teams.length, 6);
  assert.ok(draw.teams.every(team => team.players.length === 2));
  assert.deepEqual(new Set(draw.teams.flatMap(team => team.players)), new Set(players));
  assert.deepEqual(draw.roles, [{ player:ROSTER[12], role:"referee" }]);

  const draftState = structuredClone(EMPTY_STATE);
  const drafted = applyAction(draftState, "startDraft", {
    evId:"bball",
    players,
    captains:players.slice(0, 4),
    roles:[{ player:ROSTER[12], role:"photographer" }],
  }, gm);
  assert.equal(drafted.ok, true);
  assert.deepEqual(draftState.drafts.bball.roles,
    [{ player:ROSTER[12], role:"photographer" }]);
});

test("shared draw helper produces exact-sized groups", () => {
  const draw = drawTeams(eightBall, structuredClone(EMPTY_STATE), ROSTER.slice(0, 12));
  assert.ok(draw);
  assert.equal(draw.teams.length, 6);
  assert.ok(draw.teams.every(team => team.players.length === 2));
});

test("every shipped strict team format yields exact QA participants and group sizes", () => {
  for (const event of BUILTIN_EVENTS.filter(candidate => candidate.teamCfg)) {
    const expected = event.teamCfg.teams * event.teamCfg.size;
    const players = defaultQaParticipants(event, ROSTER);
    assert.equal(players.length, expected, `${event.id} QA participant count`);
    assert.equal(validateEventParticipants(event, players, ROSTER).ok, true, `${event.id} validation`);
    const draw = drawTeams(event, structuredClone(EMPTY_STATE), players);
    assert.ok(draw, `${event.id} draw`);
    assert.equal(draw.teams.length, event.teamCfg.teams, `${event.id} team count`);
    assert.ok(draw.teams.every(team => team.players.length === event.teamCfg.size),
      `${event.id} exact group size`);
  }
  assert.ok(makeBracket(4));
  assert.ok(makeBracket(6));
  assert.equal(makeBracket(5), null);
});

test("snapshot builder excludes credentials and internal restore backups", () => {
  const entries = snapshotEntries();
  entries.set("gmToken", "secret");
  entries.set("m1:pre-restore:123:manifest", { secret:"backup" });
  entries.set("future:portable-key", { value:1 });
  const snapshot = buildSnapshot(entries, {
    environment:"local",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  assert.equal(snapshot.entries.some(entry => entry.key === "gmToken"), false);
  assert.equal(snapshot.entries.some(entry => entry.key.startsWith("m1:pre-restore:")), false);
  assert.deepEqual(snapshot.entries.find(entry => entry.key === "future:portable-key")?.value, { value:1 });
  assert.equal(validateSnapshot(snapshot).ok, true);
});

test("snapshot round-trip includes referenced photos and has a deterministic hash", async () => {
  const entries = snapshotEntries();
  const state = entries.get("state");
  state.profiles.Brandon = { display:"Brandon", photoV:123 };
  entries.set("photo:Brandon", "data:image/png;base64,AA==");
  const snapshot = buildSnapshot(entries, {
    environment:"staging",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true);
  assert.equal(checked.stats.photos, 1);
  assert.deepEqual(checked.entries.get("state"), state);
  assert.equal(await snapshotSha256(snapshot), await snapshotSha256(snapshot));
});

test("restore versions remain monotonic for older and newer snapshots", () => {
  assert.equal(nextRestoreVersion(50, 7), 51);
  assert.equal(nextRestoreVersion(7, 50), 51);
});

test("environment capabilities fail closed and production restore routes hard deny", async () => {
  const unknown = tournamentFor({});
  assert.equal(unknown.environment, "production");
  assert.deepEqual(unknown.capabilities, { qa:false, restore:false, snapshotExport:false });

  const local = tournamentFor({ APP_ENV:"local" });
  assert.deepEqual(local.capabilities, { qa:true, restore:true, snapshotExport:true });

  const production = tournamentFor({
    APP_ENV:"production",
    SNAPSHOT_ADMIN_TOKEN:"snapshot-test-token",
  });
  production.gmToken = "test-token";
  const weakRequest = new Request("https://fielddayseries.com/api/admin/snapshot", {
    headers:{ Authorization:"Bearer test-token" },
  });
  assert.equal((await production.handleAdmin(weakRequest, new URL(weakRequest.url))).status, 403);
  for (const path of ["/api/admin/restore", "/api/admin/restore-backup"]) {
    const request = new Request(`https://fielddayseries.com${path}`, {
      method:"POST",
      headers:{ Authorization:"Bearer snapshot-test-token" },
    });
    const response = await production.handleAdmin(request, new URL(request.url));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /disabled in production/);
  }
});

test("malformed, incompatible, unsafe, and incomplete snapshots are rejected", () => {
  assert.throws(() => JSON.parse("{broken"));
  assert.equal(validateSnapshot(null).ok, false);

  const valid = buildSnapshot(snapshotEntries(), {
    environment:"local",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  const missingState = structuredClone(valid);
  missingState.entries = missingState.entries.filter(entry => entry.key !== "state");
  assert.match(validateSnapshot(missingState).errors.join(" "), /Missing required storage key: state/);

  const wrongSchema = structuredClone(valid);
  wrongSchema.metadata.stateSchemaVersion = 999;
  wrongSchema.entries.find(entry => entry.key === "state").value.v = 999;
  assert.match(validateSnapshot(wrongSchema).errors.join(" "), /Unsupported/);

  const unsafe = structuredClone(valid);
  unsafe.entries.push({ key:"gmToken", value:"do-not-import" });
  assert.match(validateSnapshot(unsafe).errors.join(" "), /Unsafe storage key/);

  const duplicate = structuredClone(valid);
  duplicate.entries.push(structuredClone(duplicate.entries[0]));
  assert.match(validateSnapshot(duplicate).errors.join(" "), /Duplicate storage key/);

  const missingPhoto = structuredClone(valid);
  missingPhoto.entries.find(entry => entry.key === "state").value.profiles.Brandon =
    { display:"Brandon", photoV:1 };
  assert.match(validateSnapshot(missingPhoto).errors.join(" "), /Missing referenced photo/);

  const oversized = structuredClone(valid);
  oversized.entries.push({ key:"future:large", value:"x".repeat(8 * 1024 * 1024) });
  assert.match(validateSnapshot(oversized).errors.join(" "), /maximum size/);
});

test("pre-M1 state hydrates additively without rewriting persisted values", () => {
  const stored = {
    v:5,
    profiles:{ Brandon:{ display:"B", num:10 } },
    results:{ putt:{ id:"r1", slots:[["Brandon"], [], []] } },
    logistics:{ v:2, venue:"Original venue" },
    legacyMarker:"keep-me",
  };
  const untouched = structuredClone(stored);
  const hydrated = hydrateStoredState(stored);

  assert.deepEqual(stored, untouched);
  assert.deepEqual(hydrated.profiles.Brandon, { display:"B", num:10 });
  assert.equal(hydrated.results.putt.id, "r1");
  assert.equal(hydrated.logistics.venue, "Original venue");
  assert.equal(hydrated.legacyMarker, "keep-me");
  assert.ok(Array.isArray(hydrated.wagers));
  assert.ok(hydrated.draws && typeof hydrated.draws === "object");
});
