/* Interface du jeu « Code couleur ». */
(() => {
  'use strict';
  const E = self.CodeEngine;
  const $ = sel => document.querySelector(sel);
  const SAVE_KEY = 'code.save.v1';
  const STATS_KEY = 'code.stats.v1';

  const LEVEL_META = [
    { key: 'facile',    pips: 1 },
    { key: 'moyen',     pips: 2 },
    { key: 'difficile', pips: 3 },
    { key: 'expert',    pips: 4 },
  ];
  const levelDesc = key => {
    const L = E.LEVELS[key];
    return `${L.pegs} pions · ${L.colors} couleurs · ${L.tries} essais${L.repeats ? '' : ' · sans doublon'}`;
  };

  /* ---------- État ---------- */
  let game = null;          // partie en cours
  let cursor = 0;           // emplacement qui recevra la prochaine couleur (-1 : ligne pleine)
  let tickHandle = null;

  /* ---------- Utilitaires ---------- */
  const fmtTime = s => `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
  const buzz = ms => { if (navigator.vibrate) navigator.vibrate(ms); };
  const level = () => E.LEVELS[game.level];

  const loadJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };
  const saveJSON = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota / mode privé */ }
  };

  const getStats = () => loadJSON(STATS_KEY, {});
  const emptyStat = () => ({ played: 0, won: 0, best: null, bestTime: null, totalTries: 0 });
  function recordStart(lv) {
    const stats = getStats();
    const s = stats[lv] || emptyStat();
    s.played += 1;
    stats[lv] = s;
    saveJSON(STATS_KEY, stats);
  }
  function recordWin(lv, tries, seconds) {
    const stats = getStats();
    const s = stats[lv] || emptyStat();
    s.won += 1;
    s.totalTries += tries;
    // record : moins d'essais, ou autant d'essais en moins de temps
    const record = s.best === null || tries < s.best || (tries === s.best && seconds < s.bestTime);
    if (record) { s.best = tries; s.bestTime = seconds; }
    stats[lv] = s;
    saveJSON(STATS_KEY, stats);
    return record;
  }

  /* ---------- Création / sauvegarde d'une partie ---------- */
  function freshRow() {
    const row = new Array(level().pegs).fill(null);
    for (const p of game.revealed) row[p] = game.secret[p];
    return row;
  }

  function newGame(lv) {
    game = {
      level: lv,
      secret: E.makeSecret(lv),
      guesses: [],
      answers: [],
      revealed: [],
      hints: 0,
      elapsed: 0,
      done: false,
    };
    game.current = freshRow();
    recordStart(lv);
    afterRowChange();
    persist();
  }

  function persist() {
    if (!game || game.done) { localStorage.removeItem(SAVE_KEY); return; }
    const { level: lv, secret, guesses, answers, revealed, hints, elapsed, current } = game;
    saveJSON(SAVE_KEY, { level: lv, secret, guesses, answers, revealed, hints, elapsed, current });
  }

  function restore(save) {
    game = { ...save, done: false };
    afterRowChange();
  }

  // à appeler quand une nouvelle ligne commence : recalcule les codes possibles et le curseur
  function afterRowChange() {
    const fixed = [];
    for (const p of game.revealed) fixed[p] = game.secret[p];
    game.possible = E.countPossible(game.level, game.guesses, game.answers, fixed);
    cursor = game.current.indexOf(null);
  }

  /* ---------- Rendu ---------- */
  const pegHTML = c => `<i class="peg${c == null ? '' : ' c' + c}"></i>`;

  function feedbackHTML(answer, pegs) {
    const dots = [];
    for (let i = 0; i < pegs; i++) {
      const kind = !answer ? '' : i < answer.exact ? ' exact' : i < answer.exact + answer.near ? ' near' : '';
      dots.push(`<i class="fb${kind}"></i>`);
    }
    return `<div class="feedback${pegs === 4 ? ' f4' : ''}" aria-label="${answer
      ? `${answer.exact} bien placé${answer.exact > 1 ? 's' : ''}, ${answer.near} mal placé${answer.near > 1 ? 's' : ''}`
      : ''}">${dots.join('')}</div>`;
  }

  function setupScreen() {
    const { pegs, colors } = level();
    const screen = $('#screen-code');
    screen.style.setProperty('--pegs', pegs);
    screen.style.setProperty('--colors', colors);
    $('#code-palette').innerHTML = Array.from({ length: colors }, (_, c) =>
      `<button data-c="${c}" aria-label="${E.COLOR_NAMES[c]}">${pegHTML(c)}</button>`).join('');
  }

  function renderBoard() {
    const { pegs, tries } = level();
    const n = game.guesses.length;
    const rows = [];
    for (let r = 0; r < tries; r++) {
      let cls, pegsHTML, fb;
      if (r < n) {
        cls = 'done';
        pegsHTML = game.guesses[r].map(pegHTML).join('');
        fb = feedbackHTML(game.answers[r], pegs);
      } else if (r === n && !game.done) {
        cls = 'current';
        pegsHTML = game.current.map((c, i) =>
          `<button class="slot${i === cursor ? ' cursor' : ''}" data-slot="${i}" aria-label="Emplacement ${i + 1}">${pegHTML(c)}</button>`).join('');
        fb = feedbackHTML(null, pegs);
      } else {
        cls = 'future';
        pegsHTML = pegHTML(null).repeat(pegs);
        fb = feedbackHTML(null, pegs);
      }
      rows.push(`<div class="code-row ${cls}"><span class="num">${r + 1}</span><div class="peg-row">${pegsHTML}</div>${fb}</div>`);
    }
    $('#code-board').innerHTML = rows.join('');
  }

  function renderSecret() {
    $('#code-secret').innerHTML = game.secret.map((c, i) =>
      game.done || game.revealed.includes(i) ? pegHTML(c) : '<i class="peg unknown">?</i>').join('');
  }

  function renderStatus() {
    const { tries, pegs } = level();
    $('#code-meta-level').textContent = level().label;
    $('#code-meta-tries').textContent = `essai ${Math.min(game.guesses.length + 1, tries)}/${tries}`;
    $('#code-timer').textContent = fmtTime(game.elapsed);
    const p = game.possible;
    $('#code-possible').textContent = game.done ? '' : p === 1
      ? 'Un seul code possible : tu as toutes les infos !'
      : `${p.toLocaleString('fr-FR')} codes ${game.guesses.length ? 'encore ' : ''}possibles`;
    $('#code-submit').disabled = game.done || game.current.includes(null);
    $('#code-erase').disabled = game.done || game.current.every(c => c == null);
    $('#code-hint').disabled = game.done || game.revealed.length >= pegs - 1;
  }

  function renderAll() {
    renderSecret();
    renderBoard();
    renderStatus();
  }

  function scrollToCurrent() {
    const row = $('#code-board .current') || [...document.querySelectorAll('#code-board .done')].pop();
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Interactions ---------- */
  function nextEmpty(from) {
    const row = game.current;
    for (let k = 1; k <= row.length; k++) {
      const i = (from + k) % row.length;
      if (row[i] == null) return i;
    }
    return -1;
  }

  function pickColor(c) {
    if (!game || game.done || c >= level().colors) return;
    if (cursor < 0) { buzz(8); return; }
    const at = cursor;
    game.current[at] = c;
    cursor = nextEmpty(at);
    renderBoard(); renderStatus(); persist();
    const peg = document.querySelector(`#code-board .current [data-slot="${at}"] .peg`);
    if (peg) peg.classList.add('pop');
    buzz(5);
  }

  function tapSlot(i) {
    if (game.done) return;
    // un deuxième appui sur l'emplacement sélectionné le vide
    if (i === cursor && game.current[i] != null) game.current[i] = null;
    cursor = i;
    renderBoard(); renderStatus(); persist();
  }

  function erase() {
    if (game.done) return;
    const row = game.current;
    let i = cursor >= 0 && row[cursor] != null ? cursor : -1;
    if (i < 0) {
      // sinon le dernier pion posé avant le curseur
      const start = cursor < 0 ? row.length - 1 : cursor - 1;
      for (let k = start; k >= 0 && i < 0; k--) if (row[k] != null) i = k;
      for (let k = row.length - 1; k > start && i < 0; k--) if (row[k] != null) i = k;
    }
    if (i < 0) return;
    row[i] = null;
    cursor = i;
    renderBoard(); renderStatus(); persist();
  }

  function submit() {
    if (game.done) return;
    if (game.current.includes(null)) { buzz([18, 40, 18]); return; }
    const guess = game.current.slice();
    const answer = E.score(guess, game.secret);
    game.guesses.push(guess);
    game.answers.push(answer);

    if (answer.exact === level().pegs) return finish(true);
    if (game.guesses.length >= level().tries) return finish(false);

    game.current = freshRow();
    afterRowChange();
    renderAll(); persist(); scrollToCurrent();
    buzz(8);
  }

  function hint() {
    if (game.done || game.revealed.length >= level().pegs - 1) return;
    const hidden = game.secret.map((_, i) => i).filter(i => !game.revealed.includes(i));
    // de préférence une position que la ligne en cours n'a pas déjà juste
    const useful = hidden.filter(i => game.current[i] !== game.secret[i]);
    const pool = useful.length ? useful : hidden;
    const p = pool[(Math.random() * pool.length) | 0];
    game.revealed.push(p);
    game.hints++;
    game.current[p] = game.secret[p];
    afterRowChange();
    renderAll(); persist();
    buzz(10);
  }

  function finish(won) {
    game.done = true;
    stopTimer();
    localStorage.removeItem(SAVE_KEY);
    const n = game.guesses.length;
    const record = won && recordWin(game.level, n, game.elapsed);
    renderAll(); scrollToCurrent();

    $('#code-end-mark').textContent = won ? '✓' : '✕';
    $('#code-end-mark').classList.toggle('lost', !won);
    $('#code-end-title').textContent = won ? 'Code trouvé !' : 'Plus d’essais…';
    const end = $('#code-end-code');
    end.style.setProperty('--pegs', level().pegs);
    end.innerHTML = game.secret.map(pegHTML).join('');
    $('#code-end-tries').textContent = won ? `${n}/${level().tries}` : '—';
    $('#code-end-time').textContent = fmtTime(game.elapsed);
    $('#code-end-level').textContent = level().label;
    $('#code-end-record').classList.toggle('hidden', !record);
    // laisse le temps de voir la dernière réponse avant d'afficher le bilan
    setTimeout(() => $('#code-end-overlay').classList.remove('hidden'), won ? 500 : 900);
    buzz(won ? [20, 60, 20, 60, 40] : [40, 80, 40]);
  }

  /* ---------- Chronomètre ---------- */
  function startTimer() {
    stopTimer();
    tickHandle = setInterval(() => {
      if (!game || game.done || document.hidden) return;
      game.elapsed++;
      $('#code-timer').textContent = fmtTime(game.elapsed);
      if (game.elapsed % 10 === 0) persist();
    }, 1000);
  }
  function stopTimer() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  /* ---------- Navigation ---------- */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  function openGame() {
    $('#code-end-overlay').classList.add('hidden');
    showScreen('screen-code');
    setupScreen();
    renderAll();
    scrollToCurrent();
    startTimer();
  }

  function goHome() {
    persist(); stopTimer(); renderHome(); showScreen('screen-home');
  }

  function renderHome() {
    const stats = getStats();
    const list = $('#code-level-list');
    list.innerHTML = '';
    for (const meta of LEVEL_META) {
      const s = stats[meta.key];
      const btn = document.createElement('button');
      btn.className = 'level';
      btn.innerHTML = `
        <span class="level-pips">${Array.from({ length: 4 }, (_, i) =>
          `<i class="${i < meta.pips ? 'on' : ''}"></i>`).join('')}</span>
        <span class="level-text">
          <span class="level-name">${E.LEVELS[meta.key].label}</span>
          <span class="level-desc">${levelDesc(meta.key)}</span>
        </span>
        <span class="level-best">${s && s.best != null ? `🏆 ${s.best} essai${s.best > 1 ? 's' : ''}` : ''}</span>`;
      btn.addEventListener('click', () => { newGame(meta.key); openGame(); });
      list.appendChild(btn);
    }

    const save = loadJSON(SAVE_KEY, null);
    const cont = $('#code-continue');
    if (save && save.secret && E.LEVELS[save.level]) {
      const L = E.LEVELS[save.level];
      $('#code-continue-sub').textContent =
        `${L.label} · essai ${save.guesses.length + 1}/${L.tries} · ${fmtTime(save.elapsed || 0)}`;
      cont.classList.remove('hidden');
    } else {
      cont.classList.add('hidden');
    }
  }

  function renderStats() {
    const stats = getStats();
    $('#code-stats-body').innerHTML = LEVEL_META.map(m => {
      const s = stats[m.key];
      const label = E.LEVELS[m.key].label;
      if (!s || !s.won) {
        return `<div class="stat-row"><span class="k">${label}</span><span class="v">${s && s.played ? s.played + ' commencée(s)' : '—'}</span></div>`;
      }
      const avg = (s.totalTries / s.won).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
      return `<div class="stat-row"><span class="k">${label}</span><span class="v">${s.won}/${s.played} gagnée(s) · record ${s.best} essai${s.best > 1 ? 's' : ''} · moy. ${avg}</span></div>`;
    }).join('');
    $('#code-stats-overlay').classList.remove('hidden');
  }

  /* ---------- Branchements ---------- */
  function wire() {
    $('#code-continue').addEventListener('click', () => {
      const save = loadJSON(SAVE_KEY, null);
      if (!save) { renderHome(); return; }
      restore(save);
      openGame();
    });
    $('#code-back').addEventListener('click', goHome);

    $('#code-palette').addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (b) pickColor(+b.dataset.c);
    });
    $('#code-board').addEventListener('click', e => {
      const s = e.target.closest('[data-slot]');
      if (s) tapSlot(+s.dataset.slot);
    });
    $('#code-erase').addEventListener('click', erase);
    $('#code-hint').addEventListener('click', hint);
    $('#code-submit').addEventListener('click', submit);

    $('#code-end-again').addEventListener('click', () => {
      $('#code-end-overlay').classList.add('hidden');
      newGame(game.level); openGame();
    });
    $('#code-end-home').addEventListener('click', () => {
      $('#code-end-overlay').classList.add('hidden');
      goHome();
    });

    $('#code-btn-stats').addEventListener('click', renderStats);
    $('#code-stats-close').addEventListener('click', () => $('#code-stats-overlay').classList.add('hidden'));
    $('#code-stats-reset').addEventListener('click', () => {
      if (confirm('Effacer toutes les statistiques de Code couleur ?')) {
        localStorage.removeItem(STATS_KEY);
        $('#code-stats-overlay').classList.add('hidden');
        renderHome();
      }
    });

    // clavier (utile sur ordinateur) : 1…8 couleurs, Retour arrière, Entrée
    document.addEventListener('keydown', e => {
      if (!game || !$('#screen-code').classList.contains('active')) return;
      if (e.key >= '1' && e.key <= '8') { pickColor(+e.key - 1); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { erase(); return; }
      if (e.key === 'Enter') { submit(); e.preventDefault(); return; }
      if (e.key === 'h' || e.key === 'H') { hint(); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !game.done) {
        const n = game.current.length;
        tapSlot(((cursor < 0 ? 0 : cursor) + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
        e.preventDefault();
      }
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
    window.addEventListener('pagehide', persist);
  }

  /* ---------- Démarrage ---------- */
  wire();
  renderHome();
})();
