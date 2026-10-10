const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const board = (...rows) => [...rows.flat(), ...Array(16 - rows.flat().length).fill(0)];
const state = (b, score = 0) => ({ board: b, score, continued: false });
test('four equal tiles merge into two, never twice in one move', () => {
  const original = board([2, 2, 2, 2]);
  const result = E.slide(original, 'left');
  assert.deepEqual(result.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.gained, 8);
  assert.deepEqual(original.slice(0, 4), [2, 2, 2, 2]);
  assert.deepEqual(E.slide(board([2, 2, 4, 0]), 'left').board.slice(0, 4), [4, 4, 0, 0]);
});
test('compression and right/up/down maintain correct directional order', () => {
  assert.deepEqual(E.slide(board([2, 0, 2, 4]), 'right').board.slice(0, 4), [0, 0, 4, 4]);
  const vertical = board([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]);
  assert.deepEqual(E.slide(vertical, 'up').board.filter((_, i) => i % 4 === 0), [4, 8, 0, 0]);
  assert.deepEqual(E.slide(vertical, 'down').board.filter((_, i) => i % 4 === 0), [0, 0, 4, 8]);
});
test('invalid moves preserve state and do not consume randomness', () => {
  const before = state(board([2, 0, 0, 0]));
  const result = E.move(before, 'left', () => { throw new Error('Must not spawn'); });
  assert.equal(result.changed, false);
  assert.equal(result.state, before);
});
test('valid move spawns exactly one tile and increments only merge score', () => {
  const result = E.move(state(board([2, 2, 0, 0]), 20), 'left', () => 0);
  assert.deepEqual(result.state.board.slice(0, 4), [4, 2, 0, 0]);
  assert.equal(result.state.score, 24);
  assert.equal(result.spawned, 1);
});
test('new game has exactly two tiles; spawn supports 4 and full board', () => {
  const game = E.newGame(() => .95);
  assert.equal(game.board.filter(Boolean).length, 2);
  assert.equal(game.board.reduce((a, b) => a + b), 8);
  assert.equal(E.spawn(Array(16).fill(2)).index, -1);
});
test('game over requires no empty cells AND no equal neighbors', () => {
  const blocked = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  assert.equal(E.status(state(blocked)), 'over');
  assert.equal(E.move(state(blocked), 'left').changed, false);
  const horizontal = [...blocked]; horizontal[1] = 2;
  assert.equal(E.canMove(horizontal), true);
  const vertical = [...blocked]; vertical[4] = 2;
  assert.equal(E.canMove(vertical), true);
  blocked[0] = 0;
  assert.equal(E.canMove(blocked), true);
});
test('2048 stops for celebration; continue permits larger tiles', () => {
  const won = E.move(state(board([1024, 1024, 0, 0])), 'left', () => 0).state;
  assert.equal(E.status(won), 'won');
  assert.equal(E.move(won, 'right').changed, false);
  won.continued = true;
  assert.equal(E.status(won), 'playing');
  assert.equal(E.move(won, 'right', () => 0).changed, true);
});
test('save round trip preserves undo state, best and sound', () => {
  let value;
  const storage = { setItem: (_, v) => value = v, getItem: () => value };
  const current = state(board([4, 2]), 4), previous = state(board([2, 2]));
  assert.equal(E.save(storage, { state: current, previous, best: 32, sound: true }), true);
  const loaded = E.load(storage);
  assert.deepEqual(loaded.state, current); assert.deepEqual(loaded.previous, previous);
  assert.equal(loaded.best, 32); assert.equal(loaded.sound, true);
  const undo = E.copy(previous); undo.board[0] = 16;
  assert.equal(previous.board[0], 2);
});
test('corrupt, invalid and inaccessible storage gracefully fall back', () => {
  for (const data of ['bad json', 'null', '{"state":{"board":[]}}', JSON.stringify({ state: state(board([3])) })]) {
    assert.equal(E.load({ getItem: () => data }).state, null);
  }
  assert.equal(E.load(null).state, null);
  assert.equal(E.save({ setItem: () => { throw new Error('QuotaExceededError'); } }, {}), false);
  assert.equal(E.validState(state(Array(16).fill(0))), false);
});
test('untrusted best/undo settings are validated separately', () => {
  const loaded = E.load({ getItem: () => JSON.stringify({ state: state(board([2, 2]), 8), best: 'oops', previous: {}, sound: 'true' }) });
  assert.equal(loaded.best, 8); assert.equal(loaded.previous, null); assert.equal(loaded.sound, false);
});
test('touch directions, dead zone and diagonal dominance', () => {
  assert.equal(E.swipeDirection(23, 2), null);
  assert.equal(E.swipeDirection(70, 15), 'right');
  assert.equal(E.swipeDirection(-70, 15), 'left');
  assert.equal(E.swipeDirection(20, -90), 'up');
  assert.equal(E.swipeDirection(20, 90), 'down');
});
test('seeded games preserve tile mass and score across 12000 moves', () => {
  let seed = 98765;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let game = E.newGame(random);
  for (let step = 0; step < 12000; step++) {
    if (E.status(game) !== 'playing') game = E.newGame(random);
    const before = E.copy(game);
    const result = E.move(game, ['left', 'right', 'up', 'down'][Math.floor(random() * 4)], random);
    assert.deepEqual(game, before, 'move must not mutate input');
    if (result.changed) {
      const delta = result.state.board.reduce((a,b) => a+b) - game.board.reduce((a,b) => a+b);
      assert.ok(delta === 2 || delta === 4);
      assert.equal(result.state.score - game.score, result.gained);
      assert.ok(E.validState(result.state));
    }
    game = result.state;
  }
});
