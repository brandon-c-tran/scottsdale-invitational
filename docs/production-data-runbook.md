# Field Day production data runbook

This runbook covers portable snapshots for the `Tournament` Durable Object
named `main`. It does not authorize production access, deployment, reset, or
restore.

## Safety rules

1. Never put a snapshot in the repository.
2. Never paste a GM token, PIN, snapshot, profile, flight, claim, or photo into
   an issue, log, chat, or command argument.
3. Validate before import.
4. Restore into local first, staging second, and never production first.
5. Verify the environment banner and API response before any import.
6. A restore must create a pre-restore backup.
7. Production export, staging creation, production-derived staging import, and
   any PITR action require explicit approval.

Portable snapshots contain personal and travel data. Treat them as private
operational records.

## What is stored

The namespace is SQLite-backed because `wrangler.jsonc` created `Tournament`
with `new_sqlite_classes`.

The app currently uses the Durable Object KV API:

- `state`
- `version`
- `claims`
- `gmToken`
- `photo:<player-id>`

Snapshot export enumerates storage so future portable keys are included.
`gmToken` and internal `m1:pre-restore:*` keys are deliberately excluded.

Cloudflare SQLite-backed Durable Objects also support point-in-time recovery
for the embedded database, including KV data. PITR is a secondary emergency
tool. It is not available in local development and is not a substitute for the
portable snapshot.

Official references:

- [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Object environments](https://developers.cloudflare.com/durable-objects/reference/environments/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)

## Local setup

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The app must show `LOCAL`.

In another PowerShell window:

```powershell
npm.cmd run test
npm.cmd run build
```

## Snapshot authentication

Unlock commissioner mode in the target app. The current GM token is stored in
that browser's local storage as `si-gm-token`. It is accepted for local and
staging snapshot operations only.

For local or approved staging operator use, copy it into the current shell
without placing it in shell history:

```powershell
$secureToken = Read-Host "GM token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$env:FIELD_DAY_GM_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
```

Clear it when finished:

```powershell
Remove-Item Env:FIELD_DAY_GM_TOKEN
Remove-Variable secureToken, tokenPointer -ErrorAction SilentlyContinue
```

Production export does not trust the client-visible commissioner PIN or token.
It requires a separate Worker secret named `SNAPSHOT_ADMIN_TOKEN`. Creating or
rotating that secret is a production mutation and requires explicit approval:

```powershell
npx.cmd wrangler secret put SNAPSHOT_ADMIN_TOKEN
```

For an approved production export, load the matching value without placing it
in shell history:

```powershell
$secureSnapshotToken = Read-Host "Production snapshot token" -AsSecureString
$snapshotTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSnapshotToken)
$env:FIELD_DAY_SNAPSHOT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($snapshotTokenPointer)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($snapshotTokenPointer)
```

Clear it when finished:

```powershell
Remove-Item Env:FIELD_DAY_SNAPSHOT_TOKEN
Remove-Variable secureSnapshotToken, snapshotTokenPointer -ErrorAction SilentlyContinue
```

Never place the value directly in a command or repository file.

## Local snapshot export

Create the ignored output directory:

```powershell
New-Item -ItemType Directory -Force -Path '.\snapshots' | Out-Null
```

Export:

```powershell
npm.cmd run snapshot:export -- --url http://127.0.0.1:5173 --out .\snapshots\local.fieldday-snapshot.json
```

Expected properties:

- HTTP 200
- `format` is `field-day-snapshot`
- `snapshotVersion` is supported
- `metadata.environment` is `local`
- `state`, `version`, and `claims` entries exist
- any profile with `photoV` has a `photo:<id>` entry

Export is read-only. Tournament version must not change.

## Offline snapshot validation

```powershell
npm.cmd run snapshot:validate -- .\snapshots\local.fieldday-snapshot.json
```

A valid result prints metadata, entry count, photo count, and SHA-256. It does
not print claims, profile values, travel data, or photo bodies.

Validation must fail for:

- malformed JSON
- unsupported snapshot or state schema
- duplicate keys
- missing required keys
- `gmToken` or internal backup keys
- invalid metadata
- a referenced photo missing from entries
- a payload over configured bounds

## Non-production restore rehearsal

First record the current local state by exporting it:

```powershell
npm.cmd run snapshot:export -- --url http://127.0.0.1:5173 --out .\snapshots\before-local-restore.fieldday-snapshot.json
npm.cmd run snapshot:validate -- .\snapshots\before-local-restore.fieldday-snapshot.json
```

Validate the candidate:

```powershell
npm.cmd run snapshot:validate -- .\snapshots\local.fieldday-snapshot.json
```

Restore:

```powershell
npm.cmd run snapshot:restore -- --url http://127.0.0.1:5173 --file .\snapshots\local.fieldday-snapshot.json --confirm local
```

The response must contain:

- environment `local`
- a `m1:pre-restore:*` backup key
- restored entry count
- a transport version greater than both the old and imported version
- snapshot SHA-256

Then refresh the app and verify:

- profiles and claims expected by the fixture
- photos load
- standings match the snapshot
- WebSocket reconnect succeeds
- build and E2E still pass

```powershell
npm.cmd run test
npm.cmd run test:e2e
```

## Staging setup

The repository can define staging locally without creating it. The first
staging deployment creates or binds Cloudflare resources and is an approval
stop.

After approval:

```powershell
npm.cmd run build:staging
npm.cmd run deploy:staging
```

Before confirming deployment, verify Wrangler reports:

- target Worker `scottsdale-invitational-staging`
- no `fielddayseries.com` route
- `APP_ENV=staging`
- a `TOURNAMENT` binding owned by the staging Worker

Configure the staging GM secret independently when the PIN is moved out of
source. Do not reuse a production token.

## Import a snapshot into staging

This requires approval if the snapshot came from production.

Validate locally first:

```powershell
npm.cmd run snapshot:validate -- .\snapshots\approved-production.fieldday-snapshot.json
```

Export staging before import:

```powershell
npm.cmd run snapshot:export -- --url https://scottsdale-invitational-staging.<account-subdomain>.workers.dev --out .\snapshots\before-staging-restore.fieldday-snapshot.json
```

Restore only after the staging UI and API both identify `staging`:

```powershell
npm.cmd run snapshot:restore -- --url https://scottsdale-invitational-staging.<account-subdomain>.workers.dev --file .\snapshots\approved-production.fieldday-snapshot.json --confirm staging
```

Do not copy staging runtime state back to production. Promote code and
configuration, not rehearsal results.

## Production export

Do not run this without explicit approval. It reads real personal data.

Exact command:

```powershell
npm.cmd run snapshot:export -- --url https://fielddayseries.com --out .\snapshots\production-YYYYMMDD-HHMM.fieldday-snapshot.json --confirm production-export
```

Immediately validate it:

```powershell
npm.cmd run snapshot:validate -- .\snapshots\production-YYYYMMDD-HHMM.fieldday-snapshot.json
```

Record only:

- SHA-256
- export timestamp
- application version
- state schema
- entry/photo counts
- secure storage location

Do not record snapshot contents.

## Production dry run and game-progress reset

Use the production QA console only for an approved pre-weekend dry run. Before
starting:

1. deploy the exact commit accepted in staging
2. export and validate a fresh production snapshot using the commands above
3. record its SHA-256 and secure storage location
4. unlock commissioner mode and turn on QA
5. run the desired checkpoints or the full weekend
6. choose `Reset game progress` from QA or commissioner controls
7. review the kept/cleared summary, check the production confirmation, and
   reset
8. verify the profiles, claims, photos, chip choices, travel details, ratings,
   and event configuration are still present

The reset keeps:

- profiles, ratings, shirt/travel answers, seeds, and logistics
- device claims, photos, chip colors, and chip skins
- onboarding epoch
- custom event additions, edits, and order

The reset clears:

- live/frozen status, results, wagers, rulings, and event lifecycle progress
- draws, brackets, heats, pools, drafts, duels, and poker
- shelved/on-deck state

The server requires commissioner authentication, an enabled environment
capability, and the exact reset confirmation. It transactionally writes one
rotating `m1:pre-reset:` internal backup before publishing the reset. That
backup is not included in portable exports and is not a substitute for the
validated production snapshot. Production restore and internal-backup recovery
remain disabled.

Do not use `Rerun check-in on every phone` for this rehearsal cleanup. That
operation intentionally releases chip claims.

## Production restore

The application restore route rejects production. That is intentional.

If production recovery is ever required:

1. stop and obtain explicit approval
2. generate or locate the latest validated portable snapshot
3. inspect the incident and decide between corrective actions, code rollback,
   portable restore tooling prepared for a controlled maintenance window, or
   Cloudflare PITR
4. create a fresh pre-restore production export if the system is readable
5. identify the exact recovery timestamp/bookmark
6. rehearse the same procedure in staging
7. execute only the approved command or UI action
8. verify profiles, photos, claims, standings, and reconnect behavior

No production restore command is included because the normal route must not
allow it.

## Recovery from a bad non-production restore

The restore response returns the pre-restore backup key. Internal backups are
not part of normal portable exports.

Use the recovery command only in the same local/staging environment and only
with the exact key returned by the failed restore:

```powershell
npm.cmd run snapshot:recover -- --url http://127.0.0.1:5173 --backup m1:pre-restore:<timestamp> --confirm local
```

Recovery validates the internal backup, creates a new pre-recovery backup,
restores transactionally, and advances the transport version. It is also hard
disabled in production. If the internal backup is unavailable, restore the
portable `before-<environment>-restore.fieldday-snapshot.json` created above.

## Snapshot handling and retention

- Store outside the repository.
- Prefer encrypted device or encrypted archive storage.
- Keep at least the last pre-event snapshot and each event-day snapshot.
- Delete obsolete copies only after a newer copy has been validated and its
  restore rehearsed.
- Never email an unencrypted snapshot.
- Never use a production snapshot as a test fixture in source control.

## Launch rehearsal record

The automated local baseline is recorded in `docs/M1-rehearsal-report.md`.
Complete the table below only for an approved remote staging rehearsal.

For each rehearsal, record:

| Field | Value |
|---|---|
| Environment | local or staging |
| App version | |
| Snapshot SHA-256 | |
| Snapshot state schema | |
| Pre-restore backup key | |
| Restored entries/photos | |
| Validator result | |
| Full E2E result | |
| Phone reconnect | |
| TV reconnect | |
| Operator | |
| Timestamp | |

Do not include personal data in this record.
