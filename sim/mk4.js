// 担当: ✅ 検証係（マンガー×ファインマン）
// 手組みのパラメータ案を JSON にする: node sim/mk4.js out.json "k9.hp=95" "k9.野白式.power=25" ...
'use strict';
var path=require('path'),fs=require('fs');
var E=require(path.join(__dirname,'..','engine.js'));
var base=process.env.BASE?JSON.parse(fs.readFileSync(process.env.BASE,'utf8')):null;
var P=E.CHARS.map(function(c,ci){
  if(base) return base[ci];
  return {hp:c.hp,moves:c.moves.map(function(m){var e=m.eff||{};return {power:m.power,plus:e.plus,healPlus:e.healPlus,heal:e.heal};})};
});
var out=process.argv[2];
process.argv.slice(3).forEach(function(spec){
  var kv=spec.split('='),v=parseInt(kv[1],10),parts=kv[0].split('.');
  var ci=E.CHARS.findIndex(function(c){return c.id===parts[0];});
  if(ci<0) throw new Error('char? '+spec);
  if(parts[1]==='hp'){P[ci].hp=v;return;}
  var mi=E.CHARS[ci].moves.findIndex(function(m){return m.name===parts[1];});
  if(mi<0) throw new Error('move? '+spec);
  P[ci].moves[mi][parts[2]]=v;
});
fs.writeFileSync(out,JSON.stringify(P,null,1));
console.log('wrote '+out);
