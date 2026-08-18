/*
 *  STAS web — renderer pixel (« Atari natif »), le plus simple.
 *  --------------------------------------------------------------------
 *  Couche gfx qui copie le plan PHYSIC (320x200) pixel par pixel dans un
 *  canvas front superposé au plan texte, avec mise à l'échelle. C'est la
 *  reproduction la plus fidèle de l'affichage STOS sur Atari ST :
 *    - #screen (fond) : le plan TEXTE (AsciiBuffer), papier réel inclus,
 *      peint en VT323 par CanvasRenderer en mode textOnly ;
 *    - canvas fixed (front) : les pixels du PHYSIC, à l'échelle.
 *
 *  Transparence : pas de couleur-clé / faux-noir ici. On utilise le
 *  drapeau `touched` du PixelScreen, qui est un vrai alpha par pixel :
 *    - pixel dessiné (touched=1) -> opaque, couleur palette exacte ;
 *    - pixel jamais dessiné (touched=0) -> alpha 0, le texte/papier du
 *      dessous transparaît. Aucun slot de palette n'est consommé et un
 *      pixel noir tracé reste opaque (aucune ambiguïté).
 *
 *  Mise à l'échelle : on écrit les 320x200 pixels dans un canvas offscreen
 *  à la résolution native, puis drawImage() vers le canvas front avec
 *  imageSmoothingEnabled=false (+ CSS image-rendering:pixelated) -> zoom
 *  au plus proche voisin, net et rapide.
 */

import { STOS_PALETTE } from "@stas/core";
import { CanvasRenderer } from "./canvas-renderer.js";

export class PixelRenderer {
  constructor(stas, canvas, opts = {}) {
    this.stas = stas;
    this.canvas = canvas;
    // plan texte (fond) : routine historique, texte seul, papier réel
    // (pas de forcePaper : on veut la reproduction fidèle STOS), sans son
    // timer curseur (le blink est géré ici et ne repeint QUE le texte).
    this.text = new CanvasRenderer(stas, canvas, {
      ...opts,
      textOnly: true,
      cursorTimer: false,
    });
    // plan gfx (front) : canvas séparé, superposé au texte.
    this.gfx = document.createElement("canvas");
    this.gfx.style.cssText =
      "position:fixed;pointer-events:none;image-rendering:pixelated;";
    document.body.appendChild(this.gfx);
    this.gctx = this.gfx.getContext("2d");
    // canvas offscreen à la résolution native du PHYSIC.
    this._px = document.createElement("canvas");
    this._pxc = this._px.getContext("2d");
    this._pxW = 0;
    this._pxH = 0;
    this._img = null;

    this._lastVersion = -1;
    this._syncOverlay();
    window.addEventListener("resize", () => this._syncOverlay());

    setInterval(() => {
      this.text._cursorOn = !this.text._cursorOn;
      this.text.render(true);
    }, 500);
  }

  /** Même contrat que CanvasRenderer : appelé sur MODE / onScreen. */
  setSize() {
    this.text.setSize();
    // le front couvre exactement #screen (même taille interne) ;
    // redimensionner un canvas reset son contexte -> re-configurer.
    this.gfx.width = this.canvas.width;
    this.gfx.height = this.canvas.height;
    this.gctx.imageSmoothingEnabled = false;
    this._syncOverlay();
  }

  /** Aligne le canvas front sur #screen (centré flex + max-width CSS). */
  _syncOverlay() {
    const r = this.canvas.getBoundingClientRect();
    const s = this.gfx.style;
    s.left = r.left + "px";
    s.top = r.top + "px";
    s.width = r.width + "px";
    s.height = r.height + "px";
  }

  render(force = false) {
    const ver = this.stas.sceneVersion;
    if (!force && ver === this._lastVersion) return;
    this._lastVersion = ver;

    this.text.render(true); // texte d'abord (fond)

    const p = this.stas.physic;
    if (p && this.stas.io.gfxActive) {
      this._ensurePx(p);
      this._pxc.putImageData(this._fill(p), 0, 0);
      this.gctx.clearRect(0, 0, this.gfx.width, this.gfx.height);
      // zoom au plus proche voisin du 320x200 natif vers le front.
      this.gctx.drawImage(this._px, 0, 0, this.gfx.width, this.gfx.height);
    } else {
      this.gctx.clearRect(0, 0, this.gfx.width, this.gfx.height);
    }
  }

  /** (Re)crée le canvas/ImageData offscreen si la résolution change. */
  _ensurePx(p) {
    if (this._pxW === p.width && this._pxH === p.height) return;
    this._pxW = p.width;
    this._pxH = p.height;
    this._px.width = p.width;
    this._px.height = p.height;
    this._img = this._pxc.createImageData(p.width, p.height);
  }

  /**
   * Remplit l'ImageData depuis le PHYSIC : couleur palette pour chaque
   * pixel dessiné (touched=1, alpha 255), alpha 0 sinon -> transparent,
   * le plan texte transparaît. Retourne l'ImageData.
   */
  _fill(p) {
    const img = this._img;
    const d = img.data;
    const col = p.colors;
    const tch = p.touched;
    for (let i = 0, n = col.length; i < n; i++) {
      const o = i * 4;
      if (tch[i]) {
        const pal = STOS_PALETTE[col[i] & 15];
        d[o] = pal[0];
        d[o + 1] = pal[1];
        d[o + 2] = pal[2];
        d[o + 3] = 255; // opaque
      } else {
        d[o + 3] = 0; // jamais dessiné -> transparent
      }
    }
    return img;
  }
}
