/**
 * build-bracelet-rows.js — the bracelet ladder rows, from the model, at last.
 *
 *   node tools/build-bracelet-rows.js [rollsPerPair]
 *
 * The bracelet rows in data/rows.json were assembled by hand and the audit
 * showed what that costs: odds that disagreed with the model, materials that
 * did not sum to their own totals, and example bracelets for the bottom rungs
 * that actually rank C. This regenerates every bracelet artefact from one
 * simulation so they cannot drift apart again.
 *
 * THE STRATEGY BEING PRICED, per Shizu's original spec: you buy an UNROLLED
 * bracelet — its Spec and Swiftness are visible on the market — and roll its
 * three granted slots. So the odds of reaching a rung are conditioned on the
 * pair you bought, and each rung picks the even pair that minimises expected
 * cost, market price plus twenty pheons per attempt over the hit rate. A
 * whale chasing S+ buys 110/110 bases not because they are cheap but because
 * no lesser pair can clear the anchor at all.
 *
 * The first cut of this tool priced the pair and took odds from the full
 * random-stat population — the same mismatch the audit flagged in
 * bracelet-vs-gpd — and quoted twenty-six billion gold for S+. Conditioning
 * is what makes the top of the ladder cost what a player actually pays.
 *
 * Per rung:
 *   pair        argmin over {60..110 even} of allIn(pair)/P(cut | pair),
 *               held monotone so a higher rung never buys a cheaper base
 *   odds        1 in N rolled bracelets of THAT pair reaches the cut
 *   gold        marginal: this rung's expected total minus the rung below's
 *   damage      (cut - cut below) x span / 100
 *   totalDamage floor + cut x span / 100, the whole bracelet per dealer
 *   example     the pair's stats with really-rolled lines just above the cut
 *
 * Writes: bracelet rows in data/rows.json (other series untouched),
 * data/bracelet-hits.json, data/bracelet-cost.json.
 */
"use strict";
var fs = require("fs");
var B = require("../model/bracelet.js");
var P = require("../model/bracelet-price.js");

var K = parseInt(process.argv[2], 10) || 1500000;   // rolls per pair
var PAIRS = [60, 70, 80, 90, 100, 110, 120];

var NAME = { 16: "defence shred", 17: "crit resist", 18: "shielded dmg",
             19: "crit dmg resist", 20: "weapon power (stacking)",
             21: "weapon power", 22: "weapon power (stacks)",
             29: "ally atk power", 30: "ally damage", 33: "weapon power" };
function tierOf(label) {
  return label.indexOf("LEG") > 0 ? "LEG" : label.indexOf("epic") > 0 ? "epic" : "blue";
}

function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var rand = m32(20260815);
var th = B.lockThresholds(rand, 7, 200000);

/** The granted-slot game with the stats already fixed — rollBracelet minus the stat roll. */
function rollLines() {
  var held = [], i;
  for (var attempt = 7; attempt >= 1; attempt--) {
    var used = { families: {}, basics: 0 };
    for (i = 0; i < held.length; i++) {
      if (held[i].family) used.families[held[i].family] = true;
      if (held[i].basic) used.basics += 1;
    }
    for (i = held.length; i < 3; i++) held.push(B.drawSlot(rand, used));
    if (attempt === 1) break;
    held.sort(function (a, b) { return b.value - a.value; });
    var fl = th[Math.min(attempt - 1, th.length - 1)];
    held = held.filter(function (x) { return x.value >= fl; });
  }
  return held;
}

// ---- one population per pair ------------------------------------------------
var LADDER = B.LADDER.slice().reverse();            // ascending
var cuts = LADDER.map(function (r) { return r[1] === -Infinity ? 0 : r[1]; });
var hit = {}, ex = {};
PAIRS.forEach(function (p) {
  hit[p] = new Float64Array(LADDER.length);
  ex[p] = new Array(LADDER.length);
  var traitD = 2 * p * B.TRAIT_PER_POINT;
  for (var i = 0; i < K; i++) {
    var held = rollLines(), lines = 0, j;
    for (j = 0; j < held.length; j++) lines += held[j].value;
    var sc = B.score(traitD + lines);
    for (var k = 0; k < LADDER.length; k++) {
      if (sc < cuts[k] && !(k === 0)) continue;
      hit[p][k]++;
      if (!ex[p][k] && (sc < cuts[k] + 0.8 || k === 0)) {
        ex[p][k] = held.filter(function (x) { return x.label && x.label !== "mainstat"; })
          .map(function (x) { return { name: NAME[x.family], tier: tierOf(x.label) }; });
      }
    }
  }
});

// ---- pick each rung's pair, monotone ---------------------------------------
var floorD = B.floor(), span = B.anchor() - B.floor();
var minPair = 60;
var rungs = LADDER.map(function (r, k) {
  var best = null;
  PAIRS.forEach(function (p) {
    if (p < minPair || !hit[p][k]) return;
    var eCost = P.allIn(p, p) * K / hit[p][k];
    if (!best || eCost < best.eCost) best = { pair: p, eCost: eCost, n: K / hit[p][k] };
  });
  if (best) minPair = best.pair;
  return { rank: r[0], cut: cuts[k], best: best };
});

// ---- the rows ---------------------------------------------------------------
var doc = JSON.parse(fs.readFileSync("data/rows.json", "utf8"));
var kept = doc.rows.filter(function (r) { return r.series !== "bracelet"; });
// The chain starts at F, not F-: every character owns SOME bracelet, so the
// chart prices climbing the ladder, not owning one at all. The F rung's cost
// seeds the running total so the first step's marginal is honest.
var rows = [], hits = {}, costs = {}, prevCut = 0, prevRank = "F";
var prevGold = rungs[1] && rungs[1].best ? Math.round(rungs[1].best.eCost) : 0;

for (var k2 = 2; k2 < rungs.length; k2++) {
  var r = rungs[k2];
  if (!r.best) break;
  var p = r.best.pair, n = r.best.n;
  var total = Math.round(r.best.eCost);
  var gold = Math.max(1, total - prevGold);
  var nDisp = Math.max(1, Math.round(n));
  var lines = ex[p][k2] || [];
  var lineTxt = lines.map(function (l) { return l.name + " " + l.tier; }).join(", ");
  hits[r.rank] = { stats: p + "/" + p, lines: lines };
  costs[r.rank] = { bracelets: nDisp, gold: total, pair: p + "/" + p };
  rows.push({
    series: "bracelet",
    label: prevRank + " → " + r.rank,
    from: prevRank, to: r.rank,
    gold: gold,
    damage: Number(((r.cut - prevCut) * span / 100).toFixed(5)),
    total: total,
    hit: { stats: p + "/" + p, lines: lines },
    minimum: p + "/" + p + " with " + (lineTxt || "no scoring line"),
    mats: [
      ["cut " + p + "/" + p + " bracelets", nDisp, n * P.listed(p, p)],
      ["pheons", 20 * nDisp, n * P.PHEONS_PER_BRACELET * P.PHEON_GOLD]
    ],
    buy: p + "/" + p + " unrolled bracelets, about " +
      Math.round(P.listed(p, p)).toLocaleString() + " each",
    odds: "1 in " + nDisp.toLocaleString() + " rolled " + p + "/" + p +
      " bracelets reaches " + r.rank,
    totalDamage: Number((floorD + r.cut * span / 100).toFixed(4))
  });
  prevGold = total; prevCut = r.cut; prevRank = r.rank;
}

doc.rows = kept.concat(rows);
fs.writeFileSync("data/rows.json", JSON.stringify(doc, null, 1));
fs.writeFileSync("data/bracelet-hits.json", JSON.stringify(hits, null, 1));
fs.writeFileSync("data/bracelet-cost.json", JSON.stringify(costs, null, 1));

console.log(K.toLocaleString() + " rolls per pair   floor " + floorD.toFixed(4) +
  "   anchor " + B.anchor().toFixed(4) + "   span " + span.toFixed(4) + "\n");
console.log("rung".padEnd(10) + "pair".padStart(8) + "odds 1 in".padStart(11) +
  "step gold".padStart(12) + "total".padStart(13) + "damage".padStart(9) + "  lines");
rows.forEach(function (r) {
  console.log(r.label.padEnd(10) + r.hit.stats.padStart(8) +
    String(r.mats[0][1]).padStart(11) + Math.round(r.gold).toLocaleString().padStart(12) +
    Math.round(r.total).toLocaleString().padStart(13) + r.damage.toFixed(3).padStart(9) +
    "  " + r.hit.lines.map(function (l) { return l.name + " " + l.tier; }).join(", "));
});
console.log("\nwrote data/rows.json (bracelet series), bracelet-hits.json, bracelet-cost.json");
