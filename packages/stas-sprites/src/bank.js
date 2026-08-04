/*
 *  STAS sprites — la banque de sprites + animation.
 *  --------------------------------------------------------------------
 *  Équivalent ASCII de la banque mémoire STOS (S$(0..255) + TX/TY/HX/HY
 *  + PAL(16)), SANS les banques binaires : une simple liste de sprites
 *  partageant UNE palette (comme le PAL(16) unique de l'original) et une
 *  police de rendu par défaut. Le bloc animation décrit l'ordre et la
 *  vitesse de lecture des sprites — sérialisé dans le MÊME fichier.
 *  --------------------------------------------------------------------
 */

import { Sprite, SPRITE_PALETTE } from "./sprite.js";

export const BANK_MAGIC = "STAS-SPRITES";
export const BANK_VERSION = 1;

export class SpriteBank {
  constructor(opts = {}) {
    this.sprites = [];
    this.palette = (opts.palette ?? SPRITE_PALETTE).map((c) => c.slice());
    this.font = opts.font ?? "vt323";
    this.animation = opts.animation ?? { loop: true, frames: [] };
  }

  /** Ajoute un sprite existant, retourne son indice. */
  add(sprite) {
    sprite.palette = this.palette;
    this.sprites.push(sprite);
    return this.sprites.length - 1;
  }

  /** Crée un sprite vide et l'ajoute, retourne son indice. */
  newSprite(w = 32, h = 32, name) {
    const s = new Sprite(w, h, {
      name: name ?? `Sprite ${this.sprites.length}`,
      font: this.font,
      palette: this.palette,
    });
    return this.add(s);
  }

  remove(i) {
    if (i >= 0 && i < this.sprites.length) this.sprites.splice(i, 1);
  }

  get(i) {
    return this.sprites[i] ?? null;
  }

  get count() {
    return this.sprites.length;
  }

  /**
   * Construit une animation par défaut : tous les sprites dans l'ordre,
   * délai uniforme. Ne remplace une animation existante que si vide.
   */
  ensureAnimation(delay = 10) {
    if (!this.animation || !Array.isArray(this.animation.frames) ||
        this.animation.frames.length === 0) {
      this.animation = {
        loop: true,
        frames: this.sprites.map((_, i) => ({ sprite: i, delay })),
      };
    }
    return this.animation;
  }

  toJSON() {
    return {
      magic: BANK_MAGIC,
      version: BANK_VERSION,
      font: this.font,
      palette: this.palette,
      sprites: this.sprites.map((s) => s.toJSON()),
      animation: this.animation,
    };
  }

  serialize(pretty = true) {
    return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0);
  }

  /** Remplit la banque depuis un objet JSON déjà parsé. */
  restoreObject(o) {
    if (!o || o.magic !== BANK_MAGIC) {
      throw new Error("Format de banque invalide (magic absent ou inconnu)");
    }
    this.font = o.font ?? this.font;
    if (Array.isArray(o.palette) && o.palette.length === 16) {
      this.palette = o.palette.map((c) => c.slice());
    }
    this.sprites = (o.sprites ?? []).map((s) => {
      const sp = Sprite.fromJSON(s);
      sp.palette = this.palette;
      return sp;
    });
    this.animation = o.animation ?? { loop: true, frames: [] };
    return this;
  }

  /** Remplace le contenu en place (même référence) depuis une chaîne JSON. */
  restore(json) {
    return this.restoreObject(JSON.parse(json));
  }

  static parse(json) {
    return new SpriteBank().restoreObject(JSON.parse(json));
  }
}
