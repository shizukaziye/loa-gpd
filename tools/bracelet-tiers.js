/**
 * Support bracelets on the bracelet calculator's DPS ladder (subrank.js).
 *   node tools/bracelet-tiers.js [count]
 * Same anchor: 100 = three best families at Epic with traits at 110.
 */
"use strict";
var B = require("../model/bracelet.js");
function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var LADDER = [["S+",100.1],["S",95],["S-",90],["A+",85],["A",80],["A-",75],
  ["B+",70],["B",65],["B-",60],["C+",55],["C",50],["C-",45],["D+",40],["D",35],
  ["D-",30],["F+",20],["F",10],["F-",-Infinity]];
function rankOf(s){ for (var i=0;i<LADDER.length;i++) if (s>=LADDER[i][1]) return LADDER[i][0]; return "F-"; }

var N = Number(process.argv[2] || 1000000);
var rand = m32(20260813), th = B.lockThresholds(rand, 7, 200000), all = [];
for (var i = 0; i < N; i++) {
  var b = B.rollBracelet(rand, 7, th);
  all.push({ s: B.score(b.damage), d: b.damage, spec: b.spec, swift: b.swift,
    l: b.held.filter(function (x) { return x.label && x.label !== "mainstat"; })
        .map(function (x) { return x.label; }).join(" + ") || "no line" });
}
all.sort(function (a, b) { return a.s - b.s; });
console.log(N.toLocaleString() + " support bracelets, 7 attempts, seed 20260813");
console.log("anchor 100 = " + B.reference().toFixed(3) + " damage (110/110 + f17/f19/f16 epic)\n");
console.log("rank | opens | count    | share    | at or above | example at the band floor");
var seen = 0;
for (var r = LADDER.length - 1; r >= 0; r--) {
  var key = LADDER[r][0], min = LADDER[r][1], max = r > 0 ? LADDER[r - 1][1] : Infinity;
  var inBand = all.filter(function (x) { return x.s >= min && x.s < max; });
  var above = all.filter(function (x) { return x.s >= min; }).length;
  var ex = inBand.length ? inBand[0] : null;
  console.log(key.padEnd(4) + " | " + String(min === -Infinity ? "  -" : min).padStart(5) + " | " +
    String(inBand.length).padStart(8) + " | " + (100 * inBand.length / N).toFixed(3).padStart(7) + "% | " +
    (100 * above / N).toFixed(3).padStart(10) + "% | " +
    (ex ? ex.spec + "/" + ex.swift + "  " + ex.l : "—"));
}
