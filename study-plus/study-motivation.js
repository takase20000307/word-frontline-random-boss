/*
 * WORD FRONTLINE Study Plus: motivation layer
 *
 * Adds long-term reasons to keep playing on top of the existing game:
 *   A. conquest map with test countdown, military ranks
 *   B. supply crates with cosmetics, word card collection, daily missions
 *   C. daily goals (bronze/silver/gold), weekly report card image
 *   D. ghost battles against your own record from about a week ago
 *
 * Everything is stored in this browser only, under its own storage key.
 * The streak insurance tickets live in study-streak.js.
 */
'use strict';

(() => {
  const MOTIVATION_VERSION = '1.1.0';
  const STORAGE_KEY = 'wordFrontline:study-plus:motivation:v1';
  const streak = window.WordFrontlineStreak;
  const plus = window.WordFrontlinePlus;
  const update = window.WordFrontlineUpdate;
  const data = window.WordFrontlineData;

  if (typeof updateWordStats !== 'function' || !streak || !plus) {
    console.error('Study Plus motivation layer could not start.');
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Tunable numbers                                                     */
  /* ------------------------------------------------------------------ */

  const RANKS = Object.freeze([
    { name: '二等兵', xp: 0 },
    { name: '一等兵', xp: 300 },
    { name: '上等兵', xp: 1000 },
    { name: '兵長', xp: 2000 },
    { name: '伍長', xp: 3500 },
    { name: '軍曹', xp: 5500 },
    { name: '曹長', xp: 8000 },
    { name: '准尉', xp: 11000 },
    { name: '少尉', xp: 15000 },
    { name: '中尉', xp: 20000 },
    { name: '大尉', xp: 26000 },
    { name: '少佐', xp: 33000 },
    { name: '中佐', xp: 41000 },
    { name: '大佐', xp: 50000 },
    { name: '准将', xp: 60000 },
    { name: '少将', xp: 72000 },
    { name: '中将', xp: 86000 },
    { name: '大将', xp: 102000 },
    { name: '元帥', xp: 120000 }
  ]);

  const XP = Object.freeze({
    correct: 10,
    weakBonus: 10,
    // Wrong answers earn nothing: otherwise tapping wrong fast in a rapid run
    // earns XP (and rank-up crates) faster than studying.
    incorrect: 0,
    bossPhase: 30,
    // A word missed earlier in the same run and answered correctly later
    // (re-asks, weakness boss) pays little, so missing on purpose never pays.
    freshReview: 3,
    newCard: 20,
    goldCard: 50,
    stageClear: 50,
    gameOver: 10,
    runClear: 120,
    pairMatch: 40,
    silver: 50,
    gold: 100,
    mission: 80,
    ghostWin: 60
  });

  const DROP = Object.freeze({
    correct: .008,
    weakDefeat: .06,
    bossPhase: .15,
    stageNoSweep: .4,
    ghostWin: .3,
    pairLoss: .25
  });

  const RARITIES = Object.freeze([
    { id: 'common', label: 'コモン', color: '#9fc3d8', duplicateXp: 30 },
    { id: 'rare', label: 'レア', color: '#4fa8ff', duplicateXp: 60 },
    { id: 'epic', label: 'エピック', color: '#c77dff', duplicateXp: 120 },
    { id: 'legend', label: 'レジェンド', color: '#ffd166', duplicateXp: 250 }
  ]);

  // Rarity odds (common, rare, epic, legend) for each crate grade.
  const CRATE_GRADES = Object.freeze({
    base: { label: '補給箱', odds: [60, 28, 10, 2] },
    boosted: { label: '強化補給箱', odds: [30, 42, 22, 6] },
    premium: { label: '特別補給箱', odds: [0, 50, 38, 12] }
  });
  const PITY_LIMIT = 14;

  // goldFallbackCorrect counts first-time correct answers (not re-asks of a
  // word missed in the same run).
  const DAILY = Object.freeze({ silverAttempts: 20, goldWeakDefeats: 5, goldFallbackCorrect: 50 });
  const MISSION_CLEAR_ACCURACY = 70;
  const MILESTONES = Object.freeze([25, 50, 75, 100]);
  // Milestone crates need a real-sized list (the smallest test range is 42).
  const MILESTONE_MIN_WORDS = 40;
  const CUSTOM_KEYS_KEPT = 10;
  const BATTLE_DAYS_KEPT = 21;
  const BATTLES_PER_DAY_GROUP = 3;
  const GHOST_MIN_ATTEMPTS = 8;
  const GHOST_REWARDS_PER_DAY = 3;
  const PAIR_FULL_ROUNDS = 10;
  const RUN_CRATE_MIN_ACCURACY = 50;
  // Short runs (e.g. a weak-word run with only a few words) earn a share of
  // the full completion reward so they cannot be repeated for free crates.
  const FULL_RUN_ATTEMPTS = 20;

  const SOURCE_LABELS = Object.freeze({
    drop: '戦闘中の拾得',
    weak: '苦手撃破',
    boss: 'ボス撃破',
    sweep: 'ボス完全撃破',
    stage: 'ステージクリア',
    run: '一斉学習 完走',
    perfect: 'ノーミス完走',
    pair: 'オンライン対戦',
    daily: '今日の目標「金」',
    mission: '本日の作戦クリア',
    rank: '昇進祝い',
    milestone: '図鑑の達成報酬',
    ghost: 'ゴースト戦勝利'
  });

  /* ------------------------------------------------------------------ */
  /* Cosmetic catalog                                                    */
  /* ------------------------------------------------------------------ */

  const ITEM_TYPES = Object.freeze({
    title: { label: '称号', icon: '🎖️' },
    emblem: { label: '紋章', icon: '🛡️' },
    color: { label: '部隊カラー', icon: '🎨' },
    theme: { label: '戦場テーマ', icon: '🗺️' }
  });

  const SQUAD_COLORS = {
    standard: { main: '#198be8', lead: '#8ff4ff', stroke: '#93e9ff' },
    emerald: { main: '#18b97a', lead: '#a6ffd9', stroke: '#7dffc8' },
    crimson: { main: '#d83a4a', lead: '#ffb3b9', stroke: '#ff8a96' },
    sand: { main: '#c7963f', lead: '#ffe1a6', stroke: '#f2c879' },
    violet: { main: '#8a4dff', lead: '#e2ccff', stroke: '#c3a2ff' },
    snow: { main: '#dfe9f2', lead: '#ffffff', stroke: '#ffffff' },
    sunset: { main: '#ff7a3d', lead: '#ffd2a8', stroke: '#ffb184' },
    neon: { main: '#00ffd0', lead: '#ff4dff', stroke: '#7dfff0' },
    shadow: { main: '#2b2f45', lead: '#9aa7ff', stroke: '#6c78d8' },
    gold: { main: '#ffbf1f', lead: '#fff2b3', stroke: '#ffe27a', glow: '#ffd166' },
    rainbow: { main: '#ff4d6d', lead: '#ffffff', stroke: '#ffffff', rainbow: true }
  };

  const THEMES = {
    night: {
      sky: ['#102b40', '#071421', '#02070d'], side: '#071018', road: ['#1a2a36', '#0b1824'],
      edge: '#5a9abb55', lane: '#88ccea35', cross: '#80b8d312', container: ['#1d607d', '#52b9dc'],
      barrier: ['#8c512b', '#ffd166'], bridge: '#28475c', swatch: '#102b40'
    },
    desert: {
      sky: ['#f0b56a', '#c97a3d', '#5a3420'], side: '#6e4426', road: ['#b08350', '#7a5532'],
      edge: '#ffe0a855', lane: '#fff2cf55', cross: '#ffe6b822', container: ['#9a6a3a', '#e8c48a'],
      barrier: ['#7a3e1d', '#ffd28a'], bridge: '#5d3b22', swatch: '#c97a3d'
    },
    forest: {
      sky: ['#2d5a3d', '#173524', '#08160e'], side: '#0b2214', road: ['#33402f', '#1b2618'],
      edge: '#8fd18f55', lane: '#c4f0b035', cross: '#a8e0a018', container: ['#2f6b3a', '#7fd18b'],
      barrier: ['#5b3b1e', '#d9b36a'], bridge: '#244a2c', swatch: '#2d5a3d'
    },
    sunset: {
      sky: ['#ff8a5c', '#9b3a6b', '#2a1036'], side: '#2b1430', road: ['#4a2a44', '#25142a'],
      edge: '#ffb38a66', lane: '#ffd0b045', cross: '#ffc09a1a', container: ['#7a2f5a', '#ff9ac0'],
      barrier: ['#6a2a1a', '#ffcf70'], bridge: '#4b2040', swatch: '#9b3a6b'
    },
    snow: {
      sky: ['#b9d3e8', '#7e9fbd', '#3b5470'], side: '#c9d9e6', road: ['#9fb6c9', '#6f879c'],
      edge: '#ffffff88', lane: '#ffffff66', cross: '#ffffff22', container: ['#4f7896', '#d8f0ff'],
      barrier: ['#8a5a3a', '#fff1c9'], bridge: '#7d93a8', fx: 'snow', swatch: '#7e9fbd'
    },
    sakura: {
      sky: ['#ffc4d8', '#d97aa3', '#4a2340'], side: '#3a1f33', road: ['#6b4560', '#3b2236'],
      edge: '#ffd1e366', lane: '#ffe6f055', cross: '#ffd8e61c', container: ['#9b4a72', '#ffc2dc'],
      barrier: ['#6b3a2a', '#ffe2a8'], bridge: '#5a2f4c', fx: 'petals', swatch: '#d97aa3'
    },
    volcano: {
      sky: ['#5a0f0a', '#2a0805', '#0d0302'], side: '#1a0705', road: ['#3a1a14', '#1c0b08'],
      edge: '#ff6a3d66', lane: '#ff9a6a40', cross: '#ff6a3d18', container: ['#5a1f14', '#ff7a4d'],
      barrier: ['#3a1a0a', '#ffb347'], bridge: '#3a120c', fx: 'embers', swatch: '#5a0f0a'
    },
    space: {
      sky: ['#0b0630', '#05021a', '#000006'], side: '#06031a', road: ['#1a1640', '#0a0820'],
      edge: '#9a8cff66', lane: '#c6b8ff40', cross: '#a89cff16', container: ['#2a2470', '#9a8cff'],
      barrier: ['#3a2a6a', '#ffd6ff'], bridge: '#231c55', fx: 'stars', swatch: '#0b0630'
    }
  };

  const ITEMS = Object.freeze([
    // Defaults are owned from the start and never drop from crates.
    { id: 'title-none', type: 'title', name: '称号なし', value: '', rarity: 'common', starter: true },
    { id: 'emblem-star', type: 'emblem', name: '星', value: '⭐', rarity: 'common', starter: true },
    { id: 'color-standard', type: 'color', name: 'スタンダード', value: 'standard', rarity: 'common', starter: true },
    { id: 'theme-night', type: 'theme', name: '夜間前線', value: 'night', rarity: 'common', starter: true },

    ...[
      ['rookie', '新米の'], ['diligent', '勤勉な'], ['tenacious', '粘り強い'], ['early', '早起きの'],
      ['calm', '冷静な'], ['lively', '元気な'], ['steady', '堅実な'], ['swift', '素早い'],
      ['careful', '慎重な'], ['earnest', 'まじめな']
    ].map(([id, value]) => ({ id: `title-${id}`, type: 'title', name: value, value, rarity: 'common' })),
    ...[
      ['unyielding', '不屈の'], ['gale', '疾風の'], ['ironwall', '鉄壁の'], ['dawn', '暁の'],
      ['azure', '蒼き'], ['crimson', '紅蓮の'], ['veteran', '百戦錬磨の'], ['striver', '努力家の']
    ].map(([id, value]) => ({ id: `title-${id}`, type: 'title', name: value, value, rarity: 'rare' })),
    ...[
      ['thunder', '雷鳴の'], ['thousand', '千語の'], ['stargazer', '星詠みの'], ['silverwing', '銀翼の'],
      ['genius', '天才']
    ].map(([id, value]) => ({ id: `title-${id}`, type: 'title', name: value, value, rarity: 'epic' })),
    ...[
      ['master', '英単語の覇者'], ['hero', '前線の英雄'], ['golden', '黄金の'], ['eternal', '永遠の挑戦者']
    ].map(([id, value]) => ({ id: `title-${id}`, type: 'title', name: value, value, rarity: 'legend' })),

    ...[
      ['shield', '盾', '🛡️', 'common'], ['target', '標的', '🎯', 'common'], ['clover', '四つ葉', '🍀', 'common'],
      ['moon', '三日月', '🌙', 'common'], ['book', '辞書', '📘', 'common'], ['dolphin', 'イルカ', '🐬', 'common'],
      ['swords', '双剣', '⚔️', 'rare'], ['eagle', '鷲', '🦅', 'rare'], ['wolf', '狼', '🐺', 'rare'],
      ['bolt', '稲妻', '⚡', 'rare'], ['crystal', '雪の結晶', '❄️', 'rare'], ['blossom', '桜', '🌸', 'rare'],
      ['lion', '獅子', '🦁', 'epic'], ['flame', '炎', '🔥', 'epic'], ['rocket', 'ロケット', '🚀', 'epic'],
      ['diamond', 'ダイヤ', '💎', 'epic'], ['dragon', '竜', '🐉', 'legend'], ['crown', '王冠', '👑', 'legend']
    ].map(([id, name, value, rarity]) => ({ id: `emblem-${id}`, type: 'emblem', name, value, rarity })),

    ...[
      ['emerald', 'エメラルド', 'common'], ['crimson', 'クリムゾン', 'common'], ['sand', 'サンド', 'common'],
      ['violet', 'バイオレット', 'rare'], ['snow', 'スノー', 'rare'], ['sunset', 'サンセット', 'rare'],
      ['neon', 'ネオン', 'epic'], ['shadow', 'シャドウ', 'epic'],
      ['gold', 'ゴールド', 'legend'], ['rainbow', 'レインボー', 'legend']
    ].map(([value, name, rarity]) => ({ id: `color-${value}`, type: 'color', name, value, rarity })),

    ...[
      ['desert', '砂漠', 'common'], ['forest', '森林', 'common'],
      ['sunset', '夕焼け', 'rare'], ['snow', '雪原', 'rare'],
      ['sakura', '桜並木', 'epic'], ['volcano', '火山', 'epic'],
      ['space', '宇宙', 'legend']
    ].map(([value, name, rarity]) => ({ id: `theme-${value}`, type: 'theme', name, value, rarity }))
  ]);

  const ITEM_BY_ID = new Map(ITEMS.map(item => [item.id, item]));
  const CRATE_ITEMS = ITEMS.filter(item => !item.starter);
  const DEFAULT_EQUIPPED = Object.freeze({
    title: 'title-none',
    emblem: 'emblem-star',
    color: 'color-standard',
    theme: 'theme-night'
  });

  /* ------------------------------------------------------------------ */
  /* Daily missions                                                      */
  /* ------------------------------------------------------------------ */

  // Official data uses full names (他動詞／名詞); lists in the classic format
  // use short tags (他・自, 名, 形, 副).
  const posText = sense => String(sense.pos || '');
  const isVerbSense = sense => /(^|[^助])動詞|(?:^|[・／/、,])(?:他|自|動)(?:$|[・／/、,])/.test(posText(sense));
  const isNounSense = sense => /名詞|(?:^|[・／/、,])名(?:$|[・／/、,])/.test(posText(sense));
  const isAdjAdvSense = sense => /形容詞|副詞|(?:^|[・／/、,])(?:形|副)(?:$|[・／/、,])/.test(posText(sense));
  const hasPosInfo = sense => Boolean(posText(sense).trim()) && posText(sense).trim() !== '語';
  const MISSIONS = Object.freeze([
    { id: 'verb', name: '動詞作戦', icon: '⚙️', rule: '動詞だけが出題される', filter: isVerbSense, needsPos: true },
    { id: 'blitz', name: '電撃戦', icon: '⚡', rule: '制限時間が約6割。素早く答えろ', time: .6, enemy: 1.25 },
    { id: 'noun', name: '名詞作戦', icon: '🧱', rule: '名詞だけが出題される', filter: isNounSense, needsPos: true },
    { id: 'listen', name: '聴音作戦', icon: '🎧', rule: '英単語が隠れる。音声だけで意味を当てろ', listen: true, time: 1.15 },
    { id: 'adj', name: '形容詞・副詞作戦', icon: '🎨', rule: '形容詞・副詞だけが出題される', filter: isAdjAdvSense, needsPos: true },
    {
      id: 'sweep', name: '弱点掃討戦', icon: '🧹', rule: '苦手・覚えかけの単語だけが出題される',
      filter: sense => {
        const stats = save.progress[sense.senseId];
        return Boolean(stats && stats.shownCount > 0 && (stats.lastWasIncorrect || stats.masteryLevel < 3));
      }
    },
    { id: 'elite', name: '精鋭撃破戦', icon: '💀', rule: '難しい単語だけが出題される', elite: true },
    {
      id: 'scout', name: '未知領域偵察', icon: '🔭', rule: 'まだ出ていない・覚えかけの単語が中心',
      filter: sense => {
        const stats = save.progress[sense.senseId];
        return !stats || stats.shownCount === 0 || stats.masteryLevel < 3;
      }
    }
  ]);
  const MISSION_MIN_POOL = 16;

  MODES.daily = {
    name: '本日の作戦',
    short: '作戦',
    desc: '毎日ルールが変わる特別ステージ。1日1回クリアで特別補給箱。',
    time: 1,
    enemy: 1
  };

  /* ------------------------------------------------------------------ */
  /* Persistent state                                                    */
  /* ------------------------------------------------------------------ */

  let memoryValue = '';
  let mstate = blankState();
  let session = null;
  let lastSummary = null;
  let dailyPool = null;
  let ready = false;
  const celebrations = [];

  function blankState() {
    return {
      schemaVersion: 1,
      xp: 0,
      rankSeen: 0,
      cards: {},
      crates: [],
      cratesOpened: 0,
      sinceEpic: 0,
      inventory: {},
      equipped: { ...DEFAULT_EQUIPPED },
      daily: { date: '', weakDefeats: 0, weakIds: [], solid: 0, silver: false, gold: false, mission: false },
      log: {},
      battles: [],
      ghost: { wins: 0, losses: 0, draws: 0 },
      milestones: {},
      conquest: {},
      cardsBackfilled: false
    };
  }

  function normalizeState(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const next = { ...base };
    next.xp = count(raw.xp);
    next.rankSeen = Math.min(RANKS.length - 1, count(raw.rankSeen));
    if (raw.cards && typeof raw.cards === 'object') {
      for (const [id, card] of Object.entries(raw.cards)) {
        if (!card || typeof card !== 'object') continue;
        next.cards[id] = {
          t: Math.min(2, Math.max(1, count(card.t))),
          b: count(card.b),
          at: count(card.at),
          g: count(card.g)
        };
      }
    }
    next.crates = Array.isArray(raw.crates)
      ? raw.crates
        .filter(crate => crate && CRATE_GRADES[crate.grade])
        .slice(0, 200)
        .map(crate => ({
          id: String(crate.id || Math.random().toString(36).slice(2)),
          grade: crate.grade,
          source: SOURCE_LABELS[crate.source] ? crate.source : 'drop',
          at: count(crate.at)
        }))
      : [];
    next.cratesOpened = count(raw.cratesOpened);
    next.sinceEpic = count(raw.sinceEpic);
    if (raw.inventory && typeof raw.inventory === 'object') {
      for (const [id, owned] of Object.entries(raw.inventory)) {
        if (ITEM_BY_ID.has(id) && count(owned) > 0) next.inventory[id] = count(owned);
      }
    }
    next.equipped = { ...DEFAULT_EQUIPPED };
    for (const type of Object.keys(DEFAULT_EQUIPPED)) {
      const id = raw.equipped?.[type];
      const item = ITEM_BY_ID.get(id);
      if (item && item.type === type && (item.starter || next.inventory[id])) next.equipped[type] = id;
    }
    const weakIds = Array.isArray(raw.daily?.weakIds)
      ? [...new Set(raw.daily.weakIds.filter(id => typeof id === 'string'))].slice(0, 500)
      : [];
    next.daily = {
      date: isDate(raw.daily?.date) ? raw.daily.date : '',
      weakIds,
      weakDefeats: weakIds.length,
      solid: count(raw.daily?.solid),
      silver: Boolean(raw.daily?.silver),
      gold: Boolean(raw.daily?.gold),
      mission: Boolean(raw.daily?.mission)
    };
    if (raw.log && typeof raw.log === 'object') {
      for (const key of Object.keys(raw.log).filter(isDate).sort().slice(-60)) {
        const day = raw.log[key] || {};
        next.log[key] = {
          a: count(day.a), c: count(day.c), r: count(day.r), b: count(day.b), x: count(day.x),
          w: count(day.w), gw: count(day.gw), gl: count(day.gl),
          bw: Array.isArray(day.bw) ? day.bw.filter(word => typeof word === 'string').slice(-12) : []
        };
      }
    }
    const oldestBattle = shiftKey(todayKey(), -BATTLE_DAYS_KEPT);
    next.battles = Array.isArray(raw.battles)
      ? raw.battles
        .filter(record => record && isDate(record.d) && count(record.a) > 0 && record.d >= oldestBattle)
        .slice(-200)
        .map(record => ({
          d: record.d,
          t: count(record.t),
          m: String(record.m || ''),
          f: String(record.f || 'stage'),
          rid: String(record.rid || ''),
          a: count(record.a),
          c: Math.min(count(record.a), count(record.c)),
          r: count(record.r)
        }))
      : [];
    next.ghost = {
      wins: count(raw.ghost?.wins),
      losses: count(raw.ghost?.losses),
      draws: count(raw.ghost?.draws)
    };
    if (raw.milestones && typeof raw.milestones === 'object') {
      for (const [key, list] of Object.entries(raw.milestones)) {
        if (Array.isArray(list)) next.milestones[key] = list.filter(value => MILESTONES.includes(value));
      }
    }
    if (raw.conquest && typeof raw.conquest === 'object') {
      for (const [key, days] of Object.entries(raw.conquest)) {
        if (!days || typeof days !== 'object') continue;
        next.conquest[key] = {};
        for (const day of Object.keys(days).filter(isDate).sort().slice(-40)) {
          next.conquest[key][day] = count(days[day]);
        }
      }
    }
    next.cardsBackfilled = Boolean(raw.cardsBackfilled);
    return next;
  }

  function loadState() {
    let raw = memoryValue;
    try { raw = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    try {
      mstate = normalizeState(raw ? JSON.parse(raw) : null);
    } catch {
      mstate = blankState();
    }
    return mstate;
  }

  function persist() {
    const serialized = JSON.stringify(mstate);
    memoryValue = serialized;
    try { localStorage.setItem(STORAGE_KEY, serialized); } catch {}
  }

  function clearState() {
    memoryValue = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    mstate = blankState();
    session = null;
    lastSummary = null;
    celebrations.length = 0;
    persist();
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const todayKey = (date = new Date()) => streak.localDateKey(date);
  const shiftKey = (key, days) => streak.shiftDateKey(key, days);
  const daysBetween = (later, earlier) => streak.differenceInDays(later, earlier);
  const esc = value => escapeHtml(value);
  const rarityInfo = id => RARITIES.find(rarity => rarity.id === id) || RARITIES[0];
  const formatNumber = value => Math.round(Number(value) || 0).toLocaleString('ja-JP');

  function dayLog(key = todayKey()) {
    if (!mstate.log[key]) {
      mstate.log[key] = { a: 0, c: 0, r: 0, b: 0, x: 0, w: 0, gw: 0, gl: 0, bw: [] };
      const keys = Object.keys(mstate.log).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete mstate.log[old];
    }
    return mstate.log[key];
  }

  function ensureDaily(key = todayKey()) {
    if (mstate.daily.date !== key) {
      mstate.daily = { date: key, weakDefeats: 0, weakIds: [], solid: 0, silver: false, gold: false, mission: false };
    }
    return mstate.daily;
  }

  function isOfficialSource() {
    return save?.activeWordSource !== 'custom' || !save?.importedWords;
  }

  function currentRange() {
    try { return plus.selectedRange(); } catch { return null; }
  }

  function currentRangeKey() {
    if (isOfficialSource()) return currentRange()?.id || 'official';
    // Each imported list gets its own key, so lists never share milestones.
    return `custom:${hashText(activeSenses().map(sense => sense.senseId).sort().join('|'))}`;
  }

  function pruneCustomKeys(store) {
    const keys = Object.keys(store).filter(key => key.startsWith('custom'));
    for (const key of keys.slice(0, Math.max(0, keys.length - CUSTOM_KEYS_KEPT))) delete store[key];
  }

  function currentRangeLabel() {
    if (!isOfficialSource()) return 'カスタム単語リスト';
    const range = currentRange();
    return range ? `${range.label}（Lesson ${range.lessonStart}–${range.lessonEnd}）` : 'テスト範囲';
  }

  // The full active list, even while a daily mission narrows senseList.
  function activeSenses() {
    return dailyPool?.full || senseList;
  }

  function gameStateIs(...names) {
    return names.some(name => state === GAME_STATE[name]);
  }

  /* ------------------------------------------------------------------ */
  /* Ranks and XP                                                        */
  /* ------------------------------------------------------------------ */

  function rankIndexForXp(xp) {
    let index = 0;
    for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
    return index;
  }

  function rankInfo(xp = mstate.xp) {
    const index = rankIndexForXp(xp);
    const current = RANKS[index];
    const next = RANKS[index + 1] || null;
    const span = next ? next.xp - current.xp : 1;
    return {
      index,
      name: current.name,
      xp,
      floor: current.xp,
      next,
      toNext: next ? next.xp - xp : 0,
      progress: next ? Math.min(1, Math.max(0, (xp - current.xp) / span)) : 1
    };
  }

  function equippedItem(type) {
    return ITEM_BY_ID.get(mstate.equipped[type]) || ITEM_BY_ID.get(DEFAULT_EQUIPPED[type]);
  }

  function displayName(info = rankInfo()) {
    const title = equippedItem('title')?.value || '';
    return title ? `${title} ${info.name}` : info.name;
  }

  function addXp(amount, reason = '') {
    const value = Math.max(0, Math.round(amount));
    if (!value) return 0;
    const before = rankIndexForXp(mstate.xp);
    mstate.xp += value;
    dayLog().x += value;
    if (session) session.xp += value;
    const after = rankIndexForXp(mstate.xp);
    if (after > mstate.rankSeen) {
      for (let index = Math.max(before, mstate.rankSeen) + 1; index <= after; index++) {
        grantCrate('rank', 'premium', { quiet: true });
        celebrations.push({
          type: 'rank',
          icon: equippedItem('emblem')?.value || '⭐',
          title: '昇進！',
          heading: `${RANKS[index - 1].name} → ${RANKS[index].name}`,
          body: index === RANKS.length - 1
            ? '最高階級「元帥」に到達しました。前線の伝説です。'
            : `次の階級「${RANKS[index + 1].name}」まで あと${formatNumber(RANKS[index + 1].xp - mstate.xp)}戦功。`,
          reward: '特別補給箱 +1'
        });
        if (session) session.rankUps.push(RANKS[index].name);
        battlePing(`🎖️ 昇進！ ${RANKS[index].name}`, 'rank');
      }
      mstate.rankSeen = after;
    }
    return value;
  }

  /* ------------------------------------------------------------------ */
  /* Conquest map                                                        */
  /* ------------------------------------------------------------------ */

  const CONQUEST_STATES = Object.freeze([
    { id: 'unseen', label: '未出題', color: '#3a4b5a' },
    { id: 'weak', label: '苦手', color: '#ff5466' },
    { id: 'learning', label: '覚えかけ', color: '#ffb547' },
    { id: 'conquered', label: '制覇', color: '#43d9ff' },
    { id: 'perfect', label: '完全制覇', color: '#ffd166' }
  ]);

  function conquestLevel(sense) {
    const stats = save?.progress?.[sense.senseId];
    if (!stats || stats.shownCount === 0) return 0;
    if (stats.lastWasIncorrect) return 1;
    const streakNow = stats.currentCorrectStreak || 0;
    if (stats.masteryLevel >= 5 && streakNow >= 5) return 4;
    if (streakNow >= 3) return 3;
    return 2;
  }

  function conquestSummary(list = activeSenses()) {
    const counts = [0, 0, 0, 0, 0];
    for (const sense of list) counts[conquestLevel(sense)]++;
    const total = list.length;
    const conquered = counts[3] + counts[4];
    return { counts, total, conquered, pct: total ? Math.round(conquered / total * 100) : 0 };
  }

  function snapshotConquest(summary = conquestSummary()) {
    const key = currentRangeKey();
    if (!mstate.conquest[key]) {
      mstate.conquest[key] = {};
      pruneCustomKeys(mstate.conquest);
    }
    const days = mstate.conquest[key];
    const today = todayKey();
    if (days[today] === summary.conquered) return false;
    days[today] = summary.conquered;
    const keys = Object.keys(days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 40))) delete days[old];
    return true;
  }

  function conquestWeekDelta(summary = conquestSummary()) {
    const days = mstate.conquest[currentRangeKey()] || {};
    const today = todayKey();
    const weekAgo = shiftKey(today, -7);
    const keys = Object.keys(days).sort().filter(key => key < today);
    if (!keys.length) return null;
    const onOrBefore = keys.filter(key => key <= weekAgo).at(-1);
    const base = onOrBefore || keys.find(key => key >= weekAgo);
    return base ? summary.conquered - days[base] : null;
  }

  function lessonMap() {
    const map = new Map();
    if (!data?.words || !isOfficialSource()) return map;
    const range = currentRange();
    for (const word of data.words) {
      if (range && (word.lesson < range.lessonStart || word.lesson > range.lessonEnd)) continue;
      const key = String(word.english).toLowerCase();
      if (!map.has(key) || word.lesson < map.get(key)) map.set(key, word.lesson);
    }
    return map;
  }

  // "10月26–27日" → first and last test day in the current school year.
  function parseRangeDates(range, now = new Date()) {
    const match = /(\d{1,2})月(\d{1,2})日?(?:\s*[–\-〜~]\s*(?:(\d{1,2})月)?(\d{1,2})日)?/.exec(String(range?.date || ''));
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const endMonth = match[3] ? Number(match[3]) : month;
    const endDay = match[4] ? Number(match[4]) : day;
    const schoolYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const yearFor = m => (m >= 4 ? schoolYear : schoolYear + 1);
    const start = new Date(yearFor(month), month - 1, day);
    const end = new Date(yearFor(endMonth), endMonth - 1, endDay);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start: todayKey(start), end: todayKey(end) };
  }

  function testCountdown(range = currentRange(), now = new Date()) {
    if (!isOfficialSource() || !range) return { label: '自由練習', days: null, phase: 'none' };
    const dates = parseRangeDates(range, now);
    if (!dates) return { label: range.id === 'all' ? '学年末に向けて' : 'テスト日未設定', days: null, phase: 'none' };
    const today = todayKey(now);
    const days = daysBetween(dates.start, today);
    if (days > 0) return { label: `テストまで あと${days}日`, short: `あと${days}日`, days, phase: 'before' };
    if (daysBetween(dates.end, today) >= 0) {
      return { label: days === 0 ? '今日がテスト！' : 'テスト期間中', short: days === 0 ? '今日！' : '期間中', days: 0, phase: 'during' };
    }
    return { label: 'テスト終了', short: '終了', days: null, phase: 'after' };
  }

  function paceText(summary = conquestSummary(), countdown = testCountdown()) {
    const remaining = summary.total - summary.conquered;
    if (!summary.total) return '';
    if (remaining <= 0) return '全単語を制覇！この調子で完全制覇を目指そう。';
    if (countdown.phase === 'before' && countdown.days > 0) {
      const perDay = Math.ceil(remaining / countdown.days);
      return `残り${remaining}語 → 1日${perDay}語の制覇ペースでテストまでに全制覇`;
    }
    if (countdown.phase === 'during') return `残り${remaining}語。最後のひと押し！`;
    return `残り${remaining}語。3回連続正解で「制覇」になります。`;
  }

  /* ------------------------------------------------------------------ */
  /* Word cards                                                          */
  /* ------------------------------------------------------------------ */

  function captureCard(sense, { boss = false, tier = 1 } = {}) {
    const now = Date.now();
    let card = mstate.cards[sense.senseId];
    let isNew = false;
    let becameGold = false;
    if (!card) {
      card = mstate.cards[sense.senseId] = { t: 1, b: 0, at: now, g: 0 };
      isNew = true;
      addXp(XP.newCard, 'card');
      if (session) session.newCards.push(sense.senseId);
    }
    if (boss) card.b += 1;
    if (tier >= 2 && card.t < 2) {
      card.t = 2;
      card.g = now;
      becameGold = true;
      addXp(XP.goldCard, 'gold');
      if (session) session.newGolds.push(sense.senseId);
    }
    if (isNew || becameGold) checkCardMilestones();
    return { isNew, becameGold };
  }

  function cardSummary(list = activeSenses()) {
    let owned = 0;
    let gold = 0;
    let boss = 0;
    for (const sense of list) {
      const card = mstate.cards[sense.senseId];
      if (!card) continue;
      owned++;
      if (card.t >= 2) gold++;
      if (card.b > 0) boss++;
    }
    const total = list.length;
    return { owned, gold, boss, total, pct: total ? Math.floor(owned / total * 100) : 0 };
  }

  function nextMilestone(summary = cardSummary()) {
    if (summary.total < MILESTONE_MIN_WORDS) return { ineligible: true };
    const reached = mstate.milestones[currentRangeKey()] || [];
    for (const pct of MILESTONES) {
      if (reached.includes(pct)) continue;
      const needed = Math.ceil(summary.total * pct / 100);
      return { pct, needed, remaining: Math.max(0, needed - summary.owned) };
    }
    return null;
  }

  function checkCardMilestones() {
    const summary = cardSummary();
    if (summary.total < MILESTONE_MIN_WORDS) return;
    const key = currentRangeKey();
    if (!mstate.milestones[key]) {
      mstate.milestones[key] = [];
      pruneCustomKeys(mstate.milestones);
    }
    const reached = mstate.milestones[key];
    for (const pct of MILESTONES) {
      if (reached.includes(pct)) continue;
      if (summary.owned < Math.ceil(summary.total * pct / 100)) break;
      reached.push(pct);
      grantCrate('milestone', pct === 100 ? 'premium' : 'boosted', { quiet: true });
      celebrations.push({
        type: 'milestone',
        icon: pct === 100 ? '🏆' : '📖',
        title: pct === 100 ? '図鑑コンプリート！' : `図鑑 ${pct}% 達成！`,
        heading: currentRangeLabel(),
        body: `${summary.owned} / ${summary.total}枚のカードを集めました。`,
        reward: pct === 100 ? '特別補給箱 +1' : '強化補給箱 +1'
      });
      battlePing(`📖 図鑑 ${pct}% 達成！`, 'card');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Supply crates                                                       */
  /* ------------------------------------------------------------------ */

  function grantCrate(source, grade = 'base', { quiet = false } = {}) {
    mstate.crates.push({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      grade: CRATE_GRADES[grade] ? grade : 'base',
      source,
      at: Date.now()
    });
    if (mstate.crates.length > 200) mstate.crates.splice(0, mstate.crates.length - 200);
    if (session) session.crates++;
    if (!quiet) battlePing(`📦 ${CRATE_GRADES[grade]?.label || '補給箱'}を獲得！`, grade === 'base' ? 'crate' : 'crate-plus');
    renderCrateBadges();
  }

  function rollDrop(source, chance, grade = 'base', random = Math.random) {
    if (random() < chance) grantCrate(source, grade);
  }

  function rollRarity(grade, sinceEpic, random = Math.random) {
    if (sinceEpic >= PITY_LIMIT) return random() < .2 ? 'legend' : 'epic';
    const odds = (CRATE_GRADES[grade] || CRATE_GRADES.base).odds;
    const total = odds.reduce((sum, value) => sum + value, 0);
    let cursor = random() * total;
    for (let i = 0; i < odds.length; i++) {
      cursor -= odds[i];
      if (cursor < 0) return RARITIES[i].id;
    }
    return RARITIES[odds.length - 1].id;
  }

  function pickItem(rarity, inventory, random = Math.random) {
    const pool = CRATE_ITEMS.filter(item => item.rarity === rarity);
    if (!pool.length) return CRATE_ITEMS[0];
    const weights = pool.map(item => (inventory[item.id] ? 1 : 3));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = random() * total;
    for (let i = 0; i < pool.length; i++) {
      cursor -= weights[i];
      if (cursor < 0) return pool[i];
    }
    return pool.at(-1);
  }

  function openNextCrate() {
    const crate = mstate.crates.shift();
    if (!crate) return null;
    const rarity = rollRarity(crate.grade, mstate.sinceEpic);
    mstate.sinceEpic = rarity === 'epic' || rarity === 'legend' ? 0 : mstate.sinceEpic + 1;
    const item = pickItem(rarity, mstate.inventory);
    const duplicate = Boolean(mstate.inventory[item.id]);
    mstate.inventory[item.id] = (mstate.inventory[item.id] || 0) + 1;
    mstate.cratesOpened++;
    const bonusXp = duplicate ? addXp(rarityInfo(rarity).duplicateXp, 'duplicate') : 0;
    persist();
    return { crate, item, rarity, duplicate, bonusXp };
  }

  function ownsItem(id) {
    const item = ITEM_BY_ID.get(id);
    return Boolean(item && (item.starter || mstate.inventory[id]));
  }

  function equipItem(id) {
    const item = ITEM_BY_ID.get(id);
    if (!item || !ownsItem(id)) return false;
    mstate.equipped[item.type] = id;
    persist();
    renderDashboard();
    return true;
  }

  function collectionCount() {
    return {
      owned: CRATE_ITEMS.filter(item => mstate.inventory[item.id]).length,
      total: CRATE_ITEMS.length
    };
  }

  /* ------------------------------------------------------------------ */
  /* Daily goals and missions                                            */
  /* ------------------------------------------------------------------ */

  function todayMission(key = todayKey()) {
    const number = Math.floor(Date.UTC(...key.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0))) / 86_400_000);
    return MISSIONS[((number % MISSIONS.length) + MISSIONS.length) % MISSIONS.length];
  }

  function streakToday() {
    const status = streak.status();
    return status.today?.date === todayKey() ? status.today : { attempts: 0, correct: 0 };
  }

  function dailyStatus() {
    const daily = ensureDaily();
    const today = streakToday();
    // All of the student's words, not just the selected range, so switching
    // ranges cannot change the rule.
    const weakPool = Object.values(save?.progress || {}).filter(stats => stats?.lastWasIncorrect).length;
    const goldByWeak = daily.weakDefeats >= DAILY.goldWeakDefeats;
    const goldByVolume = weakPool === 0 && daily.solid >= DAILY.goldFallbackCorrect;
    const fallbackRule = weakPool === 0 && !goldByWeak;
    return {
      attempts: today.attempts,
      weakDefeats: daily.weakDefeats,
      weakPool,
      bronze: today.attempts >= 1,
      silver: daily.silver || today.attempts >= DAILY.silverAttempts,
      gold: daily.gold || goldByWeak || goldByVolume,
      goldLabel: fallbackRule ? `金：${DAILY.goldFallbackCorrect}問に正解` : `金：苦手を${DAILY.goldWeakDefeats}語撃破`,
      goldRule: weakPool === 0 && !goldByWeak
        ? `${DAILY.goldFallbackCorrect}問に正解（${Math.min(daily.solid, DAILY.goldFallbackCorrect)}/${DAILY.goldFallbackCorrect}・苦手が残っていない日）`
        : `苦手を${DAILY.goldWeakDefeats}語撃破（${Math.min(daily.weakDefeats, DAILY.goldWeakDefeats)}/${DAILY.goldWeakDefeats}）`,
      mission: daily.mission
    };
  }

  function checkDailyRewards() {
    const status = dailyStatus();
    const daily = ensureDaily();
    if (status.silver && !daily.silver) {
      daily.silver = true;
      addXp(XP.silver, 'silver');
      if (session) session.dailyTiers.push('silver');
      battlePing(`🥈 今日の目標「銀」達成！ +${XP.silver}`, 'daily');
    }
    if (status.gold && !daily.gold) {
      daily.gold = true;
      addXp(XP.gold, 'gold');
      grantCrate('daily', 'boosted', { quiet: true });
      if (session) session.dailyTiers.push('gold');
      battlePing(`🥇 今日の目標「金」達成！ +${XP.gold}・強化補給箱`, 'daily');
    }
  }

  function buildMissionPool(mission, full) {
    if (mission.needsPos && !full.some(hasPosInfo)) return { pool: full, narrowed: false, fallback: true, reason: 'nopos' };
    let pool = null;
    if (mission.filter) pool = full.filter(mission.filter);
    if (mission.elite) {
      const ranked = [...full].sort((a, b) => calculateBossDifficulty(b) - calculateBossDifficulty(a));
      pool = ranked.slice(0, Math.max(MISSION_MIN_POOL, Math.ceil(ranked.length * .4)));
    }
    if (!pool) return { pool: full, narrowed: false, fallback: false };
    const distinct = new Set(pool.map(sense => sense.english.toLowerCase())).size;
    if (pool.length < MISSION_MIN_POOL || distinct < 6) return { pool: full, narrowed: false, fallback: true, reason: 'small' };
    return { pool, narrowed: true, fallback: false };
  }

  // Whether today's rule can be applied on this device and word list. When it
  // cannot, the stage runs with a substitute rule and pays a smaller crate.
  function missionAvailability(mission = todayMission(), list = activeSenses()) {
    const { fallback, reason } = buildMissionPool(mission, list);
    if (mission.listen && !hasEnglishVoice()) return { degraded: true, reason: 'voice' };
    return { degraded: Boolean(fallback), reason: fallback ? reason : '' };
  }

  const DEGRADED_TEXT = Object.freeze({
    voice: '英語音声が使えないため、英単語を表示して出題します',
    nopos: 'この単語リストには品詞の情報がないため、全単語で出題します',
    small: '対象の単語が少ないため、全単語で出題します'
  });

  function hasEnglishVoice() {
    try {
      return Boolean(save?.voice?.enabled && 'speechSynthesis' in window && chooseEnglishVoice());
    } catch {
      return false;
    }
  }

  function activateMission() {
    restorePool();
    const mission = todayMission();
    const full = senseList;
    const { pool, narrowed, fallback, reason } = buildMissionPool(mission, full);
    const listen = Boolean(mission.listen && hasEnglishVoice());
    dailyPool = { full, mission, narrowed, fallback, listen };
    if (narrowed) senseList = pool;
    MODES.daily.enemy = mission.enemy || 1;
    const app = document.querySelector('#app');
    app?.classList.toggle('mission-listen', listen);
    if (listen) app?.classList.add('audio-mode');
    if (fallback) battlePing(`${DEGRADED_TEXT[reason] || DEGRADED_TEXT.small}（報酬は強化補給箱）`, 'info');
    if (mission.listen && !listen) battlePing(`${DEGRADED_TEXT.voice}（報酬は強化補給箱）`, 'info');
  }

  function restorePool() {
    if (!dailyPool) return;
    senseList = dailyPool.full;
    const app = document.querySelector('#app');
    app?.classList.remove('mission-listen');
    if (save?.selectedMode !== 'audio') app?.classList.remove('audio-mode');
    MODES.daily.enemy = 1;
    dailyPool = null;
  }

  /* ------------------------------------------------------------------ */
  /* Ghost battles                                                       */
  /* ------------------------------------------------------------------ */

  function ghostScore(accuracyPct, averageMs) {
    const seconds = Math.max(0, Number(averageMs) || 0) / 1000;
    return Math.round(accuracyPct * 10 + Math.min(250, Math.max(0, (6 - seconds) * 50)));
  }

  function pickGhost(battles, today, family, rangeKey) {
    let best = null;
    for (const record of battles) {
      const age = daysBetween(today, record.d);
      if (!(age >= 1)) continue;
      const penalty = (record.rid === rangeKey ? 0 : 3) + (record.f === family ? 0 : 5);
      const cost = Math.abs(age - 7) + penalty;
      if (!best || cost < best.cost || (cost === best.cost && age > best.age)) {
        best = { record, cost, age };
      }
    }
    if (!best) return null;
    const { record, age } = best;
    const accuracyPct = record.a ? Math.round(record.c / record.a * 100) : 0;
    return {
      age,
      label: `${age}日前の自分`,
      accuracy: accuracyPct,
      averageMs: record.r,
      score: ghostScore(accuracyPct, record.r)
    };
  }

  function liveScore() {
    if (!session?.attempts) return 0;
    return ghostScore(Math.round(session.correct / session.attempts * 100), session.reaction / session.attempts);
  }

  /* ------------------------------------------------------------------ */
  /* Sessions                                                            */
  /* ------------------------------------------------------------------ */

  function sessionFamily(mode = save?.selectedMode) {
    if (update?.isPairActive?.() || mode === 'pair') return 'pair';
    if (update?.isRapidActive?.() || mode === 'coverage' || mode === 'weak') return 'rapid';
    return 'stage';
  }

  function startSession() {
    const family = sessionFamily();
    const rangeKey = currentRangeKey();
    const now = Date.now();
    const mission = save?.selectedMode === 'daily' && dailyPool
      ? {
        id: dailyPool.mission.id,
        date: todayKey(),
        degraded: Boolean(dailyPool.fallback || (dailyPool.mission.listen && !dailyPool.listen))
      }
      : null;
    session = {
      id: now,
      startedAt: now,
      mode: save?.selectedMode || 'normal',
      family,
      rangeKey,
      attempts: 0,
      correct: 0,
      reaction: 0,
      xp: 0,
      bossHits: new Set(),
      bossDefeats: 0,
      weakDefeats: 0,
      firstPassMistakes: 0,
      newCards: [],
      newGolds: [],
      crates: 0,
      rankUps: [],
      dailyTiers: [],
      conquestStart: conquestSummary(activeSenses()).conquered,
      ghost: family === 'pair' ? null : pickGhost(mstate.battles, todayKey(), family, rangeKey),
      mission,
      solidCorrect: 0,
      reviewAttempts: 0,
      weakBossWords: new Set(),
      stageFinished: false,
      finalized: false
    };
    lastSummary = null;
    renderGhostChip();
    return session;
  }

  function onAnswer(sense, correct, reaction, before) {
    if (!sense) return;
    // A run started outside startStage (e.g. 苦手を一斉学習 from the weak list)
    // must never extend the interrupted stage's session.
    if (!session || session.finalized || session.family !== sessionFamily()) startSession();
    const key = todayKey();
    ensureDaily(key);
    const log = dayLog(key);
    session.attempts++;
    session.reaction += Math.max(0, Number(reaction) || 0);
    log.a++;
    log.r += Math.round(Math.max(0, Number(reaction) || 0));

    // Missed earlier in this same session: not a "weak word defeated".
    const freshMiss = Number(before.lastIncorrectAt || 0) >= session.startedAt;
    const weakBeforeSession = before.wasWeak && !freshMiss;
    const wordKey = String(sense.english || '').toLowerCase();
    if (freshMiss) session.reviewAttempts++;

    if (correct) {
      session.correct++;
      log.c++;
      if (!freshMiss) {
        session.solidCorrect++;
        mstate.daily.solid++;
      }
      let gained = freshMiss ? XP.freshReview : XP.correct;
      if (weakBeforeSession) {
        gained += XP.weakBonus;
        session.weakDefeats++;
        const daily = mstate.daily;
        if (!daily.weakIds.includes(wordKey)) {
          daily.weakIds.push(wordKey);
          daily.weakDefeats = daily.weakIds.length;
          log.w++;
        }
        rollDrop('weak', DROP.weakDefeat, 'boosted');
      } else if (!freshMiss) {
        rollDrop('drop', DROP.correct, 'base');
      }
      if (before.isBoss) {
        gained += XP.bossPhase;
        session.bossHits.add(before.bossPhase);
        session.bossDefeats++;
        log.b++;
        log.bw = [...log.bw.filter(word => word !== sense.english), sense.english].slice(-12);
        if (freshMiss) {
          if (mstate.cards[sense.senseId]) mstate.cards[sense.senseId].b += 1;
        } else {
          captureCard(sense, { boss: true });
        }
        rollDrop('boss', DROP.bossPhase, 'base');
      } else if (before.isWeakBoss && !session.weakBossWords.has(sense.senseId)) {
        session.weakBossWords.add(sense.senseId);
        session.bossDefeats++;
        log.b++;
        log.bw = [...log.bw.filter(word => word !== sense.english), sense.english].slice(-12);
        if (mstate.cards[sense.senseId]) mstate.cards[sense.senseId].b += 1;
      }
      addXp(gained, 'answer');
    } else {
      if (!before.timedOut) addXp(XP.incorrect, 'answer');
      if (session.family === 'rapid' && session.mode === 'coverage' && !before.isWeakBoss) session.firstPassMistakes++;
    }

    const after = save.progress[sense.senseId];
    if (after) {
      const level = conquestLevel(sense);
      if (level === 4) captureCard(sense, { tier: 2 });
      else if (level === 3) captureCard(sense, { tier: 1 });
    }
    checkDailyRewards();
    persist();
    renderGhostChip();
    renderHudRank();
  }

  // Ends the session without completion rewards (answers already earned XP).
  function discardSession() {
    if (session) session.finalized = true;
    lastSummary = null;
    return null;
  }

  function finalizeSession() {
    if (!session || session.finalized) return lastSummary;
    if (session.attempts === 0) return discardSession();
    const gameOver = session.gameOver || gameStateIs('GAME_OVER');
    const family = session.family;
    const accuracyPct = Math.round(session.correct / session.attempts * 100);
    const averageMs = session.reaction / session.attempts;
    const events = [];
    let completion = 'stage';

    // Only pay completion rewards for a run that really ended here.
    const finishedRapid = update?.finishedRapidMode?.() || '';
    if (family === 'stage' && !gameOver && !session.stageFinished) return discardSession();
    if (family === 'rapid' && !gameOver && !finishedRapid) return discardSession();
    session.finalized = true;
    // Guaranteed crates need a real-sized list, so a self-made list of a few
    // easy words cannot be used to collect them. XP is unchanged.
    const fullList = activeSenses().length >= MILESTONE_MIN_WORDS;
    if (!fullList && family !== 'pair' && !gameOver) {
      events.push(`補給箱の確定報酬は${MILESTONE_MIN_WORDS}語以上のリストが対象です`);
    }

    if (family === 'pair') {
      completion = 'pair';
      const outcome = update?.pairOutcome?.() || { rank: update?.pairSelfRank?.() || 0, topTie: false, completed: false };
      const share = Math.min(1, session.attempts / PAIR_FULL_ROUNDS);
      addXp(XP.pairMatch * share, 'pair');
      if (outcome.completed && share >= 1) {
        if (outcome.rank === 1 && !outcome.topTie && session.correct > 0) grantCrate('pair', 'base', { quiet: true });
        else rollDrop('pair', DROP.pairLoss, 'base');
      }
    } else if (gameOver) {
      completion = 'gameover';
      addXp(XP.gameOver, 'gameover');
    } else if (family === 'rapid') {
      completion = finishedRapid === 'coverage' ? 'coverage' : 'weakrun';
      // Scaled by first-time correct answers, so wrong answers, timeouts or
      // re-answering words missed on purpose cannot farm it.
      const share = Math.min(1, session.solidCorrect / FULL_RUN_ATTEMPTS);
      const firstTryAccuracy = Math.round(session.solidCorrect / Math.max(1, session.attempts - session.reviewAttempts) * 100);
      addXp(XP.runClear * share, 'run');
      if (fullList && share >= 1 && firstTryAccuracy >= RUN_CRATE_MIN_ACCURACY) grantCrate('run', 'base', { quiet: true });
      else if (fullList) rollDrop('run', share * .5, 'base');
      const finished = finishedRapid;
      if (fullList && finished === 'coverage' && session.firstPassMistakes === 0 && share >= 1) {
        grantCrate('perfect', 'boosted', { quiet: true });
        events.push('ノーミス完走ボーナス：強化補給箱');
      }
    } else {
      addXp(XP.stageClear, 'stage');
      if (fullList && session.bossHits.size >= 3) {
        grantCrate('sweep', 'boosted', { quiet: true });
        events.push('ボス3体を完全撃破：強化補給箱');
      } else if (fullList) {
        rollDrop('stage', DROP.stageNoSweep, 'base');
      }
    }

    let missionCleared = false;
    if (session.mode === 'daily' && session.mission && completion === 'stage') {
      const daily = ensureDaily();
      const mission = MISSIONS.find(item => item.id === session.mission.id) || todayMission();
      if (session.mission.date !== todayKey()) {
        events.push('日付が変わったため、この作戦は報酬の対象外です（新しい日の作戦に挑戦しよう）');
      } else if (accuracyPct >= MISSION_CLEAR_ACCURACY && !daily.mission) {
        daily.mission = true;
        missionCleared = true;
        addXp(XP.mission, 'mission');
        const degraded = session.mission.degraded;
        if (fullList) grantCrate('mission', degraded ? 'boosted' : 'premium', { quiet: true });
        celebrations.push({
          type: 'mission',
          icon: mission.icon,
          title: degraded ? '作戦成功（代替ルール）' : '作戦成功！',
          heading: `本日の作戦「${mission.name}」`,
          body: degraded
            ? `正答率${accuracyPct}%でクリア。この端末では作戦のルールをそのまま使えなかったため、報酬は強化補給箱です。`
            : `正答率${accuracyPct}%でクリアしました。明日は別の作戦が届きます。`,
          reward: fullList ? `${degraded ? '強化補給箱' : '特別補給箱'} +1・${XP.mission}戦功` : `${XP.mission}戦功`
        });
      } else if (accuracyPct < MISSION_CLEAR_ACCURACY && !daily.mission) {
        events.push(`作戦クリアには正答率${MISSION_CLEAR_ACCURACY}%以上が必要です（今回${accuracyPct}%）`);
      }
    }

    let ghostResult = null;
    if (session.ghost && session.attempts >= GHOST_MIN_ATTEMPTS && family !== 'pair') {
      const you = ghostScore(accuracyPct, averageMs);
      const outcome = you > session.ghost.score ? 'win' : you < session.ghost.score ? 'lose' : 'draw';
      ghostResult = { ...session.ghost, you, accuracyNow: accuracyPct, averageNow: averageMs, outcome };
      const log = dayLog();
      if (outcome === 'win') {
        mstate.ghost.wins++;
        log.gw++;
        ghostResult.rewarded = log.gw <= GHOST_REWARDS_PER_DAY;
        if (ghostResult.rewarded) {
          addXp(XP.ghostWin, 'ghost');
          rollDrop('ghost', DROP.ghostWin, 'base');
        }
      } else if (outcome === 'lose') {
        mstate.ghost.losses++;
        log.gl++;
      } else {
        mstate.ghost.draws++;
      }
    }

    if (family !== 'pair' && session.attempts >= GHOST_MIN_ATTEMPTS) {
      const today = todayKey();
      // Keep a few records per day and kind, by date, so a ghost from about a
      // week ago survives even on days with many stages.
      const sameGroup = mstate.battles.filter(record => record.d === today && record.f === family && record.rid === session.rangeKey);
      if (sameGroup.length >= BATTLES_PER_DAY_GROUP) mstate.battles.splice(mstate.battles.indexOf(sameGroup[0]), 1);
      mstate.battles.push({
        d: today,
        t: Date.now(),
        m: session.mode,
        f: family,
        rid: session.rangeKey,
        a: session.attempts,
        c: session.correct,
        r: Math.round(averageMs)
      });
      const oldest = shiftKey(today, -BATTLE_DAYS_KEPT);
      mstate.battles = mstate.battles.filter(record => record.d >= oldest).slice(-200);
    }

    checkDailyRewards();
    const conquest = conquestSummary(activeSenses());
    snapshotConquest(conquest);
    lastSummary = {
      id: session.id,
      completion,
      xp: session.xp,
      attempts: session.attempts,
      accuracy: accuracyPct,
      conquest,
      conquestDelta: conquest.conquered - session.conquestStart,
      newCards: session.newCards.length,
      newGolds: session.newGolds.length,
      crates: session.crates,
      rankUps: [...session.rankUps],
      dailyTiers: [...session.dailyTiers],
      ghost: ghostResult,
      missionCleared,
      events,
      notices: streak.takeNotices?.() || []
    };
    persist();
    renderHudRank();
    return lastSummary;
  }

  /* ------------------------------------------------------------------ */
  /* Weekly report card                                                  */
  /* ------------------------------------------------------------------ */

  function weekKeys(end = todayKey()) {
    return Array.from({ length: 7 }, (_, index) => shiftKey(end, index - 6));
  }

  function weeklyStats(end = todayKey()) {
    const keys = weekKeys(end);
    const streakState = streak.status();
    const history = streakState.history || {};
    const studied = new Set(streakState.recentDates || []);
    const frozen = new Set(streakState.frozenDates || []);
    const days = keys.map(key => {
      const fromStreak = history[key];
      const local = mstate.log[key];
      const attempts = fromStreak?.a ?? local?.a ?? 0;
      const correctCount = fromStreak?.c ?? local?.c ?? 0;
      return {
        key,
        attempts,
        correct: correctCount,
        studied: attempts > 0 || studied.has(key),
        frozen: frozen.has(key) && !(attempts > 0 || studied.has(key))
      };
    });
    const totals = keys.reduce((sum, key) => {
      const local = mstate.log[key];
      if (!local) return sum;
      sum.xp += local.x;
      sum.bosses += local.b;
      sum.ghostWins += local.gw;
      sum.ghostLosses += local.gl;
      sum.weak += local.w;
      for (const word of local.bw) if (!sum.bossWords.includes(word)) sum.bossWords.push(word);
      return sum;
    }, { xp: 0, bosses: 0, ghostWins: 0, ghostLosses: 0, weak: 0, bossWords: [] });
    const attempts = days.reduce((sum, day) => sum + day.attempts, 0);
    const correctCount = days.reduce((sum, day) => sum + day.correct, 0);
    const startTs = new Date(`${keys[0]}T00:00:00`).getTime();
    const cardsGained = Object.values(mstate.cards).filter(card => card.at >= startTs).length;
    const goldsGained = Object.values(mstate.cards).filter(card => card.g >= startTs).length;
    const conquest = conquestSummary(activeSenses());
    return {
      keys,
      days,
      studiedDays: days.filter(day => day.studied).length,
      attempts,
      accuracy: attempts ? Math.round(correctCount / attempts * 100) : 0,
      streakDays: streakState.currentStreakDays,
      longest: streakState.longestStreakDays,
      tickets: streakState.freezeTickets || 0,
      cardsGained,
      goldsGained,
      conquest,
      conquestDelta: conquestWeekDelta(conquest),
      ...totals
    };
  }

  function drawReportCard(canvas, stats = weeklyStats()) {
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    const font = (weight, size) => `${weight} ${size}px "Noto Sans JP","Hiragino Sans","Yu Gothic UI",Meiryo,system-ui,sans-serif`;
    const box = (x, y, w, h, r, fill, stroke) => {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
    };
    const text = (value, x, y, size, color = '#f4fbff', weight = 800, align = 'left') => {
      g.font = font(weight, size);
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = 'alphabetic';
      g.fillText(String(value), x, y);
    };
    const fit = (value, maxWidth, size, weight = 800) => {
      let current = size;
      g.font = font(weight, current);
      while (g.measureText(String(value)).width > maxWidth && current > 18) {
        current -= 2;
        g.font = font(weight, current);
      }
      return current;
    };

    const bg = g.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#0d2740');
    bg.addColorStop(.55, '#07131f');
    bg.addColorStop(1, '#03070d');
    g.fillStyle = bg;
    g.fillRect(0, 0, width, height);
    g.strokeStyle = 'rgba(83,223,255,.06)';
    g.lineWidth = 1;
    for (let x = 0; x < width; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, height); g.stroke(); }
    for (let y = 0; y < height; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke(); }

    const first = stats.keys[0];
    const last = stats.keys.at(-1);
    const md = key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
    text('WORD FRONTLINE', 70, 112, 58, '#ffffff', 1000);
    text('週間戦績カード', 70, 170, 40, '#43d9ff', 900);
    text(`${md(first)} 〜 ${md(last)}`, width - 70, 170, 36, '#b8d0e0', 800, 'right');

    // Rank badge
    const info = rankInfo();
    box(60, 210, width - 120, 190, 28, 'rgba(16,41,61,.95)', '#397393');
    g.font = font(400, 96);
    g.textAlign = 'center';
    g.fillText(equippedItem('emblem')?.value || '⭐', 170, 340);
    const name = displayName(info);
    text(name, 280, 300, fit(name, width - 380, 58, 1000), '#ffffff', 1000);
    text(`累計 ${formatNumber(info.xp)} 戦功 ・ 今週 +${formatNumber(stats.xp)}`, 282, 355, 30, '#ffd166', 800);

    // Day dots
    box(60, 430, width - 120, 250, 28, 'rgba(12,30,46,.95)', '#2d5472');
    text(`学習した日 ${stats.studiedDays} / 7`, 100, 484, 38, '#ffffff', 900);
    text(`🔥 継続 ${stats.streakDays}日（最長 ${stats.longest}日）`, width - 100, 484, 30, '#ffd166', 800, 'right');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const maxAttempts = Math.max(20, ...stats.days.map(day => day.attempts));
    stats.days.forEach((day, index) => {
      const cx = 140 + index * 133;
      const barHeight = Math.max(day.attempts ? 6 : 0, Math.round(58 * Math.min(1, day.attempts / maxAttempts)));
      box(cx - 34, 610 - 58, 68, 58, 12, 'rgba(255,255,255,.05)');
      if (barHeight) box(cx - 34, 610 - barHeight, 68, barHeight, 12, day.studied ? '#43d9ff' : '#3a4b5a');
      if (day.studied || day.frozen) {
        g.font = font(400, 32);
        g.textAlign = 'center';
        g.fillStyle = '#ffffff';
        g.fillText(day.studied ? '✅' : '🎫', cx, 540);
      } else {
        g.beginPath();
        g.arc(cx, 528, 12, 0, Math.PI * 2);
        g.strokeStyle = '#3f5a6e';
        g.lineWidth = 3;
        g.stroke();
      }
      const date = new Date(`${day.key}T00:00:00`);
      text(`${md(day.key)}(${weekdays[date.getDay()]})`, cx, 645, 22, '#b8d0e0', 700, 'center');
    });

    // Stat tiles
    const tiles = [
      ['回答数', `${formatNumber(stats.attempts)}問`, '#f4fbff'],
      ['正答率', `${stats.accuracy}%`, '#50eea8'],
      ['ボス撃破', `${formatNumber(stats.bosses)}体`, '#ff9b42'],
      ['苦手撃破', `${formatNumber(stats.weak)}語`, '#ff7a84'],
      ['新カード', `${stats.cardsGained}枚${stats.goldsGained ? `（金${stats.goldsGained}）` : ''}`, '#ffd166'],
      ['ゴースト戦', `${stats.ghostWins}勝${stats.ghostLosses}敗`, '#c6b8ff']
    ];
    tiles.forEach(([label, value, color], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 60 + col * 327;
      const y = 710 + row * 150;
      box(x, y, 306, 130, 22, 'rgba(16,36,58,.95)', '#2d5472');
      text(label, x + 24, y + 46, 26, '#9bb5ca', 800);
      text(value, x + 24, y + 104, fit(value, 260, 46, 1000), color, 1000);
    });

    // Conquest
    box(60, 1020, width - 120, 170, 28, 'rgba(12,30,46,.95)', '#2d5472');
    const rangeLabel = currentRangeLabel();
    text(rangeLabel, 100, 1072, fit(rangeLabel, 620, 30, 900), '#43d9ff', 900);
    const delta = stats.conquestDelta;
    text(`制覇 ${stats.conquest.pct}%`, width - 100, 1074, 40, '#ffffff', 1000, 'right');
    const barX = 100;
    const barW = width - 200;
    box(barX, 1100, barW, 30, 15, '#02060a');
    let cursor = barX;
    [0, 1, 2, 3, 4].forEach(level => {
      const w = stats.conquest.total ? barW * stats.conquest.counts[level] / stats.conquest.total : 0;
      if (w > 0) {
        g.fillStyle = CONQUEST_STATES[level].color;
        g.fillRect(cursor, 1100, w, 30);
        cursor += w;
      }
    });
    text(
      `${stats.conquest.conquered} / ${stats.conquest.total}語${delta !== null && delta !== undefined ? `（今週 ${delta >= 0 ? '+' : ''}${delta}語）` : ''}`,
      100, 1168, 28, '#d7e7f2', 800
    );

    const bossLine = stats.bossWords.length ? `倒したボス：${stats.bossWords.slice(0, 6).join(' / ')}` : '今週のボス：まだなし';
    text(bossLine, 70, 1240, fit(bossLine, width - 140, 28, 700), '#b8d0e0', 700);
    text('WORD FRONTLINE STUDY PLUS ・ この端末の学習記録', width / 2, 1305, 24, '#6f8ba0', 700, 'center');
    return canvas;
  }

  /* ------------------------------------------------------------------ */
  /* Battle cosmetics                                                    */
  /* ------------------------------------------------------------------ */

  const fxSeeds = Array.from({ length: 70 }, (_, index) => {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    const value2 = Math.sin(index * 269.5 + 183.3) * 24634.6345;
    return { a: value - Math.floor(value), b: value2 - Math.floor(value2) };
  });

  function activeTheme() {
    return THEMES[equippedItem('theme')?.value] || THEMES.night;
  }

  function activeSquadColor() {
    return SQUAD_COLORS[equippedItem('color')?.value] || SQUAD_COLORS.standard;
  }

  function drawThemeFx(theme) {
    if (!theme.fx || save?.settings?.reducedMotion && theme.fx !== 'stars') return;
    const t = battle.time;
    ctx.save();
    for (let i = 0; i < fxSeeds.length; i++) {
      const seed = fxSeeds[i];
      if (theme.fx === 'stars') {
        if (i > 60) break;
        const x = seed.a * canvasW;
        const y = seed.b * canvasH;
        const edges = roadEdges((y / canvasH - .08) / .92);
        if (y > .08 * canvasH && x > edges.l * canvasW - 4 && x < edges.r * canvasW + 4) continue;
        ctx.globalAlpha = .35 + .5 * Math.abs(Math.sin(t * 1.4 + i));
        ctx.fillStyle = i % 7 === 0 ? '#c6b8ff' : '#ffffff';
        ctx.fillRect(x, y, i % 5 === 0 ? 2.4 : 1.4, i % 5 === 0 ? 2.4 : 1.4);
      } else if (theme.fx === 'snow') {
        if (i > 45) break;
        const x = ((seed.a + Math.sin(t * .6 + i) * .02) % 1) * canvasW;
        const y = ((seed.b + t * (.05 + seed.a * .05)) % 1) * canvasH;
        ctx.globalAlpha = .75;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + seed.b * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (theme.fx === 'petals') {
        if (i > 32) break;
        const x = ((seed.a + t * .03 + Math.sin(t + i) * .015) % 1) * canvasW;
        const y = ((seed.b + t * (.045 + seed.b * .03)) % 1) * canvasH;
        ctx.globalAlpha = .8;
        ctx.fillStyle = i % 3 ? '#ffc2dc' : '#ffe6f0';
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 2.2, t * 2 + i, 0, Math.PI * 2);
        ctx.fill();
      } else if (theme.fx === 'embers') {
        if (i > 34) break;
        const x = ((seed.a + Math.sin(t * .8 + i) * .01) % 1) * canvasW;
        const y = (1 - ((seed.b + t * (.06 + seed.a * .04)) % 1)) * canvasH;
        ctx.globalAlpha = .5 + .4 * Math.abs(Math.sin(t * 3 + i));
        ctx.fillStyle = i % 2 ? '#ff7a3d' : '#ffd166';
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.restore();
  }

  function installCosmetics() {
    drawBattleEnvironment = function drawBattleEnvironmentThemed() {
      const theme = activeTheme();
      if (theme !== THEMES.night) {
        const sky = ctx.createLinearGradient(0, 0, 0, canvasH);
        sky.addColorStop(0, theme.sky[0]);
        sky.addColorStop(.45, theme.sky[1]);
        sky.addColorStop(1, theme.sky[2]);
        ctx.fillStyle = sky;
        ctx.fillRect(-12, -12, canvasW + 24, canvasH + 24);
      }
      const far = roadEdges(0);
      const near = roadEdges(1);
      ctx.fillStyle = theme.side;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(far.l * canvasW, .08 * canvasH);
      ctx.lineTo(near.l * canvasW, canvasH);
      ctx.lineTo(0, canvasH);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(canvasW, 0);
      ctx.lineTo(far.r * canvasW, .08 * canvasH);
      ctx.lineTo(near.r * canvasW, canvasH);
      ctx.lineTo(canvasW, canvasH);
      ctx.closePath();
      ctx.fill();
      const road = ctx.createLinearGradient(0, .08 * canvasH, 0, canvasH);
      road.addColorStop(0, theme.road[0]);
      road.addColorStop(1, theme.road[1]);
      ctx.fillStyle = road;
      ctx.beginPath();
      ctx.moveTo(far.l * canvasW, .08 * canvasH);
      ctx.lineTo(far.r * canvasW, .08 * canvasH);
      ctx.lineTo(near.r * canvasW, canvasH);
      ctx.lineTo(near.l * canvasW, canvasH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let lane = 1; lane < 4; lane++) {
        ctx.beginPath();
        const a = worldToScreen(lane / 4, 0);
        const b = worldToScreen(lane / 4, 1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = theme.lane;
        ctx.setLineDash([10, 13]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (let y = .18; y < 1; y += .16) {
        const a = worldToScreen(0, y);
        const b = worldToScreen(1, y);
        ctx.strokeStyle = theme.cross;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      drawThemeFx(theme);
      drawScenery();
    };

    drawScenery = function drawSceneryThemed() {
      const theme = activeTheme();
      const items = [[-.08, .30, 'container'], [1.08, .39, 'barrier'], [-.1, .66, 'barrier'], [1.08, .73, 'container']];
      for (const [x, y, type] of items) {
        const p = worldToScreen(x, y);
        const s = p.scale;
        if (type === 'container') {
          ctx.fillStyle = theme.container[0];
          ctx.fillRect(p.x - 17 * s, p.y - 10 * s, 34 * s, 21 * s);
          ctx.strokeStyle = theme.container[1];
          ctx.strokeRect(p.x - 17 * s, p.y - 10 * s, 34 * s, 21 * s);
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(p.x + i * 8 * s, p.y - 9 * s);
            ctx.lineTo(p.x + i * 8 * s, p.y + 10 * s);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = theme.barrier[0];
          ctx.fillRect(p.x - 20 * s, p.y - 5 * s, 40 * s, 10 * s);
          ctx.fillStyle = theme.barrier[1];
          for (let i = -15; i < 17; i += 10) ctx.fillRect(p.x + i * s, p.y - 5 * s, 5 * s, 10 * s);
        }
      }
      const bridgeY = .23;
      const a = worldToScreen(-.14, bridgeY);
      const b = worldToScreen(1.14, bridgeY);
      ctx.strokeStyle = theme.bridge;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      drawTurret(-.08, .54, save.squad.turret > 0);
      drawTurret(1.08, .54, save.squad.turret > 0);
    };

    renderSquad = function renderSquadColored() {
      const palette = activeSquadColor();
      const count = Math.min(30, save.squad.troops);
      const cols = Math.ceil(Math.sqrt(count));
      for (let i = count - 1; i >= 0; i--) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = battle.squadX + (col - (cols - 1) / 2) * .047;
        const y = .87 - row * .042;
        const p = worldToScreen(x, y);
        const s = p.scale;
        ctx.fillStyle = '#0009';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 8 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        const main = palette.rainbow ? `hsl(${(i * 37 + battle.time * 90) % 360} 90% 60%)` : palette.main;
        ctx.save();
        if (palette.glow) {
          ctx.shadowColor = palette.glow;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = i === 0 ? palette.lead : main;
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8 * s, 4.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(p.x - 5 * s, p.y - 3 * s, 10 * s, 12 * s);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 7 * s, p.y - 9 * s);
        ctx.stroke();
        ctx.restore();
      }
      if (save.squad.shield > 0) {
        const p = worldToScreen(battle.squadX, .80);
        ctx.fillStyle = '#39d5ff20';
        ctx.strokeStyle = '#5ee9ffbb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, Math.min(120, 38 + count * 3), Math.min(92, 48 + count * 1.5), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (battle.volleyUntil > battle.time) {
        const p = worldToScreen(battle.squadX, .65);
        ctx.fillStyle = '#bffcff';
        ctx.font = '900 12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('SQUAD VOLLEY', p.x, p.y);
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Game hooks                                                          */
  /* ------------------------------------------------------------------ */

  const previous = {
    updateWordStats,
    startStage,
    presentQuestion,
    finishStage,
    gameOver,
    showScreen,
    renderModeGrid,
    resetProgress,
    initializeWords
  };

  function installHooks() {
    updateWordStats = function updateWordStatsMotivation(sense, correct, reaction) {
      const stats = sense ? save.progress[sense.senseId] : null;
      const before = {
        wasWeak: Boolean(stats && (stats.lastWasIncorrect || (stats.incorrectCount > 0 && stats.incorrectCount > stats.correctCount))),
        lastIncorrectAt: stats?.lastIncorrectAt || 0,
        timedOut: !correct && Number(reaction) >= questionTimeLimit * 1000 - 1,
        isBoss: Boolean(bossPhase > 0 && bossSense && sense && bossSense.senseId === sense.senseId),
        bossPhase,
        isWeakBoss: Boolean(update?.isWeakBossPhase?.())
      };
      const result = previous.updateWordStats(sense, correct, reaction);
      try {
        onAnswer(sense, Boolean(correct), reaction, before);
      } catch (error) {
        console.warn('Motivation answer hook failed:', error);
      }
      return result;
    };

    startStage = function startStageMotivation() {
      if (session && !session.finalized) session = null;
      if (save.selectedMode === 'daily') activateMission();
      else restorePool();
      startSession();
      return previous.startStage();
    };

    presentQuestion = function presentQuestionMotivation(target, choices, isBoss) {
      const result = previous.presentQuestion(target, choices, isBoss);
      const mission = save.selectedMode === 'daily' ? dailyPool?.mission : null;
      if (mission?.time && !update?.isRapidActive?.() && !update?.isPairActive?.()) {
        questionTimeLimit = Math.max(mission.time < 1 ? 4 : 7, questionTimeLimit * mission.time);
        timerRemaining = questionTimeLimit;
      }
      if (dailyPool?.listen && !save.voice.autoPlay) {
        const serial = answerSerial;
        scheduleGameTask(() => {
          if (answerSerial === serial && state === GAME_STATE.ANSWERING) speakWord(target.english);
        }, save.settings.reducedMotion ? 160 : 650);
      }
      renderGhostChip();
      return result;
    };

    finishStage = function finishStageMotivation() {
      if (session && !session.finalized) session.stageFinished = true;
      restorePool();
      return previous.finishStage();
    };

    gameOver = function gameOverMotivation() {
      if (session && !session.finalized) session.gameOver = true;
      restorePool();
      return previous.gameOver();
    };

    showScreen = function showScreenMotivation(which) {
      restorePool();
      if (session && !session.finalized) session = null;
      lastSummary = null;
      const result = previous.showScreen(which);
      renderGhostChip();
      if (which === 'start' && ready) {
        renderDashboard();
        announceStreakNotices();
        setTimeout(showNextCelebration, 250);
      }
      return result;
    };

    renderModeGrid = function renderModeGridMotivation() {
      const result = previous.renderModeGrid();
      decorateMissionCard();
      return result;
    };

    resetProgress = function resetProgressMotivation(keepWords = true) {
      const wipe = Boolean(document.querySelector('#resetMotivation')?.checked);
      restorePool();
      if (wipe) clearState();
      const result = previous.resetProgress(keepWords);
      if (ready) renderDashboard();
      return result;
    };

    initializeWords = function initializeWordsMotivation() {
      restorePool();
      const result = previous.initializeWords();
      if (ready) renderDashboard();
      return result;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Interface                                                           */
  /* ------------------------------------------------------------------ */

  const $id = id => document.getElementById(id);
  const LAYERS = ['mtvConquestLayer', 'mtvCardsLayer', 'mtvHqLayer', 'mtvDailyLayer', 'mtvReportLayer', 'mtvCrateLayer', 'mtvCelebrateLayer'];

  function injectInterface() {
    const dashboard = $id('plusDashboard');
    if (dashboard && !$id('mtvRankStrip')) {
      dashboard.classList.add('mtv-dashboard');
      dashboard.insertAdjacentHTML('afterbegin', `
        <div id="mtvRankStrip" class="mtv-rank-strip">
          <button id="mtvRankButton" class="mtv-rank-main" type="button">
            <span class="sr-only">司令部を開く：</span>
            <span id="mtvEmblem" class="mtv-emblem" aria-hidden="true">⭐</span>
            <span class="mtv-rank-text">
              <span class="plus-kicker">階級</span>
              <strong id="mtvRankName">二等兵</strong>
              <span class="mtv-xp-bar" aria-hidden="true"><i id="mtvXpFill"></i></span>
              <small id="mtvXpText">0 戦功</small>
            </span>
          </button>
          <div class="mtv-rank-actions">
            <button id="mtvCrateButton" class="mtv-chip-btn" type="button">📦 補給箱<b id="mtvCrateCount" class="mtv-count hidden">0</b></button>
            <button id="mtvCardsButton" class="mtv-chip-btn" type="button">📖 図鑑</button>
            <button id="mtvReportButton" class="mtv-chip-btn" type="button">🖼️ 週間戦績</button>
            <button id="mtvHqButton" class="mtv-chip-btn" type="button">🎖️ 装備</button>
          </div>
        </div>
      `);
      dashboard.insertAdjacentHTML('beforeend', `
        <button id="mtvConquestCard" class="plus-panel mtv-conquest-card" type="button">
          <span class="mtv-card-head"><span class="plus-kicker">制覇マップ</span><em id="mtvCountdown" class="mtv-countdown">—</em></span>
          <span class="mtv-conquest-line"><strong id="mtvConquestPct">0%</strong><small id="mtvConquestCount">0 / 0語 制覇</small></span>
          <span id="mtvConquestBar" class="mtv-stack-bar" aria-hidden="true"></span>
          <small id="mtvPace" class="mtv-pace">—</small>
          <em class="mtv-link">マップを見る →</em>
        </button>
        <button id="mtvDailyCard" class="plus-panel mtv-daily-card" type="button">
          <span class="plus-kicker">今日の目標</span>
          <span class="mtv-medals" aria-hidden="true">
            <span id="mtvMedalBronze" class="mtv-medal bronze">🥉</span>
            <span id="mtvMedalSilver" class="mtv-medal silver">🥈</span>
            <span id="mtvMedalGold" class="mtv-medal gold">🥇</span>
          </span>
          <small id="mtvDailyText">1問で銅メダル</small>
          <span class="mtv-mission-line"><span id="mtvMissionIcon">⚙️</span> <span id="mtvMissionName">本日の作戦</span><b id="mtvMissionDone" class="hidden">✓</b></span>
        </button>
      `);
    }

    const sidePanel = document.querySelector('#hudMode')?.closest('.kv');
    if (sidePanel && !$id('mtvHudRank')) {
      sidePanel.insertAdjacentHTML('afterend', '<div class="kv"><span>RANK</span><strong id="mtvHudRank">二等兵</strong></div>');
    }

    const hud = document.querySelector('#battleShell .battle-hud');
    if (hud && !$id('mtvGhostChip')) {
      const timer = $id('timerPill');
      const chip = document.createElement('span');
      chip.id = 'mtvGhostChip';
      chip.className = 'pill mtv-ghost-chip hidden';
      chip.setAttribute('aria-live', 'off');
      hud.insertBefore(chip, timer);
    }
    const shell = $id('battleShell');
    if (shell && !$id('mtvBattlePings')) {
      shell.insertAdjacentHTML('beforeend', '<div id="mtvBattlePings" class="mtv-battle-pings" aria-live="polite"></div>');
    }

    const resetActions = document.querySelector('#resetLayer .modal-actions');
    if (resetActions && !$id('resetMotivation')) {
      resetActions.insertAdjacentHTML('beforebegin', `
        <label class="toggle plus-reset-option">
          <input id="resetMotivation" type="checkbox"> 階級・補給箱・装備・図鑑・ゴースト記録もリセットする
        </label>
      `);
    }

    if (!$id('mtvConquestLayer')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="mtvToasts" class="mtv-toasts" aria-live="polite"></div>

        <div id="mtvConquestLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvConquestTitle">
          <div class="modal wide mtv-modal">
            <div class="mtv-modal-head">
              <div><p class="plus-kicker">CONQUEST MAP</p><h2 id="mtvConquestTitle">制覇マップ</h2></div>
              <button class="icon-close" type="button" data-mtv-close aria-label="閉じる">×</button>
            </div>
            <div id="mtvConquestBody"></div>
            <div class="modal-actions">
              <button id="mtvConquestWeak" class="small-btn" type="button">苦手を一斉学習</button>
              <button class="primary-btn" type="button" data-mtv-close>閉じる</button>
            </div>
          </div>
        </div>

        <div id="mtvCardsLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvCardsTitle">
          <div class="modal wide mtv-modal">
            <div class="mtv-modal-head">
              <div><p class="plus-kicker">WORD CARD COLLECTION</p><h2 id="mtvCardsTitle">単語カード図鑑</h2></div>
              <button class="icon-close" type="button" data-mtv-close aria-label="閉じる">×</button>
            </div>
            <div id="mtvCardsSummary"></div>
            <div class="mtv-tabs" role="tablist" aria-label="カードの絞り込み">
              <button class="tab active" type="button" role="tab" aria-selected="true" data-card-filter="all">すべて</button>
              <button class="tab" type="button" role="tab" aria-selected="false" data-card-filter="owned">獲得済み</button>
              <button class="tab" type="button" role="tab" aria-selected="false" data-card-filter="locked">未獲得</button>
              <button class="tab" type="button" role="tab" aria-selected="false" data-card-filter="gold">金カード</button>
            </div>
            <div id="mtvCardGrid" class="mtv-card-grid"></div>
            <div class="modal-actions"><button class="primary-btn" type="button" data-mtv-close>閉じる</button></div>
          </div>
        </div>

        <div id="mtvHqLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvHqTitle">
          <div class="modal wide mtv-modal">
            <div class="mtv-modal-head">
              <div><p class="plus-kicker">HEADQUARTERS</p><h2 id="mtvHqTitle">司令部</h2></div>
              <button class="icon-close" type="button" data-mtv-close aria-label="閉じる">×</button>
            </div>
            <div id="mtvHqProfile" class="mtv-hq-profile"></div>
            <div class="mtv-tabs" role="tablist" aria-label="司令部のメニュー">
              <button class="tab active" type="button" role="tab" aria-selected="true" data-hq-tab="equip">装備</button>
              <button class="tab" type="button" role="tab" aria-selected="false" data-hq-tab="ranks">階級一覧</button>
              <button class="tab" type="button" role="tab" aria-selected="false" data-hq-tab="guide">戦功の集め方</button>
            </div>
            <div id="mtvHqBody"></div>
            <div class="modal-actions">
              <button id="mtvHqCrates" class="small-btn" type="button">📦 補給箱を開ける</button>
              <button class="primary-btn" type="button" data-mtv-close>閉じる</button>
            </div>
          </div>
        </div>

        <div id="mtvDailyLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvDailyTitle">
          <div class="modal mtv-modal">
            <div class="mtv-modal-head">
              <div><p class="plus-kicker">DAILY ORDERS</p><h2 id="mtvDailyTitle">今日の目標と作戦</h2></div>
              <button class="icon-close" type="button" data-mtv-close aria-label="閉じる">×</button>
            </div>
            <div id="mtvDailyBody"></div>
            <div class="modal-actions">
              <button id="mtvMissionDeploy" class="primary-btn" type="button">本日の作戦で出撃</button>
              <button class="ghost-btn" type="button" data-mtv-close>閉じる</button>
            </div>
          </div>
        </div>

        <div id="mtvReportLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvReportTitle">
          <div class="modal mtv-modal mtv-report-modal">
            <div class="mtv-modal-head">
              <div><p class="plus-kicker">WEEKLY REPORT</p><h2 id="mtvReportTitle">週間戦績カード</h2></div>
              <button class="icon-close" type="button" data-mtv-close aria-label="閉じる">×</button>
            </div>
            <p class="mtv-note">直近7日間の記録を1枚の画像にしました。保存してロイロノートのカードに貼れば、先生に提出できます。名前などの個人情報は入りません。</p>
            <div class="mtv-report-preview"><img id="mtvReportImage" alt="週間戦績カードの画像"></div>
            <p class="mtv-note small">画像を長押し（PCは右クリック）しても保存できます。</p>
            <div class="modal-actions">
              <button id="mtvReportShare" class="small-btn hidden" type="button">共有する</button>
              <button id="mtvReportSave" class="primary-btn" type="button">画像を保存</button>
              <button class="ghost-btn" type="button" data-mtv-close>閉じる</button>
            </div>
          </div>
        </div>

        <div id="mtvCrateLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvCrateTitle">
          <div class="modal mtv-modal mtv-crate-modal">
            <h2 id="mtvCrateTitle">補給箱</h2>
            <div id="mtvCrateStage" class="mtv-crate-stage"></div>
            <div class="modal-actions">
              <button id="mtvCrateEquip" class="small-btn hidden" type="button">装備する</button>
              <button id="mtvCrateOpen" class="primary-btn" type="button">開ける</button>
              <button class="ghost-btn" type="button" data-mtv-close>閉じる</button>
            </div>
          </div>
        </div>

        <div id="mtvCelebrateLayer" class="modal-layer mtv-layer hidden" role="dialog" aria-modal="true" aria-labelledby="mtvCelebrateTitle">
          <div class="modal mtv-modal mtv-celebrate-modal">
            <div id="mtvCelebrateIcon" class="mtv-celebrate-icon" aria-hidden="true">🎖️</div>
            <p id="mtvCelebrateTitle" class="mtv-celebrate-title">昇進！</p>
            <h2 id="mtvCelebrateHeading">—</h2>
            <p id="mtvCelebrateBody"></p>
            <p id="mtvCelebrateReward" class="mtv-celebrate-reward"></p>
            <div class="modal-actions"><button id="mtvCelebrateOk" class="primary-btn" type="button">OK</button></div>
          </div>
        </div>
      `);
    }
  }

  function setText(id, value) {
    const element = $id(id);
    if (element) element.textContent = String(value);
  }

  function stackBarHtml(summary) {
    if (!summary.total) return '';
    return CONQUEST_STATES.map((info, level) => {
      const share = summary.counts[level] / summary.total * 100;
      return share > 0 ? `<i style="width:${share.toFixed(2)}%;background:${info.color}" title="${info.label} ${summary.counts[level]}"></i>` : '';
    }).join('');
  }

  function renderDashboard() {
    if (!save || !$id('mtvRankStrip')) return;
    const info = rankInfo();
    setText('mtvEmblem', equippedItem('emblem')?.value || '⭐');
    setText('mtvRankName', displayName(info));
    const fill = $id('mtvXpFill');
    if (fill) fill.style.width = `${(info.progress * 100).toFixed(1)}%`;
    setText(
      'mtvXpText',
      info.next
        ? `${formatNumber(info.xp)} 戦功 · 次の「${info.next.name}」まで あと${formatNumber(info.toNext)}`
        : `${formatNumber(info.xp)} 戦功 · 最高階級`
    );
    renderCrateBadges();

    const summary = conquestSummary(activeSenses());
    const snapshotChanged = snapshotConquest(summary);
    const countdown = testCountdown();
    setText('mtvCountdown', countdown.short || countdown.label);
    $id('mtvCountdown')?.classList.toggle('urgent', countdown.phase === 'before' && countdown.days <= 7 || countdown.phase === 'during');
    setText('mtvConquestPct', `${summary.pct}%`);
    setText('mtvConquestCount', `${summary.conquered} / ${summary.total}語 制覇`);
    const bar = $id('mtvConquestBar');
    if (bar) bar.innerHTML = stackBarHtml(summary);
    setText('mtvPace', paceText(summary, countdown));

    const daily = dailyStatus();
    $id('mtvMedalBronze')?.classList.toggle('earned', daily.bronze);
    $id('mtvMedalSilver')?.classList.toggle('earned', daily.silver);
    $id('mtvMedalGold')?.classList.toggle('earned', daily.gold);
    setText(
      'mtvDailyText',
      !daily.bronze
        ? '1問答えて銅メダル'
        : !daily.silver
          ? `銀まで あと${DAILY.silverAttempts - daily.attempts}問`
          : !daily.gold
            ? `金：${daily.goldRule}`
            : '今日の目標 すべて達成！'
    );
    const mission = todayMission();
    setText('mtvMissionIcon', mission.icon);
    setText('mtvMissionName', `作戦：${mission.name}`);
    $id('mtvMissionDone')?.classList.toggle('hidden', !daily.mission);
    renderHudRank();
    // Rendering never overwrites newer data from another tab; it only saves
    // the conquest snapshot when that actually changed.
    if (snapshotChanged) persist();
  }

  function renderCrateBadges() {
    const count = mstate.crates.length;
    for (const id of ['mtvCrateCount']) {
      const badge = $id(id);
      if (!badge) continue;
      badge.textContent = String(count);
      badge.classList.toggle('hidden', count === 0);
    }
    $id('mtvCrateButton')?.classList.toggle('has-crates', count > 0);
    const hqButton = $id('mtvHqCrates');
    if (hqButton) {
      hqButton.disabled = count === 0;
      hqButton.textContent = count ? `📦 補給箱を開ける（${count}）` : '📦 未開封の補給箱なし';
    }
  }

  function renderHudRank() {
    setText('mtvHudRank', rankInfo().name);
  }

  function renderGhostChip() {
    const chip = $id('mtvGhostChip');
    if (!chip) return;
    const ghost = session && !session.finalized ? session.ghost : null;
    const inPlay = !gameStateIs('START');
    if (!ghost || !inPlay) {
      chip.classList.add('hidden');
      return;
    }
    chip.classList.remove('hidden');
    if (!session.attempts) {
      chip.textContent = `👻 ${ghost.label} ${ghost.score}点`;
      chip.className = 'pill mtv-ghost-chip';
      return;
    }
    const you = liveScore();
    chip.textContent = `👻 ${ghost.age}日前 ${ghost.score} ｜ 今 ${you}`;
    chip.className = `pill mtv-ghost-chip ${you > ghost.score ? 'ahead' : you < ghost.score ? 'behind' : ''}`;
  }

  /* Toasts and in-battle pings ---------------------------------------- */

  function toast(message, kind = '') {
    const box = $id('mtvToasts');
    if (!box) return;
    const item = document.createElement('div');
    item.className = `mtv-toast ${kind}`;
    item.textContent = message;
    box.appendChild(item);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(() => item.classList.add('leaving'), 3400);
    setTimeout(() => item.remove(), 3900);
  }

  function battlePing(message, kind = '') {
    if (!ready) return;
    if (gameStateIs('START')) {
      toast(message, kind);
      return;
    }
    const box = $id('mtvBattlePings');
    if (!box) return;
    const item = document.createElement('div');
    item.className = `mtv-ping ${kind}`;
    item.textContent = message;
    box.appendChild(item);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => item.remove(), save?.settings?.reducedMotion ? 1800 : 2300);
  }

  function announceStreakNotices(notices = streak.takeNotices?.() || []) {
    for (const notice of notices) {
      if (notice.type === 'ticket-earned') {
        toast(`🎫 ${notice.streak}日連続！保険チケットを獲得（${notice.tickets}枚所持）`, 'daily');
      } else if (notice.type === 'ticket-full') {
        toast(`🎫 ${notice.streak}日連続！保険チケットは最大${streak.MAX_TICKETS}枚まで持てます`, 'daily');
      } else if (notice.type === 'ticket-used') {
        const dates = (notice.dates || []).map(key => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`).join('・');
        toast(`🎫 保険チケットで${dates}の休みをカバー！継続${notice.streak}日を守りました`, 'daily');
      }
    }
  }

  /* Result panel ------------------------------------------------------ */

  function resultPanelHtml(summary) {
    const info = rankInfo();
    const chips = [];
    if (summary) {
      chips.push(`<span class="mtv-res-chip xp">+${formatNumber(summary.xp)} 戦功</span>`);
      if (summary.conquest.total && (summary.conquest.pct > 0 || summary.conquestDelta !== 0)) {
        const delta = summary.conquestDelta;
        chips.push(`<span class="mtv-res-chip conquest">制覇 ${summary.conquest.pct}%${delta ? `（${delta > 0 ? '+' : ''}${delta}語）` : ''}</span>`);
      }
      if (summary.newCards || summary.newGolds) {
        chips.push(`<span class="mtv-res-chip card">📖 カード +${summary.newCards}${summary.newGolds ? `・金 +${summary.newGolds}` : ''}</span>`);
      }
      if (summary.crates) chips.push(`<span class="mtv-res-chip crate">📦 補給箱 +${summary.crates}</span>`);
      for (const tier of summary.dailyTiers) {
        chips.push(`<span class="mtv-res-chip daily">${tier === 'gold' ? '🥇 今日の目標「金」' : '🥈 今日の目標「銀」'}</span>`);
      }
      if (summary.missionCleared) chips.push('<span class="mtv-res-chip mission">🎯 本日の作戦 成功</span>');
      for (const rank of summary.rankUps) chips.push(`<span class="mtv-res-chip rank">🎖️ ${esc(rank)}に昇進</span>`);
    }
    const ghost = summary?.ghost;
    const ghostHtml = ghost
      ? `<div class="mtv-ghost-result ${ghost.outcome}">
          <strong>${ghost.outcome === 'win' ? '👻 ゴースト戦 WIN!' : ghost.outcome === 'lose' ? '👻 ゴースト戦 LOSE…' : '👻 ゴースト戦 DRAW'}</strong>
          <span>今回 ${ghost.you}点（${ghost.accuracyNow}%・${(ghost.averageNow / 1000).toFixed(1)}秒） vs ${esc(ghost.label)} ${ghost.score}点（${ghost.accuracy}%・${(ghost.averageMs / 1000).toFixed(1)}秒）${ghost.outcome === 'win' && ghost.rewarded ? ` ・ +${XP.ghostWin}戦功` : ''}</span>
        </div>`
      : '';
    const events = (summary?.events || []).map(event => `<li>${esc(event)}</li>`).join('');
    const crates = mstate.crates.length;
    return `
      <section id="mtvResultPanel" class="mtv-result-panel" aria-label="今回の戦果">
        <div class="mtv-res-rank">
          <span class="mtv-emblem small" aria-hidden="true">${esc(equippedItem('emblem')?.value || '⭐')}</span>
          <div>
            <strong>${esc(displayName(info))}</strong>
            <span class="mtv-xp-bar"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></span>
            <small>${info.next ? `次の「${esc(info.next.name)}」まで あと${formatNumber(info.toNext)}戦功` : '最高階級に到達'}</small>
          </div>
          ${crates ? `<button class="primary-btn mtv-res-crate" type="button" data-mtv-open-crate>📦 補給箱を開ける ×${crates}</button>` : ''}
        </div>
        ${chips.length ? `<div class="mtv-res-chips">${chips.join('')}</div>` : ''}
        ${ghostHtml}
        ${events ? `<ul class="mtv-res-events">${events}</ul>` : ''}
      </section>
    `;
  }

  function injectResultPanel() {
    const layer = $id('resultLayer');
    const content = $id('resultContent');
    if (!layer || !content || layer.classList.contains('hidden')) return;
    if (content.querySelector('#mtvResultPanel')) return;
    if (!lastSummary && !mstate.crates.length) return;
    content.insertAdjacentHTML('afterbegin', resultPanelHtml(lastSummary));
  }

  function refreshResultPanel() {
    const panel = $id('mtvResultPanel');
    if (!panel) return;
    panel.remove();
    injectResultPanel();
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
          const summary = finalizeSession();
          if (summary?.notices?.length) announceStreakNotices(summary.notices);
        } catch (error) {
          console.warn('Motivation result hook failed:', error);
        }
        injectResultPanel();
        setTimeout(showNextCelebration, save?.settings?.reducedMotion ? 60 : 450);
      }
      wasVisible = visible;
    }).observe(layer, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => injectResultPanel()).observe(content, { childList: true });
    content.addEventListener('click', event => {
      if (event.target.closest('[data-mtv-open-crate]')) openCrateLayer();
    });
  }

  /* Layers ------------------------------------------------------------ */

  const layerOpeners = new Map();

  function firstUsableButton(root) {
    return [...(root?.querySelectorAll('button') || [])].find(button => !button.disabled && button.offsetParent !== null) || null;
  }

  function openLayer(id) {
    const opener = document.activeElement;
    openModal(`#${id}`);
    layerOpeners.set(id, opener);
    // The engine focuses the first button, which can be a hidden one.
    setTimeout(() => {
      const layer = $id(id);
      if (!layer || layer.classList.contains('hidden') || layer.contains(document.activeElement)) return;
      const preferred = id === 'mtvCrateLayer' ? $id('mtvCrateOpen') : null;
      (preferred && !preferred.disabled ? preferred : firstUsableButton(layer.querySelector('.modal-actions')) || firstUsableButton(layer))?.focus();
    }, 30);
  }

  function restoreFocusAfter(id) {
    const opener = layerOpeners.get(id);
    layerOpeners.delete(id);
    setTimeout(() => {
      if (opener?.isConnected && opener.offsetParent !== null && !opener.disabled) {
        opener.focus();
        return;
      }
      const top = topMtvLayer();
      if (top) {
        firstUsableButton(top)?.focus();
        return;
      }
      const result = $id('resultLayer');
      if (result && !result.classList.contains('hidden')) {
        (result.querySelector('[data-mtv-open-crate]') || $id('nextStage'))?.focus();
      }
    }, 0);
  }

  function closeMtvLayer(id) {
    const layer = $id(id);
    if (!layer || layer.classList.contains('hidden')) return;
    closeLayer(`#${id}`);
    if (id === 'mtvCrateLayer') {
      renderDashboard();
      refreshResultPanel();
      if (!$id('mtvHqLayer')?.classList.contains('hidden')) renderHq();
    }
    restoreFocusAfter(id);
    setTimeout(showNextCelebration, 150);
  }

  function topMtvLayer() {
    const visible = LAYERS.map($id).filter(layer => layer && !layer.classList.contains('hidden'));
    return visible.sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0)).at(-1) || null;
  }

  /* Conquest layer */

  function openConquestLayer() {
    renderConquestLayer();
    openLayer('mtvConquestLayer');
  }

  function renderConquestLayer() {
    const body = $id('mtvConquestBody');
    if (!body) return;
    const list = activeSenses();
    const summary = conquestSummary(list);
    const countdown = testCountdown();
    const lessons = lessonMap();
    const groups = new Map();
    for (const sense of list) {
      const lesson = lessons.get(sense.english.toLowerCase());
      const key = lesson ? `L${lesson}` : '単語';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(sense);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => (parseInt(a[0].slice(1), 10) || 0) - (parseInt(b[0].slice(1), 10) || 0));
    const delta = conquestWeekDelta(summary);
    setText('mtvConquestTitle', `制覇マップ — ${currentRangeLabel()}`);
    body.innerHTML = `
      <div class="mtv-conquest-summary">
        <div class="mtv-conquest-big">
          <strong>${summary.pct}<small>%</small></strong>
          <span>${summary.conquered} / ${summary.total}語 制覇${delta !== null ? ` ・ 7日間で${delta >= 0 ? '+' : ''}${delta}語` : ''}</span>
        </div>
        <div class="mtv-conquest-side">
          <span class="mtv-countdown big ${countdown.phase === 'before' && countdown.days <= 7 || countdown.phase === 'during' ? 'urgent' : ''}">${esc(countdown.label)}</span>
          <p>${esc(paceText(summary, countdown))}</p>
        </div>
      </div>
      <div class="mtv-stack-bar big" aria-hidden="true">${stackBarHtml(summary)}</div>
      <ul class="mtv-legend">
        ${CONQUEST_STATES.map((info, level) => `<li><i style="background:${info.color}"></i>${info.label} <b>${summary.counts[level]}</b></li>`).join('')}
      </ul>
      <p class="mtv-note">「制覇」＝3回連続正解、「完全制覇」＝5回連続正解。間違えると「苦手」に戻ります。マスを押すと意味を確認できます。</p>
      <div class="mtv-map">
        ${sortedGroups.map(([label, senses]) => `
          <div class="mtv-map-row">
            <span class="mtv-map-label">${esc(label)}</span>
            <span class="mtv-map-cells">
              ${senses.map(sense => {
                const level = conquestLevel(sense);
                return `<button type="button" class="mtv-cell l${level}" data-sense-id="${esc(sense.senseId)}" title="${esc(sense.english)}（${CONQUEST_STATES[level].label}）" aria-label="${esc(sense.english)}、${CONQUEST_STATES[level].label}"></button>`;
              }).join('')}
            </span>
          </div>
        `).join('')}
      </div>
    `;
    const weakButton = $id('mtvConquestWeak');
    if (weakButton) weakButton.classList.toggle('hidden', !list.some(sense => save.progress[sense.senseId]?.incorrectCount > 0));
  }

  /* Cards layer */

  let cardFilter = 'all';

  function openCardsLayer() {
    renderCardsLayer();
    openLayer('mtvCardsLayer');
  }

  function renderCardsLayer() {
    const list = activeSenses();
    const summary = cardSummary(list);
    const milestone = nextMilestone(summary);
    const lessons = lessonMap();
    setText('mtvCardsTitle', `単語カード図鑑 — ${currentRangeLabel()}`);
    const summaryBox = $id('mtvCardsSummary');
    if (summaryBox) {
      summaryBox.innerHTML = `
        <div class="mtv-cards-summary">
          <div><span>獲得</span><strong>${summary.owned}<small> / ${summary.total}</small></strong></div>
          <div><span>金カード</span><strong class="gold">${summary.gold}</strong></div>
          <div><span>BOSS撃破</span><strong class="boss">${summary.boss}</strong></div>
          <div class="wide"><span>次の達成報酬</span><strong class="small">${milestone?.ineligible ? `達成報酬は${MILESTONE_MIN_WORDS}語以上のリストが対象です` : milestone ? (milestone.remaining ? `あと${milestone.remaining}枚で${milestone.pct}% → ${milestone.pct === 100 ? '特別' : '強化'}補給箱` : `${milestone.pct}% 達成！`) : 'コンプリート済み 🏆'}</strong></div>
        </div>
        <p class="mtv-note">ボス戦で倒すか、3回連続正解でカード獲得。5回連続正解で金カードに進化します。</p>
      `;
    }
    for (const button of document.querySelectorAll('[data-card-filter]')) {
      const active = button.dataset.cardFilter === cardFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    const tierOf = sense => mstate.cards[sense.senseId]?.t || 0;
    const filtered = list.filter(sense => {
      const card = mstate.cards[sense.senseId];
      if (cardFilter === 'owned') return Boolean(card);
      if (cardFilter === 'locked') return !card;
      if (cardFilter === 'gold') return card?.t >= 2;
      return true;
    }).map((sense, index) => ({ sense, index }))
      .sort((a, b) => tierOf(b.sense) - tierOf(a.sense) || a.index - b.index)
      .map(entry => entry.sense);
    const grid = $id('mtvCardGrid');
    if (!grid) return;
    grid.innerHTML = filtered.length
      ? filtered.map(sense => {
        const card = mstate.cards[sense.senseId];
        const lesson = lessons.get(sense.english.toLowerCase());
        const tierClass = card ? (card.t >= 2 ? 'gold' : 'silver') : 'locked';
        return `
          <button type="button" class="mtv-word-card ${tierClass}" data-sense-id="${esc(sense.senseId)}" aria-label="${esc(sense.english)}${card ? '' : '（未獲得）'}">
            <span class="mtv-card-top">${lesson ? `<em>L${lesson}</em>` : '<em>WORD</em>'}${card?.b ? '<b class="boss">BOSS</b>' : ''}${card?.t >= 2 ? '<b class="star">★</b>' : ''}</span>
            <strong>${esc(sense.english)}</strong>
            <small>${card ? esc(sense.shortMeaning) : '？？？'}</small>
            <span class="mtv-card-pos">${esc(sense.pos)}</span>
          </button>
        `;
      }).join('')
      : '<p class="mtv-empty">該当するカードはまだありません。</p>';
  }

  /* HQ layer */

  let hqTab = 'equip';

  function openHqLayer() {
    renderHq();
    openLayer('mtvHqLayer');
  }

  function renderHq() {
    const info = rankInfo();
    const collection = collectionCount();
    const profile = $id('mtvHqProfile');
    if (profile) {
      profile.innerHTML = `
        <span class="mtv-emblem big" aria-hidden="true">${esc(equippedItem('emblem')?.value || '⭐')}</span>
        <div>
          <strong>${esc(displayName(info))}</strong>
          <span class="mtv-xp-bar"><i style="width:${(info.progress * 100).toFixed(1)}%"></i></span>
          <small>${formatNumber(info.xp)} 戦功${info.next ? ` · 次の「${esc(info.next.name)}」まで あと${formatNumber(info.toNext)}` : ' · 最高階級'}</small>
          <small>コレクション ${collection.owned} / ${collection.total} · 開けた補給箱 ${mstate.cratesOpened}個 · ゴースト戦 ${mstate.ghost.wins}勝${mstate.ghost.losses}敗</small>
        </div>
      `;
    }
    for (const button of document.querySelectorAll('[data-hq-tab]')) {
      const active = button.dataset.hqTab === hqTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    const body = $id('mtvHqBody');
    if (!body) return;
    if (hqTab === 'ranks') {
      body.innerHTML = `<ol class="mtv-rank-list">${RANKS.map((rank, index) => `
        <li class="${index === info.index ? 'current' : index < info.index ? 'done' : ''}">
          <span>${index < info.index ? '✓' : index === info.index ? '▶' : '・'}</span>
          <strong>${esc(rank.name)}</strong>
          <small>${formatNumber(rank.xp)} 戦功</small>
        </li>`).join('')}</ol>`;
    } else if (hqTab === 'guide') {
      body.innerHTML = `
        <ul class="mtv-guide">
          <li><b>正解</b> +${XP.correct}（前から苦手だった単語なら +${XP.correct + XP.weakBonus}。同じ回で間違えた単語を後で正解したときは +${XP.freshReview}）</li>
          <li><b>不正解・時間切れ</b> 0（わざと間違えても戦功は増えません）</li>
          <li><b>ボス撃破</b> +${XP.bossPhase} ／ <b>ステージクリア</b> +${XP.stageClear} ／ <b>一斉学習の完走</b> 最大 +${XP.runClear}（正解${FULL_RUN_ATTEMPTS}問で満額）</li>
          <li><b>新しいカード</b> +${XP.newCard} ／ <b>金カード</b> +${XP.goldCard}</li>
          <li><b>今日の目標</b> 銀 +${XP.silver} ・ 金 +${XP.gold} ／ <b>本日の作戦</b> +${XP.mission}</li>
          <li><b>ゴースト戦の勝利</b> +${XP.ghostWin}（1日${GHOST_REWARDS_PER_DAY}回まで）</li>
        </ul>
        <p class="mtv-note">補給箱は、前から苦手だった単語を倒したとき・ボスを倒したときに出やすくなります。昇進や図鑑の達成（${MILESTONE_MIN_WORDS}語以上のリスト）でも必ずもらえます。同じアイテムが出たら戦功に変わります。わざと間違えても得はしません。</p>
      `;
    } else {
      body.innerHTML = Object.entries(ITEM_TYPES).map(([type, meta]) => {
        const rarityOrder = id => RARITIES.findIndex(rarity => rarity.id === id);
        const items = ITEMS.filter(item => item.type === type)
          .map((item, index) => ({ item, index }))
          .sort((a, b) =>
            Number(mstate.equipped[type] === b.item.id) - Number(mstate.equipped[type] === a.item.id)
            || Number(ownsItem(b.item.id)) - Number(ownsItem(a.item.id))
            || rarityOrder(a.item.rarity) - rarityOrder(b.item.rarity)
            || a.index - b.index)
          .map(entry => entry.item);
        return `
          <section class="mtv-equip-section">
            <h3>${meta.icon} ${meta.label} <small>${items.filter(item => ownsItem(item.id)).length} / ${items.length}</small></h3>
            <div class="mtv-item-grid">
              ${items.map(item => {
                const owned = ownsItem(item.id);
                const equipped = mstate.equipped[type] === item.id;
                const rarity = rarityInfo(item.rarity);
                return `
                  <button type="button" class="mtv-item ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''} r-${item.rarity}"
                          data-item-id="${esc(item.id)}" ${owned ? '' : 'disabled'} style="--rarity:${rarity.color}"
                          aria-label="${esc(item.name)}${owned ? (equipped ? '（装備中）' : '') : '（未入手）'}">
                    <span class="mtv-item-icon">${owned ? itemIconHtml(item) : '？'}</span>
                    <span class="mtv-item-name">${owned ? esc(item.name) : '未入手'}</span>
                    <span class="mtv-item-rarity">${item.starter ? '初期装備' : rarity.label}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </section>
        `;
      }).join('');
    }
    renderCrateBadges();
  }

  function itemIconHtml(item) {
    if (item.type === 'emblem') return esc(item.value);
    if (item.type === 'title') return '🎖️';
    if (item.type === 'color') {
      const palette = SQUAD_COLORS[item.value] || SQUAD_COLORS.standard;
      const fill = palette.rainbow ? 'linear-gradient(90deg,#ff4d6d,#ffd166,#50eea8,#43d9ff,#c77dff)' : palette.main;
      return `<i class="mtv-swatch" style="background:${fill};border-color:${palette.stroke}"></i>`;
    }
    const theme = THEMES[item.value] || THEMES.night;
    return `<i class="mtv-swatch theme" style="background:linear-gradient(180deg,${theme.sky[0]},${theme.sky[1]} 55%,${theme.road[0]})"></i>`;
  }

  /* Daily layer */

  function openDailyLayer() {
    renderDailyLayer();
    openLayer('mtvDailyLayer');
  }

  function renderDailyLayer() {
    const body = $id('mtvDailyBody');
    if (!body) return;
    const daily = dailyStatus();
    const mission = todayMission();
    const availability = missionAvailability(mission);
    const tomorrow = todayMission(shiftKey(todayKey(), 1));
    const row = (earned, medal, label, detail, reward) => `
      <li class="${earned ? 'earned' : ''}">
        <span class="mtv-medal-big">${medal}</span>
        <div><strong>${label}</strong><small>${detail}</small></div>
        <em>${earned ? '達成 ✓' : reward}</em>
      </li>`;
    body.innerHTML = `
      <ul class="mtv-daily-list">
        ${row(daily.bronze, '🥉', '銅：1問に答える', `今日 ${daily.attempts}問 · 継続日数が1日伸びます`, '継続+1日')}
        ${row(daily.silver, '🥈', `銀：${DAILY.silverAttempts}問に答える`, `${Math.min(daily.attempts, DAILY.silverAttempts)} / ${DAILY.silverAttempts}問（リスニングも含む）`, `+${XP.silver}戦功`)}
        ${row(daily.gold, '🥇', esc(daily.goldLabel), esc(daily.goldRule), `+${XP.gold}・強化補給箱`)}
      </ul>
      <section class="mtv-mission-box ${daily.mission ? 'done' : ''}">
        <p class="plus-kicker">本日の作戦</p>
        <h3><span>${mission.icon}</span> ${esc(mission.name)} ${daily.mission ? '<b>クリア済み ✓</b>' : ''}</h3>
        <p>${esc(mission.rule)}。1ステージを正答率${MISSION_CLEAR_ACCURACY}%以上でクリアすると作戦成功。</p>
        ${availability.degraded ? `<p class="mtv-note small">※ ${esc(DEGRADED_TEXT[availability.reason])}。</p>` : ''}
        <p class="mtv-reward-line">報酬：${availability.degraded ? '強化補給箱' : '特別補給箱'} + ${XP.mission}戦功（1日1回）</p>
        <p class="mtv-note small">明日の作戦：${tomorrow.icon} ${esc(tomorrow.name)}</p>
      </section>
    `;
    const deploy = $id('mtvMissionDeploy');
    if (deploy) deploy.textContent = daily.mission ? '本日の作戦をもう一度' : '本日の作戦で出撃';
  }

  function deployMission() {
    closeMtvLayer('mtvDailyLayer');
    save.selectedMode = 'daily';
    saveProgress();
    renderModeGrid();
    startGame();
  }

  function decorateMissionCard() {
    const grid = $id('modeGrid');
    const card = grid?.querySelector('.mode-card[data-mode="daily"]');
    if (!card) return;
    const mission = todayMission();
    const done = ensureDaily().mission;
    card.classList.add('mtv-mission-card');
    card.classList.toggle('done', done);
    const strong = card.querySelector('strong');
    const small = card.querySelector('small');
    if (strong) strong.textContent = `${mission.icon} 本日の作戦：${mission.name}`;
    if (small) {
      const availability = missionAvailability(mission);
      const note = availability.degraded ? `（${DEGRADED_TEXT[availability.reason]}）` : '';
      const reward = availability.degraded ? '強化補給箱' : '特別補給箱';
      small.textContent = `${mission.rule}${note}。正答率${MISSION_CLEAR_ACCURACY}%以上で1ステージクリアすると作戦成功。${done ? '本日クリア済み ✓' : `報酬：${reward}＋${XP.mission}戦功`}`;
    }
    grid.prepend(card);
  }

  /* Report layer */

  let reportBlobUrl = '';

  function openReportLayer() {
    const canvas = document.createElement('canvas');
    drawReportCard(canvas);
    const image = $id('mtvReportImage');
    if (image) image.src = canvas.toDataURL('image/png');
    $id('mtvReportLayer').dataset.ready = '1';
    openReportLayer.canvas = canvas;
    const shareButton = $id('mtvReportShare');
    if (shareButton) {
      let canShareFiles = false;
      try {
        canShareFiles = Boolean(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] }));
      } catch {}
      shareButton.classList.toggle('hidden', !canShareFiles);
    }
    openLayer('mtvReportLayer');
  }

  function reportFileName() {
    return `word-frontline-weekly-${todayKey()}.png`;
  }

  function saveReport() {
    const canvas = openReportLayer.canvas;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      if (reportBlobUrl) URL.revokeObjectURL(reportBlobUrl);
      reportBlobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = reportBlobUrl;
      link.download = reportFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('週間戦績カードを保存しました', 'info');
    }, 'image/png');
  }

  function shareReport() {
    const canvas = openReportLayer.canvas;
    if (!canvas) return;
    canvas.toBlob(async blob => {
      if (!blob) return;
      try {
        const file = new File([blob], reportFileName(), { type: 'image/png' });
        await navigator.share({ files: [file], title: 'WORD FRONTLINE 週間戦績カード' });
      } catch (error) {
        if (error?.name !== 'AbortError') toast('共有できませんでした。「画像を保存」を使ってください', 'info');
      }
    }, 'image/png');
  }

  /* Crate layer */

  let lastOpened = null;

  function openCrateLayer() {
    lastOpened = null;
    renderCrateStage();
    openLayer('mtvCrateLayer');
  }

  function renderCrateStage(result = null) {
    const stage = $id('mtvCrateStage');
    const openButton = $id('mtvCrateOpen');
    const equipButton = $id('mtvCrateEquip');
    if (!stage || !openButton || !equipButton) return;
    const next = mstate.crates[0];
    equipButton.classList.add('hidden');
    if (result) {
      const rarity = rarityInfo(result.rarity);
      const type = ITEM_TYPES[result.item.type];
      stage.innerHTML = `
        <div class="mtv-reveal r-${result.rarity}" style="--rarity:${rarity.color}">
          <span class="mtv-reveal-rarity">${rarity.label}</span>
          <span class="mtv-reveal-icon">${itemIconHtml(result.item)}</span>
          <strong>${esc(result.item.type === 'title' ? `「${result.item.name}」` : result.item.name)}</strong>
          <small>${type.icon} ${type.label}</small>
          <em class="${result.duplicate ? 'dup' : 'new'}">${result.duplicate ? `所持済み → +${result.bonusXp}戦功` : 'NEW!'}</em>
        </div>
        <p class="mtv-note small">${next ? `残り ${mstate.crates.length}個` : '未開封の補給箱はありません'}</p>
      `;
      const equipped = mstate.equipped[result.item.type] === result.item.id;
      equipButton.classList.toggle('hidden', equipped);
      equipButton.dataset.itemId = result.item.id;
      openButton.textContent = next ? `次を開ける（残り${mstate.crates.length}）` : '開封完了';
      openButton.disabled = !next;
      return;
    }
    if (!next) {
      stage.innerHTML = `
        <div class="mtv-crate-empty">
          <span aria-hidden="true">📦</span>
          <p>未開封の補給箱はありません。</p>
          <small>苦手単語やボスを倒すと出やすくなります。</small>
        </div>`;
      openButton.textContent = '開ける';
      openButton.disabled = true;
      return;
    }
    const grade = CRATE_GRADES[next.grade] || CRATE_GRADES.base;
    stage.innerHTML = `
      <div class="mtv-crate g-${next.grade}" aria-hidden="true"><i></i><b></b></div>
      <strong class="mtv-crate-name">${grade.label}</strong>
      <small class="mtv-crate-source">${esc(SOURCE_LABELS[next.source] || '')} ・ 残り${mstate.crates.length}個</small>
    `;
    openButton.textContent = '開ける';
    openButton.disabled = false;
  }

  function handleCrateOpen() {
    const openButton = $id('mtvCrateOpen');
    if (!mstate.crates.length || openButton?.dataset.busy === '1') return;
    const crateEl = document.querySelector('#mtvCrateStage .mtv-crate');
    const reveal = () => {
      lastOpened = openNextCrate();
      if (openButton) openButton.dataset.busy = '';
      renderCrateStage(lastOpened);
      renderCrateBadges();
    };
    if (crateEl && !save?.settings?.reducedMotion) {
      if (openButton) openButton.dataset.busy = '1';
      crateEl.classList.add('opening');
      setTimeout(reveal, 650);
    } else if (!crateEl) {
      renderCrateStage();
      setTimeout(handleCrateOpen, 0);
    } else {
      reveal();
    }
  }

  /* Celebrations */

  function showNextCelebration() {
    const layer = $id('mtvCelebrateLayer');
    if (!layer || !layer.classList.contains('hidden') || !celebrations.length) return;
    if (gameStateIs('ANSWERING', 'QUESTION_INTRO', 'RESOLVING', 'REWARD', 'BOSS_PHASE', 'ANSWER_LOCKED')) return;
    if (topMtvLayer()) return;
    const item = celebrations.shift();
    setText('mtvCelebrateIcon', item.icon);
    setText('mtvCelebrateTitle', item.title);
    setText('mtvCelebrateHeading', item.heading);
    setText('mtvCelebrateBody', item.body);
    setText('mtvCelebrateReward', item.reward ? `🎁 ${item.reward}` : '');
    layer.dataset.kind = item.type;
    openLayer('mtvCelebrateLayer');
    refreshResultPanel();
    renderDashboard();
  }

  /* Wiring ------------------------------------------------------------ */

  function wireEvents() {
    $id('mtvRankButton')?.addEventListener('click', openHqLayer);
    $id('mtvHqButton')?.addEventListener('click', openHqLayer);
    $id('mtvCrateButton')?.addEventListener('click', openCrateLayer);
    $id('mtvCardsButton')?.addEventListener('click', openCardsLayer);
    $id('mtvReportButton')?.addEventListener('click', openReportLayer);
    $id('mtvConquestCard')?.addEventListener('click', openConquestLayer);
    $id('mtvDailyCard')?.addEventListener('click', openDailyLayer);
    $id('mtvMissionDeploy')?.addEventListener('click', deployMission);
    $id('mtvHqCrates')?.addEventListener('click', openCrateLayer);
    $id('mtvCrateOpen')?.addEventListener('click', handleCrateOpen);
    $id('mtvCrateEquip')?.addEventListener('click', event => {
      if (equipItem(event.currentTarget.dataset.itemId)) {
        event.currentTarget.classList.add('hidden');
        toast('装備しました', 'info');
      }
    });
    $id('mtvReportSave')?.addEventListener('click', saveReport);
    $id('mtvReportShare')?.addEventListener('click', shareReport);
    $id('mtvCelebrateOk')?.addEventListener('click', () => closeMtvLayer('mtvCelebrateLayer'));
    $id('mtvConquestWeak')?.addEventListener('click', () => {
      closeMtvLayer('mtvConquestLayer');
      const start = $id('startWeakRun');
      if (start) start.click();
    });

    for (const id of LAYERS) {
      const layer = $id(id);
      if (!layer) continue;
      layer.addEventListener('click', event => {
        if (event.target === layer && id !== 'mtvCelebrateLayer') {
          closeMtvLayer(id);
          return;
        }
        if (event.target.closest('[data-mtv-close]')) closeMtvLayer(id);
      });
    }

    $id('mtvConquestBody')?.addEventListener('click', event => {
      const cell = event.target.closest('[data-sense-id]');
      if (!cell) return;
      const sense = activeSenses().find(item => item.senseId === cell.dataset.senseId);
      if (sense) openDetail(sense);
    });
    $id('mtvCardGrid')?.addEventListener('click', event => {
      const cardButton = event.target.closest('[data-sense-id]');
      if (!cardButton || !mstate.cards[cardButton.dataset.senseId]) return;
      const sense = activeSenses().find(item => item.senseId === cardButton.dataset.senseId);
      if (sense) openDetail(sense);
    });
    document.querySelector('#mtvCardsLayer .mtv-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-card-filter]');
      if (!button) return;
      cardFilter = button.dataset.cardFilter;
      renderCardsLayer();
    });
    document.querySelector('#mtvHqLayer .mtv-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-hq-tab]');
      if (!button) return;
      hqTab = button.dataset.hqTab;
      renderHq();
    });
    $id('mtvHqBody')?.addEventListener('click', event => {
      const button = event.target.closest('[data-item-id]');
      if (!button || button.disabled) return;
      if (equipItem(button.dataset.itemId)) renderHq();
    });

    // 苦手を一斉学習 from the weak list (also used by the conquest map) starts a
    // rapid run without startStage. Close the interrupted stage first, before
    // v2 builds the weak deck from senseList.
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('#startWeakRun')) return;
      restorePool();
      if (session && !session.finalized) session = null;
      lastSummary = null;
    }, true);

    // Our dialogs sit above the game: keep Enter / number keys from reaching
    // the game while one is open, and let Escape close the top one.
    document.addEventListener('keydown', event => {
      const top = topMtvLayer();
      if (!top) return;
      if (event.key === 'Escape') {
        if (!$id('detailLayer')?.classList.contains('hidden')) return;
        closeMtvLayer(top.id);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const tag = event.target?.tagName?.toLowerCase();
      if (event.key === 'Enter' && tag !== 'button') {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
      if (['1', '2', '3', '4', ' ', 'p', 'P'].includes(event.key) && tag !== 'button') {
        event.stopImmediatePropagation();
      }
    }, true);
  }

  /* ------------------------------------------------------------------ */
  /* Self tests                                                          */
  /* ------------------------------------------------------------------ */

  function runSelfTests() {
    const tests = [];
    const test = (name, check) => {
      try { tests.push({ name, ok: check() === true }); } catch (error) { tests.push({ name, ok: false, error: String(error) }); }
    };
    test('階級の必要戦功は昇順', () => RANKS.every((rank, index) => index === 0 || rank.xp > RANKS[index - 1].xp));
    test('階級の境界判定', () => rankIndexForXp(0) === 0 && rankIndexForXp(299) === 0 && rankIndexForXp(300) === 1 && rankIndexForXp(10 ** 7) === RANKS.length - 1);
    test('テスト日をすべて読み取れる', () => (data?.ranges || []).filter(range => range.id !== 'all').every(range => parseRangeDates(range, new Date(2026, 3, 10))));
    test('第5回のテストは10月26日', () => parseRangeDates({ date: '10月26–27日' }, new Date(2026, 9, 21))?.start === '2026-10-26');
    test('1月のテストは翌年として扱う', () => parseRangeDates({ date: '1月12–13日' }, new Date(2026, 9, 21))?.start === '2027-01-12');
    test('カウントダウンの日数', () => testCountdown({ id: 'exam-5', date: '10月26–27日' }, new Date(2026, 9, 21)).days === 5);
    test('テスト期間中の表示', () => testCountdown({ id: 'exam-5', date: '10月26–27日' }, new Date(2026, 9, 27)).phase === 'during');
    test('作戦は8日間すべて違う', () => {
      const ids = Array.from({ length: MISSIONS.length }, (_, index) => todayMission(shiftKey('2026-10-21', index)).id);
      return new Set(ids).size === MISSIONS.length;
    });
    test('作戦は同じ日なら同じ', () => todayMission('2026-10-21').id === todayMission('2026-10-21').id);
    test('動詞判定は助動詞を除く', () => isVerbSense({ pos: '他動詞／名詞' }) && !isVerbSense({ pos: '助動詞／名詞' }));
    test('レア度の抽選は表の範囲内', () => ['base', 'boosted', 'premium'].every(grade =>
      [0, .3, .6, .9, .9999].every(value => RARITIES.some(rarity => rarity.id === rollRarity(grade, 0, () => value))))
    );
    test('特別補給箱からコモンは出ない', () => [0, .1, .2, .3].every(value => rollRarity('premium', 0, () => value) !== 'common'));
    test('天井でエピック以上が確定', () => rollRarity('base', PITY_LIMIT, () => .99) === 'epic' && rollRarity('base', PITY_LIMIT, () => .1) === 'legend');
    test('各レア度にアイテムがある', () => RARITIES.every(rarity => CRATE_ITEMS.some(item => item.rarity === rarity.id)));
    test('アイテムIDは重複しない', () => new Set(ITEMS.map(item => item.id)).size === ITEMS.length);
    test('テーマとカラーの参照先がある', () => ITEMS.every(item => item.type !== 'theme' || THEMES[item.value]) && ITEMS.every(item => item.type !== 'color' || SQUAD_COLORS[item.value]));
    test('ゴーストは約1週間前を選ぶ', () => {
      const battles = [
        { d: '2026-10-20', a: 10, c: 9, r: 2000, f: 'stage', rid: 'exam-5' },
        { d: '2026-10-14', a: 10, c: 7, r: 3000, f: 'stage', rid: 'exam-5' },
        { d: '2026-10-01', a: 10, c: 5, r: 4000, f: 'stage', rid: 'exam-5' }
      ];
      return pickGhost(battles, '2026-10-21', 'stage', 'exam-5')?.age === 7;
    });
    test('今日の記録はゴーストにしない', () => pickGhost([{ d: '2026-10-21', a: 5, c: 5, r: 1000, f: 'stage', rid: 'x' }], '2026-10-21', 'stage', 'x') === null);
    test('ゴースト得点は正答率と速さで増える', () => ghostScore(90, 2000) > ghostScore(80, 2000) && ghostScore(80, 2000) > ghostScore(80, 4000));
    test('制覇判定', () => {
      const old = save.progress.__mtv_probe__;
      try {
        save.progress.__mtv_probe__ = { ...defaultStats(), shownCount: 4, masteryLevel: 3, currentCorrectStreak: 3 };
        const conquered = conquestLevel({ senseId: '__mtv_probe__' }) === 3;
        save.progress.__mtv_probe__.lastWasIncorrect = true;
        const weak = conquestLevel({ senseId: '__mtv_probe__' }) === 1;
        return conquered && weak && conquestLevel({ senseId: '__mtv_none__' }) === 0;
      } finally {
        if (old) save.progress.__mtv_probe__ = old;
        else delete save.progress.__mtv_probe__;
      }
    });
    test('保存データの破損を安全に初期化', () => normalizeState('broken').xp === 0 && normalizeState({ xp: -5, crates: [{ grade: 'nope' }] }).crates.length === 0);
    test('週間戦績カードを描画できる', () => {
      const canvas = drawReportCard(document.createElement('canvas'));
      return canvas.width === 1080 && canvas.height === 1350;
    });
    test('本日の作戦モードを登録', () => MODES.daily?.short === '作戦');

    const passed = tests.filter(result => result.ok).length;
    window.__WORD_FRONTLINE_MOTIVATION_TESTS__ = { passed, total: tests.length, tests };
    console.group(`WORD FRONTLINE Motivation tests: ${passed}/${tests.length}`);
    for (const result of tests) (result.ok ? console.log : console.warn)(`${result.ok ? 'PASS' : 'FAIL'}: ${result.name}`, result.error || '');
    console.groupEnd();
    return tests;
  }

  /* ------------------------------------------------------------------ */
  /* Start-up                                                            */
  /* ------------------------------------------------------------------ */

  loadState();
  installHooks();
  installCosmetics();
  injectInterface();

  // Another tab saved newer data: adopt it before this tab can save over it.
  window.addEventListener('storage', event => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    loadState();
    if (ready) {
      renderDashboard();
      renderHudRank();
    }
  });

  // Players who studied before this update get the cards they already earned,
  // quietly (no XP, crates or celebrations; dated by when they last saw it).
  function backfillCards() {
    if (mstate.cardsBackfilled || !save?.progress) return;
    for (const [senseId, stats] of Object.entries(save.progress)) {
      if (!stats || mstate.cards[senseId]) continue;
      const level = conquestLevel({ senseId });
      if (level < 3) continue;
      const at = Math.max(0, Number(stats.lastShownAt) || 0);
      mstate.cards[senseId] = { t: level === 4 ? 2 : 1, b: 0, at, g: level === 4 ? at : 0 };
    }
    mstate.cardsBackfilled = true;
    persist();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureDaily();
    backfillCards();
    mstate.rankSeen = Math.max(mstate.rankSeen, rankIndexForXp(mstate.xp));
    wireEvents();
    watchResults();
    ready = true;
    renderModeGrid();
    renderDashboard();
    announceStreakNotices();
    runSelfTests();
    document.documentElement.dataset.studyPlusMotivation = MOTIVATION_VERSION;
  });

  window.WordFrontlineMotivation = Object.freeze({
    version: MOTIVATION_VERSION,
    rankInfo: () => ({ ...rankInfo() }),
    conquestSummary: () => conquestSummary(activeSenses()),
    cardSummary: () => cardSummary(activeSenses()),
    dailyStatus: () => dailyStatus(),
    todayMission: () => ({ ...todayMission() }),
    weeklyStats: () => weeklyStats(),
    pendingCrates: () => mstate.crates.length,
    missionPreview: id => {
      const mission = MISSIONS.find(item => item.id === id) || todayMission();
      const { pool, narrowed, fallback } = buildMissionPool(mission, activeSenses());
      return { id: mission.id, name: mission.name, count: pool.length, narrowed, fallback };
    },
    runSelfTests
  });
})();
