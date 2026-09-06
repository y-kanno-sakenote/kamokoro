// 担当: ✅ 検証係（マンガー×ファインマン）
// 成長の弧: チップを積み切った型で ★ロマン技の成功率と、EV型CPUがロマンを選ぶ頻度がどう変わるか
// 3個とも同じ面（上限内・素の面と同じチップは置けない）に絞り、★ロマン技の成功率が最大の型を採る
// 使い方: node sim/roman_arc_v7.js [回数=1000]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var N = parseInt(process.argv[2], 10) || 1000;
var CH = E.CHARS;
function makeRng(seed) { var s = seed >>> 0; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function pc(x) { return (x * 100).toFixed(1) + '%'; }
var CUSTOM = E.CUSTOM_SLOTS, KEYS = [null, 'rice', 'koji', 'water', 'heat'];

// 1個ぶんの合法なチップ配置を全列挙（素の面と同じチップは不可・上限内）
function legalRows(c) {
  var out = [];
  KEYS.forEach(function (a) { KEYS.forEach(function (b) { KEYS.forEach(function (d) {
    var row = [null, null, null, null, null, null];
    row[CUSTOM[0]] = a; row[CUSTOM[1]] = b; row[CUSTOM[2]] = d;
    var i, ok = true;
    for (i = 0; i < CUSTOM.length; i++) {
      var k = row[CUSTOM[i]];
      if (k && c.slots[CUSTOM[i]] === k) ok = false;   // 素の面と同じ＝置けない
    }
    if (!ok) return;
    if (!E.validateDie(c, row).ok) return;
    out.push(row);
  }); }); });
  return out;
}
function battle(charA, charB, rng, loadA, count) {
  var st = E.newState(charA, charB, rng, loadA, null), guard = 0;
  while (!st.over && guard++ < 400) {
    var side = st.turn, mi = E.cpuChoose(st, side);
    if (count && side === 0) count[mi] = (count[mi] || 0) + 1;
    E.resolveTurn(st, mi, rng);
  }
  return st.winner;
}
console.log('担当: ✅ 検証係（マンガー×ファインマン）');
console.log('# 成長の弧（既定ダイス → 積み切った型）N=' + N + '／相手6体は常に既定（★4技・素の面）');
console.log('| キャラ | ★ロマン | 既定の成功率 | 積んだ型の面 | 積んだ型の成功率 | 既定のロマン選択率 | 積んだ型のロマン選択率 | 積んだ型の勝率 |');
console.log('|---|---|---|---|---|---|---|---|');
CH.forEach(function (c) {
  var ri = c.star.filter(function (i) { return c.moves[i].g === 'rm'; })[0];
  var rm = c.moves[ri];
  var f0 = E.buildFighter(c.id), p0 = E.successProb(f0, rm, 3);
  var best = null, bp = -1;
  legalRows(c).forEach(function (row) {
    var f = E.buildFighter(c.id, { chips: [row, row, row] });
    var p = E.successProb(f, rm, 3);
    if (p > bp) { bp = p; best = row; }
  });
  var load = { chips: [best, best, best] };
  var fb = E.buildFighter(c.id, load);
  function freq(ld) {
    var rng = makeRng(20260903), count = {}, tot = 0, win = 0, tt = 0, i;
    for (var j = 0; j < CH.length; j++) for (var k = 0; k < N; k++) { if (battle(c, CH[j], rng, ld, count) === 0) win++; tt++; }
    for (i = 0; i < 4; i++) tot += (count[i] || 0);
    var s = 0;
    for (i = 0; i < 4; i++) if (c.moves[c.star[i]].g === 'rm') s += (count[i] || 0);
    return { share: s / tot, win: win / tt };
  }
  var a = freq(null), b = freq(load);
  console.log('| ' + c.emoji + c.name + ' | ' + rm.name + ' ' + rm.power + ' | ' + pc(p0) + ' | ' +
    fb.energy[0].map(E.faceEmoji).join('') + ' | **' + pc(bp) + '** | ' + pc(a.share) + ' | **' + pc(b.share) + '** | ' + pc(b.win) + ' |');
});
