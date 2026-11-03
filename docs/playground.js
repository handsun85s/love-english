// Short, replayable listening games. Playing does not change lesson completion
// or word mastery: the app can record a separate game visit if desired.
export const GAME_CONFIGS = Object.freeze([
  Object.freeze({
    id: 'delivery',
    title: '森林小小快递员',
    subtitle: '听听小伙伴想要什么，把点心送到它手里',
    emoji: '🧺',
    color: '#f7e7ca',
  }),
  Object.freeze({
    id: 'pairs',
    title: '声音翻翻乐',
    subtitle: '翻开声音和图片，帮动物朋友找到另一半',
    emoji: '🐾',
    color: '#e0ebdf',
  }),
]);

// Countable food takes a/an; water, milk, and juice use "some". Each round's
// distractors stay in the same category, so the sound matters to the choice.
export const DELIVERY_ORDERS = Object.freeze([
  Object.freeze({
    id: 'deliver-apple',
    wordId: 'apple',
    request: 'An apple, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一个红红的苹果。',
  }),
  Object.freeze({
    id: 'deliver-banana',
    wordId: 'banana',
    request: 'A banana, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一根弯弯的香蕉。',
  }),
  Object.freeze({
    id: 'deliver-carrot',
    wordId: 'carrot',
    request: 'A carrot, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一根橙色的胡萝卜。',
  }),
  Object.freeze({
    id: 'deliver-water',
    wordId: 'water',
    request: 'Some water, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一些清水。',
  }),
  Object.freeze({
    id: 'deliver-milk',
    wordId: 'milk',
    request: 'Some milk, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一些白白的牛奶。',
  }),
  Object.freeze({
    id: 'deliver-juice',
    wordId: 'juice',
    request: 'Some juice, please.',
    enFeedback: 'Thank you!',
    zhHint: '它想要一些果汁。',
  }),
]);

const FOOD_WORDS = ['apple', 'banana', 'carrot'];
const DRINK_WORDS = ['water', 'milk', 'juice'];
const ANIMAL_WORDS = new Set(['cat', 'dog', 'bird', 'duck', 'frog', 'fish']);
const DEFAULT_PAIR_WORDS = ['cat', 'dog', 'bird', 'frog'];

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const choice = Math.floor(random() * (index + 1));
    if (!Number.isInteger(choice) || choice < 0 || choice > index) {
      throw new RangeError('The random source must return a number from 0 up to, but not including, 1.');
    }
    [result[index], result[choice]] = [result[choice], result[index]];
  }
  return result;
}

export function createDeliveryRound(orderIndex, random = Math.random) {
  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex >= DELIVERY_ORDERS.length) return null;
  const order = DELIVERY_ORDERS[orderIndex];
  const choices = FOOD_WORDS.includes(order.wordId) ? FOOD_WORDS : DRINK_WORDS;
  return { order: { ...order }, choices: shuffle(choices, random) };
}

export function createPairDeck(wordIds = DEFAULT_PAIR_WORDS, random = Math.random) {
  if (!Array.isArray(wordIds) || wordIds.length !== 4 || new Set(wordIds).size !== 4 || wordIds.some(id => !ANIMAL_WORDS.has(id))) {
    throw new RangeError('Choose four different forest or pond animals.');
  }
  const cards = wordIds.flatMap(wordId => [
    { id: `${wordId}-sound`, wordId, kind: 'sound' },
    { id: `${wordId}-picture`, wordId, kind: 'picture' },
  ]);
  return shuffle(cards, random);
}

export function evaluatePair(first, second) {
  return Boolean(
    first && second &&
    typeof first.id === 'string' && first.id.length &&
    typeof second.id === 'string' && second.id.length &&
    first.id !== second.id &&
    ANIMAL_WORDS.has(first.wordId) &&
    first.wordId === second.wordId &&
    ((first.kind === 'sound' && second.kind === 'picture') ||
      (first.kind === 'picture' && second.kind === 'sound'))
  );
}
