#!/usr/bin/env node
// 全キャラ総当たりの大量ロール。 使い方: node sim/sim.js [1組あたりの回数]
// 数値の調整はここでは一切しない。実測して目標未達を並べるだけ。
'use strict';
var E = require('../engine.js');

var N = parseInt(process.argv[2], 10);
if (!N || N < 1) N = 2000;

// 再現性のある乱数（xorshift32）
function makeRng(seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

var GOAL = { winMin: 0.35, winMax: 0.65, turnMin: 5, turnMax: 9, shizukuMax: 0.30 };

var rows = [];
var seed = 20260903;

for (var a = 0; a < E.CHARS.length; a++) {
  for (var b = a; b < E.CHARS.length; b++) {
    // 同キャラは先攻/後攻が同一なので1通り、それ以外は先攻を入れ替えて2通り
    var orders = (a === b) ? [[a, b]] : [[a, b], [b, a]];
    for (var o = 0; o < orders.length; o++) {
      var f = orders[o][0], s = orders[o][1];
      var rng = makeRng(seed++);
      var firstWin = 0, sumTurns = 0, shizuku = 0, handCount = 0;
      for (var i = 0; i < N; i++) {
        // sides[0]=先攻キャラ、firstIdx=0 で固定
        var r = E.simulateBattle(E.CHARS[f], E.CHARS[s], rng, 0);
        if (r.winner === 0) firstWin++;
        sumTurns += r.turns;
        shizuku += r.shizuku;
        handCount += r.turns;
      }
      rows.push({
        first: E.CHARS[f], second: E.CHARS[s],
        winRate: firstWin / N,
        avgSideTurns: (sumTurns / N) / 2,
        shizukuRate: shizuku / handCount
      });
    }
  }
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

console.log('# 醸しコロ バランス実測（1組 ' + N + ' 戦 / 全 ' + rows.length + ' 組）');
console.log('');
console.log('| 先攻 | 後攻 | 先攻勝率 | 平均ターン(片側) | しずく率 |');
console.log('|---|---|---:|---:|---:|');
rows.forEach(function (r) {
  console.log('| ' + r.first.emoji + r.first.name + ' | ' + r.second.emoji + r.second.name +
    ' | ' + pct(r.winRate) + ' | ' + r.avgSideTurns.toFixed(1) + ' | ' + pct(r.shizukuRate) + ' |');
});

console.log('');
console.log('## バランス目標未達（勝率35〜65% / 平均ターン5〜9 / しずく率30%未満）');
var ng = 0;
rows.forEach(function (r) {
  var bad = [];
  if (r.winRate < GOAL.winMin || r.winRate > GOAL.winMax) bad.push('勝率 ' + pct(r.winRate));
  if (r.avgSideTurns < GOAL.turnMin || r.avgSideTurns > GOAL.turnMax) bad.push('ターン ' + r.avgSideTurns.toFixed(1));
  if (r.shizukuRate >= GOAL.shizukuMax) bad.push('しずく ' + pct(r.shizukuRate));
  if (bad.length) {
    ng++;
    console.log('- ' + r.first.emoji + r.first.name + ' 先攻 vs ' + r.second.emoji + r.second.name + ' … ' + bad.join(' / '));
  }
});
if (!ng) console.log('- なし（全組み合わせが目標内）');
console.log('');
console.log('未達 ' + ng + ' / ' + rows.length + ' 組');
