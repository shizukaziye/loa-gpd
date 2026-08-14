/**
 * arkgrid-split.js — how a support should divide its ark grid side nodes.
 *
 *   node tools/arkgrid-split.js [dps]
 *
 * The three support side nodes do not pay the same. The game's own table gives
 * brand power the biggest number per level, but brand feeds a bracket that is
 * already large, so what reaches the party is smaller than the number suggests.
 * This walks the whole feasible set and reports the best split.
 *
 * What is feasible: twenty-four gems, each of base cost 8, 9 or 10, each
 * carrying two DIFFERENT effects from its own cost's pool.
 *
 *   cost 8   brand + ally damage
 *   cost 9   ally damage + ally attack
 *   cost 10  brand + ally attack
 *
 * With n8 + n9 + n10 = 24 and every line at level five, the reachable levels are
 * exactly ally attack 5(n9+n10), brand 5(n8+n10), ally damage 5(n8+n9) — which
 * always sum to 240 with each node at most 120. So the choice is simply how to
 * split 240 levels three ways, in steps of five.
 */
"use strict";
var S = require("../model/support.js");
var G = require("../model/gear.js");
var data = require("../data/honing-t4upper.json");

var P = S.DEFAULTS;
var gear = G.stats(data, {}, 21, 23);

// percent of buff per node level, from the game table
// (docs/research/reference-character.md, "What 60 points on a side node is worth")
var PER = { allyAtk: 0.1300, brand: 0.1667, allyDmg: 0.0525 };
// the reference character's buff bases already contain a 60-node grid, so take
// that back out to get what the support has before any grid at all
var BASE = { allyAtk: P.allyAtkEnh - 60 * PER.allyAtk,
             brand:   P.brandPower - 60 * PER.brand,
             allyDmg: P.allyDmg    - 60 * PER.allyDmg,
             allyDmgT: P.allyDmgT  - 60 * PER.allyDmg };

function party(aAtk, brand, aDmg) {
  var p = Object.assign({}, P, {
    allyAtkEnh: BASE.allyAtk + aAtk  * PER.allyAtk,
    brandPower: BASE.brand   + brand * PER.brand,
    allyDmg:    BASE.allyDmg + aDmg  * PER.allyDmg,
    allyDmgT:   BASE.allyDmgT + aDmg * PER.allyDmg
  });
  return 100 * Math.log(S.contribution(p, gear, {})) * P.partySize;
}

var floor = party(0, 0, 0);
function gain(a, b, c) { return party(a, b, c) - floor; }

console.log("what one more node level is worth, at 60/60/60:\n");
[["ally attack enh", 1, 0, 0], ["brand power", 0, 1, 0], ["ally damage enh", 0, 0, 1]]
  .forEach(function (r) {
    console.log("   " + r[0].padEnd(17) +
      (gain(60 + r[1], 60 + r[2], 60 + r[3]) - gain(60, 60, 60)).toFixed(5) + "% party");
  });

var best = null, rows = [];
for (var a = 0; a <= 120; a += 5) {
  for (var b = 0; b <= 120; b += 5) {
    var c = 240 - a - b;
    if (c < 0 || c > 120) continue;
    var v = gain(a, b, c);
    rows.push([a, b, c, v]);
    if (!best || v > best[3]) best = [a, b, c, v];
  }
}
rows.sort(function (x, y) { return y[3] - x[3]; });

console.log("\nbest splits of a full 240 levels:\n");
console.log("  ally atk | brand | ally dmg | party damage");
rows.slice(0, 5).forEach(function (r) {
  console.log("  " + String(r[0]).padStart(8) + " | " + String(r[1]).padStart(5) + " | " +
    String(r[2]).padStart(8) + " | " + r[3].toFixed(3) + "%");
});

console.log("\nfor comparison:\n");
[["even 80 / 80 / 80", 80, 80, 80],
 ["all brand 60 / 120 / 60", 60, 120, 60],
 ["all ally damage 60 / 60 / 120", 60, 60, 120]].forEach(function (r) {
  console.log("  " + r[0].padEnd(30) + gain(r[1], r[2], r[3]).toFixed(3) + "%  (" +
    (gain(r[1], r[2], r[3]) - best[3]).toFixed(3) + " against best)");
});

// ---- the DPS axis ----------------------------------------------------------
// Scored through the astrogem calculator's gridDamage, which is what the DPS
// rows already use, so the two agree by construction.
if (process.argv[2] === "dps") {
  var A = require("../../loastuff/loa-astrogem-calc/model/astrogem.js");
  var DN = ["Attack Power", "Boss Damage", "Additional Damage"];
  var dps = function (lv) {
    var gems = [], lines = [], i;
    for (i = 0; i < 3; i++) {
      var left = lv[i];
      while (left > 1e-9) { var l = Math.min(5, left); lines.push([DN[i], l]); left -= l; }
    }
    while (lines.length < 48) lines.push(["__dead__", 1]);
    for (i = 0; i < 24; i++) gems.push({ baseCost: 8, gemType: "order", coreBase: (i / 4) | 0,
      willpowerLevel: 5, orderLevel: 5,
      effect1: lines[i * 2][0], effect1Level: lines[i * 2][1],
      effect2: lines[i * 2 + 1][0], effect2Level: lines[i * 2 + 1][1] });
    return A.gridDamage(gems, "dps");
  };
  console.log("

DPS — what one more node level is worth at 60/60/60:
");
  [["attack power", 1, 0, 0], ["boss damage", 0, 1, 0], ["additional damage", 0, 0, 1]]
    .forEach(function (r) {
      console.log("   " + r[0].padEnd(19) +
        (dps([60 + r[1], 60 + r[2], 60 + r[3]]) - dps([60, 60, 60])).toFixed(5) + "%");
    });
  var db = null;
  for (var a = 0; a <= 120; a += 5) for (var b = 0; b <= 120; b += 5) {
    var c = 240 - a - b;
    if (c < 0 || c > 120) continue;
    var v = dps([a, b, c]);
    if (!db || v > db[3]) db = [a, b, c, v];
  }
  console.log("
   best split  attack " + db[0] + " / boss " + db[1] + " / add " + db[2] +
    "  ->  " + db[3].toFixed(3) + "%");
  console.log("   even 80 / 80 / 80                 ->  " + dps([80, 80, 80]).toFixed(3) + "%");
}
