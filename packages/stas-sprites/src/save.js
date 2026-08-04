/*
 *  STAS sprites — sauvegarde & export.
 *  --------------------------------------------------------------------
 *  - JSON  : format natif "banque" (.stasprite) — tous les sprites +
 *            l'animation + la palette + la police, en UN seul fichier.
 *            Round-trip complet (couleurs fg/bg PAR CELLULE conservées).
 *  - TXT   : les caractères seuls (une ligne par rangée).
 *  - ANSI  : rendu 24 bits pour terminal, couleurs via la palette.
 *
 *  La page web fait le download (Blob) ; la console écrit au fs. Ce module
 *  reste agnostique : il PRODUIT le contenu, l'adaptateur l'écrit.
 *  --------------------------------------------------------------------
 */

import { SpriteBank, BANK_MAGIC } from "./bank.js";
import { SPRITE_PALETTE } from "./sprite.js";

const ESC = "\x1b[";
const rgb = (c) => `${c[0]};${c[1]};${c[2]}`;

/** Texte brut : une rangée par ligne, sans les espaces de fin. */
export function toText(sprite) {
  let out = "";
  for (let y = 0; y < sprite.h; y++) {
    let line = "";
    for (let x = 0; x < sprite.w; x++) {
      line += sprite.cells[sprite.idx(x, y)].ch;
    }
    out += line.replace(/\s+$/, "") + "\n";
  }
  return out;
}

/**
 * Rendu ANSI 24 bits d'un sprite, couleurs tirées de `palette`.
 * Chaque cellule garde SA propre encre/papier.
 */
export function toAnsi(sprite, palette = SPRITE_PALETTE) {
  let out = "";
  for (let y = 0; y < sprite.h; y++) {
    let line = "";
    let fg = -1, bg = -1;
    for (let x = 0; x < sprite.w; x++) {
      const c = sprite.cells[sprite.idx(x, y)];
      if (c.fg !== fg) { line += `${ESC}38;2;${rgb(palette[c.fg & 15])}m`; fg = c.fg; }
      if (c.bg !== bg) { line += `${ESC}48;2;${rgb(palette[c.bg & 15])}m`; bg = c.bg; }
      line += c.ch === " " ? " " : c.ch;
    }
    out += line + `${ESC}0m\n`;
  }
  return out;
}

/** Tous les sprites d'une banque en ANSI, séparés par leur nom. */
export function bankToAnsi(bank) {
  return bank.sprites
    .map((s) => `${ESC}1m--- ${s.name || "sprite"} (${s.w}x${s.h}) ---${ESC}0m\n` + toAnsi(s, bank.palette))
    .join("\n");
}

/**
 * Prépare un export {name, mime, text} pour une banque.
 * @param {"json"|"txt"|"ansi"} kind
 */
export function makeExport(bank, kind, baseName) {
  const base = baseName || bank.sprites[0]?.name || "sprites";
  const safe = base.replace(/[^\w.-]+/g, "_") || "sprites";
  switch (kind) {
    case "txt":
      return {
        name: safe + ".txt",
        mime: "text/plain; charset=utf-8",
        text: bank.sprites.map(toText).join("\n"),
      };
    case "ansi":
      return {
        name: safe + ".ans",
        mime: "text/plain; charset=utf-8",
        text: bankToAnsi(bank),
      };
    case "json":
    default:
      return {
        name: safe + ".stasprite",
        mime: "application/json; charset=utf-8",
        text: bank.serialize(true),
      };
  }
}

/** Valide rapidement un fichier chargé (drag-and-drop / fs). */
export function isBankJSON(text) {
  try {
    const o = JSON.parse(text);
    return o && o.magic === BANK_MAGIC;
  } catch {
    return false;
  }
}

/** Charge une banque depuis du texte JSON. */
export function loadBank(text) {
  return SpriteBank.parse(text);
}
