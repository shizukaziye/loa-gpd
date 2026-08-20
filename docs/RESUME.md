# Resume — where this project stopped, 2026-08-20

The sweeps were stopped cleanly for a three-week break. Nothing is lost:
every finished tier is a shard on disk, and both drivers resume by reading
them. Three repos are clean with nothing unpushed (`loa-gpd`, `loastuff`,
`loa-bracelet-calc` untouched).

## Restart the sweeps

Run from the repo root (`C:\Users\Shizu\loa-gpd`). The `--workers` count is
the only thing to think about: 14 on a free machine, 6 while gaming, 2 if
the game is choppy.

```bash
node tools/dd-sweep.js --axis=dps --workers=14 --push=1 >> tools/.cache/dd-dps/driver.out 2>&1
```

```bash
node tools/dd-sweep.js --workers=6 --outdir=tools/.cache/dd2 --push=1 >> tools/.cache/dd2/driver.out 2>&1
```

Then pin them (Windows inherits affinity to children, so pin the driver
early and re-apply once workers spawn):

```bash
powershell -c "Get-Process node | ForEach-Object { $_.ProcessorAffinity = 0x7FFC; $_.PriorityClass = 'BelowNormal' }"
```

`0x7FFC` = cores 2-14, leaving 0-1 and 15 clear. While gaming use `0xFFF0`
(cores 4-15) at `Idle` — Shizu's standing rule. The sweep also stands down
by itself 06:00-09:00 and 18:00-21:00 New York (tools/quiet-hours.js);
`ARKGRID_NO_QUIET=1` overrides it.

**Two traps that cost time this session.** The bash tool's working directory
drifts between calls, and a relaunch whose `>>` redirect resolves to a
missing directory exits 1 without starting anything — use absolute paths or
`cd` first, then confirm the process actually came up. And a driver holds
its code in memory: edits to `dd-sweep.js` or `arkgrid-account.js` only
take effect for tiers started after a restart.

## State at the stop

| axis | rare | epic | notes |
|---|---|---|---|
| support | **29/29** | 28/29 | complete for everything the 25M slider reaches |
| dps | 17/29 | 14/29 | 27 tiers remain, ~35 h at 14 workers |

Support's last tier (epic 100M) was 61% through a ~28 h run and was
discarded — it only extends coverage past the slider, so nothing on the
site depends on it. The DPS sweep's in-flight tiers are likewise gone;
their cell caches survive in `data/cells/dps-*`, which is the expensive
part, so re-runs are much faster than first runs.

The DPS anchor gate now checks per tier rather than demanding a complete
lattice (the axis has 10 spot anchors, not a full MC run). Five of the ten
overlaps were hand-verified before the stop, all inside the 10% tripwire:
rare 250k, epic 250k, rare 1.09M, epic 1.09M, rare 3.96M.

## Open work

1. **Support bracelet ladder is over-graded** (task #23, the known defect).
   Its 8-of-10 rungs sit one band above the bracelet calculator's own
   scorer. The DPS ladder was already fixed the right way in commit
   `ba4c708` — copy that method: per-pair marginal tables through
   `jointScore` with the SUPPORT profile, anchors read off `braceletScore`
   once, cuts from `S.bandsFor("support")`, band-window damage means,
   fully-displayable examples. Then extend `tools/verify-bracelet-bands.js`
   to cover support rows and regenerate `rows.json`,
   `bracelet-vs-gpd.json`, `bracelet-hits.json`.
2. **DPS sweep completion** — resume as above; the site flips each series
   from "coming soon" to live rows on its own as tiers publish.
3. **OAuth redirect URIs are not registered yet.** The character lookup can
   read cached characters but cannot pull fresh ones until Shizu adds these
   on his lostark.bible developer page:
   - `https://shizukaziye.github.io/loa-gpd/` → prod client `22zuv73nnkcgczoxitokvo2q6u`
   - `http://localhost:8734/` → dev client `onwc5iva725mxhak2dxq3ikjti`
4. **CP model has two cheap open measurements** (docs/research/combat-power-model.md):
   one bracelet swapped, and one gem dropped a level, each read off the
   profile screen. They would retire the last assumed weights.

## What shipped in the final stretch

Character lookup ported from the astrogem/bracelet calculators (one box, no
leaderboard) placing a character on every ladder and highlighting the
cheapest next upgrade; the worker learned to parse honing, karma, stone and
bracelet; the CP ladder became one rung per purchase with every increase
documented; the DPS bracelet ladder was re-anchored to the calculator's own
scorer; and the sweep learned to yield the machine during Shizu's hours.
