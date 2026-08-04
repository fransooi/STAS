/*
 *  STAS web — clavier navigateur.
 *  Même contrat que la console : readLine(echo) / inkey(), avec écho
 *  dans le buffer pour que le canvas montre la frappe.
 */

export class WebInput {
  constructor(stas) {
    this.stas = stas;
    this.onDirty = null;
    this._pending = null;
    this._keys = [];
    window.addEventListener("keydown", (e) => this._onKey(e));
  }

  readLine(echo = null) {
    return new Promise((resolve) => {
      this._pending = { buf: "", echo, resolve };
    });
  }

  inkey() {
    const k = this._keys.shift();
    return k === undefined ? "" : k;
  }

  /** Injection depuis le parent (postMessage "input") */
  inject(text) {
    if (this._pending) {
      const p = this._pending;
      this._pending = null;
      p.echo?.write(text);
      p.echo?.newline();
      this.onDirty?.();
      p.resolve(text);
    } else {
      this._keys.push(...text);
    }
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.key === "c" || e.key === "C") && this.stas.interp.running) {
        this.stas.requestBreak();
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Enter") this._feed("\r");
    else if (e.key === "Backspace") this._feed("\x7f");
    else if (e.key.length === 1) this._feed(e.key);
    else return;
    e.preventDefault();
  }

  _feed(ch) {
    if (this._pending) this._lineChar(ch);
    else if (ch >= " ") this._keys.push(ch);
  }

  _lineChar(ch) {
    const p = this._pending;
    if (ch === "\r") {
      this._pending = null;
      p.echo?.newline();
      this.onDirty?.();
      p.resolve(p.buf);
    } else if (ch === "\x7f") {
      if (p.buf.length) {
        p.buf = p.buf.slice(0, -1);
        p.echo?.backspace();
        this.onDirty?.();
      }
    } else if (ch >= " ") {
      p.buf += ch;
      p.echo?.write(ch);
      this.onDirty?.();
    }
  }
}
