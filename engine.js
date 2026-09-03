// 醸しコロ ロジック層 v2（宣言制・ブラウザ / node 両用）
// 数値の正は docs/characters.md、ルールの正は docs/spec.md。ここでは勝手に調整しない。
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KamoshiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- 語彙 ----------------------------------------------------------------
  // キャラコロの向き（内部キー → 絵文字・名前）
  var ORIENT = {
    s: { emoji: '🧍', label: '立ち' },
    a: { emoji: '😴', label: 'あおむけ' },
    u: { emoji: '🙃', label: 'うつぶせ' },
    y: { emoji: '↔️', label: '横向き' },
    g: { emoji: '🤸', label: '逆立ち' }
  };
  // エネコロの面（内部キー → 絵文字・名前）。wild=✨はどれか1つの代わり
  var ENERGY = {
    rice:  { emoji: '🌾', label: '米' },
    koji:  { emoji: '🍚', label: '麹' },
    water: { emoji: '💧', label: '水' },
    heat:  { emoji: '🔥', label: '温度' },
    wild:  { emoji: '✨', label: '万能' }
  };
  var WILD = 'wild';

  // 技の種別: atk=攻撃 / heal=回復 / guard=次に受けるダメージ半減
  // 向き効果 eff: {plus:N} 追加ダメージ / {self:N} 自分にN / {minus:1} 相手の次エネコロ-1
  //               {heal:N} 回復N（guard技の向き効果）/ {healPlus:N} 回復量に+N

  var CHARS = [
    {
      id: 'k6', no: '6', emoji: '🏺', name: '協会6号', type: '🫧泡', hp: 110,
      energy: ['rice', 'rice', 'koji', 'water', 'heat', 'wild'],
      die: ['s', 's', 'a', 'u', 'y', 'g'],
      moves: [
        { name: 'こつこつ',   cost: ['rice'],                 kind: 'atk',  power: 10, orient: 's', eff: { plus: 10 } },
        { name: 'あかぞめ',   cost: ['rice', 'koji'],         kind: 'atk',  power: 20, orient: 's', eff: { minus: 1 } },
        { name: '秋田の底力', cost: ['rice', 'rice', 'koji'], kind: 'atk',  power: 35, orient: 'a', eff: { plus: 10 } },
        { name: 'ご長寿',     cost: ['koji', 'heat'],         kind: 'heal', power: 20, orient: 's', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k7', no: '7', emoji: '🍶', name: '協会7号', type: '🫧泡', hp: 100,
      energy: ['rice', 'koji', 'koji', 'water', 'heat', 'wild'],
      die: ['s', 's', 's', 'a', 'y', 'g'],
      moves: [
        { name: 'ぷくぷく',   cost: ['koji'],                  kind: 'atk',   power: 10, orient: 's', eff: { plus: 10 } },
        { name: '高泡',       cost: ['koji', 'rice'],          kind: 'atk',   power: 25, orient: 's', eff: { plus: 10 } },
        { name: '真澄の一撃', cost: ['koji', 'koji', 'water'], kind: 'atk',   power: 35, orient: 'g', eff: { self: 10 } },
        { name: 'きじゅん',   cost: ['koji', 'heat'],          kind: 'guard', power: 0,  orient: 's', eff: { heal: 10 } }
      ]
    },
    {
      id: 'k9', no: '9', emoji: '🍈', name: '協会9号', type: '🌸香', hp: 90,
      energy: ['koji', 'water', 'water', 'heat', 'heat', 'wild'],
      die: ['y', 'y', 'y', 's', 'a', 'g'],
      moves: [
        { name: '吟醸香',     cost: ['water'],                    kind: 'atk',  power: 10, orient: 'y', eff: { plus: 10 } },
        { name: '野白式',     cost: ['water', 'heat'],            kind: 'atk',  power: 25, orient: 'y', eff: { plus: 10 } },
        { name: '熊本の華',   cost: ['water', 'water', 'heat'],   kind: 'atk',  power: 40, orient: 'y', eff: { minus: 1 } },
        { name: '低温じっくり', cost: ['koji', 'heat'],           kind: 'heal', power: 20, orient: 'y', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k10', no: '10', emoji: '❄️', name: '協会10号', type: '🫧泡', hp: 105,
      energy: ['rice', 'koji', 'water', 'water', 'heat', 'wild'],
      die: ['a', 'a', 'a', 's', 'y', 'u'],
      moves: [
        { name: 'しんしん',     cost: ['water'],                  kind: 'atk',  power: 10, orient: 'a', eff: { plus: 10 } },
        { name: '雪どけ',       cost: ['water', 'koji'],          kind: 'atk',  power: 20, orient: 'a', eff: { heal: 10 } },
        { name: '東北の底冷え', cost: ['water', 'water', 'heat'], kind: 'atk',  power: 35, orient: 'a', eff: { minus: 1 } },
        { name: '冬ごもり',     cost: ['koji', 'heat'],           kind: 'heal', power: 25, orient: 'a', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k14', no: '14', emoji: '🍏', name: '協会14号', type: '🌸香', hp: 95,
      energy: ['rice', 'koji', 'water', 'water', 'heat', 'wild'],
      die: ['y', 'y', 's', 's', 'a', 'g'],
      moves: [
        { name: 'すっきり',   cost: ['water'],                   kind: 'atk',  power: 10, orient: 'y', eff: { plus: 10 } },
        { name: '金沢香',     cost: ['water', 'koji'],           kind: 'atk',  power: 25, orient: 's', eff: { plus: 10 } },
        { name: '酸なしの美', cost: ['water', 'water', 'koji'],  kind: 'atk',  power: 40, orient: 'y', eff: { plus: 10 } },
        { name: '北陸の水',   cost: ['water', 'heat'],           kind: 'heal', power: 20, orient: 'y', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k1801', no: '1801', emoji: '🧬', name: '協会1801号', type: '🌸香', hp: 85,
      ability: { name: 'ロマン', failSelf: 10 }, // 技が失敗すると自分に10
      energy: ['koji', 'koji', 'water', 'heat', 'heat', 'wild'],
      die: ['g', 'g', 'y', 'y', 's', 'a'],
      moves: [
        { name: 'セルレニン耐性',   cost: ['koji'],                   kind: 'atk',  power: 15, orient: 'g', eff: { plus: 10 } },
        { name: 'ハイブリッド',     cost: ['koji', 'water'],          kind: 'atk',  power: 25, orient: 'g', eff: { plus: 15 } },
        { name: 'りんご香バースト', cost: ['koji', 'water', 'heat'],  kind: 'atk',  power: 45, orient: 'g', eff: { plus: 15 } },
        { name: '親ゆずり',         cost: ['koji', 'heat'],           kind: 'heal', power: 15, orient: 's', eff: { healPlus: 10 } }
      ]
    }
  ];

  function getChar(id) {
    for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i];
    return null;
  }

  // ---- ダイス --------------------------------------------------------------
  function rnd(rng) { return (rng || Math.random)(); }
  function pick(arr, rng) { return arr[Math.floor(rnd(rng) * arr.length)]; }

  // キャラコロを1個振る → 向きキー
  function rollChar(char, rng) { return pick(char.die, rng); }
  // エネコロをn個振る → 面キーの配列
  function rollEnergy(char, n, rng) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(pick(char.energy, rng));
    return out;
  }

  // コスト（面キーの配列）が出目で払えるか。✨は不足分の穴埋めに使える
  function matchCost(cost, faces) {
    var have = {}, i, wild = 0;
    for (i = 0; i < faces.length; i++) {
      if (faces[i] === WILD) wild++;
      else have[faces[i]] = (have[faces[i]] || 0) + 1;
    }
    var need = {};
    for (i = 0; i < cost.length; i++) need[cost[i]] = (need[cost[i]] || 0) + 1;
    var deficit = 0;
    for (var k in need) deficit += Math.max(0, need[k] - (have[k] || 0));
    return deficit <= wild;
  }

  // ---- 確率（6^n の厳密列挙） ---------------------------------------------
  var _probCache = {};
  function successProb(char, move, n) {
    var key = char.id + '|' + move.name + '|' + n;
    if (_probCache[key] != null) return _probCache[key];
    var faces = char.energy, total = Math.pow(6, n), ok = 0;
    var idx = new Array(n), roll = new Array(n), i;
    for (i = 0; i < n; i++) idx[i] = 0;
    for (var c = 0; c < total; c++) {
      var t = c;
      for (i = 0; i < n; i++) { roll[i] = faces[t % 6]; t = Math.floor(t / 6); }
      if (matchCost(move.cost, roll)) ok++;
    }
    var p = ok / total;
    _probCache[key] = p;
    return p;
  }

  // 向きが出る確率
  function orientProb(char, key) {
    var c = 0;
    for (var i = 0; i < char.die.length; i++) if (char.die[i] === key) c++;
    return c / char.die.length;
  }

  // ---- 状態 ----------------------------------------------------------------
  function newState(charA, charB, rng) {
    var a = typeof charA === 'string' ? getChar(charA) : charA;
    var b = typeof charB === 'string' ? getChar(charB) : charB;
    var first = rnd(rng) < 0.5 ? 0 : 1;
    return {
      chars: [a, b],
      hp: [a.hp, b.hp],
      maxHp: [a.hp, b.hp],
      lastMove: [-1, -1],     // 前の手番に使った技（次の手番は選べない）
      energyMinus: [false, false], // 相手の次エネコロ-1（重複しない）
      halveNext: [false, false],   // 次に受けるダメージ半減
      turnCount: [0, 0],
      first: first,
      turn: first,
      over: false,
      winner: null
    };
  }

  // その手番で振るエネコロの個数（先攻1手目は2個・-1効果で1減・下限1）
  function energyCount(state, side) {
    var n = (side === state.first && state.turnCount[side] === 0) ? 2 : 3;
    if (state.energyMinus[side]) n -= 1;
    return Math.max(1, n);
  }

  // 選べる技（前の手番に使った技は除外）
  function availableMoves(state, side) {
    var out = [];
    for (var i = 0; i < state.chars[side].moves.length; i++) {
      if (i !== state.lastMove[side]) out.push(i);
    }
    return out;
  }

  // ---- CPU（spec通り：期待ダメージ最大・前手番の技除外・HP30%以下で回復） --
  function cpuChoose(state, side) {
    var me = state.chars[side], foe = 1 - side;
    var n = energyCount(state, side);
    var avail = availableMoves(state, side);
    var i, mi, mv, best = avail[0], bestVal = -1;
    var canKill = false, healIdx = -1;

    for (i = 0; i < avail.length; i++) {
      mi = avail[i]; mv = me.moves[mi];
      var p = successProb(me, mv, n);
      var val = 0;
      if (mv.kind === 'atk') {
        var plus = mv.eff && mv.eff.plus ? mv.eff.plus : 0;
        val = p * (mv.power + orientProb(me, mv.orient) * plus);
        if (mv.power + plus >= state.hp[foe]) canKill = true;
      } else {
        healIdx = mi; // 回復・守り技（期待ダメージは0）
      }
      if (val > bestVal) { bestVal = val; best = mi; }
    }

    // 瀕死かつ倒しきれないなら回復技（回復系のみ。守り技は対象外）
    if (state.hp[side] <= state.maxHp[side] * 0.3 && !canKill) {
      for (i = 0; i < avail.length; i++) {
        if (me.moves[avail[i]].kind === 'heal') return avail[i];
      }
      if (healIdx >= 0) return healIdx; // 回復技が無ければ守り技
    }
    return best;
  }

  // ---- 1手番の解決 ---------------------------------------------------------
  // 戻り値: 何が起きたかの記録（UI・simが読む）
  function resolveTurn(state, moveIdx, rng) {
    if (state.over) return null;
    var side = state.turn, foe = 1 - side;
    var me = state.chars[side], mv = me.moves[moveIdx];
    var n = energyCount(state, side);
    state.energyMinus[side] = false; // この手番で消費

    var orient = rollChar(me, rng);
    var faces = rollEnergy(me, n, rng);
    var success = matchCost(mv.cost, faces);
    var hit = success && orient === mv.orient; // 向き効果は成功時のみ

    var r = {
      side: side, moveIdx: moveIdx, move: mv, n: n,
      orient: orient, faces: faces, success: success, orientHit: hit,
      damage: 0, selfDamage: 0, heal: 0, guard: false, minus: false, halved: false
    };

    var eff = mv.eff || {};
    if (success) {
      if (mv.kind === 'atk') {
        var dmg = mv.power + (hit && eff.plus ? eff.plus : 0);
        r.damage = applyDamage(state, foe, dmg, r);
        if (hit && eff.self) r.selfDamage = eff.self;
        if (hit && eff.heal) r.heal = healSide(state, side, eff.heal);
        if (hit && eff.minus) { state.energyMinus[foe] = true; r.minus = true; }
      } else if (mv.kind === 'heal') {
        r.heal = healSide(state, side, mv.power + (hit && eff.healPlus ? eff.healPlus : 0));
      } else if (mv.kind === 'guard') {
        state.halveNext[side] = true; r.guard = true;
        if (hit && eff.heal) r.heal = healSide(state, side, eff.heal);
      }
    } else {
      // しずく（5ダメージ）
      r.damage = applyDamage(state, foe, 5, r);
      if (me.ability && me.ability.failSelf) r.selfDamage = me.ability.failSelf;
    }

    // 「自分にN」は半減の対象外
    if (r.selfDamage) state.hp[side] -= r.selfDamage;

    state.lastMove[side] = moveIdx;
    state.turnCount[side]++;

    if (state.hp[foe] <= 0) { state.hp[foe] = 0; state.over = true; state.winner = side; }
    else if (state.hp[side] <= 0) { state.hp[side] = 0; state.over = true; state.winner = foe; }
    else state.turn = foe;

    return r;
  }

  // 相手にダメージ。半減を持っていれば半分（切り上げ）にして消費（しずくでも消費）
  function applyDamage(state, target, dmg, r) {
    if (state.halveNext[target]) {
      dmg = Math.ceil(dmg / 2);
      state.halveNext[target] = false;
      if (r) r.halved = true;
    }
    state.hp[target] -= dmg;
    return dmg;
  }

  function healSide(state, side, amount) {
    var before = state.hp[side];
    state.hp[side] = Math.min(state.maxHp[side], before + amount);
    return state.hp[side] - before;
  }

  // ---- 通し対戦（sim用） ---------------------------------------------------
  function simulateBattle(charA, charB, rng, opts) {
    opts = opts || {};
    var st = newState(charA, charB, rng);
    if (opts.first === 0 || opts.first === 1) { st.first = opts.first; st.turn = opts.first; }
    var declared = [0, 0], succ = [0, 0], fail = [0, 0];
    var guard = 0, cap = opts.cap || 400;
    while (!st.over && guard++ < cap) {
      var side = st.turn;
      var mi = cpuChoose(st, side);
      var r = resolveTurn(st, mi, rng);
      declared[side]++;
      if (r.success) succ[side]++; else fail[side]++;
    }
    var winner = st.winner;
    var timeout = false;
    if (winner == null) { // 打ち切り：HP割合が高い方を勝ちにする
      timeout = true;
      var ra = st.hp[0] / st.maxHp[0], rb = st.hp[1] / st.maxHp[1];
      winner = ra === rb ? 0 : (ra > rb ? 0 : 1);
    }
    return {
      winner: winner, first: st.first, timeout: timeout,
      turns: declared,                       // 片側の手番数
      turnsPerSide: (declared[0] + declared[1]) / 2,
      declared: declared[0] + declared[1],
      success: succ[0] + succ[1],
      fail: fail[0] + fail[1],
      hp: st.hp.slice()
    };
  }

  return {
    CHARS: CHARS, ORIENT: ORIENT, ENERGY: ENERGY, WILD: WILD,
    getChar: getChar,
    rollChar: rollChar, rollEnergy: rollEnergy, matchCost: matchCost,
    successProb: successProb, orientProb: orientProb,
    newState: newState, energyCount: energyCount, availableMoves: availableMoves,
    cpuChoose: cpuChoose, resolveTurn: resolveTurn, simulateBattle: simulateBattle
  };
});
