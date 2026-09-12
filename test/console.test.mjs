/*
 *  Tests @stas/console — la sortie terminal en ascii-art.
 *  --------------------------------------------------------------------
 *  Le renderer ANSI lit cellAt() comme le canvas web : il compose
 *  texte + conversion gfx du core (ascii-converter, quadrant blocks)
 *  + sprites. Ces tests couvrent ce chemin de rendu, sans instancier
 *  ConsoleInput (stdin raw) pour rester isolés :
 *    - une scène gfx sort bien en « presque image » dans le flux ANSI ;
 *    - examples/sinus-anim.bas s'anime (plusieurs frames) et s'arrête.
 *  --------------------------------------------------------------------
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stas } from "../packages/stas-core/index.js";
import { AnsiRenderer } from "../packages/stas-console/src/ansi-renderer.js";

const here = dirname(fileURLToPath(import.meta.url));

/** out factice : capture tout ce que le renderer écrit. */
function capture() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join("") };
}

/** Les traps console : chaque tick / WAIT repeint le terminal. */
function wire(stas, renderer) {
  stas.io.onScreen = () => renderer.start();
  stas.io.flush = () => renderer.render();
  stas.io.tick = async () => renderer.render();
  stas.io.sleep = (ms) =>
    new Promise((r) => {
      renderer.render();
      setTimeout(r, ms);
    });
  stas.io.readLine = () => Promise.resolve(null);
}

/**
 * Mini décodeur ANSI -> grille de caractères. Interprète ce qu'émet
 * AnsiRenderer : positionnement [y;xH (les SGR de couleur sont sautés).
 */
function decodeAnsi(text, width, height) {
  const grid = Array.from({ length: height }, () => new Array(width).fill(" "));
  let r = 0;
  let c = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      let body = "";
      while (j < text.length && !/[A-Za-z]/.test(text[j])) {
        body += text[j];
        j++;
      }
      if (text[j] === "H") {
        const [yy, xx] = body.split(";").map((v) => parseInt(v, 10));
        r = (yy || 1) - 1;
        c = (xx || 1) - 1;
      }
      i = j + 1;
      continue;
    }
    if (ch === "\n") {
      r++;
      c = 0;
    } else if (ch >= " ") {
      if (r >= 0 && r < height && c >= 0 && c < width) grid[r][c] = ch;
      c++;
    }
    i++;
  }
  return grid;
}

const rows = (grid) => grid.map((row) => row.join(""));
const QUADS = /[▘▝▖▗▀▄▌▐▛▜▙▟█]/;

test("console : MODE + CIRCLE sort des quadrant blocks en ANSI", async () => {
  const out = capture();
  const stas = new Stas({ width: 80, height: 25 });
  const renderer = new AnsiRenderer(stas, { out });
  wire(stas, renderer);
  stas.io.inkey = () => "";
  stas.loadSource(
    "10 MODE 0,40,10\n20 PAPER 15\n30 PEN 0\n40 CLS\n50 CIRCLE 160,100,80,1\n",
    { merge: false },
  );
  await stas.run();
  renderer.render(true);
  const text = out.text();
  assert.ok(text.includes("\x1b[38;2;"), "couleurs ANSI 24 bits");
  const flat = rows(decodeAnsi(text, 40, 10)).join("");
  assert.ok(QUADS.test(flat), "le cercle est rendu en ascii-art");
});

test("console : sinus-anim.bas s'anime puis s'arrête sur Q", async () => {
  const src = readFileSync(join(here, "..", "examples", "sinus-anim.bas"), "utf8");
  const out = capture();
  const stas = new Stas({ width: 80, height: 25 });
  const renderer = new AnsiRenderer(stas, { out });
  wire(stas, renderer);
  let calls = 0;
  stas.io.inkey = () => (++calls > 8 ? "q" : ""); // quelques frames puis quitte
  stas.loadSource(src, { merge: false });
  await stas.run();
  renderer.render(true);
  // une séquence de retour ligne 1 par frame rendue
  const frames = (out.text().match(/\x1b\[1;1H/g) || []).length;
  assert.ok(frames >= 3, `plusieurs frames rendues (eu ${frames})`);
  const lines = rows(decodeAnsi(out.text(), 80, 25));
  assert.ok(QUADS.test(lines.join("")), "la sinusoïde est en ascii-art");
  assert.ok(lines.some((l) => l.includes("touche Q")), "le texte est affiché");
});

test("console : COLOUR repeint la palette ANSI (palette vivante)", async () => {
  const out = capture();
  const stas = new Stas({ width: 20, height: 3 });
  const renderer = new AnsiRenderer(stas, { out });
  wire(stas, renderer);
  stas.io.inkey = () => "";
  stas.loadSource(
    ["10 cls", "20 colour 0,$700", "30 paper 15", "40 pen 0", '50 print "A"'],
    { merge: false },
  );
  await stas.run();
  renderer.render(true);
  const text = out.text();
  assert.ok(text.includes("\x1b[38;2;255;0;0m"), "encre 0 devenue rouge vif ($700)");
  assert.ok(!text.includes("\x1b[38;2;255;255;255m"), "le blanc GEM a disparu");
});
