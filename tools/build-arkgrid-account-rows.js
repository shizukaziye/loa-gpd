/**
 * build-arkgrid-account-rows.js — chart rows for the ark grid, account-priced.
 *
 *   node tools/build-arkgrid-account-rows.js
 *
 * Shizu's ruling: the ark grid is priced by the ACCOUNT model. The band ladder
 * — every slot clearing one grade — overpays 2.4x to 3.9x for the same damage
 * and now lives in docs/research as the uniformity-cost reference only.
 *
 * The account simulator stops once per budget point, so its trace is eight
 * (gold, damage, grid) states per rarity. Rows are the segments between them:
 *
 *   gold    what the next stretch of cutting costs
 *   damage  what it adds, per dealer
 *   to      the gems' average band where the stretch ends
 *
 * Two folds keep the ladder walkable. Duplicate stops (the monotone carry can
 * hold a budget at the previous state) are dropped. And neighbouring segments
 * are pooled until gold-per-damage rises monotonically — the stops come from
 * independently stopped accounts, so raw segment marginals are noisy in a way
 * a prefix-walking planner cannot survive.
 *
 * Every row carries the grid standing at its end — nodes, cores, mean and
 * weakest grade — plus the marginal gems and weeks, so the card and both
 * tooltips describe the same simulated grid the price belongs to.
 */
"use strict";
var fs = require("fs");

["epic", "rare"].forEach(function (rarity) {
  var acct = JSON.parse(fs.readFileSync("data/arkgrid-account-" + rarity + ".json", "utf8"));

  // drop unreachable and duplicate stops
  var stops = [];
  acct.rows.forEach(function (r) {
    if (r.reachable === false) return;
    var last = stops[stops.length - 1];
    if (last && r.gold === last.gold && r.damage === last.damage) return;
    stops.push(r);
  });

  // Segments: entry first, then stop-to-stop marginals. The BASE only advances
  // when damage does: budgets run separate advisor streams, so a later stop can
  // be marginally cheaper than an earlier one, and measuring from the skipped
  // stop would mint a negative-gold row. A skipped stop's spend rolls into the
  // next real segment instead.
  var segs = [], base = { gold: 0, damage: 0, gems: 0 };
  stops.forEach(function (st) {
    var dG = st.gold - base.gold, dD = st.damage - base.damage;
    if (dD <= 1e-9) return;                      // hold the base, fold the spend
    segs.push({ gold: Math.max(0, dG), damage: dD, end: st });
    base = st;
  });

  // pool until gold per damage is monotone (pair-adjacent-violators)
  var pooled = [];
  segs.forEach(function (s) {
    pooled.push({ gold: s.gold, damage: s.damage, end: s.end });
    while (pooled.length > 1) {
      var a = pooled[pooled.length - 2], b = pooled[pooled.length - 1];
      if (b.gold / b.damage >= a.gold / a.damage) break;
      pooled.splice(pooled.length - 2, 2,
        { gold: a.gold + b.gold, damage: a.damage + b.damage, end: b.end });
    }
  });

  var rows = [], cumG = 0, cumD = 0, prevBand = "ungraded", prevGems = 0;
  pooled.forEach(function (s) {
    var e = s.end;
    cumG += s.gold; cumD += s.damage;
    var dGems = Math.max(0, e.gems - prevGems);
    rows.push({
      from: prevBand, to: e.meanBand,
      note: "mean " + e.mean.toFixed(0),
      gold: Math.round(s.gold),
      damage: Number(s.damage.toFixed(5)),
      total: Math.round(cumG),
      totalDamage: Number(cumD.toFixed(4)),
      gems: dGems,
      weeks: dGems / acct.cutsPerWeek,
      grid: { cores: e.cores, coresPer: e.perCore, nodes: e.nodes },
      meanGrade: e.mean, weakest: e.weakest, weakBand: e.band,
      minimum: "all 24 slots filled, gems averaging " + e.meanBand,
      buy: rarity + " astrogems at " + acct.turns + " turns and " + acct.rerolls +
        " rerolls, duds fused, advisor tracking your weakest slot"
    });
    prevBand = e.meanBand; prevGems = e.gems;
  });

  var out = {
    axis: "support", rarity: rarity, model: "account",
    slots: acct.slots, cutsPerWeek: acct.cutsPerWeek,
    turns: acct.turns, rerolls: acct.rerolls, n: acct.n, sig: acct.sig,
    note: "Priced by the account simulator: cut with the advisor at your " +
      "weakest slot's grade and your budget, socket what beats the pack, " +
      "willpower-legal cores only. Gold covers cutting and fusing; the raw " +
      "astrogem is free. The band ladder (docs/research/ark-grid.md) is the " +
      "uniformity-cost reference, not the price.",
    rows: rows
  };
  fs.writeFileSync("data/arkgrid-rows-" + rarity + ".json", JSON.stringify(out, null, 1));

  console.log(rarity + " — " + rows.length + " rows");
  rows.forEach(function (r) {
    console.log("  " + (r.from + " -> " + r.to).padEnd(20) +
      ("(" + r.note + ")").padEnd(10) +
      Math.round(r.gold / 1000).toLocaleString().padStart(7) + "k" +
      (r.damage.toFixed(3) + "%").padStart(9) +
      ("gpd " + Math.round(r.gold / (r.damage * 3) / 1000).toLocaleString() + "k").padStart(12) +
      String(r.gems).padStart(6) + " gems" + r.weeks.toFixed(0).padStart(4) + "w");
  });
});
console.log("wrote data/arkgrid-rows-{epic,rare}.json");
