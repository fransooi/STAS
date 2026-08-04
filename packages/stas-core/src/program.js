/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Le programme BASIC — l'équivalent de la zone texte du STOS, où les
 *  lignes numérotées vivent triées en mémoire. Gère l'insertion, la
 *  suppression, et la détokenisation pour LIST (comme "lister" de BASIC.S).
 *
 *  Fidélité : taper "10" tout seul supprime la ligne 10, comme sur le STOS.
 *  --------------------------------------------------------------------
 */

import { tokenize } from "./tokenizer.js";
import { tokenText, T } from "./tokens.js";
import { StosError, ERR } from "./errors.js";

export class Program {
  constructor() {
    /** @type {Array<{num:number, tokens:Array<object>}>} trié par num */
    this.lines = [];
  }

  get isEmpty() {
    return this.lines.length === 0;
  }

  clear() {
    this.lines = [];
  }

  /** Recherche binaire — index de la ligne, ou -1 */
  indexOf(num) {
    let lo = 0,
      hi = this.lines.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const m = this.lines[mid].num;
      if (m === num) return mid;
      if (m < num) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  has(num) {
    return this.indexOf(num) >= 0;
  }

  getLine(num) {
    const i = this.indexOf(num);
    return i < 0 ? null : this.lines[i];
  }

  /** Insère ou remlace une ligne (tri conservé) */
  setLine(num, tokens) {
    const i = this.indexOf(num);
    if (i >= 0) {
      this.lines[i] = { num, tokens };
      return;
    }
    let lo = 0;
    while (lo < this.lines.length && this.lines[lo].num < num) lo++;
    this.lines.splice(lo, 0, { num, tokens });
  }

  deleteLine(num) {
    const i = this.indexOf(num);
    if (i < 0) return false;
    this.lines.splice(i, 1);
    return true;
  }

  /** Supprime l'intervalle [from, to] — renvoie le nombre supprimé */
  deleteRange(from, to) {
    let count = 0;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const n = this.lines[i].num;
      if (n >= from && n <= to) {
        this.lines.splice(i, 1);
        count++;
      }
    }
    return count;
  }

  /**
   * Charge un texte source complet (fichier .bas). Chaque ligne DOIT
   * commencer par un numéro. Une ligne "10" sans contenu supprime la 10.
   * @param {string} text
   * @param {{merge?:boolean, langue?:number}} opts
   * @returns {number} nombre de lignes traitées
   */
  load(text, { merge = true, langue = 0 } = {}) {
    if (!merge) this.clear();
    let count = 0;
    const raws = text.split(/\r\n|\r|\n/);
    let no = 0;
    for (const raw of raws) {
      no++;
      if (!raw.trim()) continue;
      const m = raw.match(/^\s*(\d+)(.*)$/);
      if (!m) {
        throw new StosError(ERR.SYNTAX, no, langue);
      }
      const num = parseInt(m[1], 10);
      const body = m[2];
      if (!body.trim()) {
        this.deleteLine(num);
      } else {
        this.setLine(num, tokenize(body, num, langue));
      }
      count++;
    }
    return count;
  }

  /** Texte source complet (pour SAVE / debug) */
  toSource() {
    return this.lines
      .map((l) => `${l.num} ${detokenize(l.tokens)}`)
      .join("\n");
  }
}

/**
 * Détokenise une ligne pour LIST — mots-clés en minuscules, opérateurs
 * symboliques collés ( a=1+2 ), ponctuation collée, comme l'affichage
 * du STOS. Les +/- gardent leur espace après un mot-clé ( print -5 ).
 * @param {Array<object>} tokens
 * @returns {string}
 */
export function detokenize(tokens) {
  let out = "";
  let prev = null;
  const strip = () => {
    if (out.endsWith(" ")) out = out.slice(0, -1);
  };
  const isLiteral = (t) =>
    t &&
    (t.code === T.VARIABLE || t.code === T.ALPHA || t.code === T.ENTIER ||
      t.code === T.FLOAT || t.code === T.HEXA || t.code === T.BINAIRE);
  for (const t of tokens) {
    if (t.code === T.REM) {
      strip();
      out += (out ? " " : "") + "rem" + (t.text ?? "");
      return out;
    }
    const txt = tokenText(t);
    const isSymOp = t.code >= 0xee && t.code <= 0xf9; // = < > + - mod * / ^
    if (isSymOp) {
      const unaryAfterKeyword =
        (t.code === T.PLUS || t.code === T.MOINS) && prev && !isLiteral(prev) && prev.code !== 41;
      if (!unaryAfterKeyword) strip();
      out += txt;
      prev = t;
      continue;
    }
    if (t.code < 0x80) {
      // ponctuation brute : ( ) , ; :
      if (t.code === 40 || t.code === 41) strip();
      out += txt;
      prev = t;
      continue;
    }
    // mot-clé, variable, constante
    if (out && /[A-Za-z0-9"$)]/.test(out[out.length - 1])) out += " ";
    out += txt;
    if (!isLiteral(t)) out += " "; // espace après un mot-clé
    prev = t;
  }
  return out.replace(/[ \t]+$/, "");
}
