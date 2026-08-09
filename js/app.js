/* Interface du jeu de Sudoku (PWA). */
(() => {
  'use strict';
  const E = self.SudokuEngine;
  const $ = sel => document.querySelector(sel);
  const SAVE_KEY = 'sudoku.save.v1';
  const STATS_KEY = 'sudoku.stats.v1';

  const LEVEL_META = [
    { key: 'facile',     pips: 1, desc: 'Pour se détendre' },
    { key: 'moyen',      pips: 2, desc: 'Un peu de réflexion' },
    { key: 'difficile',  pips: 3, desc: 'Il faut chercher' },
    { key: 'expert',     pips: 4, desc: 'Techniques avancées' },
    { key: 'diabolique', pips: 5, desc: 'Réservé aux acharnés' },
  ];

  /* ---------- État ---------- */
  let game = null;          // partie en cours
  let selected = -1;        // case sélectionnée
  let notesMode = false;
  let paused = false;
  let tickHandle = null;
  const cellEls = [];

  /* ---------- Utilitaires ---------- */
  const fmtTime = s => `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  const buzz = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

  const loadJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };
  const saveJSON = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota / mode privé */ }
  };

  const getStats = () => loadJSON(STATS_KEY, {});
  function recordWin(difficulty, seconds, mistakes) {
    const stats = getStats();
    const s = stats[difficulty] || { played: 0, won: 0, best: null, totalTime: 0 };
    s.won += 1;
    s.totalTime += seconds;
    const record = s.best === null || seconds < s.best;
    if (record) s.best = seconds;
    s.lastMistakes = mistakes;
    stats[difficulty] = s;
    saveJSON(STATS_KEY, stats);
    return record;
  }
  function recordStart(difficulty) {
    const stats = getStats();
    const s = stats[difficulty] || { played: 0, won: 0, best: null, totalTime: 0 };
    s.played += 1;
    stats[difficulty] = s;
    saveJSON(STATS_KEY, stats);
  }

  /* ---------- Création / sauvegarde d'une partie ---------- */
  function newGame(difficulty) {
    const { puzzle, solution } = E.generate(difficulty);
    game = {
      difficulty,
      puzzle,
      solution,
      grid: puzzle.slice(),
      notes: Array.from({ length: 81 }, () => []),
      hinted: new Array(81).fill(false),
      elapsed: 0,
      mistakes: 0,
      hints: 0,
      undo: [],
      done: false,
    };
    selected = -1;
    notesMode = false;
    paused = false;
    recordStart(difficulty);
    persist();
  }

  function persist() {
    if (!game || game.done) { localStorage.removeItem(SAVE_KEY); return; }
    saveJSON(SAVE_KEY, {
      difficulty: game.difficulty,
      puzzle: game.puzzle,
      solution: game.solution,
      grid: game.grid,
      notes: game.notes,
      hinted: game.hinted,
      elapsed: game.elapsed,
      mistakes: game.mistakes,
      hints: game.hints,
    });
  }

  function restore(save) {
    game = {
      ...save,
      notes: save.notes || Array.from({ length: 81 }, () => []),
      hinted: save.hinted || new Array(81).fill(false),
      undo: [],
      done: false,
    };
    selected = -1;
    notesMode = false;
    paused = false;
  }

  /* ---------- Rendu ---------- */
  function buildBoard() {
    const board = $('#board');
    board.innerHTML = '';
    cellEls.length = 0;
    for (let c = 0; c < 81; c++) {
      const el = document.createElement('button');
      el.className = 'cell';
      el.dataset.i = c;
      el.dataset.r = E.rowOf(c);
      el.dataset.c = E.colOf(c);
      el.setAttribute('role', 'gridcell');
      board.appendChild(el);
      cellEls.push(el);
    }
    board.addEventListener('click', e => {
      const el = e.target.closest('.cell');
      if (el) selectCell(+el.dataset.i);
    });
  }

  function buildPad() {
    const pad = $('#pad');
    pad.innerHTML = '';
    for (let v = 1; v <= 9; v++) {
      const k = document.createElement('button');
      k.className = 'key';
      k.dataset.v = v;
      k.innerHTML = `${v}<span class="left"></span>`;
      pad.appendChild(k);
    }
    pad.addEventListener('click', e => {
      const k = e.target.closest('.key');
      if (k) inputValue(+k.dataset.v);
    });
  }

  function renderCell(c) {
    const el = cellEls[c];
    const v = game.grid[c];
    const given = game.puzzle[c] !== 0;

    el.classList.toggle('given', given);
    el.classList.toggle('hinted', !given && game.hinted[c]);

    if (v) {
      el.innerHTML = `<span class="val">${v}</span>`;
      el.classList.toggle('err', !given && v !== game.solution[c]);
    } else {
      el.classList.remove('err');
      const notes = game.notes[c];
      if (notes.length) {
        el.innerHTML = '<div class="notes">' +
          Array.from({ length: 9 }, (_, i) => `<span>${notes.includes(i + 1) ? i + 1 : ''}</span>`).join('') +
          '</div>';
      } else {
        el.innerHTML = '';
      }
    }
  }

  function renderHighlights() {
    const selVal = selected >= 0 ? game.grid[selected] : 0;
    const peers = selected >= 0 ? new Set(E.PEERS[selected]) : null;
    for (let c = 0; c < 81; c++) {
      const el = cellEls[c];
      el.classList.toggle('sel', c === selected);
      el.classList.toggle('peer', peers ? peers.has(c) : false);
      el.classList.toggle('same', !!selVal && game.grid[c] === selVal && c !== selected);
    }
  }

  function renderPad() {
    const counts = new Array(10).fill(0);
    for (let c = 0; c < 81; c++) if (game.grid[c] && game.grid[c] === game.solution[c]) counts[game.grid[c]]++;
    document.querySelectorAll('.key').forEach(k => {
      const v = +k.dataset.v;
      const left = 9 - counts[v];
      k.querySelector('.left').textContent = left > 0 ? left : '';
      k.classList.toggle('done', left <= 0);
    });
  }

  function renderAll() {
    for (let c = 0; c < 81; c++) renderCell(c);
    renderHighlights();
    renderPad();
    renderHeader();
    $('#tool-undo').disabled = game.undo.length === 0;
  }

  function renderHeader() {
    $('#meta-level').textContent = E.LEVELS[game.difficulty].label;
    $('#meta-mistakes').textContent = game.mistakes === 0
      ? 'aucune erreur'
      : `${game.mistakes} erreur${game.mistakes > 1 ? 's' : ''}`;
    $('#timer').textContent = fmtTime(game.elapsed);
  }

  /* ---------- Interactions ---------- */
  function selectCell(c) {
    if (paused || game.done) return;
    selected = c;
    renderHighlights();
  }

  function pushUndo(entry) {
    game.undo.push(entry);
    if (game.undo.length > 200) game.undo.shift();
    $('#tool-undo').disabled = false;
  }

  function inputValue(v) {
    if (selected < 0 || paused || game.done) return;
    const c = selected;
    if (game.puzzle[c] !== 0) { buzz(8); return; }

    const before = { cell: c, value: game.grid[c], notes: game.notes[c].slice(), hinted: game.hinted[c] };

    if (notesMode) {
      if (game.grid[c]) return;
      const idx = game.notes[c].indexOf(v);
      if (idx >= 0) game.notes[c].splice(idx, 1);
      else { game.notes[c].push(v); game.notes[c].sort(); }
      pushUndo(before);
      renderCell(c);
      persist();
      return;
    }

    if (game.grid[c] === v) {           // retaper le même chiffre l'efface
      game.grid[c] = 0;
      game.hinted[c] = false;
      pushUndo(before);
      renderCell(c); renderHighlights(); renderPad(); persist();
      return;
    }

    const removedNotes = [];
    game.grid[c] = v;
    game.notes[c] = [];
    game.hinted[c] = false;

    const correct = v === game.solution[c];
    if (correct) {
      // retire ce chiffre des notes des cases liées
      for (const p of E.PEERS[c]) {
        const i = game.notes[p].indexOf(v);
        if (i >= 0) { game.notes[p].splice(i, 1); removedNotes.push(p); renderCell(p); }
      }
      buzz(6);
    } else {
      game.mistakes++;
      cellEls[c].classList.remove('flash');
      void cellEls[c].offsetWidth;
      cellEls[c].classList.add('flash');
      buzz([18, 40, 18]);
    }

    pushUndo({ ...before, removedNotes, value2: v });
    cellEls[c].classList.add('pop');
    setTimeout(() => cellEls[c].classList.remove('pop'), 200);
    renderCell(c); renderHighlights(); renderPad(); renderHeader(); persist();
    checkWin();
  }

  function erase() {
    if (selected < 0 || paused || game.done) return;
    const c = selected;
    if (game.puzzle[c] !== 0) return;
    if (!game.grid[c] && !game.notes[c].length) return;
    pushUndo({ cell: c, value: game.grid[c], notes: game.notes[c].slice(), hinted: game.hinted[c] });
    game.grid[c] = 0;
    game.notes[c] = [];
    game.hinted[c] = false;
    renderCell(c); renderHighlights(); renderPad(); persist();
  }

  function undo() {
    if (paused || game.done) return;
    const last = game.undo.pop();
    if (!last) return;
    game.grid[last.cell] = last.value;
    game.notes[last.cell] = last.notes;
    game.hinted[last.cell] = last.hinted;
    if (last.removedNotes && last.value2) {
      for (const p of last.removedNotes) {
        if (!game.notes[p].includes(last.value2)) { game.notes[p].push(last.value2); game.notes[p].sort(); }
        renderCell(p);
      }
    }
    selected = last.cell;
    renderCell(last.cell); renderHighlights(); renderPad();
    $('#tool-undo').disabled = game.undo.length === 0;
    persist();
  }

  function hint() {
    if (paused || game.done) return;
    // case sélectionnée si elle est vide ou fausse, sinon une case vide au hasard
    let target = -1;
    if (selected >= 0 && game.puzzle[selected] === 0 && game.grid[selected] !== game.solution[selected]) {
      target = selected;
    } else {
      const empties = [];
      for (let c = 0; c < 81; c++) if (game.grid[c] !== game.solution[c]) empties.push(c);
      if (!empties.length) return;
      target = empties[(Math.random() * empties.length) | 0];
    }
    pushUndo({ cell: target, value: game.grid[target], notes: game.notes[target].slice(), hinted: game.hinted[target] });
    game.grid[target] = game.solution[target];
    game.notes[target] = [];
    game.hinted[target] = true;
    game.hints++;
    selected = target;
    for (const p of E.PEERS[target]) {
      const i = game.notes[p].indexOf(game.solution[target]);
      if (i >= 0) { game.notes[p].splice(i, 1); renderCell(p); }
    }
    renderCell(target); renderHighlights(); renderPad(); persist();
    buzz(10);
    checkWin();
  }

  function checkWin() {
    for (let c = 0; c < 81; c++) if (game.grid[c] !== game.solution[c]) return;
    game.done = true;
    stopTimer();
    localStorage.removeItem(SAVE_KEY);
    const record = recordWin(game.difficulty, game.elapsed, game.mistakes);
    $('#win-time').textContent = fmtTime(game.elapsed);
    $('#win-level').textContent = E.LEVELS[game.difficulty].label;
    $('#win-mistakes').textContent = game.mistakes;
    $('#win-record').classList.toggle('hidden', !record);
    $('#win-overlay').classList.remove('hidden');
    buzz([20, 60, 20, 60, 40]);
  }

  /* ---------- Chronomètre ---------- */
  function startTimer() {
    stopTimer();
    tickHandle = setInterval(() => {
      if (paused || !game || game.done) return;
      game.elapsed++;
      $('#timer').textContent = fmtTime(game.elapsed);
      if (game.elapsed % 10 === 0) persist();
    }, 1000);
  }
  function stopTimer() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  function setPaused(v) {
    paused = v;
    $('#pause-overlay').classList.toggle('hidden', !v);
    $('#board').style.visibility = v ? 'hidden' : '';
    if (v) persist();
  }

  /* ---------- Navigation ---------- */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  function openGame() {
    showScreen('screen-game');
    $('#win-overlay').classList.add('hidden');
    setPaused(false);
    setNotes(false);
    renderAll();
    startTimer();
  }

  function setNotes(v) {
    notesMode = v;
    $('#tool-notes').classList.toggle('on', v);
    $('#notes-badge').textContent = v ? 'ON' : 'OFF';
  }

  function startNew(difficulty) {
    const loading = $('#loading');
    loading.classList.remove('hidden');
    // laisse le navigateur peindre l'écran de chargement avant le calcul
    requestAnimationFrame(() => requestAnimationFrame(() => {
      newGame(difficulty);
      loading.classList.add('hidden');
      openGame();
    }));
  }

  function renderHome() {
    const stats = getStats();
    const list = $('#level-list');
    list.innerHTML = '';
    for (const meta of LEVEL_META) {
      const s = stats[meta.key];
      const btn = document.createElement('button');
      btn.className = 'level';
      btn.innerHTML = `
        <span class="level-pips">${Array.from({ length: 5 }, (_, i) =>
          `<i class="${i < meta.pips ? 'on' : ''}"></i>`).join('')}</span>
        <span class="level-text">
          <span class="level-name">${E.LEVELS[meta.key].label}</span>
          <span class="level-desc">${meta.desc}</span>
        </span>
        <span class="level-best">${s && s.best != null ? '🏆 ' + fmtTime(s.best) : ''}</span>`;
      btn.addEventListener('click', () => startNew(meta.key));
      list.appendChild(btn);
    }

    const save = loadJSON(SAVE_KEY, null);
    const cont = $('#btn-continue');
    if (save && save.grid) {
      const filled = save.grid.filter(v => v).length;
      const pct = Math.round(((filled - save.puzzle.filter(v => v).length) /
        (81 - save.puzzle.filter(v => v).length)) * 100);
      $('#continue-sub').textContent =
        `${E.LEVELS[save.difficulty].label} · ${fmtTime(save.elapsed || 0)} · ${Math.max(0, pct)} %`;
      cont.classList.remove('hidden');
    } else {
      cont.classList.add('hidden');
    }
  }

  function renderStats() {
    const stats = getStats();
    const body = $('#stats-body');
    const rows = LEVEL_META.map(m => {
      const s = stats[m.key];
      const label = E.LEVELS[m.key].label;
      if (!s || !s.won) {
        return `<div class="stat-row"><span class="k">${label}</span><span class="v">${s && s.played ? s.played + ' commencée(s)' : '—'}</span></div>`;
      }
      const avg = fmtTime(Math.round(s.totalTime / s.won));
      return `<div class="stat-row"><span class="k">${label}</span><span class="v">${s.won} gagnée(s) · record ${fmtTime(s.best)} · moy. ${avg}</span></div>`;
    }).join('');
    body.innerHTML = rows;
    $('#stats-overlay').classList.remove('hidden');
  }

  /* ---------- Branchements ---------- */
  function wire() {
    $('#btn-continue').addEventListener('click', () => {
      const save = loadJSON(SAVE_KEY, null);
      if (!save) { renderHome(); return; }
      restore(save);
      openGame();
    });

    $('#btn-back').addEventListener('click', () => {
      persist(); stopTimer(); renderHome(); showScreen('screen-home');
    });

    $('#btn-pause').addEventListener('click', () => setPaused(!paused));
    $('#btn-resume').addEventListener('click', () => setPaused(false));

    $('#tool-undo').addEventListener('click', undo);
    $('#tool-erase').addEventListener('click', erase);
    $('#tool-notes').addEventListener('click', () => setNotes(!notesMode));
    $('#tool-hint').addEventListener('click', hint);

    $('#win-again').addEventListener('click', () => {
      $('#win-overlay').classList.add('hidden');
      startNew(game.difficulty);
    });
    $('#win-home').addEventListener('click', () => {
      $('#win-overlay').classList.add('hidden');
      stopTimer(); renderHome(); showScreen('screen-home');
    });

    $('#btn-stats').addEventListener('click', renderStats);
    $('#stats-close').addEventListener('click', () => $('#stats-overlay').classList.add('hidden'));
    $('#stats-reset').addEventListener('click', () => {
      if (confirm('Effacer toutes les statistiques ?')) {
        localStorage.removeItem(STATS_KEY);
        $('#stats-overlay').classList.add('hidden');
        renderHome();
      }
    });

    // clavier (utile sur ordinateur)
    document.addEventListener('keydown', e => {
      if (!game || !$('#screen-game').classList.contains('active')) return;
      if (e.key >= '1' && e.key <= '9') { inputValue(+e.key); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); return; }
      if (e.key === 'n' || e.key === 'N') { setNotes(!notesMode); return; }
      if (e.key === 'h' || e.key === 'H') { hint(); return; }
      if (e.key.startsWith('Arrow') && selected >= 0) {
        const r = E.rowOf(selected), c = E.colOf(selected);
        const nr = r + (e.key === 'ArrowDown') - (e.key === 'ArrowUp');
        const nc = c + (e.key === 'ArrowRight') - (e.key === 'ArrowLeft');
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) selectCell(nr * 9 + nc);
        e.preventDefault();
      }
    });

    // met en pause quand on quitte l'application
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { persist(); }
    });
    window.addEventListener('pagehide', persist);
  }

  function installHint() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) return;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    $('#install-hint').textContent = iOS
      ? 'Astuce : appuie sur Partager puis « Sur l’écran d’accueil » pour installer le jeu.'
      : 'Astuce : installe le jeu depuis le menu de ton navigateur pour y jouer hors ligne.';
  }

  /* ---------- Démarrage ---------- */
  buildBoard();
  buildPad();
  wire();
  renderHome();
  installHint();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
