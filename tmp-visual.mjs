// Rendu ANSI temporaire (verification visuelle du converter) — a supprimer.
import { Stas, STOS_PALETTE } from "./packages/stas-core/index.js";
import { readFileSync } from "node:fs";

const file = process.argv[2] || "tmp-scene.bas";
const stas = new Stas({ inkey: () => "q", sleep: () => {} });
stas.loadSource(readFileSync(new URL(file, import.meta.url), "utf8"));
await stas.run();

const b = stas.buffer;
let s = "\n";
for (let y = 0; y < b.height; y++) {
  for (let x = 0; x < b.width; x++) {
    const c = stas.cellAt(x, y);
    const [r, g, bl] = STOS_PALETTE[c.bg & 15];
    const [fr, fg, fb] = STOS_PALETTE[c.fg & 15];
    s += `\x1b[48;2;${r};${g};${bl}m\x1b[38;2;${fr};${fg};${fb}m${c.ch}`;
  }
  s += "\x1b[0m\n";
}
console.log(s);
