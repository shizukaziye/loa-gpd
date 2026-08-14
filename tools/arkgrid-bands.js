/**
 * arkgrid-bands.js — what a whole ark grid is worth at each grade band.
 *
 *   node tools/arkgrid-bands.js support|dps
 *
 * The grid is SIX cores of four gems — twenty-four gems, forty-eight effect
 * lines, so a side node can reach 120 and the three of them share 240 levels.
 * Earlier rows here were built on twelve gems, half a grid.
 *
 * Two passes. First we draw grids at random from each band's gem pool, picking
 * each gem to keep the three side nodes level the way a player does, and read
 * off where the nodes and the core points land. The second pass fits a line
 * through the bands the chart uses and rebuilds one exact grid per band from
 * it. That strips the sampling wobble without flattening the range, which
 * matters because the chart needs gold per damage to climb as you go up the
 * ladder — a wobble there makes the planner skip rungs.
 *
 *
 * Damage is always the astrogem calculator's own gridDamage, never a formula
 * copied out of it.
 */
"use strict";
var A = require("../../loastuff/loa-astrogem-calc/model/astrogem.js");
var AXIS = (process.argv[2] || "support").toLowerCase();

var POOL = {
  8:  ["Additional Damage", "Attack Power", "Brand Power", "Ally Damage Enh."],
  9:  ["Boss Damage", "Attack Power", "Ally Damage Enh.", "Ally Attack Enh."],
  10: ["Boss Damage", "Additional Damage", "Brand Power", "Ally Attack Enh."]
};
var NODES = AXIS === "support"
  ? ["Ally Attack Enh.", "Brand Power", "Ally Damage Enh."]
  : ["Attack Power", "Boss Damage", "Additional Damage"];
var SHORT = { "Ally Attack Enh.": "ally atk", "Brand Power": "brand",
  "Ally Damage Enh.": "ally dmg", "Attack Power": "atk power",
  "Boss Damage": "boss dmg", "Additional Damage": "add dmg" };

var bounds = AXIS === "support" ? A.supportValueBounds() : A.valueBounds();
var anchor = AXIS === "support" ? A.supportValueAnchor() : A.valueAnchor();
var valueOf = AXIS === "support" ? A.supportValue : A.gemValue;
var dmgOf   = AXIS === "support" ? A.supportDamage : A.gemDamage;
function grade(c) { return 100 * (valueOf(c) - bounds.min) / (anchor - bounds.min); }

var ALL = [];
[8, 9, 10].forEach(function (bc) {
  var p = POOL[bc];
  for (var i = 0; i < p.length; i++) for (var j = i + 1; j < p.length; j++)
    for (var wp = 1; wp <= 5; wp++) for (var o = 1; o <= 5; o++)
      for (var l1 = 1; l1 <= 5; l1++) for (var l2 = 1; l2 <= 5; l2++)
        ALL.push({ baseCost: bc, gemType: "order", willpowerLevel: wp, orderLevel: o,
          effect1: p[i], effect1Level: l1, effect2: p[j], effect2Level: l2 });
});
ALL.forEach(function (c) { c._g = grade(c); });

var LADDER = AXIS === "support" ? A.SUPPORT_RANK_LADDER : A.RANK_LADDER;

function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var rand = m32(20260814);

/**
 * Twenty-four gems from a band, four to each of six cores. A player does not
 * socket at random: they spread the lines so all three side nodes climb
 * together. So each pick looks at a dozen candidates and takes the one that
 * leaves the nodes most even, tie-broken on the gem's own damage.
 */
function sampleGrid(pool) {
  var node = {}, pts = 0, i, q;
  for (i = 0; i < NODES.length; i++) node[NODES[i]] = 0;
  for (i = 0; i < 24; i++) {
    var best = null, bestScore = -Infinity;
    for (var k = 0; k < 12; k++) {
      var c = pool[(rand() * pool.length) | 0];
      var lo = Infinity, hi = -Infinity;
      for (q = 0; q < NODES.length; q++) {
        var n = NODES[q];
        var v = node[n] + (c.effect1 === n ? c.effect1Level : 0) +
                          (c.effect2 === n ? c.effect2Level : 0);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      var s = lo * 4 - (hi - lo) + dmgOf(c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    for (q = 0; q < NODES.length; q++) {
      var n2 = NODES[q];
      if (best.effect1 === n2) node[n2] += best.effect1Level;
      if (best.effect2 === n2) node[n2] += best.effect2Level;
    }
    pts += best.orderLevel;
  }
  return { node: node, cores: pts / 6 };
}

/**
 * One grid built to hit these node levels and core points exactly.
 *
 * Levels may be fractional. A real grid only holds whole levels, but rounding
 * each band to an integer makes the steps alternate five and six, and that
 * shows up as a wobble in gold per damage. Damage is linear in the level, so
 * the fraction is carried here and the rounding is left to the display.
 */
function buildGrid(levels, corePts) {
  var gems = [], lines = [], i;
  for (i = 0; i < NODES.length; i++) {
    var left = levels[i];
    while (left > 1e-9) { var l = Math.min(5, left); lines.push([NODES[i], l]); left -= l; }
  }
  while (lines.length < 48) lines.push(["__dead__", 1]);
  for (i = 0; i < 24; i++) {
    gems.push({ baseCost: 8, gemType: "order", coreBase: (i / 4) | 0,
      willpowerLevel: 5, orderLevel: corePts / 4,
      effect1: lines[i * 2][0], effect1Level: lines[i * 2][1],
      effect2: lines[i * 2 + 1][0], effect2Level: lines[i * 2 + 1][1] });
  }
  return gems;
}

// ---- pass one: where the nodes and cores actually land ---------------------
var REPS = 4000, obs = [];
LADDER.forEach(function (row) {
  var cut = row[1];
  var pool = ALL.filter(function (c) { return c._g >= cut && c._g < cut + 3.4; });
  if (pool.length < 3) return;
  var acc = {}, cores = 0, i;
  for (i = 0; i < NODES.length; i++) acc[NODES[i]] = 0;
  for (var r = 0; r < REPS; r++) {
    var g = sampleGrid(pool);
    for (i = 0; i < NODES.length; i++) acc[NODES[i]] += g.node[NODES[i]];
    cores += g.cores;
  }
  var sum = 0;
  for (i = 0; i < NODES.length; i++) sum += acc[NODES[i]] / REPS;
  obs.push({ rank: row[0], cut: cut, level: sum / 3, cores: cores / REPS });
});

// ---- pass two: straighten over the bands the chart uses --------------------
// Across C- and up the sampled levels sit almost exactly on a line in the
// grade; below that they flatten towards zero and would drag the fit down. So
// the line is fitted on C- upwards only. Two things fall out of fitting in the
// grade rather than in the rank: the level steps come out even, so gold per
// damage climbs with the gold instead of wobbling, and a narrow band like
// S to S+ gets the small step its narrow grade range earns.
function fit(pts) {
  var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (var i = 0; i < n; i++) {
    sx += pts[i][0]; sy += pts[i][1];
    sxx += pts[i][0] * pts[i][0]; sxy += pts[i][0] * pts[i][1];
  }
  var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope: b, intercept: (sy - b * sx) / n };
}
var used = obs.filter(function (o) { return o.cut >= 60; });
var fLevel = fit(used.map(function (o) { return [o.cut, o.level]; }));
var fCores = fit(used.map(function (o) { return [o.cut, o.cores]; }));

var out = obs.map(function (o) {
  var lvl = Math.max(0, Math.min(120, fLevel.slope * o.cut + fLevel.intercept));
  var pts = Math.max(0, Math.min(20, fCores.slope * o.cut + fCores.intercept));
  return { rank: o.rank, cut: o.cut, cores: Math.round(pts),
    damage: A.gridDamage(buildGrid([lvl, lvl, lvl], pts), AXIS),
    nodes: NODES.map(function (n) { return [SHORT[n], Math.round(lvl)]; }) };
});

console.log(AXIS.toUpperCase() + " — 24 gems, 6 cores, " + REPS.toLocaleString() +
  " sampled grids per band\n");
console.log("rank | cut  | grid damage | step up | cores | side nodes");
out.forEach(function (o, i) {
  var step = i + 1 < out.length ? o.damage - out[i + 1].damage : o.damage;
  console.log(o.rank.padEnd(4) + " | " + String(o.cut).padStart(4) + " | " +
    o.damage.toFixed(3).padStart(10) + "% | " + step.toFixed(3).padStart(7) + " | " +
    String(o.cores).padStart(5) + " | " +
    o.nodes.map(function (n) { return n[0] + " " + n[1]; }).join(", "));
});
require("fs").writeFileSync("data/arkgrid-bands-" + AXIS + ".json", JSON.stringify(out, null, 1));
console.log("\nwrote data/arkgrid-bands-" + AXIS + ".json");
