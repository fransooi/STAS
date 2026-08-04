/*
 *  Smoke-test headless de la démo examples/demo-gfx.bas
 *  --------------------------------------------------------------------
 *  L'agent (et la CI) n'ont pas de navigateur : ce test exécute la démo
 *  dans le cœur avec un io mocké (inkey renvoie toujours une touche, donc
 *  chaque WAIT KEY passe instantanément) et vérifie qu'aucune ligne ne
 *  lève (syntaxe, couleur hors 0..15, gfx sans MODE, etc.). C'est notre
 *  « navigateur » pour la démo.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stas } from "../packages/stas-core/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "examples", "demo-gfx.bas"), "utf8");

test("demo-gfx.bas : s'execute sans erreur (smoke test headless)", async () => {
  const stas = new Stas({ inkey: () => "a", sleep: () => {} });
  stas.loadSource(src);
  try {
    await stas.run();
  } catch (e) {
    assert.fail(`erreur BASIC dans demo-gfx.bas : code=${e.code} ${e.message}`);
  }
  assert.ok(stas.gfx, "le plan gfx doit exister (MODE 0 a tourne)");
  assert.equal(stas.buffer.width, 80);
  assert.equal(stas.buffer.height, 25);
});
