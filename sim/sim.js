// 醸しコロ 実測
//  v2回帰（既定）: 21組×先攻後攻＝36通り（同キャラ含む）を既定2000戦。初期構成（★4技・素の面）
//  v3（--v3）   : 技セット総当たり・ダイス総当たり・レア最強構成 vs 初期構成・ドロップ期待値
// 使い方: node sim/sim.js [回数] [--v3]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

var N = parseInt(process.argv[2], 10) || 2000;
var V3 = process.argv.indexOf('--v3') >= 0;
var CH = E.CHARS;

// 乱数（seed固定で再現できるようにする）
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

// =====================================================================
// v2回帰（初期構成のまま。v3実装後もここが同じ数字を出すことが回帰テスト）
// =====================================================================
function runV2() {
  var rng = makeRng(20260903);
  var rows = [];
  var totDeclared = 0, totSuccess = 0;

  for (var i = 0; i < CH.length; i++) {
    for (var j = i; j < CH.length; j++) {
      for (var f = 0; f < 2; f++) { // f=0: A先攻 / f=1: B先攻
        var winA = 0, turnSum = 0, dec = 0, suc = 0, timeouts = 0;
        for (var k = 0; k < N; k++) {
          var r = E.simulateBattle(CH[i], CH[j], rng, { first: f });
          if (r.winner === 0) winA++;
          turnSum += r.turnsPerSide;
          dec += r.declared; suc += r.success;
          if (r.timeout) timeouts++;
        }
        totDeclared += dec; totSuccess += suc;
        rows.push({
          a: CH[i], b: CH[j], first: f, mirror: i === j,
          winA: winA / N, turns: turnSum / N, succ: suc / dec, timeouts: timeouts
        });
      }
    }
  }

  console.log('# 醸しコロ 初期構成（★4技・素の面）のバランス実測（各 ' + N + ' 戦 / 全 ' + rows.length + ' 通り）\n');
  console.log('| 組み合わせ | 先攻 | 先手側の勝率 | Aの勝率 | 平均手番(片側) | 宣言成功率 |');
  console.log('|---|---|---|---|---|---|');
  rows.forEach(function (r) {
    var firstName = r.first === 0 ? r.a.name : r.b.name;
    var firstWin = r.first === 0 ? r.winA : 1 - r.winA;
    console.log('| ' + r.a.emoji + r.a.name + ' vs ' + r.b.emoji + r.b.name + ' | ' + firstName +
      ' | ' + pc(firstWin) + ' | ' + pc(r.winA) + ' | ' + r.turns.toFixed(1) + ' | ' + pc(r.succ) + ' |');
  });

  console.log('\n## 全体');
  console.log('- 宣言技の成功率（全体）: ' + pc(totSuccess / totDeclared) + '（しずく率 ' + pc(1 - totSuccess / totDeclared) + '）');
  var allTurns = rows.reduce(function (s, r) { return s + r.turns; }, 0) / rows.length;
  console.log('- 平均手番（片側・全組平均）: ' + allTurns.toFixed(1));

  // ---- 目標未達だけ列挙（spec.md「バランス目標」） ----
  var ng = [];
  rows.forEach(function (r) {
    var label = r.a.name + ' vs ' + r.b.name + '（先攻: ' + (r.first === 0 ? r.a.name : r.b.name) + (r.mirror ? '・ミラー' : '') + '）';
    if (r.winA < 0.35 || r.winA > 0.65) ng.push('勝率 ' + pc(r.winA) + '（35〜65%外）: ' + label);
    if (r.turns < 6 || r.turns > 10) ng.push('平均手番 ' + r.turns.toFixed(1) + '（6〜10外）: ' + label);
    if (r.succ < 0.40 || r.succ > 0.70) ng.push('成功率 ' + pc(r.succ) + '（40〜70%外）: ' + label);
    if (r.mirror) {
      var fw = r.first === 0 ? r.winA : 1 - r.winA;
      if (fw >= 0.60) ng.push('ミラー先攻勝率 ' + pc(fw) + '（60%未満が目標）: ' + label);
    }
    if (r.timeouts) ng.push('打ち切り ' + r.timeouts + '戦: ' + label);
  });

  console.log('\n## 目標未達（' + ng.length + '件）');
  if (!ng.length) console.log('- なし');
  else ng.forEach(function (s) { console.log('- ' + s); });
}

// =====================================================================
// v3（spec_v3.md §7 の測定項目）
// 相手は常に CPU＝★4技・素の面（spec_v3.md §1）。先攻はランダム
// =====================================================================

// 蔵めぐり1周ぶん（相手6体すべて）を n 戦ずつ回して勝率を返す
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

// C(7,4)=35 通りの技セット
function moveSets() {
  var out = [];
  for (var a = 0; a < 7; a++) for (var b = a + 1; b < 7; b++)
    for (var c = b + 1; c < 7; c++) for (var d = c + 1; d < 7; d++) out.push([a, b, c, d]);
  return out;
}
// 9種から重複ありで4枚 = 495通り
function diceSets() {
  var K = E.CHIP_ORDER, out = [];
  for (var a = 0; a < 9; a++) for (var b = a; b < 9; b++)
    for (var c = b; c < 9; c++) for (var d = c; d < 9; d++) out.push([K[a], K[b], K[c], K[d]]);
  return out;
}
function chipsLabel(ch) { return ch.map(function (k) { return E.CHIPS[k].emoji; }).join(' '); }
function movesLabel(char, mi) { return mi.map(function (i) { return char.moves[i].name; }).join('・'); }

function runV3() {
  var rng = makeRng(20260903);
  var MS = moveSets(), DS = diceSets();
  var NS = Math.max(60, Math.floor(N / 10));   // 探索用（粗く回す）
  var TOP = 10;

  console.log('# 醸しコロ v3 実測（最終確認 ' + N + ' 戦 / 探索 ' + NS + ' 戦・相手は常に★4技＋素の面の6体）\n');

  // ---- 1. 初期構成の総合勝率（回帰の目安。詳細は `node sim/sim.js` 側） ----
  console.log('## 1. 初期構成（★4技・素の面）の総合勝率');
  console.log('| キャラ | 6体まわしの勝率 |');
  console.log('|---|---|');
  var base = {};
  CH.forEach(function (c) {
    base[c.id] = runVsAll(c.id, null, N, rng);
    console.log('| ' + c.emoji + c.name + ' | ' + pc(base[c.id]) + ' |');
  });

  // ---- 2. 技セット総当たり（35通り・素の面） ----
  console.log('\n## 2. 技セット総当たり（C(7,4)=35 × 6体・素の面）');
  console.log('| キャラ | 最強の技セット | 勝率 | 70%超の数 |');
  console.log('|---|---|---|---|');
  var topMoves = {}, over70m = 0;
  CH.forEach(function (c) {
    var res = MS.map(function (mi) {
      return { mi: mi, w: runVsAll(c.id, { moves: mi }, NS, rng) };
    });
    res.sort(function (x, y) { return y.w - x.w; });
    topMoves[c.id] = res.slice(0, TOP);
    var n70 = res.filter(function (r) { return r.w > 0.70; }).length;
    over70m += n70;
    console.log('| ' + c.emoji + c.name + ' | ' + movesLabel(c, res[0].mi) + ' | ' + pc(res[0].w) + ' | ' + n70 + ' |');
  });
  console.log('- 探索段階で70%を超えた技セット: 合計 ' + over70m + ' 件（' + NS + '戦の粗い値）');

  // ---- 3. ダイス総当たり（495通り・★4技） ----
  console.log('\n## 3. ダイス総当たり（チップ4枚 495通り × 6体・★4技）');
  console.log('| キャラ | 最強のダイス | 勝率 |');
  console.log('|---|---|---|');
  var topDice = {};
  CH.forEach(function (c) {
    var res = DS.map(function (ch) {
      return { ch: ch, w: runVsAll(c.id, { chips: ch }, NS, rng) };
    });
    res.sort(function (x, y) { return y.w - x.w; });
    topDice[c.id] = res.slice(0, TOP);
    console.log('| ' + c.emoji + c.name + ' | ' + chipsLabel(res[0].ch) + ' | ' + pc(res[0].w) + ' |');
  });

  // ---- 4. レア最強構成 vs 初期構成（上位10×上位10を N 戦で詰める） ----
  console.log('\n## 4. レア最強構成 vs 初期構成（上位' + TOP + 'ダイス × 上位' + TOP + '技セット・各 ' + N + ' 戦）');
  console.log('| キャラ | 最強構成（技 / ダイス） | 最強の勝率 | 初期の勝率 | 差 |');
  console.log('|---|---|---|---|---|');
  var worst = 0, worstLabel = '';
  CH.forEach(function (c) {
    var best = null;
    topDice[c.id].forEach(function (d) {
      topMoves[c.id].forEach(function (m) {
        var w = runVsAll(c.id, { moves: m.mi, chips: d.ch }, N, rng);
        if (!best || w > best.w) best = { w: w, mi: m.mi, ch: d.ch };
      });
    });
    if (best.w > worst) { worst = best.w; worstLabel = c.name; }
    console.log('| ' + c.emoji + c.name + ' | ' + movesLabel(c, best.mi) + ' / ' + chipsLabel(best.ch) +
      ' | ' + pc(best.w) + ' | ' + pc(base[c.id]) + ' | +' + ((best.w - base[c.id]) * 100).toFixed(1) + 'pt |');
  });
  console.log('- **最良構成の勝率（全キャラ最大）: ' + pc(worst) + '**（' + worstLabel + '）／目標は80%以下 → ' +
    (worst <= 0.80 ? 'OK' : 'NG（spec_v3.md §7の抑え方を検討）'));

  // ---- 5. ドロップ期待値（乱数不要の計算） ----
  console.log('\n## 5. ドロップ期待値（1周＝6勝。相手6体は泡3・香3で固定）');
  var exp = {};
  E.CHIP_ORDER.forEach(function (k) { exp[k] = 0; });
  CH.forEach(function (c) {
    var tbl = E.DROP[E.typeKey(c)];
    tbl.forEach(function (k) { exp[k] += 1 / 6; });
  });
  var rareTotal = 2; // 3勝目・6勝目
  E.RARE.forEach(function (k) { exp[k] += rareTotal / 6; });
  console.log('| チップ | 1周でもらえる期待枚数 |');
  console.log('|---|---|');
  E.CHIP_ORDER.forEach(function (k) {
    console.log('| ' + E.CHIPS[k].emoji + ' | ' + exp[k].toFixed(2) + ' |');
  });
  console.log('- 1周で 通常6枚＋レア' + rareTotal + '枚。カスタム4面をレアで埋めるのに最短 ' +
    Math.ceil(4 / rareTotal) + '周');
}

if (V3) runV3(); else runV2();
