// 担当: 検証係。v6 初期配布チップ（枚数と内訳）だけを探索する測定スクリプト。
// engine.js は読むだけ（プロダクトの数値は書き換えない）。
//
// 仕組み:
//   1. ダイス1個ぶんの「面の多重集合」を上限内で全列挙し、その面を作れる使用ベクトル（チップ枚数）を全部持つ
//   2. 3個ぶんの順序つき直積（|G|^3）を ★4技で NS 戦ずつ測り、順位表を1回だけ作る（在庫に依存しない）
//   3. 任意の在庫について「在庫で組める三つ組」だけを表から拾えば、その在庫の最良が即分かる（proxy）
//   4. --pinch を付けると、上位10ダイス × 上位10技セットを N 戦で詰めて sim.js と同じ数え方の値を出す
// 乱数は候補ごとに同じ seed から引き直す（common random numbers。sim.js は1本の乱数列を共有する別方式）
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var CH = E.CHARS;

var NS = 200;      // 探索用
var N = 2000;      // 詰め用
var SEED = parseInt(process.env.CHIPSEED || '20260905', 10);   // CHIPSEED で別seedに振れる
var TOP = 10;

function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function pc(x) { return (x * 100).toFixed(1) + '%'; }

function runVsAll(charId, load, n, rng) {
  var win = 0, tot = 0;
  for (var j = 0; j < CH.length; j++) {
    for (var k = 0; k < n; k++) {
      var r = E.simulateBattle(charId, CH[j].id, rng, { loadA: load });
      if (r.winner === 0) win++;
      tot++;
    }
  }
  return win / tot;
}
function evalLoad(charId, load, n) { return runVsAll(charId, load, n, makeRng(SEED)); }

function eachPlacement(opts, fn) {
  var L = opts.length, n = E.CUSTOM_N, total = Math.pow(L, n), i, t, ch;
  for (var c = 0; c < total; c++) {
    ch = new Array(E.SLOTS_N); t = c;
    for (i = 0; i < E.SLOTS_N; i++) ch[i] = null;
    for (i = 0; i < n; i++) { ch[E.CUSTOM_SLOTS[i]] = opts[t % L]; t = Math.floor(t / L); }
    fn(ch);
  }
}
function faceKey(char, ch) {
  return E.facesSig(E.buildDie(char, ch).slice().sort(function (x, y) {
    return x.join('+') < y.join('+') ? -1 : 1;
  }));
}
function kindVec(ch) {
  var v = E.CHIP_ORDER.map(function () { return 0; }), i, sl;
  for (i = 0; i < E.CUSTOM_SLOTS.length; i++) {
    sl = E.CUSTOM_SLOTS[i];
    if (ch[sl]) v[E.CHIP_ORDER.indexOf(ch[sl])]++;
  }
  return v;
}
// 在庫の上限をかけずに全部の面の集合を出す（在庫判定は後段）
function dieGroups(char) {
  var opts = [null].concat(E.CHIP_ORDER), map = {}, order = [];
  eachPlacement(opts, function (ch) {
    var i, sl;
    for (i = 0; i < E.CUSTOM_SLOTS.length; i++) {
      sl = E.CUSTOM_SLOTS[i];
      if (ch[sl] && ch[sl] === char.slots[sl]) return;   // 「同じ面です」
    }
    if (!E.validateDie(char, ch).ok) return;             // 上限（属性3面・他2面）
    var fk = faceKey(char, ch);
    if (!map[fk]) { map[fk] = { ch: ch.slice(), vs: [] }; order.push(fk); }
    var v = kindVec(ch), sig = v.join('');
    if (map[fk].vs.every(function (x) { return x.join('') !== sig; })) map[fk].vs.push(v);
  });
  return order.map(function (k) { return map[k]; });
}
function fits(A, B, C, inv) {
  for (var a = 0; a < A.length; a++) for (var b = 0; b < B.length; b++) for (var d = 0; d < C.length; d++) {
    var ok = true;
    for (var q = 0; q < inv.length; q++) if (A[a][q] + B[b][q] + C[d][q] > inv[q]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
function dieLabel(char, ch) {
  return E.SLOT_ORDER.map(function (i) {
    if (E.isFixedSlot(i)) return '[' + E.ENERGY[char.slots[i]].emoji + ']';
    return ch[i] ? E.CHIPS[ch[i]].emoji : '(' + E.ENERGY[char.slots[i]].emoji + ')';
  }).join('');
}
function chipsLabel(char, cs) {
  return cs.map(function (ch, d) { return E.DICE_LABEL[d] + dieLabel(char, ch); }).join(' ');
}
function movesLabel(char, mi) { return mi.map(function (i) { return char.moves[i].name; }).join('・'); }
function moveSets() {
  var out = [];
  for (var a = 0; a < 7; a++) for (var b = a + 1; b < 7; b++)
    for (var c = b + 1; c < 7; c++) for (var d = c + 1; d < 7; d++) out.push([a, b, c, d]);
  return out;
}

// ---- 1キャラぶんの表を作る（重い。1回だけ） --------------------------------
function buildTable(char) {
  var G = dieGroups(char), rows = [], i, j, k;
  for (i = 0; i < G.length; i++) for (j = 0; j < G.length; j++) for (k = 0; k < G.length; k++) {
    rows.push({ g: [i, j, k], w: evalLoad(char.id, { chips: [G[i].ch, G[j].ch, G[k].ch] }, NS) });
  }
  rows.sort(function (x, y) { return y.w - x.w; });
  var MS = moveSets();
  var mres = MS.map(function (mi) { return { mi: mi, w: evalLoad(char.id, { moves: mi }, NS) }; });
  mres.sort(function (x, y) { return y.w - x.w; });
  return { G: G, rows: rows, moves: mres.slice(0, TOP) };
}

function invVecOf(obj) { return E.CHIP_ORDER.map(function (k) { return obj[k] || 0; }); }

// 在庫で組める三つ組のうち上位 lim 件
function fitting(T, inv, lim) {
  var out = [];
  for (var r = 0; r < T.rows.length && out.length < lim; r++) {
    var g = T.rows[r].g;
    if (fits(T.G[g[0]].vs, T.G[g[1]].vs, T.G[g[2]].vs, inv)) out.push(T.rows[r]);
  }
  return out;
}

function pinch(char, T, top, moves, n) {
  var best = null;
  top.forEach(function (r) {
    var chips = [T.G[r.g[0]].ch, T.G[r.g[1]].ch, T.G[r.g[2]].ch];
    moves.forEach(function (m) {
      var w = evalLoad(char.id, { moves: m.mi, chips: chips }, n);
      if (!best || w > best.w) best = { w: w, mi: m.mi, chips: chips };
    });
  });
  return best;
}

module.exports = { buildTable: buildTable, fitting: fitting, pinch: pinch, invVecOf: invVecOf,
  evalLoad: evalLoad, chipsLabel: chipsLabel, movesLabel: movesLabel, pc: pc, CH: CH, NS: NS, N: N, TOP: TOP };

if (require.main === module) {
  var fs = require('fs');
  var outPath = process.argv[2] || path.join(__dirname, 'out', 'chips_table.json');
  var t0 = Date.now();
  var dump = {};
  CH.forEach(function (c) {
    var T = buildTable(c);
    dump[c.id] = { rows: T.rows, moves: T.moves, G: T.G.map(function (g) { return { ch: g.ch, vs: g.vs }; }) };
    console.error(c.name + ': 面の集合 ' + T.G.length + ' / 三つ組 ' + T.rows.length +
      ' / 最良(無制限) ' + pc(T.rows[0].w) + ' / ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  });
  fs.writeFileSync(outPath, JSON.stringify(dump));
  console.error('wrote ' + outPath);
}
