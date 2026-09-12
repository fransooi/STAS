/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  L'interpréteur — le cœur de BASIC.S réécrit en JavaScript.
 *
 *  Boucle d'exécution  → "nouvelle" / chrget de BASIC.S L7678-L7701
 *  Évaluateur          → "evalue" de BASIC.S L8368-L8500
 *  Variables           → "findvar" de BASIC.S L7960-L8060
 *
 *  Tout est asynchrone : INPUT et WAIT suspendent l'exécution sans
 *  bloquer la plateforme (console ou navigateur). Le cœur ne sait
 *  JAMAIS où il tourne — il parle à un AsciiBuffer et à des providers
 *  d'entrée injectés. C'est le nouveau jeu de traps du STOS.
 *
 *  Décisions sémantiques V1 (documentées dans le README) :
 *    - TRUE = 1 (comme les comparaisons STOS)
 *    - ^ associatif à gauche (fidèle au STOS, bizarrerie assumée)
 *    - AND/OR/XOR = opérations bit à bit sur 32 bits signés
 *    - / entre entiers = entier si la division tombe juste, réel sinon
 *  --------------------------------------------------------------------
 */

import { T, SUB, FSUB } from "./tokens.js";
import { StosError, ERR } from "./errors.js";
import { MEM_LOGIC, MEM_PHYSIC } from "./memory.js";
import {
  INT, FLOAT, STR,
  T_INT, T_FLOAT, T_STR,
  numResult, fmtValue, fmtFixed,
} from "./values.js";
import { makeEcho } from "./ascii-buffer.js";
import {
  INSTRUCTIONS, EXT_INSTRUCTIONS, EXT_DIRECT_ONLY,
  FUNC_TABLE, EXTFUNC_TABLE,
} from "./instructions.js";

const COLON = 58; // ":"

// Priorités des opérateurs infixe [bpGauche, bpDroite] — ordre fidèle à
// la table des tokens STOS ($EA-$F9, priorité croissante) :
//   XOR < OR < AND < comparaisons < + - < MOD < * / < ^
// ^ est associatif à GAUCHE (bpDroite > bpGauche) : le STOS faisait
// 2^3^2 = (2^3)^2 = 64, on conserve la bizarrerie.
const INFIX = {
  [T.XOR]: [1, 2],
  [T.OR]: [3, 4],
  [T.AND]: [5, 6],
  [T.DIFF]: [7, 8], [T.INFEG]: [7, 8], [T.SUPEG]: [7, 8],
  [T.EGAL]: [7, 8], [T.INF]: [7, 8], [T.SUP]: [7, 8],
  [T.PLUS]: [9, 10], [T.MOINS]: [9, 10],
  [T.MOD]: [11, 12],
  [T.MULT]: [13, 14], [T.DIV]: [13, 14],
  [T.PUISS]: [15, 16],
};

export class Interpreter {
  /**
   * @param {import("./program.js").Program} program
   * @param {object} io  providers plateforme :
   *   buffer    : AsciiBuffer (obligatoire)
   *   readLine  : async (echo) => string
   *   inkey     : () => string
   *   now       : () => ms
   *   rnd       : () => float [0,1)
   *   sleep     : async (ms) => void
   *   tick      : async () => void (respiration de la boucle)
   *   langue    : 0=EN 1=FR
   */
  constructor(program, io = {}) {
    this.program = program;
    this.io = io;
    this.buffer = io.buffer;
    this.langue = io.langue ?? 0;
    this.reset();
  }

  reset() {
    this.vars = new Map();
    this.forStack = [];
    this.gosubStack = [];
    this.whileStack = [];
    this.repeatStack = [];
    this.dataItems = null;
    this.dataPtr = 0;
    this.degMode = false;       // false = radians (défaut STOS)
    this.fixPrecision = null;   // FIX(n) : précision d'affichage des réels (null = %g)
    this._inputTemps = new Map(); // INPUT$(n) résolus pour l'instruction courante
    this.varSlots = new Map();  // VARPTR : adresse mémoire allouée par variable
    this.varNext = 0x080000;    // zone VARPTR dans la RAM plate (1 Mo)
    this.errorHandler = null;   // ON ERROR GOTO : numéro de ligne, ou null
    this.errn = 0;              // ERRN : numéro de la dernière erreur
    this.errl = 0;              // ERRL : ligne de la dernière erreur
    this.handlingError = false; // vrai pendant l'exécution du gestionnaire
    this.resumePc = null;       // RESUME : ré-exécute l'instruction fautive
    this.resumeNextPc = null;   // RESUME NEXT : instruction suivante
    this._stmtStart = { li: 0, ti: 0 }; // début de l'instruction courante
    this.breakEnabled = true;   // BREAK ON|OFF
    this.running = false;
    this.directMode = false;
    this.breakRequested = false;
    this.paused = false;            // pause/resume (connecteur iframe)
    this._resumePromise = null;
    this._resumeResolve = null;
    this.pc = { li: 0, ti: 0 }; // li = index de ligne, ti = index de token
    this.currentLine = 0;
    this._stmtCount = 0;
    this._directTokens = null;
    this.t0 = this.now();
  }

  clearVars() {
    this.vars.clear();
    this.forStack = [];
    this.gosubStack = [];
    this.whileStack = [];
    this.repeatStack = [];
    this.dataItems = null;
    this.dataPtr = 0;
    this.fixPrecision = null;
    this.varSlots = new Map();
    this.varNext = 0x080000;
  }

  // -- Providers ----------------------------------------------------------
  now() { return this.io.now ? this.io.now() : Date.now(); }
  rnd() { return this.io.rnd ? this.io.rnd() : Math.random(); }
  inkey() { return this.io.inkey ? this.io.inkey() : ""; }
  requestBreak() {
    if (!this.breakEnabled) return; // BREAK OFF : Ctrl-C ignoré
    this.breakRequested = true;
    // réveille une boucle en pause pour qu'elle traite l'interruption
    const r = this._resumeResolve;
    if (r) {
      this._resumePromise = null;
      this._resumeResolve = null;
      r();
    }
  }

  /** Suspend l'exécution (connecteur iframe). No-op si rien ne tourne. */
  pause() {
    if (this.running) this.paused = true;
  }

  /** Reprend après pause(). Renvoie true si l'on était en pause. */
  resume() {
    if (!this.paused) return false;
    this.paused = false;
    const r = this._resumeResolve;
    this._resumePromise = null;
    this._resumeResolve = null;
    if (r) r();
    return true;
  }

  /** Bloque tant que paused ; réveillé par resume() ou requestBreak(). */
  async _waitWhilePaused() {
    while (this.paused && !this.breakRequested) {
      if (!this._resumePromise) {
        this._resumePromise = new Promise((r) => {
          this._resumeResolve = r;
        });
      }
      await this._resumePromise;
    }
  }

  async tick() {
    if (this.io.tick) return this.io.tick(this);
    return new Promise((r) => setTimeout(r, 0));
  }

  async sleep(ms) {
    const step = 50;
    let left = ms;
    while (left > 0) {
      if (this.breakRequested) {
        this.breakRequested = false;
        this.err(ERR.BREAK);
      }
      if (this.paused) {
        await this._waitWhilePaused();
        if (this.breakRequested) {
          this.breakRequested = false;
          this.err(ERR.BREAK);
        }
      }
      const d = Math.min(step, left);
      if (this.io.sleep) await this.io.sleep(d);
      else await new Promise((r) => setTimeout(r, d));
      left -= step;
    }
  }

  async readInput(prompt) {
    this.buffer.write(prompt);
    if (this.io.flush) this.io.flush();
    const line = this.io.readLine
      ? await this.io.readLine(makeEcho(this.buffer))
      : "";
    if (line === null) this.err(ERR.BREAK); // fin d'entrée (pipe fermé)
    return line;
  }

  /**
   * INPUT$(n) — lit n caractères sans écho. Fourni par la plateforme
   * (io.inputChars) ; à défaut, retombe sur une ligne (l'écho en plus).
   */
  async readChars(n) {
    n = Math.max(0, Math.trunc(n));
    if (n === 0) return "";
    if (this.io.inputChars) {
      const s = await this.io.inputChars(n);
      return s === null ? this.err(ERR.BREAK) : String(s).slice(0, n);
    }
    return (await this.readInput("")).slice(0, n);
  }

  /**
   * INPUT$ est asynchrone alors que evalExpr est synchrone. On résout donc
   * les INPUT$(n) AVANT d'exécuter l'instruction : chaque occurrence est lue
   * et mémorisée (index → valeur), puis parsePrimary la retrouve à sa place.
   * Le balayage s'arrête à `:`, `ELSE` et `THEN` : une branche de IF non
   * exécutée n'est ainsi jamais lue.
   */
  async resolveInputCalls() {
    const toks = this.tokens;
    let i = this.pc.ti;
    while (i < toks.length) {
      const code = toks[i].code;
      if (code === COLON || code === T.ELSE || code === T.THEN) break;
      const t = toks[i];
      if (t.code === T.EXT_FUNC && t.sub === FSUB.INPUTN) {
        const save = this.pc.ti;
        this.pc.ti = i + 1;
        const [nv] = this.args(1, 1);
        const after = this.pc.ti;
        this.pc.ti = save; // l'instruction n'a pas encore commencé
        const n = this.toInt(nv);
        if (n < 0) this.err(ERR.FON_CALL);
        const value = STR(await this.readChars(n));
        this._inputTemps.set(i, { value, after });
        i = after;
      } else {
        i++;
      }
    }
  }

  /** Vrai si les tokens courants contiennent au moins un INPUT$ (cache par ligne). */
  tokensHaveInput() {
    const line = this.pc.li >= 0 ? this.program.lines[this.pc.li] : null;
    if (line) {
      if (line.hasInput === undefined) {
        line.hasInput = line.tokens.some(
          (t) => t.code === T.EXT_FUNC && t.sub === FSUB.INPUTN
        );
      }
      return line.hasInput;
    }
    return (this._directTokens ?? []).some(
      (t) => t.code === T.EXT_FUNC && t.sub === FSUB.INPUTN
    );
  }

  /**
   * Formatage PRINT : les réels suivent FIX(n) ; le reste passe par fmtValue.
   */
  formatValue(val) {
    if (val.t === T_FLOAT && this.fixPrecision != null) {
      return fmtFixed(val.v, this.fixPrecision);
    }
    return fmtValue(val);
  }

  // -- Accès aux tokens (le "chrget") --------------------------------------
  get tokens() {
    if (this.pc.li < 0) return this._directTokens ?? [];
    return this.program.lines[this.pc.li]?.tokens ?? [];
  }

  peek() { return this.tokens[this.pc.ti]; }
  next() { return this.tokens[this.pc.ti++]; }
  atEos() {
    const t = this.peek();
    // ELSE termine aussi les listes d'instructions : dans
    // "if x then print "oui" else print "non"", le PRINT doit
    // s'arrêter avant le ELSE (comme le faisait le parseur du STOS).
    return !t || t.code === COLON || t.code === T.ELSE;
  }

  eat(code) {
    const t = this.peek();
    if (t && t.code === code) {
      this.pc.ti++;
      return t;
    }
    return null;
  }

  eatRaw(ch) { return this.eat(ch.charCodeAt(0)); }

  /** Regarde le prochain token sans le consommer (caractère brut ASCII). */
  peekRaw(ch) {
    const t = this.peek();
    return !!t && t.code === ch.charCodeAt(0);
  }

  expectRaw(ch) {
    const t = this.eatRaw(ch);
    if (!t) this.err(ERR.SYNTAX);
    return t;
  }

  skipStatement() {
    while (!this.atEos()) this.pc.ti++;
  }

  err(code) {
    throw new StosError(code, this.currentLine, this.langue);
  }

  // -- Exécution ------------------------------------------------------------
  async runProgram(fromNum = null) {
    this.reset();
    this.directMode = false;
    if (this.program.isEmpty) return;
    if (fromNum !== null) {
      const idx = this.program.indexOf(fromNum);
      if (idx < 0) throw new StosError(ERR.UNDEF_LINE, 0, this.langue);
      this.pc.li = idx;
    } else {
      this.pc.li = 0;
    }
    this.pc.ti = 0;
    this.running = true;
    while (this.running && this.pc.li < this.program.lines.length) {
      if (this.breakRequested) {
        this.breakRequested = false;
        this.err(ERR.BREAK);
      }
      this.currentLine = this.program.lines[this.pc.li].num;
      let jumped = false;
      try {
        await this.execLine();
      } catch (e) {
        if (!(e instanceof StosError)) throw e;
        this._handleError(e); // peut relancer l'erreur
        jumped = true;
      }
      if (jumped) continue; // pc déjà positionné sur le gestionnaire
      // gestionnaire terminé sans RESUME : l'erreur redevient trappable
      if (this.handlingError && this.pc.li !== this._handlerLi) {
        this.handlingError = false;
      }
      this.pc.li++;
      this.pc.ti = 0;
    }
    this.running = false;
  }

  async runDirect(tokens) {
    this.currentLine = 0;
    this.directMode = true;
    this.running = true;
    this._directTokens = tokens;
    this.pc = { li: -1, ti: 0 };
    try {
      await this.execLine();
    } finally {
      this.directMode = false;
      this.running = false;
      this._directTokens = null;
    }
  }

  async execLine() {
    for (;;) {
      while (this.eatRaw(":")) {}
      if (this.pc.ti >= this.tokens.length) return;
      this._stmtStart = { li: this.pc.li, ti: this.pc.ti };
      await this.execStatement();
      if (!this.running) return;
      // pause : fige l'exécution jusqu'à resume() / stop
      if (this.paused) {
        await this._waitWhilePaused();
        if (this.breakRequested) {
          this.breakRequested = false;
          this.err(ERR.BREAK);
        }
      }
      // respiration : rendu + interruption possibles dans les boucles serrées
      if ((++this._stmtCount & 0x3ff) === 0) {
        if (this.breakRequested) {
          this.breakRequested = false;
          this.err(ERR.BREAK);
        }
        await this.tick();
      }
    }
  }

  async execStatement() {
    this._inputTemps.clear();
    if (this.tokensHaveInput()) await this.resolveInputCalls();
    const tok = this.next();
    if (!tok) return;
    switch (tok.code) {
      case T.REM:
        this.pc.ti = this.tokens.length;
        return;
      case T.VARIABLE:
        return this.doAssignWith(tok.name);
      case T.LOGIC:
      case T.PHYSIC:
        return this.doSysVarAssign(tok.code === T.LOGIC ? "logic" : "physic");
      case T.TIMES:
        return this.doSysStrAssign("__time$");
      case T.DATES:
        return this.doSysStrAssign("__date$");
      case T.GOTO:
        return this.doGotoTo(this.toInt(this.evalExpr()));
      case T.GOSUB:
        return this.doGosubTo(this.toInt(this.evalExpr()));
      case T.RETURN:
        return this.doReturn();
      case T.POP:
        return this.doPop();
      case T.IF:
        return this.doIf();
      case T.ELSE:
        this.pc.ti = this.tokens.length;
        return;
      case T.FOR:
        return this.doFor();
      case T.NEXT:
        return this.doNext();
      case T.WHILE:
        return this.doWhile(this.pc.ti - 1);
      case T.WEND:
        return this.doWend();
      case T.REPEAT:
        this.repeatStack.push({ li: this.pc.li, ti: this.pc.ti });
        return;
      case T.UNTIL:
        return this.doUntil();
      case T.ON:
        return this.doOn();
      case T.ON_ERROR:
        return this.doOnError();
      case T.RESUME:
      case T.RESUME_NEXT:
        return this.doResume(tok.code === T.RESUME_NEXT);
      case T.RESTORE:
        return this.doRestore();
      case T.READ:
        return this.doRead();
      case T.DIM:
        return this.doDim();
      case T.EXT_FUNC: {
        // DEG / RAD : forme instruction seule, on bascule le mode angulaire ;
        // suivie de "(", c'est la forme fonction (conversion) du STOS.
        if (tok.sub === FSUB.DEG || tok.sub === FSUB.RAD) {
          if (this.peek()?.code === 40) {
            return EXTFUNC_TABLE.get(tok.sub)(this);
          }
          this.degMode = tok.sub === FSUB.DEG;
          return;
        }
        this.err(ERR.SYNTAX);
        return;
      }
      case T.ETENDU: {
        if (EXT_DIRECT_ONLY.has(tok.sub) && !this.directMode) {
          this.err(ERR.ILL_PROG);
        }
        const h = EXT_INSTRUCTIONS.get(tok.sub);
        if (!h) this.err(ERR.NOT_IMPL);
        return h(this);
      }
      default: {
        const h = INSTRUCTIONS.get(tok.code);
        if (h) return h(this);
        // code STOS connu mais non implémenté, ou vraie faute de syntaxe
        this.err(tok.code >= 0x80 && tok.code <= 0xb7 ? ERR.NOT_IMPL : ERR.SYNTAX);
      }
    }
  }

  // -- Structures de contrôle ------------------------------------------------
  doGotoTo(num) {
    if (this.directMode) this.err(ERR.ILL_DIRECT);
    const idx = this.program.indexOf(num);
    if (idx < 0) this.err(ERR.UNDEF_LINE);
    this.pc.li = idx;
    this.pc.ti = 0;
  }

  doGosubTo(num) {
    if (this.directMode) this.err(ERR.ILL_DIRECT);
    if (this.gosubStack.length >= 100) this.err(ERR.TOO_MANY_GOSUB);
    this.gosubStack.push({ li: this.pc.li, ti: this.pc.ti });
    this.doGotoTo(num);
  }

  doReturn() {
    const f = this.gosubStack.pop();
    if (!f) this.err(ERR.RET_NO_GOSUB);
    this.pc.li = f.li;
    this.pc.ti = f.ti;
  }

  doPop() {
    if (!this.gosubStack.length) this.err(ERR.POP_NO_GOSUB);
    this.gosubStack.pop();
  }

  async doIf() {
    const cond = this.truthy(this.evalExpr());
    this.eat(T.THEN);
    if (cond) {
      const t = this.peek();
      if (t && t.code === T.ENTIER) {
        this.pc.ti++;
        this.doGotoTo(t.value);
      }
      return;
    }
    // condition fausse : saute au ELSE de la ligne (V1 : premier ELSE)
    const toks = this.tokens;
    let elseAt = -1;
    for (let i = this.pc.ti; i < toks.length; i++) {
      if (toks[i].code === T.ELSE) {
        elseAt = i;
        break;
      }
    }
    this.pc.ti = elseAt >= 0 ? elseAt + 1 : toks.length;
  }

  async doOn() {
    const n = this.toInt(this.evalExpr());
    const isGoto = this.eat(T.GOTO);
    const isGosub = isGoto ? null : this.eat(T.GOSUB);
    if (!isGoto && !isGosub) this.err(ERR.SYNTAX);
    const list = [];
    do {
      list.push(this.toInt(this.evalExpr()));
    } while (this.eatRaw(","));
    if (n >= 1 && n <= list.length) {
      if (isGoto) this.doGotoTo(list[n - 1]);
      else this.doGosubTo(list[n - 1]);
    }
  }

  /** ON ERROR GOTO ligne — installe le gestionnaire (0 ou rien = désactive). */
  doOnError() {
    this.eat(T.GOTO);
    if (this.atEos()) {
      this.errorHandler = null;
      return;
    }
    const n = this.toInt(this.evalExpr());
    this.errorHandler = n === 0 ? null : n;
    if (this.errorHandler !== null) this.handlingError = false;
  }

  /**
   * RESUME / RESUME NEXT / RESUME n — reprise après une erreur trappée :
   * RESUME rejoue l'instruction fautive, RESUME NEXT passe à la suivante,
   * RESUME n repart de la ligne n.
   */
  doResume(isNext) {
    if (!this.resumePc) this.err(ERR.RES_NO_ERR); // 38
    this.handlingError = false;
    if (isNext) {
      this.pc.li = this.resumeNextPc.li;
      this.pc.ti = this.resumeNextPc.ti;
      return;
    }
    if (this.atEos()) {
      this.pc.li = this.resumePc.li;
      this.pc.ti = this.resumePc.ti;
      return;
    }
    const n = this.toInt(this.evalExpr());
    const idx = this.program.indexOf(n);
    if (idx < 0) this.err(ERR.UNDEF_LINE);
    this.pc.li = idx;
    this.pc.ti = 0;
  }

  /**
   * Erreur rattrapée par ON ERROR GOTO : mémorise ERRN/ERRL, calcule les
   * points de reprise et saute au gestionnaire. Relance l'erreur s'il n'y a
   * pas de gestionnaire, si l'on est déjà dedans, ou pour un BREAK (Ctrl-C
   * toujours souverain).
   */
  _handleError(e) {
    if (!this.errorHandler || this.handlingError || e.code === ERR.BREAK) {
      throw e;
    }
    const idx = this.program.indexOf(this.errorHandler);
    if (idx < 0) throw e;
    this.errn = e.code;
    this.errl = e.line;
    this.resumePc = { li: this._stmtStart.li, ti: this._stmtStart.ti };
    this.resumeNextPc = this._nextStatement(this._stmtStart);
    this.handlingError = true;
    this._handlerLi = idx;
    this.pc.li = idx;
    this.pc.ti = 0;
  }

  /** Position de l'instruction suivant celle qui commence en {li, ti}. */
  _nextStatement(s) {
    const line = this.program.lines[s.li];
    if (line) {
      const toks = line.tokens;
      for (let i = s.ti; i < toks.length; i++) {
        if (toks[i].code === COLON) return { li: s.li, ti: i + 1 };
      }
    }
    return { li: s.li + 1, ti: 0 };
  }

  async doFor() {
    if (this.directMode) this.err(ERR.ILL_DIRECT);
    const vt = this.eat(T.VARIABLE);
    if (!vt) this.err(ERR.SYNTAX);
    if (!this.eat(T.EGAL)) this.err(ERR.SYNTAX);
    const from = this.evalExpr();
    this.toNum(from);
    if (!this.eat(T.TO)) this.err(ERR.SYNTAX);
    const to = this.toNum(this.evalExpr());
    let step = 1;
    if (this.eat(T.STEP)) step = this.toNum(this.evalExpr());
    if (step === 0) this.err(ERR.FON_CALL);
    this.setVar(vt.name, from);
    // le FOR écrase une éventuelle boucle homonyme plus ancienne (comme STOS)
    this.forStack = this.forStack.filter((f) => f.name !== vt.name);
    this.forStack.push({
      name: vt.name,
      to,
      step,
      intMode: from.t === T_INT && Number.isInteger(to) && Number.isInteger(step),
      li: this.pc.li,
      ti: this.pc.ti,
    });
  }

  async doNext() {
    const vt = this.eat(T.VARIABLE);
    const name = vt ? vt.name : null;
    let fi = -1;
    if (name) {
      for (let i = this.forStack.length - 1; i >= 0; i--) {
        if (this.forStack[i].name === name) {
          fi = i;
          break;
        }
      }
    } else {
      fi = this.forStack.length - 1;
    }
    if (fi < 0) this.err(ERR.NEXT_NO_FOR);
    const f = this.forStack[fi];
    const cur = this.toNum(this.getVar(f.name));
    const nv = cur + f.step;
    this.setVar(f.name, f.intMode ? INT(nv) : FLOAT(nv));
    const done = f.step > 0 ? nv > f.to : nv < f.to;
    if (done) {
      this.forStack.splice(fi, 1);
    } else {
      this.pc.li = f.li;
      this.pc.ti = f.ti;
    }
  }

  async doWhile(startTi) {
    if (this.directMode) this.err(ERR.ILL_DIRECT);
    this.whileStack.push({ li: this.pc.li, ti: startTi });
    if (!this.truthy(this.evalExpr())) {
      this.whileStack.pop();
      const close = this.findClose(T.WHILE, T.WEND, ERR.WHILE_NO_WEND);
      this.pc.li = close.li;
      this.pc.ti = close.ti;
    }
  }

  doWend() {
    const f = this.whileStack.pop();
    if (!f) this.err(ERR.WEND_NO_WHILE);
    this.pc.li = f.li;
    this.pc.ti = f.ti;
  }

  async doUntil() {
    const f = this.repeatStack[this.repeatStack.length - 1];
    if (!f) this.err(ERR.UNTIL_NO_REP);
    if (this.truthy(this.evalExpr())) {
      this.repeatStack.pop();
    } else {
      this.pc.li = f.li;
      this.pc.ti = f.ti;
    }
  }

  /** Cherche le fermant (WEND/UNTIL) en comptant les imbrications. */
  findClose(open, close, errCode) {
    let li = this.pc.li;
    let ti = this.pc.ti;
    let depth = 1;
    const lines = this.program.lines;
    while (li < lines.length) {
      const toks = lines[li].tokens;
      while (ti < toks.length) {
        const c = toks[ti].code;
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) return { li, ti: ti + 1 };
        }
        ti++;
      }
      li++;
      ti = 0;
    }
    this.err(errCode);
  }

  // -- Variables ---------------------------------------------------------------
  parseLvalue() {
    const t = this.eat(T.VARIABLE);
    if (!t) this.err(ERR.SYNTAX);
    let dims = null;
    if (this.eatRaw("(")) {
      dims = [];
      do {
        dims.push(this.toInt(this.evalExpr()));
      } while (this.eatRaw(","));
      this.expectRaw(")");
    }
    return { name: t.name, dims };
  }

  /**
   * Affectation d'une variable système (LOGIC=..., PHYSIC=...).
   * Ces "adresses" sont symboliques en ASCII : on mémorise la valeur,
   * comme le STOS mémorisait l'adresse de base de l'écran logique.
   */
  doSysVarAssign(name) {
    if (!this.eat(T.EGAL)) this.err(ERR.SYNTAX);
    this.setVar(name, this.evalExpr());
  }

  /**
   * Affectation d'une variable système chaîne (TIME$=…, DATE$=…).
   * La valeur assignée prime sur l'horloge hôte à la relecture.
   */
  doSysStrAssign(name) {
    if (!this.eat(T.EGAL)) this.err(ERR.SYNTAX);
    this.setVar(name, this.evalExpr());
  }

  async doAssignWith(name) {
    let dims = null;
    if (this.eatRaw("(")) {
      dims = [];
      do {
        dims.push(this.toInt(this.evalExpr()));
      } while (this.eatRaw(","));
      this.expectRaw(")");
    }
    if (!this.eat(T.EGAL)) this.err(ERR.SYNTAX);
    const val = this.evalExpr();
    if (dims) this.arraySet(name, dims, val);
    else this.setVar(name, val);
  }

  setVar(name, val) {
    const wantStr = name.endsWith("$");
    if ((val.t === T_STR) !== wantStr) this.err(ERR.TYPE_MISMATCH);
    const ex = this.vars.get(name);
    if (ex && ex.array) this.err(ERR.TYPE_MISMATCH);
    this.vars.set(name, val);
    // VARPTR : tenir la mémoire allouée à la variable à jour
    let slot = this.varSlots.get(name);
    if (slot) {
      if (slot.size < this._slotSize(val)) slot = this._allocSlot(name, val);
      slot.type = val.t;
      this._writeSlot(slot, val);
    }
  }

  getVar(name) {
    const ex = this.vars.get(name);
    if (ex) {
      if (ex.array) this.err(ERR.TYPE_MISMATCH);
      return ex;
    }
    return name.endsWith("$") ? STR("") : INT(0);
  }

  flatIndex(a, dims) {
    if (dims.length !== a.dims.length) this.err(ERR.SUBSCRIPT);
    let idx = 0;
    for (let i = 0; i < dims.length; i++) {
      const d = dims[i];
      if (d < 0 || d > a.dims[i]) this.err(ERR.SUBSCRIPT);
      idx = idx * (a.dims[i] + 1) + d;
    }
    return idx;
  }

  arrayGet(name, dims) {
    const a = this.vars.get(name);
    if (!a || !a.array) this.err(ERR.NO_ARRAY);
    return { t: a.t, v: a.data[this.flatIndex(a, dims)] };
  }

  arraySet(name, dims, val) {
    const a = this.vars.get(name);
    if (!a || !a.array) this.err(ERR.NO_ARRAY);
    if ((val.t === T_STR) !== (a.t === T_STR)) this.err(ERR.TYPE_MISMATCH);
    a.data[this.flatIndex(a, dims)] = val.v;
  }

  // -- VARPTR : les variables vues comme de la mémoire ---------------------
  //  Entier : 4 octets ; réel : 8 octets IEEE double (gros-boutiste, 68000) ;
  //  chaîne : longueur sur 2 octets PUIS les caractères — VARPTR pointe sur
  //  le premier caractère, la longueur se lit en DEEK(VARPTR(A$)-2), comme
  //  le documente le manuel.

  _slotSize(v) {
    if (v.t === T_STR) return 2 + v.v.length;
    return v.t === T_FLOAT ? 8 : 4;
  }

  _allocSlot(name, v) {
    const size = this._slotSize(v);
    const addr = this.varNext;
    this.varNext = (this.varNext + size + 3) & ~3;
    const slot = { addr, size, type: v.t };
    this.varSlots.set(name, slot);
    return slot;
  }

  varptr(name) {
    const ex = this.vars.get(name);
    if (ex && ex.array) this.err(ERR.FON_CALL); // tableaux : non supportés (V1)
    const v = this.getVar(name);
    let slot = this.varSlots.get(name);
    if (!slot || slot.size < this._slotSize(v)) slot = this._allocSlot(name, v);
    slot.type = v.t;
    this._writeSlot(slot, v);
    return slot.type === T_STR ? slot.addr + 2 : slot.addr;
  }

  _writeSlot(slot, v) {
    const mem = this.io.mem;
    if (v.t === T_STR) {
      const s = v.v;
      mem.writeByte(slot.addr, (s.length >> 8) & 0xff);
      mem.writeByte(slot.addr + 1, s.length & 0xff);
      for (let i = 0; i < s.length; i++) {
        mem.writeByte(slot.addr + 2 + i, s.charCodeAt(i) & 0xff);
      }
    } else if (v.t === T_FLOAT) {
      const ab = new ArrayBuffer(8);
      new DataView(ab).setFloat64(0, v.v, false); // IEEE double gros-boutiste
      const u = new Uint8Array(ab);
      for (let i = 0; i < 8; i++) mem.writeByte(slot.addr + i, u[i]);
    } else {
      const u = v.v | 0;
      for (let i = 0; i < 4; i++) mem.writeByte(slot.addr + i, (u >>> (24 - 8 * i)) & 0xff);
    }
  }

  _readSlot(name, slot) {
    const mem = this.io.mem;
    if (slot.type === T_STR) {
      const len = (mem.readByte(slot.addr) << 8) | mem.readByte(slot.addr + 1);
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(mem.readByte(slot.addr + 2 + i));
      this.vars.set(name, STR(s));
    } else if (slot.type === T_FLOAT) {
      const ab = new ArrayBuffer(8);
      const u = new Uint8Array(ab);
      for (let i = 0; i < 8; i++) u[i] = mem.readByte(slot.addr + i);
      this.vars.set(name, FLOAT(new DataView(ab).getFloat64(0, false)));
    } else {
      let v = 0;
      for (let i = 0; i < 4; i++) v = (v * 256 + mem.readByte(slot.addr + i)) >>> 0;
      this.vars.set(name, INT(v | 0));
    }
  }

  /** Après une écriture mémoire, relit les variables dont la zone est touchée. */
  memSync(start, end) {
    if (this.varSlots.size === 0) return;
    for (const [name, slot] of this.varSlots) {
      if (slot.addr <= end && slot.addr + slot.size - 1 >= start) {
        this._readSlot(name, slot);
      }
    }
  }

  /** SORT a$(0) — trie un tableau 1-D par ordre croissant (nombres ou chaînes). */
  sortArray(name) {
    const a = this.vars.get(name);
    if (!a || !a.array) this.err(ERR.NO_ARRAY);
    if (a.dims.length !== 1) this.err(ERR.FON_CALL);
    if (a.t === T_STR) a.data.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    else a.data.sort((x, y) => x - y);
  }

  /**
   * MATCH (tableau(0), valeur) — recherche dichotomique dans un tableau trié
   * 1-D. Renvoie l'indice si trouvé, sinon l'opposé de l'indice du premier
   * élément supérieur (ou -nbÉléments si la valeur dépasse tout).
   */
  matchArray(name, needle) {
    const a = this.vars.get(name);
    if (!a || !a.array) this.err(ERR.NO_ARRAY);
    if (a.dims.length !== 1) this.err(ERR.FON_CALL);
    const isStr = a.t === T_STR;
    if ((needle.t === T_STR) !== isStr) this.err(ERR.TYPE_MISMATCH);
    const data = a.data;
    const cmp = isStr
      ? (x, y) => (x < y ? -1 : x > y ? 1 : 0)
      : (x, y) => x - y;
    let lo = 0;
    let hi = data.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cmp(data[mid], needle.v) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo < data.length && cmp(data[lo], needle.v) === 0) return lo;
    return lo < data.length ? -lo : -data.length;
  }

  async doDim() {
    do {
      const t = this.eat(T.VARIABLE);
      if (!t) this.err(ERR.SYNTAX);
      this.expectRaw("(");
      const dims = [];
      do {
        const d = this.toInt(this.evalExpr());
        if (d < 0) this.err(ERR.FON_CALL);
        dims.push(d);
      } while (this.eatRaw(","));
      this.expectRaw(")");
      if (this.vars.has(t.name)) this.err(ERR.ARRAY_DIM);
      let size = 1;
      for (const d of dims) size *= d + 1;
      const isStr = t.name.endsWith("$");
      this.vars.set(t.name, {
        array: true,
        t: isStr ? T_STR : T_INT,
        dims,
        data: new Array(size).fill(isStr ? "" : 0),
      });
    } while (this.eatRaw(","));
  }

  // -- DATA / READ / RESTORE -----------------------------------------------------
  buildData() {
    this.dataItems = [];
    for (const line of this.program.lines) {
      const toks = line.tokens;
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (t.code === T.ETENDU && t.sub === SUB.DATA) {
          let j = i + 1;
          while (j < toks.length && toks[j].code !== COLON) {
            const c = toks[j];
            if (c.code === T.ENTIER || c.code === T.HEXA || c.code === T.BINAIRE) {
              this.dataItems.push({ line: line.num, v: INT(c.value) });
              j++;
            } else if (c.code === T.FLOAT) {
              this.dataItems.push({ line: line.num, v: FLOAT(c.value) });
              j++;
            } else if (c.code === T.ALPHA) {
              this.dataItems.push({ line: line.num, v: STR(c.value) });
              j++;
            } else if (
              c.code === T.MOINS &&
              (toks[j + 1]?.code === T.ENTIER || toks[j + 1]?.code === T.FLOAT)
            ) {
              const nx = toks[j + 1];
              this.dataItems.push({
                line: line.num,
                v: nx.code === T.FLOAT ? FLOAT(-nx.value) : INT(-nx.value),
              });
              j += 2;
            } else {
              j++;
            }
          }
          i = j;
        }
      }
    }
    this.dataPtr = 0;
  }

  async doRead() {
    if (!this.dataItems) this.buildData();
    do {
      const lv = this.parseLvalue();
      if (this.dataPtr >= this.dataItems.length) this.err(ERR.NO_MORE_DATA);
      const item = this.dataItems[this.dataPtr++];
      if (lv.dims) this.arraySet(lv.name, lv.dims, item.v);
      else this.setVar(lv.name, item.v);
    } while (this.eatRaw(","));
  }

  async doRestore() {
    if (!this.dataItems) this.buildData();
    if (this.atEos()) {
      this.dataPtr = 0;
      return;
    }
    const num = this.toInt(this.evalExpr());
    const idx = this.dataItems.findIndex((d) => d.line >= num);
    this.dataPtr = idx < 0 ? this.dataItems.length : idx;
  }

  // -- Évaluateur (Pratt, priorités STOS) ----------------------------------------
  evalExpr() {
    return this.parseBinary(0);
  }

  parseBinary(minBp) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      const bp = INFIX[t.code];
      if (!bp || bp[0] < minBp) break;
      this.pc.ti++;
      const right = this.parseBinary(bp[1]);
      left = this.applyOp(t.code, left, right);
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t?.code === T.MOINS) {
      this.pc.ti++;
      const v = this.parseUnary();
      if (v.t === T_STR) this.err(ERR.TYPE_MISMATCH);
      return v.t === T_INT ? INT(-v.v) : FLOAT(-v.v);
    }
    if (t?.code === T.PLUS) {
      this.pc.ti++;
      return this.parseUnary();
    }
    if (t?.code === T.NOT) {
      this.pc.ti++;
      return INT(this.truthy(this.parseUnary()) ? 0 : 1);
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.next();
    if (!t) this.err(ERR.SYNTAX);
    if (t.code === 40) {
      // "(" groupement
      const v = this.evalExpr();
      this.expectRaw(")");
      return v;
    }
    switch (t.code) {
      case T.ENTIER:
      case T.HEXA:
      case T.BINAIRE:
        return INT(t.value);
      case T.FLOAT:
        return FLOAT(t.value);
      case T.ALPHA:
        return STR(t.value);
      case T.VARIABLE: {
        if (this.eatRaw("(")) {
          const dims = [];
          do {
            dims.push(this.toInt(this.evalExpr()));
          } while (this.eatRaw(","));
          this.expectRaw(")");
          return this.arrayGet(t.name, dims);
        }
        return this.getVar(t.name);
      }
      case T.LOGIC:
        return this.vars.get("logic") ?? INT(MEM_LOGIC);
      case T.PHYSIC:
        return this.vars.get("physic") ?? INT(MEM_PHYSIC);
      case T.EXT_FUNC: {
        const rec = this._inputTemps.get(this.pc.ti - 1);
        if (rec) {
          this.pc.ti = rec.after; // INPUT$(n) déjà lu pour cette instruction
          return rec.value;
        }
        const h = EXTFUNC_TABLE.get(t.sub);
        if (!h) this.err(ERR.NOT_IMPL);
        return h(this);
      }
      default: {
        const h = FUNC_TABLE.get(t.code);
        if (h) return h(this);
        // fonction STOS connue mais non implémentée, ou syntaxe
        this.err(t.code >= 0xb9 && t.code <= 0xe9 ? ERR.NOT_IMPL : ERR.SYNTAX);
      }
    }
  }

  /**
   * Liste d'arguments de fonction. Avec parenthèses : expressions complètes.
   * Sans parenthèses (tolérance STOS) : une seule expression "arithmétique"
   * (les comparaisons ne sont pas avalées : ABS a>1 = (ABS a) > 1).
   */
  args(min, max = null) {
    const list = [];
    if (this.eatRaw("(")) {
      if (!this.eatRaw(")")) {
        do {
          list.push(this.evalExpr());
        } while (this.eatRaw(","));
        this.expectRaw(")");
      }
    } else if (min > 0) {
      list.push(this.parseBinary(9));
    }
    if (list.length < min || (max !== null && list.length > max)) {
      this.err(ERR.SYNTAX);
    }
    return list;
  }

  applyOp(code, a, b) {
    switch (code) {
      case T.PLUS:
        if (a.t === T_STR && b.t === T_STR) return STR(a.v + b.v);
        if (a.t === T_STR || b.t === T_STR) this.err(ERR.TYPE_MISMATCH);
        return numResult(a, b, a.v + b.v);
      case T.MOINS:
        this.toNum(a); this.toNum(b);
        return numResult(a, b, a.v - b.v);
      case T.MULT:
        this.toNum(a); this.toNum(b);
        return numResult(a, b, a.v * b.v);
      case T.DIV: {
        this.toNum(a); this.toNum(b);
        if (b.v === 0) this.err(ERR.DIV_ZERO);
        if (a.t === T_INT && b.t === T_INT && a.v % b.v === 0) {
          return INT(a.v / b.v);
        }
        return FLOAT(a.v / b.v);
      }
      case T.MOD: {
        const x = this.toInt(a);
        const y = this.toInt(b);
        if (y === 0) this.err(ERR.DIV_ZERO);
        return INT(x % y);
      }
      case T.PUISS: {
        const x = this.toNum(a);
        const y = this.toNum(b);
        if (x < 0 && !Number.isInteger(y)) this.err(ERR.NEGATIVE);
        const r = Math.pow(x, y);
        if (!Number.isFinite(r)) this.err(ERR.OVERFLOW);
        return FLOAT(r);
      }
      case T.DIFF:
      case T.INFEG:
      case T.SUPEG:
      case T.EGAL:
      case T.INF:
      case T.SUP: {
        let r;
        if (a.t === T_STR || b.t === T_STR) {
          if (a.t !== T_STR || b.t !== T_STR) this.err(ERR.TYPE_MISMATCH);
          const s = a.v, u = b.v;
          r =
            code === T.EGAL ? s === u
            : code === T.DIFF ? s !== u
            : code === T.INF ? s < u
            : code === T.SUP ? s > u
            : code === T.INFEG ? s <= u
            : s >= u;
        } else {
          const x = a.v, y = b.v;
          r =
            code === T.EGAL ? x === y
            : code === T.DIFF ? x !== y
            : code === T.INF ? x < y
            : code === T.SUP ? x > y
            : code === T.INFEG ? x <= y
            : x >= y;
        }
        return INT(r ? 1 : 0);
      }
      case T.AND:
        return INT(this.toInt(a) & this.toInt(b));
      case T.OR:
        return INT(this.toInt(a) | this.toInt(b));
      case T.XOR:
        return INT(this.toInt(a) ^ this.toInt(b));
      default:
        this.err(ERR.SYNTAX);
    }
  }

  // -- Conversions ------------------------------------------------------------
  toNum(v) {
    if (v.t === T_STR) this.err(ERR.TYPE_MISMATCH);
    return v.v;
  }

  toInt(v) {
    return Math.trunc(this.toNum(v));
  }

  toStr(v) {
    if (v.t !== T_STR) this.err(ERR.TYPE_MISMATCH);
    return v.v;
  }

  truthy(v) {
    return this.toNum(v) !== 0;
  }
}
