/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  ascii-converter — le renderer graphique -> ascii temps réel, dans le
 *  cœur (partagé web + console), zéro dépendance, synchrone.
 *
 *  Découpe le PixelScreen 320x200 en blocs de (320/cols)x(200/rows) et
 *  réduit chaque bloc en UNE cellule {ch, fg, bg} :
 *    - bloc jamais dessiné        -> cellule transparente (bg null)
 *    - bloc partiellement dessiné -> glyphe "quadrants" (fg = couleur
 *      majoritaire des pixels dessinés) sur fond transparent : le plan
 *      texte dessous reste lisible autour du tracé
 *    - bloc plein                 -> fond = couleur majoritaire, glyphe
 *      pour les pixels qui diffèrent (opaque, cache le texte)
 *
 *  Le glyphe vient des "quadrant block elements" Unicode (U+2580..259F)
 *  qui codent exactement une grille 2x2 : chaque quadrant du bloc est
 *  "allumé" si au moins la moitié de ses pixels portent le motif.
 *  --------------------------------------------------------------------
 */

/** index = bits TL(1) TR(2) BL(4) BR(8) — table des quadrant blocks. */
const QUAD_GLYPH = [
  " ", "▘", "▝", "▀", "▖", "▌", "▞", "▛",
  "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█",
];

/**
 * Convertit tout l'écran en une grille cols x rows de cellules.
 * cols doit diviser screen.width, rows diviser screen.height
 * (garanti par MODE — sinon les blocs tronqués ignorés suffisent).
 * @returns {Array<{ch:string, fg:number, bg:?number}>}
 */
export function convertScreen(screen, cols, rows) {
  const bw = Math.floor(screen.width / cols);
  const bh = Math.floor(screen.height / rows);
  const cells = new Array(cols * rows);
  let i = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      cells[i++] = blockCell(screen, cx * bw, cy * bh, bw, bh);
    }
  }
  return cells;
}

function blockCell(s, x0, y0, bw, bh) {
  const { colors, touched, width } = s;
  const mw = Math.ceil(bw / 2);              // largeur de la colonne gauche
  const mh = Math.ceil(bh / 2);              // hauteur de la rangée haute

  const qTouched = [0, 0, 0, 0];
  const colCount = new Uint8Array(16);
  let touchedN = 0;

  for (let y = y0; y < y0 + bh; y++) {
    const row = y * width;
    const qy = y - y0 < mh ? 0 : 2;
    for (let x = x0; x < x0 + bw; x++) {
      const i = row + x;
      if (!touched[i]) continue;
      touchedN++;
      colCount[colors[i]]++;
      qTouched[qy + (x - x0 < mw ? 0 : 1)]++;
    }
  }
  if (touchedN === 0) return { ch: " ", fg: 0, bg: null };

  // couleur majoritaire des pixels dessinés
  let major = 0, majorN = -1;
  for (let c = 0; c < 16; c++) {
    if (colCount[c] > majorN) { majorN = colCount[c]; major = c; }
  }

  if (touchedN < bw * bh) {
    // bloc partiel : glyphe opaque sur fond TRANSPARENT
    return { ch: QUAD_GLYPH[quadrantMask(qTouched)], fg: major, bg: null };
  }

  // bloc plein : fond majoritaire, motif = pixels qui diffèrent
  const qOn = [0, 0, 0, 0];
  const onCount = new Uint8Array(16);
  let onN = 0;
  for (let y = y0; y < y0 + bh; y++) {
    const row = y * width;
    const qy = y - y0 < mh ? 0 : 2;
    for (let x = x0; x < x0 + bw; x++) {
      const c = colors[row + x];
      if (c === major) continue;
      onN++;
      onCount[c]++;
      qOn[qy + (x - x0 < mw ? 0 : 1)]++;
    }
  }
  if (onN === 0) return { ch: " ", fg: major, bg: major };
  let fg = 0, fgN = -1;
  for (let c = 0; c < 16; c++) {
    if (onCount[c] > fgN) { fgN = onCount[c]; fg = c; }
  }
  let mask = quadrantMask(qOn);
  return { ch: QUAD_GLYPH[mask], fg, bg: major };
}

/** quadrant allumé dès qu'un pixel du motif le touche : les traits fins
 *  (1 pixel) restent continus — horizontaux ▀/▄, verticaux ▌/▐, coins ▛▜▙▟ */
function quadrantMask(q) {
  let m = 0;
  for (let i = 0; i < 4; i++) if (q[i] > 0) m |= 1 << i;
  return m;
}
