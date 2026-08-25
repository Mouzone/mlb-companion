# MLB Companion — Design System

The implementation contract. Every color, size, space, radius, shadow, and duration used in
`src/` must resolve to a token defined here. New value needed → add it here first, then use it.
No orphan hex. No magic pixels.

**Surface**: mobile-first PWA, 390×844 primary target, single-column, fixed chrome + scrolling body.
**Domain**: dense live-baseball telemetry. Numbers are the product; chrome must recede.

---

## 1. Principles

1. **White canvas, ink hierarchy.** The page is white. Structure comes from type weight, spacing,
   and 1px borders — not from filled color blocks. Color is reserved for *meaning* (live, positive,
   negative, pitch identity), never for decoration.
2. **Numbers outrank labels.** A stat value must be visibly larger and heavier than its label.
   The old system had a 2px gap between label and value and therefore no hierarchy at all.
3. **One vertical rhythm.** Everything sits on a 4px grid. No 6px, no 18px, no eyeballed gaps.
4. **Columns align or they are not columns.** All numeric output uses `tabular-nums` so digits
   share a fixed advance width and value columns terminate on a single edge.
5. **Content flows, chrome is fixed.** Panels scroll; they are never height-clipped. Dead space is
   a bug — fill it with real data before adding padding.
6. **Density is the feature.** This is a companion app used while watching a game. Prefer more
   information legibly packed over fewer items floating in whitespace.
7. **Motion is feedback only.** Transitions confirm a state change (tab switch, press, load).
   Nothing animates decoratively. `transform`/`opacity`/`filter` only.

---

## 2. Color

All tokens live in `src/index.css` under `:root`. Canvas renderers import the same values from
`src/utils/chartTheme.ts` so charts and DOM never drift.

### 2.1 Neutrals — the ink ramp

| Token | Value | Use |
|---|---|---|
| `--c-bg` | `#ffffff` | Page canvas, card surface |
| `--c-surface-sunken` | `#f6f8fa` | Mini-nav bar, table zebra, recessed wells, canvas backgrounds |
| `--c-surface-hover` | `#eef2f6` | Hover / pressed fill on interactive rows |
| `--c-border` | `#e3e8ee` | Default 1px hairline: cards, dividers, table rules |
| `--c-border-strong` | `#cdd5df` | Emphasized edges, input borders, segmented-control track |
| `--c-ink` | `#0a2540` | Primary text, stat values, player names |
| `--c-ink-secondary` | `#425466` | Body copy, secondary values |
| `--c-ink-muted` | `#697386` | Stat labels, metadata, inactive tabs |
| `--c-ink-subtle` | `#8792a2` | Micro-captions, placeholder, disabled |

### 2.2 Brand — MLB navy ramp

Interactive and identity color. Derived from MLB navy `#041E42`.

| Token | Value | Use |
|---|---|---|
| `--c-brand-900` | `#041e42` | App header bar, strongest emphasis |
| `--c-brand-700` | `#0b3d7b` | Active tab label, link text |
| `--c-brand-600` | `#1258a8` | Active underline, selected segment, focus ring source |
| `--c-brand-500` | `#2075d4` | Hover state of brand elements, data-viz primary |
| `--c-brand-100` | `#e4eefb` | Selected-row tint, active chip background |
| `--c-brand-050` | `#f2f7fe` | Subtlest selected wash |

### 2.3 Semantic signals

| Token | Value | Use |
|---|---|---|
| `--c-live` | `#c8102e` | LIVE badge, in-progress indicator |
| `--c-live-bg` | `#fdecef` | LIVE badge fill |
| `--c-positive` | `#0f7b4f` | Above-average stat, favorable split |
| `--c-positive-bg` | `#e7f5ee` | Positive chip fill |
| `--c-negative` | `#c8102e` | Below-average stat, unfavorable split |
| `--c-negative-bg` | `#fdecef` | Negative chip fill |
| `--c-warn` | `#b25e09` | Caution / borderline |
| `--c-neutral-badge` | `#697386` | FINAL / completed status |
| `--c-neutral-badge-bg` | `#f0f3f6` | FINAL badge fill |

> **Rule:** a stat is colored *only* when it is being compared against a benchmark. A plain `.000`
> is `--c-ink`, never red. Red means "worse than league average", not "small number".

Percentile-ranked player stats are the explicit exception to the semantic red/green convention:
they use the ordered heat ramp below, with blue = lower-performing and red = higher-performing.
Every heat-coded stat must also print its `P00–P100` rank and expose the cohort in an accessible
label, so color is never the only signal. Semantic alerts and unranked comparisons keep the
positive/negative colors above.

### 2.4 Data visualization

Heat ramp — must read on white, and must remain distinguishable in grayscale.

| Token | Value | Meaning |
|---|---|---|
| `--c-heat-5` | `#c8102e` | Hottest |
| `--c-heat-4` | `#e8590c` | Hot |
| `--c-heat-3` | `#f4b942` | Warm |
| `--c-heat-2` | `#7fa8d4` | Cool |
| `--c-heat-1` | `#1864ab` | Coldest |
| `--c-heat-empty` | `#f1f4f7` | No data in cell |
| `--c-chart-grid` | `#e3e8ee` | Zone grid lines, field lines |
| `--c-chart-axis` | `#cdd5df` | Outer zone border, axes |
| `--c-chart-bg` | `#ffffff` | Canvas background |
| `--c-chart-label` | `#697386` | Canvas text |

**Pitch-type identity palette** — 13 fixed hues, each ≥3:1 against white, each distinguishable
from its neighbors. Replaces the neon set in `src/utils/pitchConstants.ts`.

| Code | Token | Value | Pitch |
|---|---|---|---|
| FF | `--c-pitch-ff` | `#d1342f` | Four-seam |
| SI | `--c-pitch-si` | `#e2662a` | Sinker |
| FC | `--c-pitch-fc` | `#b8452f` | Cutter |
| SL | `--c-pitch-sl` | `#1b6fb5` | Slider |
| ST | `--c-pitch-st` | `#2b93c9` | Sweeper |
| CU | `--c-pitch-cu` | `#5b3fa8` | Curveball |
| KC | `--c-pitch-kc` | `#7a4fc0` | Knuckle-curve |
| SV | `--c-pitch-sv` | `#3f5fc0` | Slurve |
| CH | `--c-pitch-ch` | `#1a8a5e` | Changeup |
| FS | `--c-pitch-fs` | `#3a9e6f` | Splitter |
| FO | `--c-pitch-fo` | `#57a86b` | Forkball |
| KN | `--c-pitch-kn` | `#8a7a2f` | Knuckleball |
| EP | `--c-pitch-ep` | `#9b6a1f` | Eephus |
| — | `--c-pitch-unknown` | `#8792a2` | Unclassified |

**Pitch-call palette** (ZonePlot markers, At Bat sequence dots):
`--c-call-ball #1b6fb5` · `--c-call-strike #c8102e` · `--c-call-foul #b25e09` · `--c-call-inplay #0f7b4f`

The At Bat sequence list paints five tones from these four hues, because a
called strike and a swing-and-miss say opposite things about the hitter and
must not share one marker. Hue is never the only channel — each tone also
carries a shape, and a labelled key (`.atbat__legend`) sits under the grid:

| Tone | Call codes | Marker |
| --- | --- | --- |
| Ball | `B` `*B` `V` `H` | solid disc, `--c-call-ball` |
| Called | `C` | hollow ring, `--c-call-strike` |
| Swinging | `S` `W` `T` `M` | solid disc, `--c-call-strike` |
| Foul | `F` `L` | rounded square, `--c-call-foul` |
| In play | `X` `D` `E` | diamond, `--c-call-inplay` |

---

## 3. Typography

Families (unchanged stacks, new roles):

```
--font-ui:  -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif
--font-num: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace
```

**Every numeric element gets `font-variant-numeric: tabular-nums`.** This is the single largest
alignment fix in the system — it is what makes stat columns terminate on one edge.

### 3.1 Scale

The old scale (`9/10/11/12/13/17`) collapsed label and value into the same optical weight.
The new scale enforces a minimum 4px step between a label and the value it describes.

| Token | Value | Role |
|---|---|---|
| `--fs-micro` | `10px` | Uppercase micro-caption, canvas corner labels. Floor. |
| `--fs-label` | `11px` | Stat labels, table headers, badge text |
| `--fs-body` | `13px` | Body copy, table cells, tab labels |
| `--fs-data` | `15px` | Stat values — the default readout size |
| `--fs-title` | `15px` | Section titles |
| `--fs-lg` | `18px` | Player names, card titles |
| `--fs-hero` | `22px` | Score, headline metric |
| `--fs-display` | `28px` | Primary game score |

### 3.2 Weight, leading, tracking

| Token | Value |
|---|---|
| `--fw-regular` | `400` |
| `--fw-medium` | `500` |
| `--fw-semibold` | `600` |
| `--fw-bold` | `700` |
| `--lh-tight` | `1.15` — display numerals, scores |
| `--lh-snug` | `1.3` — labels, single-line values |
| `--lh-normal` | `1.45` — body copy, multi-line |
| `--tracking-caps` | `0.06em` — uppercase labels only, never below 11px |
| `--tracking-tight` | `-0.01em` — `--fs-hero` and up |

### 3.3 Composition rules

- Uppercase + letterspacing is permitted **only** at `--fs-label` (11px) and above. The old
  9px tracked-uppercase labels are banned — tracking at that size destroys legibility.
- A section title (`--fs-title`, 600) and its right-hand metadata (`--fs-label`, 500,
  `--c-ink-muted`) must differ in **both** size and color so metadata never competes.
- Player identity is `--fs-lg` / 600 minimum. It is never the same size as a stat value.

---

## 4. Space, shape, elevation, motion

### 4.1 Spacing — strict 4px grid

The old scale contained `6px` and a raw `18px`, both off-grid. Replaced:

| Token | Value |
|---|---|
| `--sp-1` | `2px` (hairline nudge only) |
| `--sp-2` | `4px` |
| `--sp-3` | `8px` |
| `--sp-4` | `12px` |
| `--sp-5` | `16px` |
| `--sp-6` | `20px` |
| `--sp-7` | `24px` |
| `--sp-8` | `32px` |

Standard applications: card padding `--sp-4`; gap between cards `--sp-3`; gap between a label
and its value `--sp-1`; gap between grid columns `--sp-4`; screen gutter `--sp-4`.

### 4.2 Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `6px` | Chips, badges, small controls |
| `--radius` | `10px` | Cards, panels |
| `--radius-lg` | `14px` | Hero cards, game cards |
| `--radius-pill` | `999px` | Status pills, segmented control thumb |

### 4.3 Elevation

Borders first, shadows second. A card is defined by `1px solid var(--c-border)`; shadow is
additive for genuinely floating layers only.

| Token | Value |
|---|---|
| `--shadow-xs` | `0 1px 2px rgba(16,24,40,.04)` |
| `--shadow-sm` | `0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)` |
| `--shadow-md` | `0 2px 6px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.05)` |
| `--shadow-focus` | `0 0 0 3px rgba(32,117,212,.28)` |

### 4.4 Motion

| Token | Value |
|---|---|
| `--dur-fast` | `120ms` — press feedback, hover |
| `--dur-base` | `180ms` — tab/panel transitions |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` |

Animate `transform`, `opacity`, `filter` only. All motion is nulled under the existing
`@media (prefers-reduced-motion: reduce)` block.

---

## 5. Primitives

These are the reusable building blocks. Every product screen composes from this list; a screen
that needs something not here must add it here first.

### 5.1 `Stat` — label + value pair
The atom of the entire app.
- Anatomy: label (`--fs-label`, 500, `--c-ink-muted`, uppercase, `--tracking-caps`) above value
  (`--fs-data`, 600, `--c-ink`, `--font-num`, `tabular-nums`).
- States: `default` · `positive` (value `--c-positive`) · `negative` (value `--c-negative`) ·
  `percentile-1…5` (`--c-heat-1…5` surface accent plus a visible `P00–P100` rank) · `empty`
  (value renders `—` in `--c-ink-subtle`) · `loading` (skeleton bar at value height).
- Percentile bands: P00–19 = heat 1, P20–39 = heat 2, P40–59 = heat 3, P60–79 = heat 4,
  P80–100 = heat 5. The rank is always oriented so a larger percentile means a better outcome,
  including metrics where lower raw values are favorable.
- Benchmark metadata names both population and sample size, for example “P87 among 164 active
  MLB starting pitchers (season).” Starter/bullpen identity follows current-season usage and is
  batter cohorts contain active MLB hitters only.
- Rule: label and value share a left edge. In a grid, all values share a baseline.

### 5.2 `StatGrid` — responsive stat matrix
- `grid-template-columns: repeat(auto-fit, minmax(min(72px,100%), 1fr))`, `gap: var(--sp-4) var(--sp-4)`.
- The `minmax(min(…),100%)` form is mandatory: it prevents the grid from overflowing its
  container at narrow widths.
- Variants: `--cols-2`, `--cols-3`, `--cols-4` pin the count when a fixed rhythm is required.

### 5.3 `Card` — bordered content container
- `background: var(--c-bg)`, `border: 1px solid var(--c-border)`, `border-radius: var(--radius)`,
  `padding: var(--sp-4)`.
- Optional header row: title (`--fs-title`, 600) left, metadata (`--fs-label`, `--c-ink-muted`) right,
  both on a shared baseline, separated from body by `--sp-3`.
- States: `default` · `interactive` (hover `--c-surface-hover`, active `scale(.995)`) · `loading` · `empty`.
- **No fixed height.** A card is exactly as tall as its content.

### 5.4 `Badge` — status pill
- `--radius-pill`, `padding: 2px var(--sp-3)`, `--fs-label`, 600, uppercase, `--tracking-caps`.
- Variants: `live` (`--c-live` on `--c-live-bg`) · `final` (`--c-neutral-badge` on `--c-neutral-badge-bg`) ·
  `preview` (`--c-brand-700` on `--c-brand-100`) · `positive` · `negative`.

### 5.5 `MiniNav` — section navigation
- Fixed `--mini-nav-h` (44px). Equal-width flex children (`flex: 1 1 0`) so labels are optically centered.
- Active: label `--c-brand-700` 600, 2px bottom rule in `--c-brand-600` spanning the **full** button
  width (no asymmetric inset).
- Inactive: `--c-ink-muted` 500. Hover `--c-ink-secondary`. Focus: `--shadow-focus`.
- Buttons are scroll anchors, not tab mounts — every section stays mounted; clicking a button
  calls `scrollIntoView({ behavior: 'smooth', block: 'start' })` on the matching `<section>` ref.

### 5.6 `FloatingGamesButton` — back navigation
- Fixed bottom-left pill button (chevron-left + "Games"), calls `gameStore.reset()`.
- `position: fixed`, `z-index: 20`, 48px height, `--c-brand-900` background, uppercase label.
- Balanced by `StatsGuide` FAB at bottom-right.

### 5.7 `SubTabNav` — secondary navigation (legacy)
- Same equal-fraction rule as `MiniNav`, `--mini-nav-h`, `--c-surface-sunken` background,
  `1px solid var(--c-border)` bottom. No longer rendered by any section after the single-scroll
  redesign; kept for potential re-use.

### 5.8 `Segmented` — scope switcher (This Game/Season, All/RHB/LHB)
- Track: `--c-surface-sunken`, `1px solid var(--c-border-strong)`, `--radius-pill`, height 32px
  (touch-safe; the old 22px was below target).
- Thumb: `--c-bg`, `--shadow-xs`, `--radius-pill`.
- Label `--fs-label` 600; selected `--c-ink`, unselected `--c-ink-muted`.

### 5.8b Matchup face-card scope arrows
- The Matchup tab does **not** use `Segmented` for This Game / Season. The face card
  (`.matchup-head`) carries its own scope row (`.matchup-head__scope`): a `‹` button, the
  current scope label, and a `›` button, spread with `justify-content: space-between`.
- Buttons are 32×32 (touch-safe), `--c-surface-sunken` on `1px solid var(--c-border)`,
  `--radius-sm`; hover swaps to `--c-surface-hover` and `--c-ink`.
- Label is `--fs-label` 600, `--c-ink-secondary`, uppercase with `--tracking-caps`.
- The control lives *inside* the card because it rewrites the two statlines directly
  beneath it; a detached control would read as page-level chrome.

### 5.8c `.arsenal-cc` — arsenal table
- Six-column CSS grid, `1fr auto auto auto auto auto`: Pitch · Use · Velo · Spin · V-Brk · H-Brk.
  The name column takes the remaining width so every numeric column stays flush right.
- Head row is `--fs-micro` 500 uppercase `--c-muted` over `1px solid var(--c-rule)`; body rows
  are separated by `--c-rule-soft` with the last row's border removed.
- Values are `--fs-data` 600 with `font-variant-numeric: tabular-nums` so digits never reflow
  between polls. A velocity delta renders beneath its value at `--fs-micro`, 0.72 opacity.
- Only velocity is toned: `.arsenal-cc__metric--positive` / `--negative` recolour the value with
  `--c-positive` / `--c-negative`. Spin and break carry no baseline to compare against, so they
  stay in plain ink rather than implying a verdict.
- Season scope leaves Spin, V-Brk and H-Brk empty — the MLB arsenal endpoint publishes only
  usage and average speed, and an absent metric renders as an em dash rather than a zero.

### 5.8 `TeamLogo`
- `<img>` from `teamLogoUrl(teamId, variant)`. White-first ⇒ always the `-on-light` variants.
- Sizes: `sm` 24px (dense rows) · `md` 32px · `lg` 44px (card headers).
- `loading="lazy"`, `decoding="async"`, explicit `width`/`height` to reserve layout.
- Fallback: invalid teamId returns HTTP 404, so `onError` **does** fire → swap to a
  `--c-surface-sunken` circle containing the team abbreviation in `--fs-label` 700.

### 5.9 `PlayerAvatar`
- `<img>` from `playerHeadshotUrl(personId, px)`, circular, `1px solid var(--c-border)`,
  `background: var(--c-surface-sunken)`.
- Sizes: `sm` 32px · `md` 40px · `lg` 64px · `xl` 96px.
- **A missing player returns the MLB generic silhouette with HTTP 200 — `onError` will not fire.**
  The silhouette is the accepted fallback; do not build an `onError` path for player images.

### 5.10 `SectionTitle`
- Title `--fs-title` 600 `--c-ink` left; optional meta `--fs-label` 500 `--c-ink-muted` right.
- Shared baseline, `--sp-3` bottom margin, consistent left edge with the content beneath it —
  this fixes the "three competing left edges" defect.

### 5.11 `DataTable`
- `--fs-body` cells, `--fs-label` uppercase headers in `--c-ink-muted`.
- First column left-aligned; **all** numeric columns right-aligned with `tabular-nums` and a
  uniform `--sp-4` right padding (fixes numerics hugging the edge at 3-5px).
- Row rule `1px solid var(--c-border)` spanning the full content width — no ragged terminations.
- Optional zebra `--c-surface-sunken` on even rows.

### 5.12 `EmptyPanel` / `Skeleton`
- Empty: centered `--fs-body` `--c-ink-subtle` message, min-height `--sp-8 * 2`.
- Skeleton: `--c-surface-sunken` block at the exact height of the content it replaces, subtle
  opacity pulse (nulled under reduced motion). Prevents layout shift on load.

### 5.13 `Icon`
Hand-authored inline SVG only (zero icon dependencies permitted). `currentColor` fill,
`stroke-width: 1.5`, 20×20 default box, `aria-hidden="true"` when decorative.
Required set: `chevron-left`, `chevron-right`, `chevron-down`, `dot-live`, `diamond` (base state).

### 5.14 `ScoreRing` — watchability score

`src/components/ui/ScoreRing.tsx`. Props `{ score: number | null, size?: 'sm' | 'md' | 'lg', live?: boolean }`.

- **Built from `<span>` and `<svg>` only, never `<div>`.** `GameCard`'s root is a `<button>`,
  which accepts only phrasing content — a block-level child would be invalid HTML.
- Anatomy: an SVG ring (`strokeDasharray`/`strokeDashoffset` drawing the arc) with the numeral
  grid-stacked on top as text. `null` or a non-finite score renders `0` with an empty arc instead
  of a dash — the ring fills from 0 when the score arrives, making the loading state feel like
  the ring is "filling up" rather than showing missing data.
- Numeral animation: on first render the value snaps to the target (so cached scores appear
  instantly when returning to the slate). On subsequent score changes the numeral counts up/down
  via `requestAnimationFrame` with an ease-out cubic curve over ~600ms, in sync with the CSS
  `stroke-dashoffset` and `color` transitions on the arc. `prefers-reduced-motion` snaps to the
  final value with no animation.
- `GEOMETRY` per size: `sm` 32px, radius 13, stroke 2.5 · `md` 40px, radius 17, stroke 3 ·
  `lg` 96px, radius 42, stroke 6. The `lg` size is not arbitrary — 96px is two 44px `TeamLogo lg`
  rows plus one `--sp-3` (8px) gap, so the ring matches the height of the card's two-team block
  exactly.
- Tier colors deviate deliberately from the raw heat ramp to hold a 3:1 contrast floor on white:
  `elite` → `--c-heat-5`, `great` → `--c-heat-4`, `good` → `--c-warn`, `average` → `--c-heat-1`,
  `skip` → `--c-ink-muted`. `--c-heat-3` (`#f4b942`, ~1.9:1) was rejected for the `good` tier and
  replaced with `--c-warn` (`#b25e09`, 4.7:1). The numeral itself always stays `--c-ink` (13.5:1);
  only the ring stroke carries tier color. This is consistent with §2.3 — the score is a benchmark
  comparison (a game rated against the field), not a decorative value, so coloring it is earned.
- Accessibility: `role="img"` with `aria-label="Watchability {n} out of 100, {tierLabel}"`, where
  `tierLabel` is `must watch` / `great` / `good` / `average` / `skippable`.

### 5.15 `StatsGuide` — searchable stat reference

`src/components/StatsGuide/StatsGuide.tsx`. A single global reference surface keeps dense stat
cards free of repeated help icons while making every displayed abbreviation discoverable.

- Trigger: fixed 48px circular button at the lower-right safe area, `--c-brand-900` surface,
  white information mark, `--shadow-md`. It remains available on the game slate and game views.
- Open state: fixed scrim plus a right-edge drawer, capped at 400px and 88vw. The drawer owns its
  internal scroll; it does not change the app shell's one-scroll-owner contract.
- Anatomy: title and close control, search input, result count, then an alphabetized definition
  list. Each entry prints abbreviation, full name, optional formula, and a short use description.
- Interaction: opening focuses search; Escape, close, or scrim dismisses; dismissal restores focus
  to the trigger. Background document scrolling is locked while open.
- Motion: scrim opacity and drawer transform use `--dur-base` / `--ease-out`; both become immediate
  under reduced motion. All controls retain 44px targets and `--shadow-focus`.

---

## 6. Layout & responsive

### 6.1 Shell

```
.app            height:100dvh; display:flex; flex-direction:column; overflow:hidden;
                padding: env(safe-area-inset-*)
  .game-screen  flex:1 1 auto; min-height:0; overflow:hidden; display:flex; flex-direction:column
    .ui-mini-nav  flex:0 0 var(--mini-nav-h)                    ← fixed chrome (sticky nav)
    .game-page    flex:1 1 auto; min-height:0; overflow-y:auto  ← THE scroll owner
      .game-section    flex:0 0 auto; scroll-margin-top: var(--mini-nav-h)
        .game-subsection flex:0 0 auto
```

**Exactly one scroll owner per screen: `.game-page`.** `min-height: 0` on every flex ancestor of a
scroll container is a hard requirement — without it the container refuses to shrink and content
is clipped instead of scrolled. `.game-page` mounts exactly one `.game-section` at a time, chosen
by `gameStore.activeTab`; the MiniNav switches tabs rather than scrolling between anchors.

### 6.2 Height tokens

| Token | Value |
|---|---|
| `--mini-nav-h` | `44px` |

The mini-nav bar is the only height the shell names. The scroll owner below it is **not** a token: it
claims whatever is left via `flex: 1 1 auto; min-height: 0; overflow-y: auto`. An earlier draft of
this spec defined a `--content-h` calc for it; that token was removed once every consumer was
converted to flex, because a computed height re-introduces the clipping this section forbids.

### 6.3 The dead-space doctrine

The previous system hard-coded panel and sub-panel heights (`.h-190`, `.h-160`, `.h-120`, `.h-44`,
`.h-22`, `--pvb-content-h`). Content shorter than its budget left visible dead space; content
longer was silently clipped. **All fixed vertical budgets are removed.** Rules:

1. Panels scroll; they do not clip.
2. A container may declare `min-height`, never `height`, unless it is fixed chrome.
3. Canvas elements keep an intrinsic pixel size but sit in `width:100%` slots and are centered.
4. If a panel still looks empty after these rules, the fix is **more data**, not more padding.

### 6.4 Breakpoints

The app previously had **zero** width breakpoints. Three are introduced:

| Name | Query | Behavior |
|---|---|---|
| base | — | Single column. Screen gutter `--sp-4`. |
| `--bp-sm` | `min-width: 480px` | Stat grids gain a column; game cards remain one-up until two 320px tracks fit. |
| `--bp-md` | `min-width: 768px` | Content max-width `720px`, centered. Game grid two-up with larger cards. Charts scale up. |
| `--bp-lg` | `min-width: 1024px` | Content max-width `960px`. Game grid remains two-up. Side-by-side pitcher/batter cards replace the swipe carousel. |
| slate wide | `min-width: 1200px` | GameSelect alone opens to `1104px` for three 360px cards; live-game screens keep the 960px budget. |

### 6.5 GameSelect (scroll + density)

`.game-select` is a scroll owner. Cards are no longer a fixed 55px row.

- Card: `--radius-lg`, `--sp-4` padding, `1px solid var(--c-border)`, `--shadow-xs`, capped
  `width: 100%; max-width: 360px; justify-self: center` (see below for why the cap lives on the
  card, not the grid track).
- A new `.gc-head` flex row sits above the footer, pairing the `.gc-teams` block with a
  `ScoreRing size="lg"` at the right — the watchability score for that game (`null` renders `—`
  rather than dropping the ring, so every card keeps the same head layout).
- `.gc-teams` stacks two independent `.gc-team` grids. Each row uses
  `44px minmax(0, 1fr) auto` for logo / full team identity / run score. The identity track absorbs
  available width, so the run score aligns at the edge of the team zone with a consistent token
  gap before the 96px rating instead of relying on an empty spacer column.
- Status strip: badge, start time or inning, and venue. A divider on the venue separates location
  from game-state telemetry on narrow cards.
- Probable-pitcher strip: two `PlayerAvatar sm` + name + role cells. Pitcher names longer than 15 characters shorten to
  first-initial + full surname (box-score convention), keeping all trailing tokens so suffixes
  survive; `PlayerAvatar` still gets the full name for its accessible label.
- A compact slate header pairs title/date with a `Segmented` control (Time / Watchability), sorting cards within each
  status group (Live / Upcoming / Final) rather than across them, so the grouping survives a sort
  change. Cards with no score sort last, not as zero.
- Grid: `repeat(auto-fill, minmax(min(320px,100%), 1fr))`, `gap: var(--sp-4)`. The card's own
  `max-width: 360px` is what actually bounds card width — `auto-fill` sizes tracks to the
  `minmax` **max**, not the min, so without the cap on the card itself, wide viewports would
  stretch cards past a comfortable reading width.

---

## 7. Accessibility constraints

- **Contrast:** body and label text ≥ 4.5:1 against its background; large text and non-text
  indicators ≥ 3:1. `--c-ink-subtle` (`#8792a2`, 3.6:1 on white) is permitted **only** at
  `--fs-body` and larger, never for `--fs-label` or `--fs-micro`.
- **Touch targets:** every interactive element ≥ 44×44 CSS px of hit area, padding included.
  This is why `--mini-nav-h` is 44 and the segmented control is 32px + vertical padding.
- **Focus:** every focusable element shows `--shadow-focus`. Focus is never removed without a
  same-or-better replacement.
- **Color is never the sole channel.** Positive/negative stats carry a sign, arrow, or explicit
  label in addition to hue. Pitch types always print their code next to the color swatch.
- **Canvas is not accessible.** Every chart is preceded by a visually-hidden text summary and
  its container carries `role="img"` with a descriptive `aria-label`.
- **Reduced motion:** all transitions and the skeleton pulse are disabled in the existing
  `prefers-reduced-motion` block.
- **Semantics:** tabs use `role="tab"` / `aria-selected` inside `role="tablist"`; panels use
  `role="tabpanel"`. Images that convey information carry real `alt`; decorative ones are
  `alt=""` + `aria-hidden`.

---

## 8. Accepted debt

Recorded deliberately, with reasons. Each is a known gap, not an oversight.

1. **React dev tooling not installed.** `react-grab`, `react-scan`, and `react-doctor` are
   nominally required for React projects. Skipped: this is a small personal PWA under a hard
   zero-new-dependencies constraint, and the tools inject DOM and console output that would
   interfere with the console-error diagnosis this work also covers. Revisit if render
   performance becomes a complaint.
2. **No automated test framework.** The project has none and may not add one. Verification is
   `tsc -b`, `oxlint`, `vite build`, plus scripted Playwright DOM assertions run before and
   after each change. Regression risk is carried knowingly.
3. **`user-scalable=no` in the viewport meta.** Blocks pinch-zoom, which fails WCAG 1.4.4.
   Retained for now because the fixed-shell PWA layout depends on it; flagged for removal once
   the shell is verified stable at 200% text zoom.
4. **Canvas charts have no interactive affordances.** No tooltips, no keyboard access. The
   `role="img"` + summary pattern is a floor, not parity.
5. **Team and player imagery is hotlinked from MLB CDNs.** No self-hosting. A Workbox
   `CacheFirst` runtime rule (`mlb-images`, 200 entries, 7d) now backs `*.mlbstatic.com`, so
   logos and headshots survive offline instead of falling back to placeholders. Acceptable:
   all three hosts send `Access-Control-Allow-Origin: *` and impose no hotlink protection.
6. **Pitch-color palette is tuned for white only.** There is no dark theme, and adding one
   would require a second verified palette. Out of scope.

---

## 9. Change protocol

1. Need a value that is not here? Add the token to this file, then to `src/index.css`, then use it.
2. Changing a token's value is a global visual change — re-run visual QA at 390 / 768 / 1280
   afterward, on every screen.
3. Theme color is mirrored in three places and they must move together:
   `src/index.css` tokens · `index.html` `<meta name="theme-color">` ·
   `vite.config.ts` PWA manifest `theme_color` / `background_color`.
4. Canvas renderers must import from `src/utils/chartTheme.ts`. A hex literal inside a
   `Canvas/*.tsx` file is a defect.
