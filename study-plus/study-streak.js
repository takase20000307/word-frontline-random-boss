/* Shared learning-day streak for the word game and the hidden listening lab. */
'use strict';

(() => {
  const STORAGE_KEY = 'wordFrontline:study-plus:streak:v1';
  const DAY_MS = 86_400_000;
  // A 7-day streak earns one insurance ticket. Up to two can be held, and a
  // ticket is spent automatically for each fully missed day.
  const TICKET_EVERY_DAYS = 7;
  const MAX_TICKETS = 2;
  const HISTORY_DAYS = 60;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  let memoryValue = '';
  // When a write fails (e.g. storage full) the in-memory copy is newer than
  // what getItem returns, so read() must keep using it.
  let writeFailed = false;
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

  function keyFromDayNumber(number) {
    const date = new Date(number * DAY_MS);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function shiftDateKey(key, days) {
    const number = dayNumber(key);
    return Number.isFinite(number) ? keyFromDayNumber(number + days) : '';
  }

  function differenceInDays(laterKey, earlierKey) {
    const later = dayNumber(laterKey);
    const earlier = dayNumber(earlierKey);
    return Number.isFinite(later) && Number.isFinite(earlier) ? later - earlier : Number.NaN;
  }

  function blankState() {
    return {
      schemaVersion: 2,
      lastQualifiedDate: '',
      currentStreakDays: 0,
      longestStreakDays: 0,
      totalLearningDays: 0,
      today: { date: '', attempts: 0, correct: 0 },
      recentDates: [],
      freezeTickets: 0,
      ticketMilestone: 0,
      frozenDates: [],
      history: {},
      notices: []
    };
  }

  function normalize(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    const nonNegative = value => Math.max(0, Math.floor(Number(value) || 0));
    const dateList = (list, limit) => Array.isArray(list)
      ? [...new Set(list.filter(value => DATE_PATTERN.test(value)))].slice(-limit)
      : [];
    const history = {};
    if (raw.history && typeof raw.history === 'object') {
      const keys = Object.keys(raw.history).filter(key => DATE_PATTERN.test(key)).sort().slice(-HISTORY_DAYS);
      for (const key of keys) {
        history[key] = {
          a: nonNegative(raw.history[key]?.a),
          c: nonNegative(raw.history[key]?.c)
        };
      }
    } else if (DATE_PATTERN.test(raw.today?.date || '') && nonNegative(raw.today?.attempts) > 0) {
      // Data saved before daily history existed: keep today's count.
      history[raw.today.date] = {
        a: nonNegative(raw.today.attempts),
        c: nonNegative(raw.today.correct)
      };
    }
    return {
      ...base,
      lastQualifiedDate: DATE_PATTERN.test(raw.lastQualifiedDate || '') ? raw.lastQualifiedDate : '',
      currentStreakDays: nonNegative(raw.currentStreakDays),
      longestStreakDays: nonNegative(raw.longestStreakDays),
      totalLearningDays: nonNegative(raw.totalLearningDays),
      today: {
        date: DATE_PATTERN.test(raw.today?.date || '') ? raw.today.date : '',
        attempts: nonNegative(raw.today?.attempts),
        correct: nonNegative(raw.today?.correct)
      },
      recentDates: dateList(raw.recentDates, 45),
      freezeTickets: Math.min(MAX_TICKETS, nonNegative(raw.freezeTickets)),
      ticketMilestone: nonNegative(raw.ticketMilestone),
      frozenDates: dateList(raw.frozenDates, 45),
      history,
      notices: Array.isArray(raw.notices)
        ? raw.notices.filter(notice => notice && typeof notice.type === 'string').slice(-6)
        : []
    };
  }

  function read() {
    let raw = memoryValue;
    if (!writeFailed) {
      try {
        raw = localStorage.getItem(STORAGE_KEY) || '';
      } catch {}
    }
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
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      writeFailed = false;
    } catch {
      writeFailed = true;
    }
    for (const listener of listeners) {
      try { listener(normalized); } catch (error) { console.warn(error); }
    }
    return normalized;
  }

  // Brings a stored state up to date for `todayKey`. Missed days are covered
  // by tickets when enough are held; otherwise the streak resets to 0 and the
  // tickets are kept for the next streak. A last study date in the future
  // (device clock moved) is left alone so a wrong clock cannot wipe the
  // streak. Returns true when anything changed.
  function reconcile(state, todayKey) {
    let changed = false;
    const gap = differenceInDays(todayKey, state.lastQualifiedDate);
    if (state.lastQualifiedDate && gap > 1) {
      const missed = gap - 1;
      if (state.currentStreakDays > 0 && state.freezeTickets >= missed) {
        const missedDates = [];
        for (let offset = 1; offset <= missed; offset++) {
          missedDates.push(shiftDateKey(state.lastQualifiedDate, offset));
        }
        state.freezeTickets -= missed;
        state.frozenDates = [...new Set([...state.frozenDates, ...missedDates])].slice(-45);
        state.lastQualifiedDate = shiftDateKey(todayKey, -1);
        state.notices = [...state.notices, {
          type: 'ticket-used',
          count: missed,
          dates: missedDates,
          streak: state.currentStreakDays,
          tickets: state.freezeTickets
        }].slice(-6);
        changed = true;
      } else if (state.currentStreakDays !== 0) {
        state.currentStreakDays = 0;
        state.ticketMilestone = 0;
        changed = true;
      }
    }
    if (state.today.date !== todayKey) {
      state.today = { date: todayKey, attempts: 0, correct: 0 };
      changed = true;
    }
    return changed;
  }

  function applyRecord(state, todayKey, correct) {
    reconcile(state, todayKey);
    const gap = differenceInDays(todayKey, state.lastQualifiedDate);
    // gap <= 0 means today (or a day before a future-dated record) is
    // already counted.
    const isFirstActivityToday = !state.lastQualifiedDate || !(gap <= 0);

    if (isFirstActivityToday) {
      state.currentStreakDays = gap === 1 && state.currentStreakDays > 0
        ? state.currentStreakDays + 1
        : 1;
      if (state.currentStreakDays === 1) state.ticketMilestone = 0;
      state.lastQualifiedDate = todayKey;
      state.longestStreakDays = Math.max(state.longestStreakDays, state.currentStreakDays);
      state.totalLearningDays += 1;
      state.recentDates = [...new Set([...state.recentDates, todayKey])].slice(-45);
      state.today = { date: todayKey, attempts: 0, correct: 0 };

      if (
        state.currentStreakDays % TICKET_EVERY_DAYS === 0
        && state.currentStreakDays > state.ticketMilestone
      ) {
        state.ticketMilestone = state.currentStreakDays;
        if (state.freezeTickets < MAX_TICKETS) {
          state.freezeTickets += 1;
          state.notices = [...state.notices, {
            type: 'ticket-earned',
            streak: state.currentStreakDays,
            tickets: state.freezeTickets
          }].slice(-6);
        } else {
          state.notices = [...state.notices, {
            type: 'ticket-full',
            streak: state.currentStreakDays,
            tickets: state.freezeTickets
          }].slice(-6);
        }
      }
    }

    state.today.attempts += 1;
    if (correct) state.today.correct += 1;
    const day = state.history[todayKey] || { a: 0, c: 0 };
    day.a += 1;
    if (correct) day.c += 1;
    state.history[todayKey] = day;
    const keys = Object.keys(state.history).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - HISTORY_DAYS))) delete state.history[key];
    return state;
  }

  // Display-only: shows what today looks like without saving. Tickets are
  // only spent by record(), i.e. when the student actually answers.
  function status(date = new Date()) {
    const state = read();
    reconcile(state, localDateKey(date));
    return state;
  }

  function record({ date = new Date(), correct = false } = {}) {
    return write(applyRecord(read(), localDateKey(date), Boolean(correct)));
  }

  // Returns pending ticket notices once, so only one screen announces them.
  function takeNotices() {
    const state = read();
    if (!state.notices.length) return [];
    const notices = state.notices;
    state.notices = [];
    write(state);
    return notices;
  }

  function clear() {
    memoryValue = '';
    writeFailed = false;
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
    check('date shift crosses months', shiftDateKey('2026-08-31', 1) === '2026-09-01');

    const days = (start, count) => Array.from({ length: count }, (_, index) => shiftDateKey(start, index));
    const run = (state, keys) => {
      for (const key of keys) applyRecord(state, key, true);
      return state;
    };

    const week = run(blankState(), days('2026-08-01', 7));
    check('seven straight days earn one ticket', week.currentStreakDays === 7 && week.freezeTickets === 1);
    applyRecord(week, '2026-08-09', true);
    check('a missed day spends a ticket and keeps the streak',
      week.currentStreakDays === 8 && week.freezeTickets === 0 && week.frozenDates.includes('2026-08-08'));

    const short = run(blankState(), days('2026-08-01', 3));
    applyRecord(short, '2026-08-05', true);
    check('a missed day without a ticket restarts at day 1', short.currentStreakDays === 1);

    const long = run(blankState(), days('2026-08-01', 21));
    check('tickets are capped at two', long.freezeTickets === MAX_TICKETS);
    applyRecord(long, '2026-08-24', true);
    check('two missed days spend two tickets', long.currentStreakDays === 22 && long.freezeTickets === 0);

    const partial = run(blankState(), days('2026-08-01', 7));
    applyRecord(partial, '2026-08-10', true);
    check('too few tickets restarts the streak but keeps the ticket',
      partial.currentStreakDays === 1 && partial.freezeTickets === 1);

    const status0 = run(blankState(), days('2026-08-01', 2));
    reconcile(status0, '2026-08-05');
    check('opening the page after a gap shows 0 days', status0.currentStreakDays === 0);

    const back = run(blankState(), days('2026-08-01', 20));
    applyRecord(back, '2026-07-31', true);
    applyRecord(back, '2026-08-21', true);
    check('a clock set back keeps the streak', back.currentStreakDays === 21);

    const ahead = run(blankState(), days('2026-08-01', 5));
    applyRecord(ahead, '2026-08-09', true);
    applyRecord(ahead, '2026-08-06', true);
    reconcile(ahead, '2026-08-06');
    check('a clock moved ahead and back does not reset to 0', ahead.currentStreakDays >= 1 && ahead.lastQualifiedDate === '2026-08-09');

    const legacy = normalize({ lastQualifiedDate: '2026-08-01', currentStreakDays: 3, today: { date: '2026-08-01', attempts: 40, correct: 30 } });
    check('old saves keep today\'s answer count in history', legacy.history['2026-08-01']?.a === 40);

    const daily = blankState();
    applyRecord(daily, '2026-08-01', true);
    applyRecord(daily, '2026-08-01', false);
    check('daily history counts every answer', daily.history['2026-08-01']?.a === 2 && daily.history['2026-08-01']?.c === 1);
    return checks;
  }

  window.addEventListener?.('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = status();
    for (const listener of listeners) listener(next);
  });

  window.WordFrontlineStreak = Object.freeze({
    STORAGE_KEY,
    MAX_TICKETS,
    TICKET_EVERY_DAYS,
    localDateKey,
    differenceInDays,
    shiftDateKey,
    status,
    record,
    takeNotices,
    clear,
    subscribe,
    runSelfTests
  });
})();
