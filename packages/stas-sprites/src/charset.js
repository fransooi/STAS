/*
 *  STAS sprites — les "pages" de caractères Unicode.
 *  --------------------------------------------------------------------
 *  L'encre d'un sprite ASCII n'est plus une couleur mais un CARACTÈRE.
 *  Pour aller loin dans la police, on organise Unicode en PAGES de 256
 *  points de code (comme la table d'une police) : page = cp >> 8. On peut
 *  ainsi feuilleter tout Unicode, y compris les plans astraux (emoji),
 *  page par page. Chaque cellule stocke le glyphe en Unicode natif.
 *  --------------------------------------------------------------------
 */

export const PAGE_SIZE = 256;
export const MAX_PAGE = 0x10ffff >> 8; // 0x10FF

/** Numéro de page d'un point de code. */
export function pageOf(cp) {
  return cp >> 8;
}

/** Premier point de code d'une page. */
export function pageBase(page) {
  return page << 8;
}

/**
 * Un point de code vaut-il la peine d'être affiché ? (pas un contrôle,
 * pas un substitut UTF-16, pas un non-caractère). Heuristique volontairement
 * légère — on n'embarque pas toute la table Unicode.
 */
export function isGlyph(cp) {
  if (cp < 0 || cp > 0x10ffff) return false;
  if (cp <= 0x1f) return false;                 // contrôles C0
  if (cp >= 0x7f && cp <= 0x9f) return false;   // DEL + contrôles C1
  if (cp >= 0xd800 && cp <= 0xdfff) return false; // substituts
  if (cp >= 0xfdd0 && cp <= 0xfdef) return false; // non-caractères
  if ((cp & 0xfffe) === 0xfffe) return false;   // xFFFE / xFFFF
  return true;
}

/** Le glyphe (chaîne) d'un point de code, ou "" si non affichable. */
export function glyphAt(cp) {
  return isGlyph(cp) ? String.fromCodePoint(cp) : "";
}

/**
 * Les 256 entrées d'une page : {cp, ch, ok}. ok=false pour les trous
 * (contrôles, substituts…) — l'UI les grise.
 */
export function pageGlyphs(page) {
  const base = pageBase(page);
  const out = new Array(PAGE_SIZE);
  for (let i = 0; i < PAGE_SIZE; i++) {
    const cp = base + i;
    const ok = isGlyph(cp);
    out[i] = { cp, ch: ok ? String.fromCodePoint(cp) : "", ok };
  }
  return out;
}

/**
 * Catalogue de pages intéressantes pour le dessin ASCII/Unicode.
 * De quoi démarrer vite, puis naviguer librement vers n'importe quelle page.
 */
export const NAMED_PAGES = [
  { page: 0x00, name: "Latin de base + Latin-1" },
  { page: 0x03, name: "Grec et copte" },
  { page: 0x04, name: "Cyrillique" },
  { page: 0x21, name: "Symboles lettre + Flèches" },
  { page: 0x22, name: "Opérateurs mathématiques" },
  { page: 0x25, name: "Filet · Blocs · Formes géométriques" },
  { page: 0x26, name: "Symboles divers" },
  { page: 0x27, name: "Dingbats" },
  { page: 0x28, name: "Braille" },
  { page: 0x2b, name: "Flèches complémentaires" },
  { page: 0x30, name: "CJK · Hiragana · Katakana" },
  { page: 0x1f3, name: "Emoji · Symboles et pictogrammes" },
  { page: 0x1f6, name: "Emoji · Émoticônes" },
  { page: 0x1f9, name: "Emoji · Supplément" },
];

/** Sélection rapide de glyphes très utilisés en art ASCII. */
export const QUICK_GLYPHS = [
  " ", "█", "▓", "▒", "░", "▄", "▀", "▌", "▐", "■", "□", "●", "○", "◆", "◇", "◢",
  "◣", "◤", "◥", "★", "☆", "♠", "♣", "♥", "♦", "☺", "☻", "☼", "♪", "♂", "♀", "☃",
  "─", "│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼", "═", "║", "╔", "╗", "╝",
  "←", "↑", "→", "↓", "↔", "↕", "⇐", "⇑", "⇒", "⇓", "✕", "✚", "❄", "❥", "❶", "⓪",
];
