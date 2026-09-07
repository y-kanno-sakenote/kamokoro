// 担当: ✅ 検証係（マンガー×ファインマン）
// カモコロ v4 バランス探索: CHARS の数値（HP・威力・+N・回復N）だけを動かして目標帯を探す
// v2版（search_v2.js）は技4本前提の valid() だったため、技プール7本の v4 では現行値すら不正になる。
// ここでは区分（st/md/rm/sp）ごとの制約に直し、目標に「初期6体まわしの総合勝率45〜55%」を足した。
// 使い方:
//   node sim/search_v4.js --n 2000 --seed 20260903 --table              現状を評価
//   node sim/search_v4.js --apply sim/out/x.json --n 2000               候補を評価
//   node sim/search_v4.js --iters 3000 --n 400 --free k9,k1801 --out sim/out/x.json
'use strict';
var path = require('path'), fs = require('fs');
var E = require(path.join(__dirname, '..', 'engine.js'));
var CH = E.CHARS;

var args = {};
for (var i = 2; i < process.argv.length; i++) {
  var a = process.argv[i];
  if (a.slice(0, 2) === '--') {
    var nx = process.argv[i + 1];
    if (nx && nx.slice(0, 2) !== '--') { args[a.slice(2)] = nx; i++; }
    else args[a.slice(2)] = '1';
  }
}
var N = parseInt(args.n || '400', 10);
var SEED = parseInt(args.seed || '20260903', 10);
var ITERS = parseInt(args.iters || '0', 10);
var DIST_W = parseFloat(args.distw || '0.03');
var FREE = (args.free || '').split(',').filter(Boolean); // 空なら全キャラ可動

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

// ---- 制約（キャラの持ち味を守る。v4は技プール7本＝st2・md2・rm2・sp1） ----
function valid(P) {
  var h = {};
  for (var ci = 0; ci < P.length; ci++) {
    var c = P[ci], src = CH[ci], mv = c.moves;
    h[src.id] = c.hp;
    if (c.hp < 85 || c.hp > 120 || c.hp % 5) return false;
    var st = [], md = [], rm = [];
    for (var mi = 0; mi < mv.length; mi++) {
      var m = mv[mi], s = src.moves[mi];
      if (m.power % 5) return false;
      if (s.kind === 'atk') {
        if (s.g === 'st') { if (m.power < 10 || m.power > 15) return false; st.push(m.power); }
        if (s.g === 'md') { if (m.power < 15 || m.power > 30) return false; md.push(m.power); }
        if (s.g === 'rm') { if (m.power < 25 || m.power > 50) return false; rm.push(m.power); }
      }
      if (s.kind === 'heal') { if (m.power < 15 || m.power > 35) return false; }
      if (m.plus != null && (m.plus < 5 || m.plus > 20 || m.plus % 5)) return false;
      if (m.healPlus != null && (m.healPlus < 5 || m.healPlus > 20 || m.healPlus % 5)) return false;
      if (m.heal != null && (m.heal < 5 || m.heal > 20 || m.heal % 5)) return false;
    }
    // 区分の段差: 中 ≥ 安定+5 / ロマン ≥ 中+10（コストを払うほど強い）
    var stMax = Math.max.apply(null, st), mdMax = Math.max.apply(null, md), mdMin = Math.min.apply(null, md);
    var rmMin = Math.min.apply(null, rm), rmMax = Math.max.apply(null, rm);
    if (mdMin < stMax + 5) return false;
    if (rmMin < mdMax + 10) return false;
  }
  // HPの序列（持ち味）: 6号 ≥ 10号 ≥ 7号 ≥ 14号 ＞ 9号、1801は7号以下、9号が最軽量（紙耐久）
  if (!(h.k6 >= h.k10 && h.k10 >= h.k7 && h.k7 >= h.k14 && h.k14 > h.k9)) return false;
  if (h.k1801 > h.k7 || h.k6 < 105) return false;
  if (h.k9 > h.k1801) return false;
  // ロマンの最大火力は1801（ぜんぶだす）が全キャラ最大。9号の一撃は他4体以上
  var burst = P[5].moves[5].power;
  for (var q = 0; q < 6; q++) {
    var rmx = Math.max(P[q].moves[4].power, P[q].moves[5].power);
    if (q !== 5 && rmx > burst) return false;
  }
  var k9rm = Math.max(P[2].moves[4].power, P[2].moves[5].power);
  if (k9rm < 40) return false;
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
// キャラ別総合勝率（42行から。--v3 の「初期の6体まわし」とほぼ同義。ミラーは50%に寄せる）
function overall(rows) {
  var win = CH.map(function () { return 0; }), cnt = CH.map(function () { return 0; });
  rows.forEach(function (r) {
    win[r.i] += r.winA; cnt[r.i]++;
    win[r.j] += 1 - r.winA; cnt[r.j]++;
  });
  return CH.map(function (c, k) { return { name: c.name, rate: win[k] / cnt[k] }; });
}
function penalty(rows, P) {
  var pen = 0;
  rows.forEach(function (r) {
    var is1801 = CH[r.i].id === 'k1801' || CH[r.j].id === 'k1801';
    pen += 10 * over(r.winA, 0.37, 0.63);
    pen += 1.0 * over(r.turns, is1801 ? 5.2 : 6.3, 9.6);   // 1801絡みは5〜6も可（spec.md の例外）
    pen += 8 * over(r.succ, 0.42, 0.695);
    if (r.mirror) pen += 10 * over(r.firstWin, 0, 0.575);
    if (r.timeouts) pen += r.timeouts;
  });
  overall(rows).forEach(function (o) { pen += 20 * over(o.rate, 0.46, 0.54); });
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
    var is1801 = CH[r.i].id === 'k1801' || CH[r.j].id === 'k1801';
    var lab = CH[r.i].name + ' vs ' + CH[r.j].name + '（先攻 ' + (r.first === 0 ? CH[r.i].name : CH[r.j].name) + '）';
    if (r.winA < 0.35 || r.winA > 0.65) ng.push('勝率 ' + (r.winA * 100).toFixed(1) + '%: ' + lab);
    if (r.turns < (is1801 ? 5 : 6) || r.turns > 10) ng.push('手番 ' + r.turns.toFixed(1) + ': ' + lab);
    if (r.succ < 0.40 || r.succ > 0.70) ng.push('成功率 ' + (r.succ * 100).toFixed(1) + '%: ' + lab);
    if (r.mirror && r.firstWin >= 0.60) ng.push('ミラー先攻 ' + (r.firstWin * 100).toFixed(1) + '%: ' + lab);
    if (r.timeouts) ng.push('打ち切り ' + r.timeouts + ': ' + lab);
  });
  overall(rows).forEach(function (o) {
    if (o.rate < 0.45 || o.rate > 0.55) ng.push('総合勝率 ' + (o.rate * 100).toFixed(1) + '%: ' + o.name);
  });
  return ng;
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

// ---- 探索（焼きなまし） ----
function neighbor(P, rng) {
  var Q = JSON.parse(JSON.stringify(P));
  var ci; do { ci = Math.floor(rng() * Q.length); } while (FREE.length && FREE.indexOf(CH[ci].id) < 0);
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

if (ITERS > 0) {
  var srng = makeRng(SEED * 7919 + 17);
  var cur = P, curPen = penalty(evaluate(cur, N, SEED), cur);
  var best = cur, bestPen = curPen, bestRows = evaluate(cur, N, SEED);
  var T = parseFloat(args.temp || '0.4');
  for (var it = 0; it < ITERS; it++) {
    var Q = neighbor(cur, srng);
    if (!valid(Q)) continue;
    var rows = evaluate(Q, N, SEED), pen = penalty(rows, Q);
    if (pen < curPen || srng() < Math.exp((curPen - pen) / T)) { cur = Q; curPen = pen; }
    if (pen < bestPen) { best = Q; bestPen = pen; bestRows = rows; }
    T *= 0.9993;
    if (it % 250 === 0) console.error('it ' + it + ' cur ' + curPen.toFixed(3) + ' best ' + bestPen.toFixed(3) + ' ng ' + ngList(bestRows).length);
  }
  P = best; setParams(P);
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(P, null, 1));
}

// ---- 元の数値へ戻せるだけ戻す（貪欲・1パラメータずつ） ----
if (args.revert) {
  var metricPen = function (rows) { var save = DIST_W; DIST_W = 0; var v = penalty(rows, P); DIST_W = save; return v; };
  var TOL = metricPen(evaluate(P, N, SEED)) + parseFloat(args.tol || '0.02');
  console.error('revert tol ' + TOL.toFixed(3));
  var changed = true, pass = 0;
  while (changed && pass++ < 6) {
    changed = false;
    for (var ci2 = 0; ci2 < P.length; ci2++) {
      if (FREE.length && FREE.indexOf(CH[ci2].id) < 0) continue;
      var slots = [['hp']];
      P[ci2].moves.forEach(function (m, mi) { ['power', 'plus', 'healPlus', 'heal'].forEach(function (k) { if (m[k] != null) slots.push(['moves', mi, k]); }); });
      for (var si = 0; si < slots.length; si++) {
        var sl = slots[si];
        var curV = sl.length === 1 ? P[ci2].hp : P[ci2].moves[sl[1]][sl[2]];
        var origV = sl.length === 1 ? ORIG[ci2].hp : ORIG[ci2].moves[sl[1]][sl[2]];
        if (curV === origV) continue;
        var step = origV > curV ? 5 : -5;
        var Q2 = JSON.parse(JSON.stringify(P));
        if (sl.length === 1) Q2[ci2].hp += step; else Q2[ci2].moves[sl[1]][sl[2]] += step;
        if (!valid(Q2)) continue;
        var rows2 = evaluate(Q2, N, SEED), mp = metricPen(rows2);
        var tag = CH[ci2].name + ' ' + (sl.length === 1 ? 'hp' : CH[ci2].moves[sl[1]].name + '.' + sl[2]) + ' ' + curV + '→' + (curV + step);
        if (mp <= TOL && ngList(rows2).length === 0) { P = Q2; setParams(P); changed = true; console.error('revert OK ' + tag + ' pen ' + mp.toFixed(3)); }
        else console.error('revert NG ' + tag + ' pen ' + mp.toFixed(3));
      }
    }
  }
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(P, null, 1));
}

// ---- 評価結果 ----
var rowsF = evaluate(P, N, SEED);
console.log(fmtParams(P));
console.log('valid ' + valid(P) + ' / penalty ' + penalty(rowsF, P).toFixed(3) + ' (n=' + N + ' seed=' + SEED + ')');
var ngF = ngList(rowsF);
console.log('未達 ' + ngF.length + '件'); ngF.forEach(function (s) { console.log('- ' + s); });
var winRates = rowsF.map(function (r) { return r.winA; });
console.log('勝率レンジ ' + (Math.min.apply(null, winRates) * 100).toFixed(1) + '〜' + (Math.max.apply(null, winRates) * 100).toFixed(1) + '%');
var totS = rowsF.reduce(function (s, r) { return s + r.succ; }, 0) / rowsF.length;
console.log('成功率(行平均) ' + (totS * 100).toFixed(1) + '%  手番(行平均) ' + (rowsF.reduce(function (s, r) { return s + r.turns; }, 0) / rowsF.length).toFixed(2));
console.log('総合勝率: ' + overall(rowsF).map(function (o) { return o.name + ' ' + (o.rate * 100).toFixed(1) + '%'; }).join(' / '));
if (args.table) rowsF.forEach(function (r) {
  console.log((CH[r.i].name + ' vs ' + CH[r.j].name + ' 先攻' + (r.first === 0 ? CH[r.i].name : CH[r.j].name)) + ' | A勝率 ' + (r.winA * 100).toFixed(1) + ' | 手番 ' + r.turns.toFixed(1) + ' | 成功率 ' + (r.succ * 100).toFixed(1));
});
if (args.out && !ITERS && !args.revert) fs.writeFileSync(args.out, JSON.stringify(P, null, 1));
