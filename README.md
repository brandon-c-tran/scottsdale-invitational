# The Scottsdale Invitational

Live tournament app for the bachelor party weekend. React PWA on Cloudflare
Workers with a Durable Object as the single source of truth. Real-time over
WebSockets: draws reveal on every phone, wagers settle the moment results post,
TV mode runs on the living room screen.

## Setup

```bash
npm ci
npm run dev          # local dev at http://localhost:5173, DO runs in workerd
```

Open two browser windows to see live sync. The local app carries a visible
`LOCAL` badge. GM passcode: 1016.

## Validate

```bash
npm run check
npm test
npm run build
npm run build:staging
npm run test:e2e
```

The end-to-end test refuses the production domain and defaults to the isolated
local Worker.

## Environments and deploy safety

- `npm run dev` uses the named local Durable Object binding.
- `npm run deploy:staging` targets
  `scottsdale-invitational-staging` and creates remote resources; get approval
  before running it.
- `npm run deploy:production` targets the existing production Worker and custom
  domain; get approval and a validated production snapshot first.
- `npm run deploy` deliberately refuses to guess a target.

Production deployment is manual in GitHub Actions. Do not deploy, create
staging resources, read production data, or run a production snapshot without
explicit authorization.

See [the M1 implementation plan](docs/M1-implementation-plan.md) and
[production data runbook](docs/production-data-runbook.md) before any remote
operation.

## How sync works

Phones never write state. They send actions over a WebSocket to one Durable
Object, which validates each action against current state, applies it, persists,
and broadcasts the new state to every connected phone. Single writer, strict
ordering, no races. Disconnected phones show a Reconnecting pill and catch up
with the full state the moment they're back.

See CLAUDE.md for architecture, invariants, and the backlog.
