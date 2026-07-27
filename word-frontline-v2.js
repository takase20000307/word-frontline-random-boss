/*
 * WORD FRONTLINE v2 feature layer
 *
 * This file intentionally extends the original single-file game instead of
 * rewriting it. The original vocabulary, battle renderer, import tools, and
 * learning statistics stay in word-frontline-random-boss.html.
 *
 * Added here:
 *   - uninterrupted whole-range learning, paced to finish one English-word
 *     cycle within roughly 12 minutes;
 *   - uninterrupted weak-word learning based on accumulated local statistics;
 *   - two-player pair-code battles over an encrypted WebRTC data channel.
 */

'use strict';

(() => {
  const UPDATE_VERSION = '2.0.0';
  const RAPID_TARGET_MS = 12 * 60 * 1000;
  const RAPID_FEEDBACK_MS = 520;
  const RAPID_INTRO_MS = 120;
  const PAIR_DEFAULT_ROUNDS = 20;
  const PAIR_TIME_LIMIT = 7;
  const PAIR_PROTOCOL = 2;
  const PAIR_ID_PREFIX = 'wf2-';
  const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const PEERJS_ASSET = 'peerjs.min.js';

  const original = {
    startGame,
    startStage,
    nextQuestion,
    presentQuestion,
    handleAnswer,
    resolveCorrectAnswer,
    resolveIncorrectAnswer,
    continueAfterResolution,
    renderGame,
    renderHUD,
    renderHUDFrame,
    renderResults,
    pauseGame,
    resumeGame,
    showScreen
  };

  const rapid = {
    active: false,
    mode: '',
    deck: [],
    index: 0,
    answered: 0,
    skipped: 0,
    total: 0,
    targetMs: RAPID_TARGET_MS,
    elapsedMs: 0,
    clockStartedAt: 0,
    finishedMode: ''
  };

  const pair = {
    active: false,
    finished: false,
    role: '',
    code: '',
    peer: null,
    connection: null,
    connectionToken: 0,
    ready: false,
    remoteSignature: '',
    rounds: PAIR_DEFAULT_ROUNDS,
    round: 0,
    localScore: 0,
    remoteScore: 0,
    localCorrect: 0,
    remoteCorrect: 0,
    localAnswer: null,
    remoteAnswer: null,
    localChoiceIndex: -1,
    localReactionMs: 0,
    currentCorrectIndex: -1,
    currentTimeLimit: PAIR_TIME_LIMIT,
    currentPayload: null,
    waitTimer: 0,
    peerScriptPromise: null
  };

  MODES.coverage = {
    name: 'テスト範囲一斉学習モード',
    short: '一斉',
    desc: '全英単語をステージで区切らず連続で1周。約12分以内のテンポで進みます。',
    time: 1,
    enemy: .92
  };
  MODES.weak = {
    name: '苦手一斉学習モード',
    short: '苦手一斉',
    desc: 'この端末に蓄積したミス・正答率・反応時間から苦手だけを集め、連続で1周します。',
    time: 1,
    enemy: 1
  };
  MODES.pair = {
    name: 'オンライン・ペア対戦',
    short: 'ペア',
    desc: 'ホストが6文字のペアコードを伝え、2人が同じ問題に答えてスコアを競います。',
    time: 1,
    enemy: 1
  };

  injectUpdateInterface();
  installOverrides();

  document.addEventListener('DOMContentLoaded', () => {
    initializeUpdate();
  });

  function injectUpdateInterface() {
    const battleShell = document.querySelector('#battleShell');
    if (battleShell && !document.querySelector('#rapidHud')) {
      battleShell.insertAdjacentHTML(
        'beforeend',
        `
          <div id="rapidHud" class="run-hud hidden" aria-live="polite">
            <span id="rapidModeLabel">一斉学習</span>
            <strong id="rapidProgress">0 / 0</strong>
            <span>目安</span>
            <strong id="rapidClock">12:00</strong>
          </div>
          <div id="pairHud" class="pair-hud hidden" aria-live="polite">
            <span class="pair-local">自分 <strong id="pairLocalScore">0</strong></span>
            <span>VS</span>
            <span class="pair-remote">相手 <strong id="pairRemoteScore">0</strong></span>
            <span class="pair-round" id="pairRoundHud">ROUND 0 / 20</span>
          </div>
        `
      );
    }

    if (!document.querySelector('#pairLayer')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `
          <div id="pairLayer" class="modal-layer hidden" role="dialog"
               aria-modal="true" aria-labelledby="pairTitle">
            <div class="modal wide">
              <h2 id="pairTitle">オンライン・ペア対戦</h2>
              <p>
                2人ともこのページを開きます。ホストが作った6文字のコードを
                相手に伝えるだけで、同じ問題のスコア対戦を始められます。
              </p>
              <div class="pair-grid">
                <section class="pair-panel" aria-labelledby="pairHostTitle">
                  <h3 id="pairHostTitle">1. ホストになる</h3>
                  <p>コードを作り、相手に口頭またはロイロノートで伝えます。</p>
                  <button id="pairCreate" class="primary-btn" type="button">
                    ペアコードを作る
                  </button>
                  <div id="pairHostCodeArea" class="hidden">
                    <output id="pairCode" class="pair-code" aria-label="ペアコード">
                      ------
                    </output>
                    <div class="pair-action-row">
                      <button id="pairCopy" class="small-btn" type="button">
                        コードをコピー
                      </button>
                      <label>
                        問題数
                        <select id="pairRoundCount">
                          <option value="10">10問</option>
                          <option value="20" selected>20問</option>
                          <option value="30">30問</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </section>
                <section class="pair-panel" aria-labelledby="pairGuestTitle">
                  <h3 id="pairGuestTitle">2. コードで参加</h3>
                  <p>ホストから聞いたコードを入力します。</p>
                  <label class="sr-only" for="pairCodeInput">6文字のペアコード</label>
                  <input id="pairCodeInput" class="pair-code-input"
                         inputmode="text" maxlength="6" autocomplete="off"
                         placeholder="ABC234">
                  <button id="pairJoin" class="primary-btn" type="button">
                    ペアに参加
                  </button>
                </section>
              </div>
              <div id="pairStatus" class="pair-status" role="status" aria-live="polite">
                「ペアコードを作る」か、相手から聞いたコードを入力してください。
              </div>
              <p class="pair-privacy">
                氏名・学校名・クラス名は送信しません。回答と得点は対戦中だけ
                2台のブラウザー間で共有され、苦手データは各端末内に保存されます。
                学校の通信設定によっては接続できない場合があります。
              </p>
              <div class="modal-actions">
                <button id="pairStart" class="primary-btn hidden" type="button" disabled>
                  2人で対戦開始
                </button>
                <button id="pairDisconnect" class="danger-btn hidden" type="button">
                  接続を終了
                </button>
                <button id="pairClose" class="ghost-btn" type="button">閉じる</button>
              </div>
            </div>
          </div>
        `
      );
    }

    const weakModal = document.querySelector('#weakLayer .modal');
    if (weakModal && !document.querySelector('#weakLearningNote')) {
      const title = weakModal.querySelector('h2');
      title?.insertAdjacentHTML(
        'afterend',
        `
          <p id="weakLearningNote" class="learning-data-note">
            ミス回数・正答率・平均反応時間・直近のミスをこの端末に蓄積しています。
            下の「苦手を一斉学習」で、蓄積データから作った苦手リストを連続復習できます。
          </p>
        `
      );
      const actions = weakModal.querySelector('.modal-actions');
      actions?.insertAdjacentHTML(
        'afterbegin',
        `
          <button id="startWeakRun" class="primary-btn" type="button">
            苦手を一斉学習
          </button>
        `
      );
    }
  }

  function initializeUpdate() {
    save.rapidCoverageCycle = Math.max(
      0,
      Number(save.rapidCoverageCycle) || 0
    );
    save.lastUpdateVersion = UPDATE_VERSION;
    saveProgress();

    document.title = 'WORD FRONTLINE — ONLINE PAIR & 12 MIN';
    const badge = document.querySelector('.boss-variant-badge');
    if (badge) {
      badge.className = 'update-badge';
      badge.textContent = 'ONLINE PAIR + 12 MIN UPDATE';
    }
    const tagline = document.querySelector('.tagline');
    if (tagline) {
      tagline.textContent =
        'ペアコード対戦、区切りなしの12分一斉学習、蓄積データからの苦手一斉復習。';
    }

    wireUpdateEvents();
    renderModeGrid();
    updateRunHud();
    updatePairHud();
    runUpdateSelfTests();
  }

  function wireUpdateEvents() {
    document.querySelector('#pairCreate')
      ?.addEventListener('click', createPairHost);
    document.querySelector('#pairJoin')
      ?.addEventListener('click', joinPairHost);
    document.querySelector('#pairStart')
      ?.addEventListener('click', hostStartPairMatch);
    document.querySelector('#pairDisconnect')
      ?.addEventListener('click', () => leavePair(true));
    document.querySelector('#pairClose')
      ?.addEventListener('click', closePairLobby);
    document.querySelector('#pairCopy')
      ?.addEventListener('click', copyPairCode);
    document.querySelector('#pairCodeInput')
      ?.addEventListener('input', event => {
        event.target.value = normalizePairCode(event.target.value);
      });
    document.querySelector('#pairCodeInput')
      ?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          joinPairHost();
          event.preventDefault();
        }
      });
    document.querySelector('#startWeakRun')
      ?.addEventListener('click', startWeakRunFromList);

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Escape' &&
          !document.querySelector('#pairLayer')?.classList.contains('hidden')
        ) {
          closePairLobby();
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true
    );

    window.addEventListener('beforeunload', () => {
      closePairTransport();
    });
  }

  function installOverrides() {
    startGame = function startGameV2() {
      restorePauseLayer();
      const chosen =
        document.querySelector('.mode-card.selected')?.dataset.mode ||
        save.selectedMode;
      save.selectedMode = chosen;
      saveProgress();

      if (chosen === 'pair') {
        openPairLobby();
        return;
      }

      if (pair.peer || pair.connection) leavePair(false);
      original.startGame();
    };

    startStage = function startStageV2() {
      if (isRapidMode()) {
        startRapidRun();
        return;
      }
      if (save.selectedMode === 'pair' && pair.finished) {
        if (pair.role === 'host' && pair.connection?.open) {
          hostStartPairMatch();
        } else {
          setPairStatus('ホストが再戦を開始するのを待っています。', 'wait');
        }
        return;
      }
      original.startStage();
    };

    nextQuestion = function nextQuestionV2() {
      if (rapid.active) {
        nextRapidQuestion();
        return;
      }
      if (pair.active) {
        if (pair.role === 'host') hostNextPairQuestion();
        return;
      }
      original.nextQuestion();
    };

    presentQuestion = function presentQuestionV2(target, choices, isBoss) {
      if (!rapid.active && !pair.active) {
        original.presentQuestion(target, choices, isBoss);
        return;
      }

      currentSense = target;
      currentChoices = choices;
      currentCorrectIndex = choices.findIndex(choice => choice.isCorrect);
      answerSerial++;
      currentAnswerSerial = -1;
      battle.gateResult = null;
      battle.reward = null;
      battle.enemyAdvance = 0;
      battle.squadX = .5;
      battle.targetX = .5;
      buildEnemyWave(false);

      if (rapid.active) {
        questionTimeLimit = calculateRapidQuestionSeconds();
      } else {
        questionTimeLimit = pair.currentTimeLimit || PAIR_TIME_LIMIT;
        pair.currentCorrectIndex = currentCorrectIndex;
        pair.localChoiceIndex = -1;
        pair.localReactionMs = questionTimeLimit * 1000;
        pair.localAnswer = null;
      }

      timerRemaining = questionTimeLimit;
      questionStartedAt = performance.now();
      setGameState(GAME_STATE.QUESTION_INTRO);
      renderGame();
      renderChoices();
      renderHUD();
      announce(pair.active ? `PAIR ROUND ${pair.round}` : 'RAPID LEARNING');

      scheduleGameTask(
        () => {
          if (state === GAME_STATE.QUESTION_INTRO) {
            setGameState(GAME_STATE.ANSWERING);
            questionStartedAt = performance.now();
            renderChoices();
            if (save.voice.autoPlay) speakWord(target.english);
          }
        },
        save.settings.reducedMotion ? 40 : RAPID_INTRO_MS
      );
    };

    handleAnswer = function handleAnswerV2(index, source = 'tap') {
      if (pair.active && state === GAME_STATE.ANSWERING) {
        pair.localChoiceIndex = index;
        pair.localReactionMs = Math.max(
          0,
          performance.now() - questionStartedAt
        );
      }
      return original.handleAnswer(index, source);
    };

    resolveCorrectAnswer = function resolveCorrectAnswerV2(index) {
      if (!rapid.active && !pair.active) {
        original.resolveCorrectAnswer(index);
        return;
      }

      setGameState(GAME_STATE.RESOLVING);
      stageStats.correct++;
      stageStats.maxStreak = Math.max(
        stageStats.maxStreak,
        getCurrentStreak()
      );
      const earned = Math.round(
        100 + timerRemaining * 12 + getCurrentStreak() * 8
      );
      save.totalScore += earned;
      feedback(
        'CORRECT',
        pair.active ? `PAIR +${earned}` : `RAPID +${earned}`,
        '#5bffb4'
      );
      spawnVolley(true);
      saveProgress();
      scheduleGameTask(
        continueAfterResolution,
        save.settings.reducedMotion ? 120 : RAPID_FEEDBACK_MS
      );
    };

    resolveIncorrectAnswer = function resolveIncorrectAnswerV2(
      index,
      timedOut = false
    ) {
      if (!rapid.active && !pair.active) {
        original.resolveIncorrectAnswer(index, timedOut);
        return;
      }

      setGameState(GAME_STATE.RESOLVING);
      stageStats.incorrect++;
      stageStats.mistakes.push(currentSense.senseId);
      battle.enemyAdvance = Math.min(.42, battle.enemyAdvance + .2);
      battle.shake = .28;
      if (pair.active && timedOut) {
        pair.localChoiceIndex = -1;
        pair.localReactionMs = questionTimeLimit * 1000;
      }
      feedback(
        timedOut ? 'TIME UP' : 'CHECK',
        `正解：${currentSense.shortMeaning}`,
        '#ff7a84'
      );
      saveProgress();
      scheduleGameTask(
        continueAfterResolution,
        save.settings.reducedMotion ? 150 : RAPID_FEEDBACK_MS + 80
      );
    };

    continueAfterResolution = function continueAfterResolutionV2() {
      if (rapid.active) {
        completeRapidQuestion();
        return;
      }
      if (pair.active) {
        submitPairAnswer();
        return;
      }
      original.continueAfterResolution();
    };

    renderGame = function renderGameV2() {
      original.renderGame();
      if (!currentSense) return;
      if (rapid.active) {
        const label =
          rapid.mode === 'coverage'
            ? '12 MIN WHOLE RANGE'
            : 'WEAK WORDS · CONTINUOUS';
        document.querySelector('#waveLabel').textContent = label;
        document.querySelector('#waveType').textContent =
          `${rapid.answered + 1}/${rapid.total}`;
      } else if (pair.active) {
        document.querySelector('#waveLabel').textContent =
          `ONLINE PAIR · ROUND ${pair.round}`;
        document.querySelector('#waveType').textContent = 'PAIR BATTLE';
      }
    };

    renderHUD = function renderHUDV2() {
      original.renderHUD();
      if (rapid.active) {
        const progress = rapid.total
          ? rapid.answered / rapid.total
          : 0;
        setText('#hudStage', '連続');
        setText('#mStage', `${rapid.answered}/${rapid.total}`);
        setText(
          '#hudSlot',
          `${rapid.answered} / ${rapid.total}`
        );
        setText('#hudBoss', 'なし');
        setText(
          '#hudCoverage',
          `${rapid.mode === 'coverage' ? '全英単語' : '苦手'} 残り${Math.max(
            0,
            rapid.total - rapid.answered
          )}`
        );
        const coverageRow = document.querySelector('#coverageRow');
        coverageRow?.classList.remove('hidden');
        const coverageLabel = coverageRow?.querySelector('span');
        if (coverageLabel) coverageLabel.textContent = '一斉学習';
        const fill = document.querySelector('#stageFill');
        if (fill) fill.style.width = `${Math.min(100, progress * 100)}%`;
        document.querySelector('#bossBar')?.classList.add('hidden');
      } else if (pair.active) {
        setText('#hudStage', `P${pair.round}`);
        setText('#mStage', `${pair.round}/${pair.rounds}`);
        setText('#hudSlot', `${pair.round} / ${pair.rounds}`);
        setText('#hudBoss', 'ペア対戦');
        setText('#hudScore', pair.localScore.toLocaleString());
        setText('#mScore', pair.localScore.toLocaleString());
        const fill = document.querySelector('#stageFill');
        if (fill) {
          fill.style.width =
            `${Math.min(100, pair.rounds ? pair.round / pair.rounds * 100 : 0)}%`;
        }
        document.querySelector('#coverageRow')?.classList.add('hidden');
        document.querySelector('#bossBar')?.classList.add('hidden');
      }
      updateRunHud();
      updatePairHud();
    };

    renderHUDFrame = function renderHUDFrameV2() {
      original.renderHUDFrame();
      if (rapid.active || pair.active) {
        document.querySelector('#bossBar')?.classList.add('hidden');
      }
      if (rapid.active) {
        document.querySelector('#timerPill')
          ?.classList.toggle(
            'danger',
            state === GAME_STATE.ANSWERING && timerRemaining <= 1.2
          );
        updateRunHud();
      }
    };

    renderResults = function renderResultsV2(tab = 'stage', isGameOver = false) {
      restoreStandardResultControls();
      original.renderResults(tab, isGameOver);
    };

    pauseGame = function pauseGameV2(reason = 'user') {
      if (rapid.active) pauseRapidClock();
      original.pauseGame(reason);
    };

    resumeGame = function resumeGameV2() {
      original.resumeGame();
      if (rapid.active && state !== GAME_STATE.PAUSED) resumeRapidClock();
    };

    showScreen = function showScreenV2(which) {
      if (which === 'start') {
        restorePauseLayer();
        rapid.active = false;
        rapid.finishedMode = '';
        hideRunHud();
        if (pair.peer || pair.connection) leavePair(false);
        pair.active = false;
        pair.finished = false;
        hidePairHud();
        restoreStandardResultControls();
      }
      original.showScreen(which);
    };
  }

  function isRapidMode() {
    return save?.selectedMode === 'coverage' || save?.selectedMode === 'weak';
  }

  function getEnglishGroups() {
    const groups = new Map();
    for (const sense of senseList) {
      const key = sense.english.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(sense);
    }
    for (const senses of groups.values()) {
      senses.sort((a, b) => a.senseId.localeCompare(b.senseId, 'ja'));
    }
    return groups;
  }

  function buildCoverageRunDeck(cycle) {
    const selected = [];
    for (const senses of getEnglishGroups().values()) {
      selected.push(senses[(Math.max(1, cycle) - 1) % senses.length]);
    }
    return shuffleArray(selected).map(sense => sense.senseId);
  }

  function weakLearningScore(sense) {
    const stats = getStats(sense);
    const attempts = stats.correctCount + stats.incorrectCount;
    const correctRate = attempts
      ? stats.correctCount / attempts
      : 1;
    const slow =
      stats.averageReactionTime > 6500
        ? 3
        : stats.averageReactionTime > 4500
          ? 1.5
          : 0;
    return (
      stats.incorrectCount * 6 +
      (stats.lastWasIncorrect ? 6 : 0) +
      (1 - correctRate) * 7 +
      Math.max(0, 3 - stats.masteryLevel) +
      slow
    );
  }

  function isStoredWeakSense(sense) {
    const stats = getStats(sense);
    if (stats.incorrectCount <= 0) return false;
    const attempts = stats.correctCount + stats.incorrectCount;
    const accuracyRate = attempts
      ? stats.correctCount / attempts
      : 0;
    return (
      stats.lastWasIncorrect ||
      accuracyRate < .85 ||
      stats.masteryLevel < 3 ||
      stats.averageReactionTime > 4500
    );
  }

  function buildWeakRunDeck() {
    const groups = new Map();
    for (const sense of senseList.filter(isStoredWeakSense)) {
      const key = sense.english.toLowerCase();
      const old = groups.get(key);
      if (!old || weakLearningScore(sense) > weakLearningScore(old)) {
        groups.set(key, sense);
      }
    }
    return shuffleArray([...groups.values()]).map(sense => sense.senseId);
  }

  function startRapidRun() {
    clearGameTasks();
    speechSynthesisSafeCancel();
    restorePauseLayer();
    restoreStandardResultControls();

    const mode = save.selectedMode;
    const cycle = Math.max(0, Number(save.rapidCoverageCycle) || 0) + 1;
    const deck =
      mode === 'coverage'
        ? buildCoverageRunDeck(cycle)
        : buildWeakRunDeck();

    if (mode === 'weak' && !deck.length) {
      showNoWeakDataResult();
      return;
    }

    if (mode === 'coverage') {
      save.rapidCoverageCycle = cycle;
    }

    rapid.active = true;
    rapid.finishedMode = '';
    rapid.mode = mode;
    rapid.deck = deck;
    rapid.index = 0;
    rapid.answered = 0;
    rapid.skipped = 0;
    rapid.total = deck.length;
    rapid.targetMs =
      mode === 'coverage'
        ? RAPID_TARGET_MS
        : Math.min(RAPID_TARGET_MS, Math.max(60_000, deck.length * 5_000));
    rapid.elapsedMs = 0;
    rapid.clockStartedAt = performance.now();

    stage = 1;
    stageSlot = 0;
    bossPhase = 0;
    bossSense = null;
    bossPhaseSenseIds = [];
    bossPhaseEnglish = [];
    coverageBossReserveIds = [];
    playerHp = 100;
    answerPositionCounts = [0, 0, 0, 0];
    currentStreak = 0;
    stageStats = {
      slots: 0,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      totalReaction: 0,
      maxStreak: 0,
      mistakes: [],
      bossWords: [],
      coverageAnswered: 0,
      startedAt: Date.now()
    };
    battle = {
      ...battle,
      squadX: .5,
      targetX: .5,
      enemies: [],
      bullets: [],
      particles: [],
      damages: [],
      enemyAdvance: 0,
      gateResult: null,
      reward: null
    };

    save.squad.troops = Math.max(5, save.squad.troops);
    saveProgress();
    showRunHud();
    announce(
      mode === 'coverage'
        ? '12 MIN WHOLE RANGE'
        : 'WEAK WORDS START'
    );
    nextRapidQuestion();
  }

  function nextRapidQuestion() {
    if (!rapid.active) return;

    while (rapid.index < rapid.deck.length) {
      const senseId = rapid.deck[rapid.index];
      const target = senseList.find(sense => sense.senseId === senseId);
      if (!target) {
        rapid.skipped++;
        rapid.index++;
        continue;
      }

      let choices = null;
      for (let attempt = 0; attempt < 8 && !choices; attempt++) {
        choices = buildChoices(target);
      }
      if (!choices) {
        rapid.skipped++;
        rapid.index++;
        continue;
      }

      stageSlot = rapid.answered + 1;
      stageStats.slots = stageSlot;
      presentQuestion(target, choices, false);
      return;
    }

    finishRapidRun();
  }

  function calculateRapidQuestionSeconds() {
    const remaining = Math.max(1, rapid.total - rapid.answered);
    const remainingBudget = Math.max(
      remaining * 2_100,
      rapid.targetMs - getRapidElapsedMs()
    );
    const perQuestion = remainingBudget / remaining;
    const answerBudget =
      (perQuestion - RAPID_FEEDBACK_MS - RAPID_INTRO_MS) / 1000;
    return Math.max(1.8, Math.min(5, answerBudget));
  }

  function completeRapidQuestion() {
    rapid.answered++;
    rapid.index++;
    stageStats.slots = rapid.answered;
    renderHUD();

    if (rapid.index >= rapid.deck.length) {
      finishRapidRun();
    } else {
      nextRapidQuestion();
    }
  }

  function finishRapidRun() {
    if (!rapid.active) return;
    pauseRapidClock();
    rapid.active = false;
    rapid.finishedMode = rapid.mode;
    const elapsed = rapid.elapsedMs;
    const rate = stageStats.attempts
      ? Math.round(stageStats.correct / stageStats.attempts * 100)
      : 0;
    const mistakes = [
      ...new Set(stageStats.mistakes)
    ]
      .map(id => senseList.find(sense => sense.senseId === id))
      .filter(Boolean);

    setGameState(GAME_STATE.STAGE_RESULT);
    speechSynthesisSafeCancel();
    save.totalScore += 500;
    saveProgress();
    hideRunHud();
    prepareCustomResult(
      rapid.mode === 'coverage'
        ? '12分・全範囲一斉学習'
        : '苦手一斉学習'
    );
    document.querySelector('#resultContent').innerHTML = `
      <div class="result-hero">
        <div class="grade">${rate}%</div>
        <p>区切りなしの1周を完了しました。</p>
      </div>
      <div class="result-grid">
        <div class="result-card"><span>学習した英単語</span><strong>${rapid.answered}</strong></div>
        <div class="result-card"><span>正解</span><strong>${stageStats.correct}</strong></div>
        <div class="result-card"><span>ミス</span><strong>${stageStats.incorrect}</strong></div>
        <div class="result-card"><span>所要時間</span><strong>${formatRunTime(elapsed)}</strong></div>
      </div>
      <h3>今回の復習候補</h3>
      <div class="rapid-result-list">
        ${
          mistakes.length
            ? mistakes
              .map(
                sense =>
                  `${escapeHtml(sense.english)} [${escapeHtml(sense.pos)}] — ${escapeHtml(sense.shortMeaning)}`
              )
              .join('<br>')
            : '今回のミスはありません。'
        }
      </div>
      ${
        rapid.skipped
          ? `<p class="weak-mini">安全な四択を作れずスキップ: ${rapid.skipped}件</p>`
          : ''
      }
    `;
    const next = document.querySelector('#nextStage');
    next.classList.remove('hidden');
    next.textContent =
      rapid.mode === 'coverage'
        ? 'もう一周する'
        : '苦手をもう一周する';
    document.querySelector('#resultHome').textContent = 'スタートへ';
    document.querySelector('#resultLayer').classList.remove('hidden');
    syncModalAccess();
    focusFirst('#resultLayer');
  }

  function getRapidElapsedMs() {
    return (
      rapid.elapsedMs +
      (rapid.clockStartedAt
        ? performance.now() - rapid.clockStartedAt
        : 0)
    );
  }

  function pauseRapidClock() {
    if (!rapid.clockStartedAt) return;
    rapid.elapsedMs += performance.now() - rapid.clockStartedAt;
    rapid.clockStartedAt = 0;
  }

  function resumeRapidClock() {
    if (rapid.active && !rapid.clockStartedAt) {
      rapid.clockStartedAt = performance.now();
    }
  }

  function showNoWeakDataResult() {
    rapid.active = false;
    rapid.finishedMode = '';
    setGameState(GAME_STATE.STAGE_RESULT);
    prepareCustomResult('苦手一斉学習');
    document.querySelector('#resultContent').innerHTML = `
      <div class="result-hero">
        <div class="grade">READY</div>
        <p>苦手データはまだありません。</p>
      </div>
      <div class="detail-box">
        通常モードまたは12分・全範囲一斉学習で回答すると、
        ミス回数・正答率・反応時間がこの端末に蓄積されます。
        苦手が見つかると、このモードでまとめて一斉学習できます。
      </div>
    `;
    document.querySelector('#nextStage').classList.add('hidden');
    document.querySelector('#resultHome').textContent = 'スタートへ';
    document.querySelector('#resultLayer').classList.remove('hidden');
    syncModalAccess();
    focusFirst('#resultLayer');
  }

  function startWeakRunFromList() {
    save.selectedMode = 'weak';
    saveProgress();
    renderModeGrid();
    document.querySelector('#weakLayer').classList.add('hidden');
    syncModalAccess();
    document.querySelector('#startScreen').classList.add('hidden');
    document.querySelector('#modeScreen').classList.add('hidden');
    startRapidRun();
  }

  function showRunHud() {
    document.querySelector('#rapidHud')?.classList.remove('hidden');
    updateRunHud();
  }

  function hideRunHud() {
    document.querySelector('#rapidHud')?.classList.add('hidden');
  }

  function updateRunHud() {
    if (!rapid.active) return;
    setText(
      '#rapidModeLabel',
      rapid.mode === 'coverage' ? '全範囲一斉' : '苦手一斉'
    );
    setText('#rapidProgress', `${rapid.answered} / ${rapid.total}`);
    const remaining = Math.max(0, rapid.targetMs - getRapidElapsedMs());
    setText('#rapidClock', formatRunTime(remaining));
  }

  function openPairLobby() {
    restoreStandardResultControls();
    if (!pair.connection?.open) resetPairLobbyDisplay();
    openModal('#pairLayer');
  }

  async function createPairHost() {
    const token = ++pair.connectionToken;
    closePairTransport();
    pair.role = 'host';
    pair.ready = false;
    setPairStatus('オンライン接続機能を準備しています…', 'wait');

    try {
      await ensurePeerJs();
      if (token !== pair.connectionToken) return;
      createHostPeer(token, 0);
    } catch (error) {
      setPairStatus(
        '接続機能を読み込めませんでした。インターネット接続や学校のWebフィルタを確認してください。',
        'error'
      );
      console.warn('PeerJS load failed', error);
    }
  }

  function createHostPeer(token, attempt) {
    if (token !== pair.connectionToken) return;
    const code = generatePairCode();
    const peer = new window.Peer(
      `${PAIR_ID_PREFIX}${code.toLowerCase()}`,
      { debug: 0 }
    );
    pair.peer = peer;
    pair.code = code;

    peer.on('open', () => {
      if (token !== pair.connectionToken) return;
      setText('#pairCode', code);
      document.querySelector('#pairHostCodeArea')?.classList.remove('hidden');
      document.querySelector('#pairDisconnect')?.classList.remove('hidden');
      setPairStatus(
        `ペアコード ${code} を相手に伝えてください。参加を待っています。`,
        'wait'
      );
    });

    peer.on('connection', connection => {
      if (pair.connection?.open) {
        connection.on('open', () => connection.close());
        return;
      }
      attachPairConnection(connection);
    });

    peer.on('error', error => {
      if (
        error?.type === 'unavailable-id' &&
        attempt < 4 &&
        token === pair.connectionToken
      ) {
        try {
          peer.destroy();
        } catch {}
        createHostPeer(token, attempt + 1);
        return;
      }
      handlePairPeerError(error);
    });
  }

  async function joinPairHost() {
    const code = normalizePairCode(
      document.querySelector('#pairCodeInput')?.value
    );
    if (!isValidPairCode(code)) {
      setPairStatus('6文字のペアコードを確認してください。', 'error');
      document.querySelector('#pairCodeInput')?.focus();
      return;
    }

    const token = ++pair.connectionToken;
    closePairTransport();
    pair.role = 'guest';
    pair.code = code;
    pair.ready = false;
    setPairStatus(`${code} のホストへ接続しています…`, 'wait');

    try {
      await ensurePeerJs();
      if (token !== pair.connectionToken) return;
      const peer = new window.Peer(undefined, { debug: 0 });
      pair.peer = peer;
      peer.on('open', () => {
        if (token !== pair.connectionToken) return;
        const connection = peer.connect(
          `${PAIR_ID_PREFIX}${code.toLowerCase()}`,
          {
            label: 'word-frontline-pair-v2',
            serialization: 'json',
            reliable: true,
            metadata: {
              protocol: PAIR_PROTOCOL,
              signature: coverageListSignature()
            }
          }
        );
        attachPairConnection(connection);
      });
      peer.on('error', handlePairPeerError);
      document.querySelector('#pairDisconnect')?.classList.remove('hidden');
    } catch (error) {
      setPairStatus(
        '接続機能を読み込めませんでした。インターネット接続や学校のWebフィルタを確認してください。',
        'error'
      );
      console.warn('PeerJS load failed', error);
    }
  }

  function attachPairConnection(connection) {
    pair.connection = connection;

    connection.on('open', () => {
      pair.ready = true;
      pairSend({
        type: 'hello',
        protocol: PAIR_PROTOCOL,
        signature: coverageListSignature(),
        wordCount: getEnglishGroups().size
      });
      document.querySelector('#pairDisconnect')?.classList.remove('hidden');
      if (pair.role === 'host') {
        const start = document.querySelector('#pairStart');
        start?.classList.remove('hidden');
        if (start) start.disabled = false;
        setPairStatus(
          '相手と接続しました。問題数を確認して「2人で対戦開始」を押してください。',
          'ok'
        );
      } else {
        setPairStatus(
          'ホストと接続しました。ホストが対戦を始めるのを待っています。',
          'ok'
        );
      }
    });

    connection.on('data', data => {
      handlePairMessage(data);
    });

    connection.on('close', () => {
      handlePairConnectionClosed();
    });

    connection.on('error', error => {
      setPairStatus(
        `対戦相手との通信でエラーが発生しました。${error?.message || ''}`,
        'error'
      );
    });
  }

  function handlePairMessage(message) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'hello') {
      pair.remoteSignature = String(message.signature || '');
      const sameWords =
        pair.remoteSignature === coverageListSignature();
      if (!sameWords) {
        setPairStatus(
          '接続しました。単語リストが異なるため、対戦中はホスト側の問題を使います。',
          'wait'
        );
      }
      return;
    }

    if (message.type === 'match-start' && pair.role === 'guest') {
      launchPairMatch(
        Math.max(5, Math.min(50, Number(message.rounds) || PAIR_DEFAULT_ROUNDS))
      );
      return;
    }

    if (
      message.type === 'question' &&
      pair.role === 'guest' &&
      pair.active
    ) {
      receivePairQuestion(message);
      return;
    }

    if (
      message.type === 'answer' &&
      pair.role === 'host' &&
      pair.active &&
      Number(message.round) === pair.round
    ) {
      pair.remoteAnswer = normalizePairAnswer(message);
      maybeFinishPairRound();
      return;
    }

    if (
      message.type === 'round-result' &&
      pair.role === 'guest' &&
      Number(message.round) === pair.round
    ) {
      pair.localScore = Number(message.guestScore) || 0;
      pair.remoteScore = Number(message.hostScore) || 0;
      pair.localCorrect = Number(message.guestCorrect) || 0;
      pair.remoteCorrect = Number(message.hostCorrect) || 0;
      setGameState(GAME_STATE.QUESTION_INTRO);
      updatePairHud();
      announce('NEXT ROUND');
      return;
    }

    if (message.type === 'match-end' && pair.role === 'guest') {
      pair.localScore = Number(message.guestScore) || 0;
      pair.remoteScore = Number(message.hostScore) || 0;
      pair.localCorrect = Number(message.guestCorrect) || 0;
      pair.remoteCorrect = Number(message.hostCorrect) || 0;
      finishPairMatch();
      return;
    }

    if (message.type === 'leave') {
      setPairStatus('相手が接続を終了しました。', 'error');
      handlePairConnectionClosed();
    }
  }

  function hostStartPairMatch() {
    if (pair.role !== 'host' || !pair.connection?.open) {
      setPairStatus('相手との接続を待ってください。', 'error');
      return;
    }
    const rounds = Math.max(
      5,
      Math.min(
        50,
        Number(document.querySelector('#pairRoundCount')?.value) ||
        PAIR_DEFAULT_ROUNDS
      )
    );
    pairSend({
      type: 'match-start',
      protocol: PAIR_PROTOCOL,
      rounds
    });
    launchPairMatch(rounds);
  }

  function launchPairMatch(rounds) {
    clearGameTasks();
    speechSynthesisSafeCancel();
    restorePauseLayer();
    clearTimeout(pair.waitTimer);
    pair.active = true;
    pair.finished = false;
    pair.rounds = rounds;
    pair.round = 0;
    pair.localScore = 0;
    pair.remoteScore = 0;
    pair.localCorrect = 0;
    pair.remoteCorrect = 0;
    pair.localAnswer = null;
    pair.remoteAnswer = null;
    pair.currentPayload = null;

    save.selectedMode = 'pair';
    saveProgress();
    document.querySelector('#startScreen')?.classList.add('hidden');
    document.querySelector('#modeScreen')?.classList.add('hidden');
    document.querySelector('#pairLayer')?.classList.add('hidden');
    document.querySelector('#resultLayer')?.classList.add('hidden');
    syncModalAccess();
    document.querySelector('#app')?.classList.remove('audio-mode');

    stage = 1;
    stageSlot = 0;
    bossPhase = 0;
    playerHp = 100;
    answerPositionCounts = [0, 0, 0, 0];
    currentStreak = 0;
    stageStats = {
      slots: 0,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      totalReaction: 0,
      maxStreak: 0,
      mistakes: [],
      bossWords: [],
      coverageAnswered: 0,
      startedAt: Date.now()
    };
    battle = {
      ...battle,
      squadX: .5,
      targetX: .5,
      enemies: [],
      bullets: [],
      particles: [],
      damages: [],
      enemyAdvance: 0,
      gateResult: null,
      reward: null
    };
    showPairHud();
    setGameState(GAME_STATE.QUESTION_INTRO);
    announce('PAIR BATTLE READY');

    if (pair.role === 'host') {
      scheduleGameTask(hostNextPairQuestion, 500);
    }
  }

  function hostNextPairQuestion() {
    if (!pair.active || pair.role !== 'host') return;
    if (pair.round >= pair.rounds) {
      hostFinishPairMatch();
      return;
    }

    let target = null;
    let choices = null;
    for (let attempt = 0; attempt < 25 && !choices; attempt++) {
      target = chooseNextSense();
      choices = buildChoices(target);
    }
    if (!target || !choices) {
      announce('QUESTION SKIPPED');
      scheduleGameTask(hostNextPairQuestion, 150);
      return;
    }

    pair.round++;
    pair.localAnswer = null;
    pair.remoteAnswer = null;
    pair.localChoiceIndex = -1;
    pair.localReactionMs = PAIR_TIME_LIMIT * 1000;
    pair.currentCorrectIndex = choices.findIndex(choice => choice.isCorrect);
    pair.currentTimeLimit = PAIR_TIME_LIMIT;
    stageSlot = pair.round;
    stageStats.slots = pair.round;

    const payload = {
      type: 'question',
      round: pair.round,
      rounds: pair.rounds,
      timeLimit: PAIR_TIME_LIMIT,
      target: serializeSense(target),
      choices: choices.map(serializeChoice)
    };
    pair.currentPayload = payload;
    pairSend(payload);
    presentQuestion(target, choices, false);
  }

  function receivePairQuestion(message) {
    const round = Number(message.round);
    if (!Number.isInteger(round) || round <= pair.round) return;
    const target = normalizeIncomingSense(message.target);
    const choices = Array.isArray(message.choices)
      ? message.choices.map(normalizeIncomingChoice)
      : [];
    if (!target || choices.length !== 4) {
      setPairStatus('受信した問題データを読み込めませんでした。', 'error');
      return;
    }

    pair.round = round;
    pair.rounds = Number(message.rounds) || pair.rounds;
    pair.currentTimeLimit = Math.max(
      3,
      Math.min(20, Number(message.timeLimit) || PAIR_TIME_LIMIT)
    );
    pair.currentCorrectIndex = choices.findIndex(choice => choice.isCorrect);
    pair.currentPayload = message;
    pair.localAnswer = null;
    pair.remoteAnswer = null;
    pair.localChoiceIndex = -1;
    pair.localReactionMs = pair.currentTimeLimit * 1000;
    stageSlot = pair.round;
    stageStats.slots = pair.round;
    presentQuestion(target, choices, false);
  }

  function submitPairAnswer() {
    if (!pair.active) return;
    pair.localAnswer = {
      round: pair.round,
      choiceIndex: pair.localChoiceIndex,
      reactionMs: Math.max(
        0,
        Math.min(
          pair.currentTimeLimit * 1000,
          Number(pair.localReactionMs) || pair.currentTimeLimit * 1000
        )
      )
    };
    setGameState(GAME_STATE.ANSWER_LOCKED);

    if (pair.role === 'host') {
      maybeFinishPairRound();
    } else {
      pairSend({
        type: 'answer',
        ...pair.localAnswer
      });
      announce('WAITING FOR PARTNER');
    }
  }

  function maybeFinishPairRound() {
    if (
      !pair.active ||
      pair.role !== 'host' ||
      !pair.localAnswer
    ) {
      return;
    }

    if (!pair.remoteAnswer) {
      clearTimeout(pair.waitTimer);
      pair.waitTimer = setTimeout(() => {
        if (!pair.active || pair.remoteAnswer) return;
        pair.remoteAnswer = {
          round: pair.round,
          choiceIndex: -1,
          reactionMs: pair.currentTimeLimit * 1000
        };
        finalizePairRound();
      }, 3200);
      return;
    }

    finalizePairRound();
  }

  function finalizePairRound() {
    if (!pair.active || pair.role !== 'host') return;
    clearTimeout(pair.waitTimer);
    const hostResult = scorePairAnswer(
      pair.localAnswer,
      pair.currentCorrectIndex,
      pair.currentTimeLimit
    );
    const guestResult = scorePairAnswer(
      pair.remoteAnswer,
      pair.currentCorrectIndex,
      pair.currentTimeLimit
    );
    pair.localScore += hostResult.points;
    pair.remoteScore += guestResult.points;
    if (hostResult.correct) pair.localCorrect++;
    if (guestResult.correct) pair.remoteCorrect++;

    pairSend({
      type: 'round-result',
      round: pair.round,
      hostScore: pair.localScore,
      guestScore: pair.remoteScore,
      hostCorrect: pair.localCorrect,
      guestCorrect: pair.remoteCorrect
    });
    updatePairHud();
    setGameState(GAME_STATE.QUESTION_INTRO);
    announce(
      `${hostResult.correct ? 'HOST ✓' : 'HOST ×'} / ${guestResult.correct ? 'GUEST ✓' : 'GUEST ×'}`
    );

    if (pair.round >= pair.rounds) {
      scheduleGameTask(hostFinishPairMatch, 850);
    } else {
      scheduleGameTask(hostNextPairQuestion, 850);
    }
  }

  function hostFinishPairMatch() {
    if (pair.role !== 'host') return;
    pairSend({
      type: 'match-end',
      hostScore: pair.localScore,
      guestScore: pair.remoteScore,
      hostCorrect: pair.localCorrect,
      guestCorrect: pair.remoteCorrect
    });
    finishPairMatch();
  }

  function finishPairMatch() {
    if (!pair.active && pair.finished) return;
    clearGameTasks();
    clearTimeout(pair.waitTimer);
    pair.active = false;
    pair.finished = true;
    speechSynthesisSafeCancel();
    setGameState(GAME_STATE.STAGE_RESULT);
    hidePairHud();
    prepareCustomResult('オンライン・ペア対戦結果');

    const won =
      pair.localScore === pair.remoteScore
        ? 'DRAW'
        : pair.localScore > pair.remoteScore
          ? 'YOU WIN'
          : 'PARTNER WINS';
    document.querySelector('#resultContent').innerHTML = `
      <div class="result-hero">
        <div class="grade">${won}</div>
        <p>${pair.rounds}問のペア対戦が完了しました。</p>
      </div>
      <div class="pair-score-final">
        <div class="score-side">
          <span>自分</span>
          <strong>${pair.localScore.toLocaleString()}</strong>
          <small>${pair.localCorrect} / ${pair.rounds} 正解</small>
        </div>
        <div class="versus">VS</div>
        <div class="score-side">
          <span>相手</span>
          <strong>${pair.remoteScore.toLocaleString()}</strong>
          <small>${pair.remoteCorrect} / ${pair.rounds} 正解</small>
        </div>
      </div>
      <p class="learning-data-note">
        自分が間違えた単語は、この端末の苦手データにも追加されました。
      </p>
    `;
    const next = document.querySelector('#nextStage');
    if (pair.role === 'host' && pair.connection?.open) {
      next.classList.remove('hidden');
      next.textContent = '同じ相手と再戦';
    } else {
      next.classList.add('hidden');
    }
    document.querySelector('#resultHome').textContent = '対戦を終了';
    document.querySelector('#resultLayer').classList.remove('hidden');
    syncModalAccess();
    focusFirst('#resultLayer');
  }

  function scorePairAnswer(answer, correctIndex, timeLimit) {
    const normalized = normalizePairAnswer(answer);
    const correct =
      normalized.choiceIndex >= 0 &&
      normalized.choiceIndex === correctIndex;
    const remaining = Math.max(
      0,
      timeLimit * 1000 - normalized.reactionMs
    );
    return {
      correct,
      points: correct ? 100 + Math.round(remaining / 70) : 0
    };
  }

  function normalizePairAnswer(answer) {
    return {
      round: Math.max(0, Number(answer?.round) || 0),
      choiceIndex:
        Number.isInteger(Number(answer?.choiceIndex))
          ? Math.max(-1, Math.min(3, Number(answer.choiceIndex)))
          : -1,
      reactionMs: Math.max(
        0,
        Math.min(30_000, Number(answer?.reactionMs) || 0)
      )
    };
  }

  function serializeSense(sense) {
    return {
      senseId: sense.senseId,
      english: sense.english,
      pos: sense.pos,
      shortMeaning: sense.shortMeaning,
      fullMeaning: sense.fullMeaning,
      contextCue: sense.contextCue || ''
    };
  }

  function serializeChoice(choice) {
    return {
      choiceId: choice.choiceId,
      senseId: choice.senseId,
      english: choice.english,
      pos: choice.pos,
      meaning: choice.meaning,
      fullMeaning: choice.fullMeaning,
      isCorrect: choice.isCorrect === true
    };
  }

  function normalizeIncomingSense(raw) {
    if (
      !raw ||
      typeof raw.senseId !== 'string' ||
      typeof raw.english !== 'string'
    ) {
      return null;
    }
    return {
      senseId: raw.senseId.slice(0, 180),
      english: raw.english.slice(0, 100),
      pos: String(raw.pos || '語').slice(0, 30),
      shortMeaning: String(raw.shortMeaning || '').slice(0, 300),
      fullMeaning: String(raw.fullMeaning || raw.shortMeaning || '').slice(0, 1200),
      contextCue: String(raw.contextCue || '').slice(0, 300)
    };
  }

  function normalizeIncomingChoice(raw, index) {
    return {
      choiceId: String(raw?.choiceId || `remote-${pair.round}-${index}`).slice(0, 220),
      senseId: String(raw?.senseId || `remote-${pair.round}-${index}`).slice(0, 180),
      english: String(raw?.english || '').slice(0, 100),
      pos: String(raw?.pos || '語').slice(0, 30),
      meaning: String(raw?.meaning || '').slice(0, 300),
      fullMeaning: String(raw?.fullMeaning || raw?.meaning || '').slice(0, 1200),
      isCorrect: raw?.isCorrect === true
    };
  }

  function pairSend(message) {
    try {
      if (pair.connection?.open) {
        pair.connection.send(message);
        return true;
      }
    } catch (error) {
      console.warn('Pair send failed', error);
    }
    return false;
  }

  function handlePairConnectionClosed() {
    pair.ready = false;
    if (pair.active) {
      clearGameTasks();
      pauseGame('user');
      const title = document.querySelector('#pauseTitle');
      if (title) title.textContent = 'PAIR LOST';
      const text = document.querySelector('#pauseLayer p');
      if (text) {
        text.textContent =
          '相手との接続が切れました。「スタートへ戻る」から通常学習を続けられます。';
      }
      document.querySelector('#resumeButton')?.classList.add('hidden');
      document.querySelector('#pauseSettings')?.classList.add('hidden');
    } else if (!pair.finished) {
      setPairStatus(
        '相手との接続が切れました。コードを作り直すか、もう一度参加してください。',
        'error'
      );
    }
  }

  function restorePauseLayer() {
    setText('#pauseTitle', 'PAUSED');
    setText('#pauseLayer p', '戦場とタイマーは停止しています。');
    document.querySelector('#resumeButton')?.classList.remove('hidden');
    document.querySelector('#pauseSettings')?.classList.remove('hidden');
  }

  function handlePairPeerError(error) {
    const type = error?.type || '';
    const message =
      type === 'peer-unavailable'
        ? 'そのペアコードのホストが見つかりません。コードを確認してください。'
        : type === 'browser-incompatible'
          ? 'このブラウザーはオンライン対戦に対応していません。Chrome・Edge・Safariの最新版を使ってください。'
          : 'オンライン接続に失敗しました。学校の通信設定を確認するか、通常モードを利用してください。';
    setPairStatus(message, 'error');
    console.warn('Pair peer error', type, error);
  }

  function leavePair(showStatus) {
    pairSend({ type: 'leave' });
    clearGameTasks();
    clearTimeout(pair.waitTimer);
    pair.active = false;
    pair.finished = false;
    pair.ready = false;
    closePairTransport();
    hidePairHud();
    if (showStatus) {
      resetPairLobbyDisplay();
      setPairStatus('接続を終了しました。', '');
    }
  }

  function closePairTransport() {
    try {
      pair.connection?.close();
    } catch {}
    try {
      pair.peer?.destroy();
    } catch {}
    pair.connection = null;
    pair.peer = null;
  }

  function closePairLobby() {
    if (pair.peer || pair.connection) leavePair(false);
    closeLayer('#pairLayer');
    resetPairLobbyDisplay();
  }

  function resetPairLobbyDisplay() {
    document.querySelector('#pairHostCodeArea')?.classList.add('hidden');
    document.querySelector('#pairStart')?.classList.add('hidden');
    document.querySelector('#pairDisconnect')?.classList.add('hidden');
    const start = document.querySelector('#pairStart');
    if (start) start.disabled = true;
    setText('#pairCode', '------');
    const input = document.querySelector('#pairCodeInput');
    if (input) input.value = '';
    setPairStatus(
      '「ペアコードを作る」か、相手から聞いたコードを入力してください。',
      ''
    );
  }

  function setPairStatus(message, type = '') {
    const status = document.querySelector('#pairStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `pair-status${type ? ` ${type}` : ''}`;
  }

  function showPairHud() {
    document.querySelector('#pairHud')?.classList.remove('hidden');
    updatePairHud();
  }

  function hidePairHud() {
    document.querySelector('#pairHud')?.classList.add('hidden');
  }

  function updatePairHud() {
    if (!pair.active) return;
    setText('#pairLocalScore', pair.localScore.toLocaleString());
    setText('#pairRemoteScore', pair.remoteScore.toLocaleString());
    setText('#pairRoundHud', `ROUND ${pair.round} / ${pair.rounds}`);
  }

  function ensurePeerJs() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (pair.peerScriptPromise) return pair.peerScriptPromise;

    pair.peerScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-word-frontline-peerjs]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Peer), {
          once: true
        });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = PEERJS_ASSET;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.wordFrontlinePeerjs = '1';
      script.onload = () => {
        if (window.Peer) resolve(window.Peer);
        else reject(new Error('PeerJS did not expose Peer'));
      };
      script.onerror = () => reject(new Error('PeerJS download failed'));
      document.head.appendChild(script);
      setTimeout(() => {
        if (!window.Peer) reject(new Error('PeerJS download timed out'));
      }, 10_000);
    }).catch(error => {
      pair.peerScriptPromise = null;
      throw error;
    });

    return pair.peerScriptPromise;
  }

  function generatePairCode() {
    const bytes = new Uint32Array(6);
    crypto.getRandomValues(bytes);
    return [...bytes]
      .map(value => PAIR_CODE_ALPHABET[value % PAIR_CODE_ALPHABET.length])
      .join('');
  }

  function normalizePairCode(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^23456789A-HJ-NP-Z]/g, '')
      .slice(0, 6);
  }

  function isValidPairCode(value) {
    return /^[23456789A-HJ-NP-Z]{6}$/.test(String(value || ''));
  }

  async function copyPairCode() {
    if (!pair.code) return;
    try {
      await navigator.clipboard.writeText(pair.code);
      setPairStatus(
        `ペアコード ${pair.code} をコピーしました。相手に伝えてください。`,
        'ok'
      );
    } catch {
      setPairStatus(
        `ペアコードは ${pair.code} です。相手に伝えてください。`,
        'wait'
      );
    }
  }

  function prepareCustomResult(title) {
    document.querySelector('#resultTitle').textContent = title;
    document.querySelector('#resultLayer .tabs')?.classList.add('hidden');
    document.querySelector('#resultWeak')?.classList.remove('hidden');
  }

  function restoreStandardResultControls() {
    document.querySelector('#resultTitle').textContent = 'STAGE RESULT';
    document.querySelector('#resultLayer .tabs')?.classList.remove('hidden');
    document.querySelector('#nextStage')?.classList.remove('hidden');
    document.querySelector('#resultWeak')?.classList.remove('hidden');
    document.querySelector('#resultHome').textContent = 'スタートへ';
  }

  function formatRunTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  }

  function runUpdateSelfTests() {
    const tests = [];
    const test = (name, check) => {
      try {
        tests.push({ name, ok: check() === true });
      } catch (error) {
        tests.push({ name, ok: false, error: String(error) });
      }
    };

    const groups = getEnglishGroups();
    const sampleDeck = buildCoverageRunDeck(1);
    test(
      '全範囲デッキは英単語ごとに1件',
      () => sampleDeck.length === groups.size
    );
    test(
      '全範囲デッキは英単語重複なし',
      () => {
        const english = sampleDeck
          .map(id => senseList.find(sense => sense.senseId === id)?.english)
          .filter(Boolean)
          .map(word => word.toLowerCase());
        return new Set(english).size === english.length;
      }
    );
    test(
      '全範囲デッキは周回ごとに品詞をローテーション',
      () => {
        const multi = [...groups.values()].find(senses => senses.length > 1);
        if (!multi) return true;
        const first = buildCoverageRunDeck(1).find(id =>
          multi.some(sense => sense.senseId === id)
        );
        const second = buildCoverageRunDeck(2).find(id =>
          multi.some(sense => sense.senseId === id)
        );
        return first !== second;
      }
    );
    test(
      'ペアコードは紛らわしい文字なしの6文字',
      () => isValidPairCode(generatePairCode())
    );
    test(
      'ペア得点は正解だけ加点',
      () =>
        scorePairAnswer(
          { choiceIndex: 2, reactionMs: 1000 },
          2,
          7
        ).points >
        scorePairAnswer(
          { choiceIndex: 1, reactionMs: 1000 },
          2,
          7
        ).points
    );
    test(
      '苦手デッキは実ミスのあるsenseだけ',
      () =>
        buildWeakRunDeck().every(id => {
          const sense = senseList.find(item => item.senseId === id);
          return sense && getStats(sense).incorrectCount > 0;
        })
    );
    test(
      '12分目標を定数化',
      () => RAPID_TARGET_MS === 720_000
    );
    test(
      '通常モードの既存制御を保持',
      () =>
        typeof original.startStage === 'function' &&
        typeof original.resolveCorrectAnswer === 'function'
    );

    const passed = tests.filter(result => result.ok).length;
    window.__WORD_FRONTLINE_V2_TESTS__ = {
      passed,
      total: tests.length,
      tests
    };
    console.group(
      `WORD FRONTLINE v2 self tests: ${passed}/${tests.length}`
    );
    for (const result of tests) {
      (result.ok ? console.log : console.warn)(
        `${result.ok ? 'PASS' : 'FAIL'}: ${result.name}`,
        result.error || ''
      );
    }
    console.groupEnd();
  }
})();
