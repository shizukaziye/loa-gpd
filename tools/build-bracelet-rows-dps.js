/**
 * build-bracelet-rows-dps.js — the DPS bracelet ladder, from the calculator.
 *
 *   node tools/build-bracelet-rows-dps.js [rollsPerPair]
 *
 * The DPS tab's bracelet rows were the last hand-assembled data on the chart,
 * still priced against the old 40/40 floor. This mirrors the support
 * generator's method — buy an unrolled bracelet with a visible crit/spec pair,
 * roll the three granted slots, odds conditioned on the pair, each rung taking
 * the cheapest even pair — with every number read from the bracelet
 * calculator's own DPS model:
 *
 *   line values   lineDamage(special/basic, ancient, profile) per family/tier
 *   traits        traitDamage({crit, spec}, profile)
 *   floor         61/61, the worst an Ancient can drop with (subrank)
 *   anchor        three best DISTINCT mid-tier families + traits at 110/110
 *   ladder        subrank's, S+ at 100.1 — "the anchor is beatable"
 *
 * The reference dealer is the same profile the chart's DPS axis already uses.
 * One documented reuse: the market price curve was fitted on spec/swift
 * listings; crit/spec bases are priced with the same pair-sum fit for want of
 * a separate corpus.
 */
"use strict";
var fs = require("fs");
var D = require("../../loa-bracelet-calc/data/bracelet-data.js");
var B = require("../../loa-bracelet-calc/model/bracelet.js");
var P = require("../model/bracelet-price.js");

var K = parseInt(process.argv[2], 10) || 1000000;
var PAIRS = [60, 70, 80, 90, 100, 110, 120];
var PROF = B.normalizeProfile({ wpPct: 0.081, baseApPct: 0.2948, flatAP: 3600, flatWP: 0 });

var LADDER = [["S+", 100.1], ["S", 95], ["S-", 90], ["A+", 85], ["A", 80], ["A-", 75],
  ["B+", 70], ["B", 65], ["B-", 60], ["C+", 55], ["C", 50], ["C-", 45],
  ["D+", 40], ["D", 35], ["D-", 30], ["F+", 20], ["F", 10], ["F-", -Infinity]];

// short chip names, sized for one row of three on a 215px card
var SHORT = { 1: "atk/move", 2: "outgoing", 3: "stagger", 4: "atk power", 5: "wp",
  6: "crit rate", 7: "crit dmg", 8: "specialty", 9: "swiftness", 10: "domination",
  11: "crit rate", 12: "crit dmg", 13: "dmg+stag", 14: "dmg+ident", 15: "cd→dmg",
  16: "def shred", 17: "crit shred", 18: "shield dmg", 19: "cdmg shred",
  20: "wp x6", 21: "wp", 22: "wp x30", 23: "atk on hit", 24: "dmg to full",
  25: "back atk", 26: "front atk", 27: "non-dir", 28: "dmg to low",
  29: "ally atk", 30: "ally dmg", 31: "atk when hit", 32: "shield self", 33: "wp flat" };

// ---- line value tables from the calculator ---------------------------------
var TIERS = ["low", "mid", "high"];
var VAL = {}, WEIGHT = {};
D.SPECIALS.forEach(function (s) {
  VAL[s.id] = TIERS.map(function (t) {
    try { return B.lineDamage({ cat: "special", family: s.id, tier: t }, "ancient", PROF); }
    catch (e) { return 0; }
  });
  WEIGHT[s.id] = TIERS.map(function (t) { return s.granted[t]; });
});
var basicMin = B.lineDamage({ cat: "basic", family: "mainStat", value: 9600 }, "ancient", PROF);
var basicSpan = B.lineDamage({ cat: "basic", family: "mainStat", value: 16000 }, "ancient", PROF) - basicMin;
var BASIC_BANDS = [[10, 9600, 10240], [16, 10241, 10880], [16, 10881, 11520], [16, 11521, 12160],
  [10, 12161, 12800], [10, 12801, 13440], [10, 13441, 14080], [4, 14081, 14720],
  [4, 14721, 15360], [4, 15361, 16000]];

function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
var rand = m32(20260815);

function pick(weights) {
  var total = 0, i;
  for (i = 0; i < weights.length; i++) total += weights[i];
  var r = rand() * total;
  for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

/** One granted slot: basic 35 / special 30 with both trait places filled. */
function drawSlot(used) {
  var canBasic = used.basics < 2;
  if (canBasic && rand() * 65 < 35) {
    used.basics++;
    if (rand() < 0.5) return { value: 0, fam: 0, tier: -1 };          // vitality
    var b = BASIC_BANDS[pick(BASIC_BANDS.map(function (x) { return x[0]; }))];
    var v = b[1] + Math.floor(rand() * (b[2] - b[1] + 1));
    return { value: basicMin + basicSpan * ((v - 9600) / 6400), fam: 0, tier: -1 };
  }
  var pool = [], w = [];
  D.SPECIALS.forEach(function (s) {
    if (used.fams[s.id]) return;
    for (var t = 0; t < 3; t++) { pool.push([s.id, t]); w.push(WEIGHT[s.id][t]); }
  });
  var hit = pool[pick(w)];
  used.fams[hit[0]] = true;
  return { value: VAL[hit[0]][hit[1]], fam: hit[0], tier: hit[1] };
}

// lock thresholds V(n) = E[max(X, V(n-1))] over the slot distribution
var draws = [];
for (var i0 = 0; i0 < 200000; i0++) draws.push(drawSlot({ basics: 0, fams: {} }).value);
var TH = [0];
for (var n0 = 1; n0 <= 7; n0++) {
  var sum = 0;
  for (var j0 = 0; j0 < draws.length; j0++) sum += Math.max(draws[j0], TH[n0 - 1]);
  TH.push(sum / draws.length);
}

/** The granted-slot game, stats already fixed. */
function rollLines() {
  var held = [], i;
  for (var attempt = 7; attempt >= 1; attempt--) {
    var used = { basics: 0, fams: {} };
    for (i = 0; i < held.length; i++) {
      if (held[i].fam) used.fams[held[i].fam] = true;
      if (held[i].tier === -1) used.basics++;
    }
    for (i = held.length; i < 3; i++) held.push(drawSlot(used));
    if (attempt === 1) break;
    held.sort(function (a, b) { return b.value - a.value; });
    var fl = TH[Math.min(attempt - 1, TH.length - 1)];
    held = held.filter(function (x) { return x.value >= fl; });
  }
  return held;
}

// ---- score shape, subrank's -------------------------------------------------
var floorD = B.traitDamage({ crit: 61, spec: 61 }, PROF);
var mids = D.SPECIALS.map(function (s) { return VAL[s.id][1]; }).sort(function (a, b) { return b - a; });
var anchor = mids[0] + mids[1] + mids[2] + B.traitDamage({ crit: 110, spec: 110 }, PROF);
var span = anchor - floorD;

// ---- one population per pair ------------------------------------------------
var ASC = LADDER.slice().reverse();
var cuts = ASC.map(function (r) { return r[1] === -Infinity ? 0 : r[1]; });
var hit = {}, ex = {};
PAIRS.forEach(function (p) {
  hit[p] = new Float64Array(ASC.length);
  ex[p] = new Array(ASC.length);
  var traitD = B.traitDamage({ crit: p, spec: p }, PROF);
  for (var i = 0; i < K; i++) {
    var held = rollLines(), lines = 0, j;
    for (j = 0; j < held.length; j++) lines += held[j].value;
    var sc = 100 * (traitD + lines - floorD) / span;
    for (var k = 0; k < ASC.length; k++) {
      if (sc < cuts[k] && k !== 0) continue;
      hit[p][k]++;
      if (!ex[p][k] && (sc < cuts[k] + 0.8 || k === 0)) {
        ex[p][k] = held.filter(function (x) { return x.fam && x.tier >= 0; })
          .map(function (x) { return { name: SHORT[x.fam] || ("f" + x.fam), id: x.fam,
            tier: x.tier === 2 ? "LEG" : x.tier === 1 ? "epic" : "blue" }; });
      }
    }
  }
});

// ---- rung per band: cheapest even pair --------------------------------------
var minPair = 60;
var rungs = ASC.map(function (r, k) {
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
var doc = JSON.parse(fs.readFileSync("data/rows-dps.json", "utf8"));
var kept = doc.rows.filter(function (r) { return r.series !== "bracelet"; });
var rows = [], hits = {}, prevCut = 0, prevRank = "F";
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
  rows.push({
    series: "bracelet",
    label: prevRank + " → " + r.rank,
    from: prevRank, to: r.rank,
    gold: gold,
    damage: Number(((r.cut - prevCut) * span / 100).toFixed(5)),
    total: total,
    hit: { stats: p + "/" + p, lines: lines },
    minimum: p + "/" + p + " crit/spec with " + (lineTxt || "no scoring line"),
    mats: [
      ["cut " + p + "/" + p + " bracelets", nDisp, n * P.listed(p, p)],
      ["pheons", 20 * nDisp, n * P.PHEONS_PER_BRACELET * P.PHEON_GOLD]
    ],
    buy: p + "/" + p + " crit/spec unrolled bracelets, about " +
      Math.round(P.listed(p, p)).toLocaleString() + " each",
    odds: "1 in " + nDisp.toLocaleString() + " rolled " + p + "/" + p +
      " bracelets reaches " + r.rank,
    totalDamage: Number((floorD + r.cut * span / 100).toFixed(4))
  });
  prevGold = total; prevCut = r.cut; prevRank = r.rank;
}

// Shizu (2026-08-18): the ladder starts at C+ — fold the pocket-change
// steps below it into one entry row that carries their gold.
var folded = [], accG = 0, accD = 0, entered = false;
rows.forEach(function (r) {
  if (entered) { folded.push(r); return; }
  accG += r.gold; accD += r.damage;
  if (r.to === "C+") {
    entered = true;
    folded.push(Object.assign({}, r, { from: "F", gold: accG,
      damage: Number(accD.toFixed(5)) }));
  }
});
rows = entered ? folded : rows;
doc.rows = kept.concat(rows);
fs.writeFileSync("data/rows-dps.json", JSON.stringify(doc, null, 1));
fs.writeFileSync("data/bracelet-hits-dps.json", JSON.stringify(hits, null, 1));
// per-family line damages and the pure crit-rate reference, for the hover's
// "worth about N crit lines" summaries
var critEq = { critRef: VAL[31], fams: {} };
Object.keys(VAL).forEach(function (id) { critEq.fams[id] = VAL[id]; });
fs.writeFileSync("data/bracelet-crit-eq.json", JSON.stringify(critEq, null, 1));

console.log(K.toLocaleString() + " rolls per pair   floor " + floorD.toFixed(4) +
  "   anchor " + anchor.toFixed(4) + "   span " + span.toFixed(4) + "\n");
console.log("rung".padEnd(10) + "pair".padStart(9) + "odds 1 in".padStart(11) +
  "step gold".padStart(12) + "damage".padStart(9) + "  lines");
rows.forEach(function (r) {
  console.log(r.label.padEnd(10) + r.hit.stats.padStart(9) +
    String(r.mats[0][1]).padStart(11) + Math.round(r.gold).toLocaleString().padStart(12) +
    r.damage.toFixed(3).padStart(9) + "  " +
    r.hit.lines.map(function (l) { return l.name + " " + l.tier; }).join(", "));
});
console.log("\nwrote data/rows-dps.json (bracelet series), bracelet-hits-dps.json");
