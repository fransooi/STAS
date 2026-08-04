/*
 *  STAS sprites — le modèle Sprite ASCII.
 *  --------------------------------------------------------------------
 *  Un sprite ASCII est une GRILLE de cellules {ch, fg, bg} — exactement
 *  le même format de cellule que l'AsciiBuffer de stas-core. Sauf qu'ici
 *  chaque cellule n'est pas un pixel mais un CARACTÈRE (Unicode étendu),
 *  avec son encre (fg) et son papier (bg).
 *
 *  Le modèle reste volontairement agnostique (zéro import Node) pour que
 *  l'éditeur web le réutilise tel quel. La palette par défaut est une
 *  copie de STOS_PALETTE (stas-core) : 16 couleurs, indice 0 = blanc,
 *  15 = noir, comme sur le ST lowres.
 *  --------------------------------------------------------------------
 */

/** Les 16 couleurs STOS (identique à STOS_PALETTE de stas-core). */
export const SPRITE_PALETTE = [
  [0xff, 0xff, 0xff], // 0  blanc
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

/** Une cellule vide : espace, encre blanche, papier noir. */
export function emptyCell(fg = 0, bg = 15) {
  return { ch: " ", fg, bg };
}

export class Sprite {
  /**
   * @param {number} w  Largeur en cellules (TX de l'original, 32 par défaut)
   * @param {number} h  Hauteur en cellules (TY de l'original, 32 par défaut)
   * @param {object} [opts]
   * @param {number} [opts.hx] Abscisse du point chaud (hot spot)
   * @param {number} [opts.hy] Ordonnée du point chaud
   * @param {string} [opts.name] Nom du sprite
   * @param {string} [opts.font] Identifiant de police de rendu
   * @param {number[][]} [opts.palette] 16 triplets RGB
   */
  constructor(w = 32, h = 32, opts = {}) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.cells = new Array(this.w * this.h);
    this.hx = opts.hx ?? 0;
    this.hy = opts.hy ?? 0;
    this.name = opts.name ?? "";
    this.font = opts.font ?? "vt323";
    this.palette = (opts.palette ?? SPRITE_PALETTE).map((c) => c.slice());
    this.clear();
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  /** Lit une cellule (null hors cadre). */
  get(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.cells[this.idx(x, y)];
  }

  /** Écrit une cellule complète. */
  put(x, y, ch, fg, bg) {
    if (!this.inBounds(x, y)) return;
    const c = this.cells[this.idx(x, y)];
    c.ch = ch;
    c.fg = fg;
    c.bg = bg;
  }

  /**
   * Pose une "encre" {ch,fg,bg} en (x,y). Les champs absents de l'encre
   * laissent la valeur existante (pratique pour ne changer que le caractère).
   */
  ink(x, y, ink) {
    if (!this.inBounds(x, y)) return;
    const c = this.cells[this.idx(x, y)];
    if (ink.ch != null) c.ch = ink.ch;
    if (ink.fg != null) c.fg = ink.fg;
    if (ink.bg != null) c.bg = ink.bg;
  }

  /** Efface tout : espaces, encre fg, papier bg. */
  clear(fg = 0, bg = 15) {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { ch: " ", fg, bg };
    }
  }

  /** Une cellule est-elle vide ? (espace sur papier noir) */
  isEmpty(x, y) {
    const c = this.get(x, y);
    return !c || (c.ch === " " && c.bg === 15);
  }

  clone() {
    const s = new Sprite(this.w, this.h, {
      hx: this.hx,
      hy: this.hy,
      name: this.name,
      font: this.font,
      palette: this.palette,
    });
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      s.cells[i] = { ch: c.ch, fg: c.fg, bg: c.bg };
    }
    return s;
  }

  /**
   * Redimensionne en conservant le coin haut-gauche (comme le "Fix size"
   * de l'original). Le point chaud est clampé dans les nouvelles bornes.
   */
  resize(w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    const old = this.cells;
    const ow = this.w;
    const oh = this.h;
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.cells[this.idx(x, y)] =
          x < ow && y < oh
            ? old[y * ow + x]
            : { ch: " ", fg: 0, bg: 15 };
      }
    }
    this.hx = Math.min(this.hx, w - 1);
    this.hy = Math.min(this.hy, h - 1);
  }

  /**
   * Boîte englobante du contenu non vide → {x0,y0,x1,y1}, ou null si le
   * sprite est entièrement vide. Sert à REDUCE (recadrage auto).
   */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isEmpty(x, y)) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x0, y0, x1, y1 };
  }

  /** Nombre de cellules non vides. */
  countNonEmpty() {
    let n = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isEmpty(x, y)) n++;
      }
    }
    return n;
  }

  /**
   * Sérialisation JSON du sprite. La palette est partagée au niveau de la
   * banque (comme le PAL(16) unique de l'original) : elle n'est pas répétée
   * ici. Les couleurs fg/bg restent PAR CELLULE.
   */
  toJSON() {
    return {
      name: this.name,
      w: this.w,
      h: this.h,
      hx: this.hx,
      hy: this.hy,
      font: this.font,
      cells: this.cells.map((c) => ({ ch: c.ch, fg: c.fg, bg: c.bg })),
    };
  }

  static fromJSON(o) {
    const s = new Sprite(o.w, o.h, {
      hx: o.hx,
      hy: o.hy,
      name: o.name,
      font: o.font,
    });
    const n = Math.min(s.cells.length, o.cells?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const c = o.cells[i];
      s.cells[i] = { ch: c.ch, fg: c.fg, bg: c.bg };
    }
    return s;
  }
}
