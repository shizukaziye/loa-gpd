/**
 * bracelet-vs-gpd.js — the bracelet you would actually be wearing, by budget.
 *
 *   node tools/bracelet-vs-gpd.js [samples]
 *
 * The card used to show one fixed example per rank, so every A+ budget saw the
 * same A+. Shizu wants the example to improve inside a band as the slider
 * rises, which it should: a richer player buys more bracelets and keeps the
 * best of them, and best-of-more is better even when it lands in the same band.
 *
 * The stopping rule is the chart's own. Buying one more bracelet costs its
 * market price plus twenty pheons, and it is worth buying while
 *
 *     cost of a roll / (gain from that roll x 3 dealers)  <=  your gold per damage
 *
 * E[best of n] comes from the empirical score distribution, so the marginal
 * gain of the nth bracelet falls away naturally and the rule terminates. The
 * example reported at each budget is a real rolled bracelet whose score sits
 * closest to E[best of n], not a constructed one.
 *
 * Base stats are held at the pair the band's own row buys, matching the rest of
 * the bracelet model — the budget buys MORE tries here, not better bases.
 */
"use strict";
var B = require("../model/bracelet.js");
var P = require("../model/bracelet-price.js");

var M = parseInt(process.argv[2], 10) || 400000;
var PARTY = 3;

function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var rand = m32(20260814);
var th = B.lockThresholds(rand, 7, 200000);

var NAME = { 16: "defence shred", 17: "crit resist", 18: "shielded dmg", 19: "crit dmg resist",
             20: "weapon power (stacking)", 21: "weapon power", 22: "weapon power (stacks)",
             29: "ally atk power", 30: "ally damage", 33: "weapon power" };
function linesOf(br) {
  return br.held.filter(function (x) { return x.label && x.label !== "mainstat"; })
    .map(function (x) {
      return { name: NAME[x.family],
               tier: x.label.indexOf("LEG") > 0 ? "legendary"
                   : x.label.indexOf("epic") > 0 ? "epic" : "blue" };
    });
}

// ---- sample the score distribution, keeping one real bracelet per score bin --
var BIN = 0.25, MAXS = 140;
var nbin = Math.ceil(MAXS / BIN);
var count = new Float64Array(nbin), cand = new Array(nbin);
var damages = new Float64Array(nbin);
for (var i = 0; i < M; i++) {
  var br = B.rollBracelet(rand, 7, th);
  var sc = B.score(br.damage);
  var b = Math.max(0, Math.min(nbin - 1, Math.floor(sc / BIN)));
  count[b]++;
  damages[b] = br.damage;
  if (!cand[b]) cand[b] = [];
  if (cand[b].length < 60) {
    cand[b].push({ spec: br.spec, swift: br.swift, lines: linesOf(br), score: sc });
  }
}
// A score can be reached by good stats or by good lines, so the first bracelet
// into a bin is not a fair picture of it. Take the one whose stat total sits in
// the middle of the bin, which reads as the typical bracelet at that score.
var rep = cand.map(function (list) {
  if (!list || !list.length) return null;
  var sorted = list.slice().sort(function (x, y) {
    return (x.spec + x.swift) - (y.spec + y.swift);
  });
  return sorted[sorted.length >> 1];
});
// cumulative distribution and the score/damage at each bin's centre
var cdf = new Float64Array(nbin), acc = 0;
for (i = 0; i < nbin; i++) { acc += count[i] / M; cdf[i] = acc; }

/** E[best of n] on the score scale, and the matching damage. */
function bestOf(n) {
  var prev = 0, es = 0, ed = 0;
  for (var k = 0; k < nbin; k++) {
    if (!count[k]) continue;
    var p = Math.pow(cdf[k], n) - prev;
    prev = Math.pow(cdf[k], n);
    es += (k + 0.5) * BIN * p;
    ed += damages[k] * p;
  }
  return { score: es, damage: ed };
}

// ---- what a roll costs, at the base stats each band's row buys --------------
// the row's own stat pair by rank, from data/bracelet-hits.json
var HITS = JSON.parse(require("fs").readFileSync("data/bracelet-hits.json", "utf8"));
function costOfRoll(rank) {
  var st = (HITS[rank] && HITS[rank].stats) || "100/100";
  var p = st.split("/").map(Number);
  return P.allIn(p[0], p[1]);
}

// ---- walk the budget --------------------------------------------------------
var GPDS = [];
for (var g = 250000; g <= 25000000; g *= Math.pow(100, 1 / 24)) GPDS.push(Math.round(g));

var out = GPDS.map(function (gpd) {
  var n = 1, cur = bestOf(1);
  for (var guard = 0; guard < 20000; guard++) {
    var nxt = bestOf(n + 1);
    var gain = nxt.damage - cur.damage;
    if (gain <= 1e-9) break;
    var roll = costOfRoll(B.rank(cur.score));
    if (roll / (gain * PARTY) > gpd) break;
    n++; cur = nxt;
  }
  // the real bracelet nearest E[best of n]
  var bi = Math.max(0, Math.min(nbin - 1, Math.round(cur.score / BIN)));
  var found = null;
  for (var d = 0; d < nbin && !found; d++) {
    if (rep[bi - d]) found = rep[bi - d];
    else if (rep[bi + d]) found = rep[bi + d];
  }
  return { gpd: gpd, rolls: n, score: Number(cur.score.toFixed(2)),
    damage: Number(cur.damage.toFixed(4)), rank: B.rank(cur.score),
    gold: Math.round(n * costOfRoll(B.rank(cur.score))),
    example: found ? { stats: found.spec + "/" + found.swift, lines: found.lines,
                       score: Number(found.score.toFixed(1)) } : null };
});

console.log("gpd".padStart(9) + "rolls".padStart(8) + "rank".padStart(6) +
  "score".padStart(8) + "damage".padStart(9) + "  example");
out.forEach(function (r) {
  console.log(((r.gpd / 1e6).toFixed(2) + "M").padStart(9) + String(r.rolls).padStart(8) +
    r.rank.padStart(6) + r.score.toFixed(1).padStart(8) + r.damage.toFixed(3).padStart(9) +
    "  " + (r.example ? r.example.stats + "  " + r.example.lines.map(function (l) {
      return l.name + " " + l.tier; }).join(", ") : "-"));
});
require("fs").writeFileSync("data/bracelet-vs-gpd.json",
  JSON.stringify({ samples: M, party: PARTY, rows: out }, null, 1));
console.log("\nwrote data/bracelet-vs-gpd.json");
