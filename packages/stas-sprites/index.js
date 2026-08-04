/*
 *  STAS sprites — exports publics (@stas/sprites).
 *  Le cœur (grille, outils, banque, sauvegarde, pages, polices) est
 *  agnostique : la console et le navigateur le réutilisent tel quel.
 */

export { Sprite, SPRITE_PALETTE, emptyCell } from "./src/sprite.js";
export * as tools from "./src/tools.js";
export { History } from "./src/history.js";
export { SpriteBank, BANK_MAGIC, BANK_VERSION } from "./src/bank.js";
export {
  toText, toAnsi, bankToAnsi, makeExport, isBankJSON, loadBank,
} from "./src/save.js";
export {
  PAGE_SIZE, MAX_PAGE, pageOf, pageBase, isGlyph, glyphAt,
  pageGlyphs, NAMED_PAGES, QUICK_GLYPHS,
} from "./src/charset.js";
export { FONTS, fontById, googleFontsUrl } from "./src/fonts.js";
