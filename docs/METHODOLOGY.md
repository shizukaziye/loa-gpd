# Lost Ark GPD chart — methodology

What every progression system costs, and what it buys, on one scale: **gold per
1% damage**. First build covers **supports**.

## The damage axis

Damage stacks multiplicatively, so scores are logs and add up (the house model,
shared with the accessory and astrogem calculators):

```
D = 100 * ln(multiplier)        ~= percent damage, exactly additive
```

A support does not deal the damage; it hands damage to the party. So a support
step is scored by what it adds to a damage dealer, above a support wearing
nothing — the accessory calculator's model, ported in `model/support.js`:

```
Q = 100 * ln( ap * brand * identity )
```

| Channel | What it is | Reached by |
|---|---|---|
| `ap` | the ally attack-power buff: the support gives away `0.22 * (1 + allyAtkEnh)` of its own base attack power | **honing, karma**, earring weapon power, ring ally-atk lines |
| `brand` | 10% damage scaled by brand power | neck stigma lines, ark grid, karma ranks |
| `identity` | Serenade + Major Chord + T-skill, one shared bracket, diluted by the dealer's own additional damage | ring ally-damage lines, ark grid, spec |

Only `ap` touches the support's own gear. That is the whole reason honing and
karma reach the party at all.

## The gold axis

```
gold per 1% damage = gold / (damage% * partySize)
```

`partySize` defaults to 3 — a support's 1% lands on every dealer in the party.
This matches the astrogem calculator's `SUPPORT_GPD_MULTIPLIER`, so numbers here
and there are on the same scale.

## The support's own stats

Assembled the way bebkok's support buff calculator does it (sheet
`1le-LqVr9l4dXxBDlPaSMNpf6tDVfvfsFE_QRIAmVONE`, tab "Sup buff calc v3.81",
cells DN20..DP29). Flat sources are summed first and the percentage pool
multiplies the lot — a flat weapon-power line is amplified by every weapon-power
percent you own:

```
total WP = (weapon piece + accessory flats + ark grid core + feast + bracelet)
           * (1 + earrings% + karma% + ark grid core%)
total MS = (five armour pieces + accessories + roster + level + food)
           * (1 + skin% + stronghold%)
basic AP = sqrt(total WP * total MS / 6) * (1 + stone% + gem%)
```

| Weapon power | Default |
|---|---|
| accessory Weapon Power+ lines | 2,400 flat |
| ark grid weapon core (Ancient) | 3,900 flat and 2.94% (0.75 + 1.50 + 0.23×3) |
| feast | 2,400 flat |
| earrings, two high lines | 6.00% |
| Karmic Enlightenment | 0.10% per level |

Percentages are **one additive pool**, so each further karma level lands on a
bigger denominator and is worth slightly less: 0.01382% party damage at level
21→22 against 0.01375% at 29→30.

`tools/verify.js` reproduces bebkok's own saved character exactly — total weapon
power 226,085.218, total main stat 687,158.89, basic attack power 184,566 — and
fails loudly if the model drifts.

One divergence from the accessory calculator, taken deliberately: bebkok puts an
attack-power percentage (ability stone 1.5% plus damage gems 13.2%) on the
support's *own* base attack power, which scales the buff it hands out. The
accessory calculator leaves that out. This tool follows bebkok, which raises
every ap-channel step by roughly a tenth.

## Where the game data comes from

`tools/fetch-game-data.py` pulls Maxroll's planner feed
(`assets-ng.maxroll.gg/laplanner`) — the tables their upgrade calculator itself
runs on, tracking the July 2026 patch — and bakes the small derived files under
`data/`. Big downloads are cached under `tools/.cache/` and not committed.

**Cross-check that runs on every fetch:** the `itemLevel` table reproduces
bebkok's Serca gear sheet exactly (chest 57,614 at +0 and 111,477 at +25; weapon
124,793 and 241,367; gloves 86,421 and 167,216). That is the same baseline the
bracelet calculator uses, from an independent source.

## Honing — T4 Upper (1675), normal track

Two rows: **all five armour pieces moving together**, and **the weapon on its
own**. Steps run +11→+12 up to +24→+25.

Rates are 0.01% units. A tap lands at

```
p = base + min(fails * failBonus, failMax) + juice
```

Juice is Lava's Breath (weapon) or Glacier's Breath (armour), `rate` each up to
`juiceMax`. Every failure banks artisan energy; once the success rates already
spent add up to the artisan threshold (215.00%), the next tap is guaranteed.

"Average scenario, optimal" means expected gold under the cheapest constant
breath count, solved per level rather than assumed. It matters: on armour at
+11→+14 and +16→+17 the optimum buys **no** breath, because at 150g the juice
costs more than the taps it saves.

Material prices are editable and each material has an on/off switch, matching
the upgrade calculator — off means the player has it bound and pays nothing.
Defaults:

| Material | Unit | Default |
|---|---|---|
| Destiny Shard Pouch S / M / L | 1,000 / 2,000 / 3,000 shards | 0, off |
| Superior Abidos Fusion Material | each | 125 |
| Destiny Crystallized Destruction Stone | per 100 | 900 |
| Destiny Crystallized Guardian Stone | per 100 | 30 |
| Great Destiny Leapstone | each | 25 |
| Lava's Breath | each | 300 |
| Glacier's Breath | each | 150 |

The step's damage is measured against a self-consistent character: the rest of
the gear sits at the step's starting level, and only the track under test moves.

## Karma

Only **Karmic Enlightenment** counts for a support: **Weapon Power %, +0.10 per
level**, 2.10% at level 21 rising to 3.00% at level 30. It feeds the same `ap`
channel as weapon honing, through `wpPct`.

Ranks 1–5 cap at level 21; rank 6 carries 21→30. Evolution's rank bonus also
grants brand power (+1% per rank, 6% at rank 6), which is already inside the
accessory calculator's brand base.

Karmic Evolution (Max HP) and Karmic Leap (Ultimate Awakening Damage) are worth
nothing to a support's party contribution and are not charted.

## Open questions

1. **The quality block.** Maxroll carries a second per-honing-level stat block
   beside the honing recipe, and their item tooltip adds it to the ilvl base. On
   that basis a +25 chest reads 142,267 main stat rather than 111,477 and every
   gain rises about 67%. Default is off (`useQualityBlock: false`), matching
   bebkok and the bracelet calculator. Waiting on a reading from a real +25
   piece.
2. **Karma level costs.** The data lists 1 Destiny Stone + 900 gold per attempt
   with a `prob` falling from 20% at level 21 to 0.25% at 29 and **0** at 30,
   plus a `care` field at about half of `prob`. A 0% success at the last level
   cannot be a plain roll, so `care` is presumably the pity path. Unresolved.
