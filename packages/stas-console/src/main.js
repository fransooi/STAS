/*
 *  STAS console — point d'entrée.
 *  --------------------------------------------------------------------
 *  Deux modes :
 *    stas fichier.bas  → charge et exécute
 *    stas              → éditeur interactif, invite "Ok" comme le STOS
 *  --------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { Stas, StosError, makeEcho, introText } from "../../stas-core/index.js";
import { AnsiRenderer } from "./ansi-renderer.js";
import { ConsoleInput } from "./input.js";

/** La langue de la machine : francais si le systeme est en francais. */
function machineLangue() {
  const loc = (
    process.env.LANG ||
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    ""
  ).toLowerCase();
  return loc.startsWith("fr") ? 1 : 0;
}

export async function main(argv) {
  // le buffer épouse la taille du terminal (80x25 minimum STOS)
  const width = Math.max(80, (process.stdout.columns || 80) - 1);
  const height = Math.max(25, (process.stdout.rows || 25) - 1);
  const langue = machineLangue();
  const stas = new Stas({ width, height, langue });

  const renderer = new AnsiRenderer(stas);
  const input = new ConsoleInput(stas);
  input.onDirty = () => renderer.render();
  stas.io.onScreen = () => renderer.start();

  // branchement des traps STAS sur le terminal
  stas.io.readLine = (echo) => input.readLine(echo);
  stas.io.inkey = () => input.inkey();
  stas.io.flush = () => renderer.render();
  stas.io.tick = async () => renderer.render();
  stas.io.sleep = (ms) =>
    new Promise((r) => {
      renderer.render();
      setTimeout(r, ms);
    });
  stas.io.onSystem = () => {
    input.stop();
    renderer.stop();
    process.exit(0);
  };

  const file = argv[0];
  if (file) {
    // --- mode fichier -------------------------------------------------
    try {
      stas.loadSource(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(e instanceof StosError ? e.message : e);
      process.exit(1);
    }
    try {
      await stas.run();
    } catch (e) {
      if (e instanceof StosError) stas.buffer.write(e.message + "\n");
      else throw e;
    }
    renderer.render();
    if (renderer._started) renderer.stop();
    else process.stdout.write("\n");
    input.stop();
    return;
  }

  // --- mode interactif -------------------------------------------------
  renderer.start();
  stas.buffer.write(introText(langue));
  for (;;) {
    stas.buffer.write("Ok\n");
    renderer.render();
    const line = await input.readLine(makeEcho(stas.buffer));
    if (line === null) break; // fin d'entrée (pipe)
    const kind = stas.feedLine(line);
    if (kind === "direct") {
      try {
        await stas.execDirect(line);
      } catch (e) {
        if (e instanceof StosError) stas.buffer.write(e.message + "\n");
        else throw e;
      }
    }
    renderer.render();
  }
  input.stop();
  renderer.stop();
}
