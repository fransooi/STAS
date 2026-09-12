/*
 *  STAS — écrans : opérandes, lecture planaire et APPEAR
 *  --------------------------------------------------------------------
 *  Un « écran » STOS peut être LOGIC, PHYSIC, une banque mémoire
 *  (RESERVE AS SCREEN n) ou une adresse d'écran. Ce module résout ces
 *  opérandes et fournit un accès pixel/octet planaire, partagé par
 *  APPEAR (SPRITES.S `appear:`) et le compacteur (COMPACT.S).
 *
 *  Rappel du format d'une banque écran STOS : 32000 octets de bitmap ST
 *  (lowres 320x200, 4 plans entrelacés par mots de 16 bits, 160 o/ligne)
 *  suivis de la palette : 16 mots gros-boutistes à l'offset 32000.
 *  --------------------------------------------------------------------
 */

import { MEM_LOGIC, MEM_PHYSIC } from "./memory.js";
import { T } from "./tokens.js";
import { ERR } from "./errors.js";

/** Résout un opérande écran en { kind: "logic"|"physic"|"bank", n }. */
export function resolveScreen(it) {
  const t = it.peek();
  if (t && t.code === T.PHYSIC) { it.next(); return { kind: "physic" }; }
  if (t && t.code === T.LOGIC) { it.next(); return { kind: "logic" }; }
  if (t && (t.code === T.BACK || t.code === T.DEFAULT)) it.err(ERR.NOT_IMPL);
  const v = it.toInt(it.evalExpr()) >>> 0;
  if (v < 16) {
    const b = it.io.banks.get(v);
    if (!b) it.err(ERR.BANK_NOT_RES);                      // 44
    if (b.kind !== "screen" && b.kind !== "datascreen") it.err(ERR.BANK_NOT_SCR);
    return { kind: "bank", n: v };
  }
  if (v & MEM_LOGIC) return { kind: "logic" };
  if (v & MEM_PHYSIC) return { kind: "physic" };
  it.err(ERR.BAD_SCR_ADDR);                                // 43
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

/**
 * Lecteur pixel d'un écran lowres 320x200 : (index) -> couleur 0..15.
 * Une banque est lue dans son bitmap planaire ST ; LOGIC/PHYSIC dans le
 * PixelScreen vivant.
 */
export function pixelReader(it, ref) {
  if (ref.kind === "logic" || ref.kind === "physic") {
    const s = ref.kind === "logic" ? it.io.logic : it.io.physic;
    if (!s) it.err(ERR.GFX_MODE);
    return (i) => s.colors[i];
  }
  const data = it.io.banks.get(ref.n).data;
  return (i) => {
    const x = i % 320;
    const y = (i / 320) | 0;
    // position dans le groupe de 16 pixels, octet fort/faible, puis les 4 plans
    const base = y * 160 + ((x >> 4) << 3) + ((x & 8) ? 1 : 0);
    const bit = 7 - (x & 7);
    let c = 0;
    for (let p = 0; p < 4; p++) {
      if (((data[base + p * 2] ?? 0) >> bit) & 1) c |= 1 << p;
    }
    return c;
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
  const ref = resolveScreen(it);
  let effect;
  if (it.eatRaw(",")) {
    effect = it.toInt(it.evalExpr());
  } else {
    effect = 1 + Math.floor(it.rnd() * 71);   // 1..71 (SPRITES.S : rnd 0..71, 0 rejeté)
  }
  if (effect < 1 || effect > 80) it.err(ERR.FON_CALL);
  const dst = it.io.physic;
  if (!dst) it.err(ERR.GFX_MODE);
  const read = pixelReader(it, ref);
  const stride = TAPPEAR[effect - 1];
  const total = dst.width * dst.height;
  const animated = !!(it.io.tick || it.io.sleep);
  // Avec un rendu réel : ~30 tranches (effet visible). En headless, quelques
  // tranches suffisent et évitent 30 setTimeout inutiles.
  const frames = animated ? APPEAR_FRAMES : 4;
  const chunk = Math.max(1, Math.ceil(total / frames));
  let point = 0;
  let counter = 0;
  for (;;) {
    dst.set(point % dst.width, (point / dst.width) | 0, read(point));
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
  it.io.asciiCache = null;
  await it.tick();
}
