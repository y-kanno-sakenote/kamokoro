// 担当: ✅ 検証係（マンガー×ファインマン）
// v5 の候補パラメータを「複数seed × N戦 × 42通り」で判定する（1seedの seed合わせを避ける）
// 使い方: node sim/check_v5.js cand.json [n] [seed1,seed2,...] [--adv|--noadv] [--rows]
//   --noadv（既定）: 3すくみOFF＝土台の判定。目標帯 勝率35〜65%
//   --adv          : 3すくみON。目標帯 勝率30〜70%
'use strict';
var path = require('path'), fs = require('fs');
var E = require(path.join(__dirname, '..', 'engine.js'));
var CH = E.CHARS;
var args = process.argv.slice(2);
var file = args.filter(function (a) { return a.indexOf('--') !== 0 && /\.json$/.test(a); })[0];
var nums = args.filter(function (a) { return a.indexOf('--') !== 0 && !/\.json$/.test(a); });
var n = parseInt(nums[0] || '2000', 10);
var seeds = (nums[1] || '20260903,777,20250101').split(',').map(Number);
var ADV = args.indexOf('--adv') >= 0;
var ROWS = args.indexOf('--rows') >= 0;
E.setTypeAdv(ADV);
var LO = ADV ? 0.30 : 0.35, HI = ADV ? 0.70 : 0.65;

if (file) {
  var P = JSON.parse(fs.readFileSync(file, 'utf8'));
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
function mrng(seed) { var s = seed >>> 0; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function pc(x) { return (x * 100).toFixed(1); }

var tag = (E.typeAdvOn() ? '3すくみON(+' + E.ADV_BONUS + ')' : '3すくみOFF') + ' 帯' + (LO * 100) + '〜' + (HI * 100);
console.log('# ' + (file || '（現行 engine.js）') + ' / ' + tag + ' / ' + n + '戦 × seed' + seeds.length);

var sumOv = CH.map(function () { return 0; });
seeds.forEach(function (seed) {
  var rng = mrng(seed), rows = [];
  for (var i = 0; i < CH.length; i++) for (var j = i; j < CH.length; j++) for (var f = 0; f < 2; f++) {
    var w = 0, t = 0, d = 0, s = 0, to = 0;
    for (var k = 0; k < n; k++) {
      var r = E.simulateBattle(CH[i], CH[j], rng, { first: f });
      if (r.winner === 0) w++;
      t += r.turnsPerSide; d += r.declared; s += r.success; if (r.timeout) to++;
    }
    rows.push({ i: i, j: j, f: f, mirror: i === j, winA: w / n, turns: t / n, succ: s / d, to: to });
  }
  var win = CH.map(function () { return 0; }), cnt = CH.map(function () { return 0; });
  rows.forEach(function (r) { win[r.i] += r.winA; cnt[r.i]++; win[r.j] += 1 - r.winA; cnt[r.j]++; });
  var ov = CH.map(function (c, k) { return win[k] / cnt[k]; });
  ov.forEach(function (x, k) { sumOv[k] += x / seeds.length; });
  var wr = rows.map(function (r) { return r.winA; });
  var t1801 = rows.filter(function (r) { return CH[r.i].id === 'k1801' || CH[r.j].id === 'k1801'; }).map(function (r) { return r.turns; });
  var tOther = rows.filter(function (r) { return !(CH[r.i].id === 'k1801' || CH[r.j].id === 'k1801'); }).map(function (r) { return r.turns; });
  var sc = rows.map(function (r) { return r.succ; });
  var ngW = rows.filter(function (r) { return r.winA < LO || r.winA > HI; });
  var ngS = rows.filter(function (r) { return r.succ < 0.40 || r.succ > 0.708; });
  var ngT = rows.filter(function (r) { var is = CH[r.i].id === 'k1801' || CH[r.j].id === 'k1801'; return r.turns < (is ? 5 : 6) || r.turns > 10; });
  var mir = rows.filter(function (r) { return r.mirror; }).map(function (r) { return r.f === 0 ? r.winA : 1 - r.winA; });
  var ngO = ov.filter(function (x) { return x < 0.45 || x > 0.55; }).length;
  console.log('seed ' + seed + ' | 勝率' + pc(Math.min.apply(null, wr)) + '〜' + pc(Math.max.apply(null, wr)) + ' (外' + ngW.length + ')'
    + ' | 手番 他' + Math.min.apply(null, tOther).toFixed(1) + '〜' + Math.max.apply(null, tOther).toFixed(1)
    + ' / 1801 ' + Math.min.apply(null, t1801).toFixed(2) + '〜' + Math.max.apply(null, t1801).toFixed(2) + ' (外' + ngT.length + ')'
    + ' | 成功率' + pc(Math.min.apply(null, sc)) + '〜' + pc(Math.max.apply(null, sc)) + ' (>70.8: ' + ngS.length + ')'
    + ' | ミラー先攻' + pc(Math.max.apply(null, mir))
    + ' | 総合 ' + ov.map(function (x) { return pc(x); }).join('/') + ' (外' + ngO + ')');
  if (ROWS) {
    ngW.forEach(function (r) { console.log('   勝率NG ' + CH[r.i].name + ' vs ' + CH[r.j].name + ' 先攻' + (r.f === 0 ? CH[r.i].name : CH[r.j].name) + ' = ' + pc(r.winA)); });
    ngT.forEach(function (r) { console.log('   手番NG ' + CH[r.i].name + ' vs ' + CH[r.j].name + ' 先攻' + (r.f === 0 ? CH[r.i].name : CH[r.j].name) + ' = ' + r.turns.toFixed(2)); });
    ngS.forEach(function (r) { console.log('   成功率NG ' + CH[r.i].name + ' vs ' + CH[r.j].name + ' = ' + pc(r.succ)); });
  }
});
console.log('平均総合（seed平均）: ' + CH.map(function (c, k) { return c.name + ' ' + pc(sumOv[k]); }).join(' / '));
