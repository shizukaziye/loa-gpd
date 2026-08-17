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

// The displayed loadout is idealized to Shizu's display rules (2026-08-16):
// node values snap to multiples of five, and the six cores use exactly two
// numbers in the shape x/x/y/x/x/y with y on the two Star cores. The snap
// stays as close to the simulated account as rounding allows; grades, gold
// and damage remain the account's own. perCore arrives in CORE_SEQ order
// (order Moon/Sun/Star, chaos Moon/STAR/Sun — Stars at 2 and 4) and is
// emitted per half as Moon/Sun/Star so the pattern lands on the Stars.
function snapCores(p) {
  if (!p || p.length !== 6) return p;
  var x = Math.round((p[0] + p[1] + p[3] + p[5]) / 4);
  var y = Math.round((p[2] + p[4]) / 2);
  x = Math.max(0, Math.min(20, x)); y = Math.max(0, Math.min(20, y));
  return [x, x, y, x, x, y];
}
function snapNodes(nodes) {
  if (!nodes) return nodes;
  // one number for all three buff nodes, a multiple of five, nearest the
  // account's average — Shizu wants the displayed loadout perfectly even
  var mean = nodes.reduce(function (s, n) { return s + n[1]; }, 0) / nodes.length;
  var v = 5 * Math.round(mean / 5);
  return nodes.map(function (n) { return [n[0], v]; });
}

["epic", "rare"].forEach(function (rarity) {
  var acct = JSON.parse(fs.readFileSync("data/arkgrid-account-" + rarity + ".json", "utf8"));

  // Grade rungs when the sim recorded them — one stop per band the accounts
  // passed through, so the ladder shows every letter (Shizu: "seems like
  // you're missing every other grade"). Budget stops remain the fallback.
  var raw = acct.rungs && acct.rungs.length ? acct.rungs.map(function (r) {
    return { gold: r.gold, damage: r.damage, gems: r.gems,
      mean: r.mean, meanBand: r.band, weakest: r.weakest,
      band: r.weakBand || r.band, cores: r.cores,
      perCore: snapCores(r.perCore), nodes: snapNodes(r.nodes) };
  }) : acct.rows;

  // drop unreachable and duplicate stops
  var stops = [];
  raw.forEach(function (r) {
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
    draw: acct.draw || "mc",
    // highest budget tier actually simulated — the page marks anything the
    // slider asks for beyond this as still filling in
    maxGpd: (acct.rows || []).reduce(function (m, r) { return Math.max(m, r.gpd || 0); }, 0),
    slots: acct.slots, cutsPerWeek: acct.cutsPerWeek,
    turns: acct.turns, rerolls: acct.rerolls, n: acct.n, sig: acct.sig,
    note: "Priced by the account simulator: cut with the advisor at your " +
      "weakest slot's grade and your budget, socket what beats the pack, " +
      "willpower-legal cores only. Gold covers cutting and fusing; the raw " +
      "astrogem is free. The band ladder (docs/research/ark-grid.md) is the " +
      "uniformity-cost reference, not the price.",
    rows: rows,
    // one simulated account per budget tier — the card's example tracks the
    // slider through these (the bracelet rule: the example follows the
    // budget, not just the band), while the rows above stay the rung steps
    tiers: (acct.rows || []).filter(function (r) { return r.reachable !== false; })
      .map(function (r) {
        return { gpd: r.gpd, gold: r.gold, gems: r.gems, weeks: r.weeks,
          damage: r.damage, mean: r.mean, meanBand: r.meanBand,
          weakest: r.weakest, weakBand: r.band, cores: r.cores,
          capped: !!r.capped, perCore: snapCores(r.perCore), nodes: snapNodes(r.nodes) };
      })
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
