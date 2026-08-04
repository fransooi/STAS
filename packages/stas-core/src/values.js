/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Valeurs BASIC — miroir du registre d2 de STOS :
 *    d2=0 entier, d2=$40 réel, d2=$80 chaîne.
 *  Ici : { t: 0|1|2, v: number|string }
 *  --------------------------------------------------------------------
 */

export const T_INT = 0;
export const T_FLOAT = 1;
export const T_STR = 2;

export const INT = (v) => ({ t: T_INT, v: Math.trunc(v) });
export const FLOAT = (v) => ({ t: T_FLOAT, v });
export const STR = (v) => ({ t: T_STR, v: String(v) });

export const isNumeric = (val) => val.t === T_INT || val.t === T_FLOAT;
export const isString = (val) => val.t === T_STR;

/**
 * Formatage d'un nombre à la STOS : les réels "ronds" s'affichent sans
 * décimale ( 2^3 → "8" ), environ 9 chiffres significatifs sinon,
 * comme le %g du C qui servait aux traps flottantes du STOS.
 */
export function fmtNum(v) {
  if (Object.is(v, -0)) v = 0;
  if (Number.isInteger(v)) return String(v);
  const r = Number(v.toPrecision(9));
  return String(r);
}

/** Affichage d'une valeur (PRINT, STR$...) */
export function fmtValue(val) {
  return val.t === T_STR ? val.v : fmtNum(val.v);
}

/**
 * Fabrique une valeur numérique en gardant le type entier si possible :
 * entier tant que les deux opérandes sont entiers et le résultat tient
 * dans un entier sûr, réel sinon.
 */
export function numResult(a, b, r) {
  if (a.t === T_INT && b.t === T_INT && Number.isSafeInteger(r)) return INT(r);
  return FLOAT(r);
}
