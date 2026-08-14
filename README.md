# loa-gpd

A gold-per-damage chart for Lost Ark: every progression system on one scale, so
you can see what your next million gold is actually worth.

First build covers **supports**, where "damage" means the damage a support hands
to the party — the accessory calculator's model, with the party multiplier on
the gold axis so the numbers match the astrogem calculator.

Systems charted:

- **Honing** — T4 Upper (1675) normal track, +11 through +25. Two rows: all five
  armour pieces together, and the weapon on its own.
- **Karma** — Karmic Enlightenment past level 21.
- **Ability stone** — 7-7 up to 9-7.
- **Bracelet** — 80/80 with one blue s-tier line, up to 110/110 with two
  legendary.
- **Accessories** — neck, earring and ring line steps.
- **Ark grid** — average gold from C up to S+ on the Loseii grading scale.

Game tables come from Maxroll's planner feed and are re-baked by
`python tools/fetch-game-data.py`, which cross-checks itself against bebkok's
gear sheet. See [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

GitHub Pages first; it moves to loseii.com once it settles.
