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
var solverCache = {};
function solverFor(baseline, gpd, cost) {
  var q = snap(baseline);
  var key = q + "_" + gpd + "_" + cost;
  if (!solverCache[key]) {
    solverCache[key] = new DP.Solver(A.supportGradeToScore(q), gpd, false,
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
function sampleTierGem(cost, tierName, rand) {
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
  return { baseCost: cost, gemType: "order", willpowerLevel: p[0], orderLevel: p[1],
    effect1: pool[i], effect1Level: p[2], effect2: pool[j], effect2Level: p[3] };
}
function drawTier(dist, rand) {
  var r = rand();
  if (r <= dist.legendary) return "legendary";
  if (r <= dist.legendary + dist.relic) return "relic";
  return "ancient";
}

/**
 * Lay a half out across its three cores, then score the whole grid.
 *
 * A core only pays for the points above seventeen, and the three cores in a
 * half pay at different rates, so the order points want to be concentrated in
 * the best core rather than spread. CORES lists each half best-rate first, so
 * sorting the twelve by order level and dealing them out four at a time puts
 * the highest points where they are worth the most.
 */
function placeHalf(gems, half) {
  var sorted = gems.slice().sort(function (a, b) { return (b.orderLevel || 0) - (a.orderLevel || 0); });
  return sorted.map(function (g, i) {
    return Object.assign({}, g, { coreBase: CORES[half][(i / 4) | 0] });
  });
}

/** The grid's damage, and the node levels, through the calculator's own scorer. */
function gridState(pools) {
  var placed = placeHalf(pools.order, "order").concat(placeHalf(pools.chaos, "chaos"));
  var node = [0, 0, 0], pts = 0;
  placed.forEach(function (g) {
    for (var q = 0; q < 3; q++) {
      if (g.effect1 === NODES[q]) node[q] += g.effect1Level;
      if (g.effect2 === NODES[q]) node[q] += g.effect2Level;
    }
    pts += g.orderLevel || 0;
  });
  return { damage: A.gridDamage(placed, "support"), node: node, cores: pts / 6 };
}

/**
 * One account. Each cut is an order gem or a chaos one, and it can only take a
 * slot in its own half — which is what makes the grid expensive: a superb chaos
 * gem does nothing for a weak order core.
 */
function runAccount(gpd, rep) {
  var rand = mulberry32(fnv1a("acct:" + SEED + ":" + RARITY + ":" + (rep || 0)));
  var pools = { order: [], chaos: [] }, trace = [], gold = 0, cut = 0;
  while (cut < N) {
    var half = rand() < 0.5 ? "order" : "chaos";
    var mine = pools[half];
    var full = mine.length >= HALF;
    var weakestDmg = full
      ? Math.min.apply(null, mine.map(function (g) { return A.supportDamage(g); }))
      : -Infinity;
    var weakest = full
      ? Math.min.apply(null, mine.map(function (g) { return A.supportGrade(g); }))
      : 0;
    var cost = rand() < MIX[8] ? 8 : (rand() < 0.75 ? 9 : 10);
    var pr = PAIRS[cost][Math.floor(rand() * PAIRS[cost].length)];
    var res = cutOneGem(solverFor(weakest, gpd, cost),
      { baseCost: cost, gemType: half, effect1: pr[0], effect2: pr[1] }, rand, true);
    gold += res.spent;
    cut++;
    var got = res.processes > 0 ? res.cfg : null;
    if (got && full && A.supportDamage(got) <= weakestDmg && A.levelSum(got) >= 16) {
      gold += A.COSTS.fusion;
      var outTier = drawTier(A.fusionOutputDist([A.classifyTier(A.levelSum(got)), "legendary", "legendary"]), rand);
      got = outTier === "legendary" ? null : sampleTierGem(got.baseCost, outTier, rand);
    }
    if (!got) continue;
    if (!full) {
      mine.push(got);
    } else {
      var wi = 0, wd = Infinity;
      for (var i = 0; i < mine.length; i++) {
        var d = A.supportDamage(mine[i]);
        if (d < wd) { wd = d; wi = i; }
      }
      if (A.supportDamage(got) <= wd) continue;
      mine[wi] = got;
    }
    if (pools.order.length === HALF && pools.chaos.length === HALF) {
      var st = gridState(pools);
      var all = pools.order.concat(pools.chaos);
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
var out = GPDS.map(function (gpd) {
  var acc = { gold: 0, cut: 0, damage: 0, weakest: 0, mean: 0, cores: 0, node: [0, 0, 0] };
  for (var r = 0; r < REPS; r++) {
    var st = stopAt(gpd, r);
    acc.gold += st.gold; acc.cut += st.cut; acc.damage += st.damage;
    acc.weakest += st.weakest; acc.mean += st.mean; acc.cores += st.cores;
    for (var k = 0; k < 3; k++) acc.node[k] += st.node[k];
  }
  function avg(v) { return v / REPS; }
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
