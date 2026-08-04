/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  PixelScreen — le vrai plan graphique de l'Atari ST : 320x200, 16
 *  couleurs (lowres). Deux instances vivent dans la machine : PHYSIC
 *  (affiché) et LOGIC (dessin courant), échangées par SCREEN SWAP.
 *
 *  Chaque pixel garde sa couleur (4 bits) ET un drapeau "touched" :
 *  un pixel jamais dessiné est TRANSPARENT à la composition, ce qui
 *  laisse voir le plan texte en dessous (le papier vient du plan texte,
 *  comme fond de scène). CLS remet touched à zéro sans effacer les
 *  couleurs (fidèle au PEEK futur : l'écran ST contient bien le papier).
 *  --------------------------------------------------------------------
 */

export const SCREEN_W = 320;
export const SCREEN_H = 200;

export class PixelScreen {
  constructor(width = SCREEN_W, height = SCREEN_H) {
    this.width = width;
    this.height = height;
    this.colors = new Uint8Array(width * height);   // indice palette 0..15
    this.touched = new Uint8Array(width * height);  // 1 = pixel dessiné (opaque)
    this.gx = 0;                                    // curseur graphique (XGRAPHIC)
    this.gy = 0;
    this.version = 0;                               // dirty tracking (renderer)
  }

  /** Couleur du pixel, ou -1 hors écran. */
  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    return this.colors[y * this.width + x];
  }

  isTouched(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.touched[y * this.width + x];
  }

  /** PLOT interne : couleur + opaque. */
  set(x, y, col) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = y * this.width + x;
    this.colors[i] = col & 15;
    this.touched[i] = 1;
    this.version++;
  }

  /**
   * CLS / init : remplit les couleurs avec `color` (le PAPER courant) et
   * rend tout transparent — le plan texte redevient visible.
   */
  clear(color = 0) {
    this.colors.fill(color & 15);
    this.touched.fill(0);
    this.gx = 0;
    this.gy = 0;
    this.version++;
  }

  /** SCREEN COPY : duplication pixels + drapeaux + curseur. */
  copyFrom(src) {
    this.colors.set(src.colors);
    this.touched.set(src.touched);
    this.gx = src.gx;
    this.gy = src.gy;
    this.version++;
  }
}
