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
import { bankBase } from "./memory.js";

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

function targets(it) {
  const io = it.io;
  if (!io.gfxActive) it.err(ERR.GFX_MODE);   // instruction graphique hors MODE = 88
  return io.autoback ? [io.logic, io.physic] : [io.logic];
}

/** Encre de tracé courante : INK si donnée, sinon PEN (toute la scène). */
function inkColor(it) {
  return it.io.gfx ? it.io.gfx.curPen
    : it.io.ink != null ? it.io.ink : it.buffer.curPen;
}

function putAll(tg, x, y, col) {
  for (const s of tg) s.set(x | 0, y | 0, col);
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
  [T.POKE, doPoke],
  [T.DOKE, doDoke],
  [T.LOKE, doLoke],
  [T.INC, (it) => doIncDec(it, 1)],
  [T.DEC, (it) => doIncDec(it, -1)],
  [T.MODE, doMode],
  [T.PLOT, doPlot],
  [T.LINE, doLine],
  [T.DRAW, doDraw],
  [T.SWAP, doSwap],
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
  [SUB.WINDOPEN, doWindOpen],
  [SUB.WINDOW, doWindow],
  [SUB.QWINDOW, doQWindow],
  [SUB.WINDMOV, doWindMov],
  [SUB.WINDEL, doWindEl],
  [SUB.TITLE, doTitle],
  [SUB.BORDER, doBorder],
  [SUB.CLW, doClw],
  [SUB.SCROLLDN, (it) => it.io.windows.scroll(1, it)],
  [SUB.SCROLLUP, (it) => it.io.windows.scroll(-1, it)],
  [SUB.SCROLL, (it) => { it.eat(T.ON) || it.eat(T.OFF); }],
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
  [FSUB.ERRN, (it) => INT(it.errn)],
  [FSUB.ERRL, (it) => INT(it.errl)],
  [FSUB.VARPTR, funcVarptr],
  [FSUB.ACCNB, () => INT(0)],
  [FSUB.WINDON, (it) => INT(it.io.windows.current())],
  [FSUB.XCURS, (it) => INT(it.buffer.cx)],
  [FSUB.YCURS, (it) => INT(it.buffer.cy)],
]);
