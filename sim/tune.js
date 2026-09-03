#!/usr/bin/env node
// 担当: ✅ 検証係（マンガー×ファインマン）
// HP・威力の座標降下探索。engine.js の CHARS をランタイム上書き（ファイルは触らない）。
// 使い方: node sim/tune.js [start.json] [--n=400] [--iters=6] [--hponly] [--out=file.json]
'use strict';
var fs = require('fs');
var E = require('../engine.js');
var args = process.argv.slice(2);
var startFile = null, n = 400, iters = 6, hpOnly = false, outFile = null;
args.forEach(function (a) {
  if (a.indexOf('--n=') === 0) n = +a.slice(4);
  else if (a.indexOf('--iters=') === 0) iters = +a.slice(8);
  else if (a === '--hponly') hpOnly = true;
  else if (a.indexOf('--out=') === 0) outFile = a.slice(6);
  else startFile = a;
});
function makeRng(s0) { var s = s0 >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

var P = {};
E.CHARS.forEach(function (c) { P[c.id] = { hp: c.hp, power: c.moves.map(function (m) { return m.power; }) }; });
if (startFile) { var s = JSON.parse(fs.readFileSync(startFile, 'utf8')); Object.keys(s).forEach(function (id) { if (s[id].hp) P[id].hp = s[id].hp; if (s[id].power) P[id].power = s[id].power.slice(); }); }
function apply(p) { E.CHARS.forEach(function (c) { c.hp = p[c.id].hp; c.moves.forEach(function (m, i) { m.power = p[c.id].power[i]; }); }); }

function evaluate(p, seed) {
  apply(p);
  var loss = 0, sd = seed, per = {}; E.CHARS.forEach(function (c) { per[c.id] = { w: 0, k: 0 }; });
  for (var a = 0; a < E.CHARS.length; a++) for (var b = a; b < E.CHARS.length; b++) {
    var orders = (a === b) ? [[a, b]] : [[a, b], [b, a]];
    for (var o = 0; o < orders.length; o++) {
      var f = orders[o][0], s = orders[o][1], rng = makeRng(sd++), fw = 0, st = 0;
      for (var i = 0; i < n; i++) { var r = E.simulateBattle(E.CHARS[f], E.CHARS[s], rng, 0); if (r.winner === 0) fw++; st += r.turns; }
      var win = fw / n, t = st / n / 2;
      // 勝率: 40〜60%を安全圏として外れをペナルティ（目標35〜65に余裕を持たせる）
      var dw = Math.max(0, Math.abs(win - 0.5) - 0.10); loss += dw * dw * 100;
      // ターン: 5.5〜8.5を安全圏
      var dt = Math.max(0, 5.5 - t) + Math.max(0, t - 8.5); loss += dt * dt;
      if (f !== s) { per[E.CHARS[f].id].w += win; per[E.CHARS[f].id].k++; per[E.CHARS[s].id].w += 1 - win; per[E.CHARS[s].id].k++; }
    }
  }
  E.CHARS.forEach(function (c) { var d = per[c.id].w / per[c.id].k - 0.5; loss += d * d * 200; });
  return loss;
}
function clone(p) { return JSON.parse(JSON.stringify(p)); }

var seed = 555000;
var best = evaluate(P, seed);
console.log('start loss ' + best.toFixed(3));
for (var it = 0; it < iters; it++) {
  var improved = false;
  E.CHARS.forEach(function (c) {
    var id = c.id;
    var moves = [{ k: 'hp', d: 2 }, { k: 'hp', d: -2 }];
    if (!hpOnly) for (var mi = 0; mi < 3; mi++) { moves.push({ k: 'pw', i: mi, d: 1 }); moves.push({ k: 'pw', i: mi, d: -1 }); }
    moves.forEach(function (mv) {
      var q = clone(P);
      if (mv.k === 'hp') q[id].hp += mv.d; else q[id].power[mv.i] += mv.d;
      if (q[id].hp < 16 || q[id].power[0] < 2) return;
      if (q[id].power[1] < q[id].power[0] + 2 || q[id].power[2] < q[id].power[1] + 3) return; // 技②≥①+2, 技③≥②+3 で持ち味を維持
      var l = evaluate(q, seed);
      if (l < best - 1e-6) { best = l; P = q; improved = true; console.log('  it' + it + ' ' + id + ' ' + mv.k + (mv.i !== undefined ? mv.i : '') + (mv.d > 0 ? '+' : '') + mv.d + ' -> loss ' + l.toFixed(3)); }
    });
  });
  if (!improved) break;
}
console.log('final loss ' + best.toFixed(3));
console.log(JSON.stringify(P));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(P, null, 1));
