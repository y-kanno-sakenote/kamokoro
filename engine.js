// 醸しコロ ロジック層 v7（属性制・固定3面＋カスタム3面・3すくみ＝先攻決め・ブラウザ / node 両用）
// 数値の正は docs/characters.md、ルールの正は docs/spec_v5.md（v6の本文。v2部分は docs/spec.md）。ここでは勝手に調整しない。
// v6（2026-09-05 ユーザー裁定）: 固定は **属性×2 ＋ ✨×1 の3面**。カスタムは残り3面（他属性2＋🔥）。
//   ✨は全ダイスに必ず1面あるので **✨チップとレア枠は廃止**（チップは🌾🍚💧🔥の4種だけ）。
//   素の6面の並びは v5 のまま（固定は slots[0],[1],[5]）＝既定構成の回帰が v5 と1戦単位で一致する。
// v7（2026-09-05 ユーザー裁定・2点だけ）:
//   ① **「しずく」を廃止**。技が揃わなければ何も起きない（相手に5ダメージを与えない）。
//      失敗の代償は「前の手番の技は選べない」だけ。1801号のとくせい「ロマン」だけが失敗ペナルティとして残る。
//   ② **3すくみの「有利側+2ダメージ」を廃止**し、**「有利側が先攻」**に置き換えた（ミラーはランダム）。
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
  // v7（2026-09-05・ユーザー裁定）: 有利側の「+2ダメージ」は**廃止**。3すくみは
  // **「有利な側が先攻」** に置き換えた（ミラー＝同属性はランダム）。ダメージには一切効かない。
  var advOn = true;       // 既定ON。OFFなら先攻は全組ランダム。sim は --noadv でOFF側を測る
  function setTypeAdv(on) { advOn = !!on; }
  function typeAdvOn() { return advOn; }
  function hasAdv(atkAttr, defAttr) { return TYPE_ADV[atkAttr] === defAttr; }

  // チップ4種（面の値は「エネキーの配列」）。
  // v6: **✨チップは廃止**。✨は全ダイスの固定面に必ず1面あるので、チップとして配る意味が無い（レア枠も廃止）。
  var CHIP_ORDER = ['rice', 'koji', 'water', 'heat'];
  var CHIPS = {
    rice:   { face: ['rice'],  emoji: '🌾' },
    koji:   { face: ['koji'],  emoji: '🍚' },
    water:  { face: ['water'], emoji: '💧' },
    heat:   { face: ['heat'],  emoji: '🔥' }
  };

  // 開始時のチップ（v6 / 2026-09-05 実測で確定。sim/out/chips_v6.md）
  // **選ばせない**。**そのキャラを初めて選んだときに、そのキャラの在庫にだけ**自動で入る（キャラごと初回のみ）。
  // 内訳は **全キャラ 4種を2枚ずつ＝8枚**（2026-09-05 裁定でキャラ差を廃止）。
  // 強い型は「同じ面の3個そろえ」で1種につき3枚要る。**どの種類も2枚まで**なら2個までしか揃わず、
  // 3個目の1枚は周回のドロップで拾うことになる。置ける枠は 3面×3個＝9 なので配布は必ず枠より少ない。
  // 旧v6では6号だけ🍚1枚（計7枚）にしていたが、6号の手持ち最良が 80.1〜80.3% と目標帯（75〜80%）を
  // 0.1〜0.3pt 超えるだけなので**誤差として受け入れ、全キャラ8枚に揃えた**（キャラごとの例外を持たない方が説明が短い）。
  var START_CHIPS = {
    k6:    { rice: 2, koji: 2, water: 2, heat: 2 },   // 🌾米
    k7:    { rice: 2, koji: 2, water: 2, heat: 2 },   // 🍚麹
    k9:    { rice: 2, koji: 2, water: 2, heat: 2 },   // 💧水
    k10:   { rice: 2, koji: 2, water: 2, heat: 2 },   // 🌾米
    k14:   { rice: 2, koji: 2, water: 2, heat: 2 },   // 💧水
    k1801: { rice: 2, koji: 2, water: 2, heat: 2 }    // 🍚麹
  };
  function startChipsTotal(charOrId) {
    var g = startChips(charOrId), n = 0, i;
    for (i = 0; i < CHIP_ORDER.length; i++) n += g[CHIP_ORDER[i]];
    return n;
  }
  function startChips(charOrId) {
    var id = typeof charOrId === 'string' ? charOrId : (charOrId && charOrId.id);
    var src = START_CHIPS[id] || {};
    var out = {}, i, k;
    for (i = 0; i < CHIP_ORDER.length; i++) {
      k = CHIP_ORDER[i];
      out[k] = src[k] || 0;
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
      id: 'k6', no: '6', emoji: '🏺', name: '協会6号', type: '🫧泡', attr: 'rice', hp: 105,
      // 素の6面 = 固定3面（属性×2＋✨）＋ カスタム3面（残り2属性＋🔥）。並びは v5 のまま（固定は 0・1・5）
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
        { name: '金沢香',     g: 'md', cost: ['koji', 'heat'],            kind: 'atk',  power: 25, hit: ['s', 'a'],           eff: { plus: 15 } }, // サブ
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
  // v6（2026-09-05・ユーザー裁定）: **固定3面＝属性×2 ＋ ✨×1**／**カスタム3面＝残り2属性＋🔥**。
  //   素の6面（char.slots）の並びは v5 のまま [属性,属性,他属性,他属性,🔥,✨] なので、
  //   固定はスロット **0・1・5**、カスタムは **2・3・4**（連番ではない）。
  //   並びを変えなかったのは、既定構成の回帰が v5 と1戦単位で一致することを検算に使うため。
  //   画面に出すときは SLOT_ORDER（🔒3面 → カスタム3面）の順に並べ替える。
  var DICE_N = 3;
  var SLOTS_N = 6;
  var FIXED_SLOTS = [0, 1, 5];
  var CUSTOM_SLOTS = [2, 3, 4];
  var SLOT_ORDER = FIXED_SLOTS.concat(CUSTOM_SLOTS);   // 表示順（🔒🔒🔒＋カスタム3）
  var FIXED_N = FIXED_SLOTS.length;                    // 3
  var CUSTOM_N = CUSTOM_SLOTS.length;                  // 3
  var DICE_LABEL = ['左', '中', '右'];
  function isFixedSlot(slot) { return FIXED_SLOTS.indexOf(slot) >= 0; }
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
      var c = isFixedSlot(i) ? null : (chips1 && chips1[i]);
      faces.push(c && CHIPS[c] ? CHIPS[c].face.slice() : [char.slots[i]]);
    }
    return faces;
  }
  // chips を必ず「3個 × 6スロット」に整える。形が合わないものは素の面（null）に落とすだけで例外は出さない。
  // 固定3面（0・1・5）は問答無用で null（旧セーブがチップを持っていても捨てる）。
  function normalizeChips(chips) {
    var out = [], i, j;
    for (i = 0; i < DICE_N; i++) {
      var src = chips && chips[i];
      var row = emptyRow();
      if (src && src.length === SLOTS_N) {
        for (j = 0; j < CUSTOM_SLOTS.length; j++) row[CUSTOM_SLOTS[j]] = src[CUSTOM_SLOTS[j]] || null;
      }
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

  // ---- カスタム上限（v6・据え置き・spec_v5.md §2.1） ----------------------
  // 同じ種類のエネを **3面まで積めるのは自分の属性だけ**（固定2面＋カスタム1＝3面）。
  // 他のエネ（他属性・🔥）は **1個につき2面まで**（素の1＋チップ1）。
  // ✨は **固定の1面だけ**（v6でチップが無くなったので構造的に必ず1面。上限判定は不要）。
  // 「素の面と同じチップは置けない」も据え置き。固定3面（0・1・5）にはそもそも置けない。
  var LIMIT_ATTR = 3, LIMIT_OTHER = 2, LIMIT_WILD = 1;
  // そのキャラにとっての種類 kind の上限
  function limitFor(char, kind) {
    if (kind === WILD) return LIMIT_WILD;
    return (char && char.attr === kind) ? LIMIT_ATTR : LIMIT_OTHER;
  }
  // 上限に引っかかったときの短い理由（属性かどうかで面数が変わる）
  function limitMsg(char, kind) {
    return (ENERGY[kind] ? ENERGY[kind].emoji : '') + 'は' + limitFor(char, kind) + '面まで';
  }
  var SAME_FACE_MSG = '同じ面です';
  var FIXED_MSG = '固定の面';
  function isSameAsNativeFace(char, slot, chipKey) {
    return !!(chipKey && CHIPS[chipKey] && CHIPS[chipKey].face[0] === char.slots[slot]);
  }

  // 上限は **1個ごと** に効く。3個とも同じ上限。
  function slotFace(char, chips1, i) {
    var c = isFixedSlot(i) ? null : (chips1 && chips1[i]);
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
    var n = countSlots(char, chips1), i, k;
    for (i = 0; i < CHIP_ORDER.length; i++) {
      k = CHIP_ORDER[i];
      if (n[k] > limitFor(char, k)) return { ok: false, kind: k, reason: limitMsg(char, k) };
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
  // ダイス1個ぶんの上限違反・廃止チップ（v5の✨チップを含む）・固定面へのチップを直す
  function repairDie(char, chips1) {
    var cur = (chips1 && chips1.length === SLOTS_N) ? chips1.slice() : emptyRow();
    var removed = [], i, sl;
    for (i = 0; i < FIXED_SLOTS.length; i++) cur[FIXED_SLOTS[i]] = null;   // 固定3面は常に素の面
    for (i = 0; i < CUSTOM_SLOTS.length; i++) {
      sl = CUSTOM_SLOTS[i];
      if (cur[sl] && !CHIPS[cur[sl]]) cur[sl] = null;                      // 廃止済みチップ（✨など）
    }
    for (i = 0; i < CUSTOM_SLOTS.length; i++) {
      sl = CUSTOM_SLOTS[i];
      if (cur[sl] && isSameAsNativeFace(char, sl, cur[sl])) {              // 素の面と同じチップ
        removed.push(cur[sl]);
        cur[sl] = null;
      }
    }
    var guard = 0, v;
    while (!(v = validateDie(char, cur)).ok && guard++ < SLOTS_N + 2) {
      var done = false;
      for (i = CUSTOM_SLOTS.length - 1; i >= 0 && !done; i--) {
        sl = CUSTOM_SLOTS[i];
        var c = cur[sl];
        if (!c || !CHIPS[c]) continue;
        if (CHIPS[c].face[0] === v.kind) {
          removed.push(c); cur[sl] = null; done = true;
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
  // 添字の指定（数値なら左から n 個・配列ならその添字）を 0..2 の添字配列に直す
  function toIdx(n) {
    if (typeof n !== 'number') return n;
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    return a;
  }
  // エネコロを振る → 面（エネキー配列）の配列。**添字配列と同じ並び**で返る
  function rollEnergy(char, n, rng) {
    var idx = toIdx(n), out = [], i;
    for (i = 0; i < idx.length; i++) out.push(pick(char.energy[idx[i]], rng));
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
  // n は個数（左から n 個）でも添字配列でもよい
  function successProb(char, move, n) {
    var idx = toIdx(n), k = idx.length;
    var cache = char.pcache || probCacheFor(char.pkey || char.id);
    var key = move.name + '|' + idx.join('');
    if (cache[key] != null) return cache[key];
    var dice = char.energy, total = Math.pow(6, k), ok = 0;
    var roll = new Array(k), i;
    for (var c = 0; c < total; c++) {
      var t = c;
      for (i = 0; i < k; i++) { roll[i] = dice[idx[i]][t % 6]; t = Math.floor(t / 6); }
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
  // v6（2026-09-05 裁定）: 勝つたびに🌾🍚💧🔥のどれか1枚だけ。**4種の均等 1/4**。
  // 旧版は「倒した相手のタイプ（🫧泡→🍚 / 🌸香→💧）寄りが50%」だったが、
  // タイプは戦闘の相性を持たず（相性は属性）、相手の出る順もランダムでプレイヤーが寄りを活かせないため廃止した。
  // ドロップは「いま使っているキャラの在庫」に入る（在庫はキャラごと）。
  var DROP = ['rice', 'koji', 'water', 'heat'];

  function rollDrop(rng) { return pick(DROP, rng); }

  // v7.1（2026-09-06 裁定）: **1周クリア（6連勝）だけ、好きな1枚を追加でもらえる**。
  // 通常ドロップ1枚に**追加**（クリア時は計2枚）。運任せのドロップに1回だけ「自分で選ぶ」瞬間を作り、
  // ●●●●●● の6連勝そのものに意味を持たせるための報酬。選べるのはドロップと同じ4種。
  var LAP_BONUS = DROP;

  // 選んだ1枚を在庫（そのキャラの chips[charId]）に足す。不正なキーなら何もせず false。
  // 保存は呼び出し側の責任（index.html の writeSave）。対戦の数値には一切影響しない。
  function grantLapBonus(inv, key) {
    if (!inv || LAP_BONUS.indexOf(key) < 0) return false;
    inv[key] = (inv[key] || 0) + 1;
    return true;
  }

  // ---- 状態 ----------------------------------------------------------------
  function newState(charA, charB, rng, loadA, loadB) {
    var a = buildFighter(charA, loadA);
    var b = buildFighter(charB, loadB);
    // v7: 先攻は**属性の3すくみ**で決まる（麹→米→水→麹の有利側が先攻）。
    // ミラー（同属性）と、3すくみOFF（setTypeAdv(false)）のときは従来どおりランダム。
    var first, firstReason;
    if (advOn && a.attr !== b.attr) {
      first = hasAdv(a.attr, b.attr) ? 0 : 1;
      firstReason = 'adv';          // 相性で決まった
    } else {
      first = rnd(rng) < 0.5 ? 0 : 1;
      firstReason = 'rng';          // ミラー or 3すくみOFF
    }
    return {
      chars: [a, b],
      hp: [a.hp, b.hp],
      maxHp: [a.hp, b.hp],
      lastMove: [-1, -1],
      energyMinus: [false, false],
      energySkip: [-1, -1],   // その手番で振れなくなったダイスの添字（-1＝なし。UIのグレーアウト用）
      halveNext: [false, false],
      turnCount: [0, 0],
      first: first,
      firstReason: firstReason,
      turn: first,
      over: false,
      winner: null
    };
  }

  // その手番の「素の」添字（先攻1手目だけ左・中＝[0,1]。これは効果ではなく開始時の構造ルールなので固定）
  function baseIndices(state, side) {
    return (side === state.first && state.turnCount[side] === 0) ? [0, 1] : [0, 1, 2];
  }

  // その手番で振るエネコロの個数（先攻1手目は2個・-1効果で1減・下限1）
  function energyCount(state, side) {
    var n = baseIndices(state, side).length;
    if (state.energyMinus[side]) n -= 1;
    return Math.max(1, n);
  }

  // その手番で実際に振るエネコロの添字。-1効果のときは**どれが消えるかランダム**（2026-09-06 裁定）
  // 消えるのは1個だけ・下限1個。rng を消費するのは -1 が乗っている手番だけ
  function energyIndices(state, side, rng) {
    var idx = baseIndices(state, side);
    var skip = -1;
    if (state.energyMinus[side] && idx.length > 1) {
      var k = Math.floor(rnd(rng) * idx.length);
      skip = idx[k];
      idx = idx.slice(0, k).concat(idx.slice(k + 1));
    }
    return { idx: idx, skip: skip };
  }

  // 技の成功率。-1が乗っているときは**どれが消えるかは等確率**として平均を取る
  // （選ぶ時点では消える1個がまだ決まっていないので、CPUも人も同じ情報で選ぶ）
  function turnProb(state, side, move) {
    var me = state.chars[side], base = baseIndices(state, side);
    if (!state.energyMinus[side] || base.length <= 1) return successProb(me, move, base);
    var s = 0, k;
    for (k = 0; k < base.length; k++) {
      s += successProb(me, move, base.slice(0, k).concat(base.slice(k + 1)));
    }
    return s / base.length;
  }

  function availableMoves(state, side) {
    var out = [];
    for (var i = 0; i < state.chars[side].moves.length; i++) {
      if (i !== state.lastMove[side]) out.push(i);
    }
    return out;
  }

  // ---- CPU（期待ダメージ最大・前手番の技除外・HP30%以下で回復） -----------
  function cpuChoose(state, side) {
    var me = state.chars[side], foe = 1 - side;
    var avail = availableMoves(state, side);
    var i, mi, mv, best = avail[0], bestVal = -1;
    var canKill = false, healIdx = -1;

    for (i = 0; i < avail.length; i++) {
      mi = avail[i]; mv = me.moves[mi];
      var p = turnProb(state, side, mv);
      var val = 0;
      if (mv.kind === 'atk') {
        var plus = mv.eff && mv.eff.plus ? mv.eff.plus : 0;
        val = p * (mv.power + orientProb(me, mv.hit) * plus);
        if (mv.power + plus >= state.hp[foe]) canKill = true;
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
    var e = energyIndices(state, side, rng);   // 消える1個はここで決まる（手番の開始時）
    var idx = e.idx, n = idx.length;
    state.energySkip[side] = e.skip;
    state.energyMinus[side] = false; // この手番で消費

    var orient = rollChar(me, rng);
    var faces = rollEnergy(me, idx, rng);
    var success = matchCost(mv.cost, faces);
    var hit = success && mv.hit.indexOf(orient) >= 0; // 当たり目効果は成功時のみ

    var r = {
      side: side, moveIdx: moveIdx, move: mv, n: n, idx: idx, skip: e.skip,
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
      // v7: 揃わなければ**何も起きない**（旧「しずく5ダメージ」は廃止）。
      // 失敗の代償は「前の手番の技は選べない」だけ。唯一の失敗ペナルティが 1801号のとくせい「ロマン」。
      // 失敗したことは r.success === false で分かる。
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
    if (opts.first === 0 || opts.first === 1) {
      st.first = opts.first; st.turn = opts.first;
      st.firstReason = 'forced';   // simの回帰で先攻を固定したとき
    }
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
      winner: winner, first: st.first, firstReason: st.firstReason, timeout: timeout,
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
    ATTR: ATTR, ATTR_ORDER: ATTR_ORDER, TYPE_ADV: TYPE_ADV,
    attrLabel: attrLabel, hasAdv: hasAdv, setTypeAdv: setTypeAdv, typeAdvOn: typeAdvOn,
    isAttrMove: isAttrMove,
    CHIPS: CHIPS, CHIP_ORDER: CHIP_ORDER, GROUP: GROUP, DROP: DROP,
    START_CHIPS: START_CHIPS, startChipsTotal: startChipsTotal, startChips: startChips,
    LIMIT_ATTR: LIMIT_ATTR, LIMIT_OTHER: LIMIT_OTHER, LIMIT_WILD: LIMIT_WILD,
    limitFor: limitFor, limitMsg: limitMsg,
    FIXED_MSG: FIXED_MSG, SAME_FACE_MSG: SAME_FACE_MSG,
    DICE_N: DICE_N, SLOTS_N: SLOTS_N, FIXED_N: FIXED_N, CUSTOM_N: CUSTOM_N,
    FIXED_SLOTS: FIXED_SLOTS, CUSTOM_SLOTS: CUSTOM_SLOTS, SLOT_ORDER: SLOT_ORDER,
    DICE_LABEL: DICE_LABEL, isFixedSlot: isFixedSlot,
    validateSlots: validateSlots, validateDie: validateDie, canPlaceChip: canPlaceChip,
    repairSlots: repairSlots, repairDie: repairDie,
    countSlots: countSlots, slotFace: slotFace, normalizeChips: normalizeChips,
    getChar: getChar,
    buildDie: buildDie, buildEnergy: buildEnergy, buildFighter: buildFighter,
    faceEmoji: faceEmoji, facesSig: facesSig, diceSig: diceSig,
    rollDrop: rollDrop, LAP_BONUS: LAP_BONUS, grantLapBonus: grantLapBonus,
    rollChar: rollChar, rollEnergy: rollEnergy, matchCost: matchCost,
    successProb: successProb, orientProb: orientProb, hitLabel: hitLabel,
    newState: newState, energyCount: energyCount, energyIndices: energyIndices,
    baseIndices: baseIndices, turnProb: turnProb, availableMoves: availableMoves,
    cpuChoose: cpuChoose, resolveTurn: resolveTurn, simulateBattle: simulateBattle
  };
});
