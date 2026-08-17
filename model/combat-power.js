/**
 * combat-power.js — estimate the in-game Combat Power of the build the chart
 * assembles at a slider position. Support axis only for now.
 *
 * Method (docs/research/combat-power-model.md): lostark.bible's battlePoint
 * parts are basis-point multipliers that compound, category by category, the
 * way the site's own breakdown panel multiplies them. The game's score also
 * carries the skill/tripod block those parts do not cover, so this is an
 * ANCHOR-SWAP estimator: start from a real support's raid score, divide out
 * the anchor's multiplier for each system the chart moves, multiply in the
 * multiplier implied by the chart's settings, and keep everything else (the
 * skill block, elixirs, cards, paradise) riding the anchor.
 *
 *   CP(settings) = anchor.score * PROD (1 + bp_set/1e4) / (1 + bp_anchor/1e4)
 *
 * The anchor is Shizu's bard Limerent, raid loadout, score 3205.08, parts
 * pulled 2026-08-17 (docs/research/cp-fit-limerent.json). Display scales the
 * loadout score to the profile figure via the anchor's own profile/loadout
 * ratio, so the card reads like the number players see.
 *
 * Fitted curves (six-character fit set, exact where stated):
 *   battle stats      4.0 bp per point of crit+spec+swift (support, exact)
 *   arkgrid gems      5.0 bp per summed effect level (support ids, exact)
 *   arkgrid cores     16 bp per core point + grade base (ancient ~480,
 *                     relic ~80, legendary ~-20; fits 9 of 12 observed cores
 *                     to within 1, the rest are other grades)
 *   karma evolution   60 bp per rank
 *   level             476 bp at 70 (constant here)
 * Documented assumptions (thin data, flagged in the tooltip):
 *   skill gems        750 bp per gem at level 10, scaled linearly by level
 *   base attack       type-1 value scales with sqrt(weaponPower x mainStat);
 *                     the anchor's 1.24 dressing factor rides along
 *   accessories/stone hold the anchor's rows (the chart's accessory steps are
 *                     small in bp and the per-line table is only half mapped)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CombatPower = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- the anchor: Limerent, raid loadout, 2026-08-17 ----------------------
  var ANCHOR = {
    score: 3205.08,          // combatPower {id:2} on the raid loadout
    profileCp: 6398.63,      // the header figure the profile shows
    // the parts this estimator swaps, as (1 + bp/1e4) multipliers
    baseAttack: { value: 235903.86, weaponPower: 267033, mainStat: 738326 },
    battleStatTotal: 2466,   // crit+spec+swift -> 4 bp/pt
    karmaRank: 6,            // 360 bp
    gems: { perGem: 750, count: 11, level: 10 },
    arkgrid: {
      // six cores: ancient, points from the pull; 16 bp/pt + base 480
      corePoints: [18, 18, 17, 20, 20, 18],
      coreBase: 480, coreRate: 16,
      nodeLevels: 138        // ally atk 22 + brand 53 + ally dmg 63 -> 5 bp/lvl
    }
  };

  function mult(bp) { return 1 + bp / 1e4; }

  function coreBp(points) { return ANCHOR.arkgrid.coreBase + ANCHOR.arkgrid.coreRate * points; }

  function arkgridBp(corePoints, nodeLevels) {
    var bp = 0;
    (corePoints || []).forEach(function (p) { bp += coreBp(p); });
    return { cores: bp, gems: 5 * (nodeLevels || 0) };
  }

  /**
   * settings = {
   *   weaponPower, mainStat,          // from the gear model at the plan's honing
   *   battleStatTotal,                // support stat line, e.g. 94+68 spec/swift + base
   *   karmaRank,                      // 1..6
   *   gemLevel,                       // the plan's skill-gem level (7..10)
   *   corePoints: [..6],  nodeLevels  // the ark grid tier account's display
   * }
   * Returns { score, profileCp, parts: {...} } — parts carry each swap's
   * ratio so the tooltip can show what moved.
   */
  function estimate(s) {
    var parts = {}, prod = 1;

    // base attack: value scales with sqrt(WP x MS); the dressing factor rides
    var aBase = Math.sqrt(ANCHOR.baseAttack.weaponPower * ANCHOR.baseAttack.mainStat);
    var sBase = Math.sqrt((s.weaponPower || ANCHOR.baseAttack.weaponPower) *
                          (s.mainStat || ANCHOR.baseAttack.mainStat));
    parts.baseAttack = sBase / aBase;
    prod *= parts.baseAttack;

    parts.battleStats = mult(4 * (s.battleStatTotal || ANCHOR.battleStatTotal)) /
                        mult(4 * ANCHOR.battleStatTotal);
    prod *= parts.battleStats;

    parts.karma = mult(60 * (s.karmaRank || ANCHOR.karmaRank)) / mult(60 * ANCHOR.karmaRank);
    prod *= parts.karma;

    var gl = s.gemLevel || ANCHOR.gems.level;
    parts.gems = mult(ANCHOR.gems.perGem * gl / ANCHOR.gems.level * ANCHOR.gems.count) /
                 mult(ANCHOR.gems.perGem * ANCHOR.gems.count);
    prod *= parts.gems;

    var aAg = arkgridBp(ANCHOR.arkgrid.corePoints, ANCHOR.arkgrid.nodeLevels);
    var sAg = arkgridBp(s.corePoints || ANCHOR.arkgrid.corePoints,
                        s.nodeLevels != null ? s.nodeLevels : ANCHOR.arkgrid.nodeLevels);
    parts.arkgridCores = mult(sAg.cores) / mult(aAg.cores);
    parts.arkgridGems = mult(sAg.gems) / mult(aAg.gems);
    prod *= parts.arkgridCores * parts.arkgridGems;

    var score = ANCHOR.score * prod;
    return {
      score: score,
      profileCp: score * (ANCHOR.profileCp / ANCHOR.score),
      parts: parts
    };
  }

  return { ANCHOR: ANCHOR, estimate: estimate, coreBp: coreBp };
});
