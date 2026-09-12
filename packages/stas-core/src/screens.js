/*
 *  STAS — écrans : opérandes, accès pixel et effets (APPEAR / ZOOM / REDUCE…)
 *  --------------------------------------------------------------------
 *  Un « écran » STOS peut être LOGIC, PHYSIC, une banque mémoire
 *  (RESERVE AS SCREEN n) ou une adresse d'écran. Ce module résout ces
 *  opérandes et fournit une VUE PIXEL unifiée, partagée par APPEAR
 *  (SPRITES.S `appear:`), ZOOM/REDUCE (SPRITES.S `zoom:`/`reduce:`) et
 *  SCREEN COPY (BASIC.S `scrcopy:`).
 *
 *  Rappel du format d'une banque écran STOS : 32000 octets de bitmap ST
 *  (lowres 320x200, 4 plans entrelacés par mots de 16 bits, 160 o/ligne)
 *  suivis de la palette : 16 mots gros-boutistes à l'offset 32000.
 *  --------------------------------------------------------------------
 */

import { MEM_LOGIC, MEM_PHYSIC, bankBase } from "./memory.js";
import { T } from "./tokens.js";
import { ERR } from "./errors.js";

export const PIXEL_W = 320;
export const PIXEL_H = 200;

// --- résolution d'adresses --------------------------------------------------

/** Adresse d'une banque (n'importe quel type) ou d'une adresse brute. */
export function bankAddr(it, v) {
  if (v < 0) it.err(ERR.FON_CALL);
  if (v < 16) {
    if (!it.io.banks.has(v)) it.err(ERR.BANK_NOT_RES);   // 44
    return bankBase(v);
  }
  return v >>> 0;
}

/** Même chose pour un écran : la banque doit être SCREEN/DATASCREEN. */
export function screenAddr(it, v) {
  if (v < 0) it.err(ERR.FON_CALL);
  if (v < 16) {
    const b = it.io.banks.get(v);
    if (!b) it.err(ERR.BANK_NOT_RES);
    if (b.kind !== "screen" && b.kind !== "datascreen") it.err(ERR.BANK_NOT_SCR);
    return bankBase(v);
  }
  return v >>> 0;
}

/** Résout un opérande écran en adresse (LOGIC/PHYSIC, banque ou adresse). */
export function screenOperand(it) {
  const t = it.peek();
  if (t && t.code === T.PHYSIC) { it.next(); return MEM_PHYSIC; }
  if (t && t.code === T.LOGIC) { it.next(); return MEM_LOGIC; }
  if (t && (t.code === T.BACK || t.code === T.DEFAULT)) it.err(ERR.NOT_IMPL);
  return screenAddr(it, it.toInt(it.evalExpr()));
}

/** Les 16 mots de palette d'une banque écran (offset 32000, gros-boutistes). */
export function bankPalette(it, n) {
  const b = it.io.banks.get(n);
  if (!b) it.err(ERR.BANK_NOT_RES);
  if (b.kind !== "screen" && b.kind !== "datascreen") it.err(ERR.BANK_NOT_SCR);
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    const off = 32000 + i * 2;
    out[i] = (((b.data[off] ?? 0) << 8) | (b.data[off + 1] ?? 0)) & 0xffff;
  }
  return out;
}

// --- vue pixel (écran vivant ou banque planaire) ----------------------------

// Un écran lowres : octet de poids fort du groupe de 16 pixels en premier.
function bankPixelOff(x, y) {
  return y * 160 + ((x >> 4) << 3) + ((x & 8) ? 1 : 0);
}

function readBankPixel(data, x, y) {
  const base = bankPixelOff(x, y);
  const bit = 7 - (x & 7);
  let c = 0;
  for (let p = 0; p < 4; p++) {
    if (((data[base + p * 2] ?? 0) >> bit) & 1) c |= 1 << p;
  }
  return c;
}

function writeBankPixel(data, x, y, c) {
  const base = bankPixelOff(x, y);
  const bit = 7 - (x & 7);
  for (let p = 0; p < 4; p++) {
    const off = base + p * 2;
    if ((c >> p) & 1) data[off] = (data[off] ?? 0) | (1 << bit);
    else data[off] = (data[off] ?? 0) & ~(1 << bit) & 0xff;
  }
}

/**
 * Vue pixel d'un écran : get(x,y) -> couleur 0..15, touched(x,y) -> 0|1,
 * set(x,y,color,touched), bump() (invalide le rendu ; no-op sur une banque).
 */
export function pixelView(it, base) {
  if (base === MEM_LOGIC || base === MEM_PHYSIC) {
    const s = base === MEM_LOGIC ? it.io.logic : it.io.physic;
    if (!s) it.err(ERR.GFX_MODE);
    return {
      get: (x, y) => s.colors[y * PIXEL_W + x],
      touched: (x, y) => s.touched[y * PIXEL_W + x],
      set: (x, y, c, t) => {
        const i = y * PIXEL_W + x;
        s.colors[i] = c & 15;
        s.touched[i] = t ? 1 : 0;
      },
      bump: () => { s.version++; },
    };
  }
  const b = it.io.banks.get((base >>> 25) & 0xf);
  if (!b) it.err(ERR.BANK_NOT_RES);
  const data = b.data;
  return {
    get: (x, y) => readBankPixel(data, x, y),
    touched: () => 1,                     // une banque est une image opaque
    set: (x, y, c) => writeBankPixel(data, x, y, c),
    bump: () => {},
  };
}

// ---------------------------------------------------------------------------
//  APPEAR — révélation d'un écran par pas copremier (SPRITES.S `appear:`)
//  La table `tappear` (SPRITES.S L185-194) donne, par effet 1..80, un pas
//  premier avec le nombre de points : la suite 0, pas, 2·pas… (modulo)
//  visite alors TOUS les pixels. Les 8 derniers pas sont PAIRS : la suite
//  s'arrête en avance, d'où l'image « légèrement différente ».
// ---------------------------------------------------------------------------

export const TAPPEAR = [
  22223, 11, 89, 101, 121, 131, 159, 69,
  13, 77, 103, 119, 133, 161, 43, 53,
  67, 107, 127, 137, 163, 119, 41, 47,
  117, 129, 139, 3001, 16001, 1777, 3889, 30013,
  12003, 281, 12587, 31111, 20007, 2001, 3557, 20009,
  20001, 3559, 12569, 99, 3269, 30001, 16001, 33,
  97, 32001, 9999, 777, 7777, 9997, 17777, 22777,
  26777, 29057, 3023, 30099, 27777, 30057, 447, 657,
  30097, 30091, 30059, 327, 31857, 1487, 1489, 1491,
  2, 4, 6, 14, 18, 22, 122, 118,
];

/** Nombre de tranches de rendu : l'original révèle pendant le balayage. */
const APPEAR_FRAMES = 30;

/** APPEAR écran[,effet] — révèle l'écran source sur le PHYSIC. */
export async function doAppear(it) {
  const srcBase = screenOperand(it);
  let effect;
  if (it.eatRaw(",")) {
    effect = it.toInt(it.evalExpr());
  } else {
    effect = 1 + Math.floor(it.rnd() * 71);   // 1..71 (SPRITES.S : rnd 0..71, 0 rejeté)
  }
  if (effect < 1 || effect > 80) it.err(ERR.FON_CALL);
  const dstBase = MEM_PHYSIC;
  if (!it.io.physic) it.err(ERR.GFX_MODE);
  const src = pixelView(it, srcBase);
  const dst = pixelView(it, dstBase);
  const stride = TAPPEAR[effect - 1];
  const total = PIXEL_W * PIXEL_H;
  const animated = !!(it.io.tick || it.io.sleep);
  // Avec un rendu réel : ~30 tranches (effet visible). En headless, quelques
  // tranches suffisent et évitent 30 setTimeout inutiles.
  const frames = animated ? APPEAR_FRAMES : 4;
  const chunk = Math.max(1, Math.ceil(total / frames));
  let point = 0;
  let counter = 0;
  for (;;) {
    const x = point % PIXEL_W;
    const y = (point / PIXEL_W) | 0;
    dst.set(x, y, src.get(x, y), src.touched(x, y));
    if (++counter >= chunk) {
      counter = 0;
      if (animated) await it.sleep(16);   // ~1 trame : le rendu suit
      else await it.tick();
    }
    point += stride;
    if (point < total) continue;
    if (point === total) break;           // tout est révélé (pas copremier)
    point -= total;
  }
  dst.bump();
  it.io.asciiCache = null;
  await it.tick();
}
