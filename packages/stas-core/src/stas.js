/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Façade — le point d'entrée unique pour les plateformes.
 *
 *  La console ANSI et le canvas HTML créent un Stas, lui injectent leurs
 *  providers (clavier, horloge, rendu), puis appellent feedLine() à chaque
 *  ligne tapée — exactement comme la boucle "ok" de l'éditeur STOS
 *  (BASIC.S L1572-L1627) :
 *    - ligne commençant par un numéro → stockée dans le programme
 *    - numéro seul → la ligne est supprimée (fidèle au STOS)
 *    - autre chose → exécutée en mode direct
 *  --------------------------------------------------------------------
 */

import { AsciiBuffer, STOS_PALETTE } from "./ascii-buffer.js";
import { PixelScreen } from "./pixel-screen.js";
import { convertScreen } from "./ascii-converter.js";
import { Program } from "./program.js";
import { Interpreter } from "./interpreter.js";
import { tokenize } from "./tokenizer.js";

export class Stas {
  /**
   * @param {object} opts
   *   width/height : taille du buffer (80x25 par défaut)
   *   langue       : 0=EN 1=FR
   *   buffer       : AsciiBuffer existant (sinon créé)
   *   readLine     : async (echo) => string        — INPUT / mode direct
   *   inkey        : () => string                  — INKEY$
   *   now          : () => ms                      — TIMER
   *   rnd          : () => float [0,1)             — RND
   *   sleep        : async (ms) => void            — WAIT
   *   tick         : async (interp) => void        — respiration / rendu
   *   scancode     : () => number                  — SCANCODE
   *   onSystem     : () => void                    — instruction SYSTEM
   *   flush        : () => void                    — forcer le rendu (prompt)
   */
  constructor(opts = {}) {
    this.buffer =
      opts.buffer ?? new AsciiBuffer(opts.width ?? 80, opts.height ?? 25);
    this.program = new Program();
    this.io = {
      buffer: this.buffer,
      readLine: opts.readLine,
      inkey: opts.inkey,
      now: opts.now,
      rnd: opts.rnd,
      sleep: opts.sleep,
      tick: opts.tick,
      scancode: opts.scancode,
      onSystem: opts.onSystem,
      flush: opts.flush,
      physic: null,        // écran physique 320x200 (affiché, créé par MODE)
      logic: null,         // écran logique 320x200 (dessin courant)
      gfxActive: false,    // MODE actif ?
      lockTextRes: false,  // adaptateur web : grille texte verrouillée (?text=/?res=)
      autoback: true,      // AUTOBACK ON : trace vers logic + physic
      asciiCache: null,    // cache du converter graphique -> ascii
      sprites: [],         // plan sprites (au-dessus de tout)
      spriteVersion: 0,
    };
    this.interp = new Interpreter(this.program, this.io);
    if (opts.langue) this.interp.langue = opts.langue;
  }

  get langue() {
    return this.interp.langue;
  }

  /** Écran logique 320x200 (null tant que MODE n'a pas été appelé). */
  get gfx() {
    return this.io.gfxActive ? this.io.logic : null;
  }

  get logic() {
    return this.io.logic;
  }

  get physic() {
    return this.io.physic;
  }

  /** Liste des sprites actifs (V1 : toujours vide). */
  get sprites() {
    return this.io.sprites;
  }

  /** Compteur de salissure global : texte + écrans pixels + sprites. */
  get sceneVersion() {
    const p = this.io.physic;
    return (
      this.buffer.version +
      (p ? p.version + this.io.logic.version : 0) +
      (this.io.spriteVersion | 0)
    );
  }

  /**
   * Composition des plans en (x,y) : texte (fond) -> ascii du physique
   * (transparent là où rien n'est dessiné) -> sprites (dessus).
   * Le graphique est AU-DESSUS du texte, comme les sprites.
   * Rétrocompatible : sans MODE ni sprite, renvoie la cellule texte.
   */
  cellAt(x, y) {
    const b = this.buffer;
    const idx = y * b.width + x;
    const t = b.cells[idx];
    const sp = this.io.sprites;
    if (!this.io.gfxActive && sp.length === 0) return t;   // texte seul
    let base = t;
    if (this.io.gfxActive) {
      const g = this._asciiCells()[idx];
      if (g.bg != null) base = { ch: g.ch, fg: g.fg, bg: g.bg }; // bloc plein
      else if (g.ch !== " ") base = { ch: g.ch, fg: g.fg, bg: base.bg };
    }
    for (let i = sp.length - 1; i >= 0; i--) {    // sprites, du dessus vers le bas
      const s = sp[i];
      const sf = s.surface;
      const W = sf.width ?? sf.w;
      const H = sf.height ?? sf.h;
      const lx = x - s.x;
      const ly = y - s.y;
      if (lx >= 0 && lx < W && ly >= 0 && ly < H) {
        const c = sf.cells[ly * W + lx];
        if (c.ch !== " ") return c;               // chroma-key : plus tard
      }
    }
    return base;
  }

  /** Conversion ascii de l'écran PHYSIQUE, cachée par (version, grille). */
  _asciiCells() {
    const p = this.io.physic;
    const cols = this.buffer.width;
    const rows = this.buffer.height;
    const c = this.io.asciiCache;
    if (c && c.version === p.version && c.cols === cols && c.rows === rows) {
      return c.cells;
    }
    const cells = convertScreen(p, cols, rows);
    this.io.asciiCache = { version: p.version, cols, rows, cells };
    return cells;
  }

  /**
   * Traite une ligne tapée à l'invite "Ok".
   * @returns "stored" | "deleted" | "direct" | "empty"
   */
  feedLine(text) {
    const m = text.match(/^\s*(\d+)(.*)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!m[2].trim()) {
        this.program.deleteLine(num);
        return "deleted";
      }
      this.program.setLine(num, tokenize(m[2], num, this.interp.langue));
      return "stored";
    }
    if (!text.trim()) return "empty";
    return "direct";
  }

  /** Exécute une ligne en mode direct (RUN, LIST, PRINT 2+2...) */
  async execDirect(text) {
    // "STAS RUN" tape a l'invite -> "RUN" (l'intro le promet !)
    text = text.replace(/^\s*stas\s+(?=run\b)/i, "");
    const toks = tokenize(text, 0, this.interp.langue);
    await this.interp.runDirect(toks);
  }

  /** RUN [depuis une ligne] */
  async run(from = null) {
    try {
      await this.interp.runProgram(from);
    } finally {
      // fin d'exécution (normale ou stop) : on n'est plus « en pause »
      this.interp.resume();
    }
  }

  /** Charge un fichier .bas complet (texte ou tableau de lignes) */
  loadSource(text, { merge = true } = {}) {
    if (Array.isArray(text)) text = text.join("\n");
    return this.program.load(text, { merge, langue: this.interp.langue });
  }

  /** Vrai entre pause() et resume() (connecteur iframe). */
  get paused() {
    return this.interp.paused;
  }

  /** Suspend l'exécution courante (no-op si rien ne tourne). */
  pause() {
    this.interp.pause();
  }

  /** Reprend après pause(). Renvoie true si l'on était en pause. */
  resume() {
    return this.interp.resume();
  }

  /**
   * Remet la machine à nu (connecteur iframe : reset).
   * Efface le programme, l'écran, le plan gfx et les variables ; l'écran
   * revient vide (fond noir). Ne touche ni à la géométrie du buffer ni
   * aux providers io.
   */
  resetState() {
    this.interp.reset();
    this.program.clear();
    this.io.physic = null;
    this.io.logic = null;
    this.io.gfxActive = false;
    this.io.autoback = true;
    this.io.asciiCache = null;
    this.io.spriteVersion = 0;
    const b = this.buffer;
    b.curPen = 0;
    b.curPaper = 15;
    b.cursorVisible = true;
    b.cx = 0;
    b.cy = 0;
    b.clear();
    b.version++; // force le repaint de l'écran vide
  }

  /** Interruption (Ctrl+C / bouton stop) — déclenche l'erreur 17 "Break" */
  requestBreak() {
    this.interp.requestBreak();
  }
}

export { AsciiBuffer, STOS_PALETTE, Program, Interpreter, tokenize };
export { PixelScreen, SCREEN_W, SCREEN_H } from "./pixel-screen.js";
export { convertScreen } from "./ascii-converter.js";
