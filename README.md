# The Scottsdale Invitational

Live tournament app for the bachelor party weekend. React PWA on Cloudflare
Workers with a Durable Object as the single source of truth. Real-time over
WebSockets: draws reveal on every phone, wagers settle the moment results post,
TV mode runs on the living room screen.

## Setup

```bash
npm install
npm run dev          # local dev at http://localhost:5173, DO runs in workerd
```

Open two browser windows to see live sync. GM passcode: 1016.

## Deploy

```bash
npx wrangler login   # once
npm run deploy       # builds and ships to <name>.workers.dev
```

Share the workers.dev URL with the group chat. Custom domain optional via the
Cloudflare dashboard (Workers > Settings > Domains).

## How sync works

Phones never write state. They send actions over a WebSocket to one Durable
Object, which validates each action against current state, applies it, persists,
and broadcasts the new state to every connected phone. Single writer, strict
ordering, no races. Disconnected phones show a Reconnecting pill and catch up
with the full state the moment they're back.

See CLAUDE.md for architecture, invariants, and the backlog.
