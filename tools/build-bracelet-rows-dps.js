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

var K = parseInt(process.argv[2], 10) || 400000;
var PAIRS = [60, 70, 80, 90, 100, 110, 120];
var S = require("../../loa-bracelet-calc/subrank.js");

// THE SCORER IS THE CALCULATOR'S OWN (Shizu, 2026-08-19: "my main
// paroxysmal has a 15.23% bracelet at B+ which is right"). The old build
// hand-rolled floor/anchor/span and consumed lineDamage raw; its scores ran
// ~25% hot and the ladder letters with them. Everything below prices through
// subrank.braceletScore / Bracelet.jointScore exactly the way the
// calculator's leaderboard does: traits as an object, effect lines through
// the joint pool, anchors read off braceletScore once and never re-derived.
var LADDER = S.bandsFor().map(function (b) { return [b.key, b.min]; });

// short chip names, sized for one row of three on a 215px card
var SHORT = { 1: "atk/move", 2: "outgoing", 3: "stagger", 4: "atk power", 5: "wp",
  6: "crit rate", 7: "crit dmg", 8: "specialty", 9: "swiftness", 10: "domination",
  11: "crit rate", 12: "crit dmg", 13: "dmg+stag", 14: "dmg+ident", 15: "cd→dmg",
  16: "def shred", 17: "crit shred", 18: "shield dmg", 19: "cdmg shred",
  20: "wp x6", 21: "wp", 22: "wp x30", 23: "atk on hit", 24: "dmg to full",
  25: "back atk", 26: "front atk", 27: "non-dir", 28: "dmg to low",
  29: "ally atk", 30: "ally dmg", 31: "atk when hit", 32: "shield self", 33: "wp flat" };

// ---- authority anchors + per-pair marginal tables ---------------------------
// One braceletScore call fixes floor/span; per-pair line values are jointScore
// marginals AT that trait pair (the joint pool prices crit lines against the
// crit trait, so a value table is only honest per pair). Candidate scores are
// the table SUM — line-vs-line pooling (two crit families on one bracelet) is
// the one approximation left, worth well under a band.
function traitsOf(p) { return { crit: p, spec: p }; }
var anchorsProbe = S.braceletScore({ grade: "ancient", lines: [], traits: traitsOf(61) });
var floorD = anchorsProbe.floor, span = anchorsProbe.perfect - anchorsProbe.floor;

var TIERS = ["low", "mid", "high"];
var TABLES = {};
PAIRS.forEach(function (p) {
  var tr = traitsOf(p);
  var base = B.jointScore([], tr, "ancient", null);
  var VAL = {}, WEIGHT = {};
  D.SPECIALS.forEach(function (sp) {
    VAL[sp.id] = TIERS.map(function (t) {
      try {
        return B.jointScore([{ cat: "special", family: sp.id, tier: t }], tr, "ancient", null) - base;
      } catch (e) { return 0; }
    });
    WEIGHT[sp.id] = TIERS.map(function (t) { return sp.granted[t]; });
  });
  var bMin = B.jointScore([{ cat: "basic", family: "mainStat", value: 9600 }], tr, "ancient", null) - base;
  var bMax = B.jointScore([{ cat: "basic", family: "mainStat", value: 16000 }], tr, "ancient", null) - base;
  TABLES[p] = { base: base, VAL: VAL, WEIGHT: WEIGHT, basicMin: bMin, basicSpan: bMax - bMin };
});
var VAL = TABLES[100].VAL;   // reference tables for crit-eq and chip display

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
function drawSlot(used, T) {
  var canBasic = used.basics < 2;
  if (canBasic && rand() * 65 < 35) {
    used.basics++;
    if (rand() < 0.5) return { value: 0, fam: 0, tier: -1 };          // vitality
    var b = BASIC_BANDS[pick(BASIC_BANDS.map(function (x) { return x[0]; }))];
    var v = b[1] + Math.floor(rand() * (b[2] - b[1] + 1));
    return { value: T.basicMin + T.basicSpan * ((v - 9600) / 6400), fam: 0, tier: -1 };
  }
  var pool = [], w = [];
  D.SPECIALS.forEach(function (sp) {
    if (used.fams[sp.id]) return;
    for (var t = 0; t < 3; t++) { pool.push([sp.id, t]); w.push(T.WEIGHT[sp.id][t]); }
  });
  var hit = pool[pick(w)];
  used.fams[hit[0]] = true;
  return { value: T.VAL[hit[0]][hit[1]], fam: hit[0], tier: hit[1] };
}

// lock thresholds V(n) = E[max(X, V(n-1))] over the slot distribution, per pair
function lockThresholds(T) {
  var draws = [];
  for (var i0 = 0; i0 < 200000; i0++) draws.push(drawSlot({ basics: 0, fams: {} }, T).value);
  var TH = [0];
  for (var n0 = 1; n0 <= 7; n0++) {
    var sum = 0;
    for (var j0 = 0; j0 < draws.length; j0++) sum += Math.max(draws[j0], TH[n0 - 1]);
    TH.push(sum / draws.length);
  }
  return TH;
}

/** The granted-slot game, stats already fixed. */
function rollLines(T, TH) {
  var held = [], i;
  for (var attempt = 7; attempt >= 1; attempt--) {
    var used = { basics: 0, fams: {} };
    for (i = 0; i < held.length; i++) {
      if (held[i].fam) used.fams[held[i].fam] = true;
      if (held[i].tier === -1) used.basics++;
    }
    for (i = held.length; i < 3; i++) held.push(drawSlot(used, T));
    if (attempt === 1) break;
    held.sort(function (a, b) { return b.value - a.value; });
    var fl = TH[Math.min(attempt - 1, TH.length - 1)];
    held = held.filter(function (x) { return x.value >= fl; });
  }
  return held;
}

// ---- one population per pair ------------------------------------------------
var ASC = LADDER.slice().reverse();
var cuts = ASC.map(function (r) { return r[1] === -Infinity || r[1] == null ? 0 : r[1]; });
var hit = {}, ex = {}, winSum = {}, winN = {};
PAIRS.forEach(function (p) {
  hit[p] = new Float64Array(ASC.length);
  winSum[p] = new Float64Array(ASC.length);
  winN[p] = new Float64Array(ASC.length);
  ex[p] = new Array(ASC.length);
  var T = TABLES[p], TH = lockThresholds(T);
  for (var i = 0; i < K; i++) {
    var held = rollLines(T, TH), lines = 0, j;
    for (j = 0; j < held.length; j++) lines += held[j].value;
    var total = T.base + lines;
    var sc = 100 * (total - floorD) / span;
    var band = 0;
    for (var k = 0; k < ASC.length; k++) {
      if (sc < cuts[k] && k !== 0) continue;
      hit[p][k]++;
      band = k;
      // examples must be FULLY displayable: a value-carrying basic line
      // earns score invisibly and the shown lines then under-verify
      var hiddenBasic = held.some(function (x) { return x.tier === -1 && x.value > 0; });
      if (!ex[p][k] && !hiddenBasic && (sc < cuts[k] + 0.8 || k === 0)) {
        ex[p][k] = held.filter(function (x) { return x.fam && x.tier >= 0; })
          .map(function (x) { return { name: SHORT[x.fam] || ("f" + x.fam), id: x.fam,
            tier: x.tier === 2 ? "LEG" : x.tier === 1 ? "epic" : "blue" }; });
      }
    }
    // band-window damage: the mean whole-bracelet damage of members WHOSE
    // band this is — the rung's honest damage, no linearisation
    winSum[p][band] += total; winN[p][band]++;
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
var prevDmg = floorD;
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
  var bandDmg = winN[p][k2] ? winSum[p][k2] / winN[p][k2] : (floorD + r.cut * span / 100);
  rows.push({
    series: "bracelet",
    label: prevRank + " → " + r.rank,
    from: prevRank, to: r.rank,
    gold: gold,
    damage: Number(Math.max(0.001, bandDmg - prevDmg).toFixed(5)),
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
    totalDamage: Number(bandDmg.toFixed(4))
  });
  prevGold = total; prevCut = r.cut; prevRank = r.rank; prevDmg = bandDmg;
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
  "   perfect " + anchorsProbe.perfect.toFixed(4) + "   span " + span.toFixed(4) + "\n");
console.log("rung".padEnd(10) + "pair".padStart(9) + "odds 1 in".padStart(11) +
  "step gold".padStart(12) + "damage".padStart(9) + "  lines");
rows.forEach(function (r) {
  console.log(r.label.padEnd(10) + r.hit.stats.padStart(9) +
    String(r.mats[0][1]).padStart(11) + Math.round(r.gold).toLocaleString().padStart(12) +
    r.damage.toFixed(3).padStart(9) + "  " +
    r.hit.lines.map(function (l) { return l.name + " " + l.tier; }).join(", "));
});
console.log("\nwrote data/rows-dps.json (bracelet series), bracelet-hits-dps.json");
