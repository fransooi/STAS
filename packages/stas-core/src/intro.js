/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Texte d'accueil — affiché quand STAS démarre sans programme.
 *  Par Francois Lionet. Bilingue : la langue suit celle de la machine.
 *  --------------------------------------------------------------------
 */

export const INTRO_FR = `-----------------------------------------
STAS by Francois Lionet (c) 2026
Version 0.1 - Licence MIT.
-----------------------------------------
`;

export const INTRO_EN = `-----------------------------------------
STAS by Francois Lionet (c) 2026
Version 0.1 - MIT License.
-----------------------------------------
`;

/** Texte d'accueil selon la langue (0=EN, 1=FR — comme la variable "langue" du STOS) */
export function introText(langue) {
  return langue === 1 ? INTRO_FR : INTRO_EN;
}
