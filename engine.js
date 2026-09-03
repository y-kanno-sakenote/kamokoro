// 醸しコロ ロジック層（ブラウザ / node 両用）
// 数値は docs/spec.md v0 の叩き台をそのまま実装している。ここで勝手に調整しない。
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KamoshiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // エネルギー記号
  var RICE = '🌾', WATER = '💧', HEAT = '🔥', WILD = '✨';
  // エネコロ6面: 米米水水熱万能
  var ENERGY_FACES = [RICE, RICE, WATER, WATER, HEAT, WILD];
  // キャラコロ6面: 技①×3 / 技②×2 / 技③×1
  var CHAR_FACES = [0, 0, 0, 1, 1, 2];

  var CHARS = [
    {
      id: 'kyokai7', emoji: '🍶', name: '協会7号', hp: 20, tag: 'バランス型',
      moves: [
        { name: 'ぷくぷく', cost: [RICE], power: 4 },
        { name: '泡立ち', cost: [RICE, WATER], power: 7 },
        { name: '高泡', cost: [RICE, RICE, WATER], power: 11 }
      ]
    },
    {
      id: 'kyokai9', emoji: '🍎', name: '協会9号', hp: 16, tag: '紙装甲・高火力',
      moves: [
        { name: 'りんごの香り', cost: [WATER], power: 4 },
        { name: '吟醸のかおり', cost: [WATER, WATER], power: 8 },
        { name: 'メロン爆発', cost: [WATER, WATER, HEAT], power: 14 }
      ]
    },
    {
      id: 'kikoji', emoji: '🌸', name: '黄麹', hp: 20, tag: 'サポート型',
      moves: [
        { name: '糖化', cost: [RICE], power: 3, effect: 'extraDie' },
        { name: '破精込み', cost: [RICE, HEAT], power: 6 },
        { name: '突き破精', cost: [RICE, RICE, HEAT], power: 10 }
      ]
    },
    {
      id: 'nyusan', emoji: '🥛', name: '乳酸菌', hp: 22, tag: '守り型',
      moves: [
        { name: 'すっぱ', cost: [WATER], power: 3 },
        { name: '乳酸バリア', cost: [WATER, HEAT], power: 4, effect: 'barrier' },
        { name: '雑菌一掃', cost: [WATER, WATER, HEAT], power: 10 }
      ]
    },
    {
      id: 'yamada', emoji: '🌾', name: '山田錦', hp: 26, tag: '重量級',
      moves: [
        { name: '心白', cost: [RICE], power: 3 },
        { name: '大粒', cost: [RICE, RICE], power: 7 },
        { name: '酒米の王', cost: [RICE, RICE, RICE], power: 13 }
      ]
    },
    {
      id: 'omachi', emoji: '🔥', name: '雄町', hp: 18, tag: 'ハイリスク',
      moves: [
        { name: 'とろける', cost: [HEAT], power: 5 },
        { name: 'どろどろ', cost: [HEAT, HEAT], power: 9 },
        { name: 'オマチスト', cost: [HEAT, HEAT, RICE], power: 15 }
      ],
      recoil: 2 // しずくになると自分も2ダメージ
    }
  ];

  function getChar(id) {
    for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i];
    return null;
  }

  function pick(arr, rng) { return arr[Math.floor((rng || Math.random)() * arr.length)]; }

  // キャラコロを1回振って技インデックス(0..2)を返す
  function rollCharDie(char, rng) { return pick(CHAR_FACES, rng); }

  // エネコロを1個振る
  function rollEnergyDie(rng) { return pick(ENERGY_FACES, rng); }

  // エネコロをn個振る
  function rollEnergy(n, rng) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(rollEnergyDie(rng));
    return out;
  }

  // コストに対して、どのダイスを使うかを貪欲に割り当てる（実物優先→✨で埋める）
  // 戻り値: { ok: コストを満たせたか, mask: 使ったダイスのbool配列 }
  function matchCost(cost, faces) {
    var mask = new Array(faces.length).fill(false);
    var need = cost.slice();
    var i, j;
    // 実物マッチを先に取る
    for (i = need.length - 1; i >= 0; i--) {
      for (j = 0; j < faces.length; j++) {
        if (!mask[j] && faces[j] === need[i]) { mask[j] = true; need.splice(i, 1); break; }
      }
    }
    // 残りを✨で埋める
    for (i = need.length - 1; i >= 0; i--) {
      for (j = 0; j < faces.length; j++) {
        if (!mask[j] && faces[j] === WILD) { mask[j] = true; need.splice(i, 1); break; }
      }
    }
    return { ok: need.length === 0, mask: mask };
  }

  function canPay(cost, faces) { return matchCost(cost, faces).ok; }

  // 出た技が払えなければ下位の技へフォールバック。払えるうち最も威力の高い技インデックスを返す（-1=しずく）
  function bestPayableIdx(char, moveIdx, faces) {
    var best = -1, bestPow = -1;
    for (var i = 0; i <= moveIdx; i++) {
      var m = char.moves[i];
      if (canPay(m.cost, faces) && m.power > bestPow) { best = i; bestPow = m.power; }
    }
    return best;
  }

  // CPUの振り直し規則: 技のコストに当たるダイスは固定、それ以外を振り直す。
  // コストが満たされていれば振り直さない（=全部固定）。
  // 戻り値: keepMask（true=固定）
  function cpuKeepMask(char, moveIdx, energyFaces) {
    var m = matchCost(char.moves[moveIdx].cost, energyFaces);
    if (m.ok) return new Array(energyFaces.length).fill(true);
    return m.mask;
  }

  // 技の解決。state = { attacker, defender }（sideオブジェクトを直接書き換える）
  function resolveMove(char, moveIdx, energyFaces, state) {
    var atk = state.attacker, def = state.defender;
    var usedIdx = bestPayableIdx(char, moveIdx, energyFaces);
    var res = {
      rolledIdx: moveIdx, usedIdx: usedIdx, shizuku: usedIdx < 0,
      moveName: null, damage: 0, halved: false, selfDamage: 0, effect: null
    };

    if (usedIdx < 0) {
      res.moveName = 'しずく';
      res.damage = 1;
      res.selfDamage = char.recoil || 0; // 雄町の自傷
    } else {
      var mv = char.moves[usedIdx];
      res.moveName = mv.name;
      res.damage = mv.power;
      res.effect = mv.effect || null;
    }

    // 受け手の半減（切り上げ）。1回受けたら解除
    if (def.barrier) { res.damage = Math.ceil(res.damage / 2); res.halved = true; def.barrier = false; }

    def.hp -= res.damage;
    if (res.selfDamage) atk.hp -= res.selfDamage;

    if (res.effect === 'extraDie') atk.extraDie = true;   // 黄麹: 次の自分ターンはエネコロ4個
    if (res.effect === 'barrier') atk.barrier = true;     // 乳酸菌: 次に受けるダメージ半減

    return res;
  }

  function makeSide(char) {
    return { char: char, hp: char.hp, maxHp: char.hp, barrier: false, extraDie: false };
  }

  function newState(charA, charB, firstIdx) {
    return { sides: [makeSide(charA), makeSide(charB)], turnIdx: (firstIdx === undefined ? 0 : firstIdx), turnCount: 0 };
  }

  // 1手番を丸ごと処理する。keepFn(char, moveIdx, faces) -> keepMask（省略時はCPU規則）
  // reroll=false なら振り直しをしない
  function playTurn(state, atkIdx, rng, keepFn) {
    rng = rng || Math.random;
    var atk = state.sides[atkIdx], def = state.sides[1 - atkIdx];
    var moveIdx = rollCharDie(atk.char, rng);
    var n = atk.extraDie ? 4 : 3;
    atk.extraDie = false; // 効果はこのターンで消費
    var first = rollEnergy(n, rng);
    var keep = (keepFn || cpuKeepMask)(atk.char, moveIdx, first);
    var faces = first.map(function (f, i) { return keep[i] ? f : rollEnergyDie(rng); });
    var result = resolveMove(atk.char, moveIdx, faces, { attacker: atk, defender: def });
    state.turnCount++;
    return { attacker: atkIdx, diceCount: n, moveIdx: moveIdx, firstFaces: first, keep: keep, faces: faces, result: result };
  }

  // 1戦まるごと。firstIdx省略時は先攻ランダム
  function simulateBattle(charA, charB, rng, firstIdx) {
    rng = rng || Math.random;
    if (firstIdx === undefined) firstIdx = (rng() < 0.5 ? 0 : 1);
    var st = newState(charA, charB, firstIdx);
    var turns = 0, shizuku = 0, winner = -1;
    var cur = firstIdx;
    while (turns < 400) {
      var t = playTurn(st, cur, rng);
      turns++;
      if (t.result.shizuku) shizuku++;
      var def = st.sides[1 - cur], atk = st.sides[cur];
      if (def.hp <= 0) { winner = cur; break; }      // 攻撃側のダメージが先に通る
      if (atk.hp <= 0) { winner = 1 - cur; break; }  // 雄町の自傷で自滅
      cur = 1 - cur;
    }
    return { winner: winner, turns: turns, shizuku: shizuku, first: firstIdx, hp: [st.sides[0].hp, st.sides[1].hp] };
  }

  return {
    RICE: RICE, WATER: WATER, HEAT: HEAT, WILD: WILD,
    ENERGY_FACES: ENERGY_FACES, CHAR_FACES: CHAR_FACES, CHARS: CHARS,
    getChar: getChar,
    rollCharDie: rollCharDie, rollEnergyDie: rollEnergyDie, rollEnergy: rollEnergy,
    matchCost: matchCost, canPay: canPay, bestPayableIdx: bestPayableIdx,
    cpuKeepMask: cpuKeepMask, resolveMove: resolveMove,
    makeSide: makeSide, newState: newState, playTurn: playTurn, simulateBattle: simulateBattle
  };
});
