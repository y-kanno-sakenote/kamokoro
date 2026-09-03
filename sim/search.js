#!/usr/bin/env node
// 担当: ✅ 検証係（マンガー×ファインマン）
// バランス探索用の検証スクリプト。engine.js の CHARS をランタイムで上書きして全組を回す。
// 使い方: node sim/search.js [N] [params.json] [--noeffects] [--seed=NNN] [--dpt]
'use strict';
var fs = require('fs');
var E = require('../engine.js');

var args = process.argv.slice(2);
var N = 2000, paramFile = null, noEffects = false, seed = 777001, showDpt = false, quiet = false, second4 = false, secondHp = 0;
args.forEach(function (a) {
  if (/^\d+$/.test(a)) N = parseInt(a, 10);
  else if (a === '--noeffects') noEffects = true;
  else if (a === '--dpt') showDpt = true;
  else if (a === '--second4') second4 = true;
  else if (a.indexOf('--secondhp=') === 0) secondHp = +a.slice(11);
  else if (a === '--quiet') quiet = true;
  else if (a.indexOf('--seed=') === 0) seed = parseInt(a.slice(7), 10);
  else paramFile = a;
});

function makeRng(s0) {
  var s = s0 >>> 0 || 1;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
var SYM = { R: E.RICE, W: E.WATER, H: E.HEAT };
function parseCost(str) { return str.split('').map(function (c) { return SYM[c]; }); }

// params: { kyokai7: { hp: 40, power: [4,7,11], cost: ["R","RW","RRW"] }, ... }
function applyParams(p) {
  Object.keys(p).forEach(function (id) {
    var c = E.getChar(id); if (!c) throw new Error('unknown char ' + id);
    var q = p[id];
    if (q.hp !== undefined) c.hp = q.hp;
    if (q.power) q.power.forEach(function (v, i) { c.moves[i].power = v; });
    if (q.cost) q.cost.forEach(function (v, i) { c.moves[i].cost = parseCost(v); });
    if (q.recoil !== undefined) c.recoil = q.recoil;
  });
}
if (paramFile) applyParams(JSON.parse(fs.readFileSync(paramFile, 'utf8')));
if (noEffects) E.CHARS.forEach(function (c) { c.moves.forEach(function (m) { delete m.effect; }); c.recoil = 0; });

// 1キャラ単独の期待ダメージ/手番（3個振り・CPU振り直し・効果なし）としずく率
function dpt(char, n, rng) {
  var sum = 0, shz = 0;
  for (var i = 0; i < n; i++) {
    var st = E.newState(char, char, 0);
    var t = E.playTurn(st, 0, rng);
    sum += t.result.damage; if (t.result.shizuku) shz++;
  }
  return { dpt: sum / n, shizuku: shz / n };
}

function battle(cf, cs, rng) {
  if (!second4 && !secondHp) return E.simulateBattle(cf, cs, rng, 0);
  var st = E.newState(cf, cs, 0); if (second4) st.sides[1].extraDie = true; st.sides[1].hp += secondHp;
  var turns = 0, shz = 0, winner = -1, cur = 0;
  while (turns < 400) {
    var t = E.playTurn(st, cur, rng); turns++; if (t.result.shizuku) shz++;
    if (st.sides[1 - cur].hp <= 0) { winner = cur; break; }
    if (st.sides[cur].hp <= 0) { winner = 1 - cur; break; }
    cur = 1 - cur;
  }
  return { winner: winner, turns: turns, shizuku: shz };
}
var GOAL = { winMin: 0.35, winMax: 0.65, turnMin: 5, turnMax: 9, shizukuMax: 0.30 };
var rows = [];
var sd = seed;
for (var a = 0; a < E.CHARS.length; a++) for (var b = a; b < E.CHARS.length; b++) {
  var orders = (a === b) ? [[a, b]] : [[a, b], [b, a]];
  orders.forEach(function (ord) {
    var f = ord[0], s = ord[1], rng = makeRng(sd++);
    var fw = 0, st = 0, shz = 0;
    for (var i = 0; i < N; i++) {
      var r = battle(E.CHARS[f], E.CHARS[s], rng);
      if (r.winner === 0) fw++; st += r.turns; shz += r.shizuku;
    }
    rows.push({ f: E.CHARS[f], s: E.CHARS[s], win: fw / N, turns: st / N / 2, shz: shz / st });
  });
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }
var ng = 0, minWin = 1, maxWin = 0, minT = 99, maxT = 0, minS = 1, maxS = 0, mirrorMin = 1, mirrorMax = 0;
var lines = ['| 先攻 | 後攻 | 先攻勝率 | 平均ターン(片側) | しずく率 | 判定 |', '|---|---|---:|---:|---:|---|'];
rows.forEach(function (r) {
  var bad = [];
  if (r.win < GOAL.winMin || r.win > GOAL.winMax) bad.push('勝率');
  if (r.turns < GOAL.turnMin || r.turns > GOAL.turnMax) bad.push('ターン');
  if (r.shz >= GOAL.shizukuMax) bad.push('しずく');
  if (bad.length) ng++;
  minWin = Math.min(minWin, r.win); maxWin = Math.max(maxWin, r.win);
  minT = Math.min(minT, r.turns); maxT = Math.max(maxT, r.turns);
  minS = Math.min(minS, r.shz); maxS = Math.max(maxS, r.shz);
  if (r.f === r.s) { mirrorMin = Math.min(mirrorMin, r.win); mirrorMax = Math.max(mirrorMax, r.win); }
  lines.push('| ' + r.f.emoji + r.f.name + ' | ' + r.s.emoji + r.s.name + ' | ' + pct(r.win) + ' | ' + r.turns.toFixed(1) + ' | ' + pct(r.shz) + ' | ' + (bad.length ? 'NG:' + bad.join(',') : 'ok') + ' |');
});
// キャラ別の総合勝率（先攻後攻・全相手平均。ミラー除く）
var per = {};
E.CHARS.forEach(function (c) { per[c.id] = { w: 0, n: 0 }; });
rows.forEach(function (r) { if (r.f === r.s) return; per[r.f.id].w += r.win; per[r.f.id].n++; per[r.s.id].w += 1 - r.win; per[r.s.id].n++; });

if (!quiet) { console.log(lines.join('\n')); console.log(''); }
console.log('N=' + N + ' seed=' + seed + (noEffects ? ' [効果なし]' : '') + (second4 ? ' [後攻初手4個]' : '') + (secondHp ? ' [後攻HP+' + secondHp + ']' : '') + (paramFile ? ' params=' + paramFile : ''));
console.log('未達 ' + ng + '/' + rows.length + ' | 勝率 ' + pct(minWin) + '〜' + pct(maxWin) + ' | ミラー先攻勝率 ' + pct(mirrorMin) + '〜' + pct(mirrorMax) + ' | ターン ' + minT.toFixed(1) + '〜' + maxT.toFixed(1) + ' | しずく ' + pct(minS) + '〜' + pct(maxS));
console.log('キャラ別総合勝率: ' + E.CHARS.map(function (c) { return c.name + ' ' + pct(per[c.id].w / per[c.id].n); }).join(' / '));
if (showDpt) {
  var rng2 = makeRng(4242);
  console.log('キャラ別 期待ダメージ/手番(効果なし3個) としずく率: ' + E.CHARS.map(function (c) { var d = dpt(c, 20000, rng2); return c.name + ' HP' + c.hp + ' dpt' + d.dpt.toFixed(2) + ' HP×dpt' + (c.hp * d.dpt).toFixed(0) + ' しずく' + pct(d.shizuku); }).join(' / '));
}
