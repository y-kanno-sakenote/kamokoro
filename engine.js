// 醸しコロ ロジック層 v5（属性制・固定2面＋カスタム4面・属性3すくみ・ブラウザ / node 両用）
// 数値の正は docs/characters.md、ルールの正は docs/spec_v5.md（v2部分は docs/spec.md）。ここでは勝手に調整しない。
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KamoshiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- 語彙 ----------------------------------------------------------------
  // キャラコロの面（内部キー → 漢字1文字）。2026-09-04: 数字の目をやめて漢字に。
  // 並びは「発酵の勢いが上がっていく順」＝静 湧 沸 躍 極。当たり目の範囲指定はこの順が土台。
  var ORIENT = {
    s: { kanji: '静', label: '静' },
    a: { kanji: '湧', label: '湧' },
    u: { kanji: '沸', label: '沸' },
    y: { kanji: '躍', label: '躍' },
    g: { kanji: '極', label: '極' }
  };
  var ORIENT_ORDER = ['s', 'a', 'u', 'y', 'g'];
  // エネコロの面（内部キー → 絵文字・名前）。wild=✨はどれか1つの代わり
  var ENERGY = {
    rice:  { emoji: '🌾', label: '米' },
    koji:  { emoji: '🍚', label: '麹' },
    water: { emoji: '💧', label: '水' },
    heat:  { emoji: '🔥', label: '温度' },
    wild:  { emoji: '✨', label: '万能' }
  };
  var WILD = 'wild';

  // ---- 属性（v5 / 2026-09-04 ユーザー裁定） --------------------------------
  // **属性は3つだけ**: 🌾米 / 🍚麹 / 💧水。🔥温度と✨万能は属性ではなく、全キャラ共通の脇役。
  // 6体を2体ずつ割り振る: 🌾=6号・10号 / 🍚=7号・1801号 / 💧=9号・14号
  var ATTR_ORDER = ['rice', 'koji', 'water'];
  var ATTR = {
    rice:  { emoji: '🌾', label: '米' },
    koji:  { emoji: '🍚', label: '麹' },
    water: { emoji: '💧', label: '水' }
  };
  function attrLabel(a) { return ATTR[a] ? ATTR[a].emoji + ATTR[a].label : ''; }
  // 3すくみ: **麹→米→水→麹**（麹が米を糖化する／米が水を吸う／水が麹を溶かす）
  // TYPE_ADV[攻める属性] = その属性が有利を取れる相手の属性
  var TYPE_ADV = { koji: 'rice', rice: 'water', water: 'koji' };
  var ADV_BONUS = 5;      // 有利な側は「攻撃技の成功時ダメージ +5」（固定。倍率にしない）
  var advOn = true;       // 既定ON。sim で ON/OFF 両方を測るための切り替え
  function setTypeAdv(on) { advOn = !!on; }
  function typeAdvOn() { return advOn; }
  function hasAdv(atkAttr, defAttr) { return TYPE_ADV[atkAttr] === defAttr; }

  // チップ5種（面の値は「エネキーの配列」。2026-09-03: 2エネ面は廃止＝レアは✨だけ）
  var CHIP_ORDER = ['rice', 'koji', 'water', 'heat', 'wild'];
  var CHIPS = {
    rice:   { face: ['rice'],  emoji: '🌾', rare: false },
    koji:   { face: ['koji'],  emoji: '🍚', rare: false },
    water:  { face: ['water'], emoji: '💧', rare: false },
    heat:   { face: ['heat'],  emoji: '🔥', rare: false },
    wild:   { face: ['wild'],  emoji: '✨', rare: true }
  };

  // 開始時のチップ（v5 / 2026-09-04 ユーザー裁定）
  // **選ばせない**。新しいセーブで最初にキャラを選んだときに、
  // **自分の属性チップ×2 ＋ それ以外の4種×1枚ずつ＝合計6枚**を自動で在庫に入れるだけ。
  var START_CHIPS = { attr: 2, other: 1 };
  function startChips(charOrId) {
    var c = typeof charOrId === 'string' ? getChar(charOrId) : charOrId;
    var out = {}, i, k;
    for (i = 0; i < CHIP_ORDER.length; i++) {
      k = CHIP_ORDER[i];
      out[k] = (c && k === c.attr) ? START_CHIPS.attr : START_CHIPS.other;
    }
    return out;
  }

  // 技の種別: atk=攻撃 / heal=回復 / guard=次に受けるダメージ半減
  // hit = 当たり目の集合（安定3面 / 中2面 / ロマン1面 / 支え2面）
  // 当たり目効果 eff: {plus:N} 追加ダメージ / {self:N} 自分にN / {minus:1} 相手の次エネコロ-1
  //               {heal:N} 回復N / {healPlus:N} 回復量に+N / {guard:true} 次に受けるダメージ半減
  // 技の区分 g: st=安定(1) / md=中(2) / rm=ロマン(3) / sp=支え
  // v5: **7技のうち5技は自分の属性を1個以上含む「属性技」、2技は属性を含まない「サブ技」**。
  //     ★4技（star）は 属性技3＋サブ技1。技名・威力・効果・当たり目は据え置きで、コストだけ組み替えた。

  var CHARS = [
    {
      id: 'k6', no: '6', emoji: '🏺', name: '協会6号', type: '🫧泡', attr: 'rice', hp: 110,
      // 素の6面（v5）= 固定2面（属性×2）＋ カスタム4面（残り2属性＋🔥＋✨）
      slots: ['rice', 'rice', 'koji', 'water', 'heat', 'wild'],
      die: ['s', 's', 'a', 'u', 'y', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'こつこつ',   g: 'st', cost: ['rice'],                   kind: 'atk',  power: 10, hit: ['s', 'a', 'u'],      eff: { plus: 5 } },
        { name: 'まだまだ',   g: 'st', cost: ['water'],                  kind: 'atk',  power: 10, hit: ['u', 'y', 'g'],      eff: { heal: 5 } },   // サブ
        { name: 'あかぞめ',   g: 'md', cost: ['rice', 'koji'],           kind: 'atk',  power: 25, hit: ['a', 'u'],           eff: { minus: 1 } },
        { name: 'ぐつぐつ',   g: 'md', cost: ['rice', 'heat'],           kind: 'atk',  power: 20, hit: ['u', 'y'],           eff: { plus: 10 } },
        { name: '秋田の底力', g: 'rm', cost: ['rice', 'rice', 'koji'],   kind: 'atk',  power: 35, hit: ['a'],                eff: { plus: 10 } },
        { name: 'おおむかし', g: 'rm', cost: ['rice', 'koji', 'water'],  kind: 'atk',  power: 40, hit: ['g'],                eff: { plus: 10 } },
        { name: 'ご長寿',     g: 'sp', cost: ['koji', 'heat'],           kind: 'heal', power: 20, hit: ['s', 'a'],           eff: { healPlus: 10 } } // サブ
      ]
    },
    {
      id: 'k7', no: '7', emoji: '🍶', name: '協会7号', type: '🫧泡', attr: 'koji', hp: 105,
      slots: ['koji', 'koji', 'rice', 'water', 'heat', 'wild'],
      die: ['s', 's', 's', 'a', 'y', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'ぷくぷく',   g: 'st', cost: ['koji'],                   kind: 'atk',   power: 10, hit: ['s', 'a', 'y'],      eff: { plus: 5 } },
        { name: 'そつなく',   g: 'st', cost: ['water'],                  kind: 'atk',   power: 10, hit: ['y', 'g'],           eff: { plus: 5 } },  // サブ
        { name: '高泡',       g: 'md', cost: ['koji', 'rice'],           kind: 'atk',   power: 20, hit: ['s', 'a'],           eff: { plus: 10 } },
        { name: 'ふきこぼれ', g: 'md', cost: ['koji', 'koji'],           kind: 'atk',   power: 20, hit: ['s', 'y'],           eff: { minus: 1 } },
        { name: '真澄の一撃', g: 'rm', cost: ['koji', 'koji', 'water'],  kind: 'atk',   power: 35, hit: ['g'],                eff: { self: 10 } },
        { name: 'あわだらけ', g: 'rm', cost: ['koji', 'rice', 'heat'],   kind: 'atk',   power: 40, hit: ['y'],                eff: { plus: 10 } },
        { name: 'きじゅん',   g: 'sp', cost: ['water', 'heat'],          kind: 'guard', power: 0,  hit: ['s', 'g'],           eff: { heal: 10 } }  // サブ
      ]
    },
    {
      id: 'k9', no: '9', emoji: '🍈', name: '協会9号', type: '🌸香', attr: 'water', hp: 95,
      slots: ['water', 'water', 'rice', 'koji', 'heat', 'wild'],
      die: ['y', 'y', 'y', 's', 'a', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: '吟醸香',       g: 'st', cost: ['water'],                    kind: 'atk',  power: 10, hit: ['y', 'g'],           eff: { plus: 5 } },
        { name: 'ひとはだ',     g: 'st', cost: ['heat'],                     kind: 'atk',  power: 10, hit: ['s', 'a'],           eff: { plus: 5 } },  // サブ
        { name: '野白式',       g: 'md', cost: ['water', 'heat'],            kind: 'atk',  power: 25, hit: ['a', 'y'],           eff: { plus: 5 } },
        { name: 'ねかせる',     g: 'md', cost: ['water', 'rice'],            kind: 'atk',  power: 20, hit: ['s', 'g'],           eff: { guard: true } },
        { name: '熊本の華',     g: 'rm', cost: ['water', 'water', 'heat'],   kind: 'atk',  power: 35, hit: ['y'],                eff: { minus: 1 } },
        { name: 'おおころがり', g: 'rm', cost: ['water', 'water', 'koji'],   kind: 'atk',  power: 40, hit: ['g'],                eff: { plus: 15 } },
        { name: '低温じっくり', g: 'sp', cost: ['koji', 'heat'],             kind: 'heal', power: 35, hit: ['s', 'y'],           eff: { healPlus: 10 } } // サブ
      ]
    },
    {
      id: 'k10', no: '10', emoji: '❄️', name: '協会10号', type: '🫧泡', attr: 'rice', hp: 110,
      slots: ['rice', 'rice', 'koji', 'water', 'heat', 'wild'],
      die: ['a', 'a', 'a', 's', 'y', 'u'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'しんしん',     g: 'st', cost: ['rice'],                    kind: 'atk',  power: 10, hit: ['s', 'a', 'u'],      eff: { plus: 5 } },
        { name: 'つらら',       g: 'st', cost: ['water'],                   kind: 'atk',  power: 10, hit: ['a', 'u', 'y'],      eff: { plus: 5 } },  // サブ
        { name: '雪どけ',       g: 'md', cost: ['rice', 'water'],           kind: 'atk',  power: 20, hit: ['s', 'a'],           eff: { heal: 5 } },
        { name: 'ゆきかき',     g: 'md', cost: ['rice', 'heat'],            kind: 'atk',  power: 20, hit: ['u', 'y'],           eff: { plus: 10 } },
        { name: '東北の底冷え', g: 'rm', cost: ['rice', 'rice', 'heat'],    kind: 'atk',  power: 35, hit: ['a'],                eff: { minus: 1 } },
        { name: 'おおふぶき',   g: 'rm', cost: ['rice', 'koji', 'heat'],    kind: 'atk',  power: 40, hit: ['s'],                eff: { plus: 10 } },
        { name: '冬ごもり',     g: 'sp', cost: ['koji', 'heat'],            kind: 'heal', power: 20, hit: ['a', 'u'],           eff: { healPlus: 10 } } // サブ
      ]
    },
    {
      id: 'k14', no: '14', emoji: '🍏', name: '協会14号', type: '🌸香', attr: 'water', hp: 105,
      slots: ['water', 'water', 'rice', 'koji', 'heat', 'wild'],
      die: ['y', 'y', 's', 's', 'a', 'g'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'すっきり',   g: 'st', cost: ['water'],                   kind: 'atk',  power: 10, hit: ['a', 'y', 'g'],      eff: { plus: 5 } },
        { name: 'ひとやすみ', g: 'st', cost: ['rice'],                    kind: 'atk',  power: 10, hit: ['s', 'a', 'y'],      eff: { heal: 5 } },  // サブ
        { name: '金沢香',     g: 'md', cost: ['koji', 'heat'],            kind: 'atk',  power: 20, hit: ['s', 'a'],           eff: { plus: 15 } }, // サブ
        { name: 'さらり',     g: 'md', cost: ['water', 'heat'],           kind: 'atk',  power: 20, hit: ['a', 'y'],           eff: { minus: 1 } },
        { name: '酸なしの美', g: 'rm', cost: ['water', 'water', 'koji'],  kind: 'atk',  power: 30, hit: ['y'],                eff: { plus: 10 } },
        { name: 'おおみず',   g: 'rm', cost: ['water', 'water', 'heat'],  kind: 'atk',  power: 40, hit: ['a'],                eff: { plus: 10 } },
        { name: '北陸の水',   g: 'sp', cost: ['water', 'heat'],           kind: 'heal', power: 20, hit: ['y', 'g'],           eff: { healPlus: 5 } }
      ]
    },
    {
      id: 'k1801', no: '1801', emoji: '🧬', name: '協会1801号', type: '🌸香', attr: 'koji', hp: 105,
      ability: { name: 'ロマン', failSelf: 10 }, // 技が失敗すると自分に10
      slots: ['koji', 'koji', 'rice', 'water', 'heat', 'wild'],
      die: ['g', 'g', 'y', 'y', 's', 'a'],
      star: [0, 2, 4, 6],
      moves: [
        { name: 'セルレニン耐性',   g: 'st', cost: ['koji'],                   kind: 'atk',  power: 10, hit: ['a', 'y', 'g'],      eff: { plus: 5 } },
        { name: 'よくばり',         g: 'st', cost: ['rice'],                   kind: 'atk',  power: 10, hit: ['a', 'y'],           eff: { plus: 5 } },  // サブ
        { name: 'ハイブリッド',     g: 'md', cost: ['koji', 'water'],          kind: 'atk',  power: 30, hit: ['y', 'g'],           eff: { plus: 5 } },
        { name: 'ふんばる',         g: 'md', cost: ['koji', 'koji'],           kind: 'atk',  power: 20, hit: ['y'],                eff: { guard: true } },
        { name: 'りんご香バースト', g: 'rm', cost: ['koji', 'water', 'heat'],  kind: 'atk',  power: 40, hit: ['g'],                eff: { plus: 10 } },
        { name: 'ぜんぶだす',       g: 'rm', cost: ['koji', 'heat', 'heat'],   kind: 'atk',  power: 45, hit: ['a'],                eff: { self: 10 } },
        { name: '親ゆずり',         g: 'sp', cost: ['water', 'heat'],          kind: 'heal', power: 35, hit: ['s', 'a'],           eff: { healPlus: 20 } } // サブ
      ]
    }
  ];

  var GROUP = { st: '安定', md: '中', rm: 'ロマン', sp: '支え' };

  function getChar(id) {
    for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i];
    return null;
  }
  // その技が「属性技」か（自分の属性を1個以上含む）。図鑑・ドキュメント生成用
  function isAttrMove(char, move) { return move.cost.indexOf(char.attr) >= 0; }

  // ---- エネコロの組み立て --------------------------------------------------
  // エネコロは **左・中・右の3個**。表示順＝振るときの並び。
  // v5（2026-09-04・ユーザー裁定）: **固定2面を復活**。
  //   スロット0・1 = 固定面（そのキャラの属性×2。チップは置けない）
  //   スロット2〜5 = カスタム4面（初期値は残り2属性＋🔥＋✨）
  var DICE_N = 3;
  var SLOTS_N = 6;
  var FIXED_N = 2;
  var DICE_LABEL = ['左', '中', '右'];
  function emptyRow() {
    var r = [], i;
    for (i = 0; i < SLOTS_N; i++) r.push(null);
    return r;
  }

  // 面の値は「エネキーの配列」: ['koji'] / ['wild']
  // chips1 = ダイス1個ぶんの6スロット（null=素の面 / チップキー。固定2面は常に null）
  function buildDie(char, chips1) {
    var faces = [], i;
    for (i = 0; i < char.slots.length; i++) {
      var c = (i >= FIXED_N) ? (chips1 && chips1[i]) : null;
      faces.push(c && CHIPS[c] ? CHIPS[c].face.slice() : [char.slots[i]]);
    }
    return faces;
  }
  // chips を必ず「3個 × 6スロット」に整える。形が合わないものは素の面（null）に落とすだけで例外は出さない。
  // 固定2面は問答無用で null（旧セーブがチップを持っていても捨てる）。
  function normalizeChips(chips) {
    var out = [], i, j;
    for (i = 0; i < DICE_N; i++) {
      var src = chips && chips[i];
      var row = emptyRow();
      if (src && src.length === SLOTS_N) for (j = FIXED_N; j < SLOTS_N; j++) row[j] = src[j] || null;
      out.push(row);
    }
    return out;
  }
  // 3個ぶんの6面（[[面×6],[面×6],[面×6]]）
  function buildEnergy(char, chips) {
    var cs = normalizeChips(chips), out = [];
    for (var i = 0; i < DICE_N; i++) out.push(buildDie(char, cs[i]));
    return out;
  }
  function faceEmoji(face) {
    var s = '';
    for (var i = 0; i < face.length; i++) s += ENERGY[face[i]].emoji;
    return s;
  }
  function facesSig(faces) {
    return faces.map(function (f) { return f.join('+'); }).join(',');
  }
  // 3個ぶんの面シグネチャ（確率キャッシュのキーに使う）
  function diceSig(dice) {
    return dice.map(facesSig).join('/');
  }

  // ---- カスタム上限（v5で緩めた・spec_v5.md §2.1） -------------------------
  // 同じ種類のエネは **1個につき3面まで**（固定2面込み）。✨は1個につき1面まで。
  // 「素の面と同じチップは置けない」は据え置き。固定2面（スロット0・1）にはそもそも置けない。
  var LIMIT = { rice: 3, koji: 3, water: 3, heat: 3, wild: 1 };
  var LIMIT_MSG = {
    rice: '🌾は3面まで', koji: '🍚は3面まで', water: '💧は3面まで', heat: '🔥は3面まで',
    wild: '✨は1面まで'
  };
  var SAME_FACE_MSG = '同じ面です';
  var FIXED_MSG = '固定の面';
  function isFixedSlot(slot) { return slot < FIXED_N; }
  function isSameAsNativeFace(char, slot, chipKey) {
    return !!(chipKey && CHIPS[chipKey] && CHIPS[chipKey].face[0] === char.slots[slot]);
  }

  // 上限は **1個ごと** に効く。3個とも同じ上限。
  function slotFace(char, chips1, i) {
    var c = (i >= FIXED_N) ? (chips1 && chips1[i]) : null;
    return (c && CHIPS[c]) ? CHIPS[c].face : [char.slots[i]];
  }
  // ダイス1個の6面（素の面 or チップ）を種類ごとに数える
  function countSlots(char, chips1) {
    var n = { rice: 0, koji: 0, water: 0, heat: 0, wild: 0 }, i, t;
    for (i = 0; i < char.slots.length; i++) {
      t = slotFace(char, chips1, i)[0];
      n[t]++;
    }
    return n;
  }
  // ダイス1個ぶんの判定。OK/理由を返す
  function validateDie(char, chips1) {
    var n = countSlots(char, chips1);
    for (var k in LIMIT) {
      if (n[k] > LIMIT[k]) return { ok: false, kind: k, reason: LIMIT_MSG[k] };
    }
    return { ok: true, kind: null, reason: '' };
  }
  // 3個まとめての判定。どの個で引っかかったかを die に入れて返す
  function validateSlots(char, chips) {
    var cs = normalizeChips(chips);
    for (var i = 0; i < DICE_N; i++) {
      var v = validateDie(char, cs[i]);
      if (!v.ok) return { ok: false, die: i, kind: v.kind, reason: v.reason };
    }
    return { ok: true, die: -1, kind: null, reason: '' };
  }
  // die 個目の slot に chipKey（null=はずす）をはめられるか（上限はその個の中だけで見る）
  function canPlaceChip(char, chips, die, slot, chipKey) {
    if (isFixedSlot(slot)) return { ok: false, kind: 'fixed', reason: FIXED_MSG };
    if (isSameAsNativeFace(char, slot, chipKey)) {
      return { ok: false, kind: 'same', reason: SAME_FACE_MSG };
    }
    var next = normalizeChips(chips)[die].slice();
    next[slot] = chipKey || null;
    return validateDie(char, next);
  }
  // ダイス1個ぶんの上限違反・廃止チップ・固定面へのチップを直す
  function repairDie(char, chips1) {
    var cur = (chips1 && chips1.length === SLOTS_N) ? chips1.slice() : emptyRow();
    var removed = [], i;
    for (i = 0; i < FIXED_N; i++) cur[i] = null;              // 固定面は常に素の面
    for (i = FIXED_N; i < cur.length; i++) {
      if (cur[i] && !CHIPS[cur[i]]) cur[i] = null;            // 廃止済みチップ
    }
    for (i = FIXED_N; i < cur.length; i++) {
      if (cur[i] && isSameAsNativeFace(char, i, cur[i])) {    // 素の面と同じチップ
        removed.push(cur[i]);
        cur[i] = null;
      }
    }
    var guard = 0, v;
    while (!(v = validateDie(char, cur)).ok && guard++ < SLOTS_N + 2) {
      var done = false;
      for (i = cur.length - 1; i >= FIXED_N && !done; i--) {
        var c = cur[i];
        if (!c || !CHIPS[c]) continue;
        if (CHIPS[c].face[0] === v.kind) {
          removed.push(c); cur[i] = null; done = true;
        }
      }
      if (!done) break; // 外せるチップが無い（固定面だけの違反＝起きない）
    }
    return { chips: cur, removed: removed };
  }
  // 3個ぶんまとめて直す
  function repairSlots(char, chips) {
    var cs = normalizeChips(chips), out = [], removed = [];
    for (var i = 0; i < DICE_N; i++) {
      var r = repairDie(char, cs[i]);
      out.push(r.chips);
      removed = removed.concat(r.removed);
    }
    return { chips: out, removed: removed };
  }

  // 出撃するキャラ（＝素のキャラ定義＋選んだ4技＋組み立てたエネコロ3個×6面）
  // load = { moves:[i,i,i,i], chips:[[左6],[中6],[右6]] }。省略時は★4技＋素の面
  function buildFighter(charOrId, load) {
    var base = typeof charOrId === 'string' ? getChar(charOrId) : charOrId;
    if (base && base.base) base = base.base; // すでに組み立て済みなら素に戻す
    load = load || {};
    var mi = load.moves && load.moves.length === 4 ? load.moves : base.star;
    var chips = normalizeChips(load.chips);
    var dice = buildEnergy(base, chips);
    var pkey = base.id + '#' + diceSig(dice);
    var moves = [];
    for (var i = 0; i < mi.length; i++) moves.push(base.moves[mi[i]]);
    return {
      base: base, id: base.id, no: base.no, emoji: base.emoji, name: base.name,
      type: base.type, attr: base.attr, hp: base.hp, ability: base.ability, die: base.die,
      moveIdx: mi.slice(), chips: chips,
      energy: dice,                       // [左6面, 中6面, 右6面]
      moves: moves,
      pkey: pkey,
      pcache: probCacheFor(pkey)          // 面が同じなら使い回す（simで大量に組み立てるので）
    };
  }

  // ---- ダイス --------------------------------------------------------------
  function rnd(rng) { return (rng || Math.random)(); }
  function pick(arr, rng) { return arr[Math.floor(rnd(rng) * arr.length)]; }

  function rollChar(char, rng) { return pick(char.die, rng); }
  // エネコロを左から n 個振る → 面（エネキー配列）の配列
  function rollEnergy(char, n, rng) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(pick(char.energy[i], rng));
    return out;
  }

  // コスト（エネキーの配列）が出目で払えるか。✨は不足分の穴埋めに使える
  function matchCost(cost, faces) {
    var have = {}, i, j, wild = 0, f;
    for (i = 0; i < faces.length; i++) {
      f = faces[i];
      if (typeof f === 'string') f = [f];
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

  // ---- 確率（6^n の厳密列挙・3個それぞれの面が違う前提） -------------------
  var _probCache = {};
  function probCacheFor(pkey) {
    return _probCache[pkey] || (_probCache[pkey] = {});
  }
  function successProb(char, move, n) {
    var cache = char.pcache || probCacheFor(char.pkey || char.id);
    var key = move.name + '|' + n;
    if (cache[key] != null) return cache[key];
    var dice = char.energy, total = Math.pow(6, n), ok = 0;
    var roll = new Array(n), i;
    for (var c = 0; c < total; c++) {
      var t = c;
      for (i = 0; i < n; i++) { roll[i] = dice[i][t % 6]; t = Math.floor(t / 6); }
      if (matchCost(move.cost, roll)) ok++;
    }
    var p = ok / total;
    cache[key] = p;
    return p;
  }

  // 当たり目（キー or キーの配列）が出る確率。集合なら合算
  function orientProb(char, keys) {
    var set = typeof keys === 'string' ? [keys] : keys;
    var c = 0;
    for (var i = 0; i < char.die.length; i++) if (set.indexOf(char.die[i]) >= 0) c++;
    return c / char.die.length;
  }

  function hitLabel(hit) {
    var set = typeof hit === 'string' ? [hit] : hit;
    var idx = set.map(function (k) { return ORIENT_ORDER.indexOf(k); })
                 .sort(function (a, b) { return a - b; });
    var kj = idx.map(function (i) { return ORIENT[ORIENT_ORDER[i]].kanji; });
    return kj.join('');
  }

  // ---- 蔵めぐりの報酬 ------------------------------------------------------
  var DROP = {
    awa:   ['koji', 'koji', 'koji', 'rice', 'water', 'heat'],
    kaori: ['water', 'water', 'water', 'rice', 'koji', 'heat']
  };
  var RARE = ['wild'];

  function typeKey(char) { return char.type.indexOf('泡') >= 0 ? 'awa' : 'kaori'; }
  function rollDrop(foeChar, rng) { return pick(DROP[typeKey(foeChar)], rng); }
  function rollRare(rng) { return pick(RARE, rng); }

  // ---- 状態 ----------------------------------------------------------------
  function newState(charA, charB, rng, loadA, loadB) {
    var a = buildFighter(charA, loadA);
    var b = buildFighter(charB, loadB);
    var first = rnd(rng) < 0.5 ? 0 : 1;
    return {
      chars: [a, b],
      hp: [a.hp, b.hp],
      maxHp: [a.hp, b.hp],
      lastMove: [-1, -1],
      energyMinus: [false, false],
      halveNext: [false, false],
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

  function availableMoves(state, side) {
    var out = [];
    for (var i = 0; i < state.chars[side].moves.length; i++) {
      if (i !== state.lastMove[side]) out.push(i);
    }
    return out;
  }

  // 3すくみのボーナス（攻撃技・成功時のみ・固定+5）。フラグOFFなら0
  function advBonus(state, side) {
    if (!advOn) return 0;
    return hasAdv(state.chars[side].attr, state.chars[1 - side].attr) ? ADV_BONUS : 0;
  }

  // ---- CPU（期待ダメージ最大・前手番の技除外・HP30%以下で回復） -----------
  function cpuChoose(state, side) {
    var me = state.chars[side], foe = 1 - side;
    var n = energyCount(state, side);
    var avail = availableMoves(state, side);
    var adv = advBonus(state, side);
    var i, mi, mv, best = avail[0], bestVal = -1;
    var canKill = false, healIdx = -1;

    for (i = 0; i < avail.length; i++) {
      mi = avail[i]; mv = me.moves[mi];
      var p = successProb(me, mv, n);
      var val = 0;
      if (mv.kind === 'atk') {
        var plus = mv.eff && mv.eff.plus ? mv.eff.plus : 0;
        val = p * (mv.power + adv + orientProb(me, mv.hit) * plus);
        if (mv.power + plus + adv >= state.hp[foe]) canKill = true;
      } else {
        healIdx = mi;
      }
      if (val > bestVal) { bestVal = val; best = mi; }
    }

    if (state.hp[side] <= state.maxHp[side] * 0.3 && !canKill) {
      for (i = 0; i < avail.length; i++) {
        if (me.moves[avail[i]].kind === 'heal') return avail[i];
      }
      if (healIdx >= 0) return healIdx;
    }
    return best;
  }

  // ---- 1手番の解決 ---------------------------------------------------------
  function resolveTurn(state, moveIdx, rng) {
    if (state.over) return null;
    var side = state.turn, foe = 1 - side;
    var me = state.chars[side], mv = me.moves[moveIdx];
    var n = energyCount(state, side);
    state.energyMinus[side] = false; // この手番で消費

    var orient = rollChar(me, rng);
    var faces = rollEnergy(me, n, rng);
    var success = matchCost(mv.cost, faces);
    var hit = success && mv.hit.indexOf(orient) >= 0; // 当たり目効果は成功時のみ
    var adv = (mv.kind === 'atk') ? advBonus(state, side) : 0;

    var r = {
      side: side, moveIdx: moveIdx, move: mv, n: n,
      orient: orient, faces: faces, success: success, orientHit: hit,
      damage: 0, selfDamage: 0, heal: 0, guard: false, minus: false, halved: false, adv: false
    };

    var eff = mv.eff || {};
    if (success) {
      if (mv.kind === 'atk') {
        var dmg = mv.power + (hit && eff.plus ? eff.plus : 0) + adv;
        if (adv) r.adv = true;
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
      // しずく（5ダメージ）。3すくみのボーナスは乗せない（攻撃技の成功時だけ）
      r.damage = applyDamage(state, foe, 5, r);
      if (me.ability && me.ability.failSelf) r.selfDamage = me.ability.failSelf;
    }

    if (r.selfDamage) state.hp[side] -= r.selfDamage;

    state.lastMove[side] = moveIdx;
    state.turnCount[side]++;

    if (state.hp[foe] <= 0) { state.hp[foe] = 0; state.over = true; state.winner = side; }
    else if (state.hp[side] <= 0) { state.hp[side] = 0; state.over = true; state.winner = foe; }
    else state.turn = foe;

    return r;
  }

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
    if (winner == null) {
      timeout = true;
      var ra = st.hp[0] / st.maxHp[0], rb = st.hp[1] / st.maxHp[1];
      winner = ra === rb ? 0 : (ra > rb ? 0 : 1);
    }
    return {
      winner: winner, first: st.first, timeout: timeout,
      turns: declared,
      turnsPerSide: (declared[0] + declared[1]) / 2,
      declared: declared[0] + declared[1],
      success: succ[0] + succ[1],
      fail: fail[0] + fail[1],
      hp: st.hp.slice()
    };
  }

  return {
    CHARS: CHARS, ORIENT: ORIENT, ORIENT_ORDER: ORIENT_ORDER, ENERGY: ENERGY, WILD: WILD,
    ATTR: ATTR, ATTR_ORDER: ATTR_ORDER, TYPE_ADV: TYPE_ADV, ADV_BONUS: ADV_BONUS,
    attrLabel: attrLabel, hasAdv: hasAdv, setTypeAdv: setTypeAdv, typeAdvOn: typeAdvOn,
    isAttrMove: isAttrMove,
    CHIPS: CHIPS, CHIP_ORDER: CHIP_ORDER, GROUP: GROUP, DROP: DROP, RARE: RARE,
    START_CHIPS: START_CHIPS, startChips: startChips,
    LIMIT: LIMIT, LIMIT_MSG: LIMIT_MSG, FIXED_MSG: FIXED_MSG, SAME_FACE_MSG: SAME_FACE_MSG,
    DICE_N: DICE_N, SLOTS_N: SLOTS_N, FIXED_N: FIXED_N, DICE_LABEL: DICE_LABEL,
    isFixedSlot: isFixedSlot,
    validateSlots: validateSlots, validateDie: validateDie, canPlaceChip: canPlaceChip,
    repairSlots: repairSlots, repairDie: repairDie,
    countSlots: countSlots, slotFace: slotFace, normalizeChips: normalizeChips,
    getChar: getChar,
    buildDie: buildDie, buildEnergy: buildEnergy, buildFighter: buildFighter,
    faceEmoji: faceEmoji, facesSig: facesSig, diceSig: diceSig, typeKey: typeKey,
    rollDrop: rollDrop, rollRare: rollRare,
    rollChar: rollChar, rollEnergy: rollEnergy, matchCost: matchCost,
    successProb: successProb, orientProb: orientProb, hitLabel: hitLabel,
    newState: newState, energyCount: energyCount, availableMoves: availableMoves,
    cpuChoose: cpuChoose, resolveTurn: resolveTurn, simulateBattle: simulateBattle
  };
});
