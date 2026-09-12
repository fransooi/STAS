/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Tables d'instructions et de fonctions — les "tins" / "tfn" de BASIC.S
 *  (tables de saut L699-L780) réécrites en Maps JavaScript.
 *
 *  Chaque handler reçoit l'interpréteur `it` et consomme ses arguments
 *  directement dans le flot de tokens, exactement comme le faisait le
 *  68000 en lisant la ligne tokenisée.
 *  --------------------------------------------------------------------
 */

import { T, SUB, FSUB } from "./tokens.js";
import { StosError, ERR } from "./errors.js";
import {
  INT, FLOAT, STR,
  T_INT, T_FLOAT, T_STR,
  fmtNum,
} from "./values.js";
import { detokenize } from "./program.js";
import { PixelScreen } from "./pixel-screen.js";
import { bankBase, MEM_LOGIC, MEM_PHYSIC } from "./memory.js";
import {
  setPaletteWord, getPaletteWord,
  startShift, stopShift, startFade,
} from "./palette.js";
import { doAppear, bankPalette, screenOperand, screenAddr, bankAddr, pixelView, PIXEL_W, PIXEL_H } from "./screens.js";
import { packScreen, unpackScreen, TMODE } from "./compact.js";

// --- petits combinateurs ---------------------------------------------------
const num1 = (it) => it.toNum(it.args(1, 1)[0]);
const int1 = (it) => it.toInt(it.args(1, 1)[0]);
const str1 = (it) => it.toStr(it.args(1, 1)[0]);
const trigIn = (it, x) => (it.degMode ? (x * Math.PI) / 180 : x);
const trigOut = (it, r) => (it.degMode ? (r * 180) / Math.PI : r);
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;



// ===========================================================================
//  Instructions simples ($A1-$B7)
// ===========================================================================

async function doPrint(it) {
  // PRINT USING format$;liste — contrôle fin du formatage
  const u = it.peek();
  if (u && u.code === T.ETENDU && u.sub === SUB.USING) {
    it.next();
    printUsing(it);
    return;
  }
  let newline = true;
  while (!it.atEos()) {
    if (it.eatRaw(";")) {
      newline = false;
      continue;
    }
    if (it.eatRaw(",")) {
      it.buffer.write("\t"); // taquets STOS : colonnes multiples de 14
      newline = false;
      continue;
    }
    const t = it.peek();
    if (t && t.code === T.EXT_FUNC && t.sub === FSUB.TAB) {
      it.next();
      const [v] = it.args(1, 1);
      it.buffer.locate(it.toInt(v), it.buffer.cy);
      newline = false;
      continue;
    }
    it.buffer.write(it.formatValue(it.evalExpr()));
    newline = true;
  }
  if (newline) it.buffer.write("\n");
}

// --- USING : formatage fin ------------------------------------------------
//  Port fidèle de BASIC.S « ssprint / using1 / using50 » (1987) :
//    ~  un caractère de la chaîne (espace quand elle est épuisée)
//    #  un chiffre (lu de droite à gauche pour la partie entière,
//       de gauche à droite après le point ; espace/0 quand épuisé)
//    .  point décimal (recopié)
//    +  signe permanent (+/-)     -  signe seulement si négatif
//    ;  marque la position sans point décimal (écrit un espace)
//    ^  exposant (copie celui de la valeur, sinon fabrique « E+000 »)
//    E  termine la partie entière (comme le point)
//  Comme le STOS, une seule expression est formatée par USING : la suite
//  s'imprime normalement (ssprint remet usingflg à 0), et « , » y fait 3 espaces.

const USPUISS = "E+000  "; // uspuiss de BASIC.S

/** PRINT USING format$;expr / instruction USING équivalente. */
function printUsing(it) {
  const fmt = it.toStr(it.evalExpr());
  it.expectRaw(";");
  const v = it.evalExpr();
  it.buffer.write(
    v.t === T_STR ? usingString(fmt, v.v) : usingNumber(it, fmt, v)
  );
  let newline = true;
  while (!it.atEos()) {
    if (it.eatRaw(";")) { newline = false; continue; }
    if (it.eatRaw(",")) { it.buffer.write("   "); newline = false; continue; }
    it.buffer.write(it.formatValue(it.evalExpr()));
    newline = true;
  }
  if (newline) it.buffer.write("\n");
}

/** using50 : chaque ~ prend un caractère de la chaîne, un espace au-delà. */
function usingString(fmt, s) {
  let out = "";
  let k = 0;
  for (const c of fmt) {
    if (c === "~") out += k < s.length ? s[k++] : " ";
    else out += c;
  }
  return out;
}

/**
 * Représentation ASCII de la valeur, comme longdec1 / strflasc :
 * premier caractère = signe ('-' ou espace), puis les chiffres, un '.', la
 * fraction, et éventuellement « E+dd » pour l'exponentielle.
 */
function usingValueString(it, val) {
  if (val.t === T_INT) {
    const n = val.v | 0;
    return (n < 0 ? "-" : " ") + String(Math.abs(n));
  }
  const v = val.v;
  const neg = v < 0 || Object.is(v, -0);
  const a = Math.abs(v);
  const fix = it.fixPrecision;
  let body;
  if (fix != null && fix < 0) body = a.toExponential(Math.abs(fix));
  else if (fix != null && fix > 0 && fix < 16) body = a.toFixed(fix);
  else body = String(a);
  return (neg ? "-" : " ") + body.replace("e", "E");
}

/** using1 : formatage d'un nombre (algorithme de BASIC.S). */
function usingNumber(it, fmt, val) {
  const vs = usingValueString(it, val);
  const out = [];
  let i = 0;
  // us3 : avance dans le format jusqu'à '.', ';', 'E' ou fin
  let f = 0;
  while (f < fmt.length) {
    const c = fmt[f];
    if (c === "." || c === ";" || c === "E") break;
    f++;
  }
  // us5 : avance dans la valeur jusqu'à '.', 'E' ou fin
  while (i < vs.length) {
    const c = vs[i];
    if (c === "." || c === "E") break;
    i++;
  }
  // us6/us7 : partie gauche, écrite de droite à gauche (a1 est consommé)
  const iInt = i; // a1 au us6, restauré par us15
  for (let k = f - 1; k >= 0; k--) {
    const c = fmt[k];
    if (c === "#") {
      if (i === 0) out.push(" ");
      else {
        const d = vs[--i];
        out.push(d >= "0" && d <= "9" ? d : " ");
      }
    } else if (c === "-") {
      out.push(vs[0] === "-" ? "-" : " ");
    } else if (c === "+") {
      out.push(vs[0] === "-" ? "-" : "+");
    } else {
      out.push(c);
    }
  }
  out.reverse();
  // us15 : a1 restauré (fin de la partie entière), puis saute le point
  i = iInt;
  if (vs[i] === ".") i++;
  // us16 : partie droite, écrite de gauche à droite
  let d2 = 0; // drapeau puissance
  let idx = f;
  const copyExp = () => {
    for (;;) {
      if (i >= vs.length) { out.push(d2 === 0 ? "0" : " "); return; }
      const d = vs[i++];
      if (d === " ") continue; // saute l'espace entre E et +/- (us24)
      out.push(d);
      return;
    }
  };
  while (idx < fmt.length) {
    const c = fmt[idx++];
    if (c === ";") { out.push(" "); continue; }
    if (c === "#") {
      const d = i < vs.length ? vs[i] : "";
      if (d >= "0" && d <= "9") { out.push(d); i++; }
      else out.push(d2 === 0 ? "0" : " ");
      continue;
    }
    if (c === "^") {
      if (d2 < 0) copyExp();
      else if (d2 > 0) {
        out.push(USPUISS[d2 - 1]);
        if (d2 !== 6) d2++;
      } else {
        while (i < vs.length && vs[i] !== "E") i++;
        if (i >= vs.length) { d2 = 2; out.push(USPUISS[0]); }
        else { d2 = -1; copyExp(); }
      }
      continue;
    }
    out.push(c);
  }
  return out.join("");
}

// --- palette (COLOUR / PALETTE) -------------------------------------------
//  Format matériel ST : mot 9 bits `0000 0RGB 0RGB 0RGB` (3 bits par
//  composante, nibbles alignés — Hardware Spec §3.2). io.paletteST garde les
//  mots, io.palette l'équivalent RGB lu par les renderers.
//
//  Fidélité BASIC.S : l'instruction COLOUR stocke le MOT BRUT 16 bits
//  (`color`), mais le matériel ne verrouille que 9 bits (3,7,11 ignorés) et
//  la fonction COLOUR() masque avec $777 (`colorf`). PALETTE, elle, refuse
//  toute valeur hors $777 (`s`).

/** Valide un mot $RGB pour PALETTE : 3 bits par composante (0..$777). */
function stPaletteWord(it, v) {
  if (v < 0 || (v & ~0x777) !== 0) it.err(ERR.FON_CALL);
  return v;
}

function setPaletteST(it, i, word) {
  setPaletteWord(it.io, i, word);
}

/** COLOUR i,$rgb — règle une entrée de palette. */
function doColourSet(it) {
  const i = it.toInt(it.evalExpr());
  if (i < 0 || i > 15) it.err(ERR.FON_CALL);
  if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  const v = it.toInt(it.evalExpr());
  if (v < 0 || v > 0xffff) it.err(ERR.FON_CALL); // cmp.l #$10000 -> foncall
  setPaletteST(it, i, v);
}

/** COLOUR(i) — lit une entrée de palette (matériel, masquée $777). */
function funcColour(it) {
  const i = it.toInt(it.args(1, 1)[0]);
  if (i < 0 || i > 15) it.err(ERR.FON_CALL);
  return INT(getPaletteWord(it.io, i));
}

/**
 * PALETTE $rgb0,$rgb1,… — règle les entrées de palette.
 * Une entrée vide (virgule doublée) laisse l'entrée inchangée et avance d'un
 * cran, comme la boucle `s` de BASIC.S. Au-delà de 16 entrées on s'arrête
 * (le matériel lowres n'a que 16 registres de palette).
 */
function doPalette(it) {
  let i = 0;
  for (;;) {
    if (it.atEos()) return;
    // Une entrée vide (virgule immédiate) laisse l'entrée courante intacte ;
    // la virgule elle-même est consommée au bas de la boucle (BASIC.S `s`).
    if (!it.peekRaw(",")) {
      setPaletteST(it, i, stPaletteWord(it, it.toInt(it.evalExpr())));
    }
    i++;
    if (i >= 16 || it.atEos()) return;
    if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  }
}

/** GET PALETTE(n) — charge la palette de l'écran de la banque n (`getpalet`). */
function doGetPalette(it) {
  const words = bankPalette(it, it.toInt(it.args(1, 1)[0]));
  for (let i = 0; i < 16; i++) setPaletteST(it, i, words[i]);
}

/**
 * SHIFT vitesse[,début] / SHIFT OFF — rotation de palette (`colshift` +
 * SPRITES.S `shifton`/`shifter`). Défaut de `début` = 1.
 */
function doShift(it) {
  const t = it.peek();
  if (t && (t.code === T.ON || t.code === T.OFF)) {
    it.next();
    if (t.code !== T.OFF) it.err(ERR.SYNTAX);   // SHIFT ON n'existe pas
    stopShift(it.io);
    return;
  }
  const speed = it.toInt(it.evalExpr());
  let start = 1;
  if (it.eatRaw(",")) start = it.toInt(it.evalExpr());
  if (speed < 0 || speed >= 0x10000) it.err(ERR.FON_CALL);
  const colmax = it.io.mode === 0 ? 16 : it.io.mode === 1 ? 4 : 2;
  if (start < 0 || start >= colmax - 1) it.err(ERR.FON_CALL);
  if (speed === 0) { stopShift(it.io); return; }  // SHIFT 0 = pas de rotation
  startShift(it.io, speed, start);
}

/**
 * FADE vitesse — vers le noir.
 * FADE vitesse TO banque — vers la palette de l'écran d'une banque.
 * FADE vitesse,clr1,,clr3,… — vers une palette partielle (troue = inchangée).
 */
function doFade(it) {
  const speed = it.toInt(it.evalExpr());
  if (speed < 0 || speed >= 1000) it.err(ERR.FON_CALL); // cmp.l #1000
  if (speed === 0) it.err(ERR.FON_CALL);                // cmp.w #0
  if (it.atEos()) {                                     // FADE vitesse -> noir
    startFade(it.io, speed, new Array(16).fill(0), 0xffff);
    return;
  }
  const t = it.peek();
  if (t && t.code === T.TO) {                           // FADE vitesse TO image#
    it.next();
    startFade(it.io, speed, bankPalette(it, it.toInt(it.evalExpr())), 0xffff);
    return;
  }
  if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  // Cible = palette courante ; seules les couleurs citées bougent (bit de
  // masque), une entrée vide laissant la couleur inchangée (BASIC.S `s`).
  const target = it.io.paletteST.map((w) => w & 0x777);
  let mask = 0;
  let i = 0;
  for (;;) {
    if (it.atEos()) break;
    if (!it.peekRaw(",")) {
      target[i] = stPaletteWord(it, it.toInt(it.evalExpr()));
      mask |= 1 << i;
    }
    i++;
    if (i >= 16 || it.atEos()) break;
    if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  }
  startFade(it.io, speed, target, mask);
}

// --- PACK / UNPACK (extension PICTURE COMPACTOR, cf. compact.js) ------------

/**
 * I=PACK(scr,bnk[,mode,flags,hauteur,dx,dy,tx,ty]) — compacte un écran dans
 * une banque et renvoie la longueur de l'image compactée.
 * Défauts (COMPACT.S L128-148) : mode = résolution courante, tx = mots/ligne,
 * ty = hauteur/5, hauteur = 5, dx = dy = 0, flags = %11.
 */
function funcPack(it) {
  const a = it.args(2, 9).map((v) => it.toInt(v));
  if (a.length !== 2 && a.length !== 9) it.err(ERR.SYNTAX);
  const mode = a.length === 9 ? a[2] : (it.io.mode | 0);
  if (mode < 0 || mode > 2) it.err(ERR.FON_CALL);
  const tm = TMODE[mode];
  const flags = a.length === 9 ? a[3] : 3;             // %11
  const tcar = a.length === 9 ? a[4] : 5;
  const dx = a.length === 9 ? a[5] : 0;
  const dy = a.length === 9 ? a[6] : 0;
  const tx = a.length === 9 ? a[7] : tm.line / tm.group;
  const ty = a.length === 9 ? a[8] : Math.floor(tm.height / 5);
  const srcBase = screenAddr(it, a[0]);
  const dstBase = bankAddr(it, a[1]);
  const len = packScreen(it, srcBase, dstBase, { mode, flags, tcar, dx, dy, tx, ty });
  return INT(len);
}

/**
 * UNPACK origine[,ecran[,flags[,dx,dy]]] — restaure une image compactée.
 * dx est donné en PIXELS (divisé par 16) ; dx/dy/flags < 0 -> valeurs d'en-tête.
 */
function doUnpack(it) {
  const paren = it.eatRaw("(");
  const srcVal = it.toInt(it.evalExpr());
  let dstBase = null;
  if (it.eatRaw(",")) dstBase = screenOperand(it);
  if (dstBase == null) it.err(ERR.NOT_IMPL);   // « décor des sprites » non modélisé
  let flags = null;
  if (it.eatRaw(",")) {
    const f = it.toInt(it.evalExpr());
    flags = f < 0 ? null : f;
  }
  let dx = null;
  let dy = null;
  if (it.eatRaw(",")) {
    const fx = it.toInt(it.evalExpr());
    if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
    const fy = it.toInt(it.evalExpr());
    if (fx >= 0) dx = fx >> 4;   // pixels -> mots
    if (fy >= 0) dy = fy;        // pixels
  }
  if (paren) it.expectRaw(")");
  unpackScreen(it, bankAddr(it, srcVal), dstBase, { flags, dx, dy });
}

async function doLocate(it) {
  const x = it.toInt(it.evalExpr());
  let y = it.buffer.cy;
  if (it.eatRaw(",")) y = it.toInt(it.evalExpr());
  it.buffer.locate(x, y); // coordonnées 0-based, comme STOS
}

function penPaper(it, which) {
  const n = it.toInt(it.evalExpr());
  if (n < 0 || n > 15) it.err(ERR.FON_CALL);
  if (which === "pen") {
    it.buffer.curPen = n;
    if (it.io.gfx) it.io.gfx.curPen = n;     // PEN = toute la scène
  } else {
    it.buffer.curPaper = n;
    if (it.io.gfx) it.io.gfx.curPaper = n;   // PAPER = toute la scène
  }
}

/** INK n : couleur de tracé graphique uniquement (le texte garde son PEN). */
function doInk(it) {
  const n = it.toInt(it.evalExpr());
  if (n < 0 || n > 15) it.err(ERR.FON_CALL);
  it.io.ink = n;
  if (it.io.gfx) it.io.gfx.curPen = n;
}

/** CENTRE s$ : écrit la chaîne centrée sur la ligne courante. */
function doCentre(it) {
  const s = it.toStr(it.evalExpr());
  const b = it.buffer;
  b.locate(Math.max(0, (b.viewW - s.length) >> 1), b.cy);
  b.write(s + "\n");
}

// --- fenêtres texte (port de FENETRE.S) -----------------------------------

/** WINDOPEN n,x,y,tx,ty[,bordure][,jeu] */
function doWindOpen(it) {
  const n = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const w = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const h = it.toInt(it.evalExpr());
  let border = 1;
  let charset = null;
  if (it.eatRaw(",")) {
    border = it.toInt(it.evalExpr());
    if (it.eatRaw(",")) charset = it.toInt(it.evalExpr());
  }
  it.io.windows.open(n, x, y, w, h, border, charset, it);
}

/** WINDOW n[,m…] — active une ou plusieurs fenêtres. */
function doWindow(it) {
  const list = [it.toInt(it.evalExpr())];
  while (it.eatRaw(",")) list.push(it.toInt(it.evalExpr()));
  for (const n of list) it.io.windows.activate(n, it);
}

/** QWINDOW n — activation rapide. */
function doQWindow(it) {
  it.io.windows.activate(it.toInt(it.evalExpr()), it);
}

/** WINDMOVE x,y — déplace la fenêtre active. */
function doWindMov(it) {
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  it.io.windows.move(x, y, it);
}

/** WINDEL n — détruit une fenêtre. */
function doWindEl(it) {
  it.io.windows.del(it.toInt(it.evalExpr()), it);
}

/** TITLE a$ — titre centré sur la bordure haute. */
function doTitle(it) {
  it.io.windows.title(it.toStr(it.evalExpr()), it);
}

/** BORDER n — redessine la bordure (style inchangé si n = 0). */
function doBorder(it) {
  let style = 0;
  if (!it.atEos()) style = it.toInt(it.evalExpr());
  it.io.windows.setBorder(style, it);
}

/** CLW — efface la fenêtre active. */
function doClw(it) {
  it.io.windows.clearActive(it);
}

// --- attributs & conversions texte ---------------------------------------

/** Attributs texte : chaque instruction s'écrit ON|OFF */

/** Consomme ON|OFF (ON par défaut) et renvoie le booléen. */
function flagArg(it) {
  if (it.eat(T.ON)) return true;
  if (it.eat(T.OFF)) return false;
  return true;
}

/** INVERSE ON|OFF — inverse encre/papier des caractères à venir. */
function doInverseAttr(it) {
  it.buffer.curInverse = flagArg(it);
}

/** UNDER ON|OFF — souligne les caractères à venir. */
function doUnderAttr(it) {
  it.buffer.curUnder = flagArg(it);
}

/** SHADE ON|OFF — ombre du texte (sans effet visuel en ASCII). */
function doShadeAttr(it) {
  it.buffer.curShade = flagArg(it);
}

/** WRITING 1|2|3 — mode d'écriture (remplacement, OR, XOR). */
function doWriting(it) {
  const n = it.toInt(it.evalExpr());
  if (n < 1 || n > 3) it.err(ERR.FON_CALL);
  it.buffer.curWriting = n;
}

/**
 * GR WRITING 1..4 — mode d'écriture GRAPHIQUE (SPRITES.S `setwrite` +
 * contrl 32) : 1 remplacement, 2 transparent (couleur 0 omise),
 * 3 XOR, 4 transparent inverse (seuls les points de couleur 0).
 */
function doGrWriting(it) {
  const n = it.toInt(it.evalExpr());
  if (n < 1 || n > 4) it.err(ERR.FON_CALL);
  it.io.grWriting = n;
}

/** CURS ON|OFF — affiche/maque le curseur. */
function doCurs(it) {
  it.buffer.cursorVisible = flagArg(it);
}

/** SET CURS top,base — taille du curseur (sans effet en ASCII). */
function doSetCurs(it) {
  it.toInt(it.evalExpr());
  if (it.eatRaw(",")) it.toInt(it.evalExpr());
}

/** SCRN(x,y) — caractère à cette position (relative à la fenêtre). */
function funcScrn(it) {
  const [xv, yv] = it.args(2, 2);
  const b = it.buffer;
  const c = b.get(b.viewX + it.toInt(xv), b.viewY + it.toInt(yv));
  return STR(c ? c.ch : " ");
}

/** SQUARE w,h,x,y[,border] — rectangle ASCII au curseur. */
function doSquare(it) {
  const w = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const h = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  if (it.eatRaw(",")) it.toInt(it.evalExpr()); // style de bordure : ignoré
  const b = it.buffer;
  const x0 = b.viewX + b.cx + x;
  const y0 = b.viewY + b.cy + y;
  if (w < 2 || h < 2) return;
  for (let i = 0; i < w; i++) {
    b.put(x0 + i, y0, "─");
    b.put(x0 + i, y0 + h - 1, "─");
  }
  for (let j = 0; j < h; j++) {
    b.put(x0, y0 + j, "│");
    b.put(x0 + w - 1, y0 + j, "│");
  }
  b.put(x0, y0, "┌");
  b.put(x0 + w - 1, y0, "┐");
  b.put(x0, y0 + h - 1, "└");
  b.put(x0 + w - 1, y0 + h - 1, "┘");
}

/** SCROLL ON|OFF, ou SCROLL x1,y1 TO x2,y2 (zone défilée d'une ligne). */
function doScroll(it) {
  const t = it.peek();
  if (t && (t.code === T.ON || t.code === T.OFF)) {
    it.next();
    it.io.windows.scrollEnabled = t.code === T.ON;
    return;
  }
  const x1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y1 = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const x2 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  const b = it.buffer;
  b.scrollView(1, {
    x: b.viewX + Math.min(x1, x2),
    y: b.viewY + Math.min(y1, y2),
    w: Math.abs(x2 - x1) + 1,
    h: Math.abs(y2 - y1) + 1,
  });
}

/** PLAY canal,hauteur,volume[,...] — sons : M4 (silencieux en ASCII). */
function doPlay(it) {
  it.toInt(it.evalExpr());
  while (it.eatRaw(",")) it.toInt(it.evalExpr());
}

/** FLASH/KEY/CLICK ON|OFF, HIDE, SHOW — décor écran/clavier/souris : no-op. */
function doFlag(it) {
  it.eat(T.ON) || it.eat(T.OFF);
}

/** FIX(n) — règle la précision d'affichage des réels (1..15, ≥16, <0 expo). */
function doFix(it) {
  it.fixPrecision = it.toInt(it.evalExpr());
}

/**
 * SWAP x,y / SWAP(x,y) — échange le contenu de deux variables (ou éléments
 * de tableau) du même type, comme le SWAP du STOS.
 */
function doSwap(it) {
  const paren = it.eatRaw("(");
  const a = it.parseLvalue();
  if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  const b = it.parseLvalue();
  if (paren) it.expectRaw(")");
  const va = a.dims ? it.arrayGet(a.name, a.dims) : it.getVar(a.name);
  const vb = b.dims ? it.arrayGet(b.name, b.dims) : it.getVar(b.name);
  if ((va.t === T_STR) !== (vb.t === T_STR)) it.err(ERR.TYPE_MISMATCH);
  if (a.dims) it.arraySet(a.name, a.dims, vb);
  else it.setVar(a.name, vb);
  if (b.dims) it.arraySet(b.name, b.dims, va);
  else it.setVar(b.name, va);
}

/** SORT a$(0) — trie le tableau 1-D par ordre croissant (nombres ou chaînes). */
function doSort(it) {
  const lv = it.parseLvalue();
  it.sortArray(lv.name);
}

const pad2 = (n) => String(n).padStart(2, "0");

/** TIME$ — "HH:MM:SS" (horloge hôte), sauf si la variable a été assignée. */
function hostTime(it) {
  const d = new Date(it.now());
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** DATE$ — "DD/MM/YYYY" (horloge hôte), sauf si la variable a été assignée. */
function hostDate(it) {
  const d = new Date(it.now());
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** RESERVE AS SCREEN|WORK|DATA|DATASCREEN n[,taille] — banques mémoire. */
function doReserve(it) {
  const t = it.peek();
  const kinds = [
    [SUB.AS_SCREEN, "screen"], [SUB.AS_WORK, "work"],
    [SUB.AS_DATA, "data"], [SUB.AS_DATASCREEN, "datascreen"],
    [SUB.ASSET, "set"],
  ];
  let kind = null;
  if (t && t.code === T.ETENDU) {
    for (const [sub, name] of kinds) {
      if (t.sub === sub) { kind = name; it.next(); break; }
    }
  }
  if (!kind) it.err(ERR.SYNTAX);
  const n = it.toInt(it.evalExpr());
  if (n < 0 || n > 15) it.err(ERR.FON_CALL);
  if (n === 15) it.err(ERR.BANK15_MENU);   // banque 15 = menus (STOS)
  if (it.io.banks.has(n)) it.err(ERR.BANK_RES); // 41 : déjà réservée
  let size;
  if (kind === "screen" || kind === "datascreen") {
    size = 0x8000;                              // écran : toujours 32 Ko
    if (it.eatRaw(",")) it.toInt(it.evalExpr()); // longueur ignorée (STOS)
  } else {
    size = it.eatRaw(",") ? it.toInt(it.evalExpr()) : 256;
    if (size <= 0) size = 256;
    size = Math.ceil(size / 256) * 256;          // arrondi à 256 octets
  }
  it.io.banks.set(n, { kind, size, data: new Uint8Array(size) });
}

// --- mémoire : PEEK/POKE & co (adresses encodées, cf. memory.js) -------------

/** Évalue une adresse 32 bits (entier non signé). */
const memAddr = (it) => it.toInt(it.evalExpr()) >>> 0;

function evenAddr(it, a) {
  if (a & 1) it.err(ERR.ADDR_ERROR); // 32 : adresse impaire interdite
}

function doPoke(it) {
  const a = memAddr(it);
  it.expectRaw(",");
  it.io.mem.writeByte(a, it.toInt(it.evalExpr()));
  it.memSync(a, a);
}

function doDoke(it) {
  const a = memAddr(it);
  evenAddr(it, a);
  it.expectRaw(",");
  const v = it.toInt(it.evalExpr()) & 0xffff;
  it.io.mem.writeByte(a, (v >> 8) & 0xff);
  it.io.mem.writeByte(a + 1, v & 0xff);
  it.memSync(a, a + 1);
}

function doLoke(it) {
  const a = memAddr(it);
  evenAddr(it, a);
  it.expectRaw(",");
  const v = it.toInt(it.evalExpr()) >>> 0;
  for (let i = 0; i < 4; i++) it.io.mem.writeByte(a + i, (v >>> (24 - 8 * i)) & 0xff);
  it.memSync(a, a + 3);
}

function funcPeek(it) {
  return INT(it.io.mem.readByte(memAddr(it)));
}

function funcDeek(it) {
  const a = memAddr(it);
  evenAddr(it, a);
  const v = (it.io.mem.readByte(a) << 8) | it.io.mem.readByte(a + 1);
  return INT(v & 0xffff);
}

function funcLeek(it) {
  const a = memAddr(it);
  evenAddr(it, a);
  let v = 0;
  for (let i = 0; i < 4; i++) v = (v * 256 + it.io.mem.readByte(a + i)) >>> 0;
  return INT(v | 0); // signé : bit 31 -> négatif (comme le STOS)
}

function doCopy(it) {
  const start = memAddr(it);
  it.expectRaw(",");
  const finish = memAddr(it);
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const dest = memAddr(it);
  const n = finish - start;
  if (n < 0) return;
  const tmp = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) tmp[i] = it.io.mem.readByte(start + i);
  for (let i = 0; i <= n; i++) it.io.mem.writeByte(dest + i, tmp[i]);
  it.memSync(dest, dest + n);
}

function doFill(it) {
  const start = memAddr(it);
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const finish = memAddr(it);
  it.expectRaw(",");
  const lw = it.toInt(it.evalExpr()) >>> 0;
  const b = [(lw >>> 24) & 0xff, (lw >>> 16) & 0xff, (lw >>> 8) & 0xff, lw & 0xff];
  for (let a = start; a <= finish; a++) it.io.mem.writeByte(a, b[(a - start) & 3]);
  if (finish >= start) it.memSync(start, finish);
}

/** HUNT(start TO end, A$) — renvoie 0 ou l'adresse de la chaîne trouvée. */
function funcHunt(it) {
  if (!it.eatRaw("(")) it.err(ERR.SYNTAX);
  const start = memAddr(it);
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const end = memAddr(it);
  it.expectRaw(",");
  const needle = it.toStr(it.evalExpr());
  it.expectRaw(")");
  if (!needle.length || end < start) return INT(0);
  let buf = "";
  for (let a = start; a <= end; a++) buf += String.fromCharCode(it.io.mem.readByte(a));
  const idx = buf.indexOf(needle);
  return INT(idx < 0 ? 0 : start + idx);
}

function doErase(it) {
  it.io.banks.delete(it.toInt(it.evalExpr()));
}

/** VARPTR(variable) — adresse mémoire de la variable (voir Interpreter). */
function funcVarptr(it) {
  if (!it.eatRaw("(")) it.err(ERR.SYNTAX);
  const lv = it.parseLvalue();
  if (lv.dims) it.err(ERR.FON_CALL); // tableaux : non supportés (V1)
  it.expectRaw(")");
  return INT(it.varptr(lv.name));
}

/** BCOPY source TO dest — copie le contenu d'une banque dans une autre. */
function doBcopy(it) {
  const src = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const dst = it.toInt(it.evalExpr());
  const s = it.io.banks.get(src);
  const d = it.io.banks.get(dst);
  if (!s || !d) it.err(ERR.BANK_NOT_RES);
  d.data.set(s.data.subarray(0, Math.min(s.size, d.size)));
}

/** BSAVE file$,start TO end — écrit un bloc mémoire (via le connecteur). */
async function doBsave(it) {
  const path = it.toStr(it.evalExpr());
  it.expectRaw(",");
  const start = memAddr(it);
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const end = memAddr(it);
  if (!it.io.sendCommand) it.err(ERR.NOT_IMPL);
  const data = [];
  for (let a = start; a <= end; a++) data.push(it.io.mem.readByte(a));
  const ans = await it.io.sendCommand("stas:bsave", { path, data });
  if (!ans || !ans.success) it.err(ans?.data?.stosCode ?? ERR.NOT_IMPL);
}

/** BLOAD file$[,dest] — lit un bloc mémoire ; dest = adresse ou banque 1-15. */
async function doBload(it) {
  const path = it.toStr(it.evalExpr());
  let dest = null;
  if (it.eatRaw(",")) dest = it.toInt(it.evalExpr());
  if (!it.io.sendCommand) it.err(ERR.NOT_IMPL);
  const ans = await it.io.sendCommand("stas:bload", { path });
  if (!ans || !ans.success) it.err(ans?.data?.stosCode ?? ERR.FILE_NOT_FOUND);
  const data = ans.data?.data ?? [];
  if (dest != null && dest >= 1 && dest <= 15 && it.io.banks.has(dest)) {
    const b = it.io.banks.get(dest);
    for (let i = 0; i < data.length && i < b.size; i++) b.data[i] = data[i] & 0xff;
    return;
  }
  const addr = dest != null ? dest : 0;
  for (let i = 0; i < data.length; i++) it.io.mem.writeByte(addr + i, data[i]);
  if (data.length) it.memSync(addr, addr + data.length - 1);
}

/** ACCLOAD file$ — accessoires : accepté sans effet (pas de multi-programme). */
function doAccload(it) {
  if (!it.atEos()) it.toStr(it.evalExpr());
}

// --- bits (BCHG/BCLR/BSET/BTST) et rotations (ROL/ROR) ------------------

function bitIndex(it) {
  it.expectRaw(",");
  return it.toInt(it.evalExpr()) & 31;
}

function bitStore(it, lv, v) {
  const val = INT(v | 0);
  if (lv.dims) it.arraySet(lv.name, lv.dims, val);
  else it.setVar(lv.name, val);
}

function doBitModify(it, op) {
  const lv = it.parseLvalue();
  const cur = lv.dims ? it.arrayGet(lv.name, lv.dims) : it.getVar(lv.name);
  if (cur.t === T_STR) it.err(ERR.TYPE_MISMATCH);
  const y = bitIndex(it);
  let v = cur.v | 0;
  if (op === "set") v |= 1 << y;
  else if (op === "clr") v &= ~(1 << y);
  else v ^= 1 << y;
  bitStore(it, lv, v);
}

function funcBtst(it) {
  const [a, b] = it.args(2, 2);
  return INT((it.toInt(a) >>> (it.toInt(b) & 31)) & 1);
}

function doRotate(it, left) {
  const lv = it.parseLvalue();
  const cur = lv.dims ? it.arrayGet(lv.name, lv.dims) : it.getVar(lv.name);
  if (cur.t === T_STR) it.err(ERR.TYPE_MISMATCH);
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr()) & 31;
  const v = cur.v >>> 0;
  const z = (32 - y) & 31;
  const r = left ? ((v << y) | (v >>> z)) >>> 0 : ((v >>> y) | (v << z)) >>> 0;
  bitStore(it, lv, r);
}

function doIncDec(it, sign) {
  const lv = it.parseLvalue();
  let n = 1;
  if (it.eatRaw(",")) n = it.toNum(it.evalExpr());
  const cur = lv.dims ? it.arrayGet(lv.name, lv.dims) : it.getVar(lv.name);
  if (cur.t === T_STR) it.err(ERR.TYPE_MISMATCH);
  const nv = cur.v + sign * n;
  const v = cur.t === T_FLOAT || !Number.isInteger(nv) ? FLOAT(nv) : INT(nv);
  if (lv.dims) it.arraySet(lv.name, lv.dims, v);
  else it.setVar(lv.name, v);
}

// --- mode graphique + écrans (STAS : texte -> graphique -> sprites) -------
// Les plans pixels font toujours 320x200 (lowres Atari) ; MODE choisit la
// résolution de la grille texte/ascii sur laquelle le converter projette
// l'écran PHYSIQUE : 80x25 (MODE 0), 160x50 (MODE 1/2), ou tout diviseur
// de 320x200 en extension STAS.
function doMode(it) {
  const n = it.toInt(it.evalExpr());
  let cols, rows;
  if (n === 0) { cols = 80; rows = 25; }
  else if (n === 1 || n === 2) { cols = 160; rows = 50; }
  else it.err(ERR.NOT_IMPL);
  if (it.eatRaw(",")) cols = it.toInt(it.evalExpr());
  if (it.eatRaw(",")) rows = it.toInt(it.evalExpr());
  cols |= 0; rows |= 0;
  if (
    cols < 1 || rows < 1 || cols > 320 || rows > 200 ||
    320 % cols !== 0 || 200 % rows !== 0
  ) {
    it.err(ERR.RES_NOT_ALLOW);              // 45 « Resolution not allowed »
  }
  // lockTextRes (adaptateur web, ?text=/?res=) : MODE ne change plus la
  // grille texte, il réinitialise seulement les plans pixels. Sans le
  // flag : fidélité STOS, MODE redimensionne le buffer.
  if (!it.io.lockTextRes) it.buffer.resize(cols, rows); // grille texte = grille ascii
  const io = it.io;
  io.mode = n;                              // DIVX / DIVY en dépendent
  io.physic = new PixelScreen();            // MODE réinitialise les écrans
  io.logic = new PixelScreen();
  io.gfxActive = true;
  if (io.ink != null) {                     // l'INK donnée avant MODE survit
    io.physic.curPen = io.ink;
    io.logic.curPen = io.ink;
  }
  io.physic.clear(it.buffer.curPaper);
  io.logic.clear(it.buffer.curPaper);
  io.asciiCache = null;
  if (io.onScreen) io.onScreen(n, cols, rows);  // l'adaptateur ouvre le rendu gfx
}

function doPlot(it) {
  const tg = targets(it);
  const x = it.toInt(it.evalExpr());
  if (!it.eatRaw(",")) it.err(ERR.SYNTAX);
  const y = it.toInt(it.evalExpr());
  const col = optColor(it);
  putAll(tg, x, y, col);
  for (const s of tg) { s.gx = x; s.gy = y; }   // curseur graphique
}

function doCls(it) {
  it.buffer.clear();                            // CLS efface texte + écrans
  const io = it.io;
  if (io.physic) {
    io.physic.clear(io.buffer.curPaper);
    io.logic.clear(io.buffer.curPaper);
    io.asciiCache = null;
  }
}

// --- primitives graphiques (STAS) ---------------------------------------
// On dessine dans l'écran LOGIQUE, et aussi dans le PHYSIQUE si AUTOBACK
// ON (défaut, comme le STOS). Les primitives travaillent en 320x200 ; le
// converter graphique -> ascii fait la projection sur la grille texte au
// moment du rendu.

// CLIP / SET LINE courants, posés par targets() avant chaque primitive.
let drawClip = null;
let drawStyle = { mask: 0xffff, thick: 1 };
let drawMark = { type: 1, height: 1 };
let drawWriting = 1;   // GR WRITING 1..4 (setwrite)

function targets(it) {
  const io = it.io;
  if (!io.gfxActive) it.err(ERR.GFX_MODE);   // instruction graphique hors MODE = 88
  drawClip = io.clip ?? null;
  drawStyle = io.lineStyle ?? { mask: 0xffff, thick: 1 };
  drawMark = io.mark ?? { type: 1, height: 1 };
  drawWriting = io.grWriting ?? 1;
  return io.autoback ? [io.logic, io.physic] : [io.logic];
}

function inkColor(it) {
  return it.io.gfx ? it.io.gfx.curPen
    : it.io.ink != null ? it.io.ink : it.buffer.curPen;
}

/** Un point, en respectant CLIP et le mode GR WRITING (SPRITES.S setwrite). */
function putAll(tg, x, y, col) {
  const px = x | 0, py = y | 0;
  if (drawClip && (px < drawClip.x1 || px > drawClip.x2 || py < drawClip.y1 || py > drawClip.y2)) return;
  const w = drawWriting;
  for (const s of tg) {
    if (w === 2) {                       // transparent : la couleur 0 est omise
      if (col !== 0) s.set(px, py, col);
    } else if (w === 3) {                // XOR : dest ^= source
      s.set(px, py, (s.get(px, py) ^ col) & 15);
    } else if (w === 4) {                // transparent inverse : seuls les 0
      if (col === 0) s.set(px, py, 0);
    } else {
      s.set(px, py, col);                // 1 = remplacement
    }
  }
}

/** Un point épais (SET LINE width). */
function paintThick(tg, x, y, col) {
  const t = Math.max(1, (drawStyle.thick | 0) || 1);
  if (t === 1) { putAll(tg, x, y, col); return; }
  const o = (t - 1) >> 1;
  for (let dy = 0; dy < t; dy++) {
    for (let dx = 0; dx < t; dx++) putAll(tg, x + dx - o, y + dy - o, col);
  }
}

function optColor(it) {
  if (!it.eatRaw(",")) return inkColor(it);      // sans ,c : encre courante
  const c = it.toInt(it.evalExpr());
  if (c < 0 || c > 15) it.err(ERR.FON_CALL);
  return c;
}

const DIR8 = {
  U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  E: [1, -1], F: [1, 1], G: [-1, 1], H: [-1, -1],
};
const isDigit = (c) => c >= "0" && c <= "9";

/** Segment plein — Bresenham, toutes octantes. */
function lineBres(tg, x0, y0, x1, y1, col) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let n = 0;
  for (;;) {
    if ((drawStyle.mask >> (n % 16)) & 1) paintThick(tg, x0, y0, col); // masque SET LINE
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function hline(tg, xa, xb, y, col) { for (let x = xa; x <= xb; x++) putAll(tg, x, y, col); }
function vline(tg, ya, yb, x, col) { for (let y = ya; y <= yb; y++) putAll(tg, x, y, col); }

/** "x1,y1 TO x2,y2" (BOX/BAR). */
function readRect(it) {
  const x1 = it.toInt(it.evalExpr()); it.expectRaw(",");
  const y1 = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const x2 = it.toInt(it.evalExpr()); it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  return [x1, y1, x2, y2];
}

/** Ellipse/cercle — point médian (4 symétries). rx/ry >= 0. */
function ellipseMid(tg, cx, cy, rx, ry, col) {
  if (rx === 0 && ry === 0) { putAll(tg, cx, cy, col); return; }
  if (rx === 0) { vline(tg, cy - ry, cy + ry, cx, col); return; }
  if (ry === 0) { hline(tg, cx - rx, cx + rx, cy, col); return; }
  const plot4 = (x, y) => {
    putAll(tg, cx + x, cy + y, col); putAll(tg, cx - x, cy + y, col);
    putAll(tg, cx + x, cy - y, col); putAll(tg, cx - x, cy - y, col);
  };
  const rx2 = rx * rx, ry2 = ry * ry;
  const twoRx2 = 2 * rx2, twoRy2 = 2 * ry2;
  let x = 0, y = ry, dx = 0, dy = twoRx2 * y;
  let d1 = ry2 - rx2 * ry + 0.25 * rx2;
  plot4(x, y);
  while (dx < dy) {
    x++; dx += twoRy2;
    if (d1 < 0) { d1 += dx + ry2; }
    else { y--; dy -= twoRx2; d1 += dx - dy + ry2; }
    plot4(x, y);
  }
  let d2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    plot4(x, y);
    y--;
    if (d2 > 0) { dy -= twoRx2; d2 += rx2 - dy; }
    else { x++; dx += twoRy2; dy -= twoRx2; d2 += dx - dy + rx2; }
  }
}

/** Remplissage 4-connexe (paint bucket) : cible = couleur de l'amorce. */
function floodFill(tg, sx, sy, col) {
  const g = tg[0];                          // lecture sur l'écran de travail
  const w = g.width, h = g.height;
  const x0 = sx | 0, y0 = sy | 0;
  if (x0 < 0 || x0 >= w || y0 < 0 || y0 >= h) return;
  const target = g.get(x0, y0);
  if (target === col) return;
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (g.get(x, y) !== target) continue;
    putAll(tg, x, y, col);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

function doLine(it) {
  const tg = targets(it);
  const g = tg[0];
  let x1, y1;
  if (it.eat(T.TO)) {                       // LINE TO x,y : relatif au curseur gfx
    x1 = g.gx; y1 = g.gy;
  } else {
    x1 = it.toInt(it.evalExpr()); it.expectRaw(",");
    y1 = it.toInt(it.evalExpr());
    if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  }
  const x2 = it.toInt(it.evalExpr()); it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  lineBres(tg, x1, y1, x2, y2, optColor(it));
  for (const s of tg) { s.gx = x2; s.gy = y2; }
}

function doBox(it) {
  const tg = targets(it);
  const [x1, y1, x2, y2] = readRect(it);
  const col = optColor(it);
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  hline(tg, xa, xb, ya, col); hline(tg, xa, xb, yb, col);
  vline(tg, ya, yb, xa, col); vline(tg, ya, yb, xb, col);
}

function doBar(it) {
  const tg = targets(it);
  const [x1, y1, x2, y2] = readRect(it);
  const col = optColor(it);
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  for (let y = ya; y <= yb; y++) hline(tg, xa, xb, y, col);
}

/** Coins arrondis d'un RBOX/RBAR — quart de cercle par coin. */
function rboxCorners(tg, xa, ya, xb, yb, r, col, fill) {
  const arc = (cx, cy, sx, sy) => {
    for (let dx = 0; dx <= r; dx++) {
      const dy = Math.round(Math.sqrt(r * r - dx * dx));
      if (fill) hline(tg, cx - (sx < 0 ? dx : 0), cx + (sx > 0 ? dx : 0), cy + sy * dy, col);
      else putAll(tg, cx + sx * dx, cy + sy * dy, col);
    }
  };
  arc(xa + r, ya + r, -1, -1);   // haut-gauche
  arc(xb - r, ya + r, 1, -1);    // haut-droit
  arc(xa + r, yb - r, -1, 1);    // bas-gauche
  arc(xb - r, yb - r, 1, 1);     // bas-droit
}

function doRBox(it) {
  const tg = targets(it);
  const [x1, y1, x2, y2] = readRect(it);
  const col = optColor(it);
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  const r = Math.min(6, (xb - xa) >> 1, (yb - ya) >> 1);
  if (r <= 0) {                  // trop petit : un BOX simple
    hline(tg, xa, xb, ya, col); hline(tg, xa, xb, yb, col);
    vline(tg, ya, yb, xa, col); vline(tg, ya, yb, xb, col);
    return;
  }
  hline(tg, xa + r, xb - r, ya, col); hline(tg, xa + r, xb - r, yb, col);
  vline(tg, ya + r, yb - r, xa, col); vline(tg, ya + r, yb - r, xb, col);
  rboxCorners(tg, xa, ya, xb, yb, r, col, false);
}

function doRBar(it) {
  const tg = targets(it);
  const [x1, y1, x2, y2] = readRect(it);
  const col = optColor(it);
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  const r = Math.min(6, (xb - xa) >> 1, (yb - ya) >> 1);
  if (r <= 0) {
    for (let y = ya; y <= yb; y++) hline(tg, xa, xb, y, col);
    return;
  }
  for (let y = ya + r; y <= yb - r; y++) hline(tg, xa, xb, y, col);
  rboxCorners(tg, xa, ya, xb, yb, r, col, true);
}

function doCircle(it) {
  const tg = targets(it);
  const cx = it.toInt(it.evalExpr()); it.expectRaw(",");
  const cy = it.toInt(it.evalExpr()); it.expectRaw(",");
  const r = it.toInt(it.evalExpr());
  if (r < 0) it.err(ERR.FON_CALL);
  ellipseMid(tg, cx, cy, r, r, optColor(it));
}

function doEllipse(it) {
  const tg = targets(it);
  const cx = it.toInt(it.evalExpr()); it.expectRaw(",");
  const cy = it.toInt(it.evalExpr()); it.expectRaw(",");
  const rx = it.toInt(it.evalExpr()); it.expectRaw(",");
  const ry = it.toInt(it.evalExpr());
  if (rx < 0 || ry < 0) it.err(ERR.FON_CALL);
  ellipseMid(tg, cx, cy, rx, ry, optColor(it));
}

function doPaint(it) {
  const tg = targets(it);
  const x = it.toInt(it.evalExpr()); it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  floodFill(tg, x, y, optColor(it));
}

function doDraw(it) {
  const tg = targets(it);
  const g = tg[0];
  // Forme numérique : draw x1,y1 to x2,y2  (ou draw to x2,y2 : curseur gfx)
  const t = it.peek();
  const isStr = t && (t.code === T.ALPHA ||
    (t.code === T.VARIABLE && t.name.endsWith("$")));
  if (!isStr) {
    let x1 = g.gx, y1 = g.gy;
    if (!it.eat(T.TO)) {
      x1 = it.toInt(it.evalExpr()); it.expectRaw(",");
      y1 = it.toInt(it.evalExpr());
      if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
    }
    const x2 = it.toInt(it.evalExpr()); it.expectRaw(",");
    const y2 = it.toInt(it.evalExpr());
    lineBres(tg, x1, y1, x2, y2, optColor(it));
    for (const s of tg) { s.gx = x2; s.gy = y2; }
    return;
  }
  // Forme tortue : draw "r10 d20 ..." (chaîne, comme le STOS)
  const s = it.toStr(it.evalExpr());
  let col = inkColor(it), cx = g.gx, cy = g.gy;
  const n = s.length;
  let i = 0;
  const skipSep = () => { while (i < n && (s[i] === " " || s[i] === ",")) i++; };
  const num = () => {
    skipSep();
    let sign = 1;
    if (s[i] === "-") { sign = -1; i++; } else if (s[i] === "+") { i++; }
    if (i >= n || !isDigit(s[i])) return null;
    let v = 0;
    while (i < n && isDigit(s[i])) { v = v * 10 + (s.charCodeAt(i) - 48); i++; }
    return sign * v;
  };
  const needNum = () => { const v = num(); if (v === null) it.err(ERR.SYNTAX); return v; };
  while (i < n) {
    skipSep();
    if (i >= n) break;
    const c = s[i].toUpperCase(); i++;
    const dir = DIR8[c];
    if (dir) {
      const d = needNum();
      lineBres(tg, cx, cy, cx + dir[0] * d, cy + dir[1] * d, col);
      cx += dir[0] * d; cy += dir[1] * d;
    } else if (c === "M") {
      const dx = needNum(), dy = needNum();
      lineBres(tg, cx, cy, cx + dx, cy + dy, col);
      cx += dx; cy += dy;
    } else if (c === "C") {
      const v = needNum(); if (v < 0 || v > 15) it.err(ERR.FON_CALL); col = v;
    } else {
      it.err(ERR.SYNTAX);
    }
  }
  for (const s2 of tg) { s2.gx = cx; s2.gy = cy; }
}

// --- écrans PHYSIC/LOGIC : SWAP / COPY / AUTOBACK --------------------------

/** Désignateur d'écran : PHYSIC | LOGIC (banques/BACK : M4). */
// --- graphisme V2 : POINT, CLIP, SET LINE/MARK/PAINT, poly*, arcs ---------

/** POINT(x,y) — couleur d'un pixel de l'écran logique. */
function funcPoint(it) {
  const io = it.io;
  if (!io.gfxActive) it.err(ERR.GFX_MODE);
  if (!it.eatRaw("(")) it.err(ERR.SYNTAX);
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  it.expectRaw(")");
  if (x < 0 || x >= 320 || y < 0 || y >= 200) it.err(ERR.FON_CALL);
  return INT(io.logic.get(x, y));
}

/** CLIP OFF | CLIP x1,y1 TO x2,y2 */
function doClip(it) {
  const t = it.peek();
  if (t && t.code === T.OFF) { it.next(); it.io.clip = null; return; }
  if (t && t.code === T.ON) it.next();
  const x1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y1 = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const x2 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  if (x1 < 0 || y1 < 0 || x2 >= 320 || y2 >= 200 || x1 >= x2 || y1 >= y2) {
    it.err(ERR.FON_CALL);
  }
  it.io.clip = { x1, y1, x2, y2 };
}

/** SET LINE mask,thick,begin,end — style de ligne (masque + épaisseur). */
function doSetLine(it) {
  const mask = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const thick = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const begin = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const end = it.toInt(it.evalExpr());
  it.io.lineStyle = {
    mask: mask & 0xffff, thick: Math.max(1, thick | 0), begin: begin & 3, end: end & 3,
  };
}

/** SET MARK type,height — marqueur de POLYMARK. */
function doSetMark(it) {
  const type = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const height = it.toInt(it.evalExpr());
  if (type < 1 || type > 6 || height < 0) it.err(ERR.FON_CALL);
  it.io.mark = { type, height };
}

/** SET PAINT type,style,perimeter — style de remplissage. */
function doSetPaint(it) {
  const type = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const style = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const per = it.toInt(it.evalExpr());
  if (type < 0 || type > 4 || style < 1 || style > 36 || per < 0 || per > 1) {
    it.err(ERR.FON_CALL);
  }
  it.io.paint = { type, style, perimeter: per };
}

/** SET PATTERN adresse|a$ — motif utilisateur (mémorisé, non rendu). */
function doSetPattern(it) {
  it.io.pattern = it.evalExpr();
}

/** Liste de points « x,y TO x,y … » ou « x,y;x,y … ». */
function readPolyPoints(it, sep) {
  const pts = [];
  for (;;) {
    const x = it.toInt(it.evalExpr());
    it.expectRaw(",");
    const y = it.toInt(it.evalExpr());
    pts.push([x, y]);
    if (sep === ";") { if (!it.eatRaw(";")) break; }
    else if (!it.eat(sep)) break;
  }
  if (pts.length < 2) it.err(ERR.SYNTAX);
  return pts;
}

/** POLYLINE x1,y1 TO x2,y2 TO … */
function doPolyline(it) {
  const pts = readPolyPoints(it, T.TO);
  const col = inkColor(it);
  const tg = targets(it);
  for (let i = 1; i < pts.length; i++) {
    lineBres(tg, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col);
  }
}

/** Un marqueur (SET MARK) au point x,y. */
function drawMarker(tg, x, y, col) {
  const h = Math.max(0, drawMark.height | 0);
  switch (drawMark.type) {
    case 1: putAll(tg, x, y, col); break;
    case 2:
      for (let i = -h; i <= h; i++) { putAll(tg, x + i, y + i, col); putAll(tg, x + i, y - i, col); }
      break;
    case 3:
      for (let i = -h; i <= h; i++) { putAll(tg, x + i, y, col); putAll(tg, x, y + i, col); }
      break;
    case 4:
      for (let i = -h; i <= h; i++) {
        putAll(tg, x + i, y - h, col); putAll(tg, x + i, y + h, col);
        putAll(tg, x - h, y + i, col); putAll(tg, x + h, y + i, col);
      }
      break;
    case 5:
      for (let i = 0; i <= h; i++) {
        putAll(tg, x + i, y - h + i, col); putAll(tg, x - i, y - h + i, col);
        putAll(tg, x + i, y + h - i, col); putAll(tg, x - i, y + h - i, col);
      }
      break;
    default:
      for (let dy = -h; dy <= h; dy++) {
        for (let dx = -h; dx <= h; dx++) putAll(tg, x + dx, y + dy, col);
      }
  }
}

/** POLYMARK x1,y1;x2,y2;… */
function doPolymark(it) {
  const pts = readPolyPoints(it, ";");
  const tg = targets(it);
  const col = inkColor(it);
  for (const [x, y] of pts) drawMarker(tg, x, y, col);
}

/** POLYGON x1,y1 TO x2,y2 TO … (rempli). */
function doPolygon(it) {
  const pts = readPolyPoints(it, T.TO);
  const col = inkColor(it);
  const tg = targets(it);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      hline(tg, Math.round(xs[i]), Math.round(xs[i + 1]), y, col);
    }
  }
}

/** ARC / PIE / EARC / EPIE — angles en dixièmes de degré (0..3600). */
function arcDraw(tg, cx, cy, rx, ry, a1, a2, col, pie) {
  if (a2 <= a1) a2 += 3600;
  const point = (a) => {
    const rad = (a / 10) * (Math.PI / 180);
    return [Math.round(cx + rx * Math.cos(rad)), Math.round(cy - ry * Math.sin(rad))];
  };
  if (pie) {
    for (let a = a1; a <= a2; a++) {
      const [x, y] = point(a);
      lineBres(tg, cx, cy, x, y, col);
    }
  } else {
    let prev = null;
    for (let a = a1; a <= a2; a += 2) {
      const p = point(a);
      if (prev) lineBres(tg, prev[0], prev[1], p[0], p[1], col);
      prev = p;
    }
    const last = point(a2);
    if (prev) lineBres(tg, prev[0], prev[1], last[0], last[1], col);
  }
}

function doArcPie(it, pie, elliptical) {
  const tg = targets(it);
  const cx = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const cy = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const r1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  let r2 = r1;
  if (elliptical) {
    r2 = it.toInt(it.evalExpr());
    it.expectRaw(",");
  }
  const a1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const a2 = it.toInt(it.evalExpr());
  if (r1 < 0 || r2 < 0 || a1 < 0 || a2 < 0 || a1 > 3600 || a2 > 3600) {
    it.err(ERR.FON_CALL);
  }
  arcDraw(tg, cx, cy, r1, r2, a1, a2, inkColor(it), pie);
}

function doScreenSwap(it) {
  const io = it.io;
  if (!io.physic) it.err(ERR.GFX_MODE);
  const p = io.physic;
  io.physic = io.logic;
  io.logic = p;
  io.asciiCache = null;
}

/** Lit jusqu'à `max` entiers séparés par des virgules (s'arrête sur TO). */
function readN(it, max) {
  const out = [it.toInt(it.evalExpr())];
  while (out.length < max && it.eatRaw(",")) out.push(it.toInt(it.evalExpr()));
  return out;
}

/** Lit « [ecran,] x1,y1,x2,y2 » -> { base, v:[x1,y1,x2,y2] } (base = null si omis). */
function screenAnd4(it) {
  const t = it.peek();
  if (t && (t.code === T.PHYSIC || t.code === T.LOGIC)) {
    const base = screenOperand(it);
    it.expectRaw(",");
    return { base, v: readN(it, 4) };
  }
  const v = readN(it, 5);
  if (v.length === 5) return { base: screenAddr(it, v[0]), v: v.slice(1) };
  if (v.length === 4) return { base: null, v };
  it.err(ERR.SYNTAX);
}

/** Copie un rectangle entre deux vues pixel, avec clipping (BASIC.S `scalc`). */
function copyRectPixels(it, srcBase, dstBase, sx, sy, w, h, dx, dy) {
  if (sx < 0) { dx -= sx; w += sx; sx = 0; }
  if (sy < 0) { dy -= sy; h += sy; sy = 0; }
  if (sx + w > PIXEL_W) w = PIXEL_W - sx;
  if (sy + h > PIXEL_H) h = PIXEL_H - sy;
  if (dx < 0) { sx -= dx; w += dx; dx = 0; }
  if (dy < 0) { sy -= dy; h += dy; dy = 0; }
  if (dx + w > PIXEL_W) w = PIXEL_W - dx;
  if (dy + h > PIXEL_H) h = PIXEL_H - dy;
  if (w <= 0 || h <= 0) return;
  const src = pixelView(it, srcBase);
  const dst = pixelView(it, dstBase);
  // même écran : tampon intermédiaire pour gérer les chevauchements
  const same = srcBase === dstBase;
  const cols = new Uint8Array(w * h);
  const tch = same ? new Uint8Array(w * h) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cols[y * w + x] = src.get(sx + x, sy + y);
      if (same) tch[y * w + x] = src.touched(sx + x, sy + y);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      dst.set(dx + x, dy + y, cols[i], same ? tch[i] : src.touched(sx + x, sy + y));
    }
  }
  dst.bump();
}

/** REDUCE : 1re position source dont la case d'arrivée vaut k (table `tab_x`). */
function reduceMap(srcLen, dstLen) {
  const map = new Uint16Array(dstLen);
  let last = 0;
  let idx = 1;
  for (let s = 1; s < srcLen && idx < dstLen; s++) {
    const d = Math.floor((s * dstLen) / srcLen);
    if (d !== last) { map[idx++] = s; last = d; }
  }
  while (idx < dstLen) map[idx++] = srcLen - 1;   // agrandissement : bord
  return map;
}

/** ZOOM : plus proche voisin (k * srcLen / dstLen). */
function zoomMap(srcLen, dstLen) {
  const map = new Uint16Array(dstLen);
  for (let k = 0; k < dstLen; k++) map[k] = Math.floor((k * srcLen) / dstLen);
  return map;
}

/** Met à l'échelle un rectangle source vers un rectangle destination. */
function scalePixels(it, srcBase, sx, sy, sw, sh, dstBase, dx, dy, dw, dh, mapX, mapY) {
  const src = pixelView(it, srcBase);
  const cols = new Uint8Array(sw * sh);
  const tch = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      cols[y * sw + x] = src.get(sx + x, sy + y);
      tch[y * sw + x] = src.touched(sx + x, sy + y);
    }
  }
  const dst = pixelView(it, dstBase);
  for (let y = 0; y < dh; y++) {
    const Y = dy + y;
    if (Y < 0 || Y >= PIXEL_H) continue;
    const row = mapY[y] * sw;
    for (let x = 0; x < dw; x++) {
      const X = dx + x;
      if (X < 0 || X >= PIXEL_W) continue;
      dst.set(X, Y, cols[row + mapX[x]], tch[row + mapX[x]]);
    }
  }
  dst.bump();
}

/**
 * SCREEN COPY [ec1[,x1,y1,x2,y2] TO ec2[,x3,y3]] — copie d'écran ou de zone
 * (BASIC.S `scrcopy`/`scalc`). Sans argument : LOGIC -> PHYSIC (forme courte
 * STAS). Les écrans peuvent être LOGIC/PHYSIC ou une banque SCREEN.
 */
function doScreenCopy(it) {
  const io = it.io;
  if (!io.physic) it.err(ERR.GFX_MODE);
  if (it.atEos()) {
    copyRectPixels(it, MEM_LOGIC, MEM_PHYSIC, 0, 0, PIXEL_W, PIXEL_H, 0, 0);
    io.asciiCache = null;
    return;
  }
  const srcBase = screenOperand(it);
  let rect = null;
  if (it.eatRaw(",")) {
    const x1 = it.toInt(it.evalExpr()); it.expectRaw(",");
    const y1 = it.toInt(it.evalExpr()); it.expectRaw(",");
    const x2 = it.toInt(it.evalExpr()); it.expectRaw(",");
    const y2 = it.toInt(it.evalExpr());
    rect = { x1, y1, x2, y2 };
  }
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const dstBase = screenOperand(it);
  let x3 = 0;
  let y3 = 0;
  if (it.eatRaw(",")) {
    x3 = it.toInt(it.evalExpr()); it.expectRaw(",");
    y3 = it.toInt(it.evalExpr());
  } else if (rect) {
    it.err(ERR.SYNTAX);              // copie de zone : position requise
  }
  const w = rect ? rect.x2 - rect.x1 : PIXEL_W;
  const h = rect ? rect.y2 - rect.y1 : PIXEL_H;
  if (w <= 0 || h <= 0) it.err(ERR.FON_CALL);
  copyRectPixels(it, srcBase, dstBase, rect ? rect.x1 : 0, rect ? rect.y1 : 0, w, h, x3, y3);
  io.asciiCache = null;
}

/**
 * REDUCE [ecran] TO [ecran,]x1,y1,x2,y2 — réduit TOUT l'écran source dans le
 * rectangle d'arrivée (SPRITES.S `reduce:` : table `tab_x` = premier pixel
 * source de chaque case). Défaut source = LOGIC ; défaut arrivée = PHYSIC
 * (l'original visait le décor des sprites, non modélisé ici).
 */
function doReduce(it) {
  let srcBase;
  if (it.peek()?.code === T.TO) {
    it.next();
    srcBase = MEM_LOGIC;
  } else {
    srcBase = screenOperand(it);
    if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  }
  let dstBase = null;
  let v;
  const t = it.peek();
  if (t && (t.code === T.PHYSIC || t.code === T.LOGIC)) {
    dstBase = screenOperand(it);
    it.expectRaw(",");
    v = readN(it, 4);
  } else {
    v = readN(it, 5);
    if (v.length === 5) { dstBase = screenAddr(it, v[0]); v = v.slice(1); }
    else if (v.length !== 4) it.err(ERR.SYNTAX);
  }
  if (dstBase == null) dstBase = it.io.autoback ? MEM_PHYSIC : MEM_LOGIC;
  const [x1, y1, x2, y2] = v;
  if (x1 < 0 || x1 >= PIXEL_W || y1 < 0 || y1 >= PIXEL_H) it.err(ERR.FON_CALL);
  if (x2 < 0 || x2 >= PIXEL_W || y2 < 0 || y2 >= PIXEL_H) it.err(ERR.FON_CALL);
  const dw = x2 - x1;
  const dh = y2 - y1;
  if (dw <= 0 || dh <= 0) it.err(ERR.FON_CALL);
  scalePixels(it, srcBase, 0, 0, PIXEL_W, PIXEL_H, dstBase, x1, y1, dw, dh,
    reduceMap(PIXEL_W, dw), reduceMap(PIXEL_H, dh));
  it.io.asciiCache = null;
}

/**
 * ZOOM [ecran,]x1,y1,x2,y2 TO [ecran,]x3,y3,x4,y4 — agrandit un rectangle
 * (SPRITES.S `zoom:` ; plus proche voisin, TX2 >= TX1 et TY2 >= TY1).
 * Défaut source = LOGIC ; défaut arrivée = PHYSIC.
 */
function doZoom(it) {
  const a = screenAnd4(it);
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const b = screenAnd4(it);
  const [x1, y1, x2, y2] = a.v;
  const [x3, y3, x4, y4] = b.v;
  for (const [X, Y] of [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]) {
    if (X < 0 || X >= PIXEL_W || Y < 0 || Y >= PIXEL_H) it.err(ERR.FON_CALL);
  }
  const sw = x2 - x1;
  const sh = y2 - y1;
  const dw = x4 - x3;
  const dh = y4 - y3;
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) it.err(ERR.FON_CALL);
  if (dw < sw || dh < sh) it.err(ERR.FON_CALL);   // ZOOM agrandit
  const srcBase = a.base ?? MEM_LOGIC;
  const dstBase = b.base ?? (it.io.autoback ? MEM_PHYSIC : MEM_LOGIC);
  scalePixels(it, srcBase, x1, y1, sw, sh, dstBase, x3, y3, dw, dh,
    zoomMap(sw, dw), zoomMap(sh, dh));
  it.io.asciiCache = null;
}

function doAutoback(it) {
  if (it.eat(T.OFF)) it.io.autoback = false;
  else { it.eat(T.ON); it.io.autoback = true; }
}

export const INSTRUCTIONS = new Map([
  [T.PRINT, doPrint],
  [T.LOCATE, doLocate],
  [T.PEN, (it) => penPaper(it, "pen")],
  [T.PAPER, (it) => penPaper(it, "paper")],
  [T.HOME, (it) => it.buffer.locate(0, 0)],
  [T.CUP, (it) => it.buffer.moveCursor(0, -1)],
  [T.CDOWN, (it) => it.buffer.moveCursor(0, 1)],
  [T.CLEFT, (it) => it.buffer.moveCursor(-1, 0)],
  [T.CRIGHT, (it) => it.buffer.moveCursor(1, 0)],
  [T.CLS, doCls],
  [T.POKE, doPoke],
  [T.DOKE, doDoke],
  [T.LOKE, doLoke],
  [T.COLOUR, doColourSet],
  [T.INC, (it) => doIncDec(it, 1)],
  [T.DEC, (it) => doIncDec(it, -1)],
  [T.MODE, doMode],
  [T.PLOT, doPlot],
  [T.LINE, doLine],
  [T.DRAW, doDraw],
  [T.SWAP, doSwap],
  [T.POLYLINE, doPolyline],
  [T.POLYMARK, doPolymark],
  [T.PIE, (it) => doArcPie(it, true, false)],
  [T.SCREEN_SWAP, doScreenSwap],
  [T.SCREEN_COPY, doScreenCopy],
]);

// ===========================================================================
//  Instructions étendues (préfixe $A0)
// ===========================================================================

async function doInput(it) {
  let prompt = "? ";
  const t = it.peek();
  if (t && t.code === T.ALPHA) {
    it.next();
    prompt = t.value;
    it.eatRaw(";"); // INPUT "texte"; a
  }
  const lvs = [];
  do {
    lvs.push(it.parseLvalue());
  } while (it.eatRaw(","));
  for (;;) {
    const line = await it.readInput(prompt);
    const parts = line.split(",");
    const vals = [];
    let ok = true;
    for (let i = 0; i < lvs.length; i++) {
      const raw = (parts[i] ?? "").trim();
      if (lvs[i].name.endsWith("$")) {
        vals.push(STR(raw));
      } else if (NUM_RE.test(raw)) {
        vals.push(
          raw.includes(".") ? FLOAT(parseFloat(raw)) : INT(parseInt(raw, 10)),
        );
      } else {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (let i = 0; i < lvs.length; i++) {
        const lv = lvs[i];
        if (lv.dims) it.arraySet(lv.name, lv.dims, vals[i]);
        else it.setVar(lv.name, vals[i]);
      }
      return;
    }
    it.buffer.write("?Redo from start\n");
  }
}

async function doLineInput(it) {
  let prompt = "";
  const t = it.peek();
  if (t && t.code === T.ALPHA) {
    it.next();
    prompt = t.value;
    it.eatRaw(";");
  }
  const lv = it.parseLvalue();
  const line = await it.readInput(prompt);
  const v = STR(line);
  if (lv.dims) it.arraySet(lv.name, lv.dims, v);
  else it.setVar(lv.name, v);
}

async function doRun(it) {
  let from = null;
  if (!it.atEos()) from = it.toInt(it.evalExpr());
  await it.runProgram(from);
}

async function doList(it) {
  // LIST | LIST n | LIST n,m | LIST n-m | LIST n- | LIST -m
  let from = -Infinity;
  let to = Infinity;
  const lineNo = () => {
    const t = it.peek();
    if (!t || t.code !== T.ENTIER) return null;
    it.next();
    return t.value;
  };
  if (!it.atEos() && it.eat(T.MOINS)) {
    // "-m" : du début jusqu'à m
    to = lineNo();
  } else if (!it.atEos()) {
    from = to = lineNo();
    if (it.eat(T.MOINS) || it.eatRaw(",")) {
      to = it.atEos() ? Infinity : lineNo(); // "n-" garde la borne ouverte
    }
  }
  if (from === null || to === null) it.err(ERR.SYNTAX);
  for (const line of it.program.lines) {
    if (line.num < from || line.num > to) continue;
    it.buffer.write(line.num + " " + detokenize(line.tokens) + "\n");
  }
}

function doDelete(it) {
  const from = it.toInt(it.evalExpr());
  let to = from;
  if (it.eatRaw(",")) to = it.toInt(it.evalExpr());
  if (it.program.deleteRange(from, to) === 0) it.err(ERR.NO_LINE);
}

// ---------------------------------------------------------------------------
//  SAVE / LOAD — passent par le connecteur AWI (io.sendCommand).
//  Contrat de messages calqué sur awi.connectors.editor (EdHttp/EdNetwork) :
//    commande  "stas:save" / "stas:load"  (connecteur:commande)
//    paramètres { path, source?, userName? }
//    réponse   Answer { success, error, data, message } (awi.base.Answer),
//              data.stosCode traduit une défaillance en erreur STOS.
//  Sans connecteur branché : erreur 20 "Function not implemented",
//  comme tout le vocabulaire STOS pas encore implémenté.
// ---------------------------------------------------------------------------

/** Mange un mot-clé étendu précis (SAVE AS → SUB.AS). */
function eatSub(it, sub) {
  const t = it.peek();
  if (t && t.code === T.ETENDU && t.sub === sub) {
    it.next();
    return true;
  }
  return false;
}

/** Mange une chaîne littérale "nom.bas" ; null si absente. */
function eatString(it) {
  const t = it.peek();
  if (t && t.code === T.ALPHA) {
    it.next();
    return t.value;
  }
  return null;
}

/** SAVE/LOAD sans nom : demande le chemin à l'invite (comme INPUT). */
async function askPath(it) {
  const prompt = it.langue ? "Nom de fichier : " : "Filename: ";
  const name = (await it.readInput(prompt)).trim();
  if (!name) it.err(ERR.BAD_FILE_NAME);
  return name;
}

/** Envoie la commande au connecteur ; traduit l'échec en erreur STOS. */
async function storageSend(it, command, parameters) {
  if (!it.io.sendCommand) it.err(ERR.NOT_IMPL);
  const params = { ...parameters };
  if (it.io.userName != null) params.userName = it.io.userName;
  const answer = await it.io.sendCommand(command, params);
  if (!answer || answer.success !== true) {
    const code = answer?.data?.stosCode;
    it.err(Number.isInteger(code) ? code : ERR.IN_OUT);
  }
  return answer;
}

async function doSave(it) {
  const isAs = eatSub(it, SUB.AS); // SAVE AS : force un nouveau nom
  let path = eatString(it);
  if (!path && !isAs) path = it.io.currentPath ?? null;
  if (!path) path = await askPath(it);
  const source = it.program.toSource();
  const answer = await storageSend(it, "stas:save", { path, source });
  it.io.currentPath = answer.data.path ?? path;
  it.buffer.write(
    (it.langue ? "Sauvegarde : " : "Saved: ") + it.io.currentPath + "\n"
  );
}

async function doLoad(it) {
  let path = eatString(it);
  if (!path) path = await askPath(it);
  const answer = await storageSend(it, "stas:load", { path });
  const source = answer.data.source ?? "";
  it.program.clear();
  it.program.load(source, { merge: false, langue: it.langue });
  it.clearVars();
  it.io.currentPath = answer.data.path ?? path;
}

async function doLet(it) {
  const t = it.eat(T.VARIABLE);
  if (!t) it.err(ERR.SYNTAX);
  await it.doAssignWith(t.name);
}

export const EXT_INSTRUCTIONS = new Map([
  [SUB.BOX, doBox],
  [SUB.BAR, doBar],
  [SUB.RBOX, doRBox],
  [SUB.RBAR, doRBar],
  [SUB.CIRCLE, doCircle],
  [SUB.ELLIPSE, doEllipse],
  [SUB.PAINT, doPaint],
  [SUB.INK, doInk],
  [SUB.CENTRE, doCentre],
  [SUB.PLAY, doPlay],
  [SUB.FLASH, doFlag],
  [SUB.KEY, doFlag],
  [SUB.CLICK, doFlag],
  [SUB.HIDE, (it) => {}],
  [SUB.SHOW, (it) => {}],
  [SUB.FIX, doFix],
  [SUB.SORT, doSort],
  [SUB.USING, (it) => printUsing(it)],
  [SUB.ARC, (it) => doArcPie(it, false, false)],
  [SUB.EARC, (it) => doArcPie(it, false, true)],
  [SUB.EPIE, (it) => doArcPie(it, true, true)],
  [SUB.POLYGON, doPolygon],
  [SUB.CLIP, doClip],
  [SUB.SETLINE, doSetLine],
  [SUB.SETMARK, doSetMark],
  [SUB.SETPAINT, doSetPaint],
  [SUB.SETPATTERN, doSetPattern],
  [SUB.SETWRITE, doGrWriting],
  [SUB.REDUCE, doReduce],
  [SUB.ZOOM, doZoom],
  [SUB.PALETTE, doPalette],
  [SUB.GETPALETTE, doGetPalette],
  [SUB.SHIFT, doShift],
  [SUB.FADE, doFade],
  [SUB.APPEAR, doAppear],
  [SUB.UNPACK, doUnpack],
  [SUB.WINDOPEN, doWindOpen],
  [SUB.WINDOW, doWindow],
  [SUB.QWINDOW, doQWindow],
  [SUB.WINDMOV, doWindMov],
  [SUB.WINDEL, doWindEl],
  [SUB.TITLE, doTitle],
  [SUB.BORDER, doBorder],
  [SUB.CLW, doClw],
  [SUB.INVERSE, doInverseAttr],
  [SUB.UNDER, doUnderAttr],
  [SUB.SHADE, doShadeAttr],
  [SUB.WRITING, doWriting],
  [SUB.CURS, doCurs],
  [SUB.SETCURS, doSetCurs],
  [SUB.SQUARE, doSquare],
  [SUB.SCROLLDN, (it) => it.io.windows.scroll(true, it)],
  [SUB.SCROLLUP, (it) => it.io.windows.scroll(false, it)],
  [SUB.SCROLL, doScroll],
  [SUB.COPY, doCopy],
  [SUB.FILL, doFill],
  [SUB.ERASE, doErase],
  [SUB.BCOPY, doBcopy],
  [SUB.BLOAD, doBload],
  [SUB.BSAVE, doBsave],
  [SUB.ACCLOAD, doAccload],
  [SUB.ACCNEW, (it) => {}],
  [SUB.BCHG, (it) => doBitModify(it, "chg")],
  [SUB.BCLR, (it) => doBitModify(it, "clr")],
  [SUB.BSET, (it) => doBitModify(it, "set")],
  [SUB.ROL, (it) => doRotate(it, true)],
  [SUB.ROR, (it) => doRotate(it, false)],
  [SUB.RESERVE, doReserve],
  [SUB.INPUT, doInput],
  [SUB.LINEINPUT, doLineInput],
  [SUB.DATA, (it) => it.skipStatement()],
  [SUB.END, (it) => { it.running = false; it.pc.ti = it.tokens.length; }],
  [SUB.STOP, (it) => { throw new StosError(ERR.STOP, it.currentLine, it.langue); }],
  [SUB.BREAK, (it) => {
    // BREAK ON|OFF : autorise ou non l'interruption Ctrl-C (le refus
    // est fidèle au STOS — Ctrl-C n'est alors plus souverain).
    const on = it.eat(T.ON);
    const off = on ? false : it.eat(T.OFF);
    it.breakEnabled = on ? true : off ? false : true;
  }],
  [SUB.ERROR, (it) => {
    let n = it.toInt(it.evalExpr());
    if (n < 0 || n > 87) n = ERR.FON_CALL;
    throw new StosError(n, it.currentLine, it.langue);
  }],
  [SUB.WAIT, async (it) => {
    const n = it.toInt(it.evalExpr());
    if (n > 0) await it.sleep(n * 20); // 1 = 1/50s, comme le WAIT du STOS
  }],
  [SUB.WAITKEY, async (it) => {
    // WAIT KEY : bloquant, consomme la touche pressée (mange la touche)
    while (!it.inkey()) await it.sleep(20);
  }],
  [SUB.WAITVBL, (it) => it.sleep(20)],
  [SUB.CLEAR, (it) => it.clearVars()],
  [SUB.LET, doLet],
  [SUB.RUN, doRun],
  [SUB.LIST, doList],
  [SUB.NEW, (it) => { it.program.clear(); it.clearVars(); it.io.currentPath = null; }],
  [SUB.SAVE, doSave],
  [SUB.LOAD, doLoad],
  [SUB.DELETE, doDelete],
  [SUB.ENGLISH, (it) => { it.langue = 0; }],
  [SUB.FRANCAIS, (it) => { it.langue = 1; }],
  [SUB.SYSTEM, (it) => {
    if (it.io.onSystem) it.io.onSystem();
    else it.err(ERR.NOT_IMPL);
  }],
  [SUB.AUTOBACK, doAutoback],
]);

// Commandes interdites en mode programme ("Direct command used", erreur 15)
export const EXT_DIRECT_ONLY = new Set([
  SUB.RUN, SUB.LIST, SUB.NEW, SUB.DELETE,
  SUB.ENGLISH, SUB.FRANCAIS, SUB.SYSTEM,
]);

// ===========================================================================
//  Fonctions simples ($B9-$E9)
// ===========================================================================

export const FUNC_TABLE = new Map([
  [T.START, (it) => {
    // START(n) : adresse de base de la banque n (champ banque du schéma
    // d'adressage — voir memory.js). Erreur 44 si la banque n'est pas réservée.
    const n = it.toInt(it.args(1, 1)[0]);
    if (n < 0 || n > 15) it.err(ERR.FON_CALL);
    if (!it.io.banks || !it.io.banks.has(n)) it.err(ERR.BANK_NOT_RES); // 44
    return INT(bankBase(n));
  }],
  [T.PEEK, funcPeek],
  [T.DEEK, funcDeek],
  [T.LEEK, funcLeek],
  [T.ABS, (it) => {
    const v = it.args(1, 1)[0];
    const x = it.toNum(v);
    return v.t === T_INT ? INT(Math.abs(x)) : FLOAT(Math.abs(x));
  }],
  [T.SIN, (it) => FLOAT(Math.sin(trigIn(it, num1(it))))],
  [T.COS, (it) => FLOAT(Math.cos(trigIn(it, num1(it))))],
  [T.LOG, (it) => {
    const x = num1(it);
    if (x <= 0) it.err(ERR.FON_CALL);
    return FLOAT(Math.log10(x)); // LOG = base 10, comme STOS
  }],
  [T.RND, (it) => {
    const v = it.args(1, 1)[0];
    const x = it.toNum(v);
    if (v.t === T_FLOAT || x <= 0) return FLOAT(it.rnd());
    return INT(Math.floor(it.rnd() * x)); // 0 .. x-1
  }],
  [T.VAL, (it) => {
    const s = str1(it).trim();
    if (!NUM_RE.test(s)) return INT(0);
    return s.includes(".") ? FLOAT(parseFloat(s)) : INT(parseInt(s, 10));
  }],
  [T.ASC, (it) => {
    const s = str1(it);
    if (!s.length) it.err(ERR.FON_CALL);
    return INT(s.charCodeAt(0));
  }],
  [T.CHR, (it) => {
    const n = int1(it);
    if (n < 0 || n > 255) it.err(ERR.FON_CALL);
    return STR(String.fromCharCode(n));
  }],
  [T.INKEY, (it) => STR(it.inkey())],
  [T.SCRN, funcScrn],
  [T.POINT, funcPoint],
  [T.COLOUR, funcColour],
  [T.SCANCODE, (it) => INT(it.io.scancode ? it.io.scancode() : 0)],
  [T.MID, (it) => {
    const [sv, av, lv] = it.args(2, 3);
    const s = it.toStr(sv);
    const a = it.toInt(av);
    if (a < 1) it.err(ERR.FON_CALL);
    const len = lv ? Math.max(0, it.toInt(lv)) : s.length;
    return STR(s.slice(a - 1, a - 1 + len));
  }],
  [T.RIGHT, (it) => {
    const [sv, nv] = it.args(2, 2);
    const s = it.toStr(sv);
    const n = Math.max(0, it.toInt(nv));
    return STR(n >= s.length ? s : s.slice(s.length - n));
  }],
  [T.LEFT, (it) => {
    const [sv, nv] = it.args(2, 2);
    const s = it.toStr(sv);
    const n = Math.max(0, it.toInt(nv));
    return STR(s.slice(0, n));
  }],
  [T.LEN, (it) => INT(str1(it).length)],
  [T.LENGTH, (it) => {
    // LENGTH(b) : longueur d'une banque (0 si elle n'existe pas). LEN(a$)
    // reste la longueur de chaîne.
    const n = it.toInt(it.args(1, 1)[0]);
    const b = it.io.banks.get(n);
    return INT(b ? b.size : 0);
  }],
  [T.PI, () => FLOAT(Math.PI)],
  [T.TIMER, (it) => INT(Math.floor((it.now() - it.t0) / 20))], // compteur 50 Hz
  [T.TIMES, (it) => it.vars.get("__time$") ?? STR(hostTime(it))],
  [T.DATES, (it) => it.vars.get("__date$") ?? STR(hostDate(it))],
]);

// ===========================================================================
//  Fonctions étendues (préfixe $B8)
// ===========================================================================

export const EXTFUNC_TABLE = new Map([
  [FSUB.UPPERF, (it) => STR(str1(it).toUpperCase())],
  [FSUB.LOWERF, (it) => STR(str1(it).toLowerCase())],
  [FSUB.STR, (it) => STR(fmtNum(num1(it)))],
  [FSUB.HEXF, (it) => {
    const x = int1(it);
    return STR((x < 0 ? x >>> 0 : x).toString(16).toUpperCase());
  }],
  [FSUB.BINF, (it) => {
    const x = int1(it);
    return STR((x < 0 ? (x >>> 0) : x).toString(2));
  }],
  [FSUB.STRING, (it) => {
    const [nv, xv] = it.args(2, 2);
    const n = it.toInt(nv);
    if (n < 0) it.err(ERR.FON_CALL);
    const piece =
      xv.t === T_STR ? it.toStr(xv) : String.fromCharCode(it.toInt(xv) & 0xff);
    return STR(piece.repeat(n));
  }],
  [FSUB.SPACE, (it) => {
    const n = int1(it);
    if (n < 0) it.err(ERR.FON_CALL);
    return STR(" ".repeat(n));
  }],
  [FSUB.INSTR, (it) => {
    const [hv, nv, sv] = it.args(2, 3);
    const hay = it.toStr(hv);
    const needle = it.toStr(nv);
    const start = sv ? Math.max(1, it.toInt(sv)) : 1;
    const idx = hay.indexOf(needle, start - 1);
    return INT(idx < 0 ? 0 : idx + 1);
  }],
  [FSUB.FLIP, (it) => STR([...str1(it)].reverse().join(""))],
  [FSUB.FREE, (it) => INT(it.io.freeBytes ?? 0x100000)],
  [FSUB.LANGUAGE, (it) => INT(it.langue)],
  [FSUB.MATCH, (it) => {
    // MATCH(tableau(0), valeur) : le 1er argument est un nom de tableau,
    // on le lit comme une lvalue pour retrouver la table complète.
    if (!it.eatRaw("(")) it.err(ERR.SYNTAX);
    const lv = it.parseLvalue();
    if (!lv.dims || lv.dims.length !== 1) it.err(ERR.FON_CALL);
    it.expectRaw(",");
    const needle = it.evalExpr();
    it.expectRaw(")");
    return INT(it.matchArray(lv.name, needle));
  }],
  [FSUB.HUNT, funcHunt],
  [FSUB.BTST, funcBtst],
  [FSUB.MAX, (it) => {
    const [a, b] = it.args(2, 2);
    const x = it.toNum(a), y = it.toNum(b);
    return a.t === T_INT && b.t === T_INT ? INT(Math.max(x, y)) : FLOAT(Math.max(x, y));
  }],
  [FSUB.MIN, (it) => {
    const [a, b] = it.args(2, 2);
    const x = it.toNum(a), y = it.toNum(b);
    return a.t === T_INT && b.t === T_INT ? INT(Math.min(x, y)) : FLOAT(Math.min(x, y));
  }],
  [FSUB.TRUE, () => INT(1)],
  [FSUB.FALSE, () => INT(0)],
  [FSUB.EXP, (it) => FLOAT(Math.exp(num1(it)))],
  [FSUB.SQR, (it) => {
    const x = num1(it);
    if (x < 0) it.err(ERR.NEGATIVE);
    return FLOAT(Math.sqrt(x));
  }],
  [FSUB.LN, (it) => {
    const x = num1(it);
    if (x <= 0) it.err(ERR.FON_CALL);
    return FLOAT(Math.log(x));
  }],
  [FSUB.TAN, (it) => FLOAT(Math.tan(trigIn(it, num1(it))))],
  [FSUB.ATAN, (it) => FLOAT(trigOut(it, Math.atan(num1(it))))],
  [FSUB.HSIN, (it) => FLOAT(Math.sinh(num1(it)))],
  [FSUB.HCOS, (it) => FLOAT(Math.cosh(num1(it)))],
  [FSUB.HTAN, (it) => FLOAT(Math.tanh(num1(it)))],
  [FSUB.ASIN, (it) => {
    const x = num1(it);
    if (x < -1 || x > 1) it.err(ERR.FON_CALL);
    return FLOAT(trigOut(it, Math.asin(x)));
  }],
  [FSUB.ACOS, (it) => {
    const x = num1(it);
    if (x < -1 || x > 1) it.err(ERR.FON_CALL);
    return FLOAT(trigOut(it, Math.acos(x)));
  }],
  [FSUB.SGN, (it) => INT(Math.sign(num1(it)))],
  [FSUB.INT, (it) => INT(Math.floor(num1(it)))], // INT = plancher, comme BASIC
  // DEG/RAD : en fonction, conversion pure (le mode s'obtient par
  // l'instruction seule, cf. Interpreter.execStatement).
  [FSUB.DEG, (it) => FLOAT((num1(it) * 180) / Math.PI)],
  [FSUB.RAD, (it) => FLOAT((num1(it) * Math.PI) / 180)],
  [FSUB.PACK, funcPack],
  [FSUB.ERRN, (it) => INT(it.errn)],
  [FSUB.ERRL, (it) => INT(it.errl)],
  [FSUB.VARPTR, funcVarptr],
  [FSUB.ACCNB, () => INT(0)],
  [FSUB.WINDON, (it) => INT(it.io.windows.current())],
  [FSUB.XCURS, (it) => INT(it.buffer.cx)],
  [FSUB.YCURS, (it) => INT(it.buffer.cy)],
  [FSUB.XTEXT, (it) => INT(Math.floor(num1(it) / (320 / it.buffer.width)))],
  [FSUB.XGRAPHIC, (it) => INT(Math.round(num1(it) * (320 / it.buffer.width)))],
  [FSUB.YTEXT, (it) => INT(Math.floor(num1(it) / (200 / it.buffer.height)))],
  [FSUB.YGRAPHIC, (it) => INT(Math.round(num1(it) * (200 / it.buffer.height)))],
  [FSUB.DIVX, (it) => INT(it.io.mode === 0 ? 2 : 1)],
  [FSUB.DIVY, (it) => INT(it.io.mode === 2 ? 1 : 2)],
]);
