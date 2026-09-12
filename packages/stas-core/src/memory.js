/*
 *  STAS — Mémoire émulée
 *  --------------------------------------------------------------------
 *  Les instructions mémoire du STOS travaillent sur des adresses 32 bits.
 *  L'Atari ST n'adresse que 1 à 4 Mo : les bits hauts sont donc libres, et
 *  STAS les utilise comme drapeaux (schéma François Lionet) :
 *
 *     bit 31        30        29        28..25       24..0
 *       0        LOGIC     PHYSIC     BANQUE(n)    ADRESSE
 *
 *  - bit 31 toujours 0 : les adresses restent des entiers STOS positifs ;
 *  - LOGIC / PHYSIC : accès direct à l'écran logique / physique ;
 *  - BANQUE 1..15 : accès à une banque mémoire (RESERVE AS ...) ;
 *  - ni drapeau ni banque : RAM plate de 1 Mo (PEEK(0), matériel...).
 *
 *  Deux modèles d'accès aux ÉCRANS (io.memMode) :
 *    - "compatible" (défaut) : format Atari ST réel — plans entrelacés par
 *      mots de 16 bits (Hardware Spec §3.1), 320x200, 4 plans, 32000 octets,
 *      160 octets par ligne ;
 *    - "native" : un octet par pixel (indice palette), 64000 octets.
 *
 *  Ce module ne lève jamais d'erreur : les contrôles (adresse impaire des
 *  mots/mots longs) sont faits par les instructions, qui connaissent la
 *  ligne courante et la langue.
 *  --------------------------------------------------------------------
 */

import { PixelScreen } from "./pixel-screen.js";

export const MEM_BANK_SHIFT = 25;
export const MEM_BANK_MASK = 0xf;
export const MEM_OFFSET_MASK = (1 << 25) - 1;
export const MEM_LOGIC = 1 << 30;
export const MEM_PHYSIC = 1 << 29;

/** Écran ST 320x200 : 160 octets par ligne (4 plans entrelacés). */
export const SCREEN_ST_BYTES = 160 * 200;
/** Écran "native" STAS : un octet par pixel. */
export const SCREEN_NATIVE_BYTES = 320 * 200;

/** Adresse de base (champ banque) d'une banque n — START(n). */
export function bankBase(n) {
  return ((n & MEM_BANK_MASK) << MEM_BANK_SHIFT) >>> 0;
}

export class Memory {
  constructor(io) {
    this.io = io;
    this.ram = new Uint8Array(0x100000); // 1 Mo de RAM plate (sans banque)
  }

  /** true = format ST à plans entrelacés ; false = un octet par pixel. */
  get compatible() {
    return (this.io.memMode ?? "compatible") !== "native";
  }

  /** Décode une adresse en région {screen|bank|ram, offset}. */
  resolve(addr) {
    addr = addr >>> 0;
    if (addr & MEM_LOGIC) return { screen: "logic", offset: addr & MEM_OFFSET_MASK };
    if (addr & MEM_PHYSIC) return { screen: "physic", offset: addr & MEM_OFFSET_MASK };
    const bank = (addr >>> MEM_BANK_SHIFT) & MEM_BANK_MASK;
    if (bank !== 0) return { bank, offset: addr & MEM_OFFSET_MASK };
    return { ram: true, offset: addr & 0xfffff };
  }

  readByte(addr) {
    const r = this.resolve(addr);
    if (r.screen) return this._screenRead(r.screen, r.offset);
    if (r.bank !== undefined) {
      const b = this.io.banks.get(r.bank);
      return b && r.offset < b.size ? b.data[r.offset] : 0;
    }
    return this.ram[r.offset];
  }

  writeByte(addr, val) {
    val &= 0xff;
    const r = this.resolve(addr);
    if (r.screen) return this._screenWrite(r.screen, r.offset, val);
    if (r.bank !== undefined) {
      const b = this.io.banks.get(r.bank);
      if (b && r.offset < b.size) b.data[r.offset] = val;
      return;
    }
    this.ram[r.offset] = val;
  }

  // -- Écrans ----------------------------------------------------------------
  _screen(which) {
    const io = this.io;
    if (which === "logic") {
      if (!io.logic) io.logic = new PixelScreen();
      return io.logic;
    }
    if (!io.physic) io.physic = new PixelScreen();
    return io.physic;
  }

  _screenRead(which, off) {
    const s = this._screen(which);
    if (!this.compatible) {
      return off < SCREEN_NATIVE_BYTES ? s.colors[off] : 0;
    }
    if (off >= SCREEN_ST_BYTES) return 0;
    const line = (off / 160) | 0;
    const within = off % 160;
    const wordIdx = within >> 1; // 0..79
    const plane = wordIdx % 4;
    const xGroup = ((wordIdx / 4) | 0) % 20;
    const x0 = xGroup * 16;
    // Reconstruit le mot de 16 bits du plan : premier pixel = bit 15.
    let word = 0;
    for (let p = 0; p < 16; p++) {
      const c = s.colors[line * 320 + x0 + p];
      word = (word << 1) | ((c >> plane) & 1);
    }
    return (within & 1) === 0 ? (word >> 8) & 0xff : word & 0xff;
  }

  _screenWrite(which, off, val) {
    const s = this._screen(which);
    if (!this.compatible) {
      if (off < SCREEN_NATIVE_BYTES) {
        s.colors[off] = val & 15;
        s.touched[off] = 1;
        s.version++;
      }
      return;
    }
    if (off >= SCREEN_ST_BYTES) return;
    const line = (off / 160) | 0;
    const within = off % 160;
    const wordIdx = within >> 1;
    const plane = wordIdx % 4;
    const xGroup = ((wordIdx / 4) | 0) % 20;
    const high = (within & 1) === 0; // octet fort du mot : pixels 0..7
    const x0 = xGroup * 16 + (high ? 0 : 8);
    for (let k = 0; k < 8; k++) {
      const i = line * 320 + x0 + k;
      if ((val >> (7 - k)) & 1) s.colors[i] |= 1 << plane;
      else s.colors[i] &= (~(1 << plane)) & 0xff;
      s.touched[i] = 1;
    }
    s.version++;
  }
}
