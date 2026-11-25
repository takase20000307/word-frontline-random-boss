/*
 * WORD FRONTLINE Study Plus: boost layer
 *
 * Adds, on top of the motivation layer:
 *   - question direction: English → Japanese, Japanese → English, or mixed
 *     (Japanese → English questions pay a small XP bonus in the motivation layer)
 *   - a combo counter with milestone pings and synthesized sound effects
 *   - personal bests (best combo, most answers in a day, fastest average)
 *   - a result-screen recap: words conquered, weak words defeated, words to
 *     review, a comparison with last time, and the three nearest next goals
 *   - a one-tap "today's recommendation" on the start screen
 *
 * Everything is stored in this browser only, under its own storage key.
 */
'use strict';

(() => {
  const BOOST_VERSION = '1.0.0';
  const STORAGE_KEY = 'wordFrontline:study-plus:boost:v1';
  const motivation = window.WordFrontlineMotivation;
  const update = window.WordFrontlineUpdate;
  const streak = window.WordFrontlineStreak;

  if (typeof buildChoices !== 'function' || typeof presentQuestion !== 'function' || !motivation) {
    console.error('Study Plus boost layer could not start.');
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Tunable numbers                                                     */
  /* ------------------------------------------------------------------ */

  const DIRECTIONS = Object.freeze({
    'en-ja': { label: '英→日', tag: '英→日', hint: '意味を選ぶ' },
    'ja-en': { label: '日→英', tag: '日→英', hint: '英単語を選ぶ' },
    mix: { label: 'ミックス', tag: 'MIX', hint: '毎問ランダム' }
  });
  // Kept in sync with XP.reverseBonus in study-motivation.js (shown on screen).
  const REVERSE_BONUS_XP = 3;
  const COMBO_MILESTONES = Object.freeze([5, 10, 15, 20, 30, 40, 50, 75, 100]);
  // A personal-best combo is announced only once it beats a real record.
  const COMBO_RECORD_ANNOUNCE_FROM = 5;
  const DAY_RECORD_ANNOUNCE_FROM = 20;
  // Fastest average needs a real-sized, mostly correct session.
  const FAST_RECORD_MIN_ATTEMPTS = 20;
  const FAST_RECORD_MIN_ACCURACY = 80;
  const DAYS_KEPT = 60;
  const RECAP_CHIPS = 8;

  /* ------------------------------------------------------------------ */
  /* Persistent state                                                    */
  /* ------------------------------------------------------------------ */

  let memoryValue = '';
  let bstate = blankState();
  let ready = false;

  function blankState() {
    return {
      schemaVersion: 1,
      direction: 'en-ja',
      sfx: true,
      records: { combo: 0, comboAt: '', dayMost: 0, dayMostAt: '', fastest: 0, fastestAt: '' },
      totals: { answers: 0, correct: 0, jaEn: 0, jaEnCorrect: 0 },
      days: {},
      last: {}
    };
  }

  function normalizeState(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const dateOrEmpty = value => (isDate(value) ? value : '');
    const next = { ...base };
    next.direction = Object.hasOwn(DIRECTIONS, raw.direction) ? raw.direction : 'en-ja';
    next.sfx = raw.sfx !== false;
    next.records = {
      combo: count(raw.records?.combo),
      comboAt: dateOrEmpty(raw.records?.comboAt),
      dayMost: count(raw.records?.dayMost),
      dayMostAt: dateOrEmpty(raw.records?.dayMostAt),
      fastest: count(raw.records?.fastest),
      fastestAt: dateOrEmpty(raw.records?.fastestAt)
    };
    next.totals = {
      answers: count(raw.totals?.answers),
      correct: count(raw.totals?.correct),
      jaEn: count(raw.totals?.jaEn),
      jaEnCorrect: count(raw.totals?.jaEnCorrect)
    };
    next.totals.correct = Math.min(next.totals.correct, next.totals.answers);
    next.totals.jaEnCorrect = Math.min(next.totals.jaEnCorrect, next.totals.jaEn);
    if (raw.days && typeof raw.days === 'object') {
      for (const key of Object.keys(raw.days).filter(isDate).sort().slice(-DAYS_KEPT)) {
        const day = raw.days[key] || {};
        next.days[key] = { a: count(day.a), c: Math.min(count(day.a), count(day.c)) };
      }
    }
    if (raw.last && typeof raw.last === 'object') {
      for (const family of ['stage', 'rapid', 'pair']) {
        const item = raw.last[family];
        if (item && typeof item === 'object') {
          next.last[family] = { acc: Math.min(100, count(item.acc)), a: count(item.a), d: dateOrEmpty(item.d) };
        }
      }
    }
    return next;
  }

  function loadState() {
    let raw = memoryValue;
    try { raw = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    try {
      bstate = normalizeState(raw ? JSON.parse(raw) : null);
    } catch {
      bstate = blankState();
    }
    return bstate;
  }

  function persist() {
    const serialized = JSON.stringify(bstate);
    memoryValue = serialized;
    try { localStorage.setItem(STORAGE_KEY, serialized); } catch {}
  }

  // Records reset with the motivation records; the direction and sound
  // preferences are settings and stay.
  function clearRecords() {
    const keep = { direction: bstate.direction, sfx: bstate.sfx };
    bstate = { ...blankState(), ...keep };
    session = null;
    combo = 0;
    persist();
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const $id = id => document.getElementById(id);
  const todayKey = (date = new Date()) => streak?.localDateKey?.(date) || date.toISOString().slice(0, 10);
  const esc = value => escapeHtml(value);
  const formatNumber = value => Math.round(Number(value) || 0).toLocaleString('ja-JP');
  const lower = value => String(value || '').toLowerCase();

  function setText(id, value) {
    const element = $id(id);
    if (element) element.textContent = String(value);
  }

  function gameStateIs(...names) {
    return names.some(name => state === GAME_STATE[name]);
  }

  function dayLog(key = todayKey()) {
    if (!bstate.days[key]) {
      bstate.days[key] = { a: 0, c: 0 };
      const keys = Object.keys(bstate.days).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - DAYS_KEPT))) delete bstate.days[old];
    }
    return bstate.days[key];
  }

  // Mirrors the conquest map of the motivation layer.
  function conquestLevel(stats) {
    if (!stats || !stats.shownCount) return 0;
    if (stats.lastWasIncorrect) return 1;
    const streakNow = stats.currentCorrectStreak || 0;
    if (stats.masteryLevel >= 5 && streakNow >= 5) return 4;
    if (streakNow >= 3) return 3;
    return 2;
  }

  // Mirrors isStoredWeakSense in word-frontline-v2.js, which builds the
  // weak-word run deck.
  function isWeakStats(stats) {
    if (!stats || stats.incorrectCount <= 0) return false;
    const attempts = stats.correctCount + stats.incorrectCount;
    const accuracyRate = attempts ? stats.correctCount / attempts : 0;
    return stats.lastWasIncorrect || accuracyRate < .85 || stats.masteryLevel < 3 || stats.averageReactionTime > 4500;
  }

  function sessionFamily() {
    if (update?.isPairActive?.() || save?.selectedMode === 'pair') return 'pair';
    if (update?.isRapidActive?.() || save?.selectedMode === 'coverage' || save?.selectedMode === 'weak') return 'rapid';
    return 'stage';
  }

  /* ------------------------------------------------------------------ */
  /* Sound effects (Web Audio, synthesized: no audio files)              */
  /* ------------------------------------------------------------------ */

  const sfx = (() => {
    let context = null;
    let master = null;
    const semitone = steps => Math.pow(2, steps / 12);

    function ensure() {
      if (!bstate.sfx) return null;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      if (!context) {
        try {
          context = new AudioCtor();
          master = context.createGain();
          master.gain.value = .2;
          master.connect(context.destination);
        } catch {
          context = null;
          return null;
        }
      }
      if (context.state === 'suspended') context.resume?.().catch?.(() => {});
      return context;
    }

    function tone(freq, start, duration, { type = 'sine', gain = .4, glide = 0 } = {}) {
      const ctx = ensure();
      if (!ctx) return;
      try {
        const at = ctx.currentTime + start;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), at + duration);
        env.gain.setValueAtTime(.0001, at);
        env.gain.exponentialRampToValueAtTime(gain, at + .012);
        env.gain.exponentialRampToValueAtTime(.0001, at + duration);
        osc.connect(env);
        env.connect(master);
        osc.start(at);
        osc.stop(at + duration + .03);
      } catch {}
    }

    return {
      unlock() { ensure(); },
      correct(comboNow = 1) {
        const base = 660 * semitone(Math.min(12, Math.max(0, comboNow - 1)));
        tone(base, 0, .1, { type: 'triangle', gain: .42 });
        tone(base * 1.5, .065, .17, { type: 'triangle', gain: .36 });
      },
      wrong() {
        tone(220, 0, .15, { type: 'square', gain: .12 });
        tone(165, .12, .22, { type: 'square', gain: .11 });
      },
      timeout() {
        tone(440, 0, .34, { type: 'sawtooth', gain: .08, glide: .5 });
      },
      combo(step = 0) {
        [0, 4, 7, 12].forEach((n, i) => tone(523 * semitone(n + Math.min(7, step)), i * .055, .15, { type: 'triangle', gain: .32 }));
      },
      best() {
        [0, 7, 12, 16, 19, 24].forEach((n, i) => tone(784 * semitone(n), i * .045, .14, { type: 'sine', gain: .26 }));
      },
      fanfare() {
        [[0, 0], [4, .12], [7, .24]].forEach(([n, t]) => tone(523 * semitone(n), t, .2, { type: 'triangle', gain: .32 }));
        tone(523 * semitone(12), .38, .55, { type: 'triangle', gain: .34 });
        tone(523 * semitone(16), .38, .55, { type: 'sine', gain: .18 });
      },
      crate() {
        tone(260, 0, .28, { type: 'sawtooth', gain: .06, glide: 2.6 });
        tone(1320, .26, .22, { type: 'sine', gain: .24 });
        tone(1760, .33, .26, { type: 'sine', gain: .18 });
      }
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Question direction                                                  */
  /* ------------------------------------------------------------------ */

  // pendingDirection is decided when choices are built (Japanese → English
  // needs stricter distractors) and consumed when the question is shown.
  let pendingDirection = '';
  let activeDirection = 'en-ja';
  let revealed = true;
  let jaEnCache = { words: null, byEnglish: new Map() };

  // Audio drills ask by sound; the English must stay the question there.
  function forcedEnJa() {
    if (save?.selectedMode === 'audio') return true;
    return Boolean(document.querySelector('#app')?.classList.contains('mission-listen'));
  }

  function rollDirection(random = Math.random) {
    if (forcedEnJa()) return 'en-ja';
    if (bstate.direction === 'mix') return random() < .5 ? 'ja-en' : 'en-ja';
    return bstate.direction === 'ja-en' ? 'ja-en' : 'en-ja';
  }

  function directionForBuild() {
    if (!pendingDirection) pendingDirection = rollDirection();
    return pendingDirection;
  }

  // Every meaning of an English word, including senses a daily mission has
  // filtered out of senseList, so a distractor never fits the prompt.
  function sensesByEnglish() {
    if (jaEnCache.words !== wordData) {
      const map = new Map();
      let list = [];
      try { list = buildSenseList(wordData); } catch { list = senseList; }
      for (const sense of [...list, ...senseList]) {
        const key = lower(sense.english);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(sense);
      }
      jaEnCache = { words: wordData, byEnglish: map };
    }
    return jaEnCache.byEnglish;
  }

  // careful / carefully, memory / memorize: same family, too easy to confuse
  // when only the Japanese meaning is shown.
  function sharesWordFamily(a, b) {
    a = lower(a).replace(/[^a-z]/g, '');
    b = lower(b).replace(/[^a-z]/g, '');
    if (!a || !b) return false;
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    return prefix >= Math.max(4, Math.ceil(Math.min(a.length, b.length) * .6));
  }

  function isJaEnDistractorOk(candidate, target) {
    if (!candidate || !target) return false;
    if (lower(candidate.english) === lower(target.english)) return false;
    if (sharesWordFamily(candidate.english, target.english)) return false;
    // The base engine already compares the candidate's own meaning; check
    // its other meanings (and the candidate itself when it is a bare choice).
    const senses = sensesByEnglish().get(lower(candidate.english)) || [];
    const others = candidate.senseId ? senses.filter(other => other.senseId !== candidate.senseId) : [candidate, ...senses];
    return !others.some(other =>
      isMeaningTooSimilar(target.shortMeaning, other.shortMeaning, target.english, other.english)
    );
  }

  function isJaEnSafe(choices, target) {
    if (!Array.isArray(choices) || choices.length !== 4) return false;
    const englishSet = new Set(choices.map(choice => lower(choice.english)));
    if (englishSet.size !== 4) return false;
    return choices.every(choice =>
      choice.isCorrect === true || isJaEnDistractorOk({ english: choice.english, shortMeaning: choice.meaning }, target)
    );
  }

  // The prompt hides the answer when a meaning quotes it, e.g. 《call A B》.
  function maskedPrompt(sense) {
    const text = String(sense?.shortMeaning || '');
    const word = String(sense?.english || '').trim();
    if (!word || !/^[A-Za-z][A-Za-z' -]*$/.test(word)) return text;
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es|ed|d|ing)?\\b`, 'gi');
    return text.replace(pattern, '～');
  }

  function setDirectionClasses() {
    const app = document.querySelector('#app');
    app?.classList.toggle('boost-ja-en', activeDirection === 'ja-en');
    app?.classList.toggle('boost-revealed', revealed);
  }

  function revealAnswer() {
    if (revealed) return;
    revealed = true;
    setDirectionClasses();
    if (activeDirection !== 'ja-en' || !currentSense) return;
    // Say the English answer once it is no longer a hint.
    if (save?.voice?.enabled && save?.voice?.autoPlay) {
      const serial = answerSerial;
      const english = currentSense.english;
      setTimeout(() => {
        if (answerSerial === serial && revealed && !gameStateIs('START', 'PAUSED')) speakWord(english);
      }, save?.settings?.reducedMotion ? 60 : update?.isRapidActive?.() ? 120 : 380);
    }
  }

  function resetDirection() {
    pendingDirection = '';
    activeDirection = 'en-ja';
    revealed = true;
    setDirectionClasses();
  }

  /* ------------------------------------------------------------------ */
  /* Sessions, combo and records                                         */
  /* ------------------------------------------------------------------ */

  let session = null;
  let combo = 0;
  let lastRecap = null;

  function startSession() {
    session = {
      startedAt: Date.now(),
      family: sessionFamily(),
      attempts: 0,
      correct: 0,
      reaction: 0,
      jaEn: 0,
      jaEnCorrect: 0,
      maxCombo: 0,
      comboRecord: false,
      comboAnnounced: false,
      conquered: new Map(),
      defeated: new Map(),
      missed: new Map(),
      finalized: false
    };
    combo = 0;
    lastRecap = null;
    renderCombo();
    return session;
  }

  function onAnswer(sense, correct, reaction, before) {
    if (!sense) return;
    if (!session || session.finalized || session.family !== sessionFamily()) startSession();
    const timedOut = !correct && Number(reaction) >= questionTimeLimit * 1000 - 1;
    const key = todayKey();
    const day = dayLog(key);
    session.attempts++;
    session.reaction += Math.max(0, Number(reaction) || 0);
    bstate.totals.answers++;
    day.a++;
    const reverse = activeDirection === 'ja-en';
    if (reverse) {
      session.jaEn++;
      bstate.totals.jaEn++;
    }

    if (correct) {
      session.correct++;
      bstate.totals.correct++;
      day.c++;
      if (reverse) {
        session.jaEnCorrect++;
        bstate.totals.jaEnCorrect++;
      }
      combo++;
      session.maxCombo = Math.max(session.maxCombo, combo);
      const milestone = COMBO_MILESTONES.indexOf(combo);
      if (combo > bstate.records.combo) {
        const previousBest = bstate.records.combo;
        bstate.records.combo = combo;
        bstate.records.comboAt = key;
        session.comboRecord = true;
        if (previousBest >= COMBO_RECORD_ANNOUNCE_FROM && !session.comboAnnounced) {
          session.comboAnnounced = true;
          ping(`🏆 自己ベスト更新中！ ${combo} COMBO（これまで ${previousBest}）`, 'rank');
          sfx.best();
        } else if (milestone >= 0) {
          ping(`🔥 ${combo} COMBO!`, 'combo');
          sfx.combo(milestone);
        } else {
          sfx.correct(combo);
        }
      } else if (milestone >= 0) {
        ping(`🔥 ${combo} COMBO!`, 'combo');
        sfx.combo(milestone);
      } else {
        sfx.correct(combo);
      }
    } else {
      if (combo >= 5) showComboBreak(combo);
      combo = 0;
      timedOut ? sfx.timeout() : sfx.wrong();
    }

    if (day.a > bstate.records.dayMost) {
      const previousMost = bstate.records.dayMost;
      bstate.records.dayMost = day.a;
      if (bstate.records.dayMostAt !== key && previousMost >= DAY_RECORD_ANNOUNCE_FROM) {
        ping(`📅 1日の最多回答数を更新！（これまで ${previousMost}問）`, 'daily');
      }
      bstate.records.dayMostAt = key;
    }

    // What this answer changed, for the result recap.
    const after = save.progress[sense.senseId];
    const levelBefore = before?.level || 0;
    const levelAfter = conquestLevel(after);
    if (levelBefore < 3 && levelAfter >= 3) session.conquered.set(sense.senseId, sense);
    if (correct && before?.lastWasIncorrect && Number(before.lastIncorrectAt || 0) < session.startedAt) {
      session.defeated.set(sense.senseId, sense);
    }
    if (!correct) session.missed.set(sense.senseId, { sense, recovered: false });
    else if (session.missed.has(sense.senseId)) session.missed.get(sense.senseId).recovered = true;

    persist();
    renderCombo(correct);
  }

  function finalizeSession() {
    if (!session || session.finalized) return lastRecap;
    session.finalized = true;
    if (!session.attempts) {
      lastRecap = null;
      return null;
    }
    const accuracy = Math.round(session.correct / session.attempts * 100);
    const average = session.reaction / session.attempts;
    let fastRecord = false;
    if (session.attempts >= FAST_RECORD_MIN_ATTEMPTS && accuracy >= FAST_RECORD_MIN_ACCURACY) {
      const ms = Math.round(average);
      if (!bstate.records.fastest || ms < bstate.records.fastest) {
        fastRecord = Boolean(bstate.records.fastest);
        bstate.records.fastest = ms;
        bstate.records.fastestAt = todayKey();
      }
    }
    const previous = bstate.last[session.family] || null;
    bstate.last[session.family] = { acc: accuracy, a: session.attempts, d: todayKey() };
    persist();
    lastRecap = {
      family: session.family,
      attempts: session.attempts,
      correct: session.correct,
      accuracy,
      average,
      jaEn: session.jaEn,
      jaEnCorrect: session.jaEnCorrect,
      maxCombo: session.maxCombo,
      comboRecord: session.comboRecord && session.maxCombo >= COMBO_RECORD_ANNOUNCE_FROM,
      fastRecord,
      previous,
      conquered: [...session.conquered.values()],
      defeated: [...session.defeated.values()],
      missed: [...session.missed.values()]
    };
    return lastRecap;
  }

  function cheerText(recap) {
    const previous = recap.previous && recap.previous.a >= 5 && recap.attempts >= 5 ? recap.previous : null;
    if (recap.comboRecord) return `🏆 最高コンボ自己ベスト更新！ ${recap.maxCombo} COMBO`;
    if (recap.fastRecord) return `⚡ 平均回答時間の自己ベスト更新！ ${(recap.average / 1000).toFixed(1)}秒`;
    if (recap.accuracy === 100 && recap.attempts >= 5) return '💯 パーフェクト！ 全問正解';
    if (previous && recap.accuracy > previous.acc) return `📈 前回より正答率 +${recap.accuracy - previous.acc}%！ 確実に伸びています`;
    if (recap.conquered.length) return `⭐ ${recap.conquered.length}語を新たに制覇！ 着実に前進中`;
    if (recap.defeated.length) return `💥 苦手を${recap.defeated.length}語撃破！ その調子`;
    if (previous && recap.accuracy === previous.acc) return '👍 前回と同じ正答率をキープ！';
    if (recap.missed.length) return `📝 ミスした${recap.missed.length}語が次の伸びしろ。もう一度挑めば覚えられる！`;
    return '👍 ナイスファイト！';
  }

  /* ------------------------------------------------------------------ */
  /* Next goals and recommendation                                       */
  /* ------------------------------------------------------------------ */

  function nextGoals(recap = lastRecap) {
    const goals = [];
    const add = (icon, label, current, target, rest) => {
      if (!(target > 0) || current >= target) return;
      goals.push({ icon, label, current: Math.max(0, current), target, rest, ratio: Math.max(0, current) / target });
    };
    try {
      const daily = motivation.dailyStatus();
      if (!daily.silver) add('🥈', '今日の銀メダル', daily.attempts, daily.silverTarget || 20, `あと${(daily.silverTarget || 20) - daily.attempts}問`);
      if (!daily.gold && daily.goldTarget) {
        add('🥇', '今日の金メダル', daily.goldCurrent, daily.goldTarget,
          daily.goldUnit === 'correct' ? `あと${daily.goldTarget - daily.goldCurrent}問正解` : `苦手をあと${daily.goldTarget - daily.goldCurrent}語撃破`);
      }
      const rank = motivation.rankInfo();
      if (rank.next) add('🎖️', `次の階級「${rank.next.name}」`, rank.xp - rank.floor, rank.next.xp - rank.floor, `あと${formatNumber(rank.toNext)}戦功`);
      const milestone = motivation.nextMilestone?.();
      if (milestone && !milestone.ineligible && milestone.needed) {
        add('📖', `図鑑${milestone.pct}%の達成報酬`, milestone.needed - milestone.remaining, milestone.needed, `カードあと${milestone.remaining}枚`);
      }
      const conquest = motivation.conquestSummary();
      if (conquest.total) add('🗺️', 'この範囲を全制覇', conquest.conquered, conquest.total, `あと${conquest.total - conquest.conquered}語`);
    } catch (error) {
      console.warn('Boost goals could not read the motivation layer:', error);
    }
    const best = bstate.records.combo;
    if (best >= COMBO_RECORD_ANNOUNCE_FROM && recap && recap.maxCombo < best) {
      add('🔥', `最高コンボ ${best} を超える`, recap.maxCombo, best + 1, `あと${best + 1 - recap.maxCombo}連続`);
    }
    return goals.sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  }

  function rangeCounts() {
    const groups = new Map();
    let unseen = 0;
    for (const sense of senseList) {
      const stats = save?.progress?.[sense.senseId];
      if (!stats || !stats.shownCount) unseen++;
      if (isWeakStats(stats)) groups.set(lower(sense.english), true);
    }
    return { weak: groups.size, unseen, total: senseList.length };
  }

  function recommendation() {
    const counts = rangeCounts();
    let daily = null;
    let mission = null;
    try {
      daily = motivation.dailyStatus();
      mission = motivation.todayMission();
    } catch {}
    const minutes = Math.max(2, Math.ceil(counts.unseen * 2.55 / 60));
    const goldLeft = daily && daily.goldTarget ? daily.goldTarget - daily.goldCurrent : 0;
    if (counts.weak >= 3 && daily && !daily.gold) {
      return {
        mode: 'weak',
        title: '苦手一斉学習',
        reason: daily.goldUnit === 'weak' ? `苦手${counts.weak}語・あと${goldLeft}語撃破で金メダル` : `苦手${counts.weak}語をまとめて撃破`,
        detail: `苦手が${counts.weak}語あります。苦手一斉学習でまとめて撃破しよう。`
      };
    }
    if (counts.unseen > 0) {
      return {
        mode: 'coverage',
        title: 'テスト範囲一斉学習',
        reason: `未出題${counts.unseen}語・約${minutes}分で一周`,
        detail: `まだ出ていない単語が${counts.unseen}語あります。約${minutes}分で範囲を一周できます。`
      };
    }
    if (daily && !daily.mission && mission) {
      return {
        mode: 'daily',
        title: `作戦：${mission.name}`,
        reason: '正答率70%以上で特別補給箱',
        detail: `本日の作戦「${mission.name}」：${mission.rule}。正答率70%以上でクリアすると特別補給箱。`
      };
    }
    if (counts.weak >= 3) {
      return {
        mode: 'weak',
        title: '苦手一斉学習',
        reason: `残る苦手${counts.weak}語を制覇`,
        detail: `苦手が${counts.weak}語残っています。制覇マップを塗り替えよう。`
      };
    }
    return {
      mode: 'normal',
      title: '通常モード',
      reason: '過去の自分（ゴースト）と勝負',
      detail: '約1週間前の自分（ゴースト）と勝負して、制覇を広げよう。'
    };
  }

  function deploy(mode) {
    if (!Object.hasOwn(MODES, mode)) mode = 'normal';
    sfx.unlock();
    save.selectedMode = mode;
    saveProgress();
    renderModeGrid();
    startGame();
  }

  /* ------------------------------------------------------------------ */
  /* Hooks                                                               */
  /* ------------------------------------------------------------------ */

  const previous = {
    buildChoices,
    presentQuestion,
    renderGame,
    renderChoices,
    drawGates,
    speakWord,
    feedback,
    updateWordStats,
    resolveCorrectAnswer,
    resolveIncorrectAnswer,
    startStage,
    showScreen,
    renderSettings,
    applySettings,
    resetProgress
  };

  function installHooks() {
    buildChoices = function buildChoicesBoost(target) {
      if (!target || directionForBuild() !== 'ja-en') return previous.buildChoices(target);
      // Offer only distractors that cannot also fit the Japanese prompt.
      const fullList = senseList;
      let choices = null;
      try {
        senseList = fullList.filter(sense => sense.senseId === target.senseId || isJaEnDistractorOk(sense, target));
        for (let attempt = 0; attempt < 3 && !choices; attempt++) {
          const built = previous.buildChoices(target);
          if (built && isJaEnSafe(built, target)) choices = built;
        }
      } finally {
        senseList = fullList;
      }
      if (choices) return choices;
      // This word has no clean Japanese → English set: ask it the usual way.
      pendingDirection = 'en-ja';
      return previous.buildChoices(target);
    };

    presentQuestion = function presentQuestionBoost(target, choices, isBoss) {
      activeDirection = pendingDirection === 'ja-en' && !forcedEnJa() ? 'ja-en' : 'en-ja';
      pendingDirection = '';
      revealed = false;
      setDirectionClasses();
      return previous.presentQuestion(target, choices, isBoss);
    };

    speakWord = function speakWordBoost(word) {
      // In Japanese → English the English is the answer: no hints by voice.
      if (activeDirection === 'ja-en' && !revealed && currentSense && lower(String(word).trim()) === lower(currentSense.english)) {
        return false;
      }
      return previous.speakWord(word);
    };

    feedback = function feedbackBoost(title, sub, color) {
      if (activeDirection === 'ja-en' && currentSense && typeof sub === 'string') {
        const prefix = `正解：${currentSense.shortMeaning}`;
        if (sub.startsWith(prefix)) sub = `正解：${currentSense.english}${sub.slice(prefix.length)}`;
      }
      return previous.feedback(title, sub, color);
    };

    resolveCorrectAnswer = function resolveCorrectAnswerBoost(index) {
      revealAnswer();
      return previous.resolveCorrectAnswer(index);
    };

    resolveIncorrectAnswer = function resolveIncorrectAnswerBoost(index, timedOut = false) {
      revealAnswer();
      return previous.resolveIncorrectAnswer(index, timedOut);
    };

    renderGame = function renderGameBoost() {
      const result = previous.renderGame();
      decorateQuestionCard();
      return result;
    };

    renderChoices = function renderChoicesBoost() {
      const result = previous.renderChoices();
      decorateChoices();
      return result;
    };

    // The lane gates on the battlefield are labelled with each choice; in
    // Japanese → English they must show the English, not the meanings.
    drawGates = function drawGatesBoost() {
      if (activeDirection !== 'ja-en' || !currentChoices.length) return previous.drawGates();
      const shown = currentChoices;
      currentChoices = shown.map(choice => ({ ...choice, meaning: choice.english }));
      try {
        return previous.drawGates();
      } finally {
        currentChoices = shown;
      }
    };

    updateWordStats = function updateWordStatsBoost(sense, correct, reaction) {
      const stats = sense ? save.progress[sense.senseId] : null;
      const before = {
        level: conquestLevel(stats),
        lastWasIncorrect: Boolean(stats?.lastWasIncorrect),
        lastIncorrectAt: stats?.lastIncorrectAt || 0
      };
      const result = previous.updateWordStats(sense, correct, reaction);
      try {
        onAnswer(sense, Boolean(correct), reaction, before);
      } catch (error) {
        console.warn('Boost answer hook failed:', error);
      }
      return result;
    };

    startStage = function startStageBoost() {
      if (session && !session.finalized) session = null;
      startSession();
      return previous.startStage();
    };

    showScreen = function showScreenBoost(which) {
      if (session && !session.finalized) session = null;
      combo = 0;
      lastRecap = null;
      resetDirection();
      renderCombo();
      const result = previous.showScreen(which);
      if (ready && (which === 'start' || which === 'modes')) {
        renderStartCard();
        renderDirectionPicker();
      }
      return result;
    };

    renderSettings = function renderSettingsBoost() {
      const result = previous.renderSettings();
      const content = $id('settingsContent');
      if (content && !$id('setBoostSfx')) {
        content.insertAdjacentHTML('beforeend', `
          <div class="form-row"><label for="setBoostDirection">出題形式</label>
            <select id="setBoostDirection">
              ${Object.entries(DIRECTIONS).map(([key, item]) => `<option value="${key}">${item.label}（${item.hint}）</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>効果音</label><label class="toggle"><input id="setBoostSfx" type="checkbox"> 正解・コンボ・昇進の効果音</label></div>
        `);
      }
      const select = $id('setBoostDirection');
      if (select) select.value = bstate.direction;
      const box = $id('setBoostSfx');
      if (box) box.checked = bstate.sfx;
      return result;
    };

    applySettings = function applySettingsBoost() {
      const result = previous.applySettings();
      const select = $id('setBoostDirection');
      const box = $id('setBoostSfx');
      if (select && Object.hasOwn(DIRECTIONS, select.value)) bstate.direction = select.value;
      if (box) bstate.sfx = box.checked;
      persist();
      renderDirectionPicker();
      return result;
    };

    resetProgress = function resetProgressBoost(keepWords = true) {
      if ($id('resetMotivation')?.checked) clearRecords();
      const result = previous.resetProgress(keepWords);
      if (ready) renderStartCard();
      return result;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Interface                                                           */
  /* ------------------------------------------------------------------ */

  function injectInterface() {
    const card = $id('questionCard');
    if (card && !$id('boostDirTag')) {
      card.insertAdjacentHTML('afterbegin', '<span id="boostDirTag" class="boost-dir-tag hidden" aria-hidden="true">日→英</span>');
      card.insertAdjacentHTML('beforeend', '<div id="boostReveal" class="boost-reveal hidden" lang="en" aria-live="polite"></div>');
    }

    const shell = $id('battleShell');
    if (shell && !$id('boostCombo')) {
      shell.insertAdjacentHTML('beforeend', `
        <div id="boostCombo" class="boost-combo hidden" aria-live="off"><b id="boostComboCount">0</b><span>COMBO</span></div>
        <div id="boostComboBreak" class="boost-combo-break hidden" aria-hidden="true"></div>
      `);
    }

    const strip = $id('modeRangeStrip');
    if (strip && !$id('boostDirection')) {
      strip.insertAdjacentHTML('afterend', `
        <div id="boostDirection" class="boost-direction">
          <span class="boost-direction-label" id="boostDirectionLabel">出題形式</span>
          <div class="boost-direction-options" role="radiogroup" aria-labelledby="boostDirectionLabel">
            ${Object.entries(DIRECTIONS).map(([key, item]) => `
              <button type="button" role="radio" class="boost-dir-option" data-direction="${key}" aria-checked="false">
                <strong>${item.label}</strong><small>${key === 'ja-en' ? `${item.hint}・正解+${REVERSE_BONUS_XP}戦功` : key === 'mix' ? `${item.hint}・日→英は+${REVERSE_BONUS_XP}` : item.hint}</small>
              </button>`).join('')}
          </div>
          <button id="boostSfxToggle" class="boost-sfx-toggle" type="button" aria-pressed="true" title="効果音のオン・オフ">🔊<span>効果音</span></button>
        </div>
        <p id="boostDirectionNote" class="boost-direction-note">英→日：英単語を見て日本語の意味を選ぶ／日→英：日本語の意味を見て英単語を選ぶ。音声強化モードと聴音作戦は英→日、オンライン対戦はホストの形式で出題します。</p>
      `);
    }

    const dashboard = $id('plusDashboard');
    if (dashboard && !$id('boostRecords')) {
      dashboard.insertAdjacentHTML('afterend', '<section id="boostRecords" class="boost-records" aria-label="自己ベスト"></section>');
    }

    // The recommendation sits next to the main start button, which stays in
    // view while the start screen scrolls.
    const start = $id('toModesButton');
    if (start && !$id('boostLaunch')) {
      start.insertAdjacentHTML('beforebegin', '<div id="boostLaunch" class="boost-launch"></div>');
      const launch = $id('boostLaunch');
      launch.appendChild(start);
      launch.insertAdjacentHTML('beforeend', `
        <button id="boostNextDeploy" class="boost-next-btn" type="button">
          <span class="boost-next-kicker">🎯 おすすめで出撃</span>
          <strong id="boostNextTitle">—</strong>
          <small id="boostNextReason">—</small>
        </button>
      `);
    }
  }

  function decorateQuestionCard() {
    const tag = $id('boostDirTag');
    const revealBox = $id('boostReveal');
    const word = $id('questionWord');
    if (!word) return;
    const inQuestion = Boolean(currentSense) && !gameStateIs('START');
    const reverse = inQuestion && activeDirection === 'ja-en';
    if (tag) {
      const showTag = inQuestion && (bstate.direction !== 'en-ja' || reverse);
      tag.classList.toggle('hidden', !showTag);
      tag.textContent = DIRECTIONS[reverse ? 'ja-en' : 'en-ja'].tag;
      tag.classList.toggle('reverse', reverse);
    }
    word.lang = reverse ? 'ja' : 'en';
    if (!reverse) {
      revealBox?.classList.add('hidden');
      return;
    }
    word.textContent = maskedPrompt(currentSense);
    if (!revealed) {
      $id('questionCue')?.classList.add('hidden');
      setText('sideWord', '？？？');
    }
    if (revealBox) {
      revealBox.textContent = revealed ? currentSense.english : '';
      revealBox.classList.toggle('hidden', !revealed);
    }
  }

  function decorateChoices() {
    const buttons = [...document.querySelectorAll('#choices .choice')];
    const reverse = activeDirection === 'ja-en';
    buttons.forEach((button, index) => {
      const choice = currentChoices[index];
      if (!choice) return;
      const text = button.querySelector('.choice-text');
      const letter = String.fromCharCode(65 + index);
      if (reverse && text) {
        text.textContent = choice.english;
        text.lang = 'en';
        button.classList.add('boost-en-choice');
        button.title = choice.english;
        button.setAttribute('aria-label', `${letter}、${choice.english}`);
      }
      // After answering, show the other side of every choice: wrong options
      // become a mini word list too.
      if (battle.gateResult && text) {
        const sub = document.createElement('small');
        sub.className = 'boost-choice-sub';
        sub.textContent = reverse ? choice.meaning : choice.english;
        sub.lang = reverse ? 'ja' : 'en';
        text.after(sub);
        button.classList.add('boost-revealed-choice');
      }
    });
    // Runs after the engine has shrunk the text to fit: where the extra line
    // still does not fit (long meanings on small phones), leave it out.
    if (battle.gateResult) {
      requestAnimationFrame(() => {
        let removed = false;
        for (const button of document.querySelectorAll('#choices .choice.boost-revealed-choice')) {
          if (button.scrollHeight > button.clientHeight + 1) {
            button.querySelector('.boost-choice-sub')?.remove();
            button.classList.remove('boost-revealed-choice');
            removed = true;
          }
        }
        if (removed) fitChoiceButtons();
      });
    }
  }

  let comboBreakTimer = 0;

  function renderCombo(bump = false) {
    const box = $id('boostCombo');
    if (!box) return;
    const visible = combo >= 2 && !gameStateIs('START');
    box.classList.toggle('hidden', !visible);
    if (!visible) return;
    setText('boostComboCount', combo);
    const tier = combo >= 30 ? 5 : combo >= 20 ? 4 : combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
    box.className = `boost-combo tier-${tier}`;
    if (bump && !save?.settings?.reducedMotion) {
      box.classList.remove('bump');
      void box.offsetWidth;
      box.classList.add('bump');
    }
  }

  function showComboBreak(count) {
    const box = $id('boostComboBreak');
    if (!box) return;
    box.textContent = `${count} COMBO 終了`;
    box.classList.remove('hidden', 'show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(comboBreakTimer);
    comboBreakTimer = setTimeout(() => box.classList.add('hidden'), 1300);
  }

  function ping(message, kind = '') {
    if (!ready) return;
    const box = $id('mtvBattlePings');
    if (!box || gameStateIs('START')) return;
    const item = document.createElement('div');
    item.className = `mtv-ping ${kind}`;
    item.textContent = message;
    box.appendChild(item);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => item.remove(), save?.settings?.reducedMotion ? 1800 : 2300);
  }

  function renderDirectionPicker() {
    for (const button of document.querySelectorAll('[data-direction]')) {
      const active = button.dataset.direction === bstate.direction;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-checked', String(active));
    }
    const toggle = $id('boostSfxToggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(bstate.sfx));
      toggle.classList.toggle('off', !bstate.sfx);
      toggle.firstChild.textContent = bstate.sfx ? '🔊' : '🔇';
    }
  }

  function recordsHtml() {
    const records = bstate.records;
    const totals = bstate.totals;
    const items = [];
    if (records.combo) items.push(`<span class="boost-record"><i>🔥</i>最高 <b>${records.combo}</b> COMBO</span>`);
    if (records.dayMost) items.push(`<span class="boost-record"><i>📅</i>1日最多 <b>${formatNumber(records.dayMost)}</b>問</span>`);
    if (records.fastest) items.push(`<span class="boost-record"><i>⚡</i>平均最速 <b>${(records.fastest / 1000).toFixed(1)}</b>秒</span>`);
    if (totals.jaEnCorrect) items.push(`<span class="boost-record"><i>🔁</i>日→英 <b>${formatNumber(totals.jaEnCorrect)}</b>問正解</span>`);
    if (totals.correct) items.push(`<span class="boost-record"><i>✅</i>累計 <b>${formatNumber(totals.correct)}</b>問正解</span>`);
    if (!items.length) return '<span class="boost-records-empty">🏆 自己ベスト：最高コンボ・1日の最多回答数などをここに記録します</span>';
    return `<span class="boost-records-label">🏆 自己ベスト</span>${items.join('')}`;
  }

  function renderStartCard() {
    if (!save) return;
    const next = recommendation();
    setText('boostNextTitle', next.title);
    setText('boostNextReason', next.reason);
    const button = $id('boostNextDeploy');
    if (button) {
      button.dataset.mode = next.mode;
      button.title = next.detail;
      button.setAttribute('aria-label', `おすすめで出撃：${next.title}。${next.detail}`);
    }
    const records = $id('boostRecords');
    if (records) records.innerHTML = recordsHtml();
  }

  /* Result recap ------------------------------------------------------ */

  function chipsHtml(list, kind) {
    const shown = list.slice(0, RECAP_CHIPS).map(item => {
      const sense = item.sense || item;
      const done = item.recovered ? ' recovered' : '';
      return `<button type="button" class="boost-chip ${kind}${done}" data-speak="${esc(sense.english)}" title="${esc(sense.shortMeaning)}">
        <span lang="en">${esc(sense.english)}</span><small>${esc(sense.shortMeaning)}</small>
      </button>`;
    });
    if (list.length > RECAP_CHIPS) shown.push(`<span class="boost-chip-more">ほか${list.length - RECAP_CHIPS}語</span>`);
    return shown.join('');
  }

  function recapHtml(recap) {
    const goals = nextGoals(recap);
    const badges = [];
    if (recap.comboRecord) badges.push('<em class="boost-new">自己ベスト!</em>');
    const stats = [
      `${recap.attempts}問`,
      `正答率 ${recap.accuracy}%`,
      `平均 ${(recap.average / 1000).toFixed(1)}秒${recap.fastRecord ? ' <em class="boost-new">最速!</em>' : ''}`,
      `最高 ${recap.maxCombo} COMBO ${badges.join('')}`
    ];
    if (recap.jaEn) stats.push(`日→英 ${recap.jaEnCorrect}/${recap.jaEn}問正解`);
    const groups = [];
    if (recap.conquered.length) {
      groups.push(`<div class="boost-word-group conquered"><b>⭐ 新たに制覇 ${recap.conquered.length}語</b><div class="boost-chips">${chipsHtml(recap.conquered, 'conquered')}</div></div>`);
    }
    if (recap.defeated.length) {
      groups.push(`<div class="boost-word-group defeated"><b>💥 撃破した苦手 ${recap.defeated.length}語</b><div class="boost-chips">${chipsHtml(recap.defeated, 'defeated')}</div></div>`);
    }
    if (recap.missed.length) {
      const recovered = recap.missed.filter(item => item.recovered).length;
      groups.push(`<div class="boost-word-group missed"><b>📝 今回ミスした単語 ${recap.missed.length}語${recovered ? `（うち${recovered}語はその後正解 ✓）` : ''}</b><div class="boost-chips">${chipsHtml(recap.missed, 'missed')}</div></div>`);
    }
    const goalRows = goals.map(goal => `
      <div class="boost-goal">
        <span class="boost-goal-label"><i aria-hidden="true">${goal.icon}</i>${esc(goal.label)}</span>
        <span class="boost-goal-bar" aria-hidden="true"><b style="width:${(goal.ratio * 100).toFixed(1)}%"></b></span>
        <em>${esc(goal.rest)}</em>
      </div>`).join('');
    return `
      <section id="boostResultPanel" class="boost-result" aria-label="今回のふりかえり">
        <div class="boost-result-head">
          <strong class="boost-cheer">${esc(cheerText(recap))}</strong>
          <span class="boost-result-stats">${stats.join('<span class="sep">·</span>')}</span>
        </div>
        ${groups.length ? `<div class="boost-words">${groups.join('')}<p class="boost-words-hint">単語をタップすると発音を再生します</p></div>` : ''}
        ${goalRows ? `<div class="boost-goals"><p class="plus-kicker">NEXT GOALS · もう少しで届く目標</p>${goalRows}</div>` : ''}
      </section>
    `;
  }

  function injectResultPanel() {
    const layer = $id('resultLayer');
    const content = $id('resultContent');
    if (!layer || !content || layer.classList.contains('hidden') || !lastRecap) return;
    if (content.querySelector('#boostResultPanel')) return;
    const anchor = content.querySelector('#mtvResultPanel');
    if (anchor) anchor.insertAdjacentHTML('afterend', recapHtml(lastRecap));
    else content.insertAdjacentHTML('afterbegin', recapHtml(lastRecap));
  }

  function watchResults() {
    const layer = $id('resultLayer');
    const content = $id('resultContent');
    if (!layer || !content) return;
    let wasVisible = !layer.classList.contains('hidden');
    new MutationObserver(() => {
      const visible = !layer.classList.contains('hidden');
      if (visible && !wasVisible) {
        try {
          finalizeSession();
        } catch (error) {
          console.warn('Boost result hook failed:', error);
        }
        renderCombo();
        injectResultPanel();
      }
      wasVisible = visible;
    }).observe(layer, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => injectResultPanel()).observe(content, { childList: true });
    content.addEventListener('click', event => {
      const chip = event.target.closest('[data-speak]');
      if (chip) speakWord(chip.dataset.speak);
    });
  }

  function watchCelebrations() {
    const layer = $id('mtvCelebrateLayer');
    if (layer) {
      let wasVisible = !layer.classList.contains('hidden');
      new MutationObserver(() => {
        const visible = !layer.classList.contains('hidden');
        if (visible && !wasVisible) sfx.fanfare();
        wasVisible = visible;
      }).observe(layer, { attributes: true, attributeFilter: ['class'] });
    }
    $id('mtvCrateOpen')?.addEventListener('click', () => sfx.crate());
  }

  function wireEvents() {
    // Browsers only start Web Audio after a tap or key press.
    const unlock = () => sfx.unlock();
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);

    $id('boostDirection')?.addEventListener('click', event => {
      const option = event.target.closest('[data-direction]');
      if (option && Object.hasOwn(DIRECTIONS, option.dataset.direction)) {
        bstate.direction = option.dataset.direction;
        persist();
        renderDirectionPicker();
        return;
      }
      if (event.target.closest('#boostSfxToggle')) {
        bstate.sfx = !bstate.sfx;
        persist();
        renderDirectionPicker();
        if (bstate.sfx) sfx.correct(1);
      }
    });
    $id('boostDirection')?.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const keys = Object.keys(DIRECTIONS);
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const index = (keys.indexOf(bstate.direction) + step + keys.length) % keys.length;
      bstate.direction = keys[index];
      persist();
      renderDirectionPicker();
      document.querySelector(`[data-direction="${keys[index]}"]`)?.focus();
      event.preventDefault();
    });
    $id('boostNextDeploy')?.addEventListener('click', event => deploy(event.currentTarget.dataset.mode));

    window.addEventListener('storage', event => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      loadState();
      if (ready) {
        renderDirectionPicker();
        renderStartCard();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Self tests                                                          */
  /* ------------------------------------------------------------------ */

  function runBoostSelfTests() {
    const tests = [];
    const test = (name, fn) => {
      try { tests.push({ name, ok: Boolean(fn()) }); } catch (error) { tests.push({ name, ok: false, error: String(error) }); }
    };
    test('Word families are detected', () =>
      sharesWordFamily('careful', 'carefully') && sharesWordFamily('memory', 'memorize') && !sharesWordFamily('continue', 'contain'));
    test('Prompt masks a quoted answer', () =>
      maskedPrompt({ english: 'call', shortMeaning: '《call A B》AをBと呼ぶ' }) === '《～ A B》AをBと呼ぶ');
    test('A synonym never becomes a Japanese → English distractor', () =>
      !isJaEnDistractorOk({ english: 'error', shortMeaning: '誤り' }, { english: 'mistake', shortMeaning: '誤り' }));
    test('Fixed directions roll as chosen', () => {
      const saved = bstate.direction;
      bstate.direction = 'ja-en';
      const reverse = forcedEnJa() ? true : rollDirection() === 'ja-en';
      bstate.direction = 'en-ja';
      const forward = rollDirection() === 'en-ja';
      bstate.direction = 'mix';
      const mixed = forcedEnJa() || (rollDirection(() => .1) === 'ja-en' && rollDirection(() => .9) === 'en-ja');
      bstate.direction = saved;
      return reverse && forward && mixed;
    });
    test('Japanese → English choices stay safe on the active list', () => {
      if (senseList.length < 12) return true;
      const savedPending = pendingDirection;
      const savedPref = bstate.direction;
      bstate.direction = 'ja-en';
      let ok = true;
      for (const target of senseList.slice(0, 4)) {
        pendingDirection = 'ja-en';
        const choices = buildChoices(target);
        if (choices && pendingDirection === 'ja-en' && !isJaEnSafe(choices, target)) ok = false;
        if (choices && choices.filter(choice => choice.isCorrect).length !== 1) ok = false;
      }
      pendingDirection = savedPending;
      bstate.direction = savedPref;
      return ok;
    });
    test('Conquest level matches the motivation map', () =>
      conquestLevel({ shownCount: 3, currentCorrectStreak: 3, masteryLevel: 3 }) === 3
      && conquestLevel({ shownCount: 3, lastWasIncorrect: true }) === 1
      && conquestLevel({ shownCount: 0 }) === 0);
    test('Goals are sorted nearest first', () => {
      const goals = nextGoals({ maxCombo: 0 });
      return goals.every((goal, index) => index === 0 || goals[index - 1].ratio >= goal.ratio);
    });
    test('Saved state survives normalization', () => {
      const raw = normalizeState({ direction: 'mix', sfx: false, records: { combo: 12 }, totals: { answers: 3, correct: 9 } });
      return raw.direction === 'mix' && raw.sfx === false && raw.records.combo === 12 && raw.totals.correct === 3;
    });
    const passed = tests.filter(item => item.ok).length;
    console.group(`WORD FRONTLINE Boost tests: ${passed}/${tests.length}`);
    for (const item of tests) (item.ok ? console.log : console.warn)(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` (${item.error})` : ''}`);
    console.groupEnd();
    return tests;
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  loadState();
  installHooks();
  injectInterface();

  document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    watchResults();
    watchCelebrations();
    ready = true;
    renderDirectionPicker();
    renderStartCard();
    runBoostSelfTests();
    document.documentElement.dataset.studyPlusBoost = BOOST_VERSION;
  });

  window.WordFrontlineBoost = Object.freeze({
    version: BOOST_VERSION,
    reverseBonusXp: REVERSE_BONUS_XP,
    // Direction of the question on screen (read while an answer is scored).
    answerDirection: () => activeDirection,
    // Direction the next question was built for (sent to online guests).
    pendingDirection: () => pendingDirection || 'en-ja',
    // Online guests follow the host's direction for the next question.
    useDirection: direction => {
      pendingDirection = direction === 'ja-en' ? 'ja-en' : 'en-ja';
    },
    preference: () => bstate.direction,
    records: () => ({ ...bstate.records }),
    totals: () => ({ ...bstate.totals }),
    recommendation: () => ({ ...recommendation() }),
    nextGoals: () => nextGoals().map(goal => ({ ...goal })),
    runSelfTests: runBoostSelfTests
  });
})();
