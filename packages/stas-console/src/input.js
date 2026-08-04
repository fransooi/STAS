/*
 *  STAS console — clavier.
 *  --------------------------------------------------------------------
 *  L'équivalent du trap #13 (BIOS) : Bconin/Rwabsclavier. Mode brut
 *  (raw) quand stdin est un TTY ; sinon (pipe, tests) les lignes sont
 *  lues classiquement. Fournit :
 *    readLine(echo) — attente d'une ligne, avec écho dans le buffer
 *    inkey()        — lecture non bloquante (INKEY$)
 *  Ctrl+C pendant RUN = Break (erreur 17), comme le STOP du STOS.
 *  --------------------------------------------------------------------
 */

export class ConsoleInput {
  constructor(stas) {
    this.stas = stas;
    this.onDirty = null; // appelé après chaque frappe (rendu)
    this._pending = null; // { buf, echo, resolve }
    this._keys = []; // file pour inkey$
    this._esc = 0; // machine à séquences d'échappement
    this._stdinBuf = "";
    this._stdinLines = [];
    this._eof = false;

    const stdin = process.stdin;
    this._isTTY = !!stdin.isTTY;
    if (this._isTTY) stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", (d) => this._onData(d));
    stdin.on("end", () => this._onEof());
  }

  stop() {
    if (this._isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        /* déjà fermé */
      }
    }
    process.stdin.pause();
  }

  /** Attente d'une ligne. echo (optionnel) inscrit la frappe dans le buffer. */
  readLine(echo = null) {
    // stdin pipé : les lignes déjà reçues
    if (this._stdinLines.length) {
      const line = this._stdinLines.shift();
      if (line === null) return Promise.resolve(null);
      if (echo) {
        echo.write(line);
        echo.newline();
      }
      this.onDirty?.();
      return Promise.resolve(line);
    }
    if (this._eof) return Promise.resolve(null);
    return new Promise((resolve) => {
      this._pending = { buf: "", echo, resolve };
    });
  }

  /** INKEY$ — non bloquant */
  inkey() {
    const k = this._keys.shift();
    return k === undefined ? "" : k;
  }

  _onEof() {
    this._eof = true;
    // dernière ligne sans \n final
    if (this._stdinBuf.length) {
      this._stdinLines.push(this._stdinBuf);
      this._stdinBuf = "";
    }
    if (this._pending) {
      const p = this._pending;
      this._pending = null;
      p.resolve(p.buf);
    }
  }

  _onData(data) {
    if (!this._isTTY) {
      // mode pipe : accumulation de lignes complètes
      this._stdinBuf += data;
      let i;
      while ((i = this._stdinBuf.indexOf("\n")) >= 0) {
        const line = this._stdinBuf.slice(0, i).replace(/\r$/, "");
        this._stdinBuf = this._stdinBuf.slice(i + 1);
        if (this._pending) {
          const p = this._pending;
          this._pending = null;
          if (p.echo) {
            p.echo.write(line);
            p.echo.newline();
          }
          this.onDirty?.();
          p.resolve(line);
        } else {
          this._stdinLines.push(line);
        }
      }
      return;
    }
    for (const ch of data) {
      if (this._esc) {
        // avale les séquences flèches & co.
        if (this._esc === 1) this._esc = ch === "[" ? 2 : 0;
        else if (ch >= "@" && ch <= "~") this._esc = 0;
        continue;
      }
      if (ch === "\x1b") {
        this._esc = 1;
        continue;
      }
      if (this._pending) this._lineChar(ch);
      else if (ch >= " ") this._keys.push(ch);
    }
  }

  _lineChar(ch) {
    const p = this._pending;
    if (ch === "\r" || ch === "\n") {
      this._pending = null;
      p.echo?.newline();
      this.onDirty?.();
      p.resolve(p.buf);
    } else if (ch === "\x7f" || ch === "\x08") {
      if (p.buf.length) {
        p.buf = p.buf.slice(0, -1);
        p.echo?.backspace();
        this.onDirty?.();
      }
    } else if (ch === "\x15") {
      // Ctrl-U : efface la ligne
      while (p.buf.length) {
        p.buf = p.buf.slice(0, -1);
        p.echo?.backspace();
      }
      this.onDirty?.();
    } else if (ch === "\x03") {
      // Ctrl-C : Break pendant un RUN, sinon on quitte
      if (this.stas.interp.running) {
        this.stas.requestBreak();
      } else {
        this.stop();
        process.stdout.write("\x1b[0m\n");
        process.exit(0);
      }
    } else if (ch >= " ") {
      p.buf += ch;
      p.echo?.write(ch);
      this.onDirty?.();
    }
  }
}
