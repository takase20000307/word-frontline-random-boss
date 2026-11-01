// Original classroom puzzles. Each question has exactly one correct option.
export const puzzleQuestions = [
  {
    id: 'p01', kind: 'observe', category: '観察', title: 'カボチャのおとなり',
    prompt: '同じ行で、🎃のすぐ右に🍬がある組は全部でいくつ？',
    options: ['2組', '3組', '4組', '5組'], answer: 1,
    explanation: '1行目に1組、2行目に1組、3行目に1組。合計3組です。🍭は数えません。',
    visual: { type: 'grid', columns: 4, items: ['🎃', '🍬', '🦇', '👻', '🍬', '🎃', '🍬', '🕯️', '🎃', '👻', '🎃', '🍬', '🦇', '🎃', '🍭', '🍬'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p02', kind: 'observe', category: '観察', title: '鏡の廊下',
    prompt: '横の並びを左右逆にしても、まったく同じになる行はいくつ？',
    options: ['1行', '3行', '4行', '2行'], answer: 3,
    explanation: '1行目の「👻🎃🍬🎃👻」と3行目の「🎃🦇🕯️🦇🎃」の2行が左右対称です。',
    visual: { type: 'grid', columns: 5, items: ['👻', '🎃', '🍬', '🎃', '👻', '🦇', '🍬', '🎃', '🦇', '🍬', '🎃', '🦇', '🕯️', '🦇', '🎃', '🍬', '🕷️', '👻', '🕷️', '🍭'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p03', kind: 'observe', category: '観察', title: '明るいカボチャを探せ',
    prompt: '上下左右のどこかで🕯️に接している🎃はいくつ？ 斜めは数えず、同じ🎃は1回だけ数えます。',
    options: ['5個', '3個', '4個', '6個'], answer: 0,
    explanation: '右上の🎃だけが🕯️に接していません。🎃は全部で6個なので、答えは5個です。',
    visual: { type: 'grid', columns: 4, items: ['🎃', '🕯️', '👻', '🎃', '🦇', '🎃', '🕯️', '🍬', '🕯️', '👻', '🎃', '🦇', '🎃', '🍬', '🕯️', '🎃'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p04', kind: 'observe', category: '観察', title: '3種類そろった部屋',
    prompt: '🎃・👻・🦇が、それぞれ3個ずつあるのは上から何行目？',
    options: ['1行目', '2行目', '3行目', '4行目'], answer: 0,
    explanation: '1行目だけが🎃3個・👻3個・🦇3個です。2行目は4・3・2、3行目は2・4・3、4行目は3・2・4です。',
    visual: { type: 'grid', columns: 1, items: ['① 🎃 👻 🦇 🎃 👻 🎃 🦇 👻 🦇', '② 🎃 👻 🦇 🎃 👻 🎃 🎃 👻 🦇', '③ 👻 🦇 🎃 👻 🦇 👻 🎃 🦇 👻', '④ 🦇 🎃 👻 🦇 🎃 🦇 👻 🎃 🦇'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p05', kind: 'observe', category: '観察', title: 'ずれる飾りの行進',
    prompt: '1行目を右へ1つずらすと2行目、2つなら3行目、3つなら4行目になるはず。並びを間違えた行は？ 右端は左端へ戻ります。',
    options: ['1行目', '2行目', '4行目', '3行目'], answer: 3,
    explanation: '3行目は「🍬🕯️🎃👻🦇」になるはずですが、最後の👻と🦇が逆です。',
    visual: { type: 'grid', columns: 5, items: ['🎃', '👻', '🦇', '🍬', '🕯️', '🕯️', '🎃', '👻', '🦇', '🍬', '🍬', '🕯️', '🎃', '🦇', '👻', '🦇', '🍬', '🕯️', '🎃', '👻'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p06', kind: 'observe', category: '観察', title: '金庫の数字「31」',
    prompt: '4つの番号の中に、左から右へ連続する「31」は合計何回ありますか？ 行をまたいでは数えません。',
    options: ['3回', '5回', '4回', '6回'], answer: 1,
    explanation: '「3131」に2回、「1313」に1回、「3311」に1回、「3133」に1回。合計5回です。',
    visual: { type: 'grid', columns: 1, items: ['3131', '1313', '3311', '3133'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p07', kind: 'memory', category: '記憶', title: '飛び去ったコウモリ',
    prompt: '飾りを覚えよう。🦇は全部で何匹いた？',
    options: ['2匹', '3匹', '4匹', '5匹'], answer: 2,
    explanation: '🦇は上の段に1匹、真ん中に2匹、下の段に1匹。合計4匹でした。',
    visual: { type: 'grid', columns: 4, items: ['🎃', '🦇', '👻', '🍬', '🦇', '🕯️', '🍭', '🦇', '🍬', '👻', '🦇', '🎃'] },
    memorySeconds: 8, source: 'オリジナル問題'
  },
  {
    id: 'p08', kind: 'memory', category: '記憶', title: '消えたろうそく',
    prompt: '左から右へ並びを覚えよう。🕯️があったのは左から何番目と何番目？',
    options: ['3番目と8番目', '3番目と7番目', '4番目と8番目', '4番目と9番目'], answer: 0,
    explanation: '並びは「🎃 👻 🕯️ 🍬 🦇 🍭 👻 🕯️ 🎃 🕷️」。ろうそくは3番目と8番目でした。',
    visual: { type: 'sequence', columns: 10, items: ['🎃', '👻', '🕯️', '🍬', '🦇', '🍭', '👻', '🕯️', '🎃', '🕷️'] },
    memorySeconds: 10, source: 'オリジナル問題'
  },
  {
    id: 'p09', kind: 'memory', category: '記憶', title: 'おばけ屋敷の最上階',
    prompt: '3×3の窓を覚えよう。一番上の段を左から並べたものは？',
    options: ['🎃 → 👻 → 🦇', '👻 → 🎃 → 🦇', '🎃 → 🦇 → 👻', '🦇 → 👻 → 🎃'], answer: 2,
    explanation: '一番上の段は、左から「🎃 → 🦇 → 👻」でした。',
    visual: { type: 'grid', columns: 3, items: ['🎃', '🦇', '👻', '🍬', '🕯️', '🕷️', '👻', '🎃', '🍭'] },
    memorySeconds: 8, source: 'オリジナル問題'
  },
  {
    id: 'p10', kind: 'memory', category: '記憶', title: 'パレードの最後尾',
    prompt: '左から右へ続くパレードを覚えよう。最後の3つの並びは？',
    options: ['🎃 → 🍬 → 👻', '👻 → 🎃 → 🍬', '🍬 → 👻 → 🎃', '👻 → 🍬 → 🎃'], answer: 3,
    explanation: '最後の3つは「👻 → 🍬 → 🎃」。全体は12個のパレードでした。',
    visual: { type: 'sequence', columns: 12, items: ['🦇', '🎃', '🍭', '👻', '🕷️', '🍬', '🕯️', '🦇', '🍭', '👻', '🍬', '🎃'] },
    memorySeconds: 10, source: 'オリジナル問題'
  },
  {
    id: 'p11', kind: 'logic', category: 'ひらめき', title: 'モンスターの重さ',
    prompt: '同じ絵は同じ数を表します。🎃＋👻＋🦇はいくつ？',
    options: ['13', '14', '16', '15'], answer: 3,
    explanation: '3つの式を全部足すと30。それぞれの絵が2回ずつ出るので、求める合計は30÷2＝15です。',
    visual: { type: 'text', columns: 1, items: ['🎃 ＋ 👻 ＝ 11', '👻 ＋ 🦇 ＝ 9', '🎃 ＋ 🦇 ＝ 10'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p12', kind: 'logic', category: 'ひらめき', title: 'お菓子の分け方',
    prompt: '4人にマシュマロを合計28個配ります。1人目、2人目、3人目、4人目の順に2個ずつ多くすると、一番多い人は何個？',
    options: ['8個', '9個', '10個', '12個'], answer: 2,
    explanation: '4個・6個・8個・10個なら合計28個になり、2個ずつ増えます。一番多い人は10個です。',
    visual: { type: 'text', columns: 1, items: ['合計 28個', '👤 → ＋2個 → 👤 → ＋2個 → 👤 → ＋2個 → 👤'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p13', kind: 'logic', category: 'ひらめき', title: '仮装パレードの順番',
    prompt: '4人が1列に並びます。ゾンビは吸血鬼より前、吸血鬼は魔女より前、おばけは最後。前から2番目はだれ？',
    options: ['ゾンビ', '吸血鬼', '魔女', 'おばけ'], answer: 1,
    explanation: '順番は「ゾンビ → 吸血鬼 → 魔女 → おばけ」に決まります。2番目は吸血鬼です。',
    visual: { type: 'text', columns: 1, items: ['ゾンビ ＜ 吸血鬼 ＜ 魔女', 'おばけは最後', '＜ は「より前」を表す'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p14', kind: 'logic', category: 'ひらめき', title: '正直な札は1枚だけ',
    prompt: 'A・B・Cのうち1つの箱だけにマシュマロが入っています。3枚の札のうち、本当のことを書いた札は1枚だけ。入っている箱は？',
    options: ['Aの箱', 'Bの箱', 'Cの箱', '条件だけでは決まらない'], answer: 0,
    explanation: 'Aに入れると「Aの札＝うそ、Bの札＝本当、Cの札＝うそ」で本当は1枚。BやCに入れると本当の札が2枚になってしまいます。',
    visual: { type: 'text', columns: 1, items: ['Aの札「Aには入っていない」', 'Bの札「Bには入っていない」', 'Cの札「Bに入っている」'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p15', kind: 'logic', category: 'ひらめき', title: '13回目の変身',
    prompt: '🎃から始めて、矢印の順に1回ずつ変身します。13回変身したあとはどの姿？',
    options: ['🎃', '👻', '🦇', '🍬'], answer: 1,
    explanation: '4回で🎃に戻ります。12回で🎃に戻り、13回目で👻になります。',
    visual: { type: 'text', columns: 1, items: ['🎃 → 👻 → 🦇 → 🍬 → 🎃 → …', 'スタートは🎃。最初の変身で👻になります。'] },
    source: 'オリジナル問題'
  },
  {
    id: 'p16', kind: 'logic', category: 'ひらめき', title: '魔女のキャンディマシン',
    prompt: 'アメ5個を機械に入れ、①→②→③の順で処理します。最後に出てくるアメは何個？',
    options: ['7個', '10個', '14個', '17個'], answer: 2,
    explanation: '5個を2倍にして10個、3個減らして7個、もう一度2倍にして14個です。',
    visual: { type: 'text', columns: 1, items: ['スタート：🍬 5個', '① 個数を2倍にする', '② 3個減らす', '③ 個数を2倍にする'] },
    source: 'オリジナル問題'
  }
];
