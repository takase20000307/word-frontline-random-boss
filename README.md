# WORD FRONTLINE — 2/4 PLAYER & WEAKNESS BOSS

ロイロノートから生徒へ配布できる、ブラウザ完結型の英単語ゲームです。通常学習に加えて、2人・4人のコード式オンライン対戦、約10分の全範囲一斉学習、1分暗記と苦手ボス2周、蓄積データからの苦手一斉学習に対応しています。

## 公開URL

- 生徒用: <https://takase20000307.github.io/word-frontline-random-boss/>
- 先生用ガイド: <https://takase20000307.github.io/word-frontline-random-boss/teacher-guide.html>

## 新しい学習モード

### オンライン対戦（2人・4人）

1. 参加する2人または4人が生徒用URLを開き、「オンライン対戦」を選ぶ。
2. ホストが「2人対戦」「4人対戦」を選び、「対戦コードを作る」を押す。
3. 表示された6文字をほかの参加者へ伝える。
4. 参加者が同じコードを入力し、全員そろうまで待つ。
5. ホストが10問・20問・30問から問題数を選び、対戦を開始する。

全員に同じ英単語と同じ四択が表示され、正解と回答速度で得点を競います。4人対戦はホストを中心に3台が接続するスター型です。氏名、学校名、クラス名は入力・送信しません。自分が間違えた単語は、それぞれの端末の苦手データへ追加されます。

対戦にはPeerJSの無料シグナリングサービスとWebRTCを使います。学校のネットワークがWebRTCや `0.peerjs.com:443` を遮断している場合は接続できないため、授業前に実際の生徒用回線と4台で確認してください。iPhone・iPadでは、対戦中にタブ切替や画面ロックをしないでください。

### テスト範囲一斉学習モード

- 223個の英単語を、ステージ結果やボス戦で止めずに連続出題します。
- 1周が約10分に収まるよう、残り時間と残り単語数から回答時間を自動調整します。
- 1周目で間違えた単語を一覧表示し、1分間の暗記時間を取ります。
- 暗記後は、その場で間違えた単語だけを「苦手ボス」として必ず2周します。
- 1周目がノーミスなら暗記と苦手ボスを省略し、PERFECT結果を表示します。
- 同じ英単語に複数の品詞・意味がある場合は、周回ごとに出題するsenseを入れ替えます。
- 全問ミスでも途中でゲームオーバーになりません。

### 苦手一斉学習モード

- ミス回数、正答率、平均反応時間、直近のミス、習熟度を端末内へ蓄積します。
- 実際にミスした単語だけから苦手デッキを作り、区切りなしで1周します。
- 苦手がまだない場合は、通常学習から始める案内を表示します。
- 苦手一覧はCSVで出力できます。

## ファイル構成とメンテナンス

- `word-frontline-random-boss.html`: 元ゲーム、単語データ、基本ゲームエンジン
- `word-frontline-v2.js`: 2人・4人対戦、10分学習、1分暗記、苦手ボス、苦手一斉学習
- `word-frontline-v2.css`: 更新機能と苦手ボスの画面デザイン
- `peerjs.min.js`: PeerJS 1.5.5（MIT License）のローカルコピー
- `peerjs-LICENSE.txt`: PeerJSのライセンス
- `index.html`: 短い生徒用URLからゲーム本体へ移動する入口
- `teacher-guide.html`: 授業での使い方と公開版の編集方法
- `.nojekyll`: GitHub Pagesにファイルをそのまま配信させる指定

単語や基本ゲームを変更するときは `word-frontline-random-boss.html`、今回追加した機能を変更するときは `word-frontline-v2.js`、見た目だけを調整するときは `word-frontline-v2.css` を編集します。

## ブラウザだけで変更する

### 単語リストを端末内だけで変える

1. ゲームの最初の画面で「単語リスト編集」を開く。
2. TSVまたはCSVを貼り付ける。
3. 「プレビュー」→「適用」を押す。

変更内容はその端末のブラウザ内に保存され、公開版のファイルは変わりません。

### 公開版を変更する

1. [GitHub上のファイル一覧](https://github.com/takase20000307/word-frontline-random-boss)を開く。
2. 変更したいファイルを選び、鉛筆アイコンから編集する。
3. 「Commit changes…」で保存する。
4. GitHub Pagesの自動更新を数分待つ。

大きな編集には [github.dev](https://github.dev/takase20000307/word-frontline-random-boss) を利用できます。以前の版はGitHubの履歴から復元できます。

## ロイロノートで配布する

1. 生徒用URLをロイロノートの「Webカード」にする。
2. 生徒アカウントと学校回線で開けるか確認する。
3. 4人対戦も使う場合は、同じ回線の実機4台で接続を確認する。

公開リポジトリへ生徒名、学籍番号、成績、パスワードなどを記載しないでください。学習記録と苦手データは各端末・各ブラウザの `localStorage` にだけ保存され、別端末へ自動共有されません。

## 無料運用

- 公開: GitHub Freeの公開リポジトリとGitHub Pages
- オンライン接続: PeerJS Cloudの無料シグナリング
- 対戦データ: WebRTCの暗号化されたブラウザ間通信
- データベース、有料ドメイン、課金設定: なし

PeerJS Cloudは共有の無料サービスであり、接続保証はありません。授業本番前の実機確認を推奨します。

## オフライン利用

[リポジトリ一式のZIP](https://github.com/takase20000307/word-frontline-random-boss/archive/refs/heads/main.zip)を展開し、同じフォルダー内の `word-frontline-random-boss.html` を開きます。通常学習・一斉学習・苦手学習はオフラインでも動きます。オンライン対戦だけはインターネット接続が必要です。

## 検証

- 元ゲームの自己テスト: 26件
- 更新機能の自己テスト: 12件
- 10分全範囲→1分暗記→同じ苦手集合2周の状態遷移
- 2画面・4画面で同じ問題、選択肢、順位になること
- 苦手0件案内、ノーミス時の苦手ボス省略、蓄積済み苦手の連続出題

## 公式資料

- [PeerJS](https://peerjs.com/)
- [PeerJS Cloud](https://peerjs.com/server/cloud)
- [PeerJS接続FAQ](https://peerjs.com/client/faq)
- [WebRTC DataChannel](https://developer.mozilla.org/docs/Web/API/WebRTC_API/Using_data_channels)
- [GitHub Pagesとは](https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub上でファイルを編集する](https://docs.github.com/repositories/working-with-files/managing-files/editing-files)
