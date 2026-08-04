/*
 *  STAS web — renderer aalib.js (EXPÉRIMENT / BENCHMARK)
 *  --------------------------------------------------------------------
 *  Couche gfx alternative, activée par ?renderer=aalib. Le chemin par
 *  défaut reste le renderer historique (ascii-converter QUAD_GLYPH +
 *  CanvasRenderer), conservé tel quel en fallback.
 *
 *  Deux canvas superposés, comme demandé :
 *    - #screen (fond) : le plan TEXTE, sorti du buffer texte (AsciiBuffer)
 *      et peint en VT323 par CanvasRenderer en mode textOnly — jamais
 *      par aalib ; affiché en premier ;
 *    - canvas fixed (front) : le plan GRAPHIQUE 320x200 (PHYSIC) converti
 *      en ASCII art par aalib.js (clone C:\STOS\aalib.js, bundle UMD
 *      vendé dans ./vendor/aalib.js).
 *
 *  Transparence du plan gfx : un pixel jamais dessiné OU noir (couleur 0
 *  mise à part : c'est le noir=15 ici, mais même effet) est fourni noir ;
 *  l'intensité 0 -> ASCII_CHARSET[0] = espace -> fillText(" ") ne peint
 *  rien -> le canvas front reste transparent là où rien n'est dessiné et
 *  le texte transparaît. (Le futur renderer "Atari" pixels+zoom réutilisera
 *  ce même canvas front avec chroma-key couleur 0.)
 *
 *  Pipeline aalib, sans filtre RxJS, + une étape "contraste" maison :
 *    read.imageData(RGBA) -> aa(colored) -> boost -> render.canvas(front)
 *  où boost remplace, par cellule :
 *    - la couleur moyenne (délavée) par la couleur DOMINANTE des pixels
 *      dessinés = couleur palette exacte (rouge reste rouge) ;
 *    - l'intensité par la luminance des seuls pixels dessinés (gamma 0.45),
 *      INVERSÉE : aalib mesure la « blancheur » de ses glyphes (calculés
 *      fond blanc / glyphe noir), donc 0 = glyphe dense (@) et 255 =
 *      espace. Pixel dessiné clair -> mono bas -> glyphe dense ; cellule
 *      non dessinée -> mono 255 -> espace -> transparent.
 *
 *  Mesures (performance.now) : overlay en haut à droite + moyenne console
 *  toutes les ~30 frames (texte / read / aa+boost+render).
 *
 *  Résolution découplée : la grille ascii gfx suit normalement la grille
 *  du buffer texte, mais opts.gfx (?gfx= dans main.js) la fixe
 *  indépendamment — charWidth/lineHeight flottants, aalib digère toute
 *  grille. Le plan texte, lui, reste à la résolution du buffer.
 */

import { STOS_PALETTE } from "@stas/core";
import { CanvasRenderer } from "./canvas-renderer.js";

export class AalibRenderer {
  constructor(stas, canvas, opts = {}) {
    this.stas = stas;
    this.canvas = canvas;
    // Grille ascii gfx découplée (?gfx=) : null = suit la grille texte.
    this._gfxRes = opts.gfx ?? null;
    // plan texte (fond) : routine historique, texte seul, sans son timer
    // curseur (le blink est géré ici, et ne repeint QUE le texte).
    this.text = new CanvasRenderer(stas, canvas, {
      ...opts,
      textOnly: true,
      cursorTimer: false,
      forcePaper: 15, // fond noir : le papier texte ne teint pas la scène
    });
    // plan gfx (front) : canvas séparé, superposé au texte.
    this.gfx = document.createElement("canvas");
    this.gfx.style.cssText =
      "position:fixed;pointer-events:none;image-rendering:pixelated;";
    document.body.appendChild(this.gfx);
    this._syncOverlay();
    window.addEventListener("resize", () => this._syncOverlay());

    this._grid = "";
    this._lastVersion = -1;
    this._stats = { n: 0, acc: 0 };
    this._overlay = makeOverlay();

    setInterval(() => {
      this.text._cursorOn = !this.text._cursorOn;
      this.text.render(true);
    }, 500);
  }

  /** Même contrat que CanvasRenderer : appelé sur MODE / onScreen. */
  setSize() {
    this.text.setSize();
    this._grid = ""; // pipeline aalib reconstruite au prochain render
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

    const t0 = performance.now();
    this.text.render(true); // texte d'abord (fond)
    const tText = performance.now() - t0;

    let read = 0;
    let aams = 0;
    const p = this.stas.physic;
    if (p && this.stas.io.gfxActive && globalThis.aalib) {
      this._ensureGrid();
      const t1 = performance.now();
      const data = this._fillStats(p, this._cols, this._rows);
      const t2 = performance.now();
      globalThis.aalib.read.imageData
        .fromImageData({ width: p.width, height: p.height, data })
        .map(this._aa)
        .map((img) => this._boost(img)) // arrow : RxJS appelle le projector sans this
        .map(this._draw)
        .subscribe(); // synchrone -> le canvas front est peint
      const t3 = performance.now();
      read = t2 - t1;
      aams = t3 - t2;
    }
    this._tick(tText, read, aams);
  }

  /** (Re)construit aa + render.canvas quand la grille ascii change. */
  _ensureGrid() {
    // Résolution graphique : la grille ?gfx= si fournie, sinon la grille
    // du buffer texte. charWidth/lineHeight FLOTTANTS : aalib positionne
    // ses glyphes par fillText(x*charWidth, y*lineHeight), donc toute
    // grille est digérée quelle que soit la taille pixel du canvas.
    const pw = this.canvas.width;
    const ph = this.canvas.height;
    const cols = this._gfxRes ? this._gfxRes.cols : this.stas.buffer.width;
    const rows = this._gfxRes ? this._gfxRes.rows : this.stas.buffer.height;
    const key = `${cols}x${rows}x${pw}x${ph}`;
    if (key === this._grid) return;
    this._grid = key;
    this._cols = cols;
    this._rows = rows;
    this._aa = globalThis.aalib.aa({
      width: cols,
      height: rows,
      colored: true,
    });
    this._draw = globalThis.aalib.render.canvas({
      el: this.gfx,
      width: pw,
      height: ph,
      charWidth: pw / cols,
      lineHeight: ph / rows,
      fontSize: ph / rows,
      fontFamily: this.text.family,
      background: "transparent",
    });
  }

  /**
   * Remplit le flux RGBA du PHYSIC ET les stats par cellule ascii :
   * couleur dominante des pixels dessinés, luminance moyenne des pixels
   * dessinés, présence. Pixel non dessiné = noir (-> espace -> transparent).
   */
  _fillStats(p, cols, rows) {
    const W = p.width;
    const H = p.height;
    const n = W * H;
    if (!this._data || this._data.length !== n * 4) {
      this._data = new Uint8ClampedArray(n * 4);
    }
    if (!this._dom || this._dom.length !== cols * rows) {
      this._dom = new Uint8Array(cols * rows);
      this._mono = new Uint8Array(cols * rows);
      this._tch = new Uint8Array(cols * rows);
      this._cnt = new Uint32Array(16);
    }
    const d = this._data;
    const col = p.colors;
    const tch = p.touched;
    const bw = W / cols;
    const bh = H / rows;
    const cnt = this._cnt;
    let i = 0;
    for (let cy = 0; cy < rows; cy++) {
      const y0 = ~~(cy * bh);
      const y1 = Math.max(y0 + 1, ~~((cy + 1) * bh));
      for (let cx = 0; cx < cols; cx++, i++) {
        const x0 = ~~(cx * bw);
        const x1 = Math.max(x0 + 1, ~~((cx + 1) * bw));
        cnt.fill(0);
        let sum = 0;
        let nt = 0;
        for (let y = y0; y < y1; y++) {
          let o = (y * W + x0) * 4;
          for (let x = x0; x < x1; x++, o += 4) {
            const pi = y * W + x;
            if (tch[pi]) {
              const c = col[pi] & 15;
              cnt[c]++;
              const pal = STOS_PALETTE[c];
              sum += (pal[0] + pal[1] + pal[2]) / 3;
              nt++;
              d[o] = pal[0];
              d[o + 1] = pal[1];
              d[o + 2] = pal[2];
              d[o + 3] = 255;
            } else {
              d[o] = 0;
              d[o + 1] = 0;
              d[o + 2] = 0;
              d[o + 3] = 255; // noir -> espace -> transparent
            }
          }
        }
        let dom = 15;
        let best = -1;
        for (let c = 0; c < 16; c++) {
          if (cnt[c] > best) {
            best = cnt[c];
            dom = c;
          }
        }
        this._dom[i] = dom;
        this._mono[i] = nt ? ~~(sum / nt) : 0;
        this._tch[i] = nt ? 1 : 0;
      }
    }
    return d;
  }

  /** Étape contraste : couleurs palette exactes + luminance gamma-boostée. */
  _boost(img) {
    const d = img.data;
    for (let i = 0; i < d.length; i++) {
      if (this._tch[i]) {
        const pal = STOS_PALETTE[this._dom[i]];
        d[i].r = pal[0];
        d[i].g = pal[1];
        d[i].b = pal[2];
        // aalib : 0 = glyphe dense, 255 = espace. gamma < 1 dope les
        // mi-teintes, puis inversion : pixel clair -> glyphe dense.
        d[i].mono =
          255 - Math.min(255, ~~(255 * Math.pow(this._mono[i] / 255, 0.45)));
      } else {
        d[i].mono = 255; // -> espace -> transparent
      }
    }
    return img;
  }

  _tick(textMs, readMs, aaMs) {
    const s = this._stats;
    const total = readMs + aaMs;
    s.n++;
    s.acc += total;
    const grid = this._cols ? `${this._cols}x${this._rows} ` : "";
    if (s.n >= 30) {
      console.log(
        `[stas-web] aalib ${grid}frame ${total.toFixed(2)} ms ` +
          `(read ${readMs.toFixed(2)} / aa+boost+render ${aaMs.toFixed(2)} ` +
          `| texte ${textMs.toFixed(2)}) — moyenne ${(s.acc / s.n).toFixed(2)} ms sur ${s.n} frames`
      );
      s.n = 0;
      s.acc = 0;
    }
    this._overlay.textContent =
      `aalib ${grid}${total.toFixed(1)} ms (read ${readMs.toFixed(1)} / aa ${aaMs.toFixed(1)}) ` +
      `| txt ${textMs.toFixed(1)}`;
  }
}

function makeOverlay() {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:4px;right:8px;z-index:9;font:12px monospace;" +
    "color:#0f0;background:rgba(0,0,0,.7);padding:2px 6px;";
  el.textContent = "aalib …";
  document.body.appendChild(el);
  return el;
}
