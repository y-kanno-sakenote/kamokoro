// 担当: ✅ 検証係（マンガー×ファインマン）
// ※これは v5 当時の記録用ツール。**v7で「しずく」は廃止**（失敗しても何も起きない）ので、下の +5 は当時の式のまま。現行の実測は sim/sim.js を使うこと
// 調整の当たりを付けるための机上計算: ★4技・素の面・エネコロ3個での
//   dpt = 1手番あたりの期待ダメージ（CPUは上位2技の交互＋しずく5＋自傷）
//   HP × dpt（相手を削る速さ × 自分の耐久）の積で、キャラの実力の当たりが付く（v4で実証）
// 使い方: node sim/dpt_v5.js [cand.json]
'use strict';
var path = require('path'), fs = require('fs');
var E = require(path.join(__dirname, '..', 'engine.js'));
var CH = E.CHARS;
if (process.argv[2]) {
  var P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
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
console.log('| キャラ | HP | ★4技の1手番期待値（与ダメ/回復/自傷） | dpt=与ダメ+回復 | HP×dpt |');
console.log('|---|---|---|---|---|');
CH.forEach(function (c) {
  var f = E.buildFighter(c);
  // CPU は「前手番の技を除く期待ダメージ最大」＝おおむね上位2技の交互。
  // 各技の1手番あたりの値を出し、上位2つを平均する（v4で使った近似）
  var rows = f.moves.map(function (m, i) {
    var p = E.successProb(f, m, 3);
    var h = E.orientProb(f, m.hit);
    var eff = m.eff || {};
    var dmg = 0, heal = 0, self = 0;
    if (m.kind === 'atk') {
      dmg = p * (m.power + h * (eff.plus || 0));
      heal = p * h * (eff.heal || 0);
      self = p * h * (eff.self || 0);
    } else if (m.kind === 'heal') {
      heal = p * (m.power + h * (eff.healPlus || 0));
    } else if (m.kind === 'guard') {
      heal = p * h * (eff.heal || 0);  // 半減ぶんは別勘定（ここでは回復だけ数える）
    }
    dmg += (1 - p) * 5;                                        // しずく
    if (c.ability && c.ability.failSelf) self += (1 - p) * c.ability.failSelf;
    return { name: m.name, v: dmg + heal - self, dmg: dmg, heal: heal, self: self, p: p };
  });
  var atk = rows.slice().sort(function (a, b) { return b.dmg - a.dmg; }).slice(0, 2);
  var dpt = (atk[0].v + atk[1].v) / 2;
  var d = (atk[0].dmg + atk[1].dmg) / 2, hl = (atk[0].heal + atk[1].heal) / 2, sf = (atk[0].self + atk[1].self) / 2;
  console.log('| ' + c.name + ' | ' + c.hp + ' | ' + atk.map(function (r) { return r.name; }).join('・')
    + ' ' + d.toFixed(1) + '/' + hl.toFixed(1) + '/' + sf.toFixed(1)
    + ' | ' + dpt.toFixed(2) + ' | ' + (c.hp * dpt).toFixed(0) + ' |');
});
