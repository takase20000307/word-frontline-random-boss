/* WORD FRONTLINE Listening Lab — fully original practice content. */
'use strict';

(() => {
  const data = {
    schemaVersion: '1.0.0',
    correctIndexBase: 0,
    contentNoticeJa: 'すべて本サイト用に新規作成したオリジナル問題です。実際の過去問・音声・選択肢は使用していません。',
    sets: [
      {
        id: 'common-test',
        nameJa: '共通テスト対策',
        badge: 'COMMON TEST',
        levelJa: '高校英語・情報統合',
        descriptionJa: '短い対話から複数人の話し合いまで、必要な情報を聞き分けます。',
        items: [
          {
            id: 'ct-01', part: '短い対話', type: 'detail-time', level: 'A2',
            targetSkill: '時刻変更の聞き取り', scenario: '放課後の科学部', topic: '予定変更',
            script: [
              { speaker: 'A', text: 'I thought our science club met at four today.' },
              { speaker: 'B', text: 'It usually does, but Ms. Ito moved it to four thirty because the lab is being cleaned.' }
            ],
            question: 'What time will the science club start today?',
            options: ["At four o'clock.", 'At four fifteen.', 'At four thirty.', "At five o'clock."],
            correctIndex: 2,
            explanationJa: '通常は4時ですが、今日は実験室の清掃のため「four thirty に変更」と述べています。',
            playLimit: 2, previewSeconds: 6
          },
          {
            id: 'ct-02', part: '短い案内', type: 'detail-instruction', level: 'A2',
            targetSkill: '場所と持ち物の聞き分け', scenario: '土曜日のバスツアー', topic: '校内放送',
            script: [
              { speaker: 'N', text: 'This is a message for students taking the Saturday bus tour. The bus leaves the east gate at eight twenty, not the main entrance. Bring your lunch, but you do not need a drink because water will be provided.' }
            ],
            question: 'What should the students do?',
            options: ['Meet at the east gate.', 'Buy water before the tour.', 'Leave their lunch at home.', 'Wait at the main entrance.'],
            correctIndex: 0,
            explanationJa: '集合場所は正門ではなく「the east gate」です。昼食は持参し、水は用意されます。',
            playLimit: 2, previewSeconds: 7
          },
          {
            id: 'ct-03', part: '短い対話', type: 'information-calculation', level: 'A2-B1',
            targetSkill: '複数の数値情報の統合', scenario: '文房具店での買い物', topic: '価格と割引',
            script: [
              { speaker: 'A', text: 'I need this notebook and this set of pens. The notebook is six hundred yen, and the pens are three hundred fifty. I only have nine hundred yen.' },
              { speaker: 'B', text: 'Use this coupon. It takes one hundred yen off when you spend at least eight hundred yen.' },
              { speaker: 'A', text: 'Great. Then I can get everything I need.' }
            ],
            question: 'What will the student most likely do?',
            options: ['Buy only the notebook.', 'Buy both items without the coupon.', 'Buy both items and use the coupon.', 'Buy two notebooks.'],
            correctIndex: 2,
            explanationJa: '合計は950円ですが、800円以上で100円引きになるため850円となり、900円で両方買えます。',
            playLimit: 2, previewSeconds: 8
          },
          {
            id: 'ct-04', part: '対話', type: 'reason-inference', level: 'B1',
            targetSkill: '変更理由の推測', scenario: '美術部の教室変更', topic: '施設工事',
            script: [
              { speaker: 'A', text: "The art room is locked. Did the teacher cancel today's club meeting?" },
              { speaker: 'B', text: 'No. We are meeting in room two oh four. Workers are putting new windows in the art room today.' },
              { speaker: 'A', text: "I see. I'll tell the students waiting downstairs." }
            ],
            question: 'Why is the club meeting in room two oh four?',
            options: ['The art teacher is absent.', 'The usual room is being repaired.', 'More students are joining.', 'The meeting starts later.'],
            correctIndex: 1,
            explanationJa: '美術室では新しい窓の取り付け作業が行われているため、別室を使います。',
            playLimit: 1, previewSeconds: 9
          },
          {
            id: 'ct-05', part: '説明', type: 'main-purpose', level: 'B1',
            targetSkill: '案内の目的と制度の把握', scenario: '学校のカフェテリア', topic: 'ごみ削減',
            script: [
              { speaker: 'N', text: 'Many students have asked why paper cups have disappeared from the cafeteria. Last month, the school threw away more than seven thousand cups. Starting Monday, please bring your own bottle. If you forget one, you can borrow a metal cup by paying a small deposit. Return the cup before you leave, and your deposit will be returned.' }
            ],
            question: 'What is the main purpose of this announcement?',
            options: ['To advertise a new drink.', 'To explain a plan for reducing waste.', 'To ask students to wash paper cups.', 'To announce higher cafeteria prices.'],
            correctIndex: 1,
            explanationJa: '紙コップの大量廃棄を減らすため、ボトル持参と金属カップの貸出制度を説明しています。',
            playLimit: 1, previewSeconds: 10
          },
          {
            id: 'ct-06', part: '複数人の話し合い', type: 'decision-synthesis', level: 'B1',
            targetSkill: '意見と条件を統合した結論の把握', scenario: '文化祭の企画会議', topic: '企画選び',
            script: [
              { speaker: 'A', text: 'How about selling snacks outside at the school festival?' },
              { speaker: 'B', text: 'The weather report says it may rain, and getting permission to cook will take another week.' },
              { speaker: 'C', text: 'We could hold a photo exhibition in our classroom. It would cost very little.' },
              { speaker: 'A', text: 'That sounds safe, but how can we make it more exciting?' },
              { speaker: 'C', text: "Let's add a quiz that visitors answer on the tablets we already have." },
              { speaker: 'B', text: 'Good idea. It works indoors, stays within our budget, and does not require a food permit.' }
            ],
            question: 'What plan will the group most likely submit?',
            options: ['An outdoor snack shop.', 'An indoor photo exhibition with a quiz.', 'A cooking class in the gym.', 'A tablet sale in the school yard.'],
            correctIndex: 1,
            explanationJa: '雨・予算・食品許可の問題を避けられる「教室での写真展示とタブレットクイズ」に全員が合意しています。',
            playLimit: 1, previewSeconds: 12
          }
        ]
      },
      {
        id: 'eiken-pre2',
        nameJa: '英検準2級対策',
        badge: 'EIKEN PRE-2',
        levelJa: '高校中級程度',
        descriptionJa: '応答・会話・短い説明を、1回の放送で正確に捉えます。',
        items: [
          {
            id: 'pre2-01', part: '応答文選択', type: 'best-response', level: 'A2',
            targetSkill: '道順を尋ねる表現への応答', scenario: 'バス停', topic: '交通案内',
            script: [{ speaker: 'A', text: 'Excuse me. Is there a bus that goes to the sports center?' }],
            question: 'What is the best response?',
            options: ['Yes. Take number twelve from that stop.', 'I played basketball yesterday.', 'The center closes on Mondays.'],
            correctIndex: 0,
            explanationJa: 'スポーツセンターへ行くバスを尋ねているので、12番バスを案内する応答が適切です。',
            playLimit: 1, previewSeconds: 5
          },
          {
            id: 'pre2-02', part: '応答文選択', type: 'best-response', level: 'A2',
            targetSkill: '謝罪に対する自然な応答', scenario: '友人同士の会話', topic: '借り物の破損',
            script: [{ speaker: 'A', text: "I'm sorry I broke the handle on your umbrella." }],
            question: 'What is the best response?',
            options: ['It might rain this afternoon.', "Don't worry. We can have it repaired.", 'I left the umbrella by the door.'],
            correctIndex: 1,
            explanationJa: '壊してしまったことへの謝罪なので、「心配しないで。修理できるよ」が自然な返答です。',
            playLimit: 1, previewSeconds: 5
          },
          {
            id: 'pre2-03', part: '対話', type: 'detail-schedule', level: 'A2',
            targetSkill: '曜日と担当日の聞き取り', scenario: 'ペットの世話', topic: '旅行中の依頼',
            script: [
              { speaker: 'A', text: "Could you feed my rabbit while I'm away? My family leaves Thursday morning and comes home Sunday." },
              { speaker: 'B', text: 'I work late on Thursday, but I can go on Friday and Saturday.' },
              { speaker: 'A', text: "That's fine. Mrs. Sato next door can feed it on Thursday." }
            ],
            question: 'When will the second speaker feed the rabbit?',
            options: ['Only on Thursday.', 'On Friday and Saturday.', 'On Thursday and Friday.', 'Only on Sunday.'],
            correctIndex: 1,
            explanationJa: '2人目は木曜日は仕事ですが、金曜日と土曜日なら行けると答えています。',
            playLimit: 1, previewSeconds: 8
          },
          {
            id: 'pre2-04', part: '対話', type: 'next-action', level: 'A2-B1',
            targetSkill: '会話後の行動の把握', scenario: '駅の忘れ物', topic: '帽子の受け取り',
            script: [
              { speaker: 'A', text: 'I left my blue cap on the train this morning.' },
              { speaker: 'B', text: 'The station office called. They found it in the last car, and the office is open until seven.' },
              { speaker: 'A', text: "Good. My piano lesson ends at five thirty, so I'll pick it up afterward." }
            ],
            question: 'What will the first speaker do after the piano lesson?',
            options: ['Buy a new cap.', 'Call the train driver.', 'Go to the station office.', 'Take the train home.'],
            correctIndex: 2,
            explanationJa: 'ピアノのレッスン後に、駅の事務室で見つかった帽子を受け取ると言っています。',
            playLimit: 1, previewSeconds: 8
          },
          {
            id: 'pre2-05', part: '短い説明', type: 'detail-location', level: 'A2-B1',
            targetSkill: '訂正された集合場所の把握', scenario: '地域のボランティア', topic: '共同菜園',
            script: [{ speaker: 'N', text: "Thank you for joining Saturday's community garden project. Please meet at nine o'clock by the back entrance of the community center. We met at the library last year, but the location has changed. Bring work gloves. If there is heavy rain, check our website at seven that morning." }],
            question: 'Where should the volunteers meet?',
            options: ['At the library.', 'Inside the garden shop.', "At the community center's back entrance.", 'Beside the train station.'],
            correctIndex: 2,
            explanationJa: '昨年の図書館ではなく、今年はコミュニティセンターの裏口が集合場所です。',
            playLimit: 1, previewSeconds: 10
          },
          {
            id: 'pre2-06', part: '短い説明', type: 'habit-detail', level: 'B1',
            targetSkill: '学習手順の順序と詳細の把握', scenario: '英語学習についての発表', topic: '毎日の学習習慣',
            script: [{ speaker: 'N', text: 'I used to watch English movies to study, but the conversations were too fast. Now I listen to a five-minute podcast every morning. I write down three useful phrases and check their meanings before school. At lunchtime, I try to use one of the phrases when I talk with our exchange student.' }],
            question: 'What does the speaker do at lunchtime?',
            options: ['Watches an entire movie.', 'Writes down three phrases.', 'Uses a new phrase in conversation.', 'Listens to a long radio program.'],
            correctIndex: 2,
            explanationJa: '昼食時には、その朝に覚えた表現の一つを交換留学生との会話で使います。',
            playLimit: 1, previewSeconds: 10
          }
        ]
      },
      {
        id: 'eiken-2',
        nameJa: '英検2級対策',
        badge: 'EIKEN GRADE 2',
        levelJa: '高校卒業程度',
        descriptionJa: '理由・要点・問題と解決策を、1回の放送から整理します。',
        items: [
          {
            id: 'eiken2-01', part: '対話', type: 'reason-decision', level: 'B1',
            targetSkill: '設備情報から変更理由を理解する', scenario: 'プレゼンテーション準備', topic: '会議室の変更',
            script: [
              { speaker: 'A', text: "I reserved meeting room A for tomorrow's presentation." },
              { speaker: 'B', text: 'Facilities just called. The projector in that room is being repaired.' },
              { speaker: 'A', text: 'Could we use room C instead?' },
              { speaker: 'B', text: 'Yes. It has a working projector and seats twelve people. We only expect nine.' }
            ],
            question: 'Why will the speakers use room C?',
            options: ['It has a projector they can use.', 'It is closer to the entrance.', 'More than twelve people are coming.', 'Their presentation was postponed.'],
            correctIndex: 0,
            explanationJa: '予約した部屋のプロジェクターが修理中で、C室には使用できるプロジェクターがあるためです。',
            playLimit: 1, previewSeconds: 8
          },
          {
            id: 'eiken2-02', part: '対話', type: 'route-synthesis', level: 'B1',
            targetSkill: '運休情報と代替経路の統合', scenario: '海岸清掃への移動', topic: '交通手段',
            script: [
              { speaker: 'A', text: 'Are you still going to the beach cleanup on Sunday? The coastal train line will be closed for maintenance.' },
              { speaker: 'B', text: 'Yes. The organizers arranged a shuttle from City Hall at eight ten.' },
              { speaker: 'A', text: "Then let's take the subway to City Hall and meet by its main entrance at seven fifty-five." },
              { speaker: 'B', text: 'Perfect. That gives us enough time to find the shuttle.' }
            ],
            question: 'How will the speakers get to the beach?',
            options: ['By coastal train only.', 'By subway and then shuttle.', 'By bicycle from City Hall.', 'By a direct bus from school.'],
            correctIndex: 1,
            explanationJa: '海岸線の電車が運休するため、地下鉄で市役所へ行き、そこからシャトルに乗ります。',
            playLimit: 1, previewSeconds: 9
          },
          {
            id: 'eiken2-03', part: '対話', type: 'reason-choice', level: 'B1',
            targetSkill: '条件を比較して選択理由を把握する', scenario: '科目登録の相談', topic: 'オンライン授業',
            script: [
              { speaker: 'A', text: 'I want to take economics, but the classroom course meets on Tuesday afternoons, at the same time as jazz band.' },
              { speaker: 'B', text: 'There is also an online section. It has the same assignments, with one live discussion on the first Saturday of each month.' },
              { speaker: 'A', text: "That would let me stay in the band and still take economics. I'll choose the online section." }
            ],
            question: 'Why does the first speaker choose the online section?',
            options: ['It has fewer assignments.', 'It is taught by a different teacher.', 'It avoids a conflict with jazz band.', 'It never requires a live discussion.'],
            correctIndex: 2,
            explanationJa: '火曜午後の対面授業はジャズバンドと重なるため、両方続けられるオンライン授業を選びます。',
            playLimit: 1, previewSeconds: 9
          },
          {
            id: 'eiken2-04', part: '説明', type: 'evidence-decision', level: 'B1-B2',
            targetSkill: '調査結果と方針変更の因果関係を理解する', scenario: '学校図書館からのお知らせ', topic: '開館時間',
            script: [{ speaker: 'N', text: 'Last term, our library tested staying open two hours later. However, fewer than ten students used it after eight in the evening on most days. At the same time, many students were waiting outside when the doors opened each morning. Because of these results, the library will return to its usual closing time next term and open thirty minutes earlier, at seven thirty.' }],
            question: 'Why will the library open earlier next term?',
            options: ['Evening use was greater than expected.', 'More students wanted to use it in the morning.', 'Teachers requested shorter working hours.', 'The building cannot be used after seven.'],
            correctIndex: 1,
            explanationJa: '夜8時以降の利用者は少ない一方、朝は開館を待つ生徒が多かったため、早朝側へ時間を移します。',
            playLimit: 1, previewSeconds: 11
          },
          {
            id: 'eiken2-05', part: '説明', type: 'main-idea', level: 'B1-B2',
            targetSkill: '具体例から主張の中心をつかむ', scenario: '環境科学のミニ講義', topic: '都市の樹木',
            script: [{ speaker: 'N', text: "Planting trees can make cities cooler, but choosing only one kind of tree is not always wise. Trees with broad leaves provide excellent shade, while some local species need less water and offer food to native insects. A single disease can also spread quickly when every tree is the same. For these reasons, many city planners now select a mixture of trees that suit each street's space, climate, and wildlife." }],
            question: "What is the speaker's main point?",
            options: ['Cities should plant only broad-leaved trees.', 'All local trees require large amounts of water.', 'Using a suitable variety of trees has several benefits.', 'Street trees should be removed when insects appear.'],
            correctIndex: 2,
            explanationJa: '日陰、水の必要量、生態系、病気への強さを考え、場所に合う複数種類の木を使う利点を説明しています。',
            playLimit: 1, previewSeconds: 12
          },
          {
            id: 'eiken2-06', part: '説明', type: 'problem-solution', level: 'B1-B2',
            targetSkill: '施策の効果・問題・解決策を整理する', scenario: '学校のスマートフォン規則', topic: '校内連絡',
            script: [{ speaker: 'N', text: 'For one month, Westfield High asked students to keep their phones in their bags during lessons, although they could use them at lunch. Teachers reported better concentration, and fewer assignments were submitted late. One problem remained: club leaders could not easily share last-minute schedule changes during the day. The school has therefore installed electronic notice boards near the main entrances, where urgent club messages can be displayed without interrupting classes.' }],
            question: 'Why did the school install electronic notice boards?',
            options: ['To let students watch videos during lessons.', 'To replace all homework assignments.', 'To share urgent updates without classroom phone use.', 'To advertise phones sold by local stores.'],
            correctIndex: 2,
            explanationJa: '授業中のスマートフォン利用を再開せずに、部活動の急な変更を伝えるため、電子掲示板を設置しました。',
            playLimit: 1, previewSeconds: 12
          }
        ]
      }
    ]
  };

  window.WORD_FRONTLINE_LISTENING_DATA = data;
})();
