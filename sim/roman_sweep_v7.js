// 担当: ✅ 検証係（マンガー×ファインマン）
// v7.2 ロマン技の威力スイープ（★ロマン技の power だけを実行時に差し替えて測る）
//   測るもの: ① EV型CPUのロマン技選択率 ② EV vs EV の勝率/手番 ③ ロマン優先(RM) vs EV の勝率
// engine.js は書き換えない（メモリ上の CHARS.moves[].power だけ差し替える。power は成功率に無関係なので pcache は汚れない）
// 使い方: node sim/roman_sweep_v7.js [回数=500] --star 60 [--powers k14:55,k1801:50] [--noadv] [--seed N] [--full]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

function argv(name, def) { var i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
var N = parseInt(process.argv[2], 10) || 500;
var SEED = parseInt(argv('--seed', '20260903'), 10);
var FULL = process.argv.indexOf('--full') >= 0;
E.setTypeAdv(process.argv.indexOf('--noadv') < 0);
var CH = E.CHARS;

// ---- ★ロマン技の威力を差し替える -----------------------------------------
var starP = argv('--star', null);
var over = {};
(argv('--powers', '') || '').split(',').forEach(function (s) {
  if (!s) return; var kv = s.split(':'); over[kv[0]] = parseInt(kv[1], 10);
});
var applied = [];
CH.forEach(function (c) {
  var mi = c.star.filter(function (i) { return c.moves[i].g === 'rm'; });
  mi.forEach(function (i) {
    var p = over[c.id] != null ? over[c.id] : (starP != null ? parseInt(starP, 10) : c.moves[i].power);
    c.moves[i].power = p;
    applied.push(c.name + '・' + c.moves[i].name + '=' + p);
  });
});

function makeRng(seed) { var s = seed >>> 0; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function pc(x) { return (x * 100).toFixed(1) + '%'; }
function isSupport(mv) { return mv.kind !== 'atk'; }
var HEAL_LINE = 0.40;

function chooseEV(state, side) { return E.cpuChoose(state, side); }
function supportIfLow(state, side, avail) {
  var me = state.chars[side];
  if (state.hp[side] > state.maxHp[side] * HEAL_LINE) return -1;
  for (var i = 0; i < avail.length; i++) if (isSupport(me.moves[avail[i]])) return avail[i];
  return -1;
}
function chooseRM(state, side) {
  var me = state.chars[side], avail = E.availableMoves(state, side);
  var sp = supportIfLow(state, side, avail); if (sp >= 0) return sp;
  var best = -1, bp = -1, bq = -1;
  for (var i = 0; i < avail.length; i++) {
    var mv = me.moves[avail[i]]; if (isSupport(mv)) continue;
    var q = E.turnProb(state, side, mv);
    if (mv.power > bp || (mv.power === bp && q > bq)) { best = avail[i]; bp = mv.power; bq = q; }
  }
  return best >= 0 ? best : avail[0];
}
function chooseST(state, side) {
  var me = state.chars[side], avail = E.availableMoves(state, side);
  var sp = supportIfLow(state, side, avail); if (sp >= 0) return sp;
  var best = -1, bp = -1, bq = -1;
  for (var i = 0; i < avail.length; i++) {
    var mv = me.moves[avail[i]]; if (isSupport(mv)) continue;
    var q = E.turnProb(state, side, mv);
    if (q > bq || (q === bq && mv.power > bp)) { best = avail[i]; bp = mv.power; bq = q; }
  }
  return best >= 0 ? best : avail[0];
}
var POL = { EV: chooseEV, RM: chooseRM, ST: chooseST };

function battle(charA, charB, polA, polB, rng, count) {
  var st = E.newState(charA, charB, rng);
  var guard = 0, cap = 400, declared = [0, 0];
  while (!st.over && guard++ < cap) {
    var side = st.turn;
    var mi = (side === 0 ? polA : polB)(st, side);
    if (count && side === 0) count[mi] = (count[mi] || 0) + 1;
    E.resolveTurn(st, mi, rng);
    declared[side]++;
  }
  var winner = st.winner, timeout = false;
  if (winner == null) { timeout = true; var ra = st.hp[0] / st.maxHp[0], rb = st.hp[1] / st.maxHp[1]; winner = ra === rb ? 0 : (ra > rb ? 0 : 1); }
  return { winner: winner, turnsPerSide: (declared[0] + declared[1]) / 2, timeout: timeout };
}
function vsAll(c, pa, pb, rng, count) {
  var win = 0, tot = 0, turns = 0, per = [];
  for (var j = 0; j < CH.length; j++) {
    var w = 0;
    for (var k = 0; k < N; k++) {
      var r = battle(c, CH[j], POL[pa], POL[pb], rng, count);
      if (r.winner === 0) { win++; w++; }
      turns += r.turnsPerSide; tot++;
    }
    per.push(w / N);
  }
  return { win: win / tot, turns: turns / tot, per: per };
}

// ---- 測定 -----------------------------------------------------------------
var rngA = makeRng(SEED), evRow = {}, share = {};
CH.forEach(function (c) {
  var count = {}, tot = 0, i;
  evRow[c.id] = vsAll(c, 'EV', 'EV', rngA, count);
  for (i = 0; i < 4; i++) tot += (count[i] || 0);
  var s = 0;
  for (i = 0; i < 4; i++) if (c.moves[c.star[i]].g === 'rm') s += (count[i] || 0);
  share[c.id] = s / tot;
});
var rngB = makeRng(SEED), rmRow = {};
CH.forEach(function (c) { rmRow[c.id] = vsAll(c, 'RM', 'EV', rngB); });

var stRow = null;
if (FULL) { var rngC = makeRng(SEED); stRow = {}; CH.forEach(function (c) { stRow[c.id] = vsAll(c, 'ST', 'EV', rngC); }); }

// ★4技の EV（cpuChoose の評価値・3個振り）
function evOf(c, i) {
  var f = E.buildFighter(c.id), m = c.moves[i], p = E.successProb(f, m, 3);
  var plus = m.eff && m.eff.plus ? m.eff.plus : 0;
  return m.kind === 'atk' ? { p: p, ev: p * (m.power + E.orientProb(f, m.hit) * plus) } : { p: p, ev: 0 };
}

console.log('担当: ✅ 検証係（マンガー×ファインマン）');
console.log('# ロマン技スイープ  N=' + N + ' seed=' + SEED + ' adv=' + E.typeAdvOn());
console.log('威力: ' + applied.join(' / '));
console.log('| キャラ | ★ロマン威力 | ロマンEV | 安定EV | 中EV | ロマン選択率 | EV勝率 | EV手番 | RM勝率 |');
console.log('|---|---|---|---|---|---|---|---|---|');
var lo = 1, hi = 0, sum = 0, tsum = 0, rmlo = 1, rmhi = 0, rmsum = 0, shlo = 1;
CH.forEach(function (c) {
  var e = {}, rmName = '', rmPow = 0;
  c.star.forEach(function (i) { var g = c.moves[i].g; e[g] = evOf(c, i); if (g === 'rm') { rmName = c.moves[i].name; rmPow = c.moves[i].power; } });
  var r = evRow[c.id];
  lo = Math.min(lo, r.win); hi = Math.max(hi, r.win); sum += r.win; tsum += r.turns;
  rmlo = Math.min(rmlo, rmRow[c.id].win); rmhi = Math.max(rmhi, rmRow[c.id].win); rmsum += rmRow[c.id].win;
  shlo = Math.min(shlo, share[c.id]);
  console.log('| ' + c.emoji + c.name + ' | ' + rmName + ' ' + rmPow + ' | ' + e.rm.ev.toFixed(1) + ' | ' + e.st.ev.toFixed(1) + ' | ' + e.md.ev.toFixed(1) +
    ' | **' + pc(share[c.id]) + '** | ' + pc(r.win) + ' | ' + r.turns.toFixed(1) + ' | **' + pc(rmRow[c.id].win) + '** |');
});
console.log('- EV勝率レンジ ' + pc(lo) + '〜' + pc(hi) + ' / 総合 ' + pc(sum / 6) + ' / 平均手番 ' + (tsum / 6).toFixed(1));
console.log('- RM vs EV レンジ ' + pc(rmlo) + '〜' + pc(rmhi) + ' / 総合 ' + pc(rmsum / 6) + ' / ロマン選択率の最小 ' + pc(shlo));
if (stRow) {
  var slo = 1, shi = 0, ssum = 0;
  CH.forEach(function (c) { slo = Math.min(slo, stRow[c.id].win); shi = Math.max(shi, stRow[c.id].win); ssum += stRow[c.id].win; });
  console.log('- ST vs EV レンジ ' + pc(slo) + '〜' + pc(shi) + ' / 総合 ' + pc(ssum / 6));
  console.log('| キャラ | ST勝率 |'); console.log('|---|---|');
  CH.forEach(function (c) { console.log('| ' + c.emoji + c.name + ' | ' + pc(stRow[c.id].win) + ' |'); });
}
