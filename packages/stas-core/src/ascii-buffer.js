/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  AsciiBuffer — LE nouveau "TRAP #3" de STOS.
 *
 *  Dans le STOS original, toute sortie texte passait par TRAP #3 →
 *  FENETRE.S → VDI → écran Atari. Ici, toute sortie passe par ce
 *  buffer 2D de cellules {caractère, encre, papier}. Le cœur BASIC
 *  écrit dans le buffer SANS JAMAIS savoir où il s'affiche.
 *
 *  Les adaptateurs (console ANSI, canvas HTML) lisent le buffer.
 *  --------------------------------------------------------------------
 */

/** Les 16 couleurs STOS (palette lowres par défaut) → RGB */
export const STOS_PALETTE = [
  [0xff, 0xff, 0xff], // 0  blanc (STOS démarre encre=0 sur fond noir...)
  [0xff, 0x00, 0x00], // 1  rouge
  [0x00, 0xff, 0x00], // 2  vert
  [0xff, 0xff, 0x00], // 3  jaune
  [0x00, 0x00, 0xff], // 4  bleu
  [0xff, 0x00, 0xff], // 5  magenta
  [0x00, 0xff, 0xff], // 6  cyan
  [0xff, 0xff, 0xff], // 7  blanc
  [0x7f, 0x7f, 0x7f], // 8  gris
  [0x7f, 0x00, 0x00], // 9
  [0x00, 0x7f, 0x00], // 10
  [0x7f, 0x7f, 0x00], // 11
  [0x00, 0x00, 0x7f], // 12
  [0x7f, 0x00, 0x7f], // 13
  [0x00, 0x7f, 0x7f], // 14
  [0x00, 0x00, 0x00], // 15 noir
];

export class AsciiBuffer {
  /**
   * @param {number} width   Largeur en cellules (80 par défaut)
   * @param {number} height  Hauteur en cellules (25 par défaut)
   */
  constructor(width = 80, height = 25) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height);
    this.cx = 0;                 // position curseur X (comme FENETRE.S)
    this.cy = 0;                 // position curseur Y
    this.curPen = 0;             // encre courante (PEN)
    this.curPaper = 15;          // papier courant (PAPER)
    this.cursorVisible = true;
    this.version = 0;            // incrementé à chaque modification (dirty tracking)
    this.view = null;            // fenêtre active {x,y,w,h} ou null = plein écran
    this.translate = null;       // traduction d'affichage (mode borders=st)
    this.clear();
  }

  get viewX() { return this.view ? this.view.x : 0; }
  get viewY() { return this.view ? this.view.y : 0; }
  get viewW() { return this.view ? this.view.w : this.width; }
  get viewH() { return this.view ? this.view.h : this.height; }

  /** Active une fenêtre (coordonnées du curseur RELATIVES à la vue). */
  setView(v) {
    this.view = v;
    this.cx = 0;
    this.cy = 0;
  }

  /** Efface tout avec le papier courant — équivalent CLS */
  clear(paper = this.curPaper) {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { ch: " ", fg: this.curPen, bg: paper };
    }
    this.cx = 0;
    this.cy = 0;
    this.version++;
  }

  idx(x, y) {
    return y * this.width + x;
  }

  /** Écrit UN caractère à une position explicite */
  put(x, y, ch, fg = this.curPen, bg = this.curPaper) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const c = this.cells[this.idx(x, y)];
    if (c.ch === ch && c.fg === fg && c.bg === bg) return;
    c.ch = ch;
    c.fg = fg;
    c.bg = bg;
    this.version++;
  }

  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.cells[this.idx(x, y)];
  }

  /**
   * Écrit du texte à la position du curseur, avec gestion de \n, \r
   * et scrolling automatique. C'est le cœur de PRINT.
   * @param {string} text
   * @param {number} [fg] encre (défaut: encre courante)
   * @param {number} [bg] papier (défaut: papier courant)
   */
  write(text, fg = this.curPen, bg = this.curPaper) {
    const vx = this.viewX, vy = this.viewY, vw = this.viewW;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\n") {
        this.newLine();
      } else if (ch === "\r") {
        this.cx = 0;
      } else if (ch === "\t") {
        // TAB STOS: colonnes multiples de 14 (comme le PRINT , )
        this.cx = Math.min(vw - 1, (Math.floor(this.cx / 14) + 1) * 14);
      } else {
        this.put(vx + this.cx, vy + this.cy, ch, fg, bg);
        this.cx++;
        if (this.cx >= vw) this.newLine();
      }
    }
  }

  /** Retour chariot + scroll (dans la vue active) si nécessaire */
  newLine() {
    const vh = this.viewH;
    this.cx = 0;
    this.cy++;
    if (this.cy >= vh) {
      this.scrollView(1);
      this.cy = vh - 1;
    }
  }

  /**
   * Scroll d'une zone rectangulaire (défaut : la vue active, sinon tout
   * l'écran). dir > 0 = vers le haut, dir < 0 = vers le bas.
   */
  scrollView(dir, rect = null) {
    const r = rect ?? (this.view ?? { x: 0, y: 0, w: this.width, h: this.height });
    const { x, y, w, h } = r;
    if (dir >= 0) {
      for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < w; i++) {
          this.cells[this.idx(x + i, y + j)] = this.cells[this.idx(x + i, y + j + 1)];
        }
      }
      for (let i = 0; i < w; i++) {
        this.cells[this.idx(x + i, y + h - 1)] = { ch: " ", fg: this.curPen, bg: this.curPaper };
      }
    } else {
      for (let j = h - 1; j > 0; j--) {
        for (let i = 0; i < w; i++) {
          this.cells[this.idx(x + i, y + j)] = this.cells[this.idx(x + i, y + j - 1)];
        }
      }
      for (let i = 0; i < w; i++) {
        this.cells[this.idx(x + i, y)] = { ch: " ", fg: this.curPen, bg: this.curPaper };
      }
    }
    this.version++;
  }

  /** Scroll tout l'écran d'une ligne vers le haut */
  scrollUp() {
    this.scrollView(1, { x: 0, y: 0, w: this.width, h: this.height });
  }

  /** LOCATE x,y (0-based, RELATIF à la fenêtre active) */
  locate(x, y) {
    this.cx = Math.max(0, Math.min(this.viewW - 1, x | 0));
    this.cy = Math.max(0, Math.min(this.viewH - 1, y | 0));
  }

  /** Curseur haut/bas/gauche/droite — CUP/CDOWN/CLEFT/CRIGHT */
  moveCursor(dx, dy) {
    this.locate(this.cx + dx, this.cy + dy);
  }

  /** Efface la ligne courante (dans la vue active) */
  clearLine(y = this.cy) {
    for (let x = 0; x < this.viewW; x++) {
      this.put(this.viewX + x, this.viewY + y, " ", this.curPen, this.curPaper);
    }
  }

  /**
   * Rend le buffer en texte brut (sans couleurs) — utile pour les logs,
   * le postMessage vers AWI, les tests.
   */
  toText() {
    let out = "";
    for (let y = 0; y < this.height; y++) {
      let line = "";
      for (let x = 0; x < this.width; x++) {
        const c = this.cells[this.idx(x, y)];
        line += this.translate ? this.translate(c.ch) : c.ch;
      }
      out += line.replace(/\s+$/, "") + "\n";
    }
    return out;
  }

  /** Redimensionne le buffer (DISPLAY SIZE) */
  resize(width, height) {
    const old = this.cells;
    const ow = this.width, oh = this.height;
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < ow && y < oh) {
          this.cells[this.idx(x, y)] = old[y * ow + x];
        } else {
          this.cells[this.idx(x, y)] = { ch: " ", fg: this.curPen, bg: this.curPaper };
        }
      }
    }
    this.locate(this.cx, this.cy);
    this.version++;
  }
}

/**
 * Construit un "echo" branché sur un buffer — utilisé par l'éditeur
 * (invite "Ok") et par INPUT pour que les caractères tapés s'affichent
 * à la position du curseur, comme sur l'écran du STOS.
 */
export function makeEcho(buffer) {
  return {
    write: (s) => buffer.write(s),
    backspace: () => {
      if (buffer.cx > 0) {
        buffer.put(buffer.viewX + buffer.cx - 1, buffer.viewY + buffer.cy, " ");
        buffer.cx--;
        buffer.version++;
      }
    },
    newline: () => buffer.newLine(),
  };
}
