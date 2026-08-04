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
    this.clear();
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
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\n") {
        this.newLine();
      } else if (ch === "\r") {
        this.cx = 0;
      } else if (ch === "\t") {
        // TAB STOS: colonnes multiples de 14 (comme le PRINT , )
        this.cx = Math.min(this.width - 1, (Math.floor(this.cx / 14) + 1) * 14);
      } else {
        this.put(this.cx, this.cy, ch, fg, bg);
        this.cx++;
        if (this.cx >= this.width) this.newLine();
      }
    }
  }

  /** Retour chariot + scroll si nécessaire */
  newLine() {
    this.cx = 0;
    this.cy++;
    if (this.cy >= this.height) {
      this.scrollUp();
      this.cy = this.height - 1;
    }
  }

  /** Scroll tout l'écran d'une ligne vers le haut */
  scrollUp() {
    const w = this.width;
    this.cells.copyWithin(0, w);
    for (let x = 0; x < w; x++) {
      this.cells[this.idx(x, this.height - 1)] = {
        ch: " ", fg: this.curPen, bg: this.curPaper,
      };
    }
    this.version++;
  }

  /** LOCATE x,y (coordonnées 0-based, comme STOS) */
  locate(x, y) {
    this.cx = Math.max(0, Math.min(this.width - 1, x | 0));
    this.cy = Math.max(0, Math.min(this.height - 1, y | 0));
  }

  /** Curseur haut/bas/gauche/droite — CUP/CDOWN/CLEFT/CRIGHT */
  moveCursor(dx, dy) {
    this.locate(this.cx + dx, this.cy + dy);
  }

  /** Efface la ligne courante */
  clearLine(y = this.cy) {
    for (let x = 0; x < this.width; x++) {
      this.put(x, y, " ", this.curPen, this.curPaper);
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
        line += this.cells[this.idx(x, y)].ch;
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
        buffer.put(buffer.cx - 1, buffer.cy, " ");
        buffer.cx--;
        buffer.version++;
      }
    },
    newline: () => buffer.newLine(),
  };
}
