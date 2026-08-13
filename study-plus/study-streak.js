/* Shared learning-day streak for the word game and the hidden listening lab. */
'use strict';

(() => {
  const STORAGE_KEY = 'wordFrontline:study-plus:streak:v1';
  const DAY_MS = 86_400_000;
  let memoryValue = '';
  const listeners = new Set();

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dayNumber(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!match) return Number.NaN;
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
  }

  function differenceInDays(laterKey, earlierKey) {
    const later = dayNumber(laterKey);
    const earlier = dayNumber(earlierKey);
    return Number.isFinite(later) && Number.isFinite(earlier) ? later - earlier : Number.NaN;
  }

  function blankState() {
    return {
      schemaVersion: 1,
      lastQualifiedDate: '',
      currentStreakDays: 0,
      longestStreakDays: 0,
      totalLearningDays: 0,
      today: { date: '', attempts: 0, correct: 0 },
      recentDates: []
    };
  }

  function normalize(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    const nonNegative = value => Math.max(0, Math.floor(Number(value) || 0));
    return {
      ...base,
      lastQualifiedDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.lastQualifiedDate || '')
        ? raw.lastQualifiedDate
        : '',
      currentStreakDays: nonNegative(raw.currentStreakDays),
      longestStreakDays: nonNegative(raw.longestStreakDays),
      totalLearningDays: nonNegative(raw.totalLearningDays),
      today: {
        date: /^\d{4}-\d{2}-\d{2}$/.test(raw.today?.date || '') ? raw.today.date : '',
        attempts: nonNegative(raw.today?.attempts),
        correct: nonNegative(raw.today?.correct)
      },
      recentDates: Array.isArray(raw.recentDates)
        ? [...new Set(raw.recentDates.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].slice(-45)
        : []
    };
  }

  function read() {
    let raw = memoryValue;
    try {
      raw = localStorage.getItem(STORAGE_KEY) || '';
    } catch {}
    try {
      return normalize(raw ? JSON.parse(raw) : null);
    } catch {
      return blankState();
    }
  }

  function write(state) {
    const normalized = normalize(state);
    const serialized = JSON.stringify(normalized);
    memoryValue = serialized;
    try { localStorage.setItem(STORAGE_KEY, serialized); } catch {}
    for (const listener of listeners) {
      try { listener(normalized); } catch (error) { console.warn(error); }
    }
    return normalized;
  }

  function status(date = new Date()) {
    const state = read();
    const todayKey = localDateKey(date);
    const gap = differenceInDays(todayKey, state.lastQualifiedDate);
    if (state.lastQualifiedDate && (gap > 1 || gap < 0)) {
      state.currentStreakDays = 0;
      if (state.today.date !== todayKey) {
        state.today = { date: todayKey, attempts: 0, correct: 0 };
      }
      return write(state);
    }
    if (state.today.date !== todayKey) {
      state.today = { date: todayKey, attempts: 0, correct: 0 };
      return write(state);
    }
    return state;
  }

  function record({ date = new Date(), correct = false } = {}) {
    const todayKey = localDateKey(date);
    const state = read();
    const gap = differenceInDays(todayKey, state.lastQualifiedDate);
    const isFirstActivityToday = state.lastQualifiedDate !== todayKey;

    if (isFirstActivityToday) {
      state.currentStreakDays = gap === 1 && state.currentStreakDays > 0
        ? state.currentStreakDays + 1
        : 1;
      state.lastQualifiedDate = todayKey;
      state.longestStreakDays = Math.max(state.longestStreakDays, state.currentStreakDays);
      state.totalLearningDays += 1;
      state.recentDates = [...new Set([...state.recentDates, todayKey])].slice(-45);
      state.today = { date: todayKey, attempts: 0, correct: 0 };
    } else if (state.today.date !== todayKey) {
      state.today = { date: todayKey, attempts: 0, correct: 0 };
    }

    state.today.attempts += 1;
    if (correct) state.today.correct += 1;
    return write(state);
  }

  function clear() {
    memoryValue = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return write(blankState());
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function runSelfTests() {
    const checks = [];
    const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });
    check('local date key', localDateKey(new Date(2026, 7, 13, 23, 59)) === '2026-08-13');
    check('next-day difference', differenceInDays('2026-08-14', '2026-08-13') === 1);
    check('month boundary difference', differenceInDays('2026-09-01', '2026-08-31') === 1);
    check('leap-day difference', differenceInDays('2028-03-01', '2028-02-29') === 1);
    return checks;
  }

  window.addEventListener?.('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = status();
    for (const listener of listeners) listener(next);
  });

  window.WordFrontlineStreak = Object.freeze({
    STORAGE_KEY,
    localDateKey,
    differenceInDays,
    status,
    record,
    clear,
    subscribe,
    runSelfTests
  });
})();
