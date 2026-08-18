/*
 *  Tests config partagée (core) — parseIni / parseRes, utilisés par
 *  les adaptateurs console (?--config=) et web (?config=).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseIni, parseRes } from "../packages/stas-core/index.js";

test("parseIni : sections, commentaires, clés minuscules, valeurs trimmées", () => {
  const ini = parseIni(
    [
      "; commentaire",
      "# autre commentaire",
      "",
      "global=sans section",
      "[console]",
      "screen=80x25",
      "  Resize = follow  ", // clé -> minuscule, valeur trimmée
      "[WEB]",               // section -> minuscule
      "renderer=aalib",
      "ligne sans egal",     // ignorée
      "=sans cle",           // ignorée
    ].join("\n"),
  );
  assert.equal(ini[""].global, "sans section");
  assert.equal(ini.console.screen, "80x25");
  assert.equal(ini.console.resize, "follow");
  assert.equal(ini.web.renderer, "aalib");
});

test("parseIni : CRLF, texte vide, sections vides", () => {
  assert.deepEqual(parseIni("[web]\r\nres=160x50\r\n"), {
    "": {},
    web: { res: "160x50" },
  });
  assert.deepEqual(parseIni(""), { "": {} });
  assert.deepEqual(parseIni(null), { "": {} });
  assert.deepEqual(parseIni("[seul]"), { "": {}, seul: {} });
});

test("parseRes : valide, bornes, espaces", () => {
  assert.deepEqual(parseRes("80x25"), { cols: 80, rows: 25 });
  assert.deepEqual(parseRes(" 160 X 50 "), { cols: 160, rows: 50 });
  assert.deepEqual(parseRes("10x5"), { cols: 10, rows: 5 });
  assert.deepEqual(parseRes("320x200"), { cols: 320, rows: 200 });
});

test("parseRes : rejets (bornes, format)", () => {
  assert.equal(parseRes("9x25"), null);     // trop étroit
  assert.equal(parseRes("321x50"), null);   // trop large
  assert.equal(parseRes("80x4"), null);     // trop court
  assert.equal(parseRes("80x201"), null);   // trop haut
  assert.equal(parseRes("80;25"), null);
  assert.equal(parseRes("80x"), null);
  assert.equal(parseRes(""), null);
  assert.equal(parseRes(null), null);
});
