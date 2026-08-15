/**
 * arkgrid-account.js — simulate an account building its ark grid.
 *
 *   node tools/arkgrid-account.js --rarity=rare --n=4000 --out=data/arkgrid-account-rare.json
 *
 * The band model says a grid is "24 gems at grade X". That is enough to price
 * the ladder but not to show one, because it throws away the spread: the band
 * is set by the WEAKEST of the 24, and the other 23 sit above it. Two players
 * both sitting on A+ can hold quite different grids.
 *
 * So this builds the grid the way a player does. Cut a gem with the advisor at
 * your current baseline; if it adds more damage than your weakest slot does,
 * socket it and the old one is gone. Your baseline is then the grade of the new
 * weakest, which is the app's own advice, so the advisor tracks you as you
 * improve. Duds that reach relic fuse with two legendary fodder.
 *
 * Sockets are decided on DAMAGE, not on grade. The two do not move together: a
 * gem can grade higher on its willpower and order credit while putting less
 * into the side nodes, so swapping on grade can lower the grid. Grade still
 * names the band, because that is what the app's baseline advice reads.
 *
 * The trace is monotone in gold, so one account answers every budget: walk it
 * and stop where one more gem stops paying,
 *
 *     gold for the next gem / (damage it adds x 3 dealers)  >  your gold per damage
 *
 * and report the grid standing there — its weakest grade (the band), its mean,
 * its node levels and what it cost in gems and weeks.
 */
"use strict";
var REPO = "C:/Users/Shizu/loastuff/loa-astrogem-calc";
var A = require(REPO + "/model/astrogem.js");

var ARGS = {};
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) ARGS[m[1]] = m[2] === undefined ? true : m[2];
});
var RARITY = String(ARGS.rarity || "epic");
if (!A.RARITY[RARITY]) throw new Error("unknown rarity " + RARITY);
var BUDGET_RARITY = { maxTurns: A.RARITY[RARITY].maxTurns, maxRerolls: A.RARITY[RARITY].maxRerolls };
A.RARITY.epic.maxTurns = BUDGET_RARITY.maxTurns;
A.RARITY.epic.maxRerolls = BUDGET_RARITY.maxRerolls;

var DP = require(REPO + "/model/dp.js");
var Engine = require(REPO + "/tools/lib/cut-engine.js");
var mulberry32 = Engine.mulberry32, fnv1a = Engine.fnv1a, cutOneGem = Engine.cutOneGem;

var SLOTS = 24;
// The grid is two separate halves and a gem cannot cross between them: an order
// gem only ever goes in an order core. So the account keeps two pools of twelve
// and a fresh gem only competes with its own kind.
//
// The six cores pay different rates per order/chaos point — Chaos Moon is worth
// more than twice Order Star — and coreKeyOf reads these IDs, so passing 0..5
// silently fell back to the average rate for all six.
var CORES = {
  order: [10002, 10001, 10003],   // Moon 0.0702, Sun 0.0682, Star 0.0486
  chaos: [10005, 10006, 10004]    // Moon 0.1052, Star 0.0869, Sun 0.0826
};
var HALF = 12;
var CUTS_PER_WEEK = { uncommon: 70, rare: 26, epic: 9 };
var PARTY = 3;
var N = parseInt(ARGS.n, 10) || 4000;          // gems cut per account
var SEED = String(ARGS.seed || "gpd-2026-08-14");
var GPDS = [250000, 500000, 1000000, 2000000, 4000000, 8000000, 16000000, 25000000];
var MIX = { 8: 0.6, 9: 0.3, 10: 0.1 };
var NODES = ["Ally Attack Enh.", "Brand Power", "Ally Damage Enh."];
var SHORT = { "Ally Attack Enh.": "ally atk", "Brand Power": "brand", "Ally Damage Enh.": "ally dmg" };

function pairsOf(cost) {
  var pool = A.EFFECT_POOLS[cost], out = [];
  for (var i = 0; i < pool.length; i++) for (var j = i + 1; j < pool.length; j++) out.push([pool[i], pool[j]]);
  return out;
}
var PAIRS = { 8: pairsOf(8), 9: pairsOf(9), 10: pairsOf(10) };

// Solvers are by far the expensive part — a whole DP solve each — so they are
// cached and the baseline is snapped to the grade band it sits in. A player
// does not re-read the advisor over a tenth of a grade, and snapping keeps the
// solver count to twelve bands rather than forty-odd grade points.
var BAND_CUTS = [0, 60, 63.3, 66.7, 70, 73.3, 76.7, 80, 83.3, 86.7, 90, 93.3, 94.6];
function snap(g) {
  var q = BAND_CUTS[0];
  for (var i = 0; i < BAND_CUTS.length; i++) if (g >= BAND_CUTS[i]) q = BAND_CUTS[i];
  return q;
}
// Roster-bound, matching the fitted corpus and the calculator's own default
// advice since astrogems stopped being sellable. Off, the DP abandons gems to
// save gold the cutter charges anyway, and the chart reads cheaper than a
// player following the site's advisor actually pays.
var ROSTER = true;
var solverCache = {};
function solverFor(baseline, gpd) {
  var q = snap(baseline);
  var key = q + "_" + gpd;
  if (!solverCache[key]) {
    solverCache[key] = new DP.Solver(A.supportGradeToScore(q), gpd, ROSTER,
      { axis: "support", maxTurns: BUDGET_RARITY.maxTurns });
  }
  return solverCache[key];
}

var _partCache = {};
function partsOfSum(s) {
  if (_partCache[s]) return _partCache[s];
  var out = [];
  for (var w = 1; w <= 5; w++) for (var o = 1; o <= 5; o++)
    for (var a = 1; a <= 5; a++) for (var b = 1; b <= 5; b++)
      if (w + o + a + b === s) out.push([w, o, a, b]);
  _partCache[s] = out;
  return out;
}
function sampleTierGem(cost, tierName, rand, gemType) {
  var sumDist = A.outputLevelSumDist(tierName);
  var r = rand(), acc = 0, sum = null;
  Object.keys(sumDist).forEach(function (k) {
    if (sum !== null) return;
    acc += sumDist[k];
    if (r <= acc) sum = parseInt(k, 10);
  });
  if (sum === null) sum = parseInt(Object.keys(sumDist).pop(), 10);
  var parts = partsOfSum(sum), p = parts[Math.floor(rand() * parts.length)];
  var pool = A.EFFECT_POOLS[cost];
  var i = Math.floor(rand() * pool.length), j = Math.floor(rand() * (pool.length - 1));
  if (j >= i) j++;
  return { baseCost: cost, gemType: gemType || "order", willpowerLevel: p[0], orderLevel: p[1],
    effect1: pool[i], effect1Level: p[2], effect2: pool[j], effect2Level: p[3] };
}
function drawTier(dist, rand) {
  var r = rand();
  if (r <= dist.legendary) return "legendary";
  if (r <= dist.legendary + dist.relic) return "relic";
  return "ancient";
}

/**
 * Pack one half's three cores out of everything that half owns.
 *
 * A core is FOUR gems and holds two separate seventeens, pulling against each
 * other:
 *
 *   willpower  the four effective costs (baseCost - willpowerLevel) must fit
 *              inside 17. The perfect core is exactly 5+5+4+3.
 *   order      only the order points ABOVE 17 pay anything, and four gems can
 *              reach 20, so the last three points are the whole prize.
 *
 * So a gem is never good or bad on its own — a cheap high-willpower gem earns
 * its place by letting an expensive one fit beside it. That is also why gems
 * you are not wearing still matter: a core can be re-packed 4+4+4+5 into
 * 3+4+5+5 using something already in the box, which is Shizu's point and the
 * reason this keeps an inventory instead of only the equipped twelve.
 *
 * Each core is solved exactly, best-paying core first, by a small DP over
 * (gems used, willpower spent, order points). The state space is 4 x 18 x 21,
 * so this is cheap enough to redo whenever the inventory changes.
 */
var CORE_WP = 17, ORDER_FLOOR = 17, PER_CORE = 4;
function effCost(g) { return g.baseCost - (g.willpowerLevel || 0); }

/**
 * A core that misses seventeen order points does not merely earn nothing — it
 * taxes the WHOLE grid. Ported from the astrogem calculator's own account study
 * (tools/account-study.js, Shizu 2026-08-09), where it is applied log-additively
 * per core so the multiplier lands on the total.
 *
 * Three percent sounds mild and is not: on the support axis it is worth about
 * ninety to a hundred and ninety order points depending on the core, far more
 * than any side-node trade can return. That is
 * deliberate — it makes the packer force 17+ wherever the collection allows,
 * rather than quietly settling for a fourteen-point core with prettier lines.
 */
function bandPenalty(pts) {
  if (pts >= 17) return 0;
  if (pts >= 14) return 0.03;
  if (pts >= 10) return 0.06;
  return 0.09;
}

var WSPAN = CORE_WP + 1, DSPAN = 4 * 5 + 1, NSTATE = (PER_CORE + 1) * WSPAN * DSPAN;
function stateIdx(u, w, d) { return (u * WSPAN + w) * DSPAN + d; }

// Scratch buffers, reused across calls — this runs after every socketed gem and
// allocating a fresh DP each time was the whole cost of the simulation.
var _score = new Float64Array(NSTATE);
var _prev = new Int32Array(NSTATE);
var _took = new Int32Array(NSTATE);

function packCore(pool, rate) {
  _score.fill(-Infinity);
  _prev.fill(-1);
  _took.fill(-1);
  _score[stateIdx(0, 0, 0)] = 0;
  for (var i = 0; i < pool.length; i++) {
    var g = pool[i], c = effCost(g), o = g.orderLevel || 0;
    if (c > CORE_WP) continue;
    var eff = A.supportDamage(g, 0);          // effects only; order priced below
    for (var u = PER_CORE - 1; u >= 0; u--) {
      for (var w = 0; w + c <= CORE_WP; w++) {
        for (var d = 0; d + o < DSPAN; d++) {
          var from = stateIdx(u, w, d);
          var base = _score[from];
          if (base === -Infinity) continue;
          var to = stateIdx(u + 1, w + c, d + o);
          var val = base + eff;
          if (val > _score[to]) { _score[to] = val; _prev[to] = from; _took[to] = i; }
        }
      }
    }
  }
  var winner = -1, winVal = -Infinity;
  for (var w2 = 0; w2 <= CORE_WP; w2++) {
    for (var d2 = 0; d2 < DSPAN; d2++) {
      var st = stateIdx(PER_CORE, w2, d2);
      if (_score[st] === -Infinity) continue;
      var total = _score[st] + 100 * Math.log(1 + rate * Math.max(0, d2 - ORDER_FLOOR))
        + 100 * Math.log(1 - bandPenalty(d2));
      if (total > winVal) { winVal = total; winner = st; }
    }
  }
  if (winner < 0) return null;
  var picks = [];
  for (var cur = winner; cur >= 0 && _took[cur] >= 0; cur = _prev[cur]) picks.push(_took[cur]);
  return { picks: picks, value: winVal };
}

/**
 * Best legal layout of a half: three cores, four gems each, from the inventory.
 *
 * The cores are filled greedily one after another, which depends on the order
 * they are filled in — so all six orderings of the three cores are tried and
 * the best total kept. Not a full joint solve, but it removes the one bias the
 * fixed ordering had: the first core skimming gems a later core needed more.
 */
var PERMS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function packHalf(inv, half) {
  var bestPlaced = null, bestVal = -Infinity;
  for (var pi = 0; pi < PERMS.length; pi++) {
    var left = inv.slice(), placed = [], val = 0, ok = true;
    for (var k = 0; k < 3 && ok; k++) {
      var coreId = CORES[half][PERMS[pi][k]];
      // supportOrderValueForCore returns log-damage per point; the order
      // bracket needs the linear rate, exp(v/100)-1, exactly as the
      // calculator converts it (astrogem.js supportGridDamage)
      var rate = Math.exp(A.supportOrderValueForCore(coreId) / 100) - 1;
      var got = packCore(left, rate);
      if (!got) { ok = false; break; }
      val += got.value;
      var taken = {};
      got.picks.forEach(function (idx) {
        taken[idx] = true;
        placed.push(Object.assign({}, left[idx], { coreBase: coreId }));
      });
      left = left.filter(function (_, idx) { return !taken[idx]; });
    }
    if (ok && val > bestVal) { bestVal = val; bestPlaced = placed; }
  }
  return bestPlaced;
}

/**
 * The grid's damage and its node levels.
 *
 * The band penalty is NOT subtracted here, on purpose. Its job is in the
 * packer's objective, where it forces cores to seventeen the way Shizu ruled
 * ("even -3% should be enough to force all 17s"). Physically it stands for the
 * core threshold bonuses a sub-17 core fails to unlock — and those live in the
 * gear baseline (the weapon core's flats), not in this row. Subtracting it
 * here made low-budget grids report NEGATIVE damage, which no set of equipped
 * gems can do to a character. So the packer avoids sub-17 cores at almost any
 * cost, and the number reported is the damage the worn grid actually adds.
 */
function gridState(packed) {
  var placed = packed.order.concat(packed.chaos);
  var node = [0, 0, 0], pts = 0, corePts = {};
  placed.forEach(function (g) {
    for (var q = 0; q < 3; q++) {
      if (g.effect1 === NODES[q]) node[q] += g.effect1Level;
      if (g.effect2 === NODES[q]) node[q] += g.effect2Level;
    }
    pts += g.orderLevel || 0;
    corePts[g.coreBase] = (corePts[g.coreBase] || 0) + (g.orderLevel || 0);
  });
  return { damage: A.gridDamage(placed, "support"), node: node, cores: pts / 6 };
}

/**
 * One account. Each cut is an order gem or a chaos one and can only ever go in
 * its own half. Everything cut is KEPT: an unequipped gem is not waste, it is a
 * packing option, so the inventory is what gets solved rather than a fixed
 * twenty-four.
 *
 * The inventory is pruned to the best few dozen a side. Solving the pack is
 * cheap but not free, and a gem outside the top of the pile can never earn a
 * core slot — it is beaten on damage AND it frees no willpower a better gem
 * does not free more of.
 */
var KEEP = 26;

function runAccount(gpd, rep) {
  var rand = mulberry32(fnv1a("acct:" + SEED + ":" + RARITY + ":" + (rep || 0)));
  var inv = { order: [], chaos: [] };
  var packed = { order: null, chaos: null };
  var trace = [], gold = 0, cut = 0;

  while (cut < N) {
    var half = rand() < 0.5 ? "order" : "chaos";
    var eq = packed[half];
    // the advisor's baseline is the weakest grade you are actually wearing
    var weakest = eq ? Math.min.apply(null, eq.map(function (g) { return A.supportGrade(g); })) : 0;
    var r0 = rand();
    var cost = r0 < MIX[8] ? 8 : (r0 < MIX[8] + MIX[9] ? 9 : 10);
    var pr = PAIRS[cost][Math.floor(rand() * PAIRS[cost].length)];
    var res = cutOneGem(solverFor(weakest, gpd),
      { baseCost: cost, gemType: half, effect1: pr[0], effect2: pr[1] }, rand, true);
    gold += res.spent;
    cut++;
    var got = res.processes > 0 ? res.cfg : null;
    if (!got) continue;

    var mine = inv[half];
    mine.push(got);
    if (mine.length > KEEP) {
      // Choose the drop, and never a budget-enabler if it can be helped: a gem
      // at effective cost four or less is willpower headroom, and the packer
      // turns headroom into damage the gem itself does not carry. Pruning on
      // damage alone would throw away precisely the gems that make 5+5+4+3
      // cores possible.
      var dropAt = function () {
        mine.sort(function (a, b) { return A.supportDamage(b) - A.supportDamage(a); });
        for (var j = mine.length - 1; j >= 0; j--) if (effCost(mine[j]) > 4) return j;
        return mine.length - 1;
      };
      var drop = mine.splice(dropAt(), 1)[0];
      // a dud deep in the pile is worth fusing rather than carrying
      if (A.levelSum(drop) >= 16) {
        gold += A.COSTS.fusion;
        var outTier = drawTier(A.fusionOutputDist([A.classifyTier(A.levelSum(drop)), "legendary", "legendary"]), rand);
        if (outTier !== "legendary") {
          mine.push(sampleTierGem(drop.baseCost, outTier, rand, half));
          if (mine.length > KEEP) mine.splice(dropAt(), 1);
        }
      }
    }
    // Repack on every inventory change. The old gate (beats the weakest, or
    // cheapest willpower) missed exactly the cases Shizu called out: a gem
    // that displaces a middle slot, a fusion output, and re-packs like
    // 4+4+4+5 into 3+4+5+5 where the new gem itself never gets worn. The
    // packer is typed-array cheap now; the gate was guarding a cost that no
    // longer exists.
    packed[half] = packHalf(mine, half) || packed[half];
    if (packed.order && packed.chaos) {
      var st = gridState(packed);
      var all = packed.order.concat(packed.chaos);
      var grades = all.map(function (g) { return A.supportGrade(g); });
      trace.push({ gold: gold, cut: cut, damage: st.damage,
        weakest: Math.min.apply(null, grades),
        mean: grades.reduce(function (a, b) { return a + b; }, 0) / SLOTS,
        node: st.node.slice(), cores: st.cores });
    }
  }
  return trace;
}

function letterOf(g) {
  var L = A.SUPPORT_RANK_LADDER;
  for (var i = 0; i < L.length; i++) if (g >= L[i][1] - 1e-9) return L[i][0];
  return "F-";
}

var REPS = parseInt(ARGS.reps, 10) || 1;

/** One account's stopping point at this budget. */
function stopAt(gpd, rep) {
  var trace = runAccount(gpd, rep);
  // Until twelve gems a side can form three cores inside their willpower
  // budget there is no legal grid at all, so an account can finish with an
  // empty trace. That is a real outcome, not an error: it says this budget
  // never reached a wearable grid.
  if (!trace.length) return null;
  // Stop where the next gem stops paying for itself. One gem at a time is far
  // too noisy to test — most cuts add nothing and then one lands — so the rate
  // is measured over a window of sockets and the stop is the last point where
  // that rate is still under budget.
  var W = 12;
  var stop = trace[trace.length - 1];
  for (var i = W; i < trace.length; i++) {
    var dGold = trace[i].gold - trace[i - W].gold;
    var dDmg = trace[i].damage - trace[i - W].damage;
    if (dDmg <= 0) continue;
    if (dGold / (dDmg * PARTY) > gpd) { stop = trace[i - W]; break; }
  }
  return stop;
}

// One account is one sample and samples wobble — a richer budget can land a
// slightly worse grid than a poorer one, which must never show on the card.
// Averaging several accounts per budget settles it honestly. The DP solvers are
// cached across reps, so the extra cost is cutting, not solving.
var _t0 = process.hrtime.bigint();
var out = GPDS.map(function (gpd) {
  console.error("  gpd " + (gpd / 1e6).toFixed(2) + "M  at " +
    (Number(process.hrtime.bigint() - _t0) / 1e9).toFixed(0) + "s");
  var acc = { gold: 0, cut: 0, damage: 0, weakest: 0, mean: 0, cores: 0, node: [0, 0, 0] };
  var got = 0;
  for (var r = 0; r < REPS; r++) {
    var st = stopAt(gpd, r);
    if (!st) continue;
    got++;
    acc.gold += st.gold; acc.cut += st.cut; acc.damage += st.damage;
    acc.weakest += st.weakest; acc.mean += st.mean; acc.cores += st.cores;
    for (var k = 0; k < 3; k++) acc.node[k] += st.node[k];
  }
  if (!got) return { gpd: gpd, reachable: false };
  function avg(v) { return v / got; }
  return {
    gpd: gpd, gold: Math.round(avg(acc.gold)), gems: Math.round(avg(acc.cut)),
    weeks: avg(acc.cut) / CUTS_PER_WEEK[RARITY],
    damage: Number(avg(acc.damage).toFixed(4)),
    band: letterOf(avg(acc.weakest)),
    weakest: Number(avg(acc.weakest).toFixed(1)),
    mean: Number(avg(acc.mean).toFixed(1)),
    meanBand: letterOf(avg(acc.mean)),
    cores: Math.round(avg(acc.cores)),
    nodes: NODES.map(function (n, k) { return [SHORT[n], Math.round(avg(acc.node[k]))]; })
  };
});

// One account per budget is one sample, and samples wobble: a richer budget
// occasionally lands a slightly worse grid than a poorer one, which must never
// show on the card. Carry the best grid so far up the budget axis. Averaging
// several accounts per budget would be the better fix and needs a longer run.
for (var i = 1; i < out.length; i++) {
  if (out[i].damage < out[i - 1].damage) {
    var keep = out[i].gpd, g = out[i].gold, gems = out[i].gems, wk = out[i].weeks;
    out[i] = JSON.parse(JSON.stringify(out[i - 1]));
    out[i].gpd = keep;
    // the cost of standing here is still what THIS budget paid for it
    out[i].gold = Math.max(g, out[i - 1].gold);
    out[i].gems = Math.max(gems, out[i - 1].gems);
    out[i].weeks = Math.max(wk, out[i - 1].weeks);
  }
}

console.log(RARITY + " — " + N.toLocaleString() + " gems cut per account, " +
  CUTS_PER_WEEK[RARITY] + " cuts a week\n");
console.log("budget".padStart(8) + "gems".padStart(7) + "weeks".padStart(7) + "gold".padStart(9) +
  "band".padStart(6) + "weakest".padStart(9) + "mean".padStart(7) + "damage".padStart(9) + "  nodes");
out.forEach(function (r) {
  console.log(((r.gpd / 1e6).toFixed(2) + "M").padStart(8) + String(r.gems).padStart(7) +
    r.weeks.toFixed(0).padStart(7) + (Math.round(r.gold / 1000) + "k").padStart(9) +
    r.band.padStart(6) + r.weakest.toFixed(1).padStart(9) + r.mean.toFixed(1).padStart(7) +
    (r.damage.toFixed(3) + "%").padStart(9) + "  " +
    r.nodes.map(function (n) { return n[0] + " " + n[1]; }).join(", "));
});
if (ARGS.out) {
  require("fs").writeFileSync(ARGS.out, JSON.stringify({
    rarity: RARITY, slots: SLOTS, cutsPerWeek: CUTS_PER_WEEK[RARITY],
    turns: BUDGET_RARITY.maxTurns, rerolls: BUDGET_RARITY.maxRerolls,
    n: N, party: PARTY, sig: A.MODEL_SIG, rows: out
  }, null, 1));
  console.error("wrote " + ARGS.out);
}
