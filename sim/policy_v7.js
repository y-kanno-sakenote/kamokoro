// 担当: ✅ 検証係（マンガー×ファインマン）
// カモコロ v7 技選び方針の比較（★4技・素の面・3すくみON＝先攻は属性で決まる／ミラーはランダム）
//   EV   = 現行 engine.cpuChoose（期待ダメージ最大・前手番の技除外・HP30%以下で回復・倒せるなら回復しない）
//   RM   = ロマン優先: 撃てる攻撃技のうち威力(power)最大。同点なら成功率が高い方。支え技（回復/半減）はHP≤40%のときだけ
//   ST   = 堅実優先:   撃てる攻撃技のうち成功率(turnProb)最大。同点なら威力が高い方。支え技の扱いはRMと同じ
// 出力: 方針×方針の6体まわし（各キャラ×相手6体×N戦）勝率・手番、EVのロマン技選択頻度
// engine.js は読むだけ。sim.js の出力には触れない。
// 使い方: node sim/policy_v7.js [回数=2000] [--seed N] [--noadv]
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

var N = parseInt(process.argv[2], 10) || 2000;
var si = process.argv.indexOf('--seed');
var SEED = si >= 0 ? parseInt(process.argv[si + 1], 10) : 20260903;
E.setTypeAdv(process.argv.indexOf('--noadv') < 0);
var CH = E.CHARS;

// sim.js と同じ乱数（seed固定で再現できる）
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
function isSupport(mv) { return mv.kind !== 'atk'; }
var HEAL_LINE = 0.40;   // RM/ST が支え技を使うHP比の上限（依頼の定義。EVは engine 内の 0.3）

// ---- 方針 ----------------------------------------------------------------
function chooseEV(state, side) { return E.cpuChoose(state, side); }

// 支え技を使う局面か。使えるなら支え技の添字、使わない/使えないなら -1
function supportIfLow(state, side, avail) {
  var me = state.chars[side];
  if (state.hp[side] > state.maxHp[side] * HEAL_LINE) return -1;
  for (var i = 0; i < avail.length; i++) if (isSupport(me.moves[avail[i]])) return avail[i];
  return -1;
}
function chooseRM(state, side) {
  var me = state.chars[side], avail = E.availableMoves(state, side);
  var sp = supportIfLow(state, side, avail);
  if (sp >= 0) return sp;
  var best = -1, bp = -1, bq = -1;
  for (var i = 0; i < avail.length; i++) {
    var mv = me.moves[avail[i]];
    if (isSupport(mv)) continue;
    var q = E.turnProb(state, side, mv);
    if (mv.power > bp || (mv.power === bp && q > bq)) { best = avail[i]; bp = mv.power; bq = q; }
  }
  return best >= 0 ? best : avail[0];
}
function chooseST(state, side) {
  var me = state.chars[side], avail = E.availableMoves(state, side);
  var sp = supportIfLow(state, side, avail);
  if (sp >= 0) return sp;
  var best = -1, bp = -1, bq = -1;
  for (var i = 0; i < avail.length; i++) {
    var mv = me.moves[avail[i]];
    if (isSupport(mv)) continue;
    var q = E.turnProb(state, side, mv);
    if (q > bq || (q === bq && mv.power > bp)) { best = avail[i]; bp = mv.power; bq = q; }
  }
  return best >= 0 ? best : avail[0];
}
var POL = { EV: chooseEV, RM: chooseRM, ST: chooseST };
var POL_LABEL = { EV: 'EV（現行CPU）', RM: 'ロマン優先', ST: '堅実優先' };
var ORDER = ['EV', 'RM', 'ST'];

// ---- 1戦（engine.simulateBattle と同じ手順・同じ乱数消費。方針だけ差し替え） -----
// count: { [charId]: { [moveIdx]: 手番数 } } を渡すと、側Aの技選択を数える
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
  if (winner == null) {
    timeout = true;
    var ra = st.hp[0] / st.maxHp[0], rb = st.hp[1] / st.maxHp[1];
    winner = ra === rb ? 0 : (ra > rb ? 0 : 1);
  }
  return { winner: winner, turnsPerSide: (declared[0] + declared[1]) / 2, timeout: timeout };
}

// キャラ c（方針 pa）× 相手6体（方針 pb）。sim.js の runVsAll と同じ回し方（相手順・N戦）
function vsAll(c, pa, pb, rng, count) {
  var win = 0, tot = 0, turns = 0, to = 0, per = [];
  for (var j = 0; j < CH.length; j++) {
    var w = 0;
    for (var k = 0; k < N; k++) {
      var r = battle(c, CH[j], POL[pa], POL[pb], rng, count);
      if (r.winner === 0) { win++; w++; }
      turns += r.turnsPerSide; tot++;
      if (r.timeout) to++;
    }
    per.push(w / N);
  }
  return { win: win / tot, turns: turns / tot, timeouts: to, per: per };
}

// ---- 0. 自前ループの検算: EV vs EV が engine.simulateBattle と 1戦単位で一致するか ----
function selfCheck() {
  var rngA = makeRng(SEED), rngB = makeRng(SEED), diff = 0, tot = 0;
  CH.forEach(function (c) {
    for (var j = 0; j < CH.length; j++) for (var k = 0; k < N; k++) {
      var a = battle(c, CH[j], POL.EV, POL.EV, rngA);
      var b = E.simulateBattle(c.id, CH[j].id, rngB);
      tot++;
      if (a.winner !== b.winner || a.turnsPerSide !== b.turnsPerSide) diff++;
    }
  });
  return { diff: diff, tot: tot };
}

// ---- 本体 -----------------------------------------------------------------
function main() {
  var advTag = E.typeAdvOn() ? '3すくみON（有利側が先攻・ミラーはランダム）' : '3すくみOFF（先攻ランダム）';
  console.log('担当: ✅ 検証係（マンガー×ファインマン）');
  console.log('# カモコロ v7 技選び方針の比較（各キャラ×相手6体×' + N + '戦 / seed ' + SEED + ' / ' + advTag + '）');
  console.log('★4技・素の面。EV＝現行 `cpuChoose`／RM＝ロマン優先（威力最大・支え技はHP≤40%）／ST＝堅実優先（成功率最大・支え技は同上）\n');

  var chk = selfCheck();
  console.log('## 0. 検算（自前ループ EV vs EV ＝ engine.simulateBattle と1戦単位で一致するか）');
  console.log('- ' + chk.tot + '戦中 不一致 ' + chk.diff + '戦 → ' + (chk.diff === 0 ? '**一致**（方針の差し替え以外は engine と同じ手順）' : '**不一致**（この先の数値は信用しない）') + '\n');

  // ★4技の成功率と期待値（3個振り）。EVがロマン技を選ばない理由の骨格
  console.log('## 1. ★4技の成功率（エネコロ3個）と期待ダメージ（`cpuChoose` の評価値）');
  console.log('| キャラ | 安定 | 中 | ロマン | 支え |');
  console.log('|---|---|---|---|---|');
  CH.forEach(function (c) {
    var f = E.buildFighter(c.id), cells = [];
    c.star.forEach(function (i) {
      var m = c.moves[i], p = E.successProb(f, m, 3);
      var plus = m.eff && m.eff.plus ? m.eff.plus : 0;
      var ev = m.kind === 'atk' ? p * (m.power + E.orientProb(f, m.hit) * plus) : 0;
      cells.push(m.name + ' ' + pc(p) + (m.kind === 'atk' ? '／EV ' + ev.toFixed(1) : '／EV評価0'));
    });
    console.log('| ' + c.emoji + c.name + ' | ' + cells.join(' | ') + ' |');
  });

  // 方針×方針
  var res = {};
  ORDER.forEach(function (pa) {
    ORDER.forEach(function (pb) {
      var rng = makeRng(SEED), row = {};
      CH.forEach(function (c) { row[c.id] = vsAll(c, pa, pb, rng); });
      res[pa + '/' + pb] = row;
    });
  });

  function table(title, pa, pb, note) {
    console.log('\n' + title);
    if (note) console.log(note);
    console.log('| キャラ（' + POL_LABEL[pa] + '） | 勝率 | 平均手番(片側) | 打ち切り | 相手別（' + CH.map(function (c) { return c.emoji; }).join(' ') + '） |');
    console.log('|---|---|---|---|---|');
    var lo = 1, hi = 0;
    CH.forEach(function (c) {
      var r = res[pa + '/' + pb][c.id];
      lo = Math.min(lo, r.win); hi = Math.max(hi, r.win);
      console.log('| ' + c.emoji + c.name + ' | **' + pc(r.win) + '** | ' + r.turns.toFixed(1) + ' | ' + r.timeouts + ' | ' +
        r.per.map(pc).join(' / ') + ' |');
    });
    console.log('- 勝率レンジ: ' + pc(lo) + ' 〜 ' + pc(hi));
  }

  table('## 2. EV vs EV（基準。sim.js --v3 §1「既定構成の6体まわし」と同じ回し方）', 'EV', 'EV');
  table('## 3. ロマン優先 vs EV（ロマン側から見た勝率）', 'RM', 'EV',
    '人間が「威力最大の技を毎回狙う」遊び方をしたときの、現行CPUに対する勝率');
  table('## 4. 堅実優先 vs EV（堅実側から見た勝率）', 'ST', 'EV',
    '「成功率最大＝安定技ばかり」の遊び方をしたときの勝率');
  table('## 5. ロマン優先 vs ロマン優先（手番を見る）', 'RM', 'RM');
  table('## 6. 堅実優先 vs 堅実優先（手番を見る）', 'ST', 'ST');
  table('## 7. ロマン優先 vs 堅実優先', 'RM', 'ST');

  console.log('\n## 8. 方針×方針の総合勝率（6体平均・行＝自分の方針／列＝相手の方針）');
  console.log('| 自分＼相手 | ' + ORDER.map(function (p) { return POL_LABEL[p]; }).join(' | ') + ' |');
  console.log('|---|---|---|---|');
  ORDER.forEach(function (pa) {
    var cells = ORDER.map(function (pb) {
      var s = 0, t = 0;
      CH.forEach(function (c) { s += res[pa + '/' + pb][c.id].win; t += res[pa + '/' + pb][c.id].turns; });
      return pc(s / CH.length) + '（手番 ' + (t / CH.length).toFixed(1) + '）';
    });
    console.log('| ' + POL_LABEL[pa] + ' | ' + cells.join(' | ') + ' |');
  });

  // EVのロマン技選択頻度（EV vs EV・側Aの全手番）
  console.log('\n## 9. 現行CPU（EV）が各技を選ぶ手番の割合（EV vs EV・自分側の全手番・相手6体×' + N + '戦）');
  console.log('| キャラ | 安定 | 中 | **ロマン** | 支え | 手番数 |');
  console.log('|---|---|---|---|---|---|');
  var rngF = makeRng(SEED), dead = [];
  CH.forEach(function (c) {
    var count = {}, tot = 0;
    vsAll(c, 'EV', 'EV', rngF, count);
    var i;
    for (i = 0; i < 4; i++) tot += (count[i] || 0);
    var cells = [];
    for (i = 0; i < 4; i++) {
      var m = c.moves[c.star[i]], share = (count[i] || 0) / tot;
      cells.push(m.name + ' ' + pc(share) + '（' + (count[i] || 0) + '）');
      if (m.g === 'rm' && share < 0.01) dead.push(c.name + '・' + m.name + ' ' + pc(share));
    }
    console.log('| ' + c.emoji + c.name + ' | ' + cells.join(' | ') + ' | ' + tot + ' |');
  });
  console.log('- ロマン技の選択率が1%未満（＝死んでいる）: ' + (dead.length ? dead.join('／') : 'なし'));
}

main();
