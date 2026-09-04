// 担当: ✅ 検証係（マンガー×ファインマン）
// いまの engine.js の CHARS から、調整できる数値だけ（hp / power / plus / healPlus / heal）を JSON に落とす
// 使い方: node sim/dump_params.js > sim/out/xxx.json
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var out = E.CHARS.map(function (c) {
  return {
    id: c.id, name: c.name, hp: c.hp,
    moves: c.moves.map(function (m) {
      var o = { name: m.name, g: m.g, kind: m.kind, power: m.power };
      if (m.eff && m.eff.plus != null) o.plus = m.eff.plus;
      if (m.eff && m.eff.healPlus != null) o.healPlus = m.eff.healPlus;
      if (m.eff && m.eff.heal != null) o.heal = m.eff.heal;
      return o;
    })
  };
});
console.log(JSON.stringify(out, null, 1));
