/**
 * A million finished T4 support bracelets.
 *   node tools/bracelet-table.js [count] [attempts]
 * Spec and Swiftness fixed at drop (uniform 60-120 each), three granted slots
 * rerolled over seven attempts with locking. Prints the table a tier list is
 * cut from.
 */
"use strict";
var B = require("../model/bracelet.js");
function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var N = Number(process.argv[2] || 1000000), ATT = Number(process.argv[3] || 7);
var rand = m32(20260813), th = B.lockThresholds(rand, ATT, 200000), all = [];
for (var i = 0; i < N; i++) {
  var b = B.rollBracelet(rand, ATT, th);
  all.push({
    d: b.damage, stats: b.spec + "/" + b.swift, sd: b.statDamage, ld: b.lineDamage,
    l: b.held.filter(function (x) { return x.label && x.label !== "mainstat"; })
        .map(function (x) { return x.label; }).join(" + ") || "no line"
  });
}
all.sort(function (a, b) { return a.d - b.d; });
var ref = B.reference(), perfect = B.perfect(), top = all[all.length - 1].d;
console.log(N.toLocaleString() + " bracelets, " + ATT + " attempts, seed 20260813");
console.log("no scoring line at all: " +
  (100 * all.filter(function (x) { return x.ld < 0.01; }).length / N).toFixed(2) + "%");
console.log("perfect possible " + perfect.toFixed(3) + "   best rolled " + top.toFixed(3) + "\n");
console.log("pctile | damage | score | stats | from stats | from lines | lines");
[1,5,10,20,30,40,50,60,70,75,80,85,90,93,95,97,98,99,99.5,99.9,99.99,99.999].forEach(function (p) {
  var k = all[Math.min(all.length - 1, Math.floor(p / 100 * all.length))];
  console.log(String(p).padStart(6) + " | " + k.d.toFixed(3).padStart(6) + " | " +
    B.score(k.d).toFixed(1).padStart(5) + " | " + k.stats.padStart(7) + " | " +
    k.sd.toFixed(3).padStart(10) + " | " + k.ld.toFixed(3).padStart(10) + " | " + k.l);
});
