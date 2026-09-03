// 担当: ✅ 検証係（マンガー×ファインマン）
// 醸しコロ v2 バランス探索: CHARS の数値（HP・威力・+N・回復N）だけを動かして目標帯を探す
// 使い方:
//   node sim/search_v2.js --iters 4000 --n 400 --seed 1 --out sim/out/candX.json   探索
//   node sim/search_v2.js --apply sim/out/candX.json --n 2000 --seed 7             候補を別seedで評価
//   node sim/search_v2.js --n 2000 --seed 7                                         現状を評価
'use strict';
var path = require('path'), fs = require('fs');
var E = require(path.join(__dirname, '..', 'engine.js'));
var CH = E.CHARS;

var args = {};
for (var i = 2; i < process.argv.length; i++) {
  var a = process.argv[i];
  if (a.slice(0, 2) === '--') { args[a.slice(2)] = process.argv[i + 1]; i++; }
}
var N = parseInt(args.n || '400', 10);
var SEED = parseInt(args.seed || '20260903', 10);
var ITERS = parseInt(args.iters || '0', 10);
var STRICT = !args.loose;
var HP1801MAX = parseInt(args.hp1801 || '105', 10);
if (args.failself) E.getChar('k1801').ability.failSelf = parseInt(args.failself, 10);
var DIST_W = parseFloat(args.distw || '0.03');
var TURN_W = parseFloat(args.turnw || '1.0');
var FREEZE = (args.freeze || '').split(',').filter(Boolean);

function makeRng(seed) {
  var s = seed >>> 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---- パラメータの取り出し / 適用 ----
function getParams() {
  return CH.map(function (c) {
    return { hp: c.hp, moves: c.moves.map(function (m) {
      var e = m.eff || {};
      return { power: m.power, plus: e.plus, healPlus: e.healPlus, heal: e.heal };
    }) };
  });
}
function setParams(P) {
  CH.forEach(function (c, ci) {
    c.hp = P[ci].hp;
    c.moves.forEach(function (m, mi) {
      var p = P[ci].moves[mi];
      m.power = p.power;
      if (p.plus != null) m.eff.plus = p.plus;
      if (p.healPlus != null) m.eff.healPlus = p.healPlus;
      if (p.heal != null) m.eff.heal = p.heal;
    });
  });
}
var ORIG = JSON.parse(JSON.stringify(getParams()));

// ---- 制約（キャラの個性を守る） ----
function valid(P) {
  for (var ci = 0; ci < P.length; ci++) {
    var c = P[ci], mv = c.moves, kinds = CH[ci].moves.map(function (m) { return m.kind; });
    if (c.hp < 80 || c.hp > 130 || c.hp % 5) return false;
    var atk = [];
    for (var mi = 0; mi < mv.length; mi++) {
      var m = mv[mi];
      if (m.power % 5) return false;
      if (kinds[mi] === 'atk') { if (m.power < 5 || m.power > 60) return false; atk.push(m.power); }
      if (kinds[mi] === 'heal') { if (m.power < 10 || m.power > 40) return false; }
      if (m.plus != null && (m.plus < 5 || m.plus > 20 || m.plus % 5)) return false;
      if (m.healPlus != null && (m.healPlus < 5 || m.healPlus > 20 || m.healPlus % 5)) return false;
      if (m.heal != null && (m.heal < 5 || m.heal > 20 || m.heal % 5)) return false;
    }
    for (var k = 1; k < atk.length; k++) if (atk[k] <= atk[k - 1]) return false; // コスト順に強く
    if (STRICT) {
      if (atk[1] < atk[0] + 5 || atk[2] < atk[1] + 10) return false;   // 中技・ロマン技の段差
      if (atk[0] < 10 || atk[0] > 15) return false;                     // 安定技は10（1801は15まで）
      for (mi = 0; mi < mv.length; mi++) {
        if (kinds[mi] === 'heal' && (mv[mi].power < 15 || mv[mi].power > 30)) return false;
        if (mv[mi].plus != null && mv[mi].plus > 15) return false;
        if (mv[mi].healPlus != null && mv[mi].healPlus > 15) return false;
        if (mv[mi].heal != null && mv[mi].heal > 15) return false;
      }
    }
  }
  if (STRICT) {
    // HPの序列はキャラの個性: 6号 ≥ 10号 ≥ 7号 ≥ 14号 ≥ 9号 ≥ 1801号。1801は95以下・6号は110以上
    var h = {}; CH.forEach(function (c, ci) { h[c.id] = P[ci].hp; });
    if (!(h.k6 >= h.k10 && h.k10 >= h.k7 && h.k7 >= h.k14 && h.k14 >= h.k9)) return false;
    if (h.k1801 > HP1801MAX || h.k6 < 110 || h.k1801 > h.k7) return false;
    // ロマン技の最大火力は1801（バースト ≥ 他の技③）
    var b = P[5].moves[2].power;
    for (var q = 0; q < 5; q++) if (P[q].moves[2].power > b) return false;
  }
  return true;
}

// ---- 評価 ----
function evaluate(P, n, seed) {
  setParams(P);
  var rng = makeRng(seed), rows = [];
  for (var i = 0; i < CH.length; i++) for (var j = i; j < CH.length; j++) for (var f = 0; f < 2; f++) {
    var winA = 0, turnSum = 0, dec = 0, suc = 0, to = 0;
    for (var k = 0; k < n; k++) {
      var r = E.simulateBattle(CH[i], CH[j], rng, { first: f });
      if (r.winner === 0) winA++;
      turnSum += r.turnsPerSide; dec += r.declared; suc += r.success; if (r.timeout) to++;
    }
    rows.push({ i: i, j: j, first: f, mirror: i === j, winA: winA / n, turns: turnSum / n, succ: suc / dec, timeouts: to,
      firstWin: f === 0 ? winA / n : 1 - winA / n });
  }
  return rows;
}
function over(x, lo, hi) { return x < lo ? lo - x : (x > hi ? x - hi : 0); }
function penalty(rows, P) {
  var pen = 0;
  rows.forEach(function (r) {
    pen += 10 * over(r.winA, 0.38, 0.62);
    pen += TURN_W * over(r.turns, 6.5, 9.5);
    pen += 10 * over(r.succ, 0.42, 0.68);
    if (r.mirror) pen += 10 * over(r.firstWin, 0, 0.57);
    if (r.timeouts) pen += r.timeouts;
  });
  // 元の数値からの距離（小さく）: 変更は少ないほど良い
  var dist = 0;
  P.forEach(function (c, ci) {
    dist += Math.abs(c.hp - ORIG[ci].hp) / 5;
    c.moves.forEach(function (m, mi) {
      var o = ORIG[ci].moves[mi];
      dist += Math.abs(m.power - o.power) / 5;
      ['plus', 'healPlus', 'heal'].forEach(function (k) { if (m[k] != null) dist += Math.abs(m[k] - o[k]) / 5; });
    });
  });
  return pen + DIST_W * dist;
}
function ngList(rows) {
  var ng = [];
  rows.forEach(function (r) {
    var lab = CH[r.i].name + ' vs ' + CH[r.j].name + '（先攻 ' + (r.first === 0 ? CH[r.i].name : CH[r.j].name) + '）';
    if (r.winA < 0.35 || r.winA > 0.65) ng.push('勝率 ' + (r.winA * 100).toFixed(1) + '%: ' + lab);
    if (r.turns < 6 || r.turns > 10) ng.push('手番 ' + r.turns.toFixed(1) + ': ' + lab);
    if (r.succ < 0.40 || r.succ > 0.70) ng.push('成功率 ' + (r.succ * 100).toFixed(1) + '%: ' + lab);
    if (r.mirror && r.firstWin >= 0.60) ng.push('ミラー先攻 ' + (r.firstWin * 100).toFixed(1) + '%: ' + lab);
    if (r.timeouts) ng.push('打ち切り ' + r.timeouts + ': ' + lab);
  });
  return ng;
}
function overall(rows) {
  // キャラ別総合勝率（対全キャラ・先攻後攻込み・ミラー含む）
  var win = CH.map(function () { return 0; }), cnt = CH.map(function () { return 0; });
  rows.forEach(function (r) {
    win[r.i] += r.winA; cnt[r.i]++;
    win[r.j] += 1 - r.winA; cnt[r.j]++;
  });
  return CH.map(function (c, k) { return { name: c.name, rate: win[k] / cnt[k] }; });
}
function fmtParams(P) {
  return CH.map(function (c, ci) {
    var p = P[ci];
    return c.name + ' HP' + p.hp + ' | ' + c.moves.map(function (m, mi) {
      var q = p.moves[mi], s = m.name + ' ' + (m.kind === 'atk' ? q.power : (m.kind === 'heal' ? '回復' + q.power : '半減'));
      if (q.plus != null) s += '(+' + q.plus + ')';
      if (q.healPlus != null) s += '(回復+' + q.healPlus + ')';
      if (q.heal != null) s += '(回復' + q.heal + ')';
      return s;
    }).join(' / ');
  }).join('\n');
}

// ---- 探索（焼きなまし付き座標ランダム探索） ----
function neighbor(P, rng) {
  var Q = JSON.parse(JSON.stringify(P));
  var ci; do { ci = Math.floor(rng() * Q.length); } while (FREEZE.indexOf(CH[ci].id) >= 0);
  var c = Q[ci];
  var keys = [['hp']];
  c.moves.forEach(function (m, mi) {
    keys.push(['moves', mi, 'power']);
    if (m.plus != null) keys.push(['moves', mi, 'plus']);
    if (m.healPlus != null) keys.push(['moves', mi, 'healPlus']);
    if (m.heal != null) keys.push(['moves', mi, 'heal']);
  });
  var k = keys[Math.floor(rng() * keys.length)];
  var d = (rng() < 0.5 ? -5 : 5) * (rng() < 0.2 ? 2 : 1);
  if (k.length === 1) c.hp += d; else c.moves[k[1]][k[2]] += d;
  return Q;
}

var P = getParams();
if (args.apply) { P = JSON.parse(fs.readFileSync(args.apply, 'utf8')); setParams(P); }
if (args.reset) { P = JSON.parse(JSON.stringify(ORIG)); setParams(P); }

if (ITERS > 0) {
  var srng = makeRng(SEED * 7919 + 17);
  var cur = P, curRows = evaluate(cur, N, SEED), curPen = penalty(curRows, cur);
  var best = cur, bestPen = curPen, bestRows = curRows;
  var T = parseFloat(args.temp || '0.3');
  for (var it = 0; it < ITERS; it++) {
    var Q = neighbor(cur, srng);
    if (!valid(Q)) continue;
    var rows = evaluate(Q, N, SEED), pen = penalty(rows, Q);
    if (pen < curPen || srng() < Math.exp((curPen - pen) / T)) { cur = Q; curPen = pen; curRows = rows; }
    if (pen < bestPen) { best = Q; bestPen = pen; bestRows = rows; }
    T *= 0.999;
    if (it % 200 === 0) console.error('it ' + it + ' cur ' + curPen.toFixed(3) + ' best ' + bestPen.toFixed(3) + ' ng ' + ngList(bestRows).length);
  }
  P = best; setParams(P);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(P, null, 1));
}

// ---- 元の数値へ戻せるだけ戻す（貪欲・1パラメータずつ。metricペナルティが tol 以下なら採用） ----
if (args.revert) {
  function metricPen(rows) { var save = DIST_W; DIST_W = 0; var v = penalty(rows, P); DIST_W = save; return v; }
  var TOL = metricPen(evaluate(P, N, SEED)) + parseFloat(args.tol || '0.02');
  console.error('revert tol ' + TOL.toFixed(3));
  var changed = true, pass = 0;
  while (changed && pass++ < 6) {
    changed = false;
    for (var ci = 0; ci < P.length; ci++) {
      var slots = [['hp']];
      P[ci].moves.forEach(function (m, mi) { ['power', 'plus', 'healPlus', 'heal'].forEach(function (k) { if (m[k] != null) slots.push(['moves', mi, k]); }); });
      for (var si = 0; si < slots.length; si++) {
        var sl = slots[si];
        var curV = sl.length === 1 ? P[ci].hp : P[ci].moves[sl[1]][sl[2]];
        var origV = sl.length === 1 ? ORIG[ci].hp : ORIG[ci].moves[sl[1]][sl[2]];
        if (curV === origV) continue;
        // 元へ1段（5）近づける
        var step = origV > curV ? 5 : -5;
        var Q = JSON.parse(JSON.stringify(P));
        if (sl.length === 1) Q[ci].hp += step; else Q[ci].moves[sl[1]][sl[2]] += step;
        if (!valid(Q)) continue;
        var rows2 = evaluate(Q, N, SEED), mp = metricPen(rows2);
        var tag = CH[ci].name + ' ' + (sl.length === 1 ? 'hp' : CH[ci].moves[sl[1]].name + '.' + sl[2]) + ' ' + curV + '→' + (curV + step);
        if (mp <= TOL && ngList(rows2).length === 0) { P = Q; setParams(P); changed = true; console.error('revert OK ' + tag + ' pen ' + mp.toFixed(3)); }
        else console.error('revert NG ' + tag + ' pen ' + mp.toFixed(3));
      }
    }
  }
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(P, null, 1));
}

// ---- 評価結果を出力 ----
var rows = evaluate(P, N, SEED);
console.log(fmtParams(P));
console.log('penalty ' + penalty(rows, P).toFixed(3) + ' (n=' + N + ' seed=' + SEED + ')');
var ng = ngList(rows);
console.log('未達 ' + ng.length + '件'); ng.forEach(function (s) { console.log('- ' + s); });
var tot = rows.reduce(function (s, r) { return s + r.succ; }, 0) / rows.length;
console.log('成功率(行平均) ' + (tot * 100).toFixed(1) + '%  手番(行平均) ' + (rows.reduce(function (s, r) { return s + r.turns; }, 0) / rows.length).toFixed(2));
if (args.table) rows.forEach(function (r) {
  console.log((CH[r.i].name + ' vs ' + CH[r.j].name + ' 先攻' + (r.first === 0 ? CH[r.i].name : CH[r.j].name)) + ' | A勝率 ' + (r.winA * 100).toFixed(1) + ' | 先攻勝率 ' + (r.firstWin * 100).toFixed(1) + ' | 手番 ' + r.turns.toFixed(1) + ' | 成功率 ' + (r.succ * 100).toFixed(1));
});
console.log('総合勝率: ' + overall(rows).map(function (o) { return o.name + ' ' + (o.rate * 100).toFixed(1) + '%'; }).join(' / '));
