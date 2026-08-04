/*
 *  STAS console — rendu ANSI 24 bits.
 *  Lit le buffer et repeint le terminal ; ne connaît rien au BASIC.
 */

import { STOS_PALETTE } from "../../stas-core/index.js";

export class AnsiRenderer {
  constructor(stas, { out = process.stdout } = {}) {
    this.stas = stas;
    this.buffer = stas.buffer;
    this.out = out;
    this._lastVersion = -1;
    this._started = false;
  }

  start() {
    this._started = true;
    this.out.write("\x1b[2J\x1b[?25l\x1b[0m");
  }

  stop() {
    this._started = false;
    this.out.write("\x1b[0m\x1b[?25h\n");
  }

  render(force = false) {
    const b = this.buffer;
    const ver = this.stas.sceneVersion;
    if (!force && ver === this._lastVersion) return;
    this._lastVersion = ver;
    let s = "";
    let fg = -1;
    let bg = -1;
    for (let y = 0; y < b.height; y++) {
      s += `\x1b[${y + 1};1H`;
      for (let x = 0; x < b.width; x++) {
        const c = this.stas.cellAt(x, y);
        if (c.fg !== fg) {
          const [r, g, bl] = STOS_PALETTE[c.fg & 15];
          s += `\x1b[38;2;${r};${g};${bl}m`;
          fg = c.fg;
        }
        if (c.bg !== bg) {
          const [r, g, bl] = STOS_PALETTE[c.bg & 15];
          s += `\x1b[48;2;${r};${g};${bl}m`;
          bg = c.bg;
        }
        s += c.ch;
      }
    }
    if (b.cursorVisible) {
      s += `\x1b[${b.cy + 1};${b.cx + 1}H\x1b[?25h`;
    } else {
      s += "\x1b[?25l";
    }
    this.out.write(s);
  }
}
