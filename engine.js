/* Pure game rules. Also loaded directly from file:// without a build step. */
(function (root) {
  'use strict';
  const SIZE = 4;
  const STORAGE_KEY = 'tide-2048-v1';
  const copy = state => ({ board: [...state.board], score: state.score, continued: state.continued });
  function validState(state) {
    return Boolean(state && Array.isArray(state.board) && state.board.length === 16 &&
      state.board.every(n => Number.isSafeInteger(n) && (n === 0 || (n >= 2 && Number.isInteger(Math.log2(n))))) &&
      state.board.some(Boolean) && Number.isSafeInteger(state.score) && state.score >= 0 && typeof state.continued === 'boolean');
  }
  function spawn(board, random = Math.random) {
    const empty = board.flatMap((n, i) => n === 0 ? [i] : []);
    if (!empty.length) return { board: [...board], index: -1 };
    const index = empty[Math.floor(random() * empty.length)];
    const next = [...board];
    next[index] = random() < 0.9 ? 2 : 4;
    return { board: next, index };
  }
  function newGame(random = Math.random) {
    return { board: spawn(spawn(Array(16).fill(0), random).board, random).board, score: 0, continued: false };
  }
  function indices(direction, line) {
    return Array.from({ length: SIZE }, (_, step) => {
      if (direction === 'left') return line * SIZE + step;
      if (direction === 'right') return line * SIZE + (SIZE - 1 - step);
      if (direction === 'up') return step * SIZE + line;
      if (direction === 'down') return (SIZE - 1 - step) * SIZE + line;
      throw new Error('Unknown move direction');
    });
  }
  function slide(board, direction) {
    const next = Array(16).fill(0), motions = [], merged = [];
    let gained = 0;
    for (let line = 0; line < SIZE; line++) {
      const order = indices(direction, line);
      const occupied = order.filter(i => board[i] !== 0);
      let position = 0;
      for (let j = 0; j < occupied.length; j++) {
        const from = occupied[j], to = order[position++];
        let value = board[from];
        motions.push({ from, to });
        if (j + 1 < occupied.length && value === board[occupied[j + 1]]) {
          value *= 2;
          gained += value;
          motions.push({ from: occupied[++j], to });
          merged.push(to);
        }
        next[to] = value;
      }
    }
    return { board: next, gained, motions, merged, changed: next.some((n, i) => n !== board[i]) };
  }
  function canMove(board) {
    return board.some((n, i) => n === 0 || (i % SIZE < 3 && n === board[i + 1]) || (i < 12 && n === board[i + SIZE]));
  }
  function status(state) {
    if (!state.continued && state.board.some(n => n >= 2048)) return 'won';
    return canMove(state.board) ? 'playing' : 'over';
  }
  function move(state, direction, random = Math.random) {
    if (status(state) !== 'playing') return { state, changed: false };
    const result = slide(state.board, direction);
    if (!result.changed) return { ...result, state };
    const added = spawn(result.board, random);
    return { ...result, spawned: added.index, state: { ...state, board: added.board, score: state.score + result.gained } };
  }
  function load(storage) {
    const fallback = { state: null, previous: null, best: 0, sound: false, notice: '' };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      if (!data || !validState(data.state)) return { ...fallback, notice: '旧存档无法读取，已为你开启新的一局。' };
      return { state: copy(data.state), previous: validState(data.previous) ? copy(data.previous) : null,
        best: Math.max(data.state.score, Number.isSafeInteger(data.best) && data.best >= 0 ? data.best : 0),
        sound: data.sound === true, notice: '' };
    } catch (_) {
      return { ...fallback, notice: '暂时无法读取存档，本局仍可正常游玩。' };
    }
  }
  function save(storage, data) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
  }
  function swipeDirection(dx, dy, minimum = 24) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < minimum) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  const api = { SIZE, STORAGE_KEY, copy, validState, spawn, newGame, slide, canMove, status, move, load, save, swipeDirection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TideEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
