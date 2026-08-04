/*
 *  STAS web — rendu canvas du buffer ASCII.
 *  --------------------------------------------------------------------
 *  L'équivalent HTML du renderer ANSI : relit l'AsciiBuffer et le peint
 *  cellule par cellule sur un canvas, avec la police VT323 (chargée en
 *  webfont, repli monospace). Curseur clignotant à 1 Hz, comme l'écran
 *  du STOS.
 *
 *  Options :
 *   - textOnly  : ne lit QUE le plan texte (buffer.cells), sans composer
 *     le gfx de cellAt(). Utilisé par AalibRenderer, qui peint le gfx
 *     par-dessus avec aalib.js. Défaut false = comportement historique.
 *   - cursorTimer : lance le clignotement du curseur (défaut true).
 *     Un renderer imbriqué (couche texte) le désactive.
 *  --------------------------------------------------------------------
 */

import { STOS_PALETTE } from "@stas/core";

const CSS = STOS_PALETTE.map(([r, g, b]) => `rgb(${r},${g},${b})`);

export class CanvasRenderer {
  constructor(stas, canvas, opts = {}) {
    this.stas = stas;
    this.buffer = stas.buffer;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.family = opts.fontFamily ?? "VT323, monospace";
    this.textOnly = opts.textOnly ?? false;
    this.forcePaper = opts.forcePaper ?? null;
    this.cellW = opts.cellW ?? 8;
    this.cellH = opts.cellH ?? 16;
    this.font = `${this.cellH}px ${this.family}`;
    this._lastVersion = -1;
    this._cursorOn = true;

    canvas.width = this.buffer.width * this.cellW;
    canvas.height = this.buffer.height * this.cellH;

    if (opts.cursorTimer ?? true) {
      setInterval(() => {
        this._cursorOn = !this._cursorOn;
        this.render(true);
      }, 500);
    }
  }

  /** Ajuste la taille des cellules au plan gfx (MODE 0) : pixels "magiques". */
  setSize() {
    const w = this.buffer.width;
    const h = this.buffer.height;
    const cw = Math.max(2, Math.min(16, Math.floor(760 / w)));
    const ch = cw * 2; // ratio 1:2 = pixels rectangulaires lowres ST
    this.cellW = cw;
    this.cellH = ch;
    this.font = `${ch}px ${this.family}`;
    this.canvas.width = w * cw;
    this.canvas.height = h * ch;
  }

  render(force = false) {
    const b = this.buffer;
    const ver = this.stas.sceneVersion;
    if (!force && ver === this._lastVersion) return;
    this._lastVersion = ver;
    const ctx = this.ctx;
    const { cellW: cw, cellH: ch } = this;
    ctx.font = this.font;
    ctx.textBaseline = "top";
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        const c = this.textOnly
          ? b.cells[y * b.width + x]
          : this.stas.cellAt(x, y);
        ctx.fillStyle = CSS[this.forcePaper ?? c.bg] ?? CSS[15];
        ctx.fillRect(x * cw, y * ch, cw, ch);
        if (c.ch !== " ") {
          ctx.fillStyle = CSS[c.fg] ?? CSS[0];
          ctx.fillText(c.ch, x * cw + 1, y * ch + 1);
        }
      }
    }
    if (b.cursorVisible && this._cursorOn) {
      ctx.fillStyle = CSS[b.curPen] ?? CSS[0];
      ctx.fillRect(b.cx * cw, (b.cy + 1) * ch - 3, cw, 2);
    }
  }
}
