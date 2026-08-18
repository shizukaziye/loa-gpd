/**
 * combat-power.js — estimate the in-game Combat Power of the build the chart
 * assembles at a slider position. Support axis only for now.
 *
 * Method (docs/research/combat-power-model.md): the law is fit to LIVE
 * in-game profile readings (2026-08-20), not to lostark.bible's breakdown —
 * the bible's battlePoint parts are that site's own reconstruction, useful
 * as relative weights but not the game's internals. Measured on Limerent's
 * raid loadout: 3,781.18 with 6s, 6,354.88 with 10s. The gem set moves the
 * score x1.68066 — gems compound PER PART (x1.04833 per gem), which no sum
 * can produce; the per-gem factor pins the level-10 support gem at 1,269.6
 * bp, so the old "125 bp/level" linearity was the error. Every other system
 * the chart moves is small (<300 bp), where sum-vs-product is a wash; those
 * ride additively over the anchor's non-gem part sum. The profile header IS
 * the loadout score, raw, for every class — the old x1.9964 "support
 * convention" compared two different skill presets (gem presets ride skill
 * presets; the armory crawl had caught a weaker preset at 3,205.08).
 *
 *   CP(settings) = anchor.raidScore * baseAttackRatio * gemFactor(level)
 *                  * (1 + (S0 + dSmall)/1e4) / (1 + S0/1e4)
 *
 * with S0 = the anchor's non-gem part sum, and gemFactor the measured
 * per-gem product curve. Everything the chart does not price (engravings,
 * ark passive, elixirs, cards, skill block) rides the anchor at every
 * budget — no invented development constants.
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
  // DPS: Paroxysmal, raid loadout, 2026-08-19. score 7,895.29; the profile
  // shows the score raw (as it does for every character — the crawl simply
  // caught Paroxysmal in the raid skill state, so no correction is needed). Grid-gem rates fit exactly per effect: Attack Power 3.32,
  // Additional Damage 5.833, Boss Damage 8.327 bp/level; cores carry 16 bp
  // per point, so the swap uses the point delta and the grade bases cancel.
  var ANCHOR_DPS = {
    score: 7895.29,
    profileCp: 7895.29,
    baseAttack: { value: 621542.15, weaponPower: 263613, mainStat: 805775 },
    battleStatTotal: 2592,   // crit+spec+swift -> 3 bp/pt on DPS
    statBp: 3,
    karmaRank: 6,
    // full level 10s, confirmed by Shizu 2026-08-19 -> 704 bp per gem at 10.
    // No second measured level on the DPS curve yet; levels below 10 assume
    // 70.4 bp per level (the support curve came out near-linear, 129.9/lvl
    // against a 125 naive, so linear is a fair stand-in until measured).
    gems: { perGem: 704, count: 11, level: 10 },
    sumBp: 56261,            // every part except base attack/health (record)
    sumBpNonGem: 48517,      // sumBp minus the 11 gem rows (7,744)
    // fitted like the support curve (leaderboard sample: typical 1760 DPS
    // run ~0.835 of Paroxysmal's skill state; 1773 full-10s reads 0.95).
    // Mild 1.03 cap for the 1800+ whales the sample trend points at.
    skillCurve: [[0, 0.835], [87, 1], [100, 1.03]],
    notch: 87,               // Paroxysmal's own budget position (deep whale)
    arkgrid: {
      corePointsTotal: 115,  // 18+18+20+20+20+19
      coreRate: 16,
      nodeRates: { atk: 3.32, add: 5.833, boss: 8.327 },
      nodeLevels: { atk: 50, add: 60, boss: 55 }
    }
  };
  // Support: Limerent, raid loadout, 2026-08-17.
  var ANCHOR = {
    score: 3205.08,          // combatPower {id:2} on the CRAWLED loadout, 6s
    // Live readings on the raid loadout (Shizu, 2026-08-20): 3,781.18 with
    // 6s and 6,354.88 with 10s. The crawl had caught a weaker skill preset
    // (3,205.08); its PARTS remain valid — the skill block is not a part.
    // raidScore anchors the estimate; the profile header shows this number
    // raw (no support display convention — that lore came from comparing
    // two different presets).
    raidScore: 3781.18,      // raid loadout, 6s, live 2026-08-20
    // the parts this estimator swaps, as (1 + bp/1e4) multipliers
    baseAttack: { value: 235903.86, weaponPower: 267033, mainStat: 738326 },
    battleStatTotal: 2466,   // crit+spec+swift -> 4 bp/pt
    karmaRank: 6,            // 360 bp
    // Limerent WEARS level 6 gems (Shizu, 2026-08-19): 750 bp each, and the
    // bible shows +121.56% — so the rate is 125 bp per gem level, and a full
    // 10s set compounds to +265.8%, the figure Shizu quoted from the start.
    // measured game curve, two points: 750 bp at level 6 (crawled rows) and
    // 1,269.6 at level 10 (solved from the live x1.68066 set swap: eleventh
    // root x1.04833 per gem). Levels between ride the line (129.9 bp/level).
    gems: { count: 11, level: 6, bpAt: function (L) { return 750 + 129.9 * (L - 6); } },
    sumBp: 61142,            // every part except base attack/health (record)
    sumBpNonGem: 52892,      // sumBp minus the 11 gem rows (8,250)
    // the whale ceiling, measured on three named supports (2026-08-20):
    // Zanilia 8,342.85 / Tinyusagi 7,709.62 (fresh crawls, matched Shizu's
    // live quotes) / Bukkâkæ 7,433 live. Beyond the anchor they carry up to
    // +7,500 bp of parts the chart does not price — transcendence (+2,100,
    // Limerent has none) and elixir-class systems (+4,480).
    // settings.whaleFrac ramps that in; 1 = Zanilia-grade parts.
    whale: { bpCap: 7500 },
    // the skill curve: everything the parts do NOT carry (tripods, runes,
    // skill levels) as a multiplier vs the anchor's own state, fitted to a
    // 26-character leaderboard sample + the three whales (docs/research/
    // cp-fit-population.json). Piecewise-linear in the budget notch; 1.0 at
    // the anchor's own position by construction.
    skillCurve: [[0, 0.885], [47, 1], [100, 1.0923]],
    notch: 47,               // the anchor's budget position (~2.2M/1%)
    arkgrid: {
      // six cores: ancient, points from the pull; 16 bp/pt + base 480
      corePoints: [18, 18, 17, 20, 20, 18],
      coreBase: 480, coreRate: 16,
      nodeLevels: 138        // ally atk 22 + brand 53 + ally dmg 63 -> 5 bp/lvl
    }
  };

  function mult(bp) { return 1 + bp / 1e4; }

  // piecewise-linear skill multiplier at budget notch v (0..100)
  function skillAt(curve, v) {
    if (v <= curve[0][0]) return curve[0][1];
    for (var i = 1; i < curve.length; i++) {
      if (v <= curve[i][0]) {
        var f = (v - curve[i - 1][0]) / (curve[i][0] - curve[i - 1][0]);
        return curve[i - 1][1] + f * (curve[i][1] - curve[i - 1][1]);
      }
    }
    return curve[curve.length - 1][1];
  }

  function coreBp(points) { return ANCHOR.arkgrid.coreBase + ANCHOR.arkgrid.coreRate * points; }

  function arkgridBp(corePoints, nodeLevels) {
    var bp = 0;
    (corePoints || []).forEach(function (p) { bp += coreBp(p); });
    return { cores: bp, gems: 5 * (nodeLevels || 0) };
  }

  // THE ADDITIVE LAW (settled 2026-08-19 on Limerent's own gem swap): the
  // score scales with the SUM of every part's basis points -- score =
  // K x (1 + sumBp/1e4) -- not their product. Her 10s era read "6k+" and
  // dropping to 6s (-5,500 bp of 61,142) barely moved the profile, which
  // only the sum explains; the per-part product predicted ~3.9k. The bible
  // panel's +121.56%/+265.8% figures are the display product, a different
  // quantity. Swaps therefore ADD bp deltas to the anchor's measured sum.
  function estimateDps(s) {
    var A2 = ANCHOR_DPS, parts = {}, dBp = 0;
    var aBase = Math.sqrt(A2.baseAttack.weaponPower * A2.baseAttack.mainStat);
    var sBase = Math.sqrt((s.weaponPower || A2.baseAttack.weaponPower) *
                          (s.mainStat || A2.baseAttack.mainStat));
    parts.baseAttack = sBase / aBase;

    parts.battleStatsBp = A2.statBp * ((s.battleStatTotal || A2.battleStatTotal) - A2.battleStatTotal);
    dBp += parts.battleStatsBp;

    // gems compound per part: each of the 11 gems is its own factor
    var gl = s.gemLevel || A2.gems.level;
    var bpSet = A2.gems.perGem * gl / A2.gems.level;
    parts.gemFactor = Math.pow((1 + bpSet / 1e4) / (1 + A2.gems.perGem / 1e4), A2.gems.count);

    parts.arkgridBp = 0;
    if (s.corePoints && s.corePoints.length === 6) {
      var pts = s.corePoints.reduce(function (a, b) { return a + b; }, 0);
      parts.arkgridBp += A2.arkgrid.coreRate * (pts - A2.arkgrid.corePointsTotal);
    }
    var nl = s.nodeLevels || null;
    if (nl != null) {
      var R = A2.arkgrid.nodeRates, L = A2.arkgrid.nodeLevels;
      var prs = typeof nl === "number"
        ? [["atk", nl / 3], ["add", nl / 3], ["boss", nl / 3]]
        : [["atk", nl.atk || 0], ["add", nl.add || 0], ["boss", nl.boss || 0]];
      prs.forEach(function (pr) {
        parts.arkgridBp += R[pr[0]] * (pr[1] - L[pr[0]]);
      });
    }
    dBp += parts.arkgridBp;

    parts.skill = skillAt(A2.skillCurve, s.notch != null ? s.notch : A2.notch);

    var score = A2.score * parts.baseAttack * parts.gemFactor * parts.skill *
      (1 + (A2.sumBpNonGem + dBp) / 1e4) / (1 + A2.sumBpNonGem / 1e4);
    return { score: score, profileCp: score, parts: parts, dBp: dBp };
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
    var parts = {}, dBp = 0;

    var aBase = Math.sqrt(ANCHOR.baseAttack.weaponPower * ANCHOR.baseAttack.mainStat);
    var sBase = Math.sqrt((s.weaponPower || ANCHOR.baseAttack.weaponPower) *
                          (s.mainStat || ANCHOR.baseAttack.mainStat));
    parts.baseAttack = sBase / aBase;

    parts.battleStatsBp = 4 * ((s.battleStatTotal || ANCHOR.battleStatTotal) - ANCHOR.battleStatTotal);
    dBp += parts.battleStatsBp;

    parts.karmaBp = 60 * ((s.karmaRank || ANCHOR.karmaRank) - ANCHOR.karmaRank);
    dBp += parts.karmaBp;

    // gems compound per part along the measured curve (750@6 -> 1,269.6@10);
    // by construction gemFactor(10) = 1.68066, the live set-swap ratio
    var gl = s.gemLevel || ANCHOR.gems.level;
    parts.gemFactor = Math.pow(
      (1 + ANCHOR.gems.bpAt(gl) / 1e4) / (1 + ANCHOR.gems.bpAt(ANCHOR.gems.level) / 1e4),
      ANCHOR.gems.count);

    var aCores = ANCHOR.arkgrid.corePoints, sCores = s.corePoints || aCores;
    parts.arkgridBp = 0;
    for (var ci = 0; ci < 6; ci++) {
      parts.arkgridBp += coreBp(sCores[ci] != null ? sCores[ci] : aCores[ci]) - coreBp(aCores[ci]);
    }
    var aNl = ANCHOR.arkgrid.nodeLevels, sNl = s.nodeLevels != null ? s.nodeLevels : aNl;
    parts.arkgridBp += 5 * (sNl - aNl);
    dBp += parts.arkgridBp;

    var v = s.notch != null ? s.notch : ANCHOR.notch;
    // whale parts (transcendence, elixirs) ramp in above the anchor's notch
    var wf = s.whaleFrac != null ? s.whaleFrac
      : Math.max(0, Math.min(1, (v - ANCHOR.notch) / (100 - ANCHOR.notch)));
    parts.whaleBp = wf * ANCHOR.whale.bpCap;
    dBp += parts.whaleBp;

    parts.skill = skillAt(ANCHOR.skillCurve, v);

    var score = ANCHOR.raidScore * parts.baseAttack * parts.gemFactor * parts.skill *
      (1 + (ANCHOR.sumBpNonGem + dBp) / 1e4) / (1 + ANCHOR.sumBpNonGem / 1e4);
    return { score: score, profileCp: score, parts: parts, dBp: dBp };
  }

  return { ANCHOR: ANCHOR, ANCHOR_DPS: ANCHOR_DPS, estimate: estimate,
    estimateDps: estimateDps, coreBp: coreBp };
});
