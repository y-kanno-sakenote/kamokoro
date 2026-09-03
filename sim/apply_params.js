// 担当: ✅ 検証係（マンガー×ファインマン）
// 探索結果(JSON)の数値だけを engine.js の CHARS に書き戻す（hp / power / plus / healPlus / heal のみ。行構造は変えない）
// 使い方: node sim/apply_params.js sim/out/xxx.json [--dry]
'use strict';
var fs = require('fs'), path = require('path');
var enginePath = path.join(__dirname, '..', 'engine.js');
var E = require(enginePath);
var P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var dry = process.argv.indexOf('--dry') >= 0;
var src = fs.readFileSync(enginePath, 'utf8'), lines = src.split('\n'), changes = 0;
E.CHARS.forEach(function (c, ci) {
  // hp: "id: 'k6', ... hp: 110," の行
  var hpIdx = lines.findIndex(function (l) { return l.indexOf("id: '" + c.id + "'") >= 0 && /hp: \d+/.test(l); });
  if (hpIdx < 0) throw new Error('hp line not found ' + c.id);
  var nl = lines[hpIdx].replace(/hp: \d+/, 'hp: ' + P[ci].hp);
  if (nl !== lines[hpIdx]) { changes++; lines[hpIdx] = nl; }
  c.moves.forEach(function (m, mi) {
    var q = P[ci].moves[mi];
    var idx = lines.findIndex(function (l, k) { return k > hpIdx && l.indexOf("name: '" + m.name + "'") >= 0; });
    if (idx < 0) throw new Error('move line not found ' + m.name);
    var l = lines[idx], o = l;
    l = l.replace(/power: \d+/, 'power: ' + q.power);
    if (q.plus != null) l = l.replace(/plus: \d+/, 'plus: ' + q.plus);
    if (q.healPlus != null) l = l.replace(/healPlus: \d+/, 'healPlus: ' + q.healPlus);
    if (q.heal != null) l = l.replace(/heal: \d+/, 'heal: ' + q.heal);
    if (l !== o) { changes++; lines[idx] = l; if (dry) console.log('- ' + o.trim() + '\n+ ' + l.trim()); }
  });
});
console.log('changed lines: ' + changes + (dry ? ' (dry)' : ''));
if (!dry) fs.writeFileSync(enginePath, lines.join('\n'));
