/* Moteur Sudoku : génération, résolution, notation de difficulté.
   Une grille est un tableau de 81 entiers (0 = case vide). */

const ROWS = [], COLS = [], BOXES = [], PEERS = [];
for (let i = 0; i < 9; i++) { ROWS.push([]); COLS.push([]); BOXES.push([]); }
for (let c = 0; c < 81; c++) {
  const r = (c / 9) | 0, col = c % 9, b = ((r / 3) | 0) * 3 + ((col / 3) | 0);
  ROWS[r].push(c); COLS[col].push(c); BOXES[b].push(c);
}
for (let c = 0; c < 81; c++) {
  const r = (c / 9) | 0, col = c % 9, b = ((r / 3) | 0) * 3 + ((col / 3) | 0);
  const set = new Set([...ROWS[r], ...COLS[col], ...BOXES[b]]);
  set.delete(c);
  PEERS.push([...set]);
}
const UNITS = [...ROWS, ...COLS, ...BOXES];

const boxOf = c => (((c / 9) | 0) / 3 | 0) * 3 + ((c % 9) / 3 | 0);
const rowOf = c => (c / 9) | 0;
const colOf = c => c % 9;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSafe(grid, cell, val) {
  for (const p of PEERS[cell]) if (grid[p] === val) return false;
  return true;
}

/* ---------- Résolution par retour sur trace (compte les solutions) ---------- */

function countSolutions(grid, limit = 2) {
  const g = grid.slice();
  let found = 0;
  (function rec() {
    if (found >= limit) return;
    // choisit la case vide la plus contrainte
    let best = -1, bestCands = null;
    for (let c = 0; c < 81; c++) {
      if (g[c] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isSafe(g, c, v)) cands.push(v);
      if (cands.length === 0) return;
      if (bestCands === null || cands.length < bestCands.length) {
        best = c; bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) { found++; return; }
    for (const v of bestCands) {
      g[best] = v;
      rec();
      g[best] = 0;
      if (found >= limit) return;
    }
  })();
  return found;
}

function solve(grid) {
  const g = grid.slice();
  const ok = (function rec() {
    let best = -1, bestCands = null;
    for (let c = 0; c < 81; c++) {
      if (g[c] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) if (isSafe(g, c, v)) cands.push(v);
      if (cands.length === 0) return false;
      if (bestCands === null || cands.length < bestCands.length) {
        best = c; bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) return true;
    for (const v of shuffle(bestCands)) {
      g[best] = v;
      if (rec()) return true;
      g[best] = 0;
    }
    return false;
  })();
  return ok ? g : null;
}

/* ---------- Grille complète aléatoire ---------- */

function generateFull() {
  const g = new Array(81).fill(0);
  (function rec(idx) {
    if (idx === 81) return true;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isSafe(g, idx, v)) {
        g[idx] = v;
        if (rec(idx + 1)) return true;
        g[idx] = 0;
      }
    }
    return false;
  })(0);
  return g;
}

/* ---------- Solveur logique : sert à noter la difficulté ---------- */

const BIT = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];
const popcount = n => { let c = 0; while (n) { n &= n - 1; c++; } return c; };
const lowestValue = n => Math.log2(n & -n) + 1;
const bitsToValues = n => {
  const out = [];
  for (let v = 1; v <= 9; v++) if (n & BIT[v]) out.push(v);
  return out;
};

function buildCandidates(grid) {
  const cand = new Array(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c] !== 0) continue;
    let mask = 0b111111111 << 1;
    for (const p of PEERS[c]) if (grid[p]) mask &= ~BIT[grid[p]];
    cand[c] = mask;
    if (mask === 0) return null;
  }
  return cand;
}

function assign(grid, cand, cell, val) {
  grid[cell] = val;
  cand[cell] = 0;
  for (const p of PEERS[cell]) if (grid[p] === 0) {
    cand[p] &= ~BIT[val];
    if (cand[p] === 0) return false;
  }
  return true;
}

/* Renvoie { solved, level } — level = technique la plus avancée nécessaire :
   1 singleton nu, 2 singleton caché, 3 paires/pointage, 4 au-delà (essais). */
function rateLogic(grid) {
  const g = grid.slice();
  const cand = buildCandidates(g);
  if (!cand) return { solved: false, level: 5 };
  let maxLevel = 1;

  for (;;) {
    let progress = false;

    // Niveau 1 — singleton nu : une seule valeur possible dans la case
    for (let c = 0; c < 81; c++) {
      if (g[c] === 0 && popcount(cand[c]) === 1) {
        if (!assign(g, cand, c, lowestValue(cand[c]))) return { solved: false, level: 5 };
        progress = true;
      }
    }
    if (progress) continue;

    // Niveau 2 — singleton caché : une valeur n'a qu'une place dans une unité
    for (const unit of UNITS) {
      for (let v = 1; v <= 9; v++) {
        let spot = -1, count = 0, present = false;
        for (const c of unit) {
          if (g[c] === v) { present = true; break; }
          if (g[c] === 0 && (cand[c] & BIT[v])) { spot = c; count++; }
        }
        if (present || count !== 1) continue;
        maxLevel = Math.max(maxLevel, 2);
        if (!assign(g, cand, spot, v)) return { solved: false, level: 5 };
        progress = true;
      }
    }
    if (progress) continue;

    // Niveau 3a — pointage / réduction de ligne-colonne (locked candidates)
    for (let b = 0; b < 9 && !progress; b++) {
      for (let v = 1; v <= 9; v++) {
        const spots = BOXES[b].filter(c => g[c] === 0 && (cand[c] & BIT[v]));
        if (spots.length < 2) continue;
        const rs = new Set(spots.map(rowOf)), cs = new Set(spots.map(colOf));
        const strip = rs.size === 1 ? ROWS[[...rs][0]] : cs.size === 1 ? COLS[[...cs][0]] : null;
        if (!strip) continue;
        for (const c of strip) {
          if (boxOf(c) === b || g[c] !== 0 || !(cand[c] & BIT[v])) continue;
          cand[c] &= ~BIT[v];
          if (cand[c] === 0) return { solved: false, level: 5 };
          progress = true; maxLevel = Math.max(maxLevel, 3);
        }
      }
    }
    if (progress) continue;

    // Niveau 3b — réduction de bloc : une valeur confinée à un bloc dans une ligne/colonne
    for (const unit of [...ROWS, ...COLS]) {
      for (let v = 1; v <= 9; v++) {
        const spots = unit.filter(c => g[c] === 0 && (cand[c] & BIT[v]));
        if (spots.length < 2) continue;
        const bs = new Set(spots.map(boxOf));
        if (bs.size !== 1) continue;
        for (const c of BOXES[[...bs][0]]) {
          if (unit.includes(c) || g[c] !== 0 || !(cand[c] & BIT[v])) continue;
          cand[c] &= ~BIT[v];
          if (cand[c] === 0) return { solved: false, level: 5 };
          progress = true; maxLevel = Math.max(maxLevel, 3);
        }
      }
    }
    if (progress) continue;

    // Niveau 3c — paires nues
    for (const unit of UNITS) {
      const pairs = unit.filter(c => g[c] === 0 && popcount(cand[c]) === 2);
      for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
        if (cand[pairs[i]] !== cand[pairs[j]]) continue;
        const mask = cand[pairs[i]];
        for (const c of unit) {
          if (c === pairs[i] || c === pairs[j] || g[c] !== 0 || !(cand[c] & mask)) continue;
          cand[c] &= ~mask;
          if (cand[c] === 0) return { solved: false, level: 5 };
          progress = true; maxLevel = Math.max(maxLevel, 3);
        }
      }
    }
    if (progress) continue;

    // Niveau 4 — paires cachées
    for (const unit of UNITS) {
      const places = {};
      for (let v = 1; v <= 9; v++) {
        const spots = unit.filter(c => g[c] === 0 && (cand[c] & BIT[v]));
        if (spots.length === 2) places[v] = spots;
      }
      const vals = Object.keys(places).map(Number);
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
        const a = places[vals[i]], b2 = places[vals[j]];
        if (a[0] !== b2[0] || a[1] !== b2[1]) continue;
        const keep = BIT[vals[i]] | BIT[vals[j]];
        for (const c of a) {
          if (cand[c] === keep) continue;
          cand[c] &= keep;
          progress = true; maxLevel = Math.max(maxLevel, 4);
        }
      }
    }
    if (progress) continue;

    break;
  }

  const solved = g.every(v => v !== 0);
  return { solved, level: solved ? maxLevel : 5 };
}

/* ---------- Niveaux de difficulté ---------- */

const LEVELS = {
  facile:    { label: 'Facile',    minGivens: 40, maxGivens: 46, maxLevel: 2, minLevel: 1 },
  moyen:     { label: 'Moyen',     minGivens: 32, maxGivens: 36, maxLevel: 2, minLevel: 2 },
  difficile: { label: 'Difficile', minGivens: 28, maxGivens: 31, maxLevel: 3, minLevel: 3 },
  expert:    { label: 'Expert',    minGivens: 25, maxGivens: 28, maxLevel: 4, minLevel: 4 },
  diabolique:{ label: 'Diabolique',minGivens: 22, maxGivens: 26, maxLevel: 5, minLevel: 5 },
};

/* Retire des cases par paires symétriques tant que la solution reste unique. */
function carve(full, targetGivens) {
  const puzzle = full.slice();
  const order = shuffle([...Array(81).keys()]);
  let givens = 81;
  for (const c of order) {
    if (givens <= targetGivens) break;
    const mate = 80 - c;
    const cells = c === mate ? [c] : [c, mate];
    if (cells.some(x => puzzle[x] === 0)) continue;
    if (givens - cells.length < targetGivens) continue;
    const backup = cells.map(x => puzzle[x]);
    cells.forEach(x => { puzzle[x] = 0; });
    if (countSolutions(puzzle, 2) !== 1) {
      cells.forEach((x, i) => { puzzle[x] = backup[i]; });
    } else {
      givens -= cells.length;
    }
  }
  return { puzzle, givens };
}

/* Génère un puzzle du niveau demandé. Renvoie { puzzle, solution, givens, level }. */
function generate(levelKey = 'moyen') {
  const spec = LEVELS[levelKey] || LEVELS.moyen;
  const deadline = Date.now() + 6000;
  let fallback = null;

  while (Date.now() < deadline) {
    const full = generateFull();
    const target = spec.minGivens + ((Math.random() * (spec.maxGivens - spec.minGivens + 1)) | 0);
    const { puzzle, givens } = carve(full, target);
    const { solved, level } = rateLogic(puzzle);
    const rated = solved ? level : 5;
    const result = { puzzle, solution: full, givens, level: rated, difficulty: levelKey };

    if (rated >= spec.minLevel && rated <= spec.maxLevel) return result;
    if (!fallback || Math.abs(rated - spec.maxLevel) < Math.abs(fallback.level - spec.maxLevel)) {
      fallback = result;
    }
  }
  return fallback || (() => {
    const full = generateFull();
    const { puzzle, givens } = carve(full, spec.maxGivens);
    return { puzzle, solution: full, givens, level: 1, difficulty: levelKey };
  })();
}

/* ---------- Aides pour l'interface ---------- */

function conflictsOf(grid, cell) {
  const v = grid[cell];
  if (!v) return [];
  return PEERS[cell].filter(p => grid[p] === v);
}

function candidatesFor(grid, cell) {
  if (grid[cell]) return [];
  let mask = 0b111111111 << 1;
  for (const p of PEERS[cell]) if (grid[p]) mask &= ~BIT[grid[p]];
  return bitsToValues(mask);
}

const SudokuEngine = {
  generate, solve, countSolutions, rateLogic, conflictsOf, candidatesFor,
  LEVELS, PEERS, ROWS, COLS, BOXES, rowOf, colOf, boxOf,
};

if (typeof self !== 'undefined') self.SudokuEngine = SudokuEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = SudokuEngine;
