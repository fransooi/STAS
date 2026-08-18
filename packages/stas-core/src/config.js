/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  config — parsing partagé entre adaptateurs (console / web) :
 *    - parseIni : format INI simple (sections, cle=valeur, commentaires) ;
 *    - parseRes : résolution "WxH" bornée (grilles texte/ascii).
 *  Fonctions pures, zéro dépendance, silencieuses : l'adaptateur qui les
 *  appelle décide des warnings.
 *  --------------------------------------------------------------------
 */

/**
 * Parse un INI simple : `[section]`, `cle=valeur`, commentaires `;` ou
 * `#`. Clés en minuscules, valeurs trimmées. Les clés avant toute
 * section vont dans la section "". Ligne sans `=` ou clé vide : ignorée.
 * @returns {Object<string, Object<string, string>>}
 */
export function parseIni(text) {
  const out = { "": {} };
  let section = "";
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === ";" || line[0] === "#") continue;
    if (line[0] === "[" && line.endsWith("]")) {
      section = line.slice(1, -1).trim().toLowerCase();
      if (!out[section]) out[section] = {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    out[section][key] = line.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Parse une résolution « WxH » : entiers, 10..320 colonnes, 5..200
 * lignes. Retourne { cols, rows } ou null si invalide. La question
 * « diviseur de 320x200 » est laissée à l'adaptateur (warn mais accepte).
 */
export function parseRes(s) {
  const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(String(s ?? ""));
  if (!m) return null;
  const cols = +m[1];
  const rows = +m[2];
  if (cols < 10 || cols > 320 || rows < 5 || rows > 200) return null;
  return { cols, rows };
}
