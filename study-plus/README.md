# WORD FRONTLINE STUDY PLUS

従来版とは別URLで公開する、ブラウザ完結型の英単語学習ゲームです。先生から提供されたExcelの全1,450語（Lesson 1〜68）、テスト範囲選択、学習継続日数、オリジナル・リスニングラボを追加しています。

## 公開URL

- 新版・生徒用: <https://takase20000307.github.io/word-frontline-random-boss/study-plus/>
- 先生用ガイド: <https://takase20000307.github.io/word-frontline-random-boss/study-plus/teacher-guide.html>
- 裏モード・リスニング: <https://takase20000307.github.io/word-frontline-random-boss/study-plus/listening.html>
- 従来版（無変更）: <https://takase20000307.github.io/word-frontline-random-boss/>

## 実装内容

### テスト範囲

| 選択カード | Lesson | 語数 |
|---|---:|---:|
| 第1回・GW課題 | 1〜11 | 231 |
| 第2回 | 12〜21 | 229 |
| 第3回・夏休み課題 | 22〜31 | 223 |
| 第4回 | 32〜39 | 145 |
| 第5回 | 40〜49 | 226 |
| 第6回 | 50〜56 | 141 |
| 第7回 | 57〜58 | 42 |
| 第8回・冬休み課題 | 59〜62 | 83 |
| 第9回 | 63〜68 | 130 |
| 第二回単コン・高校入試中課題 | 1〜68 | 1,450 |

初回は端末の日付から、次に予定されているテスト範囲を自動選択します。たとえば6月24日〜9月2日は「第3回・夏休み課題」です。スタート画面の「今回のテスト範囲」から手動で切り替えると、その選択を維持します。「今日の日付に合わせる」で自動選択へ戻せます。範囲外の苦手データは削除しません。第1〜9回は一斉学習を数分〜約10分で一周できる規模です。1,450語の全範囲は約62分が目安のため、通常は第1〜9回に分けてください。

### 学習継続日数

- ページを開くだけでは加算しません。単語またはリスニングに1問答えた日を1日と数えます。
- 同じ日に何問答えても、継続日数は1回だけ増えます。
- 前日に学習していれば翌日に+1。2日以上空けて戻った場合は0日表示になり、次の1問で1日目から再開します。
- 21日を超えると「先生や保護者の方に自慢しよう！」と表示します。
- 日数は端末とブラウザごとに保存します。氏名や学校名は保存・送信しません。

### 裏モード・リスニングラボ

スタート画面の `WORD FRONTLINE` ロゴを2.6秒以内に5回タップ、またはPCで `listen` とタイプすると開きます。直接 `listening.html` を開いても利用できます。

- 共通テスト対策: 前半は2回、後半は1回再生。短い対話から複数情報の統合まで。
- 英検準2級対策: 応答文選択、対話、短い説明。全問1回再生。
- 英検2級対策: 対話と社会的話題の説明。全問1回再生。

問題文・選択肢・解説はすべてこのサイト用に新規作成したオリジナルです。過去問本文、公式音声、図版、選択肢の転載や言い換えはしていません。ブラウザのWeb Speech APIで英語音声を合成するため無料です。

## 従来版との分離

新版と従来版はURL、公開フォルダ、ファイル、保存キーが別です。

```text
従来版: wordFrontlineSave_v1
新版ゲーム: wordFrontline:study-plus:game:v1
新版継続日数: wordFrontline:study-plus:streak:v1
```

新版は従来版の保存キーを読み書き・削除しません。

## ファイル構成

- `word-frontline-study-plus.html`: ゲーム本体と基本エンジン
- `word-frontline-data.js`: Excelから変換した1,450語とテスト範囲プリセット
- `word-frontline-v2.js` / `.css`: 一斉学習、苦手ボス、2・3・4人対戦
- `word-frontline-plus.js` / `.css`: 範囲選択、新版固有の表示、裏モード入口
- `study-streak.js`: 単語とリスニング共通の継続日数
- `listening.html` / `.js` / `.css`: 裏モード本体
- `listening-data.js`: オリジナル・リスニング問題
- `teacher-guide.html`: 授業用ガイド
- `peerjs.min.js` / `peerjs-LICENSE.txt`: 無料のWebRTC対戦用ライブラリとライセンス
- `.nojekyll`: GitHub Pagesの配信設定

## ブラウザだけで修正する

1. <https://github.com/takase20000307/word-frontline-random-boss/tree/main/study-plus> を開く。
2. 単語や範囲は `word-frontline-data.js`、リスニング問題は `listening-data.js`を開く。
3. 鉛筆アイコン、または <https://github.dev/takase20000307/word-frontline-random-boss/tree/main/study-plus> で編集する。
4. `Commit changes…` で保存し、GitHub Pagesの更新を数分待つ。

端末だけのカスタム単語は、ゲームの「単語リスト編集」でTSV/CSVを貼り付けて使えます。この操作は公開ファイルを変更しません。

## 公式形式の参考元

- [大学入試センター　令和8年度本試験](https://www.dnc.ac.jp/kyotsu/kakomondai/r8/r8_honshiken_mondai.html)
- [英検　準2級の試験内容](https://www.eiken.or.jp/eiken/exam/grade_p2/solutions.html)
- [英検　2級の試験内容](https://www.eiken.or.jp/eiken/exam/grade_2/solutions.html)
- [英検　サイトポリシー](https://www.eiken.or.jp/sitepolicy/index.html)

このサイトは大学入試センターまたは日本英語検定協会の制作・公認教材ではありません。

## 費用と通信

GitHub Pages、Web Speech API、端末内保存を使うため、Firebaseや有料サーバーは不要です。通常学習とリスニングはオフラインでも動きます。オンライン対戦だけはPeerJS/WebRTCの通信を使います。
