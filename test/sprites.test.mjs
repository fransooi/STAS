/*
 *  Tests @stas/sprites — grille ASCII, outils, historique, pages Unicode,
 *  polices, banque + animation, sauvegarde JSON/TXT/ANSI.
 *  Lance : node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Sprite, SPRITE_PALETTE } from "../packages/stas-sprites/src/sprite.js";
import * as tools from "../packages/stas-sprites/src/tools.js";
import { History } from "../packages/stas-sprites/src/history.js";
import {
  pageGlyphs, pageOf, pageBase, isGlyph, NAMED_PAGES, QUICK_GLYPHS,
} from "../packages/stas-sprites/src/charset.js";
import { FONTS, fontById, googleFontsUrl } from "../packages/stas-sprites/src/fonts.js";
import { SpriteBank, BANK_MAGIC } from "../packages/stas-sprites/src/bank.js";
import {
  toText, toAnsi, makeExport, isBankJSON, loadBank,
} from "../packages/stas-sprites/src/save.js";

const INK = { ch: "█", fg: 1, bg: 4 };

/* ------------------------------------------------------------------ */
/*  Grille Sprite                                                      */
/* ------------------------------------------------------------------ */

test("sprite : put/get et couleur PAR CELLULE", () => {
  const s = new Sprite(4, 3);
  s.put(0, 0, "A", 1, 2);
  s.put(1, 0, "B", 3, 4);
  assert.deepEqual(s.get(0, 0), { ch: "A", fg: 1, bg: 2 });
  assert.deepEqual(s.get(1, 0), { ch: "B", fg: 3, bg: 4 });
  assert.equal(s.get(9, 9), null);          // hors cadre
});

test("sprite : ink ne change que les champs fournis", () => {
  const s = new Sprite(2, 2);
  s.put(0, 0, "X", 1, 2);
  s.ink(0, 0, { ch: "Y" });                 // seulement le caractère
  assert.deepEqual(s.get(0, 0), { ch: "Y", fg: 1, bg: 2 });
});

test("sprite : clone est indépendant", () => {
  const s = new Sprite(2, 2, { hx: 1, hy: 1, name: "t" });
  s.put(0, 0, "A", 1, 2);
  const c = s.clone();
  c.put(0, 0, "Z", 5, 6);
  assert.equal(s.get(0, 0).ch, "A");
  assert.equal(c.get(0, 0).ch, "Z");
  assert.equal(c.hx, 1);
  assert.equal(c.name, "t");
});

test("sprite : resize conserve le contenu et clampe le point chaud", () => {
  const s = new Sprite(4, 4, { hx: 3, hy: 3 });
  s.put(0, 0, "A", 1, 2);
  s.resize(2, 2);
  assert.equal(s.w, 2);
  assert.equal(s.get(0, 0).ch, "A");
  assert.equal(s.hx, 1);                    // clampé à w-1
  assert.equal(s.hy, 1);
});

test("sprite : toJSON/fromJSON round-trip avec couleurs par cellule", () => {
  const s = new Sprite(3, 2, { hx: 2, hy: 1, name: "hero", font: "mono" });
  s.put(1, 1, "☺", 6, 9);
  const r = Sprite.fromJSON(s.toJSON());
  assert.equal(r.w, 3);
  assert.equal(r.hx, 2);
  assert.equal(r.name, "hero");
  assert.equal(r.font, "mono");
  assert.deepEqual(r.get(1, 1), { ch: "☺", fg: 6, bg: 9 });
});

/* ------------------------------------------------------------------ */
/*  Outils de dessin                                                   */
/* ------------------------------------------------------------------ */

test("tools : line trace les deux extrémités", () => {
  const s = new Sprite(10, 10);
  tools.line(s, 0, 0, 9, 9, INK);
  assert.equal(s.get(0, 0).ch, "█");
  assert.equal(s.get(9, 9).ch, "█");
  assert.equal(s.get(5, 5).ch, "█");        // diagonale
});

test("tools : box fait le contour, fillBox remplit", () => {
  const s = new Sprite(5, 5);
  tools.box(s, 1, 1, 3, 3, INK);
  assert.equal(s.get(1, 1).ch, "█");
  assert.equal(s.get(3, 3).ch, "█");
  assert.equal(s.get(2, 2).ch, " ");        // centre vide

  const f = new Sprite(5, 5);
  tools.fillBox(f, 1, 1, 3, 3, INK);
  assert.equal(f.get(2, 2).ch, "█");
});

test("tools : circle place les points cardinaux", () => {
  const s = new Sprite(11, 11);
  tools.circle(s, 5, 5, 4, INK);
  assert.equal(s.get(5, 1).ch, "█");        // haut
  assert.equal(s.get(5, 9).ch, "█");        // bas
  assert.equal(s.get(1, 5).ch, "█");        // gauche
  assert.equal(s.get(9, 5).ch, "█");        // droite
});

test("tools : fillCircle remplit le centre", () => {
  const s = new Sprite(11, 11);
  tools.fillCircle(s, 5, 5, 4, INK);
  assert.equal(s.get(5, 5).ch, "█");
});

test("tools : floodFill remplit une région close", () => {
  const s = new Sprite(5, 5);
  tools.box(s, 1, 1, 3, 3, INK);            // enceinte
  tools.floodFill(s, 2, 2, { ch: "▒", fg: 2, bg: 15 });
  assert.equal(s.get(2, 2).ch, "▒");
  assert.equal(s.get(0, 0).ch, " ");        // extérieur non touché
});

test("tools : floodFill respecte un mur", () => {
  const s = new Sprite(5, 5);
  for (let y = 0; y < 5; y++) s.put(2, y, "█", 1, 15);  // mur vertical
  tools.floodFill(s, 0, 0, { ch: "▒", fg: 2, bg: 15 });
  assert.equal(s.get(0, 4).ch, "▒");
  assert.equal(s.get(4, 0).ch, " ");        // derrière le mur
});

test("tools : floodFill no-op si encre == cible", () => {
  const s = new Sprite(3, 3);
  tools.floodFill(s, 1, 1, { ch: " ", fg: 0, bg: 15 });
  assert.equal(s.countNonEmpty(), 0);
});

test("tools : floodFill termine en ne changeant que le papier", () => {
  const s = new Sprite(4, 4);                 // tout espace, bg 15
  tools.floodFill(s, 0, 0, { ch: " ", bg: 3 }); // même caractère, papier différent
  assert.equal(s.get(3, 3).bg, 3);            // toute la grille recolorée
  assert.equal(s.get(0, 0).ch, " ");
});

test("tools : flipH mire et déplace le point chaud", () => {
  const s = new Sprite(3, 1, { hx: 0 });
  s.put(0, 0, "A", 1, 15);
  tools.flipH(s);
  assert.equal(s.get(2, 0).ch, "A");
  assert.equal(s.hx, 2);
});

test("tools : flipV mire verticalement", () => {
  const s = new Sprite(1, 3, { hy: 0 });
  s.put(0, 0, "A", 1, 15);
  tools.flipV(s);
  assert.equal(s.get(0, 2).ch, "A");
  assert.equal(s.hy, 2);
});

test("tools : rotate 90° horaire (carré)", () => {
  const s = new Sprite(2, 2);
  s.put(0, 0, "a", 1, 15);
  s.put(1, 0, "b", 1, 15);
  s.put(0, 1, "c", 1, 15);
  s.put(1, 1, "d", 1, 15);
  assert.equal(tools.rotate(s), true);
  assert.equal(s.get(0, 0).ch, "c");
  assert.equal(s.get(1, 0).ch, "a");
  assert.equal(s.get(0, 1).ch, "d");
  assert.equal(s.get(1, 1).ch, "b");
});

test("tools : rotate refuse un sprite non carré", () => {
  const s = new Sprite(3, 2);
  assert.equal(tools.rotate(s), false);
});

test("tools : reduce recadre sur le contenu", () => {
  const s = new Sprite(5, 5, { hx: 3, hy: 3 });
  s.put(3, 3, "X", 1, 15);
  assert.equal(tools.reduce(s), true);
  assert.equal(s.w, 1);
  assert.equal(s.h, 1);
  assert.equal(s.get(0, 0).ch, "X");
  assert.equal(s.hx, 0);                    // 3 - 3
});

test("tools : scroll enroule le contenu", () => {
  const s = new Sprite(3, 1);
  s.put(0, 0, "A", 1, 15);
  tools.scroll(s, 1, 0);
  assert.equal(s.get(1, 0).ch, "A");
});

/* ------------------------------------------------------------------ */
/*  Historique                                                         */
/* ------------------------------------------------------------------ */

test("history : undo/redo", () => {
  const h = new History();
  h.push("A");
  h.push("B");
  h.push("C");
  assert.equal(h.canUndo, true);
  assert.equal(h.undo(), "B");
  assert.equal(h.undo(), "A");
  assert.equal(h.canUndo, false);
  assert.equal(h.redo(), "B");
  h.push("D");                              // tronque la branche redo
  assert.equal(h.canRedo, false);
  assert.equal(h.current(), "D");
});

/* ------------------------------------------------------------------ */
/*  Pages Unicode                                                      */
/* ------------------------------------------------------------------ */

test("charset : une page fait 256 entrées", () => {
  assert.equal(pageGlyphs(0x25).length, 256);
  assert.equal(pageBase(pageOf(0x2588)), 0x2500);
});

test("charset : la page 0x25 contient filet et blocs", () => {
  const page = pageGlyphs(0x25);
  assert.equal(page[0x00].ch, "─");          // U+2500
  assert.equal(page[0x88].ch, "█");          // U+2588
});

test("charset : les plans astraux (emoji) sont supportés", () => {
  const page = pageGlyphs(0x1f6);
  assert.equal(page[0].cp, 0x1f600);
  assert.equal(page[0].ch, "😀");
  assert.equal(page[0].ch.length, 2);        // paire de substituts UTF-16
});

test("charset : isGlyph écarte contrôles et substituts", () => {
  assert.equal(isGlyph(0x0a), false);
  assert.equal(isGlyph(0xd800), false);
  assert.equal(isGlyph(0x2588), true);
});

test("charset : catalogues renseignés", () => {
  assert.ok(NAMED_PAGES.length >= 10);
  assert.ok(QUICK_GLYPHS.includes("█"));
});

/* ------------------------------------------------------------------ */
/*  Polices                                                            */
/* ------------------------------------------------------------------ */

test("fonts : catalogue + repli + URL Google", () => {
  assert.ok(FONTS.length >= 4);
  assert.equal(fontById("vt323").id, "vt323");
  assert.equal(fontById("inconnu").id, "vt323");  // repli
  assert.match(googleFontsUrl(), /VT323/);
});

/* ------------------------------------------------------------------ */
/*  Banque + animation                                                 */
/* ------------------------------------------------------------------ */

test("bank : gestion des sprites", () => {
  const b = new SpriteBank();
  const i = b.newSprite(4, 3, "un");
  assert.equal(i, 0);
  b.newSprite(2, 2, "deux");
  assert.equal(b.count, 2);
  b.remove(0);
  assert.equal(b.count, 1);
  assert.equal(b.get(0).name, "deux");
});

test("bank : round-trip JSON avec couleurs par cellule et animation", () => {
  const b = new SpriteBank();
  const i = b.newSprite(3, 2, "hero");
  b.get(i).put(1, 1, "☺", 6, 9);
  b.get(i).hx = 2;
  b.ensureAnimation(7);
  const text = b.serialize();
  const r = SpriteBank.parse(text);
  assert.equal(r.count, 1);
  assert.equal(r.get(0).name, "hero");
  assert.deepEqual(r.get(0).get(1, 1), { ch: "☺", fg: 6, bg: 9 });
  assert.equal(r.get(0).hx, 2);
  assert.deepEqual(r.palette, SPRITE_PALETTE);
  assert.equal(r.animation.frames[0].delay, 7);
});

test("bank : restore en place garde la référence", () => {
  const b = new SpriteBank();
  b.newSprite(2, 2, "a");
  const saved = b.serialize();
  b.newSprite(2, 2, "b");
  assert.equal(b.count, 2);
  b.restore(saved);
  assert.equal(b.count, 1);
  assert.equal(b.get(0).name, "a");
});

/* ------------------------------------------------------------------ */
/*  Sauvegarde / export                                                */
/* ------------------------------------------------------------------ */

test("save : toText une rangée par ligne", () => {
  const s = new Sprite(3, 2);
  s.put(0, 0, "A", 1, 15);
  s.put(0, 1, "B", 1, 15);
  assert.equal(toText(s), "A\nB\n");
});

test("save : toAnsi émet des codes SGR 24 bits", () => {
  const s = new Sprite(2, 1);
  s.put(0, 0, "X", 1, 4);
  const a = toAnsi(s);
  assert.match(a, /\x1b\[38;2;255;0;0m/);    // encre rouge (indice 1)
  assert.match(a, /\x1b\[48;2;0;0;255m/);    // papier bleu (indice 4)
  assert.match(a, /\x1b\[0m/);               // reset
});

test("save : makeExport produit les trois formats", () => {
  const b = new SpriteBank();
  b.newSprite(2, 2, "demo");
  const j = makeExport(b, "json");
  const t = makeExport(b, "txt");
  const a = makeExport(b, "ansi");
  assert.equal(j.name, "demo.stasprite");
  assert.match(j.mime, /application\/json/);
  assert.equal(t.name, "demo.txt");
  assert.equal(a.name, "demo.ans");
});

test("save : isBankJSON + loadBank", () => {
  const b = new SpriteBank();
  b.newSprite(2, 2, "x");
  const text = b.serialize();
  assert.equal(isBankJSON(text), true);
  assert.equal(isBankJSON("{\"magic\":\"autre\"}"), false);
  assert.equal(isBankJSON("pas du json"), false);
  assert.equal(loadBank(text).get(0).name, "x");
});
