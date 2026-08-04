/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Tokeniseur — l'équivalent de la boucle de "mise en tokens" de
 *  BASIC.S (quand l'éditeur transformait la ligne tapée en octets).
 *
 *  Règles fidèles au STOS :
 *    - mots-clés reconnus insensibles à la casse, plus long d'abord,
 *      avec vérification de frontière ( "format" ≠ "for" + "mat" ).
 *    - REM et ' avalent le reste de la ligne tel quel (non tokenisé),
 *      exactement comme le STOS qui stockait le texte du REM en brut.
 *    - noms de variables COMPLETS, sensibles à la casse, suffixe $ = chaîne.
 *    - $FF hexa, %101 binaire, 123 entier, 1.5 réel.
 *    - les espaces sont ignorés hors des chaînes (mais requis dans les
 *      mots-clés multiples : "screen copy", "line input"...).
 *  --------------------------------------------------------------------
 */

import { T, KEYWORDS_SORTED } from "./tokens.js";
import { StosError, ERR } from "./errors.js";

// Caractères ASCII bruts autorisés hors mots-clés (ponctuation BASIC)
const RAW = new Set(["(", ")", ",", ";", ":"]);

const isIdentStart = (c) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentChar = (c) =>
  isIdentStart(c) || (c >= "0" && c <= "9");
const isDigit = (c) => c >= "0" && c <= "9";
const isHexDigit = (c) =>
  isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isSpace = (c) => c === " " || c === "\t";

/**
 * Compare le mot-clé `kw` avec src à partir de i (insensible à la casse).
 * Une espace dans le mot-clé matche UNE OU PLUSIEURS espaces/tabulations.
 * @returns index de fin si ça matche, -1 sinon.
 */
function matchKeyword(src, i, kw) {
  let j = i;
  for (let k = 0; k < kw.length; k++) {
    const kc = kw[k];
    if (kc === " ") {
      if (!isSpace(src[j])) return -1;
      while (isSpace(src[j])) j++;
    } else {
      const sc = src[j];
      if (sc === undefined) return -1;
      if (sc.toLowerCase() !== kc) return -1; // kw est déjà en minuscules
      j++;
    }
  }
  return j;
}

/**
 * Tokenise une ligne de BASIC (sans son numéro).
 * @param {string} src        le texte de la ligne
 * @param {number} lineNumber numéro de ligne (pour les messages d'erreur)
 * @param {number} langue     0=EN 1=FR
 * @returns {Array<object>}   tableau de tokens { code, pos, ... }
 */
export function tokenize(src, lineNumber = 0, langue = 0) {
  const toks = [];
  const n = src.length;
  let i = 0;
  const fail = () => {
    throw new StosError(ERR.SYNTAX, lineNumber, langue);
  };

  while (i < n) {
    const c = src[i];
    if (isSpace(c) || c === "\r") {
      i++;
      continue;
    }
    const start = i;

    // --- mots-clés, les plus longs d'abord -------------------------------
    let found = false;
    for (const entry of KEYWORDS_SORTED) {
      const kw = entry[0];
      const end = matchKeyword(src, i, kw);
      if (end < 0) continue;
      // frontière : un mot-clé finissant par une lettre/chiffre ne doit pas
      // être suivi d'un caractère d'identifiant (sinon c'est une variable).
      const last = kw[kw.length - 1];
      if (isIdentChar(last)) {
        const nx = src[end];
        if (nx !== undefined && (isIdentChar(nx) || nx === "$")) continue;
      }
      i = end;
      const [, code, sub] = entry;
      if (code === T.REM) {
        // REM / ' : le reste de la ligne est du texte brut, non tokenisé.
        toks.push({ code: T.REM, text: src.slice(i), pos: start });
        return toks;
      }
      toks.push(
        sub !== undefined ? { code, sub, pos: start } : { code, pos: start },
      );
      found = true;
      break;
    }
    if (found) continue;

    // --- constante chaîne "..." -------------------------------------------
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') j++;
      if (j >= n) fail(); // chaîne non fermée
      toks.push({ code: T.ALPHA, value: src.slice(i + 1, j), pos: start });
      i = j + 1;
      continue;
    }

    // --- constante hexa $FF ------------------------------------------------
    if (c === "$") {
      let j = i + 1;
      while (j < n && isHexDigit(src[j])) j++;
      if (j === i + 1) fail();
      toks.push({
        code: T.HEXA,
        value: parseInt(src.slice(i + 1, j), 16),
        pos: start,
      });
      i = j;
      continue;
    }

    // --- constante binaire %101 ---------------------------------------------
    if (c === "%") {
      let j = i + 1;
      while (j < n && (src[j] === "0" || src[j] === "1")) j++;
      if (j === i + 1) fail();
      toks.push({
        code: T.BINAIRE,
        value: parseInt(src.slice(i + 1, j), 2),
        pos: start,
      });
      i = j;
      continue;
    }

    // --- nombre 123 / 1.5 / .5 ----------------------------------------------
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      let isFloat = false;
      if (src[j] === ".") {
        isFloat = true;
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      const txt = src.slice(i, j);
      toks.push(
        isFloat
          ? { code: T.FLOAT, value: parseFloat(txt), pos: start }
          : { code: T.ENTIER, value: parseInt(txt, 10), pos: start },
      );
      i = j;
      continue;
    }

    // --- nom de variable (complet, sensible à la casse) ----------------------
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(src[j])) j++;
      if (src[j] === "$") j++; // suffixe chaîne
      toks.push({ code: T.VARIABLE, name: src.slice(i, j), pos: start });
      i = j;
      continue;
    }

    // --- ponctuation ASCII brute ---------------------------------------------
    if (RAW.has(c)) {
      toks.push({ code: c.charCodeAt(0), pos: start });
      i++;
      continue;
    }

    fail();
  }
  return toks;
}
