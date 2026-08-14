/**
 * The accessory ladder: the cheapest configuration at every damage level.
 *
 * Prices come from the accessory calculator (data/accessory-configs.json, one
 * row per line set x main-stat quintile). Damage is recomputed here on this
 * tool's reference character so it sits on the same scale as every other row.
 *
 * The ladder is the efficient frontier — sort by damage, keep a config only if
 * nothing cheaper is also better. That is what makes "high/low" or "mid/mid" or
 * a reversed pair appear or not: the market decides, not a naming convention.
 */
"use strict";
var S = require("../model/support.js"), G = require("../model/gear.js");
var honing = require("../data/honing-t4upper.json");
var configs = require("../data/accessory-configs.json");

var P = S.DEFAULTS, gear = G.stats(honing, {}, 25, 25);
var base = S.contribution(P, gear, {});
var RAW = {
  "Stigma %": [2.15, 4.8, 8], "Gauge Gain %": [1.6, 3.6, 6],
  "Ally Dmg Buff %": [2, 4.5, 7.5], "Ally Atk Buff %": [1.35, 3, 5],
  "Weapon Attack Power %": [0.8, 1.8, 3.0]
};
var FLAT_WP = { low: 195, mid: 480, high: 960 };
var PRIMS = { neck: ["Stigma %", "Gauge Gain %"], earring: ["Weapon Attack Power %"],
              ring: ["Ally Dmg Buff %", "Ally Atk Buff %"] };
var MS_RANGE = { neck: [15178, 17857], earring: [11806, 13889], ring: [10962, 12897] };
var IDX = { low: 0, mid: 1, high: 2 };

/** Party damage of one configuration, on this tool's reference character. */
function damageOf(slot, cfg) {
  var lines = {}, wpFlat = 0, msAdd = cfg.msVal - MS_RANGE[slot][0];
  PRIMS[slot].forEach(function (name, i) {
    var t = cfg.prim[i];
    if (!t) return;
    var v = RAW[name][IDX[t]] / 100;
    if (name === "Stigma %") lines.brand = v;
    else if (name === "Gauge Gain %") lines.gaugeGain = v;
    else if (name === "Ally Dmg Buff %") lines.allyDmg = v;
    else if (name === "Ally Atk Buff %") lines.allyAtkEnh = v;
    else if (name === "Weapon Attack Power %") lines.wpPct = v;
  });
  if (cfg.flat) wpFlat = FLAT_WP[cfg.flat];
  var g = G.stats(honing, {
    braceletWpFlat: wpFlat,
    earringWpPct: 0.03 + (lines.wpPct || 0),
    accessoryMainStat: G.DEFAULTS.accessoryMainStat + msAdd
  }, 25, 25);
  delete lines.wpPct;
  return 100 * Math.log(S.contribution(P, g, lines) / base);
}

function label(slot, cfg) {
  var parts = PRIMS[slot].map(function (n, i) { return cfg.prim[i] || "—"; }).join("/");
  return parts + (cfg.flat ? " + " + cfg.flat + " wpn flat" : "") + ", " + cfg.ms + " main stat";
}

var out = {};
Object.keys(configs).forEach(function (slot) {
  var pts = configs[slot].map(function (c) {
    return { cfg: c, gold: c.gold, damage: damageOf(slot, c), label: label(slot, c) };
  });
  pts.sort(function (a, b) { return a.damage - b.damage || a.gold - b.gold; });
  var frontier = [], bestGold = Infinity;
  for (var i = pts.length - 1; i >= 0; i--) {          // walk down, keep the cheap ones
    if (pts[i].gold < bestGold) { frontier.unshift(pts[i]); bestGold = pts[i].gold; }
  }
  out[slot] = frontier;
  console.log("=== " + slot + " — " + frontier.length + " rungs on the frontier");
  frontier.forEach(function (f, i) {
    var prev = i ? frontier[i - 1] : null;
    console.log("  " + f.damage.toFixed(4) + "%  " + String(Math.round(f.gold)).padStart(9) +
      "g  " + (prev ? "+" + Math.round(f.gold - prev.gold).toLocaleString() + "g for +" +
      (f.damage - prev.damage).toFixed(4) + "%" : "baseline").padEnd(34) + "  " + f.label);
  });
});
require("fs").writeFileSync("data/accessory-ladder.json", JSON.stringify(out, null, 1));
