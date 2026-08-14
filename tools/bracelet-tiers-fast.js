/**
 * The same support-bracelet simulation as tools/bracelet-tiers.js, built to run
 * at a hundred million. Two changes, no model changes:
 *   - the (family, tier) draw table is built once and sampled through a flat
 *     lookup, with rejection for the handful of families already held, instead
 *     of rebuilding a 99-entry pool per draw
 *   - scores go into a histogram rather than an array, so memory is flat
 * Verified against the readable version at 1M on the same seed.
 *
 *   node --max-old-space-size=4096 tools/bracelet-tiers-fast.js [count]
 */
"use strict";
var B = require("../model/bracelet.js");

var LADDER = [["S+",100.1],["S",95],["S-",90],["A+",85],["A",80],["A-",75],
  ["B+",70],["B",65],["B-",60],["C+",55],["C",50],["C-",45],["D+",40],["D",35],
  ["D-",30],["F+",20],["F",10],["F-",-Infinity]];

// ---- draw tables, built once ------------------------------------------------
var famOf = [], valOf = [], labelOf = [], cum = [], total = 0;
for (var f = 1; f <= 33; f++) {
  var w = f <= 10 ? [4.2, 2.1, 0.7] : f <= 22 ? [0.5, 0.25, 0.08333] : [1.0909, 0.5455, 0.1818];
  for (var t = 0; t < 3; t++) {
    var line = B.SUPPORT_LINE[f];
    famOf.push(f);
    valOf.push(line ? line[t] : 0);
    labelOf.push(line ? "f" + f + ["blue", "epic", "LEG"][t] : "");
    total += w[t];
    cum.push(total);
  }
}
var LOOKUP = new Int32Array(200000);
for (var i = 0, k = 0; i < LOOKUP.length; i++) {
  var x = (i + 0.5) / LOOKUP.length * total;
  while (k < cum.length - 1 && cum[k] < x) k++;
  LOOKUP[i] = k;
}
var BASIC_CUM = [10, 26, 42, 58, 68, 78, 88, 92, 96, 100];
var BASIC_LO = [9600,10241,10881,11521,12161,12801,13441,14081,14721,15361];
var BASIC_HI = [10240,10880,11520,12160,12800,13440,14080,14720,15360,16000];

function m32(s){var a=s>>>0;return function(){a=(a+0x6D2B79F5)|0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

var N = Number(process.argv[2] || 1000000);
var rand = m32(20260813);
var TH = B.lockThresholds(rand, 7, 200000);
var REF = B.reference();

// slot state, reused so the hot loop allocates nothing
var hv = new Float64Array(3), hf = new Int32Array(3), hb = new Uint8Array(3), hl = [];
var BINS = 40000, BIN = 0.01;                 // score 0..400 at 0.01
var hist = new Float64Array(BINS);
var best = [];

for (var n = 0; n < N; n++) {
  var spec = 60 + (rand() * 61) | 0, swift = 60 + (rand() * 61) | 0;
  var held = 0;
  for (var attempt = 7; attempt >= 1; attempt--) {
    while (held < 3) {
      var basics = 0, j;
      for (j = 0; j < held; j++) if (hb[j]) basics++;
      var isBasic = basics < 2 && rand() * 65 < 35;
      if (isBasic) {
        hb[held] = 1; hf[held] = 0;
        if (rand() < 0.5) { hv[held] = 0; hl[held] = ""; }
        else {
          var r = rand() * 100, bi = 0;
          while (bi < 9 && BASIC_CUM[bi] < r) bi++;
          var v = BASIC_LO[bi] + ((rand() * (BASIC_HI[bi] - BASIC_LO[bi] + 1)) | 0);
          hv[held] = 0.176 + 0.116 * ((v - 9600) / 6400);
          hl[held] = "mainstat";
        }
      } else {
        var idx, fam, tries = 0;
        do {
          idx = LOOKUP[(rand() * 200000) | 0];
          fam = famOf[idx];
          var dup = false;
          for (j = 0; j < held; j++) if (hf[j] === fam) { dup = true; break; }
        } while (dup && ++tries < 40);
        hb[held] = 0; hf[held] = fam; hv[held] = valOf[idx]; hl[held] = labelOf[idx];
      }
      held++;
    }
    if (attempt === 1) break;
    // sort the three by value, then drop anything under the lock floor
    for (var a = 0; a < 3; a++) for (var b2 = a + 1; b2 < 3; b2++) {
      if (hv[b2] > hv[a]) {
        var tv=hv[a];hv[a]=hv[b2];hv[b2]=tv; var tf=hf[a];hf[a]=hf[b2];hf[b2]=tf;
        var tb=hb[a];hb[a]=hb[b2];hb[b2]=tb; var tl=hl[a];hl[a]=hl[b2];hl[b2]=tl;
      }
    }
    var floor = TH[attempt - 1 < TH.length ? attempt - 1 : TH.length - 1];
    held = 0;
    while (held < 3 && hv[held] >= floor) held++;
  }
  var d = (spec + swift) * B.TRAIT_PER_POINT + hv[0] + hv[1] + hv[2];
  var score = 100 * d / REF;
  var bin = (score / BIN) | 0;
  hist[bin < BINS ? bin : BINS - 1] += 1;
  if (score >= 95) {
    best.push({ s: score, spec: spec, swift: swift,
      l: [hl[0], hl[1], hl[2]].filter(function (x) { return x && x !== "mainstat"; }).join(" + ") });
    if (best.length > 4000) { best.sort(function (p, q) { return q.s - p.s; }); best.length = 2000; }
  }
}

console.log(N.toLocaleString() + " support bracelets, 7 attempts, seed 20260813");
console.log("anchor 100 = " + REF.toFixed(3) + " damage (110/110 + f17/f19/f16 epic)\n");
console.log("rank | opens | count        | share      | at or above");
var above = 0, out = [];
for (var r = 0; r < LADDER.length; r++) {
  var min = LADDER[r][1], max = r > 0 ? LADDER[r - 1][1] : Infinity;
  var c = 0;
  for (var bi2 = Math.max(0, Math.ceil(min / BIN)); bi2 < Math.min(BINS, Math.ceil(max / BIN)); bi2++) c += hist[bi2];
  above += c;
  out.push([LADDER[r][0], min, c, above]);
}
out.forEach(function (row) {
  console.log(row[0].padEnd(4) + " | " + String(row[1] === -Infinity ? "  -" : row[1]).padStart(5) + " | " +
    String(row[2]).padStart(12) + " | " + (100 * row[2] / N).toFixed(4).padStart(9) + "% | " +
    (100 * row[3] / N).toFixed(5).padStart(10) + "%");
});
best.sort(function (p, q) { return q.s - p.s; });
console.log("\nbest rolled:");
best.slice(0, 5).forEach(function (x) {
  console.log("  " + x.s.toFixed(1).padStart(6) + "  " + (x.spec + "/" + x.swift).padStart(7) + "  " + x.l);
});
