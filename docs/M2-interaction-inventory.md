# M2 interaction inventory

**Slice:** 2, interaction hierarchy  
**Primitives:** `ActionButton`, `IconButton`, `MenuRow`/`MenuGroup` in `src/App.jsx`

## Semantic roles

Variant is hierarchy, not appearance. The whole system is two fills and one
quiet shape: fills mark the two moments that matter, and every other action
shares the same paper-and-line shape where only the ink changes. No two
stroke weights ever compete in one view.

| Variant | Meaning | Look |
|---|---|---|
| `primary` | the one next thing | sun fill, ink0 text |
| `secondary` | a real alternative command | quiet shape, ink text |
| `tertiary` | quiet out: back, keep, cancel | quiet shape, muted text |
| `destructive` | entry into a flow that loses something | quiet shape, clay text |
| `commit` | the filled confirm step inside that flow | clay fill |

Rules the primitives enforce:

- an async `onClick` gets one pending state (`aria-busy`, dimmed); taps are
  ignored until it settles, so callers do not write duplicate-tap guards
- `disabled` and pending render differently (0.35 vs 0.6 opacity)
- minimum 44px touch target; `compact` (36px) is for dense desktop/TV rows only
- `IconButton` requires a `label`; it becomes `aria-label` and `title`
- focus visibility comes from the global `:focus-visible` rule in `Shell`
- a destructive style never doubles as a routine secondary action

The destructive pattern is clay ink, then reason, then clay fill: a
`destructive` button opens the confirmation, the consequence is stated (and a
reason collected where the server requires one), and the `commit` button
applies it. The escape from that flow is `tertiary`.

## Sheet navigation

Sheets stack. Opening a sheet from inside another pushes it; the header then
shows a back chevron that returns to the parent. The X and the scrim always
close the whole stack. `setModal` opens fresh, `pushModal` nests.

`Btn` remains as a legacy alias (`primary`/`dark`/`ghost`/`danger`/`flame`
map to `primary`/`secondary`/`tertiary`/`destructive`/`commit`), so every
existing call site shares the same behavior. New surfaces use `ActionButton`.

## Migrated surfaces

- Show Control sheet: advance is the full-width primary, skip is secondary,
  cancel is tertiary (a scene ending loses nothing; retry exists), Audio
  Director is secondary and opens nested with back
- commissioner menu: an intent-grouped `MenuRow` list, not a button rack.
  Groups are The show, The weekend, Fix something, and Setup and records;
  rows share one quiet shape, the note carries the live fact (active scene
  and step, which event is on deck), only destructive rows change ink, and
  Fix something renders only when a fix applies. Audio Director opens from
  inside Show Control instead of sitting beside it.
- result flows: post and edit are primary, clear/scrap/replace use the
  outline-reason-fill pattern
- profile save and PIN unlock: primary with real pending; the profile sheet
  now closes only after the server accepts the save
- sheet close and header TV/commissioner controls: `IconButton`

## Intentional one-off controls

Selection and spatial controls are not commands and keep their own grammar:

- bracket cells and stage/pool cells
- `PlayerChip`, chip color/skin racks, rating inputs
- the betting denomination rack and board pick targets
- 44px square number pickers (heats, through, event worth)
- tab bar and result slot tabs
- poker count steppers
- the GM next-action pill (floating, display type, bespoke by design)
- Show Control scene start tiles (two-line command tiles)
- text-link toggles ("Pick player by player instead")

## Remaining migration inventory

In the plan's order, not yet migrated:

1. onboarding saves and step navigation
2. wager and duel command actions (place, retract, accept, decline, void)
3. Audio Director sheet internals (search, device, transport rows)
4. `PhotoCropper.jsx` (5 raw buttons)
5. QA bar controls
6. remaining raw icon/menu buttons in sheets (travel board, logistics)

These continue to work through the `Btn` alias or as raw buttons; migrate
them opportunistically when a surface is next touched.
