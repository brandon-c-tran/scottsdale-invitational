# Field Day M1 rehearsal report

This record separates repeatable code validation from launch operations that
require production data or an explicit staging reset approval.

## Automated local rehearsal

**Application version:** `m1-rehearsal-console-4`

**Environment:** isolated local workerd Durable Object

**State schema:** `v:7`

**Production accessed or mutated:** no

The seeded action rehearsal:

- completes all 17 scored events in shipped order
- exercises strict draws, overflow roles, 4/6-team brackets, heats, and pools
- moves every event through guarded betting, play, result entry, and completion
- sets up poker from the resulting standings
- verifies exact 12/13/14-seat distributions and minimum-stack frequency
- verifies 25-chip denominations, uncapped 1:1 stacks, and deterministic ties
- proves table setup/start/count/result/cancel retries do not duplicate state
- blocks tournament mutations after the table is dealt
- clears the poker result, cancels the table, and returns to the exact prior
  standings without removing an unrelated historical ruling

The WebSocket E2E additionally verifies duplicate wager delivery, correction
recalculation, two-client settlement, finale recovery, phone reconnect, and an
unclaimed TV reconnect at the same authoritative state/version. It also proves
that a confirmed game-progress reset creates an internal pre-reset backup,
clears gameplay, and preserves people plus event configuration.

## Launch operations still requiring approval

Do not mark the milestone launch-ready until the runbook record is completed
for:

1. a real production snapshot export and offline validation
2. secure storage of that snapshot outside the repository
3. an approved production-derived restore into staging
4. an approved destructive full-weekend staging rehearsal
5. final attendance and event-participation approval
6. an offline GM copy of the runbook

Use the rehearsal table in `docs/production-data-runbook.md` for the approved
remote run. Do not include personal data in that record.
