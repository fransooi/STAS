/*
 *  STAS sprites — les outils de dessin (les 18 OP de l'original).
 *  --------------------------------------------------------------------
 *  Chaque outil est une fonction PURE qui mutile un Sprite avec une
 *  "encre" {ch, fg, bg}. Transposition pixel → caractère :
 *
 *    Plot          → poser le caractère
 *    Draw/Line     → tracer le caractère le long d'un segment (Bresenham)
 *    Box/FilledBox → rectangle vide / plein
 *    Circle/Ellipse(+filled) → tracé midpoint
 *    Paint         → flood-fill de caractère (région de même caractère)
 *    Clear         → tout en espaces
 *    Flip-H/Flip-V → inversion colonnes / lignes
 *    Rotate        → rotation 90° (carré uniquement, comme l'original)
 *    Reduce        → recadrage sur la boîte englobante du contenu
 *    Scroll        → décalage du contenu (les flèches de l'original)
 *
 *  Plus besoin du code machine 68000 (call 15) : flip/rotate sont de
 *  simples réorganisations de tableau.
 *  --------------------------------------------------------------------
 */

/** Pose l'encre en (x,y) — équivalent du PLOT. */
export function plot(s, x, y, ink) {
  s.ink(x, y, ink);
}

/** Segment de (x0,y0) à (x1,y1) — algorithme de Bresenham. */
export function line(s, x0, y0, x1, y1, ink) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    s.ink(x0, y0, ink);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Contour de rectangle. */
export function box(s, x0, y0, x1, y1, ink) {
  const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [c, d] = y0 <= y1 ? [y0, y1] : [y1, y0];
  for (let x = a; x <= b; x++) { s.ink(x, c, ink); s.ink(x, d, ink); }
  for (let y = c; y <= d; y++) { s.ink(a, y, ink); s.ink(b, y, ink); }
}

/** Rectangle plein. */
export function fillBox(s, x0, y0, x1, y1, ink) {
  const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [c, d] = y0 <= y1 ? [y0, y1] : [y1, y0];
  for (let y = c; y <= d; y++) {
    for (let x = a; x <= b; x++) s.ink(x, y, ink);
  }
}

/** Les 8 points symétriques d'un cercle de centre (cx,cy). */
function circlePoints(s, cx, cy, x, y, ink) {
  s.ink(cx + x, cy + y, ink);
  s.ink(cx - x, cy + y, ink);
  s.ink(cx + x, cy - y, ink);
  s.ink(cx - x, cy - y, ink);
  s.ink(cx + y, cy + x, ink);
  s.ink(cx - y, cy + x, ink);
  s.ink(cx + y, cy - x, ink);
  s.ink(cx - y, cy - x, ink);
}

/** Cercle (contour) — algorithme du point milieu. */
export function circle(s, cx, cy, r, ink) {
  cx |= 0; cy |= 0; r = Math.abs(r | 0);
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    circlePoints(s, cx, cy, x, y, ink);
    y++;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

/** Cercle plein. */
export function fillCircle(s, cx, cy, r, ink) {
  cx |= 0; cy |= 0; r = Math.abs(r | 0);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let dx = -w; dx <= w; dx++) s.ink(cx + dx, cy + dy, ink);
  }
}

/** Ellipse (contour) — algorithme du point milieu. */
export function ellipse(s, cx, cy, rx, ry, ink) {
  cx |= 0; cy |= 0;
  rx = Math.abs(rx | 0); ry = Math.abs(ry | 0);
  if (rx === 0 && ry === 0) { s.ink(cx, cy, ink); return; }
  if (rx === 0) { line(s, cx, cy - ry, cx, cy + ry, ink); return; }
  if (ry === 0) { line(s, cx - rx, cy, cx + rx, cy, ink); return; }

  const rx2 = rx * rx, ry2 = ry * ry;
  let x = 0, y = ry;
  let px = 0, py = 2 * rx2 * y;
  const plot4 = (xx, yy) => {
    s.ink(cx + xx, cy + yy, ink);
    s.ink(cx - xx, cy + yy, ink);
    s.ink(cx + xx, cy - yy, ink);
    s.ink(cx - xx, cy - yy, ink);
  };
  plot4(x, y);
  // Région 1
  let p1 = ry2 - rx2 * ry + rx2 / 4;
  while (px < py) {
    x++;
    px += 2 * ry2;
    if (p1 < 0) {
      p1 += ry2 + px;
    } else {
      y--;
      py -= 2 * rx2;
      p1 += ry2 + px - py;
    }
    plot4(x, y);
  }
  // Région 2
  let p2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y > 0) {
    y--;
    py -= 2 * rx2;
    if (p2 > 0) {
      p2 += rx2 - py;
    } else {
      x++;
      px += 2 * ry2;
      p2 += ry2 + rx2 - py;
    }
    plot4(x, y);
  }
}

/** Ellipse pleine. */
export function fillEllipse(s, cx, cy, rx, ry, ink) {
  cx |= 0; cy |= 0;
  rx = Math.abs(rx | 0); ry = Math.abs(ry | 0);
  if (rx === 0 && ry === 0) { s.ink(cx, cy, ink); return; }
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry || 1);
    const w = Math.floor(rx * Math.sqrt(Math.max(0, t)));
    for (let dx = -w; dx <= w; dx++) s.ink(cx + dx, cy + dy, ink);
  }
}

/**
 * Flood-fill de caractère : remplace la région connexe du MÊME caractère
 * que la cellule cliquée (comme le Paint de l'original testait la couleur).
 * Une garde "déjà visité" garantit la terminaison même quand l'encre ne
 * change que le papier (le caractère restant identique à la cible).
 * @param {boolean} [matchBg=false] Si vrai, exige aussi le même papier.
 */
export function floodFill(s, x, y, ink, matchBg = false) {
  const target = s.get(x, y);
  if (!target) return;
  const tCh = target.ch;
  const tBg = target.bg;
  if (ink.ch != null && ink.ch === tCh && (ink.bg == null || ink.bg === tBg)) {
    return; // rien à faire
  }
  const visited = new Uint8Array(s.w * s.h);
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= s.w || cy < 0 || cy >= s.h) continue;
    const id = cy * s.w + cx;
    if (visited[id]) continue;
    visited[id] = 1;
    const c = s.cells[id];
    if (c.ch !== tCh) continue;
    if (matchBg && c.bg !== tBg) continue;
    s.ink(cx, cy, ink);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

/** Efface tout le sprite (équivalent CLEAR). */
export function clearSprite(s, ink = { ch: " ", fg: 0, bg: 15 }) {
  s.clear(ink.fg ?? 0, ink.bg ?? 15);
}

/** Miroir horizontal (Flip-H). */
export function flipH(s) {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < Math.floor(s.w / 2); x++) {
      const a = s.cells[s.idx(x, y)];
      const b = s.cells[s.idx(s.w - 1 - x, y)];
      s.cells[s.idx(x, y)] = b;
      s.cells[s.idx(s.w - 1 - x, y)] = a;
    }
  }
  s.hx = s.w - 1 - s.hx;
}

/** Miroir vertical (Flip-V). */
export function flipV(s) {
  for (let y = 0; y < Math.floor(s.h / 2); y++) {
    for (let x = 0; x < s.w; x++) {
      const a = s.cells[s.idx(x, y)];
      const b = s.cells[s.idx(x, s.h - 1 - y)];
      s.cells[s.idx(x, y)] = b;
      s.cells[s.idx(x, s.h - 1 - y)] = a;
    }
  }
  s.hy = s.h - 1 - s.hy;
}

/**
 * Rotation 90° horaire. Comme l'original, exige un sprite CARRÉ
 * (sinon retourne false — l'original sonnait "bell").
 */
export function rotate(s) {
  if (s.w !== s.h) return false;
  const n = s.w;
  const old = s.cells.slice();
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // (x,y) → (n-1-y, x)
      s.cells[s.idx(n - 1 - y, x)] = old[y * n + x];
    }
  }
  const hx = s.hx;
  s.hx = n - 1 - s.hy;
  s.hy = hx;
  return true;
}

/**
 * Recadre sur la boîte englobante du contenu (REDUCE). Ne fait rien si
 * le sprite est vide. Décale le point chaud en conséquence.
 */
export function reduce(s) {
  const b = s.bounds();
  if (!b) return false;
  const nw = b.x1 - b.x0 + 1;
  const nh = b.y1 - b.y0 + 1;
  if (nw === s.w && nh === s.h && b.x0 === 0 && b.y0 === 0) return false;
  const old = s.cells;
  const ow = s.w;
  s.w = nw;
  s.h = nh;
  s.cells = new Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      s.cells[y * nw + x] = old[(b.y0 + y) * ow + (b.x0 + x)];
    }
  }
  s.hx = Math.max(0, s.hx - b.x0);
  s.hy = Math.max(0, s.hy - b.y0);
  return true;
}

/** Décalage du contenu avec enroulement (les flèches de l'original). */
export function scroll(s, dx, dy) {
  dx = ((dx % s.w) + s.w) % s.w;
  dy = ((dy % s.h) + s.h) % s.h;
  const old = s.cells.slice();
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const sx = (x - dx + s.w) % s.w;
      const sy = (y - dy + s.h) % s.h;
      s.cells[s.idx(x, y)] = old[sy * s.w + sx];
    }
  }
}

/** Tableau des outils par nom — pratique pour le dispatch UI/console. */
export const TOOLS = {
  plot, line, box, fillBox, circle, fillCircle,
  ellipse, fillEllipse, floodFill, clearSprite,
  flipH, flipV, rotate, reduce, scroll,
};
