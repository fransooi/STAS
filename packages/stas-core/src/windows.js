/*
 *  STAS — Fenêtres texte (port de FENETRE.S)
 *  --------------------------------------------------------------------
 *  Le STOS dessine ses fenêtres dans une police dédiée (`*.CRx`), dont
 *  les codes 192-253 sont des glyphes de cadre. `tbords` (FENETRE.S)
 *  définit 15 bordures de 8 glyphes, dans cet ordre :
 *
 *    coin haut-gauche, bord haut (répété), coin haut-droit,
 *    bord gauche, bord droit,
 *    coin bas-gauche, bord bas (répété), coin bas-droit
 *
 *  Ici la table est celle d'origine (codes réels), et STOS_GLYPH la
 *  traduit en caractères Unicode pour l'affichage « simple ». Le réglage
 *  `borders=unicode|st` choisit ce qui est écrit dans la cellule.
 *
 *  Les coordonnées du curseur sont RELATIVES à la zone texte de la
 *  fenêtre active (startx/starty), comme dans FENETRE.S.
 *  --------------------------------------------------------------------
 */

import { ERR } from "./errors.js";

/** tbords de FENETRE.S — 15 bordures, codes réels STOS. */
export const BORDERS_ST = [
  [192, 193, 194, 195, 196, 197, 198, 199], // 1  fin simple
  [200, 201, 202, 203, 204, 205, 206, 207], // 2  épais
  [208, 209, 210, 211, 212, 213, 214, 215], // 3  double
  [216, 217, 218, 219, 220, 221, 222, 223], // 4  double + ombre
  [224, 193, 225, 195, 196, 226, 198, 227], // 5  coins retournés
  [228, 201, 229, 203, 204, 230, 206, 231], // 6  coins retournés épais
  [232, 209, 233, 211, 212, 234, 214, 235], // 7  coins retournés double
  [236, 217, 237, 219, 220, 238, 222, 239], // 8  coins retournés double
  [224, 240, 225, 241, 242, 226, 243, 227], // 9  décoratif
  [192, 240, 194, 241, 242, 197, 243, 199], // 10 décoratif
  [244, 201, 245, 203, 204, 246, 206, 247], // 11 coins hachurés + épais
  [248, 193, 249, 195, 196, 250, 198, 251], // 12 coins mixtes
  [248, 240, 249, 241, 242, 250, 243, 251], // 13 coins mixtes décoratif
  [252, 252, 252, 252, 252, 252, 252, 252], // 14 bloc plein
  [253, 253, 253, 253, 253, 253, 253, 253], // 15 trame 50 %
];

/**
 * Traduction code STOS → glyphe Unicode (affichage « simple »). Décodée
 * depuis la police 8X8.CR0 (STOSHDD/STOS/).
 */
export const STOS_GLYPH = new Map([
  [192, "┌"], [193, "─"], [194, "┐"], [195, "│"], [196, "│"],
  [197, "└"], [198, "─"], [199, "┘"],
  [200, "┏"], [201, "━"], [202, "┓"], [203, "┃"], [204, "┃"],
  [205, "┗"], [206, "━"], [207, "┛"],
  [208, "╔"], [209, "═"], [210, "╗"], [211, "║"], [212, "║"],
  [213, "╚"], [214, "═"], [215, "╝"],
  [216, "╔"], [217, "═"], [218, "╗"], [219, "║"], [220, "║"],
  [221, "╚"], [222, "═"], [223, "╝"],
  [224, "┘"], [225, "└"], [226, "┐"], [227, "┌"],
  [228, "┛"], [229, "┗"], [230, "┓"], [231, "┏"],
  [232, "╝"], [233, "╚"], [234, "╗"], [235, "╔"],
  [236, "╝"], [237, "╚"], [238, "╗"], [239, "╔"],
  [240, "╌"], [241, "╎"], [242, "╎"], [243, "╌"],
  [244, "┏"], [245, "┓"], [246, "┗"], [247, "┛"],
  [248, "┌"], [249, "┐"], [250, "└"], [251, "┘"],
  [252, "█"], [253, "▒"],
]);

export function borderCodeToGlyph(c) {
  return STOS_GLYPH.get(c) ?? String.fromCharCode(c);
}

/**
 * Gestion des fenêtres texte. La fenêtre 0 est le plein écran (toujours
 * ouverte, pas d'objet). `stack` = fenêtres activées, la dernière est
 * active.
 */
export class WindowManager {
  constructor(io) {
    this.io = io;
    this.byNum = new Map();
    this.stack = [0];
    this.mode = "unicode"; // "unicode" (défaut) | "st" (codes réels)
  }

  get buffer() { return this.io.buffer; }
  get activeNumber() { return this.stack[this.stack.length - 1] ?? 0; }
  get active() { const n = this.activeNumber; return n === 0 ? null : this.byNum.get(n) ?? null; }

  /** Glyphe écrit dans la cellule selon le mode d'affichage. */
  glyph(code) {
    return this.mode === "st" ? String.fromCharCode(code) : borderCodeToGlyph(code);
  }

  /** Zone texte d'une fenêtre (à l'intérieur de la bordure). */
  textRect(w) {
    return w.border
      ? { x: w.x + 1, y: w.y + 1, w: w.w - 2, h: w.h - 2 }
      : { x: w.x, y: w.y, w: w.w, h: w.h };
  }

  /** WINDOPEN n,x,y,tx,ty[,bordure][,jeu] */
  open(n, x, y, w, h, border, charset, it) {
    if (n === 0 || (n >= 14 && n < 16)) it.err(ERR.SYS_WIND);      // 76
    if (n < 0 || n >= 16) it.err(ERR.FON_CALL);                    // 13
    if (this.byNum.has(n)) it.err(ERR.WIND_OPEN);                  // 69
    if (border < 0 || border > 16) it.err(ERR.FON_CALL);
    if (w <= 0 || h <= 0) it.err(ERR.WIND_SMALL);                  // 71
    if (x < 0 || y < 0 || x + w > this.buffer.width || y + h > this.buffer.height) {
      it.err(ERR.WIND_LARGE);                                      // 72
    }
    const win = {
      n, x, y, w, h, border: border | 0, charset,
      scroll: true, pen: this.buffer.curPen, paper: this.buffer.curPaper,
    };
    if (win.border) {
      const r = this.textRect(win);
      if (r.w < 1 || r.h < 1) it.err(ERR.WIND_SMALL);
    }
    this.byNum.set(n, win);
    if (win.border) this.drawBorder(win);
    this.clearRect(win);
    this.activate(n, it);
  }

  /** WINDOW n[,m…] / QWINDOW n : active une ou plusieurs fenêtres. */
  activate(n, it) {
    if (n === 0) { this.stack = [0]; this.buffer.setView(null); return; }
    if (n < 0 || n >= 16 || (n >= 14)) it.err(ERR.SYS_WIND);
    const win = this.byNum.get(n);
    if (!win) it.err(ERR.WIND_NOT_OPEN);                           // 70
    this.stack.push(n);
    this.buffer.setView(this.textRect(win));
    this.buffer.curPen = win.pen;
    this.buffer.curPaper = win.paper;
    this.buffer.locate(0, 0);
  }

  /** WINDON — numéro de la fenêtre active (0 = plein écran). */
  current() { return this.activeNumber; }

  /** WINDMOVE x,y — déplace la fenêtre active (origine en x,y). */
  move(x, y, it) {
    const win = this.active;
    if (!win) it.err(ERR.WIND_NOT_OPEN);
    this.clearRect(win, true);
    win.x = x;
    win.y = y;
    if (win.border) this.drawBorder(win);
    this.clearRect(win);
    this.buffer.setView(this.textRect(win));
    this.buffer.locate(0, 0);
  }

  /** WINDEL n — détruit une fenêtre. */
  del(n, it) {
    if (n === 0 || (n >= 14 && n < 16)) it.err(ERR.SYS_WIND);
    const win = this.byNum.get(n);
    if (!win) it.err(ERR.WIND_NOT_OPEN);
    this.clearRect(win, true);
    this.byNum.delete(n);
    this.stack = this.stack.filter((k) => k !== n);
    if (!this.stack.length) this.stack = [0];
    const cur = this.active;
    this.buffer.setView(cur ? this.textRect(cur) : null);
  }

  /** BORDER n — (re)dessine la bordure de la fenêtre active. */
  setBorder(style, it) {
    const win = this.active;
    if (!win || !win.border) it.err(ERR.WIND_NOT_OPEN);
    if (style >= 1 && style <= 15) win.border = style;
    if (win.border) this.drawBorder(win);
  }

  /** TITLE a$ — chaîne centrée sur la ligne haute de la fenêtre. */
  title(text, it) {
    const win = this.active;
    if (!win) it.err(ERR.WIND_NOT_OPEN);
    if (!win.border) return;
    const s = String(text);
    const start = win.x + Math.max(0, Math.floor((win.w - s.length) / 2));
    for (let i = 0; i < s.length && start + i < win.x + win.w; i++) {
      this.buffer.put(start + i, win.y, s[i], win.pen, win.paper);
    }
  }

  /** CLW — efface la zone texte de la fenêtre active. */
  clearActive(it) {
    const win = this.active;
    if (!win) it.err(ERR.WIND_NOT_OPEN);
    this.clearRect(win);
  }

  /** SCROLL UP/DOWN — fait défiler la zone texte (plein écran si aucune). */
  scroll(down, it) {
    const win = this.active;
    const r = win
      ? this.textRect(win)
      : { x: 0, y: 0, w: this.buffer.width, h: this.buffer.height };
    this.buffer.scrollView(down ? -1 : 1, r);
  }

  /** Remplit la zone (true = fenêtre entière) avec le papier. */
  clearRect(win, whole = false) {
    const r = whole ? { x: win.x, y: win.y, w: win.w, h: win.h } : this.textRect(win);
    for (let yy = 0; yy < r.h; yy++) {
      for (let xx = 0; xx < r.w; xx++) {
        this.buffer.put(r.x + xx, r.y + yy, " ", win.pen, win.paper);
      }
    }
  }

  drawBorder(win) {
    const codes = BORDERS_ST[(win.border || 1) - 1];
    const b = this.buffer;
    const { x, y, w, h } = win;
    const g = (i) => this.glyph(codes[i]);
    b.put(x, y, g(0), win.pen, win.paper);
    for (let i = 1; i <= w - 2; i++) b.put(x + i, y, g(1), win.pen, win.paper);
    b.put(x + w - 1, y, g(2), win.pen, win.paper);
    for (let j = 1; j <= h - 2; j++) {
      b.put(x, y + j, g(3), win.pen, win.paper);
      b.put(x + w - 1, y + j, g(4), win.pen, win.paper);
    }
    b.put(x, y + h - 1, g(5), win.pen, win.paper);
    for (let i = 1; i <= w - 2; i++) b.put(x + i, y + h - 1, g(6), win.pen, win.paper);
    b.put(x + w - 1, y + h - 1, g(7), win.pen, win.paper);
  }
}
