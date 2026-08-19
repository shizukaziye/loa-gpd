/**
 * verify-bracelet-bands.js — every DPS bracelet rung example, re-scored
 * EXACTLY through the calculator's braceletScore (full lines + traits, no
 * table-sum approximation). A rung whose example lands in a different band
 * than its letter is a defect. Run after build-bracelet-rows-dps.js.
 */
"use strict";
var fs = require("fs");
var S = require("../../loa-bracelet-calc/subrank.js");

var TIER_TO = { blue: "low", epic: "mid", LEG: "high" };
var doc = JSON.parse(fs.readFileSync("data/rows-dps.json", "utf8"));
var rows = doc.rows.filter(function (r) { return r.series === "bracelet"; });

var bad = 0;
rows.forEach(function (r) {
  if (!r.hit || !r.hit.stats) return;
  var pair = +String(r.hit.stats).split("/")[0];
  var lines = (r.hit.lines || []).map(function (l) {
    return { cat: "special", family: l.id, tier: TIER_TO[l.tier] || "low" };
  });
  var sc = S.braceletScore({ grade: "ancient", lines: lines,
    traits: { crit: pair, spec: pair } });
  var ok = sc.band.key === r.to;
  if (!ok) bad++;
  console.log((r.from + " -> " + r.to).padEnd(12) +
    ("example " + r.hit.stats).padEnd(18) +
    "exact score " + sc.score.toFixed(1).padStart(6) +
    "  band " + sc.band.key.padEnd(3) +
    (ok ? "  OK" : "  MISMATCH") +
    "  dmg " + sc.damagePct.toFixed(2) + "%");
});
console.log(bad ? "\n" + bad + " rung(s) mismatch" : "\nall rungs verified against braceletScore");
process.exit(bad ? 1 : 0);
