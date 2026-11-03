import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIGS, DELIVERY_ORDERS, createDeliveryRound, createPairDeck, evaluatePair } from '../docs/playground.js';

test('the two games provide clear entry points without timing or scoring settings', () => {
  assert.deepEqual(GAME_CONFIGS.map(game => game.id), ['delivery', 'pairs']);
  for (const game of GAME_CONFIGS) {
    for (const key of ['title', 'subtitle', 'emoji', 'color']) assert.ok(game[key]);
    assert.equal(Object.hasOwn(game, 'timer'), false);
    assert.equal(Object.hasOwn(game, 'score'), false);
  }
});

test('delivery requests cover all six items with natural countable and uncountable forms', () => {
  assert.equal(DELIVERY_ORDERS.length, 6);
  assert.equal(new Set(DELIVERY_ORDERS.map(order => order.id)).size, 6);
  const requests = Object.fromEntries(DELIVERY_ORDERS.map(order => [order.wordId, order.request]));
  assert.deepEqual(requests, {
    apple: 'An apple, please.',
    banana: 'A banana, please.',
    carrot: 'A carrot, please.',
    water: 'Some water, please.',
    milk: 'Some milk, please.',
    juice: 'Some juice, please.',
  });
  for (const order of DELIVERY_ORDERS) {
    assert.equal(order.enFeedback, 'Thank you!');
    assert.ok(order.zhHint);
  }
});

test('every delivery round has its target exactly once and two same-category alternatives', () => {
  const foods = ['apple', 'banana', 'carrot'];
  const drinks = ['water', 'milk', 'juice'];
  for (let index = 0; index < DELIVERY_ORDERS.length; index++) {
    for (const random of [() => 0, () => .5, () => .999999]) {
      const { order, choices } = createDeliveryRound(index, random);
      assert.equal(order.wordId, DELIVERY_ORDERS[index].wordId);
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices).size, 3);
      assert.equal(choices.filter(wordId => wordId === order.wordId).length, 1);
      assert.deepEqual([...choices].sort(), [...(foods.includes(order.wordId) ? foods : drinks)].sort());
    }
  }
});

test('round state is independent, and finishing six deliveries does not silently restart', () => {
  const first = createDeliveryRound(0);
  first.order.wordId = 'changed';
  first.choices.push('changed');
  assert.equal(createDeliveryRound(0).order.wordId, 'apple');
  assert.equal(createDeliveryRound(0).choices.length, 3);
  for (const invalid of [-1, 6, 100, .5, NaN, undefined, '0']) assert.equal(createDeliveryRound(invalid), null);
});

test('pair decks contain exactly one sound card and one picture card for each of four animals', () => {
  const choices = ['duck', 'frog', 'fish', 'cat'];
  const before = [...choices];
  for (const deck of [createPairDeck(), createPairDeck(choices, () => 0)]) {
    assert.equal(deck.length, 8);
    assert.equal(new Set(deck.map(card => card.id)).size, 8);
    assert.equal(new Set(deck.map(card => card.wordId)).size, 4);
    for (const wordId of new Set(deck.map(card => card.wordId))) {
      const pair = deck.filter(card => card.wordId === wordId);
      assert.deepEqual(pair.map(card => card.kind).sort(), ['picture', 'sound']);
      assert.equal(evaluatePair(pair[0], pair[1]), true);
    }
  }
  assert.deepEqual(choices, before);
});

test('only opposite card kinds for the same animal match, regardless of selection order', () => {
  const sound = { id: 'cat-sound', wordId: 'cat', kind: 'sound' };
  const picture = { id: 'cat-picture', wordId: 'cat', kind: 'picture' };
  assert.equal(evaluatePair(sound, picture), true);
  assert.equal(evaluatePair(picture, sound), true);
  assert.equal(evaluatePair(sound, sound), false);
  assert.equal(evaluatePair(sound, { ...sound, id: 'another-cat-sound' }), false);
  assert.equal(evaluatePair(picture, { ...picture, id: 'another-cat-picture' }), false);
  assert.equal(evaluatePair(sound, { ...picture, wordId: 'dog' }), false);
  assert.equal(evaluatePair(sound, { ...picture, id: sound.id }), false);
  assert.equal(evaluatePair(sound, { ...picture, kind: 'unknown' }), false);
  assert.equal(evaluatePair(null, picture), false);
  assert.equal(evaluatePair({}, {}), false);
});

test('invalid deck choices cannot create unpaired or duplicate cards', () => {
  for (const invalid of [[], ['cat', 'dog'], ['cat', 'cat', 'dog', 'bird'], ['cat', 'dog', 'bird', 'dragon'], null]) {
    assert.throws(() => createPairDeck(invalid), RangeError);
  }
});
