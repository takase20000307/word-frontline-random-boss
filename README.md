# WORD FRONTLINE — RANDOM HARD BOSS

ロイロノートから生徒へ配布するための、サーバー処理を使わないブラウザ完結型サイトです。

## 公開URL

- 生徒用: <https://takase810.github.io/word-frontline-random-boss/>
- 先生用ガイド: <https://takase810.github.io/word-frontline-random-boss/teacher-guide.html>

## 構成

- `word-frontline-random-boss.html`: 添付されたゲーム本体の完全なコピー（内容は未変更）
- `index.html`: 短い生徒用URLからゲーム本体へ移動する入口
- `teacher-guide.html`: ブラウザ編集、配布、保存、バックグラウンド動作の先生用ガイド
- `.nojekyll`: GitHub Pagesにファイルをそのまま配信させる指定

ゲーム本体のSHA-256は `8C15656879DB0057908DA9AB03EF2920932F45B885F7573777487B75B4F9F213` です。

## ブラウザだけで変更する

### 単語リストだけを一時的に変える

1. ゲームの最初の画面で「単語リスト編集」を開く。
2. TSVまたはCSVを貼り付ける。
3. 「プレビュー」→「適用」を押す。

変更内容はその端末のブラウザ内に保存され、公開版のHTMLは変わりません。

### 公開版を変更する

1. [GitHub上のHTML編集画面](https://github.com/takase810/word-frontline-random-boss/edit/main/word-frontline-random-boss.html)を開く。
2. 編集後に「Commit changes…」を押す。
3. GitHub Pagesの自動更新を数分待つ。

より大きな編集には [github.dev](https://github.dev/takase810/word-frontline-random-boss/blob/main/word-frontline-random-boss.html) を使えます。GitHubの履歴から以前の版に戻せるため、編集前にファイルを複製する必要はありません。

## ロイロノートで配布する

1. 生徒用URLを「Webカード」にする。
2. 生徒アカウントでURLが開けるか事前確認する。
3. 学校のWebフィルタを使っている場合は `https://takase810.github.io/word-frontline-random-boss/` を許可する。

公開リポジトリと公開サイトには、生徒名、学籍番号、成績、秘密情報を入れないでください。ゲームの学習記録は各端末のブラウザにだけ保存されます。

## 無料運用の仕組み

公開には GitHub Free の公開リポジトリと GitHub Pages を使用します。サーバー、データベース、有料ドメイン、課金対象の大規模ランナーは使いません。`main` ブランチへ変更を保存すると、GitHub Pagesがバックグラウンドで自動更新します。

## 互換性と動作

- 外部ライブラリ・外部画像・外部APIへの依存はありません。
- 学習記録と設定は `localStorage` に保存されます。
- 英語音声は端末のブラウザと英語音声データに依存します。
- タブが背面に回ると自動一時停止し、戻ると再開します。
- ダウンロードした `word-frontline-random-boss.html` はオフラインでも利用できます。

## 公式資料

- [GitHub Pagesとは](https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages)
- [公開元を設定する](https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub上でファイルを編集する](https://docs.github.com/repositories/working-with-files/managing-files/editing-files)
- [github.dev Webエディター](https://docs.github.com/codespaces/the-githubdev-web-based-editor)
