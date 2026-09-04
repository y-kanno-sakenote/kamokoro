// 担当: ✅ 検証係（マンガー×ファインマン）
// base.json に「キャラ.項目=値」の変更を当てて新しい JSON を吐く（手組み調整の反復用）
// 使い方: node sim/mut_v5.js base.json "k14.hp=110" "k14.m0.plus=10" > cand.json
//   項目: <id>.hp / <id>.m<技index>.power / .plus / .healPlus / .heal
'use strict';
var fs = require('fs');
var P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function ch(id) { for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i]; throw new Error('no char ' + id); }
process.argv.slice(3).forEach(function (spec) {
  var kv = spec.split('=');
  var v = parseInt(kv[1], 10);
  var parts = kv[0].split('.');
  var c = ch(parts[0]);
  if (parts[1] === 'hp') { c.hp = v; return; }
  var mi = parseInt(parts[1].slice(1), 10);
  var f = parts[2];
  if (c.moves[mi][f] === undefined) throw new Error('no field ' + spec + ' (' + c.moves[mi].name + ')');
  c.moves[mi][f] = v;
});
console.log(JSON.stringify(P, null, 1));
