/* Controller for the offline, Web Speech API based Listening Lab. */
'use strict';

(() => {
  const content = window.WORD_FRONTLINE_LISTENING_DATA;
  const synth = window.speechSynthesis || null;
  const letterLabels = ['A', 'B', 'C', 'D'];
  const spokenNumbers = ['one', 'two', 'three', 'four'];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const state = {
    set: null,
    index: 0,
    score: 0,
    answers: [],
    played: 0,
    answered: false,
    isSpeaking: false,
    isPreparing: false,
    previewRemaining: 0,
    previewTimer: 0,
    speechToken: 0,
    streakRecorded: false
  };

  let englishVoices = [];
  let unsubscribeStreak = () => {};

  const $ = id => document.getElementById(id);
  const el = {
    selectScreen: $('selectScreen'),
    questionScreen: $('questionScreen'),
    resultScreen: $('resultScreen'),
    modeGrid: $('modeGrid'),
    streakDays: $('streakDays'),
    exitBtn: $('exitBtn'),
    modeName: $('modeName'),
    progressText: $('progressText'),
    progressFill: $('progressFill'),
    progressBar: document.querySelector('.progress-track'),
    scoreText: $('scoreText'),
    partLabel: $('partLabel'),
    levelLabel: $('levelLabel'),
    skillLabel: $('skillLabel'),
    sceneText: $('sceneText'),
    questionTitle: $('questionTitle'),
    wave: $('wave'),
    playBtn: $('playBtn'),
    playButtonLabel: $('playButtonLabel'),
    playCountText: $('playCountText'),
    rateControl: $('rateControl'),
    rateValue: $('rateValue'),
    audioStatus: $('audioStatus'),
    responseHint: $('responseHint'),
    optionList: $('optionList'),
    feedbackPanel: $('feedbackPanel'),
    feedbackMark: $('feedbackMark'),
    feedbackTitle: $('feedbackTitle'),
    feedbackExplanation: $('feedbackExplanation'),
    transcriptPanel: $('transcriptPanel'),
    transcriptText: $('transcriptText'),
    nextBtn: $('nextBtn'),
    resultRing: $('resultRing'),
    resultPercent: $('resultPercent'),
    resultSummary: $('resultSummary'),
    resultMessage: $('resultMessage'),
    reviewList: $('reviewList'),
    retryBtn: $('retryBtn'),
    homeBtn: $('homeBtn')
  };

  function currentItem() {
    return state.set?.items?.[state.index] || null;
  }

  function showOnly(screen) {
    el.selectScreen.hidden = screen !== el.selectScreen;
    el.questionScreen.hidden = screen !== el.questionScreen;
    el.resultScreen.hidden = screen !== el.resultScreen;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function updateStreak(streakState = null) {
    let next = streakState;
    try { next ||= window.WordFrontlineStreak?.status?.(); } catch (error) { console.warn('Streak status unavailable:', error); }
    el.streakDays.textContent = String(next?.currentStreakDays || 0);
  }

  function refreshEnglishVoices() {
    if (!synth) return [];
    englishVoices = synth.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang || ''));
    englishVoices.sort((a, b) => {
      const score = voice => (voice.localService ? 4 : 0) + (/^en-US/i.test(voice.lang) ? 2 : 0) + (/^en-GB/i.test(voice.lang) ? 1 : 0);
      return score(b) - score(a);
    });
    return englishVoices;
  }

  function renderModes() {
    el.modeGrid.replaceChildren();
    for (const set of content.sets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-card';
      button.dataset.setId = set.id;
      button.setAttribute('aria-label', `${set.nameJa}を始める。全${set.items.length}問。`);

      const inner = document.createElement('span');
      inner.className = 'mode-card-inner';
      const top = document.createElement('span');
      top.className = 'mode-top';
      const badge = document.createElement('span');
      badge.className = 'mode-badge';
      badge.textContent = set.badge;
      const count = document.createElement('span');
      count.className = 'mode-count';
      count.textContent = `${set.items.length} QUESTIONS`;
      top.append(badge, count);

      const title = document.createElement('h3');
      title.textContent = set.nameJa;
      const level = document.createElement('p');
      level.className = 'mode-level';
      level.textContent = set.levelJa;
      const description = document.createElement('p');
      description.className = 'mode-description';
      description.textContent = set.descriptionJa;
      const action = document.createElement('span');
      action.className = 'mode-action';
      const actionText = document.createElement('span');
      actionText.textContent = '訓練を開始';
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      action.append(actionText, arrow);
      inner.append(top, title, level, description, action);
      button.append(inner);
      button.addEventListener('click', () => startMode(set.id));
      el.modeGrid.append(button);
    }
  }

  function startMode(setId) {
    const selected = content.sets.find(set => set.id === setId);
    if (!selected) return;
    cancelAudio();
    state.set = selected;
    state.index = 0;
    state.score = 0;
    state.answers = [];
    state.played = 0;
    state.answered = false;
    showOnly(el.questionScreen);
    renderQuestion();
  }

  function startPreviewCountdown(seconds) {
    clearPreviewTimer();
    state.isPreparing = true;
    state.previewRemaining = Math.max(0, Number(seconds) || 0);
    updatePlayControl();

    if (!state.previewRemaining) {
      state.isPreparing = false;
      el.audioStatus.textContent = '準備完了。再生ボタンを押してください。';
      updatePlayControl();
      return;
    }

    el.audioStatus.textContent = `選択肢を確認してください。あと${state.previewRemaining}秒。`;
    state.previewTimer = window.setInterval(() => {
      state.previewRemaining -= 1;
      if (state.previewRemaining <= 0) {
        clearPreviewTimer();
        state.isPreparing = false;
        el.audioStatus.textContent = '準備完了。再生ボタンを押してください。';
      } else {
        el.audioStatus.textContent = `選択肢を確認してください。あと${state.previewRemaining}秒。`;
      }
      updatePlayControl();
    }, 1000);
  }

  function clearPreviewTimer() {
    if (state.previewTimer) window.clearInterval(state.previewTimer);
    state.previewTimer = 0;
  }

  function renderQuestion() {
    const item = currentItem();
    if (!item) return;
    cancelAudio();
    state.played = 0;
    state.answered = false;

    el.modeName.textContent = state.set.nameJa;
    el.progressText.textContent = `${state.index + 1} / ${state.set.items.length}`;
    el.progressFill.style.width = `${(state.index / state.set.items.length) * 100}%`;
    el.progressBar.setAttribute('aria-valuemax', String(state.set.items.length));
    el.progressBar.setAttribute('aria-valuenow', String(state.index));
    el.scoreText.textContent = String(state.score);
    el.partLabel.textContent = item.part;
    el.levelLabel.textContent = item.level;
    el.skillLabel.textContent = item.targetSkill;
    el.sceneText.textContent = `${item.scenario} / ${item.topic}`;
    el.questionTitle.textContent = item.question;
    el.responseHint.hidden = item.type !== 'best-response';
    el.feedbackPanel.hidden = true;
    el.feedbackPanel.className = 'feedback';
    el.transcriptPanel.hidden = true;
    el.transcriptPanel.open = false;
    el.transcriptText.replaceChildren();
    el.nextBtn.hidden = true;
    el.wave.classList.remove('is-playing');
    renderOptions();
    startPreviewCountdown(item.previewSeconds);

    window.requestAnimationFrame(() => {
      el.questionTitle.setAttribute('tabindex', '-1');
      el.questionTitle.focus({ preventScroll: true });
    });
  }

  function renderOptions(selectedIndex = -1) {
    const item = currentItem();
    if (!item) return;
    const isResponseItem = item.type === 'best-response';
    const hideResponseText = isResponseItem && !state.answered;
    el.optionList.replaceChildren();

    item.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.dataset.index = String(index);
      button.disabled = state.answered || state.played === 0;
      if (!state.answered && state.played === 0) button.classList.add('locked');
      if (state.answered && index === item.correctIndex) button.classList.add('correct');
      if (state.answered && index === selectedIndex && index !== item.correctIndex) button.classList.add('wrong');
      button.setAttribute('aria-label', hideResponseText ? `選択肢${index + 1}を選ぶ` : option);

      const letter = document.createElement('span');
      letter.className = 'option-letter';
      letter.textContent = isResponseItem ? String(index + 1) : letterLabels[index];
      const copy = document.createElement('span');
      copy.className = 'option-copy';
      copy.textContent = hideResponseText ? `選択肢 ${index + 1}` : option;
      button.append(letter, copy);
      button.addEventListener('click', () => answerQuestion(index));
      el.optionList.append(button);
    });
  }

  function updatePlayControl() {
    const item = currentItem();
    if (!item) return;
    const remaining = Math.max(0, item.playLimit - state.played);
    const hasEnglishVoice = refreshEnglishVoices().length > 0;
    el.playCountText.textContent = `残り${remaining}回`;
    el.playBtn.disabled = state.answered || state.isSpeaking || state.isPreparing || remaining <= 0 || !synth || !hasEnglishVoice;

    if (!synth) el.playButtonLabel.textContent = '音声非対応';
    else if (!hasEnglishVoice) el.playButtonLabel.textContent = '英語音声なし';
    else if (state.isPreparing) el.playButtonLabel.textContent = `準備中 ${state.previewRemaining}秒`;
    else if (state.isSpeaking) el.playButtonLabel.textContent = '再生中';
    else if (remaining <= 0) el.playButtonLabel.textContent = '再生上限';
    else if (state.played > 0) el.playButtonLabel.textContent = 'もう一度再生';
    else el.playButtonLabel.textContent = '音声を再生';

    if (synth && !hasEnglishVoice && !state.isPreparing && !state.isSpeaking && !state.answered) {
      el.audioStatus.textContent = '英語音声がありません。Windowsでは音声設定に English (United States) を追加してください。日本語音声は使用しません。';
    }
  }

  function splitForSpeech(text) {
    const matches = String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return (matches || [text]).map(value => value.trim()).filter(Boolean);
  }

  function speechParts(item) {
    const parts = [];
    for (const turn of item.script) {
      splitForSpeech(turn.text).forEach(text => parts.push({ speaker: turn.speaker, text }));
    }
    parts.push({ speaker: 'N', text: item.question });
    if (item.type === 'best-response') {
      item.options.forEach((option, index) => parts.push({ speaker: 'N', text: `Option ${spokenNumbers[index]}. ${option}` }));
    }
    return parts;
  }

  function chooseVoice(speaker, partIndex) {
    refreshEnglishVoices();
    if (!englishVoices.length) return null;
    if (speaker === 'N') return englishVoices[0];
    const offset = speaker === 'A' ? 0 : speaker === 'B' ? 1 : 2;
    return englishVoices[(offset + partIndex) % Math.min(englishVoices.length, 3)];
  }

  function playCurrentItem() {
    const item = currentItem();
    if (!item || state.answered || state.isSpeaking || state.isPreparing || state.played >= item.playLimit) return;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      el.audioStatus.textContent = 'このブラウザでは音声読み上げを利用できません。端末の標準ブラウザをお試しください。';
      updatePlayControl();
      return;
    }

    clearPreviewTimer();
    synth.cancel();
    refreshEnglishVoices();
    if (!englishVoices.length) {
      el.audioStatus.textContent = '英語音声がありません。Windowsでは音声設定に English (United States) を追加してください。日本語音声は使用しません。';
      updatePlayControl();
      return;
    }
    state.played += 1;
    state.isSpeaking = true;
    state.speechToken += 1;
    const token = state.speechToken;
    const parts = speechParts(item);
    let partIndex = 0;

    el.wave.classList.add('is-playing');
    el.audioStatus.textContent = item.type === 'best-response'
      ? '英文と3つの応答文を読み上げています。'
      : '英語音声を再生しています。';
    renderOptions();
    updatePlayControl();

    const speakNext = () => {
      if (token !== state.speechToken || !state.isSpeaking) return;
      if (partIndex >= parts.length) {
        finishSpeech(false);
        return;
      }
      const part = parts[partIndex];
      const utterance = new SpeechSynthesisUtterance(part.text);
      const voice = chooseVoice(part.speaker, partIndex);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || 'en-US';
      utterance.rate = Number(el.rateControl.value) || 0.95;
      utterance.pitch = part.speaker === 'B' ? 0.97 : part.speaker === 'C' ? 1.04 : 1;
      utterance.volume = 1;
      utterance.onend = () => {
        partIndex += 1;
        window.setTimeout(speakNext, 120);
      };
      utterance.onerror = event => {
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        console.warn('Speech synthesis error:', event.error);
        finishSpeech(true);
      };
      synth.speak(utterance);
    };
    speakNext();
  }

  function finishSpeech(hadError) {
    const item = currentItem();
    state.isSpeaking = false;
    el.wave.classList.remove('is-playing');
    const remaining = item ? Math.max(0, item.playLimit - state.played) : 0;
    if (hadError) {
      el.audioStatus.textContent = '音声を最後まで再生できませんでした。端末の音量・音声設定をご確認ください。';
    } else if (remaining > 0) {
      el.audioStatus.textContent = `再生終了。回答してください。あと${remaining}回再生できます。`;
    } else {
      el.audioStatus.textContent = '再生終了。回答を選んでください。';
    }
    updatePlayControl();
  }

  function cancelAudio() {
    clearPreviewTimer();
    state.speechToken += 1;
    state.isSpeaking = false;
    state.isPreparing = false;
    if (synth) synth.cancel();
    el.wave?.classList.remove('is-playing');
  }

  function recordStreakOnce(isCorrect) {
    if (state.streakRecorded) return;
    state.streakRecorded = true;
    try {
      const streakState = window.WordFrontlineStreak?.record?.({ correct: isCorrect });
      updateStreak(streakState);
    } catch (error) {
      console.warn('Could not record the listening activity:', error);
    }
  }

  function answerQuestion(selectedIndex) {
    const item = currentItem();
    if (!item || state.answered || state.played === 0) return;
    cancelAudio();
    state.answered = true;
    const isCorrect = selectedIndex === item.correctIndex;
    if (isCorrect) state.score += 1;
    state.answers.push({ itemId: item.id, selectedIndex, correct: isCorrect });
    recordStreakOnce(isCorrect);

    el.scoreText.textContent = String(state.score);
    el.progressFill.style.width = `${((state.index + 1) / state.set.items.length) * 100}%`;
    el.progressBar.setAttribute('aria-valuenow', String(state.index + 1));
    renderOptions(selectedIndex);

    el.feedbackPanel.hidden = false;
    el.feedbackPanel.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    el.feedbackMark.textContent = isCorrect ? '✓' : '×';
    const correctLabel = item.type === 'best-response'
      ? String(item.correctIndex + 1)
      : (letterLabels[item.correctIndex] || String(item.correctIndex + 1));
    el.feedbackTitle.textContent = isCorrect ? '正解！' : `正解は ${correctLabel}`;
    el.feedbackExplanation.textContent = item.explanationJa;
    renderTranscript(item);
    el.transcriptPanel.hidden = false;
    el.nextBtn.hidden = false;
    el.nextBtn.firstChild.textContent = state.index === state.set.items.length - 1 ? '結果を見る ' : '次の問題へ ';
    el.audioStatus.textContent = '回答しました。英文スクリプトと解説を確認できます。';
    updatePlayControl();
    el.nextBtn.focus({ preventScroll: true });
  }

  function renderTranscript(item) {
    el.transcriptText.replaceChildren();
    for (const turn of item.script) {
      const row = document.createElement('p');
      const speaker = document.createElement('span');
      speaker.className = 'speaker';
      speaker.textContent = turn.speaker;
      const copy = document.createTextNode(turn.text);
      row.append(speaker, copy);
      el.transcriptText.append(row);
    }
    const question = document.createElement('p');
    question.className = 'question-line';
    question.textContent = `Question: ${item.question}`;
    el.transcriptText.append(question);
  }

  function nextQuestion() {
    if (!state.answered) return;
    if (state.index >= state.set.items.length - 1) {
      showResults();
      return;
    }
    state.index += 1;
    renderQuestion();
  }

  function showResults() {
    cancelAudio();
    const total = state.set.items.length;
    const percent = Math.round((state.score / total) * 100);
    el.resultPercent.textContent = `${percent}%`;
    el.resultRing.style.setProperty('--score-angle', `${percent * 3.6}deg`);
    el.resultSummary.textContent = `${total}問中${state.score}問正解`;
    el.resultMessage.textContent = percent === 100
      ? '完全クリア！細部まで正確に聞き取れています。'
      : percent >= 67
        ? '作戦成功。間違えた問題の英文を音読すると、さらに定着します。'
        : '伸びしろ発見。解説で手掛かりを確認して、もう一度挑戦しよう。';
    renderReview();
    showOnly(el.resultScreen);
    window.requestAnimationFrame(() => {
      el.resultScreen.querySelector('h1')?.setAttribute('tabindex', '-1');
      el.resultScreen.querySelector('h1')?.focus({ preventScroll: true });
    });
  }

  function renderReview() {
    el.reviewList.replaceChildren();
    state.answers.forEach((answer, index) => {
      const item = state.set.items.find(candidate => candidate.id === answer.itemId);
      if (!item) return;
      const li = document.createElement('li');
      li.className = `review-item ${answer.correct ? 'correct' : 'wrong'}`;
      const mark = document.createElement('span');
      mark.className = 'review-status';
      mark.textContent = answer.correct ? '✓' : '×';
      const main = document.createElement('span');
      main.className = 'review-main';
      const title = document.createElement('b');
      title.textContent = `問${index + 1}　${item.targetSkill}`;
      const scene = document.createElement('small');
      scene.textContent = `${item.scenario} / ${item.part}`;
      main.append(title, scene);
      const result = document.createElement('span');
      result.className = 'review-answer';
      result.textContent = answer.correct
        ? `正解：${item.options[item.correctIndex]}`
        : `あなた：${item.options[answer.selectedIndex]} / 正解：${item.options[item.correctIndex]}`;
      li.append(mark, main, result);
      el.reviewList.append(li);
    });
  }

  function leaveSession() {
    const hasProgress = state.answers.length > 0 || state.played > 0;
    if (hasProgress && !window.confirm('このモードの途中経過は保存されません。モード選択へ戻りますか？')) return;
    cancelAudio();
    showOnly(el.selectScreen);
  }

  function runSelfTests() {
    const checks = [];
    const check = (name, condition) => checks.push({ test: name, ok: Boolean(condition) });
    const sets = content?.sets || [];
    const items = sets.flatMap(set => set.items || []);
    const ids = items.map(item => item.id);
    const common = sets.find(set => set.id === 'common-test');
    const pre2 = sets.find(set => set.id === 'eiken-pre2');
    const eiken2 = sets.find(set => set.id === 'eiken-2');

    check('3 listening modes', sets.length === 3);
    check('6 items in every mode', sets.every(set => set.items.length === 6));
    check('18 original items total', items.length === 18);
    check('unique item IDs', new Set(ids).size === ids.length);
    check('valid answer indexes', items.every(item => Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < item.options.length));
    check('all scripts contain English text', items.every(item => item.script.length && item.script.every(turn => /^[\x00-\x7F]+$/.test(turn.text))));
    check('transcripts have explanations', items.every(item => item.explanationJa && item.targetSkill));
    check('Common Test play limits mix 2 and 1', common?.items.filter(item => item.playLimit === 2).length === 3 && common?.items.filter(item => item.playLimit === 1).length === 3);
    check('Eiken items play once', [...(pre2?.items || []), ...(eiken2?.items || [])].every(item => item.playLimit === 1));
    check('Pre-2 response items use 3 options', pre2?.items.filter(item => item.type === 'best-response').length === 2 && pre2.items.filter(item => item.type === 'best-response').every(item => item.options.length === 3));
    check('preview times are positive', items.every(item => Number.isFinite(item.previewSeconds) && item.previewSeconds > 0));
    check('shared streak API available', typeof window.WordFrontlineStreak?.record === 'function');

    const passed = checks.filter(result => result.ok).length;
    console.groupCollapsed(`[Listening Lab] content self-tests: ${passed}/${checks.length} passed`);
    console.table(checks);
    console.groupEnd();
    return checks;
  }

  function initialize() {
    if (!content?.sets?.length) {
      console.error('Listening data did not load.');
      el.modeGrid.textContent = '問題データを読み込めませんでした。ページを再読み込みしてください。';
      return;
    }
    renderModes();
    refreshEnglishVoices();
    const handleVoicesChanged = () => {
      refreshEnglishVoices();
      if (currentItem()) updatePlayControl();
    };
    if (synth?.addEventListener) synth.addEventListener('voiceschanged', handleVoicesChanged);
    else if (synth) synth.onvoiceschanged = handleVoicesChanged;
    updateStreak();
    if (window.WordFrontlineStreak?.subscribe) unsubscribeStreak = window.WordFrontlineStreak.subscribe(updateStreak);

    el.playBtn.addEventListener('click', playCurrentItem);
    el.nextBtn.addEventListener('click', nextQuestion);
    el.exitBtn.addEventListener('click', leaveSession);
    el.retryBtn.addEventListener('click', () => startMode(state.set.id));
    el.homeBtn.addEventListener('click', () => {
      cancelAudio();
      showOnly(el.selectScreen);
    });
    el.rateControl.addEventListener('input', () => { el.rateValue.value = `${Number(el.rateControl.value).toFixed(2)}×`; });
    el.rateValue.value = `${Number(el.rateControl.value).toFixed(2)}×`;

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || !state.isSpeaking) return;
      cancelAudio();
      el.audioStatus.textContent = '画面を離れたため音声を停止しました。再生回数は戻りません。';
      updatePlayControl();
    });
    window.addEventListener('pagehide', cancelAudio);
    window.addEventListener('beforeunload', () => unsubscribeStreak());

    window.runWordFrontlineListeningSelfTests = runSelfTests;
    runSelfTests();
  }

  initialize();
})();
