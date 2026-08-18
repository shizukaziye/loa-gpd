# Combat power — how lostark.bible breaks it down, and the chart's estimator

Sources: lostark.bible character route (SvelteKit `__data.json`, session-authed
via Shizu's own OAuth grant — rosters scope, own characters only), the site's
route module `17.D03QyhWy.js` (parts → category percentages), and six roster
characters' payloads pulled 2026-08-17.

## The data shape

Every ark-passive loadout carries:

- `combatPower: { id, score }` — the game's own score. id 1 = DPS score,
  id 2 = support score. This is DATA (the armory reports it), not computed
  by the site.
- `battlePoint: { isSupport, parts: [...] }` — the breakdown. Each part is a
  basis-point multiplier: the site's own category math is
  `product *= 1 + value/10000` over the parts in a category
  (route module, function `g`).

Two same-character loadouts (raid vs chaos) share gear parts but differ ~57%
in score: the score also carries the skill/tripod/rune setup, which the parts
do NOT cover. Any estimator from gear settings therefore anchors on a real
character's raid score and swaps gear multipliers, holding the skill block
constant.

## Part types seen (numeric -> meaning, with observed curves)

| type | meaning | curve notes (from the six-character fit set) |
|---|---|---|
| 1 | base attack point | absolute, carries mainStat / weaponPower / attackPowerMultiplier / baseAttackPower; Limerent 235,904 = 1.2400 x baseAttackPower |
| 2 | base health point | absolute; support loadouts only carry it meaningfully |
| 3 | level | 476bp at level 70 |
| 4 | weapon quality | 0bp at q91 support; 3000bp on DPS chars (q100?) |
| 5/6/7 | ark passive evo/enl/leap | 16000/7200/1400bp at 100/100/70 points (support); 7500/7000/1400 on DPS |
| 8/9 | karma evolution rank / leap level | 360bp = rank 6 (60/rank); leap 58bp sample |
| 10 | engraving (x5, stone-merged) | per-engraving bp by grade+stone points, grade05 rows 1700-3525 |
| 15/17 | accessory grinding lines / addon | per-line bp (neck stigma high = 480, etc.) |
| 16 | bracelet lines | per-line bp; 245 sample, many 0 rows |
| 19/20 | elixir? / card set | card set 300-906 |
| 22 | skill gem (x11) | per-gem bp: 704 (DPS lv10), 750 (support sample) |
| 26 | battlestat (crit+spec+swift) | 3.0 bp/point DPS, 4.0 bp/point support (exact across 5 chars) |
| 29 | arkgrid core (x6) | per-core bp: f(core grade, points): 300-400 (stars), 600-800, up to 918@18 ancient; NOT points-linear |
| 31 | arkgrid gem effects (x3) | per effect id: support id 2011 exactly 5.0 bp/level; DPS ids vary (3.3-8.3/level) |
| 33/34 | trinity/paradise orb | 130-264bp |

## The site's category grouping (function g in the route module)

- Ark Passive + Karma: types 5,6,7,8,9
- Engravings: 10 (attack/defense variants)
- Accessories: 15 + 17 (attack/defense)
- Bracelet: 16 (+addon variants)
- Gems: 22
- **Ark grid: 29 + 31** (attack; defense variants exist)
- Battle stats: 26; cards: 20; base attack/health/level/quality: 1,2,3,4

## The chart's estimator (design)

CP_est(settings) = anchor.score x PRODUCT over chart systems of
  (1 + bp_setting/1e4) / (1 + bp_anchor/1e4)

with anchor = Limerent's raid loadout (support, score 3205.08) for the support
axis. Systems the chart moves: honing (type 1 via sqrt(WPxMS) ratio + quality),
karma (8), gems (22), battle stats via bracelet (26+16), accessories (15/17),
stone (10 delta), ark grid (29+31 from the tier account's cores/points and
node levels x 5bp). Skill block, elixirs, cards, paradise ride the anchor.

Open fits: type-29 core table (grade x points), type-22 gem bp by level,
type-1 exact 1.24 factor decomposition, accessory line bp table.

Raw fit rows live in the session scratchpad (`limerent-resolved.json`,
compact rows for Paroxysmal/Shizukaziye/White/Teal/Noa).

## Gem curves, corrected (2026-08-19)

The bible compounds PER PART: every gem, core and grid-gem effect is its own
(1 + bp/1e4) factor. Measured endpoints, both confirmed against worn sets:

- Support gems: **125 bp per gem level** — Limerent wears level 6s (750 bp
  rows) showing +121.56%; a full 10s set compounds to +265.8%. The old study
  cache's `classicGemLevels` field is stale or refers to classic gems; do not
  trust it for worn T4 gems.
- DPS gems: **70.4 bp per gem level** — Paroxysmal wears full 10s (704 bp
  rows), +111% for the set. A support lv-6 gem outranks a DPS lv-10 gem in
  CP terms.
- Sub-anchor levels remain linear-through-origin interpolations.
