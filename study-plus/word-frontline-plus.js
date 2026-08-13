/* WORD FRONTLINE Study Plus: test ranges, independent saves, and study-day streaks. */
'use strict';

(() => {
  const PLUS_VERSION = '4.1.0';
  const data = window.WordFrontlineData;
  const streak = window.WordFrontlineStreak;
  // Each preset stays active through its test's final day. The next preset
  // becomes the automatic default on the following local calendar day.
  const AUTO_RANGE_WINDOWS = Object.freeze([
    { through: 512, id: 'exam-1' },
    { through: 623, id: 'exam-2' },
    { through: 902, id: 'exam-3' },
    { through: 929, id: 'exam-4' },
    { through: 1027, id: 'exam-5' },
    { through: 1117, id: 'exam-6' },
    { through: 1215, id: 'exam-7' },
    { through: 1313, id: 'exam-8' },
    { through: 1409, id: 'exam-9' },
    { through: 1531, id: 'all' }
  ]);

  if (!data?.words?.length || !data?.ranges?.length) {
    console.error('Study Plus vocabulary could not be loaded.');
    return;
  }

  const original = {
    initializeWords,
    updateWordStats,
    renderModeGrid,
    showScreen,
    resetProgress,
    runSelfTests
  };

  let logoTapCount = 0;
  let logoTapTimer = 0;
  let secretKeyBuffer = '';

  injectInterface();
  installOverrides();

  document.addEventListener('DOMContentLoaded', initializePlus);

  function automaticRangeForDate(date = new Date()) {
    const month = date.getMonth() + 1;
    const academicMonthDay = (month < 4 ? month + 12 : month) * 100 + date.getDate();
    const rangeWindow = AUTO_RANGE_WINDOWS.find(candidate => academicMonthDay <= candidate.through);
    const rangeId = rangeWindow?.id || 'exam-1';
    return data.ranges.find(range => range.id === rangeId)
      || data.ranges.find(range => range.id === 'exam-1')
      || data.ranges[0];
  }

  function defaultRange(date = new Date()) {
    return automaticRangeForDate(date);
  }

  function selectedRange() {
    return data.ranges.find(range => range.id === save?.selectedRangeId) || defaultRange();
  }

  function isOfficialSource() {
    return save?.activeWordSource !== 'custom' || !save?.importedWords;
  }

  function wordsForRange(range = selectedRange()) {
    return data.words.filter(word =>
      word.lesson >= range.lessonStart && word.lesson <= range.lessonEnd
    );
  }

  function toGameRow(word) {
    return {
      english: word.english,
      pos: word.pos,
      shortMeaning: makeShortMeaning(word.meaning),
      fullMeaning: `Lesson ${word.lesson}｜${word.meaning}`,
      contextCue: ''
    };
  }

  function buildEditorTSV() {
    const range = selectedRange();
    const lines = ['english\tfullMeaning\tpos\tshortMeaning\tcontextCue'];
    for (const word of wordsForRange(range)) {
      lines.push([
        word.english,
        `Lesson ${word.lesson}｜${word.meaning}`,
        word.pos,
        makeShortMeaning(word.meaning),
        ''
      ].map(cell => String(cell).replace(/[\t\r\n]+/g, ' ')).join('\t'));
    }
    return lines.join('\n');
  }

  function installOverrides() {
    initializeWords = function initializeStudyPlusWords() {
      const hasValidRange = data.ranges.some(range => range.id === save.selectedRangeId);
      // Pre-4.1 saves did not record intent. Preserve a non-default choice as
      // manual, but treat the historical exam-1 default as automatic.
      const legacyManualRange = !save.rangeSelectionMode
        && hasValidRange
        && save.selectedRangeId !== 'exam-1';
      const keepManualRange = (save.rangeSelectionMode === 'manual' || legacyManualRange) && hasValidRange;
      save.selectedRangeId = keepManualRange ? save.selectedRangeId : defaultRange().id;
      save.rangeSelectionMode = keepManualRange ? 'manual' : 'auto';
      save.activeWordSource = save.activeWordSource === 'custom' && save.importedWords
        ? 'custom'
        : 'official';

      if (!isOfficialSource()) {
        const rememberedProgress = { ...(save.progress || {}) };
        original.initializeWords();
        save.progress = { ...rememberedProgress, ...(save.progress || {}) };
        saveProgress();
        renderRangeSummary();
        return;
      }

      const activeRows = wordsForRange().map(toGameRow);
      wordData = normalizeWordData(activeRows);
      senseList = buildSenseList(wordData);

      if (senseList.length < 4) {
        console.warn('Selected range was too small. Falling back to the original built-in list.');
        original.initializeWords();
        renderRangeSummary();
        return;
      }

      if (!save.progress || typeof save.progress !== 'object') save.progress = {};
      for (const sense of senseList) {
        if (!save.progress[sense.senseId]) save.progress[sense.senseId] = defaultStats();
      }

      const valid = new Set(senseList.map(sense => sense.senseId));
      const signature = coverageListSignature();
      if (save.coverageSignature !== signature) {
        save.coverageQueue = [];
        save.coverageCycle = 0;
        save.coverageSignature = signature;
        save.coverageActiveSenseId = '';
      } else {
        save.coverageQueue = [...new Set((save.coverageQueue || []).filter(id => valid.has(id)))];
        if (!valid.has(save.coverageActiveSenseId) || !save.coverageQueue.includes(save.coverageActiveSenseId)) {
          save.coverageActiveSenseId = '';
        }
      }

      saveProgress();
      renderWeakMini();
      renderRangeSummary();
    };

    updateWordStats = function updateWordStatsStudyPlus(sense, correct, reaction) {
      const result = original.updateWordStats(sense, correct, reaction);
      streak?.record({ correct: Boolean(correct) });
      renderStreak();
      return result;
    };

    renderModeGrid = function renderModeGridStudyPlus() {
      original.renderModeGrid();
      const range = selectedRange();
      const coverage = document.querySelector('.mode-card[data-mode="coverage"] small');
      if (coverage && isOfficialSource()) {
        coverage.textContent = `${range.label}（Lesson ${range.lessonStart}–${range.lessonEnd}・${range.wordCount}語）を約10分で学習し、ミスを1分暗記→苦手ボス2周で復習。`;
      }
      renderRangeSummary();
    };

    showScreen = function showScreenStudyPlus(which) {
      original.showScreen(which);
      if (which === 'start' || which === 'modes') {
        renderRangeSummary();
        renderStreak();
      }
    };

    resetProgress = function resetProgressStudyPlus(keepWords = true) {
      const rangeId = save?.selectedRangeId || defaultRange().id;
      const rangeSelectionMode = save?.rangeSelectionMode === 'manual' ? 'manual' : 'auto';
      const source = keepWords && save?.importedWords ? save.activeWordSource : 'official';
      original.resetProgress(keepWords);
      save.selectedRangeId = rangeId;
      save.rangeSelectionMode = rangeSelectionMode;
      save.activeWordSource = source;
      saveProgress();
      initializeWords();
      if (document.querySelector('#resetStreak')?.checked) streak?.clear();
      renderStreak();
    };

    runSelfTests = function runSelfTestsStudyPlus() {
      const tests = [];
      const test = (name, condition) => tests.push({ name, ok: Boolean(condition) });
      const range = selectedRange();
      const expected = wordsForRange(range).length;
      test('Excel-derived vocabulary has 1,450 rows', data.words.length === 1450);
      test('Lessons 1 through 68 are present', new Set(data.words.map(word => word.lesson)).size === 68);
      test('Selected range count matches active senses', !isOfficialSource() || senseList.length === expected);
      test('Selected range has safe four-choice capacity', senseList.length >= 4);
      test('Study Plus uses an independent vocabulary source', data.version === '2026.08.13-1450');
      test('Mid-August automatically selects exam 3', automaticRangeForDate(new Date(2026, 7, 13)).id === 'exam-3');
      test('Winter and January range boundaries are correct',
        automaticRangeForDate(new Date(2026, 11, 16)).id === 'exam-8'
        && automaticRangeForDate(new Date(2027, 0, 13)).id === 'exam-8'
        && automaticRangeForDate(new Date(2027, 0, 14)).id === 'exam-9'
        && automaticRangeForDate(new Date(2027, 1, 10)).id === 'all');
      test('Summer range starts after exam 2',
        automaticRangeForDate(new Date(2026, 5, 23)).id === 'exam-2'
        && automaticRangeForDate(new Date(2026, 5, 24)).id === 'exam-3');
      for (const result of streak?.runSelfTests?.() || []) tests.push(result);
      const passed = tests.filter(testCase => testCase.ok).length;
      console.group(`WORD FRONTLINE Study Plus tests: ${passed}/${tests.length}`);
      for (const testCase of tests) {
        (testCase.ok ? console.log : console.warn)(`${testCase.ok ? 'PASS' : 'FAIL'}: ${testCase.name}`);
      }
      console.groupEnd();
      return tests;
    };
  }

  function injectInterface() {
    const tagline = document.querySelector('#startScreen .tagline');
    if (tagline && !document.querySelector('#plusDashboard')) {
      tagline.insertAdjacentHTML('afterend', `
        <div id="plusDashboard" class="plus-dashboard">
          <button id="rangeSummaryButton" class="plus-panel range-summary" type="button">
            <span class="plus-kicker">今回のテスト範囲</span>
            <strong id="selectedRangeName">読み込み中…</strong>
            <small id="selectedRangeMeta">Lessonを確認中</small>
            <em>範囲を変更 →</em>
          </button>
          <div id="studyStreakCard" class="plus-panel streak-card" aria-live="polite">
            <span class="plus-kicker">学習継続</span>
            <strong><b id="studyStreakDays">0</b><span>日</span></strong>
            <small id="studyStreakMeta">今日はまだ未学習</small>
            <p id="studyStreakCheer" class="hidden">先生や保護者の方に自慢しよう！</p>
          </div>
        </div>
      `);
    }

    const modeTitle = document.querySelector('#modeScreen h1');
    if (modeTitle && !document.querySelector('#modeRangeStrip')) {
      modeTitle.insertAdjacentHTML('afterend', `
        <button id="modeRangeStrip" class="mode-range-strip" type="button">
          <span>選択中</span><strong id="modeRangeName">読み込み中…</strong><small>変更</small>
        </button>
      `);
    }

    if (!document.querySelector('#rangeLayer')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="rangeLayer" class="modal-layer hidden" role="dialog" aria-modal="true" aria-labelledby="rangeTitle">
          <div class="modal wide range-modal">
            <div class="range-head">
              <div>
                <p class="plus-kicker">TEST RANGE SELECT</p>
                <h2 id="rangeTitle">テスト範囲を選ぶ</h2>
              </div>
              <button id="rangeCloseTop" class="icon-close" type="button" aria-label="閉じる">×</button>
            </div>
            <p class="range-lead">最初は端末の日付から次のテスト範囲を自動選択します。手動で変えても、他の範囲で蓄積した苦手データは残ります。</p>
            <div id="rangeGrid" class="range-grid"></div>
            <p class="range-note">※ 「全範囲」1,450語は10分では終わらないため、通常は第1〜9回のカードをおすすめします。</p>
            <div class="modal-actions">
              <button id="rangeAuto" class="ghost-btn" type="button">今日の日付に合わせる</button>
              <button id="rangeClose" class="ghost-btn" type="button">閉じる</button>
            </div>
          </div>
        </div>
        <div id="plusToast" class="plus-toast hidden" role="status" aria-live="polite"></div>
      `);
    }

    const resetActions = document.querySelector('#resetLayer .modal-actions');
    if (resetActions && !document.querySelector('#resetStreak')) {
      resetActions.insertAdjacentHTML('beforebegin', `
        <label class="toggle plus-reset-option">
          <input id="resetStreak" type="checkbox"> 学習継続日数もリセットする
        </label>
      `);
    }

    const badge = document.querySelector('#startScreen .boss-variant-badge');
    if (badge) badge.textContent = 'STUDY PLUS · 1,450 WORDS';
    if (tagline) tagline.textContent = 'テスト範囲を選び、一周学習→1分暗記→苦手ボス2周へ。学習継続日数もこの端末に記録します。';
  }

  function initializePlus() {
    renderRangeList();
    renderRangeSummary();
    renderStreak();
    wirePlusEvents();
    streak?.subscribe(renderStreak);
    document.documentElement.dataset.studyPlusVersion = PLUS_VERSION;
  }

  function wirePlusEvents() {
    document.querySelector('#rangeSummaryButton')?.addEventListener('click', openRangeLayer);
    document.querySelector('#modeRangeStrip')?.addEventListener('click', openRangeLayer);
    document.querySelector('#rangeClose')?.addEventListener('click', closeRangeLayer);
    document.querySelector('#rangeCloseTop')?.addEventListener('click', closeRangeLayer);
    document.querySelector('#rangeAuto')?.addEventListener('click', useAutomaticRange);
    document.querySelector('#rangeLayer')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) closeRangeLayer();
    });
    document.querySelector('#rangeGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-range-id]');
      if (button) selectRange(button.dataset.rangeId);
    });

    const logo = document.querySelector('#startScreen .logo');
    if (logo) {
      logo.tabIndex = 0;
      logo.setAttribute('role', 'button');
      logo.setAttribute('aria-label', 'WORD FRONTLINE');
      logo.addEventListener('click', handleSecretLogoTap);
      logo.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSecretLogoTap();
        }
      });
    }

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.querySelector('#rangeLayer')?.classList.contains('hidden')) {
        closeRangeLayer();
        return;
      }
      const tag = event.target?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
      if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
        secretKeyBuffer = `${secretKeyBuffer}${event.key.toLowerCase()}`.slice(-6);
        if (secretKeyBuffer === 'listen') openListeningLab();
      }
    });
  }

  function renderRangeList() {
    const grid = document.querySelector('#rangeGrid');
    if (!grid) return;
    grid.textContent = '';
    for (const range of data.ranges) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `range-card${range.id === 'all' ? ' all-range' : ''}`;
      button.dataset.rangeId = range.id;

      const heading = document.createElement('span');
      heading.className = 'range-card-heading';
      const name = document.createElement('strong');
      name.textContent = range.label;
      const date = document.createElement('em');
      date.textContent = range.date;
      heading.append(name, date);

      const lessons = document.createElement('b');
      lessons.textContent = `Lesson ${range.lessonStart}–${range.lessonEnd}`;
      const topics = document.createElement('span');
      topics.className = 'range-topics';
      topics.textContent = range.topics.join(' ／ ');
      const footer = document.createElement('span');
      footer.className = 'range-card-footer';
      footer.innerHTML = `<span>${range.wordCount.toLocaleString()}語</span><span>一周目安 ${estimatedMinutes(range.wordCount)}</span>`;
      button.append(heading, lessons, topics, footer);
      grid.appendChild(button);
    }
    syncSelectedRangeCard();
  }

  function estimatedMinutes(count) {
    const minutes = Math.max(2, Math.ceil(Number(count || 0) * 2.55 / 60));
    return `約${minutes}分`;
  }

  function renderRangeSummary() {
    if (!save) return;
    const range = selectedRange();
    const custom = !isOfficialSource();
    setTextSafe('#selectedRangeName', custom ? 'カスタム単語リスト' : range.label);
    setTextSafe(
      '#selectedRangeMeta',
      custom
        ? `${senseList.length}語・この端末のみ`
        : `Lesson ${range.lessonStart}–${range.lessonEnd} · ${range.wordCount.toLocaleString()}語 · ${estimatedMinutes(range.wordCount)}${save.rangeSelectionMode === 'auto' ? ' · 日付から自動' : ''}`
    );
    setTextSafe(
      '#modeRangeName',
      custom ? `カスタム ${senseList.length}語` : `${range.label} · Lesson ${range.lessonStart}–${range.lessonEnd} · ${range.wordCount}語`
    );
    syncSelectedRangeCard();
  }

  function syncSelectedRangeCard() {
    const activeId = selectedRange().id;
    for (const card of document.querySelectorAll('[data-range-id]')) {
      const active = isOfficialSource() && card.dataset.rangeId === activeId;
      card.classList.toggle('selected', active);
      card.setAttribute('aria-pressed', String(active));
    }
  }

  function selectRange(rangeId, selectionMode = 'manual') {
    const next = data.ranges.find(range => range.id === rangeId);
    if (!next || !save) return;
    save.selectedRangeId = next.id;
    save.rangeSelectionMode = selectionMode === 'auto' ? 'auto' : 'manual';
    save.activeWordSource = 'official';
    save.coverageQueue = [];
    save.coverageActiveSenseId = '';
    save.coverageSignature = '';
    saveProgress();
    initializeWords();
    renderModeGrid();
    renderRangeList();
    closeRangeLayer();
    const prefix = save.rangeSelectionMode === 'auto' ? '今日の日付に合わせて' : '';
    showToast(`${prefix}${next.label}（Lesson ${next.lessonStart}–${next.lessonEnd}）に切り替えました。`);
  }

  function useAutomaticRange() {
    selectRange(defaultRange().id, 'auto');
  }

  function openRangeLayer() {
    renderRangeList();
    openModal('#rangeLayer');
  }

  function closeRangeLayer() {
    closeLayer('#rangeLayer');
  }

  function renderStreak() {
    const state = streak?.status() || { currentStreakDays: 0, longestStreakDays: 0, today: { attempts: 0 } };
    setTextSafe('#studyStreakDays', state.currentStreakDays);
    const meta = state.today?.attempts > 0
      ? `今日 ${state.today.attempts}問学習 · 最長${state.longestStreakDays}日`
      : state.currentStreakDays > 0
        ? `今日も1問答えて継続 · 最長${state.longestStreakDays}日`
        : '今日1問で、継続1日目スタート';
    setTextSafe('#studyStreakMeta', meta);
    document.querySelector('#studyStreakCheer')?.classList.toggle('hidden', state.currentStreakDays <= 21);
  }

  function handleSecretLogoTap() {
    logoTapCount += 1;
    clearTimeout(logoTapTimer);
    logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 2600);
    if (logoTapCount < 5) return;
    logoTapCount = 0;
    openListeningLab();
  }

  function openListeningLab() {
    speechSynthesisSafeCancel?.();
    location.href = 'listening.html';
  }

  function showToast(message) {
    const toast = document.querySelector('#plusToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  function setTextSafe(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  }

  function datasetSignature() {
    return `study-plus:${data.version}:${data.words.length}`;
  }

  window.WordFrontlinePlus = Object.freeze({
    version: PLUS_VERSION,
    dataVersion: data.version,
    buildEditorTSV,
    selectedRange: () => ({ ...selectedRange() }),
    automaticRangeForDate: date => ({ ...automaticRangeForDate(date) }),
    wordsForSelectedRange: () => [...wordsForRange()],
    datasetSignature
  });
})();
