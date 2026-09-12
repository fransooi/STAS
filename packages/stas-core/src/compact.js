/*
 *  STAS — compacteur/décompacteur d'images (extension PICTURE COMPACTOR)
 *  --------------------------------------------------------------------
 *  Port fidèle de COMPACT.S (c) FL Soft 1987 — la source du compacteur
 *  que François Lionet était fier d'avoir bricolé.
 *
 *  Principe (voir COMPACT.S `compact:` / `decomp:` et son en-tête L36-49) :
 *    - l'image est parcourue dans un ordre bien défini : par plan, par
 *      ligne de carrés, par carré (16 px de large), octet gauche puis
 *      octet droit, puis les `hauteur` pixels vers le bas ;
 *    - la suite d'octets visités est codée en RLE par un simple bit par
 *      octet (« 1 = nouvel octet, 0 = identique au précédent ») ;
 *    - cette table de bits est à son tour codée en RLE de la même façon.
 *    Résultat : [table1 littéraux][table2 littéraux][pointeurs2 bruts].
 *
 *  L'astuce mémoire de l'original (table1 réservée à 32000 octets, la
 *  table de pointeurs qui se recopie par-dessus en avançant) est propre
 *  au 68000 ; ici on garde une sémantique IDENTIQUE mais on assemble les
 *  trois blocs proprement, ce qui donne exactement le même format de
 *  fichier et la même taille de retour.
 *
 *  En-tête (offsets en octets, COMPACT.S L36-49) :
 *    0  code     $06071963 (anniversaire de l'auteur !)
 *    4  mode     0=lowres 1=midres 2=highres
 *    6  dx       début X en mots (groupes de 16 pixels)
 *    8  dy       début Y en pixels
 *   10  tx       largeur en mots
 *   12  ty       hauteur en carrés de compactage
 *   16  tcar     hauteur d'un carré (défaut 5)
 *   18  flags    bit0 = palette à zéro pendant le travail,
 *                bit1 = installer la palette à la fin
 *   20  table2   offset des littéraux de la table de pointeurs
 *   24  point2   offset de la table de pointeurs 2
 *   38  palette  16 mots $RGB gros-boutistes
 *   70  dcomp    début du compactage
 *  --------------------------------------------------------------------
 */

import { MEM_LOGIC, MEM_PHYSIC } from "./memory.js";
import { ERR } from "./errors.js";
import { setPaletteWord } from "./palette.js";
import { bankAddr, screenAddr, screenOperand } from "./screens.js";

const MAGIC = 0x06071963;

/** Table `tmode` de COMPACT.S : line (o/ligne), group (o/16 px), plans, hauteur. */
export const TMODE = [
  { line: 160, group: 8, planes: 4, height: 200 }, // lowres
  { line: 160, group: 4, planes: 2, height: 200 }, // midres
  { line: 80, group: 2, planes: 1, height: 400 },  // highres
];

// --- résolution d'adresses (format mémoire STAS, cf. memory.js) -------------
// `bankAddr`, `screenAddr` et `screenOperand` vivent dans screens.js.

/** Les 16 mots de palette d'un écran (banque : offset 32000 ; sinon la globale). */
export function readScreenPalette(it, base) {
  if (base === MEM_LOGIC || base === MEM_PHYSIC) {
    return it.io.paletteST.map((w) => w & 0xffff);
  }
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    const off = (base + 32000 + i * 2) >>> 0;
    out[i] = ((it.io.mem.readByte(off) << 8) | it.io.mem.readByte((off + 1) >>> 0)) & 0xffff;
  }
  return out;
}

// --- RLE (identique dans les deux sens) -------------------------------------

/**
 * Décode un flux RLE : `count` octets. Les littéraux commencent à `litOff`
 * (l'index 0 étant la valeur initiale) ; les bits de pointeurs sont lus dans
 * `bitBuff` à partir de `bitOff`, poids fort d'abord.
 */
function rleDecode(litBuff, litOff, bitBuff, bitOff, count) {
  const out = new Uint8Array(count);
  let prev = litBuff[litOff] ?? 0;
  let lit = litOff + 1;
  let bi = bitOff;
  let bit = 7;
  for (let i = 0; i < count; i++) {
    if (bit < 0) { bi++; bit = 7; }
    if (((bitBuff[bi] ?? 0) >> bit) & 1) prev = litBuff[lit++] ?? 0;
    out[i] = prev;
    bit--;
  }
  return out;
}

// --- PACK -------------------------------------------------------------------

/**
 * Compacte une région d'écran. `p` = { mode, flags, tcar, dx, dy, tx, ty }.
 * Écrit l'image compactée dans la banque `dstBase` et renvoie sa longueur.
 * Fidèle à COMPACT.S `pack:` / `compact:`.
 */
export function packScreen(it, srcBase, dstBase, p) {
  if (p.mode < 0 || p.mode > 2) it.err(ERR.FON_CALL);
  const tm = TMODE[p.mode];
  const wordsPerLine = tm.line / tm.group;
  if (!p.tcar || !p.tx || !p.ty) it.err(ERR.FON_CALL);
  if (p.dx < 0 || p.dy < 0 || p.tx < 0 || p.ty < 0) it.err(ERR.FON_CALL);
  if (p.dx + p.tx > wordsPerLine) it.err(ERR.FON_CALL);
  if (p.ty * p.tcar + p.dy > tm.height) it.err(ERR.FON_CALL);

  const get = (off) => it.io.mem.readByte((srcBase + off) >>> 0);
  const adycar = tm.line * p.tcar;
  const regionBase = p.dy * tm.line + p.dx * tm.group;

  // 1) RLE des octets de l'image visités dans l'ordre de COMPACT.S
  const literals = [0];
  const ptr1 = [];
  let last = 0;
  let pb = 0;
  let bit = 7;
  const emit = (v) => {
    if (v !== last) { literals.push(v); last = v; pb |= 1 << bit; }
    if (--bit < 0) { ptr1.push(pb); pb = 0; bit = 7; }
  };
  for (let plane = 0; plane < tm.planes; plane++) {
    const a4 = regionBase + plane * 2;
    for (let row = 0; row < p.ty; row++) {
      const a3 = a4 + row * adycar;
      for (let sq = 0; sq < p.tx; sq++) {
        const a2 = a3 + sq * tm.group;
        for (let sub = 0; sub < 2; sub++) {
          for (let k = 0; k < p.tcar; k++) emit(get(a2 + sub + k * tm.line));
        }
      }
    }
  }
  if (bit !== 7) ptr1.push(pb);

  // 2) RLE de la table de pointeurs (mêmes octets, même règle)
  const table2 = [0];
  const ptr2 = [];
  let last2 = 0;
  let qb = 0;
  let qbit = 7;
  for (const v of ptr1) {
    if (v !== last2) { table2.push(v); last2 = v; qb |= 1 << qbit; }
    if (--qbit < 0) { ptr2.push(qb); qb = 0; qbit = 7; }
  }
  if (qbit !== 7) ptr2.push(qb);

  // 3) assemblage du fichier
  const table2Off = 70 + literals.length;
  const point2Off = table2Off + table2.length;
  const total = point2Off + ptr2.length;
  const out = new Uint8Array(total);
  const put16 = (o, v) => { out[o] = (v >> 8) & 0xff; out[o + 1] = v & 0xff; };
  const put32 = (o, v) => {
    out[o] = (v >>> 24) & 0xff; out[o + 1] = (v >>> 16) & 0xff;
    out[o + 2] = (v >>> 8) & 0xff; out[o + 3] = v & 0xff;
  };
  put32(0, MAGIC);
  put16(4, p.mode);
  put16(6, p.dx);
  put16(8, p.dy);
  put16(10, p.tx);
  put16(12, p.ty);
  put16(16, p.tcar);
  put16(18, p.flags);
  put32(20, table2Off);
  put32(24, point2Off);
  const pal = readScreenPalette(it, srcBase);
  for (let i = 0; i < 16; i++) put16(38 + i * 2, pal[i]);
  out.set(literals, 70);
  out.set(table2, table2Off);
  out.set(ptr2, point2Off);

  // 4) écriture dans la banque destination (agrandie si trop petite)
  const n = (dstBase >>> 25) & 0xf;
  const bank = n ? it.io.banks.get(n) : null;
  if (bank && total > bank.size) {
    bank.data = new Uint8Array(total);
    bank.size = total;
  }
  for (let i = 0; i < total; i++) it.io.mem.writeByte((dstBase + i) >>> 0, out[i]);
  return total;
}

// --- UNPACK -----------------------------------------------------------------

/**
 * Décompacte une image dans l'écran `dstBase`. `d` = {flags, dx, dy} (dx est
 * déjà en mots) ; null = prendre l'en-tête. Fidèle à COMPACT.S `decomp:`.
 */
export function unpackScreen(it, srcBase, dstBase, d) {
  const get = (off) => it.io.mem.readByte((srcBase + off) >>> 0);
  const be16 = (o) => ((get(o) << 8) | get(o + 1)) & 0xffff;
  const be32 = (o) =>
    (((get(o) << 24) | (get(o + 1) << 16) | (get(o + 2) << 8) | get(o + 3)) >>> 0);
  if (be32(0) !== MAGIC) it.err(ERR.FON_CALL);          // `erreur2` -> erreur 13
  const mode = be16(4);
  if (mode > 2) it.err(ERR.FON_CALL);
  const tm = TMODE[mode];
  const hflags = be16(18);
  const table2Off = be32(20);
  const point2Off = be32(24);
  const tcar = be16(16);
  const tx = be16(10);
  const ty = be16(12);
  if (!tcar || !tx || !ty) it.err(ERR.FON_CALL);
  const flags = d.flags != null ? (d.flags | 0) : hflags;
  const dx = d.dx != null ? d.dx : be16(6);
  const dy = d.dy != null ? d.dy : be16(8);
  if ((dx + tx) * tm.group > tm.line) it.err(ERR.FON_CALL);
  if (ty * tcar + dy > tm.height) it.err(ERR.FON_CALL);

  // flags bit0 : toutes les couleurs à zéro pendant le travail (palnul)
  if (flags & 1) {
    for (let i = 0; i < 16; i++) setPaletteWord(it.io, i, 0);
  }

  const totalEmits = tm.planes * ty * tx * 2 * tcar;
  const ptrCount = Math.ceil(totalEmits / 8);
  const fileLen = point2Off + Math.ceil(ptrCount / 8);
  const file = new Uint8Array(fileLen);
  for (let i = 0; i < fileLen; i++) file[i] = get(i);

  // 1) reconstruit la table de pointeurs 1, puis 2) l'image
  const ptr1 = rleDecode(file, table2Off, file, point2Off, ptrCount);
  const bytes = rleDecode(file, 70, ptr1, 0, totalEmits);

  // 3) écriture dans l'écran de destination
  const regionBase = dy * tm.line + dx * tm.group;
  const adycar = tm.line * tcar;
  let n = 0;
  for (let plane = 0; plane < tm.planes; plane++) {
    const a4 = regionBase + plane * 2;
    for (let row = 0; row < ty; row++) {
      const a3 = a4 + row * adycar;
      for (let sq = 0; sq < tx; sq++) {
        const a2 = a3 + sq * tm.group;
        for (let sub = 0; sub < 2; sub++) {
          for (let k = 0; k < tcar; k++) {
            it.io.mem.writeByte((dstBase + (a2 + sub + k * tm.line)) >>> 0, bytes[n++]);
          }
        }
      }
    }
  }

  // 4) palette : dans l'écran de destination, et à l'écran si flags bit1
  if (dstBase !== MEM_LOGIC && dstBase !== MEM_PHYSIC) {
    for (let i = 0; i < 16; i++) {
      const off = (dstBase + 32000 + i * 2) >>> 0;
      const w = be16(38 + i * 2);
      it.io.mem.writeByte(off, (w >> 8) & 0xff);
      it.io.mem.writeByte((off + 1) >>> 0, w & 0xff);
    }
  }
  if (flags & 2) {
    for (let i = 0; i < 16; i++) setPaletteWord(it.io, i, be16(38 + i * 2));
  }
  return 0;
}
