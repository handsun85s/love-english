import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../docs/content.js';
import { STORAGE_KEY, createInitialState, loadState, saveState, completeLesson, completeGame, getDueWords, recordReview, getStats, localDateKey } from '../docs/engine.js';

const now = new Date(2026, 10, 3, 20, 0, 0);
const tomorrow = new Date(2026, 10, 4, 9, 0, 0);
const results = { wordResults: { cat: { correct: true, attempts: 1 }, dog: { correct: false, attempts: 2 }, bird: { correct: true, attempts: 1 } }, said: true };

function memoryStorage(initial) {
  let value = initial;
  return { getItem: (key) => key === STORAGE_KEY ? value ?? null : null, setItem: (_key, next) => { value = next; } };
}

test('content has coherent, unique lessons and tokenized phrases', () => {
  assert.ok(LESSONS.length > 0);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.id)).size, LESSONS.length);
  const words = LESSONS.flatMap((lesson) => lesson.words);
  assert.equal(new Set(words.map((word) => word.id)).size, words.length);
  for (const lesson of LESSONS) {
    assert.equal(lesson.words.length, 3);
    assert.equal(lesson.phrase.tokens.join(' '), lesson.phrase.en);
    assert.ok(lesson.story.length >= 2);
  }
});

test('local dates follow the local calendar at midnight', () => {
  assert.equal(localDateKey(new Date(2026, 10, 3, 0, 1)), '2026-11-03');
  assert.equal(localDateKey(new Date(2026, 10, 2, 23, 59)), '2026-11-02');
});

test('completion records understanding, preserves input, and schedules calendar days', () => {
  const initial = createInitialState();
  const state = completeLesson(initial, 'forest-friends', results, now);
  assert.deepEqual(initial, createInitialState());
  assert.equal(state.words.cat.stage, 1);
  assert.equal(localDateKey(state.words.cat.dueAt), '2026-11-04');
  assert.equal(state.words.dog.stage, 0);
  assert.equal(state.words.dog.attempts, 2);
  assert.deepEqual(getDueWords(state, now).map((word) => word.id), ['dog']);
  assert.equal(getDueWords(state, tomorrow).length, 3);
  assert.equal(getStats(state, now).learnedWords, 3);
  assert.equal(getStats(state, now).spokenSessions, 1);
});

test('same-day lesson replay cannot multiply progress or rewards', () => {
  const state = completeLesson(createInitialState(), 'forest-friends', results, now);
  const replay = completeLesson(state, 'forest-friends', results, new Date(2026, 10, 3, 23, 59));
  assert.deepEqual(replay, state);
  const nextDay = completeLesson(state, 'forest-friends', results, tomorrow);
  assert.equal(nextDay.lessonProgress['forest-friends'].completions, 2);
  assert.equal(nextDay.words.cat.stage, 2);
  assert.equal(localDateKey(nextDay.words.cat.dueAt), '2026-11-07');
});

test('same-day lesson replay retains a new mistake and a later attempt aloud', () => {
  const allCorrect = { wordResults: { cat: { correct: true, attempts: 1 }, dog: { correct: true, attempts: 1 }, bird: { correct: true, attempts: 1 } }, said: false };
  const state = completeLesson(createInitialState(), 'forest-friends', allCorrect, now);
  const replayResults = { ...allCorrect, wordResults: { ...allCorrect.wordResults, cat: { correct: false, attempts: 2 } }, said: true };
  const replay = completeLesson(state, 'forest-friends', replayResults, now);
  assert.equal(replay.words.cat.stage, 0);
  assert.equal(localDateKey(replay.words.cat.dueAt), '2026-11-03');
  assert.equal(replay.words.dog.stage, 1);
  assert.equal(replay.lessonProgress['forest-friends'].completions, 1);
  assert.equal(replay.sessions.length, 1);
  assert.equal(replay.sessions[0].said, true);
  assert.equal(state.sessions[0].said, false);
  const savedImmediately = recordReview(state, 'cat', false, now);
  const finishedAfterImmediateSave = completeLesson(savedImmediately, 'forest-friends', replayResults, now);
  assert.equal(finishedAfterImmediateSave.words.cat.attempts, savedImmediately.words.cat.attempts);
});

test('early voluntary practice cannot shortcut the spacing schedule', () => {
  const state = completeLesson(createInitialState(), 'forest-friends', results, now);
  const dueReview = recordReview(state, 'cat', true, tomorrow);
  const earlyReview = recordReview(dueReview, 'cat', true, new Date(2026, 10, 5, 9));
  assert.equal(earlyReview.words.cat.stage, 2);
  assert.equal(earlyReview.words.cat.dueAt, dueReview.words.cat.dueAt);
  assert.equal(earlyReview.words.cat.successes, dueReview.words.cat.successes + 1);
});

test('finishing a later lesson does not recount an immediately saved error', () => {
  const state = completeLesson(createInitialState(), 'forest-friends', results, now);
  const savedError = recordReview(state, 'cat', false, tomorrow);
  const laterResults = { ...results, wordResults: { ...results.wordResults, cat: { correct: false, attempts: 2, recordedWrong: true } } };
  const finished = completeLesson(savedError, 'forest-friends', laterResults, tomorrow);
  assert.equal(finished.words.cat.attempts, savedError.words.cat.attempts);
  assert.equal(finished.words.cat.stage, 0);
  assert.equal(finished.lessonProgress['forest-friends'].completions, 2);
  // A flag without an actual saved error must not bypass a new failure.
  const noImmediateSave = completeLesson(state, 'forest-friends', laterResults, tomorrow);
  assert.equal(noImmediateSave.words.cat.stage, 0);
  assert.equal(noImmediateSave.words.cat.attempts, state.words.cat.attempts + 2);
});

test('same-day review only promotes once; mistakes are immediately due', () => {
  const state = completeLesson(createInitialState(), 'forest-friends', results, now);
  const first = recordReview(state, 'cat', true, tomorrow);
  const second = recordReview(first, 'cat', true, tomorrow);
  assert.equal(first.words.cat.stage, 2);
  assert.equal(second.words.cat.stage, 2);
  assert.equal(second.words.cat.dueAt, first.words.cat.dueAt);
  const missed = recordReview(second, 'cat', false, tomorrow);
  assert.equal(missed.words.cat.stage, 0);
  assert.equal(localDateKey(missed.words.cat.dueAt), '2026-11-04');
  const retried = recordReview(missed, 'cat', true, tomorrow);
  assert.equal(retried.words.cat.stage, 0);
  assert.ok(getDueWords(retried, tomorrow).some((word) => word.id === 'cat'));
});

test('review follows 1, 3, 7, 14 day intervals and caps safely', () => {
  let state = completeLesson(createInitialState(), 'forest-friends', results, now);
  for (const [day, stage, due] of [[4, 2, 7], [7, 3, 14], [14, 4, 28], [28, 4, 42]]) {
    state = recordReview(state, 'cat', true, new Date(2026, 10, day, 12));
    assert.equal(state.words.cat.stage, stage);
    assert.equal(localDateKey(state.words.cat.dueAt), localDateKey(new Date(2026, 10, due)));
  }
});

test('state round trips through storage; blocked storage returns a usable result', () => {
  const storage = memoryStorage();
  const state = completeLesson(createInitialState(), 'forest-friends', results, now);
  state.settings.name = '小树';
  assert.deepEqual(saveState(storage, state), { ok: true });
  assert.deepEqual(loadState(storage), state);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadState(blocked), createInitialState());
  assert.equal(saveState(blocked, state).ok, false);
});

test('version-one lesson saves migrate without losing progress when games are added', () => {
  const current = completeLesson(createInitialState(), 'forest-friends', results, now);
  const { gameProgress: _gameProgress, ...legacy } = current;
  const migrated = loadState(memoryStorage(JSON.stringify(legacy)));
  assert.deepEqual(migrated, { ...legacy, gameProgress: {} });
  assert.equal(getStats(migrated, now).completedGames, 0);
  assert.equal(getStats(migrated, now).gamePlays, 0);
});

test('game completions count exploration days without claiming lessons or word mastery', () => {
  const initial = createInitialState();
  const first = completeGame(initial, 'delivery', now);
  assert.deepEqual(initial, createInitialState());
  assert.deepEqual(first.gameProgress.delivery, { completedAt: now.toISOString(), plays: 1 });
  assert.deepEqual(first.words, {});
  assert.deepEqual(first.lessonProgress, {});
  assert.deepEqual(first.sessions, []);
  assert.deepEqual(getDueWords(first, now), []);
  const firstStats = getStats(first, now);
  assert.equal(firstStats.completedGames, 1);
  assert.equal(firstStats.gamePlays, 1);
  assert.equal(firstStats.practicedDays, 1);
  assert.equal(firstStats.learnedWords, 0);
  assert.equal(firstStats.completedLessons, 0);
  assert.equal(firstStats.totalSessions, 0);

  const replay = completeGame(first, 'delivery', new Date(2026, 10, 3, 23, 59));
  assert.deepEqual(replay, first);
  const nextDay = completeGame(replay, 'delivery', tomorrow);
  const otherGame = completeGame(nextDay, 'pairs', tomorrow);
  assert.equal(otherGame.gameProgress.delivery.plays, 2);
  assert.equal(otherGame.gameProgress.pairs.plays, 1);
  assert.equal(getStats(otherGame, tomorrow).completedGames, 2);
  assert.equal(getStats(otherGame, tomorrow).gamePlays, 3);
  assert.equal(getStats(otherGame, tomorrow).practicedDays, 2);
});

test('game-only days survive reload and later games while existing review stays unchanged', () => {
  const lessonState = completeLesson(createInitialState(), 'forest-friends', results, now);
  let state = completeGame(lessonState, 'delivery', tomorrow);
  state = completeGame(state, 'pairs', new Date(2026, 10, 7, 9));
  state = completeGame(state, 'delivery', new Date(2026, 10, 14, 9));
  assert.deepEqual(state.words, lessonState.words);
  assert.deepEqual(state.lessonProgress, lessonState.lessonProgress);
  assert.deepEqual(state.sessions, lessonState.sessions);
  const storage = memoryStorage();
  assert.equal(saveState(storage, state).ok, true);
  const reloaded = loadState(storage);
  assert.deepEqual(getStats(reloaded, new Date(2026, 10, 14)).activeDays, ['2026-11-03', '2026-11-04', '2026-11-07', '2026-11-14']);
  assert.equal(reloaded.gameProgress.delivery.plays, 2);
});

test('game saves accept only known IDs and valid completion data', () => {
  const data = JSON.parse('{"version":1,"gameProgress":{"__proto__":{"polluted":true},"fake":{"completedAt":"2026-11-03T00:00:00.000Z","plays":100},"delivery":{"completedAt":"not a date","plays":9},"pairs":{"completedAt":"2026-11-03T00:00:00.000Z","plays":-7,"extra":"ignored"}}}');
  const state = loadState(memoryStorage(JSON.stringify(data)));
  assert.deepEqual(state.gameProgress, { pairs: { completedAt: '2026-11-03T00:00:00.000Z', plays: 1 } });
  assert.equal({}.polluted, undefined);
  assert.equal(getStats(state, now).gamePlays, 1);
});

test('corrupt, wrong-version, and hostile data fall back or are sanitized', () => {
  for (const serialized of ['{oops', 'null', '[]', '{"version":99}']) assert.deepEqual(loadState(memoryStorage(serialized)), createInitialState());
  const data = JSON.parse('{"version":1,"__proto__":{"polluted":true},"settings":{"name":"  小树  ","slowAudio":false},"words":{"__proto__":{"polluted":true},"cat":{"stage":999,"dueAt":"2026-11-04T00:00:00.000Z","attempts":-10,"successes":"x"},"dragon":{"stage":1,"dueAt":"2026-11-04T00:00:00.000Z"}},"lessonProgress":{"fake":{"completedAt":"2026-11-03T00:00:00.000Z"}},"sessions":[{"lessonId":"fake","completedAt":"2026-11-03T00:00:00.000Z"}]}');
  const state = loadState(memoryStorage(JSON.stringify(data)));
  assert.equal(state.settings.name, '小树');
  assert.equal(state.settings.slowAudio, false);
  assert.deepEqual(Object.keys(state.words), ['cat']);
  assert.equal(state.words.cat.stage, 4);
  assert.equal(state.words.cat.attempts, 0);
  assert.equal(state.words.cat.successes, 0);
  assert.equal(state.sessions.length, 0);
  assert.equal({}.polluted, undefined);
});

test('unknown IDs never create content or sessions', () => {
  const state = createInitialState();
  assert.equal(completeLesson(state, '__proto__', results, now), state);
  assert.equal(recordReview(state, '__proto__', true, now), state);
  assert.equal(recordReview(state, 'cat', true, now), state);
  assert.equal(completeGame(state, '__proto__', now), state);
  assert.equal(completeGame(state, 'forest-friends', now), state);
});

test('review-only days remain counted after later reviews and reloads', () => {
  let state = completeLesson(createInitialState(), 'forest-friends', results, now);
  state = recordReview(state, 'cat', true, tomorrow);
  state = recordReview(state, 'cat', true, new Date(2026, 10, 7, 9));
  state = recordReview(state, 'cat', true, new Date(2026, 10, 14, 9));
  const storage = memoryStorage();
  saveState(storage, state);
  assert.deepEqual(getStats(loadState(storage), new Date(2026, 10, 14)).activeDays, ['2026-11-03', '2026-11-04', '2026-11-07', '2026-11-14']);
});
