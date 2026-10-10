(() => {
  'use strict';
  const E = window.TideEngine;
  const $ = id => document.getElementById(id);
  // Accessing localStorage itself may throw in privacy modes or on file://.
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  const saved = E.load(storage);
  let state = saved.state || E.newGame(), previous = saved.previous, best = saved.best, sound = saved.sound;
  let timer, busy = false, audio, pointer = null, lastStatus;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const board = $('board'), tiles = $('tiles'), helpDialog = $('help-dialog'), restartDialog = $('restart-dialog');
  document.querySelector('.cells').replaceChildren(...Array.from({ length: 16 }, () => {
    const cell = document.createElement('div'); cell.className = 'cell'; return cell;
  }));
  function persist() {
    best = Math.max(best, state.score);
    if (!E.save(storage, { state, previous, best, sound })) $('notice').textContent = '浏览器未允许保存；可以继续玩，关闭页面后本局不会保留。';
  }
  function tone(gained = 0) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const oscillator = audio.createOscillator(), volume = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = gained ? Math.min(880, 330 + Math.log2(gained) * 44) : 220;
      volume.gain.setValueAtTime(0.0001, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.07, audio.currentTime + .012);
      volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + .18);
      oscillator.connect(volume); volume.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + .2);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    } catch (_) {
      sound = false;
      $('notice').textContent = '此浏览器暂不支持音效，游戏仍可正常进行。';
      persist();
    }
  }
  function position(tile, index) { tile.style.setProperty('--col', index % 4); tile.style.setProperty('--row', Math.floor(index / 4)); }
  function render(result = {}) {
    tiles.replaceChildren(...state.board.flatMap((value, index) => {
      if (!value) return [];
      const tile = document.createElement('div');
      tile.className = 'tile' + (String(value).length >= 5 ? ' digits-5' : value >= 1024 ? ' digits-4' : '') + (value > 2048 ? ' high' : '') + (result.merged?.includes(index) ? ' merge' : result.spawned === index ? ' spawn' : '');
      tile.dataset.index = index; tile.dataset.value = value; tile.textContent = value;
      position(tile, index); return [tile];
    }));
    $('score').textContent = state.score.toLocaleString('en-US');
    $('best').textContent = best.toLocaleString('en-US');
    $('undo').disabled = !previous;
    $('sound').setAttribute('aria-pressed', String(sound));
    $('sound').setAttribute('aria-label', `音效：${sound ? '开启' : '关闭'}`);
    $('board-description').textContent = Array.from({ length: 4 }, (_, row) => `第 ${row + 1} 行：${state.board.slice(row * 4, row * 4 + 4).map(n => n || '空').join('、')}`).join('。');
    const currentStatus = E.status(state);
    $('end-screen').hidden = currentStatus === 'playing';
    if (currentStatus !== 'playing') {
      const won = currentStatus === 'won';
      $('end-number').textContent = won ? '2048' : Math.max(...state.board);
      $('end-title').textContent = won ? '潮水相逢' : '这一轮潮汐，已抵达岸边。';
      $('end-copy').textContent = won ? '你合成了 2048。继续向更远的海面出发吧。' : `本局得分 ${state.score}。休息一下，再出发。`;
      $('continue').hidden = !won;
      $('end-undo').hidden = !previous;
      if (lastStatus !== currentStatus) (won ? $('continue') : previous ? $('end-undo') : $('end-new')).focus({ preventScroll: true });
    }
    lastStatus = currentStatus;
  }
  function move(direction) {
    if (busy || helpDialog.open || restartDialog.open) return;
    const result = E.move(state, direction);
    if (!result.changed) return;
    previous = E.copy(state); state = result.state; busy = true; persist(); tone(result.gained);
    for (const motion of result.motions) {
      const tile = tiles.querySelector(`[data-index="${motion.from}"]`);
      if (tile) { tile.classList.remove('merge', 'spawn'); position(tile, motion.to); }
    }
    timer = window.setTimeout(() => {
      busy = false; render(result);
      if (result.gained) {
        const gain = $('gain'); gain.textContent = `+${result.gained}`; gain.classList.remove('active');
        void gain.offsetWidth; gain.classList.add('active');
      }
    }, reduced.matches ? 0 : 125);
  }
  function undo() {
    if (!previous) return;
    clearTimeout(timer); busy = false; state = previous; previous = null;
    persist(); render(); board.focus({ preventScroll: true });
    if (storage) $('notice').textContent = '已退回上一步。';
  }
  function askNew() { restartDialog.showModal(); }
  function newGame() {
    clearTimeout(timer); busy = false; state = E.newGame(); previous = null;
    $('notice').textContent = ''; persist(); render(); restartDialog.close(); board.focus({ preventScroll: true });
  }
  $('help').addEventListener('click', () => helpDialog.showModal());
  $('new').addEventListener('click', askNew); $('end-new').addEventListener('click', askNew);
  $('confirm-new').addEventListener('click', newGame); $('cancel-new').addEventListener('click', () => restartDialog.close());
  $('undo').addEventListener('click', undo); $('end-undo').addEventListener('click', undo);
  $('continue').addEventListener('click', () => { state.continued = true; persist(); render(); if (E.status(state) === 'playing') board.focus({ preventScroll: true }); });
  $('sound').addEventListener('click', () => { sound = !sound; tone(4); persist(); render(); });
  const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || helpDialog.open || restartDialog.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    const direction = directions[event.key] || directions[event.key.toLowerCase()];
    if (direction) { event.preventDefault(); move(direction); }
  });
  board.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const direction = E.swipeDirection(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = null; if (direction) move(direction);
  });
  board.addEventListener('pointercancel', () => { pointer = null; });
  board.addEventListener('lostpointercapture', () => { pointer = null; });
  $('notice').textContent = saved.notice;
  persist(); render();
})();
