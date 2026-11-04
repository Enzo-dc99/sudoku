/* Moteur « Code couleur » : code secret, évaluation des essais, codes encore possibles.
   Un code est un tableau d'indices de couleur (0 … colors-1). */

(() => {
  const LEVELS = {
    facile:    { label: 'Facile',    pegs: 4, colors: 6, repeats: false, tries: 10 },
    moyen:     { label: 'Moyen',     pegs: 4, colors: 6, repeats: true,  tries: 10 },
    difficile: { label: 'Difficile', pegs: 5, colors: 7, repeats: true,  tries: 10 },
    expert:    { label: 'Expert',    pegs: 6, colors: 8, repeats: true,  tries: 12 },
  };
  const COLOR_NAMES = ['Rouge', 'Orange', 'Jaune', 'Vert', 'Cyan', 'Bleu', 'Violet', 'Rose'];
  const MAX_COLORS = COLOR_NAMES.length;

  function makeSecret(level, rand = Math.random) {
    const { pegs, colors, repeats } = LEVELS[level];
    if (repeats) return Array.from({ length: pegs }, () => (rand() * colors) | 0);
    const pool = Array.from({ length: colors }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, pegs);
  }

  // tampons réutilisés : score() est appelé des centaines de milliers de fois par countPossible()
  const gCount = new Int8Array(MAX_COLORS), sCount = new Int8Array(MAX_COLORS);

  /* exact : bonne couleur à la bonne place ; near : bonne couleur mal placée. */
  function score(guess, secret) {
    gCount.fill(0); sCount.fill(0);
    let exact = 0;
    for (let i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) exact++;
      else { gCount[guess[i]]++; sCount[secret[i]]++; }
    }
    let near = 0;
    for (let c = 0; c < MAX_COLORS; c++) near += Math.min(gCount[c], sCount[c]);
    return { exact, near };
  }

  /* Nombre de codes encore compatibles avec toutes les réponses reçues.
     fixed (facultatif) : couleur connue par position (révélée par un indice), null sinon. */
  function countPossible(level, guesses, answers, fixed = []) {
    const { pegs, colors, repeats } = LEVELS[level];
    const total = colors ** pegs;
    const code = new Array(pegs).fill(0);
    const seen = new Int8Array(MAX_COLORS);
    let count = 0;
    next: for (let n = 0; n < total; n++) {
      let x = n;
      for (let i = 0; i < pegs; i++) { code[i] = x % colors; x = (x / colors) | 0; }
      for (let i = 0; i < fixed.length; i++) if (fixed[i] != null && code[i] !== fixed[i]) continue next;
      if (!repeats) {
        seen.fill(0);
        for (let i = 0; i < pegs; i++) if (seen[code[i]]++) continue next;
      }
      for (let k = 0; k < guesses.length; k++) {
        const r = score(guesses[k], code);
        if (r.exact !== answers[k].exact || r.near !== answers[k].near) continue next;
      }
      count++;
    }
    return count;
  }

  const CodeEngine = { LEVELS, COLOR_NAMES, makeSecret, score, countPossible };

  if (typeof self !== 'undefined') self.CodeEngine = CodeEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = CodeEngine;
})();
