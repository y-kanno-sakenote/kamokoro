// 担当: ✅ 検証係（マンガー×ファインマン）
// engine.js の CHARS 内、指定した技名の power だけを書き換える（他の行は1文字も触らない）
// 使い方: node sim/set_power_v7.js "秋田の底力=60,おおむかし=65,..."
'use strict';
var fs = require('fs'), path = require('path');
var file = path.join(__dirname, '..', 'engine.js');
var src = fs.readFileSync(file, 'utf8');
var spec = (process.argv[2] || '').split(',').filter(Boolean);
spec.forEach(function (s) {
  var kv = s.split('='), name = kv[0], val = kv[1];
  var re = new RegExp("(\\{ name: '" + name + "',[^\\n]*?power: )(\\d+)");
  if (!re.test(src)) { console.error('見つからない: ' + name); process.exit(1); }
  src = src.replace(re, function (_, a, old) { console.log(name + ': ' + old + ' → ' + val); return a + val; });
});
fs.writeFileSync(file, src);
