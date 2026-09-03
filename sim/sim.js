// 醸しコロ v2 実測: 21組×先攻後攻＝36通り（同キャラ含む）を既定2000戦
// 使い方: node sim/sim.js [回数]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

var N = parseInt(process.argv[2], 10) || 2000;
var CH = E.CHARS;

// 乱数（seed固定で再現できるようにする）
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
var rng = makeRng(20260903);

var rows = [];
var totDeclared = 0, totSuccess = 0;

for (var i = 0; i < CH.length; i++) {
  for (var j = i; j < CH.length; j++) {
    for (var f = 0; f < 2; f++) { // f=0: A先攻 / f=1: B先攻
      var winA = 0, turnSum = 0, dec = 0, suc = 0, timeouts = 0;
      for (var k = 0; k < N; k++) {
        var r = E.simulateBattle(CH[i], CH[j], rng, { first: f });
        if (r.winner === 0) winA++;
        turnSum += r.turnsPerSide;
        dec += r.declared; suc += r.success;
        if (r.timeout) timeouts++;
      }
      totDeclared += dec; totSuccess += suc;
      rows.push({
        a: CH[i], b: CH[j], first: f, mirror: i === j,
        winA: winA / N, turns: turnSum / N, succ: suc / dec, timeouts: timeouts
      });
    }
  }
}

function pc(x) { return (x * 100).toFixed(1) + '%'; }

console.log('# 醸しコロ v2 バランス実測（各 ' + N + ' 戦 / 全 ' + rows.length + ' 通り）\n');
console.log('| 組み合わせ | 先攻 | 先手側の勝率 | Aの勝率 | 平均手番(片側) | 宣言成功率 |');
console.log('|---|---|---|---|---|---|');
rows.forEach(function (r) {
  var firstName = r.first === 0 ? r.a.name : r.b.name;
  var firstWin = r.first === 0 ? r.winA : 1 - r.winA;
  console.log('| ' + r.a.emoji + r.a.name + ' vs ' + r.b.emoji + r.b.name + ' | ' + firstName +
    ' | ' + pc(firstWin) + ' | ' + pc(r.winA) + ' | ' + r.turns.toFixed(1) + ' | ' + pc(r.succ) + ' |');
});

console.log('\n## 全体');
console.log('- 宣言技の成功率（全体）: ' + pc(totSuccess / totDeclared) + '（しずく率 ' + pc(1 - totSuccess / totDeclared) + '）');
var allTurns = rows.reduce(function (s, r) { return s + r.turns; }, 0) / rows.length;
console.log('- 平均手番（片側・全組平均）: ' + allTurns.toFixed(1));

// ---- 目標未達だけ列挙（spec.md「バランス目標」） ----
var ng = [];
rows.forEach(function (r) {
  var label = r.a.name + ' vs ' + r.b.name + '（先攻: ' + (r.first === 0 ? r.a.name : r.b.name) + (r.mirror ? '・ミラー' : '') + '）';
  if (r.winA < 0.35 || r.winA > 0.65) ng.push('勝率 ' + pc(r.winA) + '（35〜65%外）: ' + label);
  if (r.turns < 6 || r.turns > 10) ng.push('平均手番 ' + r.turns.toFixed(1) + '（6〜10外）: ' + label);
  if (r.succ < 0.40 || r.succ > 0.70) ng.push('成功率 ' + pc(r.succ) + '（40〜70%外）: ' + label);
  if (r.mirror) {
    var fw = r.first === 0 ? r.winA : 1 - r.winA;
    if (fw >= 0.60) ng.push('ミラー先攻勝率 ' + pc(fw) + '（60%未満が目標）: ' + label);
  }
  if (r.timeouts) ng.push('打ち切り ' + r.timeouts + '戦: ' + label);
});

console.log('\n## 目標未達（' + ng.length + '件）');
if (!ng.length) console.log('- なし');
else ng.forEach(function (s) { console.log('- ' + s); });
