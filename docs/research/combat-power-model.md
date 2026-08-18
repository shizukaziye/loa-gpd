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

## The chart's estimator (final law, 2026-08-20)

Fit to LIVE in-game profile readings, not to the bible's breakdown — the
bible's parts are that site's own reconstruction (good relative weights, not
the game's internals). Measured on Limerent's raid loadout: **3,781.18 with
6s** and **6,354.88 with 10s**; the crawled 3,205.08 was a weaker skill
preset (gem presets ride skill presets), whose PARTS remain valid because
the skill block is not a part.

  CP(settings) = anchor.raidScore x baseAttackRatio x gemFactor(level)
                 x (1 + (S0 + dSmall)/1e4) / (1 + S0/1e4)

- **The profile header is the loadout score, raw, for every class.** The old
  x1.9964 "support convention" compared two different skill presets. Dead.
- **Gems compound per part.** The set swap moves the score x1.68066 =
  x1.04833 per gem; no sum produces that. This pins the level-10 support gem
  at 1,269.6 bp against 750 at level 6 — the naive "125 bp/level" linearity
  was the error, not the compounding. Levels 7-9 ride the line between the
  two measured points (129.9 bp/level). DPS: 704 bp at 10 (crawled rows),
  70.4 bp/level below until a second point is measured.
- **Small systems stay additive** over the anchor's non-gem sum S0 (support
  52,892 bp; DPS 48,517 bp). Battle stats, cores, grid gems and karma all
  move < 300 bp, where sum-vs-product is a wash.
- **Everything the chart does not price rides the anchor** (engravings, ark
  passive, elixirs, cards, skill block). No invented development constants:
  the earlier devFrac died with the law fix — the floor now lands ~3,370
  support / ~4,930 DPS naturally, below Limerent's own 3,781 as it must be.
- DPS grid feed until the dd-dps sweep publishes: data/cp-grid-dps.json from
  the spot anchors (tools/build-cp-grid-dps.js); the page prefers real rows.

Reproduced measurements: estimate({}) = 3,781.18 exact; estimate({gemLevel:
10}) = 6,355 vs 6,354.88 live; estimateDps({}) = 7,895.29 exact.

Superseded readings, kept for the record: 6,398.63 (bible header, raid+10s
at crawl time) and 6,365.26 (first live 10s reading, wrong loadout state).

## Law post-mortem — three wrong fits before the right one

1. **Additive-sum over all parts** matched a cross-character constant
   (score / (base x (1+sum/1e4)) agreed to 0.4% between Limerent and
   Paroxysmal) but predicted the gem swap at x1.077 vs x1.68 measured. The
   cross-character match validated the bible's sum as a RELATIVE index, not
   the game's law — and it never mattered, because each axis anchors on its
   own character.
2. **Per-part product over all parts** matched the gem swap to 2% but blew
   the cross-character constant by x1.56 and produced the "11,500 is not
   real" support cap.
3. **Stale-header/x2-profile theories** died when the live readings showed
   the profile is just the score.

The discriminating experiment was a same-loadout gem-set swap read off the
profile screen — ten seconds in game, worth more than every fit above.

## Open items

- Validate against other bible loadouts (re-crawl Limerent's 10s state;
  characters wearing 7s/8s/9s pin the gem curve's mid-levels; a genuinely
  fresh character benchmarks the ~3,370 floor claim).
- Type-29 core table (grade x points), accessory line bp table, type-1
  1.24 dressing decomposition remain unmapped (small).
