/*
 * WORD FRONTLINE v2 feature layer
 *
 * This file intentionally extends the original single-file game instead of
 * rewriting it. The original vocabulary, battle renderer, import tools, and
 * learning statistics stay in word-frontline-random-boss.html.
 *
 * Added here:
 *   - a roughly 10-minute whole-range pass followed by one minute of
 *     memorization and two weakness-boss review passes;
 *   - uninterrupted weak-word learning based on accumulated local statistics;
 *   - two-, three-, or four-player code battles over encrypted WebRTC data channels.
 */

'use strict';

(() => {
  const UPDATE_VERSION = '3.2.0';
  const RAPID_TARGET_MS = 10 * 60 * 1000;
  const RAPID_MEMORY_MS = 60 * 1000;
  const WEAK_BOSS_PASSES = 2;
  const RAPID_FEEDBACK_MS = 520;
  const RAPID_INTRO_MS = 120;
  const PAIR_DEFAULT_ROUNDS = 20;
  const PAIR_TIME_LIMIT = 7;
  const PAIR_PROTOCOL = 4;
  const PAIR_ID_PREFIX = 'wf3-';
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
    finishedMode: '',
    phase: '',
    totalAnswered: 0,
    sessionElapsedMs: 0,
    coverageElapsedMs: 0,
    coverageCorrect: 0,
    coverageIncorrect: 0,
    firstPassMistakeIds: [],
    weakBossDeck: [],
    weakBossPass: 0,
    weakBossAnswered: 0,
    weakBossTotal: 0,
    weakBossCorrect: 0,
    weakBossIncorrect: 0,
    previousWeakBossDeck: [],
    memoryRemainingMs: RAPID_MEMORY_MS,
    memoryClockStartedAt: 0,
    memoryTimer: 0,
    memoryCompleted: false
  };

  const pair = {
    active: false,
    finished: false,
    role: '',
    code: '',
    peer: null,
    connection: null,
    connections: new Map(),
    connectionToken: 0,
    ready: false,
    maxPlayers: 2,
    selfPlayerId: '',
    players: new Map(),
    answers: new Map(),
    rounds: PAIR_DEFAULT_ROUNDS,
    round: 0,
    localAnswer: null,
    localChoiceIndex: -1,
    localReactionMs: 0,
    currentCorrectIndex: -1,
    currentTimeLimit: PAIR_TIME_LIMIT,
    currentPayload: null,
    roundStartedAt: 0,
    finalizedRound: 0,
    waitTimer: 0,
    closing: false,
    peerScriptPromise: null
  };

  MODES.coverage = {
    name: 'テスト範囲一斉学習モード',
    short: '一斉',
    desc: '約10分で全範囲を1周し、ミスを1分暗記してから「苦手ボス」として2周します。',
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
    name: 'オンライン対戦（2人・3人・4人）',
    short: '対戦',
    desc: 'ホストが6文字の対戦コードを伝え、2人・3人・4人で同じ問題のスコアを競います。',
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
            <strong id="rapidClock">10:00</strong>
          </div>
          <div id="pairHud" class="pair-hud hidden" aria-live="polite">
            <div id="pairScoreboard" class="pair-scoreboard"></div>
            <span class="pair-round" id="pairRoundHud">ROUND 0 / 20</span>
          </div>
          <div id="weakBossBar" class="weak-boss-bar hidden">
            <div class="weak-boss-bar-head">
              <span>◇ 苦手ボス・記憶コア</span>
              <strong id="weakBossHpText">0 / 0</strong>
            </div>
            <div id="weakBossMeter" class="weak-boss-meter" role="progressbar"
                 aria-label="苦手ボスの残り問題" aria-valuemin="0"
                 aria-valuemax="0" aria-valuenow="0">
              <i id="weakBossFill"></i>
            </div>
          </div>
          <div id="weakBossCore" class="weak-boss-core hidden" aria-hidden="true">
            <i class="weak-core-ring ring-one"></i>
            <i class="weak-core-ring ring-two"></i>
            <i class="weak-core-diamond"></i>
            <span>WEAKNESS<br>CORE</span>
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
              <h2 id="pairTitle">オンライン対戦（2人・3人・4人）</h2>
              <p>
                全員がこのページを開きます。ホストが作った6文字のコードを
                仲間に伝えるだけで、2人・3人・4人のスコア対戦を始められます。
              </p>
              <div class="pair-grid">
                <section class="pair-panel" aria-labelledby="pairHostTitle">
                  <h3 id="pairHostTitle">1. ホストになる</h3>
                  <p>人数を選び、コードを口頭またはロイロノートで伝えます。</p>
                  <label class="pair-option-label" for="pairPlayerCount">
                    対戦人数
                    <select id="pairPlayerCount">
                      <option value="2" selected>2人対戦</option>
                      <option value="3">3人対戦</option>
                      <option value="4">4人対戦</option>
                    </select>
                  </label>
                  <button id="pairCreate" class="primary-btn" type="button">
                    対戦コードを作る
                  </button>
                  <div id="pairHostCodeArea" class="hidden">
                    <output id="pairCode" class="pair-code" aria-label="対戦コード">
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
                  <label class="sr-only" for="pairCodeInput">6文字の対戦コード</label>
                  <input id="pairCodeInput" class="pair-code-input"
                         inputmode="text" maxlength="6" autocomplete="off"
                         placeholder="ABC234">
                  <button id="pairJoin" class="primary-btn" type="button">
                    対戦に参加
                  </button>
                </section>
              </div>
              <div id="pairStatus" class="pair-status" role="status" aria-live="polite">
                「対戦コードを作る」か、ホストから聞いたコードを入力してください。
              </div>
              <div id="pairRoster" class="pair-roster hidden" aria-live="polite"></div>
              <p class="pair-privacy">
                氏名・学校名・クラス名は送信しません。回答と得点は対戦中だけ
                参加ブラウザー間で共有され、苦手データは各端末内に保存されます。
                対戦中は画面を前面に保ってください。学校の通信設定によっては
                接続できない場合があります。
              </p>
              <div class="modal-actions">
                <button id="pairStart" class="primary-btn hidden" type="button" disabled>
                  対戦開始
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

    if (!document.querySelector('#weakMemoryLayer')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `
          <div id="weakMemoryLayer" class="modal-layer weak-memory-layer hidden"
               role="dialog" aria-modal="true" aria-labelledby="weakMemoryTitle">
            <div class="modal wide weak-memory-card">
              <div class="weak-memory-title-row">
                <div>
                  <p class="weak-memory-kicker">◇ WEAKNESS SCAN COMPLETE</p>
                  <h2 id="weakMemoryTitle">苦手ボス前・1分暗記タイム</h2>
                </div>
                <div class="weak-memory-clock" aria-hidden="true">
                  <span>残り</span>
                  <strong id="weakMemoryClock">1:00</strong>
                </div>
              </div>
              <p>
                今回間違えた単語だけが苦手ボスとして現れます。
                英語・意味・品詞を確認してください。このあと同じ全単語を2周します。
              </p>
              <div class="weak-memory-progress" aria-hidden="true">
                <i id="weakMemoryProgressFill"></i>
              </div>
              <div id="weakMemoryList" class="weak-memory-list"></div>
              <p id="weakMemoryStatus" class="weak-memory-status" aria-live="polite">
                1分後に自動で苦手ボス戦を開始します。
              </p>
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

    document.title = 'WORD FRONTLINE STUDY PLUS — テスト範囲・継続日数・リスニング';
    const badge = document.querySelector('.boss-variant-badge');
    if (badge) {
      badge.className = 'update-badge';
      badge.textContent = 'STUDY PLUS · 1,450 WORDS';
    }
    const tagline = document.querySelector('.tagline');
    if (tagline) {
      tagline.textContent =
        'テスト範囲を選び、一周学習→1分暗記→苦手ボス2周へ。学習継続日数もこの端末に記録します。';
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
    document.querySelector('#pairPlayerCount')
      ?.addEventListener('change', updatePairLobbyState);
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
    document.querySelector('#weakMemoryList')
      ?.addEventListener('click', event => {
        const button = event.target.closest('[data-weak-index]');
        if (!button) return;
        const senseId =
          rapid.firstPassMistakeIds[Number(button.dataset.weakIndex)];
        const sense = senseList.find(
          item => item.senseId === senseId
        );
        if (sense) speakWord(sense.english);
      });

    document.addEventListener('visibilitychange', () => {
      if (rapid.phase !== 'memorize') return;
      if (document.hidden) pauseMemoryClock();
      else resumeMemoryClock();
    });

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
      stopMemoryTimer();
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

      if (pair.peer || pair.connection || pair.connections.size) leavePair(false);
      original.startGame();
    };

    startStage = function startStageV2() {
      if (isRapidMode()) {
        startRapidRun();
        return;
      }
      if (save.selectedMode === 'pair' && pair.finished) {
        if (pair.role === 'host' && canHostStartMatch()) {
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
      announce(
        pair.active
          ? `${pair.maxPlayers}-PLAYER · ROUND ${pair.round}`
          : isWeakBossPhase()
            ? `WEAKNESS BOSS · ROUND ${rapid.weakBossPass}`
            : 'RAPID LEARNING'
      );

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
      if (isWeakBossPhase()) {
        rapid.weakBossCorrect++;
        pulseWeakBossCore(true);
      }
      feedback(
        isWeakBossPhase() ? 'CORE HIT' : 'CORRECT',
        pair.active
          ? `BATTLE +${earned}`
          : isWeakBossPhase()
            ? `苦手ボス +${earned}`
            : `RAPID +${earned}`,
        isWeakBossPhase() ? '#ffd166' : '#5bffb4'
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
      if (
        rapid.active &&
        rapid.mode === 'coverage' &&
        rapid.phase === 'coverage' &&
        !rapid.firstPassMistakeIds.includes(currentSense.senseId)
      ) {
        rapid.firstPassMistakeIds.push(currentSense.senseId);
      }
      if (isWeakBossPhase()) {
        rapid.weakBossIncorrect++;
        pulseWeakBossCore(false);
      }
      battle.enemyAdvance = Math.min(.42, battle.enemyAdvance + .2);
      battle.shake = .28;
      if (pair.active && timedOut) {
        pair.localChoiceIndex = -1;
        pair.localReactionMs = questionTimeLimit * 1000;
      }
      feedback(
        isWeakBossPhase()
          ? timedOut
            ? 'CORE EVADED'
            : 'MEMORY CHECK'
          : timedOut
            ? 'TIME UP'
            : 'CHECK',
        `正解：${currentSense.shortMeaning}`,
        isWeakBossPhase() ? '#8fd3ff' : '#ff7a84'
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
          isWeakBossPhase()
            ? `WEAKNESS CORE · ROUND ${rapid.weakBossPass}/${WEAK_BOSS_PASSES}`
            : rapid.mode === 'coverage'
              ? '10 MIN WHOLE RANGE'
            : 'WEAK WORDS · CONTINUOUS';
        document.querySelector('#waveLabel').textContent = label;
        document.querySelector('#waveType').textContent =
          `${Math.min(rapid.total, rapid.answered + 1)}/${rapid.total}`;
      } else if (pair.active) {
        document.querySelector('#waveLabel').textContent =
          `ONLINE ${pair.maxPlayers}-PLAYER · ROUND ${pair.round}`;
        document.querySelector('#waveType').textContent = 'SCORE BATTLE';
      }
    };

    renderHUD = function renderHUDV2() {
      original.renderHUD();
      if (rapid.active) {
        const progress = rapid.total
          ? rapid.answered / rapid.total
          : 0;
        setText('#hudStage', isWeakBossPhase() ? '苦手BOSS' : '連続');
        setText('#mStage', `${rapid.answered}/${rapid.total}`);
        setText(
          '#hudSlot',
          `${rapid.answered} / ${rapid.total}`
        );
        setText(
          '#hudBoss',
          isWeakBossPhase()
            ? `${rapid.weakBossPass} / ${WEAK_BOSS_PASSES}`
            : 'なし'
        );
        setText(
          '#hudCoverage',
          `${isWeakBossPhase() ? '苦手ボス' : rapid.mode === 'coverage' ? '全英単語' : '苦手'} 残り${Math.max(
            0,
            rapid.total - rapid.answered
          )}`
        );
        const coverageRow = document.querySelector('#coverageRow');
        coverageRow?.classList.remove('hidden');
        const coverageLabel = coverageRow?.querySelector('span');
        if (coverageLabel) {
          coverageLabel.textContent = isWeakBossPhase()
            ? `苦手ボス ${rapid.weakBossPass}周目`
            : '一斉学習';
        }
        const fill = document.querySelector('#stageFill');
        if (fill) fill.style.width = `${Math.min(100, progress * 100)}%`;
        document.querySelector('#bossBar')?.classList.add('hidden');
        updateWeakBossVisual();
      } else if (pair.active) {
        setText('#hudStage', `P${pair.round}`);
        setText('#mStage', `${pair.round}/${pair.rounds}`);
        setText('#hudSlot', `${pair.round} / ${pair.rounds}`);
        setText('#hudBoss', `${pair.maxPlayers}人対戦`);
        const self = pair.players.get(pair.selfPlayerId);
        setText('#hudScore', (self?.score || 0).toLocaleString());
        setText('#mScore', (self?.score || 0).toLocaleString());
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
      if (!isWeakBossPhase()) hideWeakBossVisual();
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
      if (rapid.phase === 'memorize') pauseMemoryClock();
      if (rapid.active) pauseRapidClock();
      original.pauseGame(reason);
    };

    resumeGame = function resumeGameV2() {
      original.resumeGame();
      if (rapid.active && state !== GAME_STATE.PAUSED) resumeRapidClock();
      if (rapid.phase === 'memorize') resumeMemoryClock();
    };

    showScreen = function showScreenV2(which) {
      if (which === 'start') {
        restorePauseLayer();
        stopMemoryTimer();
        hideMemoryLayer();
        rapid.active = false;
        rapid.finishedMode = '';
        rapid.phase = '';
        hideRunHud();
        hideWeakBossVisual();
        if (pair.peer || pair.connection || pair.connections.size) leavePair(false);
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
    stopMemoryTimer();
    hideMemoryLayer();
    hideWeakBossVisual();
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
    if (mode === 'coverage') save.rapidCoverageCycle = cycle;

    rapid.active = true;
    rapid.finishedMode = '';
    rapid.mode = mode;
    rapid.phase = mode === 'coverage' ? 'coverage' : 'weak';
    rapid.skipped = 0;
    rapid.totalAnswered = 0;
    rapid.sessionElapsedMs = 0;
    rapid.coverageElapsedMs = 0;
    rapid.coverageCorrect = 0;
    rapid.coverageIncorrect = 0;
    rapid.firstPassMistakeIds = [];
    rapid.weakBossDeck = [];
    rapid.weakBossPass = 0;
    rapid.weakBossAnswered = 0;
    rapid.weakBossTotal = 0;
    rapid.weakBossCorrect = 0;
    rapid.weakBossIncorrect = 0;
    rapid.previousWeakBossDeck = [];
    rapid.memoryRemainingMs = RAPID_MEMORY_MS;
    rapid.memoryClockStartedAt = 0;
    rapid.memoryCompleted = false;

    beginRapidPhase(
      rapid.phase,
      deck,
      mode === 'coverage'
        ? RAPID_TARGET_MS
        : Math.min(RAPID_TARGET_MS, Math.max(60_000, deck.length * 5_000))
    );

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
        ? '10 MIN WHOLE RANGE'
        : 'WEAK WORDS START'
    );
    nextRapidQuestion();
  }

  function beginRapidPhase(phase, deck, targetMs) {
    rapid.phase = phase;
    rapid.deck = [...deck];
    rapid.index = 0;
    rapid.answered = 0;
    rapid.total = deck.length;
    rapid.targetMs = Math.max(1_000, Number(targetMs) || 1_000);
    rapid.elapsedMs = 0;
    rapid.clockStartedAt = performance.now();
  }

  function nextRapidQuestion() {
    if (!rapid.active || rapid.phase === 'memorize') return;

    while (rapid.index < rapid.deck.length) {
      const senseId = rapid.deck[rapid.index];
      const target = senseList.find(sense => sense.senseId === senseId);
      if (!target) {
        markRapidQuestionSkipped();
        continue;
      }

      let choices = null;
      for (let attempt = 0; attempt < 8 && !choices; attempt++) {
        choices = buildChoices(target);
      }
      if (!choices) {
        markRapidQuestionSkipped();
        continue;
      }

      stageSlot = rapid.totalAnswered + 1;
      stageStats.slots = stageSlot;
      presentQuestion(target, choices, false);
      return;
    }

    finishRapidPhase();
  }

  function markRapidQuestionSkipped() {
    rapid.skipped++;
    rapid.index++;
    rapid.answered++;
    rapid.totalAnswered++;
    if (isWeakBossPhase()) rapid.weakBossAnswered++;
    stageStats.slots = rapid.totalAnswered;
  }

  function calculateRapidQuestionSeconds() {
    const remaining = Math.max(1, rapid.total - rapid.answered);
    const minimumQuestionMs = isWeakBossPhase() ? 2_600 : 2_100;
    const remainingBudget = Math.max(
      remaining * minimumQuestionMs,
      rapid.targetMs - getRapidElapsedMs()
    );
    const perQuestion = remainingBudget / remaining;
    const answerBudget =
      (perQuestion - RAPID_FEEDBACK_MS - RAPID_INTRO_MS) / 1000;
    return isWeakBossPhase()
      ? Math.max(2.1, Math.min(4.2, answerBudget))
      : Math.max(1.8, Math.min(5, answerBudget));
  }

  function completeRapidQuestion() {
    rapid.answered++;
    rapid.index++;
    rapid.totalAnswered++;
    if (isWeakBossPhase()) rapid.weakBossAnswered++;
    stageStats.slots = rapid.totalAnswered;
    renderHUD();

    if (rapid.index >= rapid.deck.length) {
      finishRapidPhase();
    } else {
      nextRapidQuestion();
    }
  }

  function finishRapidPhase() {
    if (!rapid.active) return;
    pauseRapidClock();
    rapid.sessionElapsedMs += rapid.elapsedMs;

    if (rapid.phase === 'coverage') {
      rapid.coverageElapsedMs = rapid.elapsedMs;
      rapid.coverageCorrect = stageStats.correct;
      rapid.coverageIncorrect = stageStats.incorrect;
      if (rapid.firstPassMistakeIds.length) {
        startMemoryPhase();
      } else {
        finishRapidRun();
      }
      return;
    }

    if (isWeakBossPhase() && rapid.weakBossPass < WEAK_BOSS_PASSES) {
      startWeakBossPass(rapid.weakBossPass + 1);
      return;
    }

    finishRapidRun();
  }

  function startMemoryPhase() {
    clearGameTasks();
    speechSynthesisSafeCancel();
    rapid.phase = 'memorize';
    rapid.memoryRemainingMs = RAPID_MEMORY_MS;
    rapid.memoryClockStartedAt = 0;
    rapid.memoryCompleted = false;
    rapid.memoryAnnouncements = new Set();
    setGameState(GAME_STATE.PAUSED);
    hideRunHud();
    renderMemoryList();
    document.querySelector('#weakMemoryLayer')?.classList.remove('hidden');
    syncModalAccess();
    focusFirst('#weakMemoryLayer');
    resumeMemoryClock();
  }

  function renderMemoryList() {
    const list = document.querySelector('#weakMemoryList');
    if (!list) return;
    list.innerHTML = rapid.firstPassMistakeIds
      .map((id, index) => {
        const sense = senseList.find(item => item.senseId === id);
        if (!sense) return '';
        return `
          <article class="weak-memory-item">
            <div class="weak-memory-number">${index + 1}</div>
            <div>
              <strong>${escapeHtml(sense.english)}</strong>
              <span>${escapeHtml(sense.pos)} · ${escapeHtml(sense.shortMeaning)}</span>
            </div>
            <button class="weak-memory-speak" type="button"
                    data-weak-index="${index}"
                    aria-label="${escapeHtml(sense.english)}を発音">▶</button>
          </article>
        `;
      })
      .join('');
    updateMemoryClock();
  }

  function getMemoryRemainingMs() {
    return Math.max(
      0,
      rapid.memoryRemainingMs -
        (rapid.memoryClockStartedAt
          ? performance.now() - rapid.memoryClockStartedAt
          : 0)
    );
  }

  function resumeMemoryClock() {
    if (
      rapid.phase !== 'memorize' ||
      document.hidden ||
      rapid.memoryClockStartedAt
    ) {
      return;
    }
    rapid.memoryClockStartedAt = performance.now();
    clearInterval(rapid.memoryTimer);
    rapid.memoryTimer = setInterval(updateMemoryClock, 250);
    updateMemoryClock();
  }

  function pauseMemoryClock() {
    if (rapid.memoryClockStartedAt) {
      rapid.memoryRemainingMs = getMemoryRemainingMs();
      rapid.memoryClockStartedAt = 0;
    }
    clearInterval(rapid.memoryTimer);
    rapid.memoryTimer = 0;
  }

  function stopMemoryTimer() {
    pauseMemoryClock();
    clearInterval(rapid.memoryTimer);
    rapid.memoryTimer = 0;
  }

  function updateMemoryClock() {
    if (rapid.phase !== 'memorize') return;
    const remaining = getMemoryRemainingMs();
    setText('#weakMemoryClock', formatRunTime(remaining));
    const progress = Math.min(
      100,
      Math.max(0, (1 - remaining / RAPID_MEMORY_MS) * 100)
    );
    const fill = document.querySelector('#weakMemoryProgressFill');
    if (fill) fill.style.width = `${progress}%`;

    const seconds = Math.ceil(remaining / 1000);
    if (
      (seconds === 30 || seconds === 10) &&
      !rapid.memoryAnnouncements.has(seconds)
    ) {
      rapid.memoryAnnouncements.add(seconds);
      setText('#weakMemoryStatus', `残り${seconds}秒です。`);
    }

    if (remaining > 0) return;
    stopMemoryTimer();
    rapid.memoryCompleted = true;
    setText('#weakMemoryStatus', '暗記タイム終了。苦手ボスを開始します。');
    startWeakBossPass(1);
  }

  function hideMemoryLayer() {
    document.querySelector('#weakMemoryLayer')?.classList.add('hidden');
  }

  function startWeakBossPass(pass) {
    stopMemoryTimer();
    hideMemoryLayer();
    syncModalAccess();
    rapid.active = true;
    rapid.weakBossPass = pass;
    if (pass === 1) {
      rapid.weakBossDeck = [...rapid.firstPassMistakeIds];
      rapid.weakBossTotal =
        rapid.weakBossDeck.length * WEAK_BOSS_PASSES;
      rapid.weakBossAnswered = 0;
      rapid.previousWeakBossDeck = [];
    }
    const deck = buildWeakBossPassDeck(
      rapid.weakBossDeck,
      rapid.previousWeakBossDeck
    );
    rapid.previousWeakBossDeck = [...deck];
    beginRapidPhase(
      'weak-boss',
      deck,
      Math.max(8_000, deck.length * 4_500)
    );
    setGameState(GAME_STATE.QUESTION_INTRO);
    showRunHud();
    showWeakBossVisual();
    updateWeakBossVisual();
    announce(`◇ WEAKNESS BOSS · ROUND ${pass}`);
    scheduleGameTask(
      nextRapidQuestion,
      save.settings.reducedMotion ? 80 : 650
    );
  }

  function buildWeakBossPassDeck(ids, previous = []) {
    const next = shuffleArray(
      [...new Set(ids)].filter(id =>
        senseList.some(sense => sense.senseId === id)
      )
    );
    if (
      next.length > 1 &&
      previous.length === next.length &&
      next.every((id, index) => id === previous[index])
    ) {
      next.push(next.shift());
    }
    return next;
  }

  function isWeakBossPhase() {
    return (
      rapid.active &&
      rapid.mode === 'coverage' &&
      rapid.phase === 'weak-boss'
    );
  }

  function finishRapidRun() {
    if (!rapid.active) return;
    rapid.active = false;
    rapid.finishedMode = rapid.mode;
    rapid.phase = 'done';
    const isCoverage = rapid.mode === 'coverage';
    const attempts = isCoverage
      ? rapid.coverageCorrect + rapid.coverageIncorrect
      : stageStats.attempts;
    const rate = attempts
      ? Math.round(
        (isCoverage ? rapid.coverageCorrect : stageStats.correct) /
          attempts *
          100
      )
      : 0;
    const mistakeIds = isCoverage
      ? rapid.firstPassMistakeIds
      : [...new Set(stageStats.mistakes)];
    const mistakes = mistakeIds
      .map(id => senseList.find(sense => sense.senseId === id))
      .filter(Boolean);
    const elapsed =
      rapid.sessionElapsedMs +
      (rapid.memoryCompleted ? RAPID_MEMORY_MS : 0);

    setGameState(GAME_STATE.STAGE_RESULT);
    speechSynthesisSafeCancel();
    save.totalScore += 500;
    saveProgress();
    hideRunHud();
    hideWeakBossVisual();
    prepareCustomResult(
      isCoverage
        ? '10分一斉学習＋苦手ボス'
        : '苦手一斉学習'
    );

    const coverageSummary = isCoverage
      ? `
        <div class="result-hero">
          <div class="grade">${mistakes.length ? `${rate}%` : 'PERFECT'}</div>
          <p>${
            mistakes.length
              ? '全範囲1周・1分暗記・苦手ボス2周を完了しました。'
              : '全範囲をノーミスで完了。苦手ボスは出現しませんでした。'
          }</p>
        </div>
        <div class="result-grid">
          <div class="result-card"><span>全範囲</span><strong>${rapid.coverageCorrect + rapid.coverageIncorrect}</strong></div>
          <div class="result-card"><span>1周目の正解</span><strong>${rapid.coverageCorrect}</strong></div>
          <div class="result-card"><span>苦手ボス語</span><strong>${mistakes.length}</strong></div>
          <div class="result-card"><span>ボス戦正解</span><strong>${rapid.weakBossCorrect} / ${rapid.weakBossTotal}</strong></div>
          <div class="result-card"><span>暗記時間</span><strong>${rapid.memoryCompleted ? '1:00' : '—'}</strong></div>
          <div class="result-card"><span>合計時間</span><strong>${formatRunTime(elapsed)}</strong></div>
        </div>
        <h3>◇ 今回の苦手ボス</h3>
        <div class="rapid-result-list weakness-result-list">
          ${
            mistakes.length
              ? mistakes
                .map(
                  sense =>
                    `${escapeHtml(sense.english)} [${escapeHtml(sense.pos)}] — ${escapeHtml(sense.shortMeaning)}`
                )
                .join('<br>')
              : '苦手ボスなし。見事な全範囲防衛です。'
          }
        </div>
      `
      : `
        <div class="result-hero">
          <div class="grade">${rate}%</div>
          <p>苦手単語の連続学習を1周完了しました。</p>
        </div>
        <div class="result-grid">
          <div class="result-card"><span>学習した英単語</span><strong>${rapid.totalAnswered}</strong></div>
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
      `;

    document.querySelector('#resultContent').innerHTML = `
      ${coverageSummary}
      ${
        rapid.skipped
          ? `<p class="weak-mini">安全な四択を作れずスキップ: ${rapid.skipped}件</p>`
          : ''
      }
    `;
    const next = document.querySelector('#nextStage');
    next.classList.remove('hidden');
    next.textContent = isCoverage
      ? '新しい一周を始める'
      : '苦手をもう一周する';
    document.querySelector('#resultHome').textContent = 'スタートへ';
    const completedCount = isCoverage
      ? rapid.coverageCorrect + rapid.coverageIncorrect
      : rapid.totalAnswered;
    setText('#mStage', '完了');
    setText('#hudSlot', `${completedCount} / ${completedCount}`);
    setText(
      '#hudBoss',
      isCoverage && mistakes.length ? `${WEAK_BOSS_PASSES} / ${WEAK_BOSS_PASSES}` : '—'
    );
    setText('#hudCoverage', isCoverage ? '苦手ボス 残り0' : '苦手 残り0');
    const stageFill = document.querySelector('#stageFill');
    if (stageFill) stageFill.style.width = '100%';
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
    rapid.phase = 'done';
    setGameState(GAME_STATE.STAGE_RESULT);
    prepareCustomResult('苦手一斉学習');
    document.querySelector('#resultContent').innerHTML = `
      <div class="result-hero">
        <div class="grade">READY</div>
        <p>苦手データはまだありません。</p>
      </div>
      <div class="detail-box">
        通常モードまたは10分・全範囲一斉学習で回答すると、
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
      isWeakBossPhase()
        ? `◇ 苦手BOSS ${rapid.weakBossPass}/${WEAK_BOSS_PASSES}`
        : rapid.mode === 'coverage'
          ? '全範囲一斉'
          : '苦手一斉'
    );
    setText('#rapidProgress', `${rapid.answered} / ${rapid.total}`);
    const remaining = Math.max(0, rapid.targetMs - getRapidElapsedMs());
    setText('#rapidClock', formatRunTime(remaining));
  }

  function showWeakBossVisual() {
    document.querySelector('#app')?.classList.add('weak-boss-mode');
    document.querySelector('#battleShell')?.classList.add('weak-boss-mode');
    document.querySelector('#weakBossBar')?.classList.remove('hidden');
    document.querySelector('#weakBossCore')?.classList.remove('hidden');
  }

  function hideWeakBossVisual() {
    document.querySelector('#app')?.classList.remove('weak-boss-mode');
    document.querySelector('#battleShell')?.classList.remove('weak-boss-mode');
    document.querySelector('#weakBossBar')?.classList.add('hidden');
    document.querySelector('#weakBossCore')?.classList.add('hidden');
  }

  function updateWeakBossVisual() {
    if (!isWeakBossPhase()) {
      hideWeakBossVisual();
      return;
    }
    showWeakBossVisual();
    const remaining = Math.max(
      0,
      rapid.weakBossTotal - rapid.weakBossAnswered
    );
    const percent = rapid.weakBossTotal
      ? remaining / rapid.weakBossTotal * 100
      : 0;
    setText('#weakBossHpText', `${remaining} / ${rapid.weakBossTotal}`);
    const meter = document.querySelector('#weakBossMeter');
    meter?.setAttribute('aria-valuemax', String(rapid.weakBossTotal));
    meter?.setAttribute('aria-valuenow', String(remaining));
    const fill = document.querySelector('#weakBossFill');
    if (fill) fill.style.width = `${percent}%`;
  }

  function pulseWeakBossCore(correct) {
    const core = document.querySelector('#weakBossCore');
    if (!core) return;
    core.classList.remove('core-hit', 'core-miss');
    void core.offsetWidth;
    core.classList.add(correct ? 'core-hit' : 'core-miss');
    setTimeout(() => {
      core.classList.remove('core-hit', 'core-miss');
    }, save.settings.reducedMotion ? 80 : 620);
  }

  function normalizePairSize(value) {
    const size = Number(value);
    return size === 3 || size === 4 ? size : 2;
  }

  function shouldFinishPairAfterDisconnect(connectedCount) {
    return Math.max(0, Number(connectedCount) || 0) < 2;
  }

  function createPairPlayer(id, seat, connected = true) {
    return {
      id,
      seat,
      label: `PLAYER ${seat}`,
      score: 0,
      correct: 0,
      connected,
      signature: ''
    };
  }

  function resetHostPairPlayers() {
    pair.players = new Map([
      ['p1', createPairPlayer('p1', 1, true)]
    ]);
    pair.selfPlayerId = 'p1';
    pair.answers = new Map();
  }

  function serializePairPlayers() {
    return [...pair.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map(player => ({
        id: player.id,
        seat: player.seat,
        label: `PLAYER ${player.seat}`,
        score: Math.max(0, Number(player.score) || 0),
        correct: Math.max(0, Number(player.correct) || 0),
        connected: player.connected !== false
      }));
  }

  function applyPairPlayers(rawPlayers) {
    if (!Array.isArray(rawPlayers)) return;
    const next = new Map();
    for (const raw of rawPlayers.slice(0, 4)) {
      const seat = Math.max(1, Math.min(4, Number(raw?.seat) || 1));
      const id = /^p[1-4]$/.test(String(raw?.id || ''))
        ? String(raw.id)
        : `p${seat}`;
      next.set(id, {
        id,
        seat,
        label: `PLAYER ${seat}`,
        score: Math.max(0, Math.min(10_000_000, Number(raw?.score) || 0)),
        correct: Math.max(0, Math.min(1_000, Number(raw?.correct) || 0)),
        connected: raw?.connected !== false,
        signature: ''
      });
    }
    if (next.size) pair.players = next;
  }

  function connectedPairPlayers() {
    return serializePairPlayers().filter(player => player.connected);
  }

  function nextPairPlayerId() {
    for (let seat = 2; seat <= pair.maxPlayers; seat++) {
      const id = `p${seat}`;
      if (!pair.players.has(id)) return id;
    }
    return '';
  }

  function canHostStartMatch() {
    return (
      pair.role === 'host' &&
      connectedPairPlayers().length === pair.maxPlayers &&
      pair.connections.size === pair.maxPlayers - 1 &&
      [...pair.connections.values()].every(connection => connection.open)
    );
  }

  function sendPairDirect(connection, message) {
    try {
      if (connection?.open) {
        connection.send(message);
        return true;
      }
    } catch (error) {
      console.warn('Online battle send failed', error);
    }
    return false;
  }

  function broadcastPair(message, exceptPlayerId = '') {
    let sent = 0;
    for (const [playerId, connection] of pair.connections) {
      if (playerId === exceptPlayerId) continue;
      if (sendPairDirect(connection, message)) sent++;
    }
    return sent;
  }

  function sendPairRoster() {
    const message = {
      type: 'roster',
      protocol: PAIR_PROTOCOL,
      maxPlayers: pair.maxPlayers,
      players: serializePairPlayers()
    };
    if (pair.role === 'host') broadcastPair(message);
    renderPairRoster();
    updatePairLobbyState();
    updatePairHud();
  }

  function renderPairRoster() {
    const roster = document.querySelector('#pairRoster');
    if (!roster) return;
    roster.dataset.players = String(pair.maxPlayers);
    const players = serializePairPlayers();
    if (!players.length) {
      roster.classList.add('hidden');
      roster.innerHTML = '';
      return;
    }
    roster.classList.remove('hidden');
    roster.innerHTML = `
      <div class="pair-roster-title">
        <strong>参加 ${players.filter(player => player.connected).length} / ${pair.maxPlayers}</strong>
        <span>${pair.maxPlayers}人対戦</span>
      </div>
      <div class="pair-roster-chips">
        ${Array.from({ length: pair.maxPlayers }, (_, index) => {
          const seat = index + 1;
          const player = players.find(item => item.seat === seat);
          const self = player?.id === pair.selfPlayerId;
          return `
            <span class="pair-roster-chip${player?.connected ? ' connected' : ''}${self ? ' self' : ''}">
              ${player ? `P${seat}${self ? '・自分' : ''}` : `P${seat}・待機中`}
            </span>
          `;
        }).join('')}
      </div>
    `;
  }

  function updatePairLobbyState() {
    const sizeSelect = document.querySelector('#pairPlayerCount');
    if (sizeSelect && !pair.peer) {
      pair.maxPlayers = normalizePairSize(sizeSelect.value);
    }
    if (sizeSelect) sizeSelect.disabled = Boolean(pair.peer);
    const start = document.querySelector('#pairStart');
    if (start) {
      start.textContent = `${pair.maxPlayers}人で対戦開始`;
      start.disabled = !canHostStartMatch();
      start.classList.toggle(
        'hidden',
        pair.role !== 'host' || !pair.peer
      );
    }
  }

  function renderPairScoreboard() {
    const board = document.querySelector('#pairScoreboard');
    if (!board) return;
    board.dataset.players = String(pair.maxPlayers);
    const players = serializePairPlayers();
    board.innerHTML = players
      .map(player => `
        <span class="pair-score-chip${player.id === pair.selfPlayerId ? ' self' : ''}${player.connected ? '' : ' offline'}">
          <small>${player.id === pair.selfPlayerId ? '自分' : `P${player.seat}`}</small>
          <strong>${player.score.toLocaleString()}</strong>
        </span>
      `)
      .join('');
  }

  function openPairLobby() {
    restoreStandardResultControls();
    if (!pair.peer) resetPairLobbyDisplay();
    renderPairRoster();
    updatePairLobbyState();
    openModal('#pairLayer');
  }

  async function createPairHost() {
    const token = ++pair.connectionToken;
    closePairTransport();
    pair.role = 'host';
    pair.maxPlayers = normalizePairSize(
      document.querySelector('#pairPlayerCount')?.value
    );
    pair.ready = false;
    pair.active = false;
    pair.finished = false;
    resetHostPairPlayers();
    updatePairLobbyState();
    renderPairRoster();
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
        `対戦コード ${code} を仲間に伝えてください。参加 1 / ${pair.maxPlayers}。`,
        'wait'
      );
      updatePairLobbyState();
      renderPairRoster();
    });

    peer.on('connection', connection => {
      const protocol = Number(connection.metadata?.protocol) || 0;
      if (
        protocol !== PAIR_PROTOCOL ||
        pair.active ||
        pair.connections.size >= pair.maxPlayers - 1
      ) {
        connection.on('open', () => {
          sendPairDirect(connection, {
            type: 'join-rejected',
            reason:
              protocol !== PAIR_PROTOCOL
                ? 'update-required'
                : pair.active
                  ? 'started'
                  : 'full'
          });
          setTimeout(() => connection.close(), 160);
        });
        return;
      }
      attachPairConnection(connection, 'host');
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
      setPairStatus('6文字の対戦コードを確認してください。', 'error');
      document.querySelector('#pairCodeInput')?.focus();
      return;
    }

    const token = ++pair.connectionToken;
    closePairTransport();
    pair.role = 'guest';
    pair.code = code;
    pair.ready = false;
    pair.active = false;
    pair.finished = false;
    pair.selfPlayerId = '';
    pair.players = new Map();
    pair.answers = new Map();
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
            label: 'word-frontline-battle-v4',
            serialization: 'json',
            reliable: true,
            metadata: {
              protocol: PAIR_PROTOCOL,
              signature: window.WordFrontlinePlus?.datasetSignature?.() || coverageListSignature()
            }
          }
        );
        attachPairConnection(connection, 'guest');
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

  function attachPairConnection(connection, side = pair.role) {
    if (side === 'guest') pair.connection = connection;
    let assignedPlayerId = '';

    connection.on('open', () => {
      pair.ready = true;
      document.querySelector('#pairDisconnect')?.classList.remove('hidden');

      if (side === 'host') {
        assignedPlayerId = nextPairPlayerId();
        if (!assignedPlayerId) {
          sendPairDirect(connection, {
            type: 'join-rejected',
            reason: 'full'
          });
          setTimeout(() => connection.close(), 160);
          return;
        }
        const seat = Number(assignedPlayerId.slice(1));
        pair.connections.set(assignedPlayerId, connection);
        const player = createPairPlayer(assignedPlayerId, seat, true);
        player.signature = String(connection.metadata?.signature || '');
        pair.players.set(assignedPlayerId, player);
        sendPairDirect(connection, {
          type: 'join-accepted',
          protocol: PAIR_PROTOCOL,
          playerId: assignedPlayerId,
          maxPlayers: pair.maxPlayers,
          players: serializePairPlayers()
        });
        sendPairRoster();
        const connected = connectedPairPlayers().length;
        setPairStatus(
          connected === pair.maxPlayers
            ? `${pair.maxPlayers}人そろいました。問題数を確認して対戦を開始してください。`
            : `参加 ${connected} / ${pair.maxPlayers}。あと${pair.maxPlayers - connected}人を待っています。`,
          connected === pair.maxPlayers ? 'ok' : 'wait'
        );
      } else {
        sendPairDirect(connection, {
          type: 'hello',
          protocol: PAIR_PROTOCOL,
          signature: window.WordFrontlinePlus?.datasetSignature?.() || coverageListSignature(),
          wordCount: getEnglishGroups().size
        });
        setPairStatus(
          'ホストと接続しました。参加枠を確認しています…',
          'wait'
        );
      }
    });

    connection.on('data', data => {
      handlePairMessage(
        data,
        side === 'host' ? assignedPlayerId : 'p1',
        connection
      );
    });

    connection.on('close', () => {
      handlePairConnectionClosed(
        side === 'host' ? assignedPlayerId : 'p1'
      );
    });

    connection.on('error', error => {
      setPairStatus(
        `対戦通信でエラーが発生しました。${error?.message || ''}`,
        'error'
      );
    });
  }

  function handlePairMessage(message, sourcePlayerId = '', connection = null) {
    if (!message || typeof message !== 'object') return;

    if (pair.role === 'host') {
      if (message.type === 'hello' && pair.players.has(sourcePlayerId)) {
        const player = pair.players.get(sourcePlayerId);
        player.signature = String(message.signature || '');
        pair.players.set(sourcePlayerId, player);
        if (player.signature !== (window.WordFrontlinePlus?.datasetSignature?.() || coverageListSignature())) {
          setPairStatus(
            '参加者の単語リストが異なるため、対戦中はホスト側の問題を使います。',
            'wait'
          );
        }
        return;
      }

      if (
        message.type === 'answer' &&
        pair.active &&
        Number(message.round) === pair.round &&
        pair.players.get(sourcePlayerId)?.connected &&
        !pair.answers.has(sourcePlayerId)
      ) {
        pair.answers.set(sourcePlayerId, normalizePairAnswer(message));
        maybeFinishPairRound();
        return;
      }

      if (message.type === 'sync-request' && connection) {
        sendPairDirect(connection, {
          type: 'state-sync',
          active: pair.active,
          finished: pair.finished,
          round: pair.round,
          rounds: pair.rounds,
          maxPlayers: pair.maxPlayers,
          players: serializePairPlayers(),
          question: pair.active ? pair.currentPayload : null
        });
        return;
      }

      if (message.type === 'leave' && connection) {
        connection.close();
      }
      return;
    }

    if (message.type === 'join-accepted') {
      if (Number(message.protocol) !== PAIR_PROTOCOL) {
        setPairStatus('ゲームを再読み込みしてから、もう一度参加してください。', 'error');
        return;
      }
      pair.selfPlayerId = /^p[2-4]$/.test(String(message.playerId || ''))
        ? String(message.playerId)
        : 'p2';
      pair.maxPlayers = normalizePairSize(message.maxPlayers);
      applyPairPlayers(message.players);
      pair.ready = true;
      renderPairRoster();
      updatePairLobbyState();
      setPairStatus(
        `参加しました（${pair.selfPlayerId.toUpperCase()}）。ホストの開始を待っています。`,
        'ok'
      );
      return;
    }

    if (message.type === 'join-rejected') {
      const reason = String(message.reason || '');
      pair.finished = true;
      setPairStatus(
        reason === 'full'
          ? 'この対戦は満員です。別のコードを確認してください。'
          : reason === 'started'
            ? 'この対戦はすでに始まっています。'
            : 'バージョンが異なります。全員がページを再読み込みしてください。',
        'error'
      );
      return;
    }

    if (message.type === 'roster') {
      pair.maxPlayers = normalizePairSize(message.maxPlayers);
      applyPairPlayers(message.players);
      renderPairRoster();
      updatePairHud();
      return;
    }

    if (message.type === 'match-start') {
      pair.maxPlayers = normalizePairSize(message.maxPlayers);
      applyPairPlayers(message.players);
      launchPairMatch(
        Math.max(5, Math.min(50, Number(message.rounds) || PAIR_DEFAULT_ROUNDS)),
        message.players
      );
      return;
    }

    if (
      message.type === 'question' &&
      pair.active
    ) {
      receivePairQuestion(message);
      return;
    }

    if (
      message.type === 'round-result' &&
      Number(message.round) === pair.round
    ) {
      applyPairPlayers(message.players);
      setGameState(GAME_STATE.QUESTION_INTRO);
      updatePairHud();
      const ownResult = message.results?.[pair.selfPlayerId];
      announce(ownResult?.correct ? 'YOU ✓ · NEXT ROUND' : 'YOU × · NEXT ROUND');
      return;
    }

    if (message.type === 'match-end') {
      applyPairPlayers(message.players);
      finishPairMatch();
      return;
    }

    if (message.type === 'state-sync') {
      pair.maxPlayers = normalizePairSize(message.maxPlayers);
      pair.rounds = Math.max(5, Math.min(50, Number(message.rounds) || pair.rounds));
      applyPairPlayers(message.players);
      updatePairHud();
      if (
        message.active &&
        message.question &&
        Number(message.question.round) > pair.round
      ) {
        receivePairQuestion(message.question);
      }
      return;
    }

    if (message.type === 'room-closed' || message.type === 'leave') {
      setPairStatus('ホストが対戦を終了しました。', 'error');
      handlePairConnectionClosed('p1');
    }
  }

  function hostStartPairMatch() {
    if (!canHostStartMatch()) {
      setPairStatus(
        `${pair.maxPlayers}人全員が接続するまで待ってください。`,
        'error'
      );
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
    for (const player of pair.players.values()) {
      player.score = 0;
      player.correct = 0;
    }
    const players = serializePairPlayers();
    broadcastPair({
      type: 'match-start',
      protocol: PAIR_PROTOCOL,
      rounds,
      maxPlayers: pair.maxPlayers,
      players
    });
    launchPairMatch(rounds, players);
  }

  function launchPairMatch(rounds, players = null) {
    clearGameTasks();
    speechSynthesisSafeCancel();
    restorePauseLayer();
    clearTimeout(pair.waitTimer);
    pair.active = true;
    pair.finished = false;
    pair.rounds = rounds;
    pair.round = 0;
    if (players) applyPairPlayers(players);
    pair.answers = new Map();
    pair.localAnswer = null;
    pair.currentPayload = null;
    pair.finalizedRound = 0;

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
    announce(`${pair.maxPlayers}-PLAYER BATTLE READY`);

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
    pair.answers = new Map();
    pair.localChoiceIndex = -1;
    pair.localReactionMs = PAIR_TIME_LIMIT * 1000;
    pair.currentCorrectIndex = choices.findIndex(choice => choice.isCorrect);
    pair.currentTimeLimit = PAIR_TIME_LIMIT;
    pair.finalizedRound = 0;
    pair.roundStartedAt = performance.now();
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
    broadcastPair(payload);
    presentQuestion(target, choices, false);
    clearTimeout(pair.waitTimer);
    pair.waitTimer = setTimeout(
      finalizePairRound,
      PAIR_TIME_LIMIT * 1000 + RAPID_FEEDBACK_MS + 1_800
    );
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
      pair.answers.set(pair.selfPlayerId, pair.localAnswer);
      maybeFinishPairRound();
    } else {
      sendPairDirect(pair.connection, {
        type: 'answer',
        ...pair.localAnswer
      });
      announce('ANSWER SENT · WAITING');
    }
  }

  function maybeFinishPairRound() {
    if (
      !pair.active ||
      pair.role !== 'host' ||
      !pair.answers.has(pair.selfPlayerId)
    ) {
      return;
    }

    const requiredIds = connectedPairPlayers().map(player => player.id);
    if (requiredIds.every(id => pair.answers.has(id))) {
      finalizePairRound();
    } else {
      announce(`WAITING ${pair.answers.size}/${requiredIds.length}`);
    }
  }

  function finalizePairRound() {
    if (!pair.active || pair.role !== 'host') return;
    if (pair.finalizedRound === pair.round) return;
    pair.finalizedRound = pair.round;
    clearTimeout(pair.waitTimer);
    const results = {};
    for (const player of pair.players.values()) {
      const answer =
        pair.answers.get(player.id) || {
          round: pair.round,
          choiceIndex: -1,
          reactionMs: pair.currentTimeLimit * 1000
        };
      const result = scorePairAnswer(
        answer,
        pair.currentCorrectIndex,
        pair.currentTimeLimit
      );
      player.score += result.points;
      if (result.correct) player.correct++;
      results[player.id] = result;
    }

    const players = serializePairPlayers();
    broadcastPair({
      type: 'round-result',
      round: pair.round,
      players,
      results
    });
    updatePairHud();
    setGameState(GAME_STATE.QUESTION_INTRO);
    const own = results[pair.selfPlayerId];
    const correctCount = Object.values(results)
      .filter(result => result.correct)
      .length;
    announce(
      `${own?.correct ? 'YOU ✓' : 'YOU ×'} · ${correctCount}/${players.length} CORRECT`
    );

    if (pair.round >= pair.rounds) {
      scheduleGameTask(hostFinishPairMatch, 850);
    } else {
      scheduleGameTask(hostNextPairQuestion, 850);
    }
  }

  function hostFinishPairMatch() {
    if (pair.role !== 'host') return;
    broadcastPair({
      type: 'match-end',
      players: serializePairPlayers()
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
    prepareCustomResult(`オンライン${pair.maxPlayers}人対戦結果`);

    const ranking = serializePairPlayers()
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.correct - a.correct ||
          a.seat - b.seat
      );
    const selfIndex = Math.max(
      0,
      ranking.findIndex(player => player.id === pair.selfPlayerId)
    );
    const topScore = ranking[0]?.score || 0;
    const topTies = ranking.filter(player => player.score === topScore).length;
    const outcome =
      selfIndex === 0
        ? topTies > 1
          ? 'TOP TIE'
          : 'YOU WIN'
        : `RANK ${selfIndex + 1}`;
    document.querySelector('#resultContent').innerHTML = `
      <div class="result-hero">
        <div class="grade">${outcome}</div>
        <p>${pair.rounds}問・${pair.maxPlayers}人対戦が完了しました。</p>
      </div>
      <div class="pair-ranking">
        ${ranking.map((player, index) => `
          <div class="pair-rank-card${player.id === pair.selfPlayerId ? ' self' : ''}">
            <span class="pair-rank-number">${index + 1}</span>
            <div>
              <strong>${player.id === pair.selfPlayerId ? '自分' : `PLAYER ${player.seat}`}</strong>
              <small>${player.correct} / ${pair.rounds} 正解${player.connected ? '' : ' · 接続終了'}</small>
            </div>
            <b>${player.score.toLocaleString()}</b>
          </div>
        `).join('')}
      </div>
      <p class="learning-data-note">
        自分が間違えた単語は、この端末の苦手データにも追加されました。
      </p>
    `;
    const next = document.querySelector('#nextStage');
    if (pair.role === 'host' && canHostStartMatch()) {
      next.classList.remove('hidden');
      next.textContent = '同じメンバーで再戦';
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
    return pair.role === 'host'
      ? broadcastPair(message) > 0
      : sendPairDirect(pair.connection, message);
  }

  function handlePairConnectionClosed(playerId = '') {
    if (pair.closing) return;
    pair.ready = false;

    if (pair.role === 'host' && playerId && playerId !== 'p1') {
      pair.connections.delete(playerId);
      const player = pair.players.get(playerId);
      if (player) {
        if (pair.active || pair.finished) player.connected = false;
        else pair.players.delete(playerId);
      }
      sendPairRoster();
      if (pair.active) {
        announce(`P${String(playerId).slice(1)} CONNECTION LOST`);
        if (shouldFinishPairAfterDisconnect(connectedPairPlayers().length)) {
          scheduleGameTask(hostFinishPairMatch, 350);
        } else {
          maybeFinishPairRound();
        }
      } else if (!pair.finished) {
        const connected = connectedPairPlayers().length;
        setPairStatus(
          `参加者が退出しました。参加 ${connected} / ${pair.maxPlayers}。`,
          'wait'
        );
      }
      return;
    }

    if (pair.active) {
      clearGameTasks();
      pauseGame('user');
      const title = document.querySelector('#pauseTitle');
      if (title) title.textContent = 'HOST CONNECTION LOST';
      const text = document.querySelector('#pauseLayer p');
      if (text) {
        text.textContent =
          'ホストとの接続が切れました。「スタートへ戻る」から通常学習を続けられます。';
      }
      document.querySelector('#resumeButton')?.classList.add('hidden');
      document.querySelector('#pauseSettings')?.classList.add('hidden');
    } else if (!pair.finished) {
      setPairStatus(
        'ホストとの接続が切れました。コードを確認して、もう一度参加してください。',
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
        ? 'その対戦コードのホストが見つかりません。コードを確認してください。'
        : type === 'browser-incompatible'
          ? 'このブラウザーはオンライン対戦に対応していません。Chrome・Edge・Safariの最新版を使ってください。'
          : 'オンライン接続に失敗しました。学校の通信設定を確認するか、通常モードを利用してください。';
    setPairStatus(message, 'error');
    console.warn('Pair peer error', type, error);
  }

  function leavePair(showStatus) {
    if (pair.role === 'host') {
      broadcastPair({ type: 'room-closed' });
    } else {
      sendPairDirect(pair.connection, { type: 'leave' });
    }
    clearGameTasks();
    clearTimeout(pair.waitTimer);
    pair.active = false;
    pair.finished = false;
    pair.ready = false;
    closePairTransport();
    pair.players = new Map();
    pair.answers = new Map();
    pair.selfPlayerId = '';
    hidePairHud();
    if (showStatus) {
      resetPairLobbyDisplay();
      setPairStatus('オンライン対戦の接続を終了しました。', '');
    }
  }

  function closePairTransport() {
    pair.closing = true;
    for (const connection of pair.connections.values()) {
      try {
        connection.close();
      } catch {}
    }
    pair.connections.clear();
    try { pair.connection?.close(); } catch {}
    try { pair.peer?.destroy(); } catch {}
    pair.connection = null;
    pair.peer = null;
    pair.closing = false;
  }

  function closePairLobby() {
    if (pair.peer || pair.connection || pair.connections.size) leavePair(false);
    closeLayer('#pairLayer');
    resetPairLobbyDisplay();
  }

  function resetPairLobbyDisplay() {
    document.querySelector('#pairHostCodeArea')?.classList.add('hidden');
    document.querySelector('#pairStart')?.classList.add('hidden');
    document.querySelector('#pairDisconnect')?.classList.add('hidden');
    const start = document.querySelector('#pairStart');
    if (start) start.disabled = true;
    const size = document.querySelector('#pairPlayerCount');
    if (size) size.disabled = false;
    setText('#pairCode', '------');
    const input = document.querySelector('#pairCodeInput');
    if (input) input.value = '';
    setPairStatus(
      '「対戦コードを作る」か、ホストから聞いたコードを入力してください。',
      ''
    );
    pair.players = new Map();
    pair.answers = new Map();
    pair.selfPlayerId = '';
    renderPairRoster();
    updatePairLobbyState();
  }

  function setPairStatus(message, type = '') {
    const status = document.querySelector('#pairStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `pair-status${type ? ` ${type}` : ''}`;
  }

  function showPairHud() {
    document.querySelector('#battleShell')?.classList.add('pair-layout');
    document.querySelector('#pairHud')?.classList.remove('hidden');
    updatePairHud();
  }

  function hidePairHud() {
    document.querySelector('#battleShell')?.classList.remove('pair-layout');
    document.querySelector('#pairHud')?.classList.add('hidden');
  }

  function updatePairHud() {
    if (!pair.active) return;
    renderPairScoreboard();
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
        `対戦コード ${pair.code} をコピーしました。仲間に伝えてください。`,
        'ok'
      );
    } catch {
      setPairStatus(
        `対戦コードは ${pair.code} です。仲間に伝えてください。`,
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
      '対戦コードは紛らわしい文字なしの6文字',
      () => isValidPairCode(generatePairCode())
    );
    test(
      '対戦得点は正解だけ加点',
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
      '全範囲は10分目標',
      () => RAPID_TARGET_MS === 600_000
    );
    test(
      '暗記時間は1分',
      () => RAPID_MEMORY_MS === 60_000
    );
    test(
      '苦手ボスは必ず2周',
      () => WEAK_BOSS_PASSES === 2
    );
    test(
      'オンライン対戦は2人・3人・4人だけ',
      () =>
        normalizePairSize(2) === 2 &&
        normalizePairSize(3) === 3 &&
        normalizePairSize(4) === 4 &&
        normalizePairSize(5) === 2
    );
    test(
      '対戦は2人以上なら切断後も続行',
      () =>
        shouldFinishPairAfterDisconnect(1) === true &&
        shouldFinishPairAfterDisconnect(2) === false &&
        shouldFinishPairAfterDisconnect(3) === false
    );
    test(
      '苦手ボスデッキは対象集合を増減しない',
      () => {
        const source = sampleDeck.slice(0, Math.min(5, sampleDeck.length));
        const review = buildWeakBossPassDeck(source);
        return (
          review.length === source.length &&
          review.every(id => source.includes(id))
        );
      }
    );
    test(
      '通常モードの既存制御を保持',
      () =>
        typeof original.startStage === 'function' &&
        typeof original.resolveCorrectAnswer === 'function'
    );

    const passed = tests.filter(result => result.ok).length;
    const testSummary = {
      passed,
      total: tests.length,
      tests
    };
    window.__WORD_FRONTLINE_V2_TESTS__ = testSummary;
    window.__WORD_FRONTLINE_V3_TESTS__ = testSummary;
    console.group(
      `WORD FRONTLINE v3 self tests: ${passed}/${tests.length}`
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
