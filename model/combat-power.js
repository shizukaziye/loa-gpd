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

  // ---- the anchors ---------------------------------------------------------
  // DPS: Paroxysmal, raid loadout, 2026-08-19. score 7,895.29 and the profile
  // shows the DPS score raw — the x1.9964 profile scaling is a support-only
  // convention. Grid-gem rates fit exactly per effect: Attack Power 3.32,
  // Additional Damage 5.833, Boss Damage 8.327 bp/level; cores carry 16 bp
  // per point, so the swap uses the point delta and the grade bases cancel.
  var ANCHOR_DPS = {
    score: 7895.29,
    profileCp: 7895.29,
    baseAttack: { value: 621542.15, weaponPower: 263613, mainStat: 805775 },
    battleStatTotal: 2592,   // crit+spec+swift -> 3 bp/pt on DPS
    statBp: 3,
    karmaRank: 6,
    gems: { perGem: 704, count: 11, level: 10 },
    arkgrid: {
      corePointsTotal: 115,  // 18+18+20+20+20+19
      coreRate: 16,
      nodeRates: { atk: 3.32, add: 5.833, boss: 8.327 },
      nodeLevels: { atk: 50, add: 60, boss: 55 }
    }
  };
  // Support: Limerent, raid loadout, 2026-08-17.
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

  function estimateDps(s) {
    var A2 = ANCHOR_DPS, parts = {}, prod = 1;
    var aBase = Math.sqrt(A2.baseAttack.weaponPower * A2.baseAttack.mainStat);
    var sBase = Math.sqrt((s.weaponPower || A2.baseAttack.weaponPower) *
                          (s.mainStat || A2.baseAttack.mainStat));
    parts.baseAttack = sBase / aBase;
    prod *= parts.baseAttack;

    parts.battleStats = mult(A2.statBp * (s.battleStatTotal || A2.battleStatTotal)) /
                        mult(A2.statBp * A2.battleStatTotal);
    prod *= parts.battleStats;

    var gl = s.gemLevel || A2.gems.level;
    parts.gems = mult(A2.gems.perGem * gl / A2.gems.level * A2.gems.count) /
                 mult(A2.gems.perGem * A2.gems.count);
    prod *= parts.gems;

    // cores swap on the point delta (16 bp/pt, grade bases cancel); grid gems
    // on per-effect level deltas at the fitted rates
    var pts = s.corePoints ? s.corePoints.reduce(function (a, b) { return a + b; }, 0)
                           : A2.arkgrid.corePointsTotal;
    var coreBp = A2.arkgrid.coreRate * (pts - A2.arkgrid.corePointsTotal);
    var nl = s.nodeLevels || null;   // {atk, add, boss} or a plain total
    var gemBp = 0;
    if (nl != null) {
      var R = A2.arkgrid.nodeRates, L = A2.arkgrid.nodeLevels;
      if (typeof nl === "number") {
        var aTot = L.atk + L.add + L.boss;
        var avgR = (R.atk + R.add + R.boss) / 3;
        gemBp = avgR * (nl - aTot);
      } else {
        gemBp = R.atk * ((nl.atk || 0) - L.atk) + R.add * ((nl.add || 0) - L.add) +
                R.boss * ((nl.boss || 0) - L.boss);
      }
    }
    parts.arkgrid = mult(coreBp + gemBp);
    prod *= parts.arkgrid;

    var score = A2.score * prod;
    return { score: score, profileCp: score, parts: parts };
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

  return { ANCHOR: ANCHOR, ANCHOR_DPS: ANCHOR_DPS, estimate: estimate,
    estimateDps: estimateDps, coreBp: coreBp };
});
