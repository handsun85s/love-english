import { LESSONS } from './content.js?v=20261103-fun';

export const STORAGE_KEY = 'little-english:progress:v1';
const DAY_INTERVALS = [0, 1, 3, 7, 14];
const MAX_SESSIONS = 1000;
const LESSON_IDS = new Set(LESSONS.map((lesson) => lesson.id));
const WORDS = LESSONS.flatMap((lesson) => lesson.words.map((word) => ({ ...word, lessonId: lesson.id, lessonTitle: lesson.title })));
const WORD_IDS = new Set(WORDS.map((word) => word.id));
const GAME_IDS = new Set(['delivery', 'pairs']);

function asDate(now = Date.now()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid date is required.');
  return date;
}

export function localDateKey(now = Date.now()) {
  const date = asDate(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function safeCount(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : fallback;
}

function own(object, key) {
  return object && typeof object === 'object' && Object.hasOwn(object, key);
}

export function createInitialState() {
  return {
    version: 1,
    lessonProgress: {},
    gameProgress: {},
    words: {},
    sessions: [],
    activityDays: [],
    settings: { slowAudio: true, name: '小小探险家' },
  };
}

// Only known lesson/word IDs and whitelisted scalar fields enter the app state.
// A malformed or newer save cannot overwrite object prototypes or break practice.
function normalizeState(input) {
  const state = createInitialState();
  if (!input || typeof input !== 'object' || input.version !== 1) return state;
  if (input.settings && typeof input.settings === 'object') {
    if (typeof input.settings.slowAudio === 'boolean') state.settings.slowAudio = input.settings.slowAudio;
    if (typeof input.settings.name === 'string' && input.settings.name.trim()) state.settings.name = input.settings.name.trim().slice(0, 30);
  }
  for (const id of LESSON_IDS) {
    if (!own(input.lessonProgress, id)) continue;
    const entry = input.lessonProgress[id];
    if (!entry || !validDate(entry.completedAt)) continue;
    state.lessonProgress[id] = {
      completedAt: new Date(entry.completedAt).toISOString(),
      completions: Math.max(1, safeCount(entry.completions, 1)),
    };
  }
  for (const id of WORD_IDS) {
    if (!own(input.words, id)) continue;
    const entry = input.words[id];
    if (!entry || !validDate(entry.dueAt)) continue;
    state.words[id] = {
      stage: Math.min(4, safeCount(entry.stage)),
      dueAt: new Date(entry.dueAt).toISOString(),
      successes: safeCount(entry.successes),
      attempts: safeCount(entry.attempts),
      lastPromotedOn: typeof entry.lastPromotedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.lastPromotedOn) ? entry.lastPromotedOn : null,
      lastPracticedAt: validDate(entry.lastPracticedAt) ? new Date(entry.lastPracticedAt).toISOString() : null,
    };
  }
  for (const id of GAME_IDS) {
    if (!own(input.gameProgress, id)) continue;
    const entry = input.gameProgress[id];
    if (!entry || !validDate(entry.completedAt)) continue;
    state.gameProgress[id] = {
      completedAt: new Date(entry.completedAt).toISOString(),
      plays: Math.max(1, safeCount(entry.plays, 1)),
    };
  }
  if (Array.isArray(input.sessions)) {
    state.sessions = input.sessions.filter((session) => session && LESSON_IDS.has(session.lessonId) && validDate(session.completedAt))
      .slice(-MAX_SESSIONS).map((session) => ({
        lessonId: session.lessonId,
        completedAt: new Date(session.completedAt).toISOString(),
        said: session.said === true,
      }));
  }
  if (Array.isArray(input.activityDays)) {
    state.activityDays = [...new Set(input.activityDays.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && validDate(`${day}T12:00:00`)))].sort().slice(-MAX_SESSIONS);
  }
  return state;
}

export function loadState(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const serialized = target?.getItem(STORAGE_KEY);
    return serialized ? normalizeState(JSON.parse(serialized)) : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function saveState(storage, state) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target || typeof target.setItem !== 'function') return { ok: false, error: '当前浏览器无法保存进度，本次仍可继续练习。' };
    target.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return { ok: true };
  } catch {
    return { ok: false, error: '进度暂时无法保存，本次仍可继续练习。请检查浏览器是否允许本地存储。' };
  }
}

function dueDate(now, days) {
  const date = asDate(now);
  if (days === 0) return date.toISOString();
  // Calendar days, rather than 24-hour durations, keep "tomorrow" local even at DST.
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function practiceWord(previous, correct, attempts, now) {
  const today = localDateKey(now);
  const entry = previous ? { ...previous } : { stage: 0, dueAt: dueDate(now, 0), successes: 0, attempts: 0, lastPromotedOn: null };
  entry.attempts += Math.max(1, safeCount(attempts, 1));
  entry.lastPracticedAt = asDate(now).toISOString();
  if (!correct) {
    entry.stage = 0;
    entry.dueAt = dueDate(now, 0);
    return entry;
  }
  entry.successes += 1;
  // Voluntary practice before a word is due is welcome, but cannot shortcut
  // the spacing schedule or keep pushing its due date into the future.
  if (entry.lastPromotedOn !== today && (!previous || localDateKey(previous.dueAt) <= today)) {
    entry.stage = Math.min(4, entry.stage + 1);
    entry.lastPromotedOn = today;
    entry.dueAt = dueDate(now, DAY_INTERVALS[entry.stage]);
  }
  return entry;
}

export function completeLesson(state, lessonId, results = {}, now = Date.now()) {
  if (!LESSON_IDS.has(lessonId)) return state;
  const next = normalizeState(state);
  const previous = next.lessonProgress[lessonId];
  const completedAt = asDate(now).toISOString();
  const today = localDateKey(now);
  const lesson = LESSONS.find((item) => item.id === lessonId);
  if (previous && localDateKey(previous.completedAt) === today) {
    // A replay earns no extra completion or promotion, but new difficulties
    // must still be remembered. Do not recount a failure already saved by UI.
    for (const word of lesson.words) {
      if (!own(results.wordResults, word.id)) continue;
      const result = results.wordResults[word.id];
      if (!result || result.correct !== false) continue;
      const entry = next.words[word.id];
      if (entry?.stage === 0 && entry.lastPracticedAt && localDateKey(entry.lastPracticedAt) === today) continue;
      next.words[word.id] = practiceWord(entry, false, result.attempts, now);
    }
    // Trying aloud later the same day can enrich that day's existing record.
    if (results.said === true) {
      const session = [...next.sessions].reverse().find((item) => item.lessonId === lessonId && localDateKey(item.completedAt) === today);
      if (session) session.said = true;
    }
    return next;
  }
  for (const word of lesson.words) {
    if (!own(results.wordResults, word.id)) continue;
    const result = results.wordResults[word.id];
    if (!result || typeof result.correct !== 'boolean') continue;
    const entry = next.words[word.id];
    // The UI persists an already-known word's first wrong answer immediately,
    // so leaving midway cannot hide it. Finishing must not count it twice.
    if (result.correct === false && result.recordedWrong === true && entry?.stage === 0 && entry.lastPracticedAt && localDateKey(entry.lastPracticedAt) === today) continue;
    next.words[word.id] = practiceWord(next.words[word.id], result.correct, result.attempts, now);
  }
  next.lessonProgress[lessonId] = { completedAt, completions: (previous?.completions ?? 0) + 1 };
  next.sessions = [...next.sessions, { lessonId, completedAt, said: results.said === true }].slice(-MAX_SESSIONS);
  next.activityDays = [...new Set([...next.activityDays, localDateKey(now)])].sort().slice(-MAX_SESSIONS);
  return next;
}

export function getDueWords(state, now = Date.now()) {
  const today = localDateKey(now);
  return WORDS.filter((word) => own(state?.words, word.id) && validDate(state.words[word.id].dueAt) && localDateKey(state.words[word.id].dueAt) <= today)
    .map((word) => ({ ...word, ...state.words[word.id] }))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function recordReview(state, wordId, correct, now = Date.now()) {
  if (!WORD_IDS.has(wordId) || typeof correct !== 'boolean' || !own(state?.words, wordId)) return state;
  const next = normalizeState(state);
  if (!next.words[wordId]) return next;
  next.words[wordId] = practiceWord(next.words[wordId], correct, 1, now);
  next.activityDays = [...new Set([...next.activityDays, localDateKey(now)])].sort().slice(-MAX_SESSIONS);
  return next;
}

// Games record exploration, independently of lesson completion or vocabulary
// confidence. Replaying for fun on one day does not multiply completion counts.
export function completeGame(state, gameId, now = Date.now()) {
  if (!GAME_IDS.has(gameId)) return state;
  const next = normalizeState(state);
  const completedAt = asDate(now).toISOString();
  const day = localDateKey(now);
  const previous = next.gameProgress[gameId];
  if (!previous || localDateKey(previous.completedAt) !== day) {
    next.gameProgress[gameId] = {
      completedAt,
      plays: safeCount((previous?.plays ?? 0) + 1),
    };
  }
  next.activityDays = [...new Set([...next.activityDays, day])].sort().slice(-MAX_SESSIONS);
  return next;
}

export function getStats(state, now = Date.now()) {
  const clean = normalizeState(state);
  const today = localDateKey(now);
  const sessionDays = clean.sessions.map((session) => localDateKey(session.completedAt));
  const reviewDays = Object.values(clean.words).filter((word) => word.lastPracticedAt).map((word) => localDateKey(word.lastPracticedAt));
  const gameDays = Object.values(clean.gameProgress).map((game) => localDateKey(game.completedAt));
  const activeDays = [...new Set([...clean.activityDays, ...sessionDays, ...reviewDays, ...gameDays])].sort();
  return {
    completedLessons: Object.keys(clean.lessonProgress).length,
    completedGames: Object.keys(clean.gameProgress).length,
    gamePlays: Object.values(clean.gameProgress).reduce((sum, game) => sum + game.plays, 0),
    learnedWords: Object.values(clean.words).filter((word) => word.attempts > 0).length,
    familiarWords: Object.values(clean.words).filter((word) => word.stage >= 2).length,
    practicedDays: activeDays.length,
    activeDays,
    todaySessions: clean.sessions.filter((session) => localDateKey(session.completedAt) === today).length,
    dueWords: getDueWords(clean, now).length,
    totalSessions: clean.sessions.length,
    spokenSessions: clean.sessions.filter((session) => session.said).length,
    recentSessions: [...clean.sessions].reverse().slice(0, 7),
  };
}
