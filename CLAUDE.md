# 醸しコロ（kamoshi-koro）

プラコロ型のサイコロバトルを醸造キャラで組んだ単一HTMLゲーム。2026-09-03新設。

## 正典
- ルール・キャラ表・バランス目標: `docs/spec.md`（ここが正。CLAUDE.mdに書き足さない）
- ロジック: `engine.js`（ブラウザとnode両用。index.htmlとsimが同じコードを使う2層方式）
- 本番: `index.html`（単一ファイル＋engine.js。ブラウザで開くだけで動く）
- 実測: `sim/sim.js`（`node sim/sim.js` で全組み合わせ大量ロール）
- 恒久判断: Vault `10.Projects/醸しコロ/90_開発ログ.md`
- オーナー思想: `../../template/owner_context.md`（単一原本。コピー禁止）

## 作法
- 数値は全部叩き台。simで実測してから確定。実機で確認するまで「完成」と言わない
- 戦略要素は「振り直し」だけ。選択肢を足さない（減らす案を常に併記）
- ローカルプレビュー: 母艦 launch.json の "kamoshi-koro"（ポート4606）
- コミットは日本語1行サマリ。push=公開なので指示があるときだけ
