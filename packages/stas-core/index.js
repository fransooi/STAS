/*
 *  STAS — STOS ASCII System
 *  Exports publics du cœur (@stas/core)
 */

export { Stas, AsciiBuffer, STOS_PALETTE, Program, Interpreter, tokenize } from "./src/stas.js";
export { stPaletteToRgb, rgbToStPalette } from "./src/stas.js";
export {
  setPaletteWord, getPaletteWord,
  startShift, stopShift, stepShift,
  startFade, stepFade, pumpAnims,
} from "./src/palette.js";
export { PixelScreen, SCREEN_W, SCREEN_H, convertScreen } from "./src/stas.js";
export {
  Memory, bankBase,
  MEM_LOGIC, MEM_PHYSIC, MEM_BANK_SHIFT, MEM_BANK_MASK, MEM_OFFSET_MASK,
  SCREEN_ST_BYTES, SCREEN_NATIVE_BYTES,
} from "./src/memory.js";
export {
  WindowManager, BORDERS_ST, STOS_GLYPH, borderCodeToGlyph,
} from "./src/windows.js";
export { makeEcho } from "./src/ascii-buffer.js";
export { T, SUB, FSUB, KEYWORDS, tokenText } from "./src/tokens.js";
export { StosError, ERR } from "./src/errors.js";
export { detokenize } from "./src/program.js";
export { INT, FLOAT, STR, fmtNum, fmtValue } from "./src/values.js";
export { parseIni, parseRes } from "./src/config.js";
export { INTRO_FR, INTRO_EN, introText } from "./src/intro.js";
