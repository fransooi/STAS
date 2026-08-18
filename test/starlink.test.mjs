/*
 *  Smoke-test headless de examples/star-link-demo.bas
 *  --------------------------------------------------------------------
 *  La démo boucle indefiniment (goto 1000) : on la coupe par un Break
 *  apres quelques milliers de respirations. inkey renvoie toujours " "
 *  donc chaque page (repeat/until A$=" ") passe instantanement.
 *  Si toutes les instructions manquantes (mode/flash/key/hide/click/
 *  reserve as screen/start/ink/rbox/centre/draw-play) tournent, la
 *  demo s'execute sans erreur BASIC autre que le Break volontaire (17).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stas, ERR } from "../packages/stas-core/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "examples", "star-link-demo.bas"), "utf8");

test("star-link-demo.bas : tourne sans erreur BASIC (smoke headless)", async () => {
  const stas = new Stas({ inkey: () => " ", sleep: () => {} });
  let ticks = 0;
  stas.io.tick = () => {
    if (++ticks > 500) stas.requestBreak();
  };
  stas.loadSource(src);
  try {
    await stas.run();
  } catch (e) {
    // Seule sortie attendue : notre Break volontaire apres le parcours
    assert.equal(e.code, ERR.BREAK, `erreur BASIC inattendue : ${e.message}`);
  }
  assert.ok(stas.gfx, "MODE 0 doit avoir cree le plan gfx");
  assert.equal(stas.buffer.width, 80);
  assert.equal(stas.buffer.height, 25);
  assert.ok(ticks > 1, "la demo doit avoir tourne plus d'une respiration");
  // la demo a vraiment dessine (version croit a chaque plot, jamais reset)
  assert.ok(
    stas.io.physic.version > 10,
    "l'ecran physique doit avoir recu des tracés (rbox/circle/draw)"
  );
  const drawn = stas.io.physic.touched.reduce((a, b) => a + b, 0);
  assert.ok(drawn > 100, `pixels dessinés attendus, reçu ${drawn}`);
});
