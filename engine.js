// 醸しコロ ロジック層 v3（宣言制・技プール7→4・エネコロ固定2面＋カスタム4面・ブラウザ / node 両用）
// 数値の正は docs/characters.md、ルールの正は docs/spec_v3.md（v2部分は docs/spec.md）。ここでは勝手に調整しない。
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

  // チップ5種（面の値は「エネキーの配列」。2026-09-03: 2エネ面は廃止＝レアは✨だけ／spec_v3.md §8案1）
  var CHIP_ORDER = ['rice', 'koji', 'water', 'heat', 'wild'];
  var CHIPS = {
    rice:   { face: ['rice'],  emoji: '🌾', rare: false },
    koji:   { face: ['koji'],  emoji: '🍚', rare: false },
    water:  { face: ['water'], emoji: '💧', rare: false },
    heat:   { face: ['heat'],  emoji: '🔥', rare: false },
    wild:   { face: ['wild'],  emoji: '✨', rare: true }
  };

  // 技の種別: atk=攻撃 / heal=回復 / guard=次に受けるダメージ半減
  // 向き効果 eff: {plus:N} 追加ダメージ / {self:N} 自分にN / {minus:1} 相手の次エネコロ-1
  //               {heal:N} 回復N / {healPlus:N} 回復量に+N / {guard:true} 次に受けるダメージ半減
  // 技の区分 g: st=安定(1) / md=中(2) / rm=ロマン(3) / sp=支え

  var CHARS = [
    {
      id: 'k6', no: '6', emoji: '🏺', name: '協会6号', type: '🫧泡', hp: 110,
      fixed: ['rice', 'rice'],                    // 外せない2面
      slots: ['koji', 'water', 'heat', 'wild'],   // カスタム4面の素の面
      die: ['s', 's', 'a', 'u', 'y', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'こつこつ',   g: 'st', cost: ['rice'],                   kind: 'atk',  power: 10, orient: 's', eff: { plus: 5 } },
        { name: 'まだまだ',   g: 'st', cost: ['water'],                  kind: 'atk',  power: 10, orient: 'y', eff: { heal: 5 } },
        { name: 'あかぞめ',   g: 'md', cost: ['rice', 'koji'],           kind: 'atk',  power: 25, orient: 's', eff: { minus: 1 } },
        { name: 'ぐつぐつ',   g: 'md', cost: ['rice', 'heat'],           kind: 'atk',  power: 20, orient: 'u', eff: { plus: 10 } },
        { name: '秋田の底力', g: 'rm', cost: ['rice', 'rice', 'koji'],   kind: 'atk',  power: 35, orient: 'a', eff: { plus: 10 } },
        { name: 'おおむかし', g: 'rm', cost: ['rice', 'koji', 'water'],  kind: 'atk',  power: 40, orient: 'g', eff: { plus: 10 } },
        { name: 'ご長寿',     g: 'sp', cost: ['koji', 'heat'],           kind: 'heal', power: 20, orient: 's', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k7', no: '7', emoji: '🍶', name: '協会7号', type: '🫧泡', hp: 105,
      fixed: ['koji', 'koji'],
      slots: ['rice', 'water', 'heat', 'wild'],
      die: ['s', 's', 's', 'a', 'y', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'ぷくぷく',   g: 'st', cost: ['koji'],                   kind: 'atk',   power: 10, orient: 's', eff: { plus: 5 } },
        { name: 'そつなく',   g: 'st', cost: ['water'],                  kind: 'atk',   power: 10, orient: 'y', eff: { plus: 5 } },
        { name: '高泡',       g: 'md', cost: ['koji', 'rice'],           kind: 'atk',   power: 20, orient: 's', eff: { plus: 10 } },
        { name: 'ふきこぼれ', g: 'md', cost: ['koji', 'koji'],           kind: 'atk',   power: 20, orient: 'a', eff: { minus: 1 } },
        { name: '真澄の一撃', g: 'rm', cost: ['koji', 'koji', 'water'],  kind: 'atk',   power: 35, orient: 'g', eff: { self: 10 } },
        { name: 'あわだらけ', g: 'rm', cost: ['koji', 'rice', 'heat'],   kind: 'atk',   power: 40, orient: 'y', eff: { plus: 10 } },
        { name: 'きじゅん',   g: 'sp', cost: ['koji', 'heat'],           kind: 'guard', power: 0,  orient: 's', eff: { heal: 10 } }
      ]
    },
    {
      id: 'k9', no: '9', emoji: '🍈', name: '協会9号', type: '🌸香', hp: 90,
      fixed: ['water', 'water'],
      slots: ['koji', 'heat', 'heat', 'wild'],
      die: ['y', 'y', 'y', 's', 'a', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: '吟醸香',       g: 'st', cost: ['water'],                    kind: 'atk',  power: 10, orient: 'y', eff: { plus: 5 } },
        { name: 'ひとはだ',     g: 'st', cost: ['heat'],                     kind: 'atk',  power: 10, orient: 's', eff: { plus: 5 } },
        { name: '野白式',       g: 'md', cost: ['water', 'heat'],            kind: 'atk',  power: 15, orient: 'y', eff: { plus: 5 } },
        { name: 'ねかせる',     g: 'md', cost: ['water', 'koji'],            kind: 'atk',  power: 20, orient: 'a', eff: { guard: true } },
        { name: '熊本の華',     g: 'rm', cost: ['water', 'water', 'heat'],   kind: 'atk',  power: 35, orient: 'y', eff: { minus: 1 } },
        { name: 'おおころがり', g: 'rm', cost: ['water', 'water', 'koji'],   kind: 'atk',  power: 40, orient: 'g', eff: { plus: 15 } },
        { name: '低温じっくり', g: 'sp', cost: ['koji', 'heat'],             kind: 'heal', power: 30, orient: 'y', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k10', no: '10', emoji: '❄️', name: '協会10号', type: '🫧泡', hp: 110,
      fixed: ['water', 'water'],
      slots: ['rice', 'koji', 'heat', 'wild'],
      die: ['a', 'a', 'a', 's', 'y', 'u'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'しんしん',     g: 'st', cost: ['water'],                   kind: 'atk',  power: 10, orient: 'a', eff: { plus: 5 } },
        { name: 'つらら',       g: 'st', cost: ['rice'],                    kind: 'atk',  power: 10, orient: 'u', eff: { plus: 5 } },
        { name: '雪どけ',       g: 'md', cost: ['water', 'koji'],           kind: 'atk',  power: 20, orient: 'a', eff: { heal: 5 } },
        { name: 'ゆきかき',     g: 'md', cost: ['water', 'heat'],           kind: 'atk',  power: 20, orient: 'y', eff: { plus: 10 } },
        { name: '東北の底冷え', g: 'rm', cost: ['water', 'water', 'heat'],  kind: 'atk',  power: 35, orient: 'a', eff: { minus: 1 } },
        { name: 'おおふぶき',   g: 'rm', cost: ['water', 'koji', 'heat'],   kind: 'atk',  power: 40, orient: 's', eff: { plus: 10 } },
        { name: '冬ごもり',     g: 'sp', cost: ['koji', 'heat'],            kind: 'heal', power: 20, orient: 'a', eff: { healPlus: 10 } }
      ]
    },
    {
      id: 'k14', no: '14', emoji: '🍏', name: '協会14号', type: '🌸香', hp: 105,
      fixed: ['water', 'water'],
      slots: ['rice', 'koji', 'heat', 'wild'],
      die: ['y', 'y', 's', 's', 'a', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'すっきり',   g: 'st', cost: ['water'],                   kind: 'atk',  power: 10, orient: 'y', eff: { plus: 5 } },
        { name: 'ひとやすみ', g: 'st', cost: ['koji'],                    kind: 'atk',  power: 10, orient: 'a', eff: { heal: 5 } },
        { name: '金沢香',     g: 'md', cost: ['water', 'koji'],           kind: 'atk',  power: 20, orient: 's', eff: { plus: 15 } },
        { name: 'さらり',     g: 'md', cost: ['rice', 'heat'],            kind: 'atk',  power: 20, orient: 'g', eff: { minus: 1 } },
        { name: '酸なしの美', g: 'rm', cost: ['water', 'water', 'koji'],  kind: 'atk',  power: 30, orient: 'y', eff: { plus: 10 } },
        { name: 'おおみず',   g: 'rm', cost: ['water', 'water', 'heat'],  kind: 'atk',  power: 40, orient: 'a', eff: { plus: 10 } },
        { name: '北陸の水',   g: 'sp', cost: ['water', 'heat'],           kind: 'heal', power: 20, orient: 'y', eff: { healPlus: 5 } }
      ]
    },
    {
      id: 'k1801', no: '1801', emoji: '🧬', name: '協会1801号', type: '🌸香', hp: 95,
      ability: { name: 'ロマン', failSelf: 10 }, // 技が失敗すると自分に10
      fixed: ['koji', 'koji'],
      slots: ['water', 'heat', 'heat', 'wild'],
      die: ['g', 'g', 'y', 'y', 's', 'a'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'セルレニン耐性',   g: 'st', cost: ['koji'],                   kind: 'atk',  power: 10, orient: 'g', eff: { plus: 5 } },
        { name: 'よくばり',         g: 'st', cost: ['heat'],                   kind: 'atk',  power: 10, orient: 'y', eff: { plus: 5 } },
        { name: 'ハイブリッド',     g: 'md', cost: ['koji', 'water'],          kind: 'atk',  power: 15, orient: 'g', eff: { plus: 5 } },
        { name: 'ふんばる',         g: 'md', cost: ['koji', 'koji'],           kind: 'atk',  power: 20, orient: 'y', eff: { guard: true } },
        { name: 'りんご香バースト', g: 'rm', cost: ['koji', 'water', 'heat'],  kind: 'atk',  power: 40, orient: 'g', eff: { plus: 10 } },
        { name: 'ぜんぶだす',       g: 'rm', cost: ['koji', 'heat', 'heat'],   kind: 'atk',  power: 45, orient: 'a', eff: { self: 10 } },
        { name: '親ゆずり',         g: 'sp', cost: ['koji', 'heat'],           kind: 'heal', power: 30, orient: 's', eff: { healPlus: 10 } }
      ]
    }
  ];

  var GROUP = { st: '安定', md: '中', rm: 'ロマン', sp: '支え' };

  function getChar(id) {
    for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i];
    return null;
  }

  // ---- エネコロの組み立て --------------------------------------------------
  // 面の値は「エネキーの配列」: ['koji'] / ['koji','koji'] / ['wild']
  // chips = カスタム4スロットの中身（null=素の面 / チップキー）
  function buildEnergy(char, chips) {
    var faces = [], i;
    for (i = 0; i < char.fixed.length; i++) faces.push([char.fixed[i]]);
    for (i = 0; i < char.slots.length; i++) {
      var c = chips && chips[i];
      faces.push(c && CHIPS[c] ? CHIPS[c].face.slice() : [char.slots[i]]);
    }
    return faces;
  }
  function faceEmoji(face) {
    var s = '';
    for (var i = 0; i < face.length; i++) s += ENERGY[face[i]].emoji;
    return s;
  }
  function facesSig(faces) {
    return faces.map(function (f) { return f.join('+'); }).join(',');
  }

  // ---- カスタム上限（spec_v3.md §2.1・2026-09-03改訂） ----------------------
  // ✨は1ダイスに1面まで。固定2面は数えない。
  // 素の面の✨（全キャラ slots の1つ）もこの上限に含める＝チップの✨を積むには素の✨面を外す。
  var LIMIT = { wild: 1 };
  var LIMIT_MSG = { wild: '✨は1面まで' };

  // スロット i の実効面（チップがあればその面・無ければ素の面）
  function slotFace(char, chips, i) {
    var c = chips && chips[i];
    return (c && CHIPS[c]) ? CHIPS[c].face : [char.slots[i]];
  }
  function countSlots(char, chips) {
    var wild = 0;
    for (var i = 0; i < char.slots.length; i++) {
      var f = slotFace(char, chips, i);
      if (f[0] === WILD) wild++;
    }
    return { wild: wild };
  }
  // OK/理由を返す。reason は空文字（OK）か LIMIT_MSG のどれか
  function validateSlots(char, chips) {
    var n = countSlots(char, chips);
    if (n.wild > LIMIT.wild) return { ok: false, kind: 'wild', reason: LIMIT_MSG.wild };
    return { ok: true, kind: null, reason: '' };
  }
  // slot に chipKey（null=はずす）をはめられるか
  function canPlaceChip(char, chips, slot, chipKey) {
    var next = (chips || [null, null, null, null]).slice();
    next[slot] = chipKey || null;
    return validateSlots(char, next);
  }
  // 上限違反・廃止チップの構成を直す（違反／未知のチップを後ろから外す）
  // 戻り値 { chips: 直した4スロット, removed: [外したチップキー]（在庫に戻せるもののみ） }
  function repairSlots(char, chips) {
    var cur = (chips && chips.length === 4) ? chips.slice() : [null, null, null, null];
    var removed = [], i;
    // 廃止済み（CHIPSに無い）チップは素の面へ戻す。2026-09-03の2エネ廃止で出る旧セーブ対応
    for (i = 0; i < cur.length; i++) {
      if (cur[i] && !CHIPS[cur[i]]) cur[i] = null;
    }
    var guard = 0, v;
    while (!(v = validateSlots(char, cur)).ok && guard++ < 8) {
      var done = false;
      for (i = cur.length - 1; i >= 0 && !done; i--) {
        var c = cur[i];
        if (!c || !CHIPS[c]) continue;
        var isWild = CHIPS[c].face.length === 1 && CHIPS[c].face[0] === WILD;
        if (v.kind === 'wild' && isWild) {
          removed.push(c); cur[i] = null; done = true;
        }
      }
      if (!done) break; // 外せるチップが無い（素の面だけの違反＝起きない）
    }
    return { chips: cur, removed: removed };
  }

  // CPUの周回強化（spec_v3.md §3.1・段2）は実測で効果が無く2026-09-03に削除した。
  // 詳しい経緯は spec_v3.md §3.1 参照。cpuLapChips は廃止（呼び出し側もあわせて削除済み）。

  // 出撃するキャラ（＝素のキャラ定義＋選んだ4技＋組み立てたエネコロ6面）
  // load = { moves:[i,i,i,i], chips:[null,'koji',null,'wild'] }。省略時は★4技＋素の面
  function buildFighter(charOrId, load) {
    var base = typeof charOrId === 'string' ? getChar(charOrId) : charOrId;
    if (base && base.base) base = base.base; // すでに組み立て済みなら素に戻す
    load = load || {};
    var mi = load.moves && load.moves.length === 4 ? load.moves : base.star;
    var chips = load.chips && load.chips.length === 4 ? load.chips : [null, null, null, null];
    var faces = buildEnergy(base, chips);
    var moves = [];
    for (var i = 0; i < mi.length; i++) moves.push(base.moves[mi[i]]);
    return {
      base: base, id: base.id, no: base.no, emoji: base.emoji, name: base.name,
      type: base.type, hp: base.hp, ability: base.ability, die: base.die,
      moveIdx: mi.slice(), chips: chips.slice(),
      energy: faces,
      moves: moves,
      pkey: base.id + '#' + facesSig(faces)
    };
  }

  // ---- ダイス --------------------------------------------------------------
  function rnd(rng) { return (rng || Math.random)(); }
  function pick(arr, rng) { return arr[Math.floor(rnd(rng) * arr.length)]; }

  // キャラコロを1個振る → 向きキー
  function rollChar(char, rng) { return pick(char.die, rng); }
  // エネコロをn個振る → 面（エネキー配列）の配列
  function rollEnergy(char, n, rng) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(pick(char.energy, rng));
    return out;
  }

  // コスト（エネキーの配列）が出目で払えるか。
  // faces は「面の配列」で、各面が ['koji'] や ['koji','koji'] や ['wild']。✨は不足分の穴埋めに使える
  function matchCost(cost, faces) {
    var have = {}, i, j, wild = 0, f;
    for (i = 0; i < faces.length; i++) {
      f = faces[i];
      if (typeof f === 'string') f = [f]; // 単一キーで渡されても受ける
      for (j = 0; j < f.length; j++) {
        if (f[j] === WILD) wild++;
        else have[f[j]] = (have[f[j]] || 0) + 1;
      }
    }
    var need = {};
    for (i = 0; i < cost.length; i++) need[cost[i]] = (need[cost[i]] || 0) + 1;
    var deficit = 0;
    for (var k in need) deficit += Math.max(0, need[k] - (have[k] || 0));
    return deficit <= wild;
  }

  // ---- 確率（6^n の厳密列挙・面の値が可変でもそのまま効く） ----------------
  var _probCache = {};
  function successProb(char, move, n) {
    var key = (char.pkey || char.id) + '|' + move.name + '|' + n;
    if (_probCache[key] != null) return _probCache[key];
    var faces = char.energy, total = Math.pow(6, n), ok = 0;
    var roll = new Array(n), i;
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

  // ---- 蔵めぐりの報酬 ------------------------------------------------------
  // ドロップ表（6面）: 倒した相手のタイプに寄る。寄りエネ 泡→🍚 / 香→💧
  var DROP = {
    awa:   ['koji', 'koji', 'koji', 'rice', 'water', 'heat'],
    kaori: ['water', 'water', 'water', 'rice', 'koji', 'heat']
  };
  // レア枠（3勝ごと）。2エネ廃止（2026-09-03）でレアは✨だけになった
  var RARE = ['wild'];

  function typeKey(char) { return char.type.indexOf('泡') >= 0 ? 'awa' : 'kaori'; }
  function rollDrop(foeChar, rng) { return pick(DROP[typeKey(foeChar)], rng); }
  function rollRare(rng) { return pick(RARE, rng); }

  // ---- 状態 ----------------------------------------------------------------
  // loadA / loadB を渡すと「選んだ4技＋カスタム面」で出撃する（省略＝★4技＋素の面）
  function newState(charA, charB, rng, loadA, loadB) {
    var a = buildFighter(charA, loadA);
    var b = buildFighter(charB, loadB);
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
        if (hit && eff.guard) { state.halveNext[side] = true; r.guard = true; }
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
  // opts: {first:0|1, cap:N, loadA:{...}, loadB:{...}}
  function simulateBattle(charA, charB, rng, opts) {
    opts = opts || {};
    var st = newState(charA, charB, rng, opts.loadA, opts.loadB);
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
    CHIPS: CHIPS, CHIP_ORDER: CHIP_ORDER, GROUP: GROUP, DROP: DROP, RARE: RARE,
    LIMIT: LIMIT, LIMIT_MSG: LIMIT_MSG,
    validateSlots: validateSlots, canPlaceChip: canPlaceChip,
    repairSlots: repairSlots, countSlots: countSlots, slotFace: slotFace,
    getChar: getChar,
    buildEnergy: buildEnergy, buildFighter: buildFighter,
    faceEmoji: faceEmoji, facesSig: facesSig, typeKey: typeKey,
    rollDrop: rollDrop, rollRare: rollRare,
    rollChar: rollChar, rollEnergy: rollEnergy, matchCost: matchCost,
    successProb: successProb, orientProb: orientProb,
    newState: newState, energyCount: energyCount, availableMoves: availableMoves,
    cpuChoose: cpuChoose, resolveTurn: resolveTurn, simulateBattle: simulateBattle
  };
});
