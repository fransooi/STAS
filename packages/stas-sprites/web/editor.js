/*
 *  STAS sprites — éditeur web (interface canvas).
 *  --------------------------------------------------------------------
 *  Interface navigateur par-dessus le cœur métier de ../src (INCHANGÉ) :
 *  grille d'édition zoomée, aperçu 1:1, outils de dessin, pages de
 *  caractères Unicode, palettes STOS, banque + animation, undo/redo et
 *  export JSON/TXT/ANSI.
 *
 *  Conventions du monorepo : zéro dépendance, ES modules natifs, imports
 *  RELATIFS. La page est servie par stas-web/serve.js depuis la racine
 *  STAS/ → http://localhost:8080/packages/stas-sprites/web/
 *  --------------------------------------------------------------------
 */

import { SpriteBank } from "../src/bank.js";
import * as tools from "../src/tools.js";
import { History } from "../src/history.js";
import { makeExport, isBankJSON, loadBank } from "../src/save.js";
import {
  pageGlyphs,
  NAMED_PAGES,
  QUICK_GLYPHS,
  pageOf,
  MAX_PAGE,
} from "../src/charset.js";
import { FONTS, fontById } from "../src/fonts.js";

/* ------------------------------------------------------------------ */
/* Constantes d'affichage                                              */
/* ------------------------------------------------------------------ */

/**
 * Rapport largeur/hauteur de cellule par police. Il doit coller à
 * l'avance réelle des glyphes pour que les blocs (█ ▓ ▒) se touchent
 * sans couture — 0.5 pour VT323 (même rapport que le renderer de
 * stas-web : 8×16 pour un corps de 16).
 */
const ASPECT = {
  vt323: 0.5,
  pressstart: 1,
  dotgothic: 1,
  mono: 0.6,
  serif: 0.5,
  sans: 0.55,
};

const PREVIEW_FS = 16; // corps de l'aperçu 1:1 (la « vraie » taille)
const DISPLAY_FONT = '"VT323", monospace';

/** L'encre de la gomme : espace, encre blanche, papier noir. */
const ERASER = { ch: " ", fg: 0, bg: 15 };

/** Outils « mode » : sélectionnables, agissent sur la grille. */
const TOOL_MODES = [
  { id: "plot", icon: "✎", name: "Plot" },
  { id: "line", icon: "╱", name: "Ligne" },
  { id: "box", icon: "□", name: "Boîte" },
  { id: "fillBox", icon: "■", name: "Remplie" },
  { id: "circle", icon: "○", name: "Cercle" },
  { id: "fillCircle", icon: "●", name: "Disque" },
  { id: "ellipse", icon: "◠", name: "Ellipse" },
  { id: "fillEllipse", icon: "◡", name: "Ell. pleine" },
  { id: "floodFill", icon: "≈", name: "Remplir" },
];

/** Outils « action » : application immédiate au clic. */
const TOOL_ACTS = [
  { id: "clear", label: "✕ Vider" },
  { id: "flipH", label: "↔ Miroir H" },
  { id: "flipV", label: "↕ Miroir V" },
  { id: "rotate", label: "↻ Pivoter" },
  { id: "reduce", label: "✂ Réduire" },
];

/** Les 4 flèches de décalage (dx, dy, libellé). */
const SCROLLS = [
  [-1, 0, "←"],
  [0, -1, "↑"],
  [1, 0, "→"],
  [0, 1, "↓"],
];

/** Outils à 2 points : appui = départ, survol = aperçu, relâchement = commit. */
const TWO_POINT = new Set([
  "line", "box", "fillBox", "circle", "fillCircle", "ellipse", "fillEllipse",
]);

/* Petites utilitaires DOM / couleur */
const $ = (id) => document.getElementById(id);
const rgbOf = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v, 10) || lo));
const hex4 = (n) => "U+" + n.toString(16).toUpperCase().padStart(4, "0");

/* ------------------------------------------------------------------ */
/* L'éditeur                                                           */
/* ------------------------------------------------------------------ */

class Editor {
  constructor() {
    /* — Références DOM — */
    this.el = {
      grid: $("grid"), gridWrap: $("gridWrap"), gridInfo: $("gridInfo"),
      preview: $("preview"),
      toolModes: $("toolModes"), toolActs: $("toolActs"),
      btnUndo: $("btnUndo"), btnRedo: $("btnRedo"),
      palFg: $("palFg"), palBg: $("palBg"), inkCh: $("inkCh"), inkMeta: $("inkMeta"),
      thumbs: $("thumbs"), bankCount: $("bankCount"),
      btnPrev: $("btnPrev"), btnNext: $("btnNext"), btnNew: $("btnNew"), btnDel: $("btnDel"),
      inW: $("inW"), inH: $("inH"), btnResize: $("btnResize"),
      btnPlay: $("btnPlay"), btnStop: $("btnStop"), animInfo: $("animInfo"),
      glyphGrid: $("glyphGrid"), quickRow: $("quickRow"),
      selFont: $("selFont"), selPages: $("selPages"),
      btnPagePrev: $("btnPagePrev"), btnPageNext: $("btnPageNext"),
      inPage: $("inPage"), pageInfo: $("pageInfo"),
      stCoord: $("stCoord"), stTool: $("stTool"), stInk: $("stInk"), stInfo: $("stInfo"),
      msg: $("msg"),
      btnJson: $("btnJson"), btnTxt: $("btnTxt"), btnAnsi: $("btnAnsi"),
      btnOpen: $("btnOpen"), fileInput: $("fileInput"),
    };

    /* — État — */
    this.bank = new SpriteBank();
    this.bank.newSprite(32, 32, "Sprite 0");
    this.curIdx = 0;                       // sprite courant dans la banque
    this.ink = { ch: "█", fg: 0, bg: 15 }; // encre courante {ch, fg, bg}
    this.tool = "plot";                    // outil « mode » actif
    this.fontId = "vt323";                 // police de RENDU (vue, pas donnée)
    this.page = pageOf(0x2588);            // page de caractères courante (blocs)
    this.history = new History();          // snapshots JSON de la banque

    /* État interactif (souris) */
    this.hover = null;    // cellule survolée {x,y}
    this.drag = null;     // tracé 2 points en cours {x0,y0,x1,y1,ink}
    this.stroke = null;   // trait « plot » en cours {ink,lx,ly}
    this.ghost = null;    // clone du sprite pour l'aperçu des formes
    this.activeInk = null;

    /* État animation */
    this.playing = false;
    this.animTimer = 0;

    /* Rendu à la demande (coalescence via requestAnimationFrame) */
    this._raf = 0;
    this._msgT = 0;
    this.gcw = 0; // dimensions logiques de cellule sur la grille
    this.gch = 0;

    /* — Construction & câblage — */
    this.buildToolbar();
    this.buildActions();
    this.buildPalettes();
    this.buildGlyphGrid();
    this.buildQuickGlyphs();
    this.buildFontSelect();
    this.buildPageNav();
    this.bindGrid();
    this.bindBank();
    this.bindAnim();
    this.bindFiles();
    this.bindKeys();

    /* — État initial de la pile d'annulation — */
    this.history.push(this.bank.serialize());

    this.fullRefresh();
    this.setPage(this.page);
    this.flash("Bienvenue dans STAS Sprite Studio — dessinez !");

    /* Les webfonts changent les mesures une fois chargées → re-rendu. */
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.renderCanvas());
    }
    window.addEventListener("resize", () => this.scheduleRender());
  }

  /* ------------------------- Accès ------------------------- */

  /** Le sprite courant (null si la banque est vide). */
  sprite() {
    return this.bank.get(this.curIdx);
  }

  /* ------------------------- Historique ------------------------- */

  /**
   * Pousse un snapshot de la banque. Modèle retenu : l'état initial est
   * poussé au démarrage, puis on pousse l'état RÉSULTAT après chaque
   * opération commitée — undo()/redo() restaurent alors exactement
   * l'état d'avant / d'après avec la classe History telle qu'écrite.
   */
  pushHistory() {
    this.history.push(this.bank.serialize());
    this.updateUndoButtons();
  }

  undo() {
    const snap = this.history.undo();
    if (snap == null) return;
    this.applySnapshot(snap);
    this.flash("Annulé");
  }

  redo() {
    const snap = this.history.redo();
    if (snap == null) return;
    this.applySnapshot(snap);
    this.flash("Rétabli");
  }

  /** Restaure un snapshot dans la banque (même référence d'objet). */
  applySnapshot(snap) {
    this.bank.restore(snap);
    this.curIdx = Math.min(this.curIdx, Math.max(0, this.bank.count - 1));
    this.fullRefresh();
  }

  updateUndoButtons() {
    this.el.btnUndo.disabled = !this.history.canUndo;
    this.el.btnRedo.disabled = !this.history.canRedo;
  }

  /** Applique fn au sprite courant, puis snapshot + re-rendu. */
  mutate(fn) {
    const s = this.sprite();
    if (!s) return;
    fn(s);
    this.pushHistory();
    this.refreshAfterEdit();
  }

  /* ------------------------- Barre d'outils ------------------------- */

  buildToolbar() {
    const frag = document.createDocumentFragment();
    for (const t of TOOL_MODES) {
      const b = document.createElement("button");
      b.className = "btn";
      b.dataset.tool = t.id;
      b.title = t.name;
      b.innerHTML = `<span class="t-ico">${t.icon}</span> ${t.name}`;
      b.addEventListener("click", () => this.setTool(t.id));
      frag.appendChild(b);
    }
    this.el.toolModes.appendChild(frag);

    this.el.btnUndo.addEventListener("click", () => this.undo());
    this.el.btnRedo.addEventListener("click", () => this.redo());
    this.setTool("plot");
  }

  buildActions() {
    const frag = document.createDocumentFragment();
    for (const a of TOOL_ACTS) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = a.label;
      b.addEventListener("click", () => this.runAction(a.id));
      frag.appendChild(b);
    }
    // Les 4 flèches de décalage du contenu (SCROLL de l'original)
    for (const [dx, dy, arrow] of SCROLLS) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = arrow;
      b.title = `Décaler le contenu ${arrow}`;
      b.addEventListener("click", () => {
        this.mutate((s) => tools.scroll(s, dx, dy));
      });
      frag.appendChild(b);
    }
    this.el.toolActs.appendChild(frag);
  }

  setTool(id) {
    this.tool = id;
    for (const b of this.el.toolModes.children) {
      b.classList.toggle("on", b.dataset.tool === id);
    }
    this.updateStatus();
  }

  /** Outils « action » : une opération ponctuelle, validée en historique. */
  runAction(id) {
    const s = this.sprite();
    if (!s) return this.flash("Banque vide — créez d'abord un sprite", "err");
    switch (id) {
      case "clear":
        this.mutate((sp) => tools.clearSprite(sp));
        this.flash("Sprite vidé");
        break;
      case "flipH":
        this.mutate((sp) => tools.flipH(sp));
        this.flash("Miroir horizontal");
        break;
      case "flipV":
        this.mutate((sp) => tools.flipV(sp));
        this.flash("Miroir vertical");
        break;
      case "rotate":
        if (s.w !== s.h) {
          this.flash("Rotation impossible : le sprite doit être CARRÉ", "err");
          break;
        }
        this.mutate((sp) => tools.rotate(sp));
        this.flash("Rotation 90°");
        break;
      case "reduce": {
        const b = s.bounds();
        if (!b) {
          this.flash("Sprite vide : rien à réduire", "err");
          break;
        }
        if (b.x0 === 0 && b.y0 === 0 && b.x1 === s.w - 1 && b.y1 === s.h - 1) {
          this.flash("Déjà à taille minimale");
          break;
        }
        this.mutate((sp) => tools.reduce(sp));
        this.flash("Recadré sur le contenu");
        break;
      }
    }
  }

  /* ------------------------- Palettes ------------------------- */

  /** Construit les 16+16 pastilles depuis la palette de la banque. */
  buildPalettes() {
    const build = (container, which) => {
      container.innerHTML = "";
      this.bank.palette.forEach((col, i) => {
        const b = document.createElement("button");
        b.className = "swatch";
        b.style.background = rgbOf(col);
        b.title = `${which} ${i} — rgb(${col.join(",")})`;
        b.addEventListener("click", () => {
          this.ink[which] = i;
          this.markPalettes();
          this.updateInk();
        });
        container.appendChild(b);
      });
    };
    build(this.el.palFg, "fg");
    build(this.el.palBg, "bg");
    this.markPalettes();
  }

  /** Met à jour les pastilles sélectionnées (fg et bg courants). */
  markPalettes() {
    [...this.el.palFg.children].forEach((b, i) =>
      b.classList.toggle("sel", i === this.ink.fg));
    [...this.el.palBg.children].forEach((b, i) =>
      b.classList.toggle("sel", i === this.ink.bg));
  }

  /** Le grand aperçu de l'encre courante (glyphe + fg/bg + codepoint). */
  updateInk() {
    const pal = this.bank.palette;
    const cp = this.ink.ch ? this.ink.ch.codePointAt(0) : 0x20;
    this.el.inkCh.textContent = this.ink.ch === " " ? "␣" : this.ink.ch;
    this.el.inkCh.style.color = rgbOf(pal[this.ink.fg & 15]);
    this.el.inkCh.style.background = rgbOf(pal[this.ink.bg & 15]);
    this.el.inkMeta.innerHTML =
      `${hex4(cp)}<br>fg ${this.ink.fg} · bg ${this.ink.bg}`;
    this.updateStatus();
  }

  /* ------------------------- Caractères ------------------------- */

  buildGlyphGrid() {
    const frag = document.createDocumentFragment();
    this.glyphBtns = [];
    for (let i = 0; i < 256; i++) {
      const b = document.createElement("button");
      b.className = "glyph";
      b.addEventListener("click", () => {
        if (b.classList.contains("off")) return;
        this.selectChar(String.fromCodePoint(+b.dataset.cp));
      });
      frag.appendChild(b);
      this.glyphBtns.push(b);
    }
    this.el.glyphGrid.appendChild(frag);
  }

  buildQuickGlyphs() {
    const frag = document.createDocumentFragment();
    this.quickBtns = [];
    for (const g of QUICK_GLYPHS) {
      const b = document.createElement("button");
      b.className = "glyph";
      b.textContent = g === " " ? "␣" : g;
      b.title = hex4(g.codePointAt(0)) + " (accès rapide)";
      b.addEventListener("click", () => this.selectChar(g));
      frag.appendChild(b);
      this.quickBtns.push(b);
    }
    this.el.quickRow.appendChild(frag);
  }

  /** Change de page de 256 caractères et rafraîchit la grille de glyphes. */
  setPage(p) {
    this.page = Math.max(0, Math.min(MAX_PAGE, p | 0));
    const glyphs = pageGlyphs(this.page);
    const selCp = this.ink.ch ? this.ink.ch.codePointAt(0) : -1;
    let okCount = 0;
    glyphs.forEach((g, i) => {
      const b = this.glyphBtns[i];
      b.textContent = g.ok ? g.ch : "·";
      b.dataset.cp = g.cp;
      b.title = hex4(g.cp);
      b.classList.toggle("off", !g.ok);
      b.classList.toggle("sel", g.ok && g.cp === selCp);
      if (g.ok) okCount++;
    });
    this.el.inPage.value = this.page;
    this.el.selPages.value = String(this.page); // "" si page hors catalogue
    this.el.pageInfo.textContent =
      `page ${hex4(this.page).slice(2)}h · ${hex4(this.page << 8)}–${hex4((this.page << 8) + 0xff)} · ${okCount}/256`;
    this.markQuick();
  }

  buildPageNav() {
    for (const p of NAMED_PAGES) {
      const o = document.createElement("option");
      o.value = String(p.page);
      o.textContent = `0x${p.page.toString(16).toUpperCase()} · ${p.name}`;
      this.el.selPages.appendChild(o);
    }
    this.el.selPages.addEventListener("change", (e) => this.setPage(+e.target.value));
    this.el.btnPagePrev.addEventListener("click", () => this.setPage(this.page - 1));
    this.el.btnPageNext.addEventListener("click", () => this.setPage(this.page + 1));
    this.el.inPage.addEventListener("change", (e) => this.setPage(+e.target.value));
  }

  /** Choisit le caractère courant (le .ch de l'encre). */
  selectChar(ch) {
    this.ink.ch = ch;
    const cp = ch.codePointAt(0);
    // Met en évidence le glyphe sur la page courante…
    this.glyphBtns.forEach((b) =>
      b.classList.toggle("sel", !b.classList.contains("off") && +b.dataset.cp === cp));
    // …et dans la rangée d'accès rapide.
    this.markQuick();
    this.updateInk();
  }

  markQuick() {
    const cp = this.ink.ch ? this.ink.ch.codePointAt(0) : -1;
    this.quickBtns.forEach((b, i) =>
      b.classList.toggle("sel", QUICK_GLYPHS[i].codePointAt(0) === cp));
  }

  /* ------------------------- Police de rendu ------------------------- */

  buildFontSelect() {
    for (const f of FONTS) {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.name;
      this.el.selFont.appendChild(o);
    }
    this.el.selFont.value = this.fontId;
    this.el.selFont.addEventListener("change", (e) => {
      // La police ne change QUE la vue : la donnée du sprite reste intacte.
      this.fontId = e.target.value;
      this.renderCanvas();
      this.paintThumbs();
      this.flash(`Police de rendu : ${fontById(this.fontId).name}`);
    });
  }

  /* ------------------------- Rendu canvas ------------------------- */

  /**
   * Prépare un canvas net sur écran HiDPI : le bitmap est multiplié par
   * le devicePixelRatio, le contexte mis à l'échelle, et la taille CSS
   * fixée en pixels logiques.
   */
  fitCanvas(cv, w, h) {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /** Rendu à la demande : une seule passe par frame au plus. */
  scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.renderCanvas();
    });
  }

  renderCanvas() {
    this.renderGrid();
    if (!this.playing) this.renderPreview();
  }

  /**
   * La grille d'édition : chaque cellule rendue en GROS (zoom calculé
   * pour tenir dans la zone), glyphe fg sur papier bg, quadrillage,
   * repère du point chaud et survol. Pendant un tracé 2 points, c'est
   * le clone « ghost » qui est affiché (aperçu temps réel).
   */
  renderGrid() {
    const cv = this.el.grid;
    const s = this.ghost ?? this.sprite();

    if (!s) {
      // Banque vide : placeholder.
      const ctx = this.fitCanvas(cv, 340, 180);
      ctx.fillStyle = "#0a0f16";
      ctx.fillRect(0, 0, 340, 180);
      ctx.fillStyle = "#3d536e";
      ctx.font = "22px " + DISPLAY_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("— BANQUE VIDE —", 170, 82);
      ctx.font = "13px " + DISPLAY_FONT;
      ctx.fillText("bouton ＋ NOUV. pour créer un sprite", 170, 108);
      this.gcw = this.gch = 0;
      return;
    }

    const fam = fontById(this.fontId).family;
    const aspect = ASPECT[this.fontId] ?? 0.5;

    /* Zoom : la plus grande cellule qui tient dans la zone disponible. */
    const availW = Math.max(220, this.el.gridWrap.clientWidth - 30);
    const availH = Math.max(300, Math.min(680, window.innerHeight - 320));
    let ch = Math.floor(Math.min(availH / s.h, availW / (s.w * aspect)));
    ch = Math.max(8, Math.min(28, ch));
    const cw = Math.max(4, Math.round(ch * aspect));
    this.gcw = cw;
    this.gch = ch;

    const ctx = this.fitCanvas(cv, s.w * cw, s.h * ch);
    const pal = this.bank.palette;

    /* Fond (papier) + glyphes (encre), cellule par cellule. */
    ctx.font = ch + "px " + fam;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const c = s.cells[y * s.w + x];
        ctx.fillStyle = rgbOf(pal[c.bg & 15]);
        ctx.fillRect(x * cw, y * ch, cw, ch);
        if (c.ch !== " ") {
          ctx.fillStyle = rgbOf(pal[c.fg & 15]);
          ctx.fillText(c.ch, x * cw + cw / 2, y * ch + ch / 2 + 1);
        }
      }
    }

    /* Quadrillage — renforcé toutes les 8 cellules. */
    ctx.lineWidth = 1;
    for (let x = 0; x <= s.w; x++) {
      ctx.strokeStyle = x % 8 ? "rgba(148,178,214,0.10)" : "rgba(148,178,214,0.26)";
      ctx.beginPath();
      ctx.moveTo(x * cw + 0.5, 0);
      ctx.lineTo(x * cw + 0.5, s.h * ch);
      ctx.stroke();
    }
    for (let y = 0; y <= s.h; y++) {
      ctx.strokeStyle = y % 8 ? "rgba(148,178,214,0.10)" : "rgba(148,178,214,0.26)";
      ctx.beginPath();
      ctx.moveTo(0, y * ch + 0.5);
      ctx.lineTo(s.w * cw, y * ch + 0.5);
      ctx.stroke();
    }

    /* Repère distinct du point chaud (hx, hy). */
    if (!this.ghost && s.inBounds(s.hx, s.hy)) {
      const px = s.hx * cw, py = s.hy * ch;
      ctx.strokeStyle = "#ff3df0";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1.5, py + 1.5, cw - 3, ch - 3);
      const mx = px + cw / 2, my = py + ch / 2;
      ctx.beginPath();
      ctx.moveTo(mx - cw * 0.32, my);
      ctx.lineTo(mx + cw * 0.32, my);
      ctx.moveTo(mx, my - ch * 0.32);
      ctx.lineTo(mx, my + ch * 0.32);
      ctx.stroke();
    }

    /* Cellule survolée + fantôme de l'encre (mode plot). */
    const hv = this.hover;
    if (!this.ghost && hv && s.inBounds(hv.x, hv.y)) {
      const px = hv.x * cw, py = hv.y * ch;
      if (this.tool === "plot" && this.ink.ch && this.ink.ch !== " ") {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = rgbOf(pal[this.ink.fg & 15]);
        ctx.fillText(this.ink.ch, px + cw / 2, py + ch / 2 + 1);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cw - 1, ch - 1);
    }
  }

  /**
   * L'aperçu 1:1 : le sprite rendu à la taille réelle de la police
   * (cellules au corps PREVIEW_FS), sans quadrillage. Pendant
   * l'animation, c'est l'image courante qui y défile.
   */
  renderPreview(spr) {
    const s = spr ?? this.sprite();
    const cv = this.el.preview;
    if (!s) {
      const ctx = this.fitCanvas(cv, 150, 60);
      ctx.fillStyle = "#0a0f16";
      ctx.fillRect(0, 0, 150, 60);
      return;
    }
    const fam = fontById(this.fontId).family;
    const aspect = ASPECT[this.fontId] ?? 0.5;
    const ch = PREVIEW_FS;
    const cw = Math.max(3, Math.round(ch * aspect));
    const ctx = this.fitCanvas(cv, s.w * cw, s.h * ch);
    const pal = this.bank.palette;
    ctx.font = ch + "px " + fam;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const c = s.cells[y * s.w + x];
        ctx.fillStyle = rgbOf(pal[c.bg & 15]);
        ctx.fillRect(x * cw, y * ch, cw, ch);
        if (c.ch !== " ") {
          ctx.fillStyle = rgbOf(pal[c.fg & 15]);
          ctx.fillText(c.ch, x * cw + cw / 2, y * ch + ch / 2 + 1);
        }
      }
    }
    /* Le point chaud, en tout petit. */
    if (s.inBounds(s.hx, s.hy)) {
      ctx.strokeStyle = "#ff3df0";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.hx * cw + 0.5, s.hy * ch + 0.5, cw - 1, ch - 1);
    }
  }

  /* ------------------------- Banque : vignettes ------------------------- */

  buildThumbs() {
    const box = this.el.thumbs;
    box.innerHTML = "";
    this.thumbCv = [];
    this.thumbEls = [];
    this.bank.sprites.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "thumb";
      const cv = document.createElement("canvas");
      const meta = document.createElement("div");
      meta.innerHTML =
        `<div class="t-name">#${i} ${escapeHtml(s.name || "sans nom")}</div>` +
        `<div class="t-meta">${s.w}×${s.h} · chaud ${s.hx},${s.hy}</div>`;
      div.append(cv, meta);
      div.addEventListener("click", () => this.selectSprite(i));
      box.appendChild(div);
      this.thumbCv.push(cv);
      this.thumbEls.push(div);
    });
    this.el.bankCount.textContent = this.bank.count
      ? `${this.bank.count} sprite${this.bank.count > 1 ? "s" : ""}`
      : "vide";
    this.markThumbs();
    this.paintThumbs();
  }

  markThumbs() {
    this.thumbEls?.forEach((d, i) => d.classList.toggle("sel", i === this.curIdx));
  }

  /** Redessine le contenu des vignettes (cellules minuscules). */
  paintThumbs() {
    const fam = fontById(this.fontId).family;
    const aspect = ASPECT[this.fontId] ?? 0.5;
    const pal = this.bank.palette;
    this.bank.sprites.forEach((s, i) => {
      const cv = this.thumbCv[i];
      if (!cv) return;
      const ch = Math.max(2, Math.min(7, Math.floor(84 / Math.max(1, s.h))));
      const cw = Math.max(2, Math.round(ch * aspect));
      const ctx = this.fitCanvas(cv, s.w * cw, s.h * ch);
      // La hauteur d'affichage suit le ratio du bitmap (CSS height: auto),
      // sinon le max-width de la vignette écraserait l'image.
      cv.style.height = "auto";
      ctx.font = ch + "px " + fam;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const c = s.cells[y * s.w + x];
          ctx.fillStyle = rgbOf(pal[c.bg & 15]);
          ctx.fillRect(x * cw, y * ch, cw, ch);
          // En dessous de 5 px, le texte est illisible : on ne garde que les fonds.
          if (ch >= 5 && c.ch !== " ") {
            ctx.fillStyle = rgbOf(pal[c.fg & 15]);
            ctx.fillText(c.ch, x * cw + cw / 2, y * ch + ch / 2 + 1);
          }
        }
      }
    });
  }

  selectSprite(i) {
    this.curIdx = i;
    this.markThumbs();
    this.syncSizeInputs();
    this.renderCanvas();
    this.updateStatus();
  }

  syncSizeInputs() {
    const s = this.sprite();
    if (s) {
      this.el.inW.value = s.w;
      this.el.inH.value = s.h;
    }
  }

  bindBank() {
    this.el.btnPrev.addEventListener("click", () => this.stepSprite(-1));
    this.el.btnNext.addEventListener("click", () => this.stepSprite(1));

    this.el.btnNew.addEventListener("click", () => {
      const w = clampInt(this.el.inW.value, 1, 512);
      const h = clampInt(this.el.inH.value, 1, 512);
      const i = this.bank.newSprite(w, h, `Sprite ${this.bank.count}`);
      this.curIdx = i;
      this.pushHistory();
      this.fullRefresh();
      this.flash(`Sprite #${i} créé (${w}×${h})`, "ok");
    });

    this.el.btnDel.addEventListener("click", () => {
      if (!this.bank.count) return;
      const name = this.sprite()?.name || "sans nom";
      this.bank.remove(this.curIdx);
      this.curIdx = Math.min(this.curIdx, Math.max(0, this.bank.count - 1));
      this.pushHistory();
      this.fullRefresh();
      this.flash(`Supprimé : ${name}`);
    });

    this.el.btnResize.addEventListener("click", () => {
      const s = this.sprite();
      if (!s) return this.flash("Banque vide — rien à redimensionner", "err");
      const w = clampInt(this.el.inW.value, 1, 512);
      const h = clampInt(this.el.inH.value, 1, 512);
      if (w === s.w && h === s.h) return this.flash("Taille inchangée");
      this.mutate((sp) => sp.resize(w, h));
      this.buildThumbs(); // la taille change → vignettes reconstruites
      this.flash(`Taille fixée : ${w}×${h}`, "ok");
    });
  }

  stepSprite(dir) {
    if (this.bank.count < 2) return;
    const n = this.bank.count;
    this.selectSprite((this.curIdx + dir + n) % n);
  }

  /* ------------------------- Animation ------------------------- */

  bindAnim() {
    this.el.btnPlay.addEventListener("click", () => this.playAnim());
    this.el.btnStop.addEventListener("click", () => this.stopAnim());
  }

  /**
   * Fait défiler les images de bank.animation dans l'aperçu 1:1.
   * Le délai d'une frame est en 1/50 s (le DELAI de l'original) → ×20 ms.
   */
  playAnim() {
    if (this.bank.count === 0) return this.flash("Aucun sprite à animer", "err");
    const anim = this.bank.ensureAnimation();
    if (!anim.frames.length) return this.flash("Aucune image d'animation", "err");
    this.stopAnim(false);
    this.playing = true;
    this.el.btnPlay.disabled = true;
    this.el.btnStop.disabled = false;

    const n = anim.frames.length;
    let i = 0;
    const step = () => {
      if (!this.playing) return;
      const f = anim.frames[i];
      const spr = this.bank.get(f.sprite);
      if (spr) this.renderPreview(spr);
      const delay = Math.max(20, (f.delay ?? 10) * 20);
      this.el.animInfo.textContent = `▶ image ${i + 1}/${n} · ${delay} ms`;
      i++;
      if (i >= n) {
        if (anim.loop) i = 0;
        else return this.stopAnim();
      }
      this.animTimer = setTimeout(step, delay);
    };
    step();
    this.flash("Lecture de l'animation");
  }

  stopAnim(restore = true) {
    this.playing = false;
    clearTimeout(this.animTimer);
    this.el.btnPlay.disabled = false;
    this.el.btnStop.disabled = true;
    this.el.animInfo.textContent = "—";
    if (restore) this.renderCanvas(); // l'aperçu revient au sprite courant
  }

  /* ------------------------- Grille : souris / pointeur ------------------------- */

  /** Cellule survolée par l'événement (null hors cadre). */
  cellAt(e) {
    const s = this.sprite();
    if (!s || !this.gcw) return null;
    const r = this.el.grid.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / this.gcw);
    const y = Math.floor((e.clientY - r.top) / this.gch);
    return s.inBounds(x, y) ? { x, y } : null;
  }

  bindGrid() {
    const cv = this.el.grid;
    // Clic droit = gomme : jamais de menu contextuel sur la grille.
    cv.addEventListener("contextmenu", (e) => e.preventDefault());

    cv.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (!this.sprite()) return;
      e.preventDefault();
      this.stopAnim();
      cv.setPointerCapture(e.pointerId);
      const p = this.cellAt(e);
      if (!p) return;

      // Alt+clic : pose le POINT CHAUD (prioritaire, quel que soit l'outil).
      if (e.altKey) {
        const s = this.sprite();
        s.hx = p.x;
        s.hy = p.y;
        this.pushHistory();
        this.refreshAfterEdit();
        this.flash(`Point chaud fixé en ${p.x},${p.y}`, "ok");
        return;
      }

      // Bouton droit : gomme (espace, papier noir) — sinon encre courante.
      const ink = e.button === 2 ? ERASER : { ...this.ink };
      this.activeInk = ink;

      if (TWO_POINT.has(this.tool)) {
        // Formes à 2 points : l'appui pose le départ, le ghost donne l'aperçu.
        this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, ink };
        this.rebuildGhost();
      } else if (this.tool === "plot") {
        // Tracé libre : pose immédiate, le trait se poursuit en glissant.
        this.stroke = { ink, lx: p.x, ly: p.y };
        const s = this.sprite();
        tools.plot(s, p.x, p.y, ink);
        this.renderCanvas();
      } else if (this.tool === "floodFill") {
        // Remplissage : action au clic, commitée en historique.
        const s = this.sprite();
        this.mutate(() => tools.floodFill(s, p.x, p.y, ink));
      }
      this.updateStatus();
    });

    cv.addEventListener("pointermove", (e) => {
      const p = this.cellAt(e);
      this.hover = p;
      if (this.drag && p) {
        this.drag.x1 = p.x;
        this.drag.y1 = p.y;
        this.rebuildGhost(); // aperçu temps réel sur un clone
      } else if (this.stroke && p) {
        const s = this.sprite();
        if (s && (p.x !== this.stroke.lx || p.y !== this.stroke.ly)) {
          // Segment plein entre deux cellules traversées (pas de trous).
          tools.line(s, this.stroke.lx, this.stroke.ly, p.x, p.y, this.stroke.ink);
          this.stroke.lx = p.x;
          this.stroke.ly = p.y;
          this.renderCanvas();
        }
      }
      this.updateStatus();
      if (!this.drag) this.scheduleRender(); // simple survol
    });

    const release = () => {
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        this.ghost = null;
        const s = this.sprite();
        if (s) {
          // Commit : la forme est appliquée au vrai sprite puis snapshotée.
          this.applyTwoPoint(s, d);
          this.pushHistory();
          this.refreshAfterEdit();
        }
      } else if (this.stroke) {
        this.stroke = null;
        this.pushHistory();
        this.refreshAfterEdit();
      }
      this.updateStatus();
    };
    cv.addEventListener("pointerup", release);
    cv.addEventListener("pointercancel", release);
    cv.addEventListener("pointerleave", () => {
      if (!this.drag && !this.stroke) {
        this.hover = null;
        this.scheduleRender();
        this.updateStatus();
      }
    });
  }

  /** Reconstruit le clone d'aperçu avec la forme en cours de tracé. */
  rebuildGhost() {
    const s = this.sprite();
    if (!s || !this.drag) return;
    const g = s.clone();
    this.applyTwoPoint(g, this.drag);
    this.ghost = g;
    this.scheduleRender();
  }

  /** Applique l'outil à 2 points actif sur `t` (sprite ou ghost). */
  applyTwoPoint(t, d) {
    const dx = d.x1 - d.x0;
    const dy = d.y1 - d.y0;
    switch (this.tool) {
      case "line":
        tools.line(t, d.x0, d.y0, d.x1, d.y1, d.ink);
        break;
      case "box":
        tools.box(t, d.x0, d.y0, d.x1, d.y1, d.ink);
        break;
      case "fillBox":
        tools.fillBox(t, d.x0, d.y0, d.x1, d.y1, d.ink);
        break;
      case "circle":
        tools.circle(t, d.x0, d.y0, Math.round(Math.hypot(dx, dy)), d.ink);
        break;
      case "fillCircle":
        tools.fillCircle(t, d.x0, d.y0, Math.round(Math.hypot(dx, dy)), d.ink);
        break;
      case "ellipse":
        tools.ellipse(t, d.x0, d.y0, Math.abs(dx), Math.abs(dy), d.ink);
        break;
      case "fillEllipse":
        tools.fillEllipse(t, d.x0, d.y0, Math.abs(dx), Math.abs(dy), d.ink);
        break;
    }
  }

  /* ------------------------- Clavier ------------------------- */

  bindKeys() {
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      // Pas de raccourcis pendant la saisie dans un champ.
      if (t && t.closest && t.closest("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        this.redo();
      } else if (e.key === "Escape") {
        // Échappe : stoppe l'animation et abandonne le tracé en cours.
        this.stopAnim();
        this.drag = null;
        this.ghost = null;
        this.stroke = null;
        this.renderCanvas();
      }
    });
  }

  /* ------------------------- Sauvegarde / chargement ------------------------- */

  bindFiles() {
    this.el.btnJson.addEventListener("click", () => this.exportKind("json"));
    this.el.btnTxt.addEventListener("click", () => this.exportKind("txt"));
    this.el.btnAnsi.addEventListener("click", () => this.exportKind("ansi"));

    this.el.btnOpen.addEventListener("click", () => this.el.fileInput.click());
    this.el.fileInput.addEventListener("change", (e) => {
      this.handleFile(e.target.files[0]);
      e.target.value = "";
    });

    // Glisser-déposer d'un fichier .stasprite / .json n'importe où sur la page.
    let depth = 0;
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      document.body.classList.add("dropping");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", () => {
      if (--depth <= 0) {
        depth = 0;
        document.body.classList.remove("dropping");
      }
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dropping");
      const f = e.dataTransfer?.files?.[0];
      if (f) this.handleFile(f);
    });
  }

  /** Prépare un export via le cœur (makeExport) et déclenche le téléchargement. */
  exportKind(kind) {
    const base = this.sprite()?.name || "sprites";
    const exp = makeExport(this.bank, kind, base);
    const url = URL.createObjectURL(new Blob([exp.text], { type: exp.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exp.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.flash(`Exporté : ${exp.name}`, "ok");
  }

  handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.loadText(String(reader.result), file.name);
    reader.onerror = () => this.flash("Lecture du fichier impossible", "err");
    reader.readAsText(file);
  }

  /** Valide puis charge un texte de banque (drag-and-drop ou input file). */
  loadText(text, name = "fichier") {
    if (!isBankJSON(text)) {
      return this.flash(`${name} : format de banque invalide (magic STAS absent)`, "err");
    }
    try {
      this.bank = loadBank(text); // nouvelle banque, palette & sprites liés
      this.curIdx = Math.min(Math.max(0, this.curIdx), Math.max(0, this.bank.count - 1));
      this.pushHistory();
      this.fullRefresh();
      this.flash(
        `Banque chargée : ${name} (${this.bank.count} sprite${this.bank.count > 1 ? "s" : ""})`,
        "ok");
    } catch (err) {
      this.flash(`Chargement refusé : ${err.message}`, "err");
    }
  }

  /* ------------------------- Rafraîchissements ------------------------- */

  /** Après une édition du sprite courant (donnée inchangée en structure). */
  refreshAfterEdit() {
    this.paintThumbs();
    this.buildThumbsLabels();
    this.renderCanvas();
    this.syncSizeInputs();
    this.updateStatus();
  }

  /** Les vignettes affichent taille & point chaud : libellés à jour. */
  buildThumbsLabels() {
    this.bank.sprites.forEach((s, i) => {
      const meta = this.thumbEls[i]?.lastElementChild;
      if (!meta) return;
      meta.innerHTML =
        `<div class="t-name">#${i} ${escapeHtml(s.name || "sans nom")}</div>` +
        `<div class="t-meta">${s.w}×${s.h} · chaud ${s.hx},${s.hy}</div>`;
    });
  }

  /** Après un changement de structure (undo/redo, chargement, nouvel sprite). */
  fullRefresh() {
    this.buildPalettes(); // la palette peut venir d'une autre banque
    this.buildThumbs();
    this.syncSizeInputs();
    this.renderCanvas();
    this.updateInk();
    this.updateUndoButtons();
    this.updateStatus();
  }

  /* ------------------------- Ligne d'état ------------------------- */

  updateStatus() {
    const s = this.sprite();
    if (this.drag) {
      const d = this.drag;
      this.el.stCoord.textContent = `${d.x0},${d.y0} → ${d.x1},${d.y1}`;
    } else if (this.hover) {
      this.el.stCoord.textContent = `X:${this.hover.x} Y:${this.hover.y}`;
    } else {
      this.el.stCoord.textContent = "X:-- Y:--";
    }
    const mode = TOOL_MODES.find((t) => t.id === this.tool);
    this.el.stTool.textContent = mode ? mode.name : this.tool;
    const cp = this.ink.ch ? this.ink.ch.codePointAt(0) : 0x20;
    this.el.stInk.textContent = `"${this.ink.ch === " " ? "␣" : this.ink.ch}" ${hex4(cp)}`;
    this.el.stInfo.textContent = s
      ? `#${this.curIdx} ${s.name || "sans nom"} · ${s.w}×${s.h} · chaud ${s.hx},${s.hy}`
      : "banque vide";
    this.el.gridInfo.textContent = s ? `${s.w}×${s.h}` : "";
  }

  /** Message éphémère dans la ligne d'état (ok vert, err rouge, neutre jaune). */
  flash(text, cls = "") {
    const m = this.el.msg;
    m.textContent = text;
    m.className = "msg" + (cls ? " " + cls : "");
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => {
      m.className = "msg fade";
    }, 2800);
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

/** Crée et démarre l'éditeur sur le DOM de index.html. */
export function createEditor() {
  return new Editor();
}

createEditor();
