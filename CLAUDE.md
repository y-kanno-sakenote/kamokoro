# 醸しコロ（kamoshi-koro）

プラコロ型のサイコロバトルを醸造キャラで組んだ単一HTMLゲーム。2026-09-03新設。

## 正典
- ルール・バランス目標: `docs/spec_v5.md`（**現行**: 属性制・固定2面＋カスタム4面・属性3すくみ）＋ `docs/spec.md`（v2の基本ルール）／`docs/spec_v3.md` は記録用（v5へ移行済み）／キャラ定義（属性・HP・ダイス構成・技・とくせい）: `docs/characters.md`（ここが正。CLAUDE.mdに書き足さない）。図鑑ページ: `docs/zukan.html`
- ロジック: `engine.js`（ブラウザとnode両用。index.htmlとsimが同じコードを使う2層方式）
- 本番: `index.html`（単一ファイル＋engine.js。ブラウザで開くだけで動く）
- 実測: `sim/sim.js`（`node sim/sim.js` で全組み合わせ大量ロール。`--noadv` で属性3すくみOFF・`--v3` で構成探索）
- 恒久判断: Vault `10.Projects/醸しコロ/90_開発ログ.md`
- オーナー思想: `../../template/owner_context.md`（単一原本。コピー禁止）

## 作法
- 数値は全部叩き台。simで実測してから確定。実機で確認するまで「完成」と言わない
- 戦略要素は「どの技を狙うか」だけ（宣言制・振り直しなし）。選択肢を足さない（減らす案を常に併記）
- ローカルプレビュー: 母艦 launch.json の "kamoshi-koro"（ポート4606）
- コミットは日本語1行サマリ。push=公開なので指示があるときだけ
