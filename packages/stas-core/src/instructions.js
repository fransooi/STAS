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
  fmtNum, fmtValue,
} from "./values.js";
import { detokenize } from "./program.js";
import { PixelScreen } from "./pixel-screen.js";

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
    it.buffer.write(fmtValue(it.evalExpr()));
    newline = true;
  }
  if (newline) it.buffer.write("\n");
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
  io.physic = new PixelScreen();            // MODE réinitialise les écrans
  io.logic = new PixelScreen();
  io.gfxActive = true;
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

function targets(it) {
  const io = it.io;
  if (!io.gfxActive) it.err(ERR.GFX_MODE);   // instruction graphique hors MODE = 88
  return io.autoback ? [io.logic, io.physic] : [io.logic];
}

function putAll(tg, x, y, col) {
  for (const s of tg) s.set(x | 0, y | 0, col);
}

function optColor(it) {
  if (!it.eatRaw(",")) return it.buffer.curPen;   // sans ,c : PEN courant
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
  for (;;) {
    putAll(tg, x0, y0, col);
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
  const s = it.toStr(it.evalExpr());
  let col = it.buffer.curPen, cx = g.gx, cy = g.gy;
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
function screenRef(it) {
  const t = it.peek();
  if (t && t.code === T.PHYSIC) { it.next(); return "physic"; }
  if (t && t.code === T.LOGIC) { it.next(); return "logic"; }
  if (t && (t.code === T.BACK || t.code === T.DEFAULT ||
            t.code === T.ENTIER || t.code === T.VARIABLE)) {
    it.err(ERR.NOT_IMPL);                 // banques mémoire : M4
  }
  it.err(ERR.SYNTAX);
}

function doScreenSwap(it) {
  const io = it.io;
  if (!io.physic) it.err(ERR.GFX_MODE);
  const p = io.physic;
  io.physic = io.logic;
  io.logic = p;
  io.asciiCache = null;
}

function doScreenCopy(it) {
  const io = it.io;
  if (!io.physic) it.err(ERR.GFX_MODE);
  let src = "logic", dst = "physic";      // SCREEN COPY seul = logic -> physic
  if (!it.atEos()) {
    src = screenRef(it);
    if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
    dst = screenRef(it);
  }
  const S = src === "physic" ? io.physic : io.logic;
  const D = dst === "physic" ? io.physic : io.logic;
  if (S !== D) D.copyFrom(S);
  io.asciiCache = null;
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
  [T.INC, (it) => doIncDec(it, 1)],
  [T.DEC, (it) => doIncDec(it, -1)],
  [T.MODE, doMode],
  [T.PLOT, doPlot],
  [T.LINE, doLine],
  [T.DRAW, doDraw],
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
  let from = -Infinity;
  let to = Infinity;
  if (!it.atEos()) {
    from = it.toInt(it.evalExpr());
    to = from;
    if (it.eatRaw(",")) to = it.toInt(it.evalExpr());
  }
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

async function doLet(it) {
  const t = it.eat(T.VARIABLE);
  if (!t) it.err(ERR.SYNTAX);
  await it.doAssignWith(t.name);
}

export const EXT_INSTRUCTIONS = new Map([
  [SUB.BOX, doBox],
  [SUB.BAR, doBar],
  [SUB.CIRCLE, doCircle],
  [SUB.ELLIPSE, doEllipse],
  [SUB.PAINT, doPaint],
  [SUB.INPUT, doInput],
  [SUB.LINEINPUT, doLineInput],
  [SUB.DATA, (it) => it.skipStatement()],
  [SUB.END, (it) => { it.running = false; it.pc.ti = it.tokens.length; }],
  [SUB.STOP, (it) => { throw new StosError(ERR.STOP, it.currentLine, it.langue); }],
  [SUB.BREAK, (it) => { throw new StosError(ERR.BREAK, it.currentLine, it.langue); }],
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
  [SUB.NEW, (it) => { it.program.clear(); it.clearVars(); }],
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
  [T.LENGTH, (it) => INT(str1(it).length)],
  [T.PI, () => FLOAT(Math.PI)],
  [T.TIMER, (it) => INT(Math.floor((it.now() - it.t0) / 20))], // compteur 50 Hz
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
  [FSUB.SGN, (it) => INT(Math.sign(num1(it)))],
  [FSUB.INT, (it) => INT(Math.floor(num1(it)))], // INT = plancher, comme BASIC
  [FSUB.DEG, (it) => { it.degMode = true; return INT(1); }],
  [FSUB.RAD, (it) => { it.degMode = false; return INT(0); }],
  [FSUB.ERRN, () => INT(0)],
  [FSUB.ERRL, () => INT(0)],
]);
