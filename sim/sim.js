// カモコロ 実測（v7: しずく廃止・3すくみは「有利側が先攻」）
//  回帰（既定）: 21組×先攻後攻＝42通りを既定2000戦。既定構成（★4技・素の面）＋6体の総合勝率
//               → 表は42通りぜんぶ出すが、3すくみONのときは**ルール上あり得る先攻**（属性の有利側／
//                 ミラーは両方）だけを「成立」とし、総合勝率・レンジ・目標未達は成立ぶんで数える
//  --v3        : 技セット総当たり・ダイス総当たり・上限内最強 vs 既定・ドロップ期待値・手持ちチップの最良
//  --noadv     : 3すくみを切って測る（engine の切り替えフラグ。既定はON）。OFF＝先攻は全組ランダム
// 使い方: node sim/sim.js [回数] [--v3] [--noadv]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

var N = parseInt(process.argv[2], 10) || 2000;
var V3 = process.argv.indexOf('--v3') >= 0;
// --bring : 「手持ちチップの最良 vs 既定」だけを測り直す軽い経路
var BRING_ONLY = process.argv.indexOf('--bring') >= 0 && !V3;
// --noadv : 属性3すくみOFF（有利ボーナスを無効に）。ON/OFF 両方を測るための切り替え
var NOADV = process.argv.indexOf('--noadv') >= 0;
E.setTypeAdv(!NOADV);
var ADVTAG = E.typeAdvOn() ? '3すくみON（有利側が先攻）' : '3すくみOFF（先攻ランダム）';
var CH = E.CHARS;
// 「上限内最強 vs 既定」の目標（2026-09-05 裁定で 85%→90%）
var GOAL = 0.90;
var LAP_WINS = 6;   // 1周で倒す相手の数（ドロップ期待値に使う）

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
function atr(c) { return E.attrLabel(c.attr); }

// =====================================================================
// 回帰（既定構成のまま。42通り＝21組×先攻後攻）
// =====================================================================
function runV2() {
  var rng = makeRng(20260903);
  var rows = [];
  var totDeclared = 0, totSuccess = 0;
  var acc = {}, cnt = {};
  CH.forEach(function (c) { acc[c.id] = 0; cnt[c.id] = 0; });

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
        // v7: 3すくみONだと先攻は属性で決まる。この (組, 先攻) がルール上成立するか
        var mirror = i === j;
        var legal = !E.typeAdvOn() || mirror ||
          (f === 0 ? E.hasAdv(CH[i].attr, CH[j].attr) : E.hasAdv(CH[j].attr, CH[i].attr));
        if (legal) {
          totDeclared += dec; totSuccess += suc;
          acc[CH[i].id] += winA / N; cnt[CH[i].id]++;
          acc[CH[j].id] += 1 - winA / N; cnt[CH[j].id]++;
        }
        rows.push({
          a: CH[i], b: CH[j], first: f, mirror: mirror, legal: legal,
          winA: winA / N, turns: turnSum / N, succ: suc / dec, timeouts: timeouts
        });
      }
    }
  }

  var legalRows = rows.filter(function (r) { return r.legal; });
  console.log('# カモコロ v7 既定構成（★4技・素の面）のバランス実測（各 ' + N + ' 戦 / 全 ' + rows.length + ' 通り）');
  console.log('属性: ' + ATTR_LINE() + '／' + ADVTAG);
  console.log('先攻の決まり方: ' + (E.typeAdvOn()
    ? '**属性の有利側が先攻**（ミラーはランダム）。表は42通り出すが、集計は**成立 ' + legalRows.length + ' 通り**だけ'
    : '**全組ランダム**（42通りすべて成立）') + '\n');
  console.log('| 組み合わせ | 先攻 | 成立 | 先手側の勝率 | Aの勝率 | 平均手番(片側) | 宣言成功率 |');
  console.log('|---|---|---|---|---|---|---|');
  rows.forEach(function (r) {
    var firstName = r.first === 0 ? r.a.name : r.b.name;
    var firstWin = r.first === 0 ? r.winA : 1 - r.winA;
    var mark = r.legal ? (r.mirror || !E.typeAdvOn() ? 'ランダム' : '相性') : '—';
    console.log('| ' + r.a.emoji + r.a.name + ' vs ' + r.b.emoji + r.b.name + ' | ' + firstName +
      ' | ' + mark + ' | ' + pc(firstWin) + ' | ' + pc(r.winA) + ' | ' + r.turns.toFixed(1) + ' | ' + pc(r.succ) + ' |');
  });

  console.log('\n## 6体の総合勝率（成立ぶんの平均・属性つき）');
  console.log('| キャラ | 属性 | 総合勝率 |');
  console.log('|---|---|---|');
  CH.forEach(function (c) {
    console.log('| ' + c.emoji + c.name + ' | ' + atr(c) + ' | ' + pc(acc[c.id] / cnt[c.id]) + ' |');
  });

  console.log('\n## 全体');
  console.log('- 宣言技の成功率（全体）: ' + pc(totSuccess / totDeclared) + '（失敗率 ' + pc(1 - totSuccess / totDeclared) + '）');
  var allTurns = legalRows.reduce(function (s, r) { return s + r.turns; }, 0) / legalRows.length;
  console.log('- 平均手番（片側・成立ぶんの平均）: ' + allTurns.toFixed(1));
  var ws = legalRows.map(function (r) { return r.winA; });
  console.log('- 勝率レンジ: ' + pc(Math.min.apply(null, ws)) + ' 〜 ' + pc(Math.max.apply(null, ws)));

  // ---- 目標未達だけ列挙（spec_v5.md「目標帯」: OFF=35〜65% / ON=30〜70%） ----
  var LO = E.typeAdvOn() ? 0.30 : 0.35, HI = E.typeAdvOn() ? 0.70 : 0.65;
  var ng = [];
  legalRows.forEach(function (r) {
    var label = r.a.name + ' vs ' + r.b.name + '（先攻: ' + (r.first === 0 ? r.a.name : r.b.name) +
      (r.mirror ? '・ミラー' : (E.typeAdvOn() ? '・相性' : '')) + '）';
    if (r.winA < LO || r.winA > HI) ng.push('勝率 ' + pc(r.winA) + '（' + (LO * 100) + '〜' + (HI * 100) + '%外）: ' + label);
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

function ATTR_LINE() {
  return E.ATTR_ORDER.map(function (a) {
    var ns = CH.filter(function (c) { return c.attr === a; }).map(function (c) { return c.name; });
    return E.attrLabel(a) + '=' + ns.join('・');
  }).join(' / ') + '（3すくみ 麹→米→水→麹・有利側が先攻）';
}

// =====================================================================
// --v3（測定項目）。相手は常に CPU＝★4技・素の面。
// 先攻は engine が決める（ONなら属性の有利側・ミラーはランダム／OFFなら全組ランダム）
// =====================================================================

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
// 面の多重集合キー（並び順は確率に効かないので、同じ集合になる置き方は畳む）
function faceKey(char, ch) {
  return E.facesSig(E.buildDie(char, ch).slice().sort(function (x, y) {
    return x.join('+') < y.join('+') ? -1 : 1;
  }));
}
// v6: 差し替えられるのは **カスタム3面（E.CUSTOM_SLOTS）だけ**。固定3面（属性×2＋✨）は常に素の面
function eachPlacement(opts, fn) {
  var L = opts.length, n = E.CUSTOM_N, total = Math.pow(L, n), i, t, ch;
  for (var c = 0; c < total; c++) {
    ch = new Array(E.SLOTS_N); t = c;
    for (i = 0; i < E.SLOTS_N; i++) ch[i] = null;
    for (i = 0; i < n; i++) { ch[E.CUSTOM_SLOTS[i]] = opts[t % L]; t = Math.floor(t / L); }
    fn(ch);
  }
}
// ダイス1個ぶんの候補。上限（属性3面・他2面）内で全列挙し、6面が同じになるものは畳む
function dieSets(char) {
  var opts = [null].concat(E.CHIP_ORDER), out = [], seen = {};
  eachPlacement(opts, function (ch) {
    if (!E.validateDie(char, ch).ok) return;
    var sig = faceKey(char, ch);
    if (seen[sig]) return;
    seen[sig] = 1; out.push(ch.slice());
  });
  return out;
}
// v5: 3個ぶんの順序つき直積は 1個の候補^3 で数万通りになるので **2段階**にした。
//   段1: 1個ぶんの候補を「3個とも同じ構成」で粗く測って順位づけ
//   段2: 上位 K 個だけで順序つき直積（K^3）を作り、そこから最良を選ぶ
// （並びが意味を持つ＝先攻1手目と「相手の次エネコロ-1」で右から抜けるため畳めない）
function diceSetsFrom(top) {
  var out = [], i, j, k;
  for (i = 0; i < top.length; i++) for (j = 0; j < top.length; j++) for (k = 0; k < top.length; k++)
    out.push([top[i], top[j], top[k]]);
  return out;
}
function rankDieCands(char, cands, NS, rng, K) {
  var res = cands.map(function (ch) {
    return { ch: ch, w: runVsAll(char.id, { chips: [ch, ch, ch] }, NS, rng) };
  });
  res.sort(function (x, y) { return y.w - x.w; });
  return res.slice(0, K).map(function (r) { return r.ch; });
}

// ---- 手持ちチップ（engine.js の START_CHIPS）の探索 -------------------------
// 勝率は「3個それぞれの面の集合」だけで決まるので、置き方（どのスロットに置くか）ではなく
// **面の集合**で畳み、在庫で組めるかは「使用ベクトルの組み合わせが1つでもあるか」で判定する。
// 枚数・内訳はキャラごとに違う（engine.js が正）。ここに枚数をハードコードしない。
function invVec(char) {
  var inv = E.startChips(char);
  return E.CHIP_ORDER.map(function (k) { return inv[k]; });
}
function kindVec(ch) {
  var v = E.CHIP_ORDER.map(function () { return 0; }), i, sl;
  for (i = 0; i < E.CUSTOM_SLOTS.length; i++) {
    sl = E.CUSTOM_SLOTS[i];
    if (ch[sl]) v[E.CHIP_ORDER.indexOf(ch[sl])]++;
  }
  return v;
}
// 面の集合ごとに { ch: 代表の置き方, vs: [その面を作れる使用ベクトル] }
function bringDieGroups(char) {
  var inv = invVec(char), opts = [null].concat(E.CHIP_ORDER), map = {}, order = [];
  eachPlacement(opts, function (ch) {
    var i, q, sl;
    for (i = 0; i < E.CUSTOM_SLOTS.length; i++) {
      sl = E.CUSTOM_SLOTS[i];
      if (ch[sl] && ch[sl] === char.slots[sl]) return;   // 「同じ面です」
    }
    var v = kindVec(ch);
    for (q = 0; q < inv.length; q++) if (v[q] > inv[q]) return;   // 種類ごとの在庫
    if (!E.validateDie(char, ch).ok) return;             // 上限（属性3面・他2面）
    var fk = faceKey(char, ch);
    if (!map[fk]) { map[fk] = { ch: ch.slice(), vs: [] }; order.push(fk); }
    var sig = v.join('');
    if (map[fk].vs.every(function (x) { return x.join('') !== sig; })) map[fk].vs.push(v);
  });
  return order.map(function (k) { return map[k]; });
}
// 3個ぶん（左・中・右）のうち、手持ちの在庫で実際に組めるものを全列挙
function bringDiceSets(char) {
  var G = bringDieGroups(char), inv = invVec(char), out = [], i, j, k;
  function fits(A, B, C) {
    for (var a = 0; a < A.length; a++) for (var b = 0; b < B.length; b++) for (var d = 0; d < C.length; d++) {
      var ok = true;
      for (var q = 0; q < inv.length; q++) if (A[a][q] + B[b][q] + C[d][q] > inv[q]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  for (i = 0; i < G.length; i++) for (j = 0; j < G.length; j++) for (k = 0; k < G.length; k++) {
    if (fits(G[i].vs, G[j].vs, G[k].vs)) out.push([G[i].ch, G[j].ch, G[k].ch]);
  }
  return { cands: G.length, sets: out };
}

// 表示は SLOT_ORDER（🔒固定3面 → カスタム3面）の順。[ ]＝固定 / ( )＝カスタムの素の面
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

// 上位ダイス × 上位技セットを N 戦で詰めて「最良構成 vs 初期構成」を出す
function pinch(title, base, topDice, topMoves, N, rng, goal) {
  console.log('\n' + title);
  console.log('| キャラ | 最強構成（技 / ダイス） | 最強の勝率 | 初期の勝率 | 差 |');
  console.log('|---|---|---|---|---|');
  var worst = 0, worstLabel = '';
  CH.forEach(function (c) {
    var b0 = base[c.id], best = null;
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
  console.log('- **最良構成の勝率（全キャラ最大）: ' + pc(worst) + '**（' + worstLabel + '）／目標は' +
    (goal * 100).toFixed(0) + '%以下 → ' + (worst <= goal ? 'OK' : 'NG'));
  return worst;
}

// 初期構成（★4技・素の面）の6体まわし勝率
function baseWins(N, rng, quiet) {
  var base = {};
  if (!quiet) { console.log('| キャラ | 属性 | 6体まわしの勝率 |'); console.log('|---|---|---|'); }
  CH.forEach(function (c) {
    base[c.id] = runVsAll(c.id, null, N, rng);
    if (!quiet) console.log('| ' + c.emoji + c.name + ' | ' + atr(c) + ' | ' + pc(base[c.id]) + ' |');
  });
  return base;
}

// 技セット総当たり（C(7,4)=35・素の面）→ 上位 TOP
function searchMoves(MS, NS, TOP, rng, quiet) {
  var topMoves = {}, over70m = 0;
  if (!quiet) {
    console.log('| キャラ | 最強の技セット | 勝率 | 70%超の数 |');
    console.log('|---|---|---|---|');
  }
  CH.forEach(function (c) {
    var res = MS.map(function (mi) { return { mi: mi, w: runVsAll(c.id, { moves: mi }, NS, rng) }; });
    res.sort(function (x, y) { return y.w - x.w; });
    topMoves[c.id] = res.slice(0, TOP);
    var n70 = res.filter(function (r) { return r.w > 0.70; }).length;
    over70m += n70;
    if (!quiet) console.log('| ' + c.emoji + c.name + ' | ' + movesLabel(c, res[0].mi) + ' | ' + pc(res[0].w) + ' | ' + n70 + ' |');
  });
  if (!quiet) console.log('- 探索段階で70%を超えた技セット: 合計 ' + over70m + ' 件（' + NS + '戦の粗い値）');
  return topMoves;
}

// 手持ちチップ（配布のまま）の最良構成 vs 既定構成。枚数はキャラごとに engine.js から読む
function invLabel(char) {
  var g = E.startChips(char), tot = 0;
  var s = E.CHIP_ORDER.map(function (k) { tot += g[k]; return E.CHIPS[k].emoji + g[k]; }).join('');
  return s + '=' + tot + '枚';
}
function bringSection(base, topMoves, N, NS, TOP, rng) {
  console.log('\n## 手持ちチップ（初期配布のまま）から9枠を選んだ最良構成 vs 既定構成（各 ' + N + ' 戦・探索 ' + NS + ' 戦）');
  console.log('カスタム3面×3個＝9スロットへの置き方を、面の集合に畳んで**在庫で組める並びを全列挙**する');
  console.log('\n| キャラ | 初期配布 | 1個ぶんの面の集合 | 在庫内で組める3個の並び |');
  console.log('|---|---|---|---|');
  var topDice = {};
  CH.forEach(function (c) {
    var B = bringDiceSets(c);
    var res = B.sets.map(function (ch) { return { ch: ch, w: runVsAll(c.id, { chips: ch }, NS, rng) }; });
    res.sort(function (x, y) { return y.w - x.w; });
    topDice[c.id] = res.slice(0, TOP);
    console.log('| ' + c.emoji + c.name + ' | ' + invLabel(c) + ' | ' + B.cands + ' | ' + B.sets.length + ' |');
  });
  var w = pinch('### 手持ちチップ＋技セットも自由（上位' + TOP + 'ダイス × 上位' + TOP + '技セット）',
    base, topDice, topMoves, N, rng, GOAL);
  var star = {};
  CH.forEach(function (c) { star[c.id] = [{ mi: c.star.slice(), w: 0 }]; });
  pinch('### 参考: 技は★4技のまま・手持ちチップだけ', base, topDice, star, N, rng, GOAL);
  return w;
}

function runV3() {
  var rng = makeRng(20260903);
  var MS = moveSets();
  var NS = Math.max(60, Math.floor(N / 10));   // 探索用（粗く回す）
  var TOP = 10;

  console.log('# カモコロ v7 実測（最終確認 ' + N + ' 戦 / 探索 ' + NS + ' 戦・相手は常に★4技＋素の面の6体）');
  console.log('属性: ' + ATTR_LINE() + '／' + ADVTAG);
  console.log('エネコロは左・中・右の3個。**固定3面（属性×2＋✨）＋カスタム3面**（差し替え先は 3×3＝9スロット）\n');

  console.log('## 1. 既定構成（★4技・素の面）の総合勝率');
  var base = baseWins(N, rng, false);

  console.log('\n## 2. 技セット総当たり（C(7,4)=35 × 6体・素の面）');
  var topMoves = searchMoves(MS, NS, TOP, rng, false);

  console.log('\n## 3. ダイス総当たり（1個ぶんを全列挙 → 上位' + TOP + 'の順序つき直積 × 6体・★4技）');
  console.log('| キャラ | 1個の候補 | 3個の通り数 | 最強のダイス | 勝率 |');
  console.log('|---|---|---|---|---|');
  var topDice = {};
  CH.forEach(function (c) {
    var D1 = dieSets(c);
    var top = rankDieCands(c, D1, NS, rng, TOP);
    var DS = diceSetsFrom(top);
    var res = DS.map(function (ch) {
      return { ch: ch, w: runVsAll(c.id, { chips: ch }, NS, rng) };
    });
    res.sort(function (x, y) { return y.w - x.w; });
    topDice[c.id] = res.slice(0, TOP);
    console.log('| ' + c.emoji + c.name + ' | ' + D1.length + ' | ' + DS.length + ' | ' +
      chipsLabel(c, res[0].ch) + ' | ' + pc(res[0].w) + ' |');
  });

  pinch('## 4. 上限内の最強構成 vs 既定構成（上位' + TOP + 'ダイス × 上位' + TOP + '技セット・各 ' + N + ' 戦）',
    base, topDice, topMoves, N, rng, GOAL);

  console.log('\n## 5. ドロップ期待値（1周＝6勝。4種の均等 1/4・相手タイプ寄りは廃止）');
  var exp = {};
  E.CHIP_ORDER.forEach(function (k) { exp[k] = LAP_WINS / E.DROP.length; });
  console.log('| チップ | 1周でもらえる期待枚数 |');
  console.log('|---|---|');
  E.CHIP_ORDER.forEach(function (k) {
    console.log('| ' + E.CHIPS[k].emoji + ' | ' + exp[k].toFixed(2) + ' |');
  });
  console.log('- 1周で6枚（4種のどれか・均等）。✨は全ダイスの固定面にあるので配られない');
  console.log('- チップ在庫は**キャラごと**なので、酵母を持ち替えると集め直しになる');

  bringSection(base, topMoves, N, NS, TOP, rng);
}

// --bring : 初期チップぶんだけを測り直す軽い経路
function runBringOnly() {
  var rng = makeRng(20260903);
  var NS = Math.max(60, Math.floor(N / 10)), TOP = 10;
  console.log('# カモコロ 初期配布チップの実測（最終確認 ' + N + ' 戦 / 探索 ' + NS + ' 戦・' + ADVTAG + '）');
  var base = baseWins(N, rng, true);
  var topMoves = searchMoves(moveSets(), NS, TOP, rng, true);
  bringSection(base, topMoves, N, NS, TOP, rng);
}

if (BRING_ONLY) runBringOnly();
else if (V3) runV3();
else runV2();
