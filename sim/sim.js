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
// ダイス1個ぶん: カスタム4スロット（各スロット = 素の面 orチップ5種）を上限ルール内で全列挙し、
// 6面が同じになるものは畳む（spec_v3.md §2.1: ✨1面まで・同エネは固定込み2面まで）
// 実測すると全キャラ13通りに畳まれる
function dieSets(char) {
  var opts = [null].concat(E.CHIP_ORDER), out = [], seen = {}, L = opts.length;
  for (var a = 0; a < L; a++) for (var b = 0; b < L; b++)
    for (var c = 0; c < L; c++) for (var d = 0; d < L; d++) {
      var ch = [opts[a], opts[b], opts[c], opts[d]];
      if (!E.validateDie(char, ch).ok) continue;
      var sig = E.facesSig(E.buildDie(char, ch).slice().sort(function (x, y) {
        return x.join('+') < y.join('+') ? -1 : 1;
      }));
      if (seen[sig]) continue;
      seen[sig] = 1; out.push(ch);
    }
  return out;
}
// v3.1: エネコロは左・中・右の3個。個ごとに別々の構成が組めるので、
// 1個ぶんの候補（13通り）の**順序つき直積 13^3 = 2197 通りを全列挙**する。
// （並びが意味を持つ＝先攻1手目と「相手の次エネコロ-1」で右から振れなくなるため畳めない）
function diceSets(char) {
  var D = dieSets(char), out = [], i, j, k;
  for (i = 0; i < D.length; i++) for (j = 0; j < D.length; j++) for (k = 0; k < D.length; k++)
    out.push([D[i], D[j], D[k]]);
  return out;
}
function dieLabel(char, ch) {
  return ch.map(function (k, i) {
    return k ? E.CHIPS[k].emoji : '(' + E.ENERGY[char.slots[i]].emoji + ')';
  }).join('');
}
function chipsLabel(char, cs) {
  return cs.map(function (ch, d) { return E.DICE_LABEL[d] + dieLabel(char, ch); }).join(' ');
}

function movesLabel(char, mi) { return mi.map(function (i) { return char.moves[i].name; }).join('・'); }

function runV3() {
  var rng = makeRng(20260903);
  var MS = moveSets();
  var NS = Math.max(60, Math.floor(N / 10));   // 探索用（粗く回す）
  var TOP = 10;

  console.log('# 醸しコロ v3.1 実測（最終確認 ' + N + ' 戦 / 探索 ' + NS + ' 戦・相手は常に★4技＋素の面の6体）');
  console.log('エネコロは左・中・右の3個。3個それぞれ別々にカスタムできる（初期は3個とも同じ構成）\n');

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

  // ---- 3. ダイス総当たり（左・中・右の3個ぶん＝13^3 通り・★4技） ----
  console.log('\n## 3. ダイス総当たり（左・中・右それぞれ上限内の全通り × 6体・★4技）');
  console.log('| キャラ | 1個の候補 | 3個の通り数 | 最強のダイス | 勝率 |');
  console.log('|---|---|---|---|---|');
  var topDice = {};
  CH.forEach(function (c) {
    var D1 = dieSets(c), DS = diceSets(c);
    var res = DS.map(function (ch) {
      return { ch: ch, w: runVsAll(c.id, { chips: ch }, NS, rng) };
    });
    res.sort(function (x, y) { return y.w - x.w; });
    topDice[c.id] = res.slice(0, TOP);
    console.log('| ' + c.emoji + c.name + ' | ' + D1.length + ' | ' + DS.length + ' | ' +
      chipsLabel(c, res[0].ch) + ' | ' + pc(res[0].w) + ' |');
  });

  // ---- 4. 上限内の最強構成 vs 初期構成（上位10×上位10を N 戦で詰める） ----
  function pinch(title) {
    console.log('\n' + title);
    console.log('| キャラ | 最強構成（技 / ダイス） | 最強の勝率 | 初期の勝率 | 差 |');
    console.log('|---|---|---|---|---|');
    var worst = 0, worstLabel = '';
    CH.forEach(function (c) {
      var b0 = base[c.id];
      var best = null;
      topDice[c.id].forEach(function (d) {
        topMoves[c.id].forEach(function (m) {
          var w = runVsAll(c.id, { moves: m.mi, chips: d.ch }, N, rng);
          if (!best || w > best.w) best = { w: w, mi: m.mi, ch: d.ch };
        });
      });
      if (best.w > worst) { worst = best.w; worstLabel = c.name; }
      console.log('| ' + c.emoji + c.name + ' | ' + movesLabel(c, best.mi) + ' / ' + chipsLabel(c, best.ch) +
        ' | ' + pc(best.w) + ' | ' + pc(b0) + ' | +' + ((best.w - b0) * 100).toFixed(1) + 'pt |');
    });
    // 目標は 2026-09-03 の裁定で 80% → 85% に緩和（spec_v3.md 末尾「裁定」）
    console.log('- **最良構成の勝率（全キャラ最大）: ' + pc(worst) + '**（' + worstLabel + '）／目標は85%以下 → ' +
      (worst <= 0.85 ? 'OK' : 'NG（spec_v3.md 末尾の裁定を確認）'));
    return worst;
  }
  pinch('## 4. 上限内の最強構成 vs 初期構成（上位' + TOP + 'ダイス × 上位' + TOP + '技セット・各 ' + N + ' 戦）');

  // ---- 5. ドロップ期待値（乱数不要の計算） ----
  console.log('\n## 5. ドロップ期待値（1周＝6勝。相手6体は泡3・香3で固定）');
  var exp = {};
  E.CHIP_ORDER.forEach(function (k) { exp[k] = 0; });
  CH.forEach(function (c) {
    var tbl = E.DROP[E.typeKey(c)];
    tbl.forEach(function (k) { exp[k] += 1 / 6; });
  });
  var rareTotal = 2; // 3勝目・6勝目
  // 2エネ廃止（2026-09-03）でレア枠は6面の抽選ではなく✨固定になった。RARE の枚数で均等割る
  E.RARE.forEach(function (k) { exp[k] += rareTotal / E.RARE.length; });
  console.log('| チップ | 1周でもらえる期待枚数 |');
  console.log('|---|---|');
  E.CHIP_ORDER.forEach(function (k) {
    console.log('| ' + E.CHIPS[k].emoji + ' | ' + exp[k].toFixed(2) + ' |');
  });
  console.log('- 1周で 通常6枚＋レア' + rareTotal + '枚。ただし✨は1ダイスに1面まで（初期構成の✨1面で埋まっている）ので、' +
    'どの個もカスタム4面をレアで埋めることはできない（spec_v3.md §2.1）。' +
    '差し替え先が4→12スロットに増えたぶん、集めきるまでの周回は長くなる（ドロップ率は据え置き）');
}

if (V3) runV3(); else runV2();
