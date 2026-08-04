#!/usr/bin/env node
/*
 *  stas-world — la console STAS, porte d'entree des mondes AWI.
 *  --------------------------------------------------------------------
 *  Iteration 2 : "ENTER STAS -> now in STAS CONSOLE = AWI WITH STAS
 *  WORLD". Une seule commande locale, deux facons de s'en servir :
 *
 *    stas-world                 console interactive : BASIC + !shell +
 *                               parole aux mondes (.texte) + enter/leave
 *    stas-world fichier.bas     charge et execute (comme stas)
 *    stas-world --serve         protocole JSON lignes sur stdio :
 *                               WorldSTAS (awi.worlds.WorldStas) spawn
 *                               ce processus et lui parle.
 *  --------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Stas, StosError, makeEcho, introText } from "../../stas-core/index.js";
import { WorldBridge } from "../src/world.js";
import { out, isForStasWorld } from "../src/protocol.js";

/** La langue de la machine (comme stas-console). */
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

/* ==================================================================== *
 *  Mode --serve : WorldSTAS parle JSON lignes sur stdio                 *
 * ==================================================================== */
function serve() {
  const stas = new Stas({ width: 80, height: 25, langue: machineLangue() });
  const bridge = new WorldBridge({ stas });
  const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");

  // sorties monde/shell : texte brut au fil de l'eau
  bridge.on("output", (text) => {
    stas.buffer.write(text);
    send(out("output", { text }));
  });
  bridge.on("message", send);

  // INPUT du BASIC : question a l'hote
  let pendingInput = null;
  stas.io.readLine = () =>
    new Promise((res) => {
      send(out("input:request"));
      pendingInput = res;
    });
  stas.io.inkey = () => "";
  stas.io.now = () => Date.now();
  stas.io.rnd = Math.random;
  stas.io.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  stas.io.tick = async () => {};
  stas.io.onSystem = () => process.exit(0);

  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return; // ligne non-JSON ignoree
    }
    if (!isForStasWorld(m)) return;
    switch (m.type) {
      case "run":
        if (typeof m.source === "string") stas.loadSource(m.source, { merge: false });
        try {
          await stas.run();
          send(out("output", { text: stas.buffer.toText() }));
          send(out("done"));
        } catch (e) {
          send(out("error", { message: e.message, code: e.code ?? -1 }));
        }
        break;
      case "line":
        await bridge.handleLine(String(m.text ?? ""));
        send(out("output", { text: stas.buffer.toText() }));
        send(out("done"));
        break;
      case "input":
        if (pendingInput) pendingInput(String(m.text ?? ""));
        pendingInput = null;
        break;
      case "stop":
        stas.requestBreak();
        break;
      default:
        bridge.handleMessage(m); // auth:granted, world:say, ...
    }
  });
  rl.on("close", () => process.exit(0));
  send(out("ready"));
}

/* ==================================================================== *
 *  Mode interactif : la console prend vie                               *
 * ==================================================================== */
async function interactive(argv) {
  const width = Math.max(80, (process.stdout.columns || 80) - 1);
  const height = Math.max(25, (process.stdout.rows || 25) - 1);
  const langue = machineLangue();
  const stas = new Stas({ width, height, langue });
  const bridge = new WorldBridge({ stas });

  // meme habillage que stas-console (rendu ANSI + clavier brut)
  const { AnsiRenderer } = await import("../../stas-console/src/ansi-renderer.js");
  const { ConsoleInput } = await import("../../stas-console/src/input.js");
  const renderer = new AnsiRenderer(stas.buffer);
  const input = new ConsoleInput(stas);
  input.onDirty = () => renderer.render();

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

  // les sorties monde/shell du pont s'ecrivent dans le buffer STAS
  bridge.on("output", (t) => {
    stas.buffer.write(t);
    renderer.render();
  });

  const file = argv[0];
  if (file) {
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
    process.stdout.write("\n");
    input.stop();
    return;
  }

  renderer.start();
  stas.buffer.write(introText(langue));
  stas.buffer.write(
    ".(oo) STAS WORLD — ! pour le shell, enter <monde> pour AWI, worlds pour la liste.\n"
  );
  for (;;) {
    // l'invite change selon qu'on est dans STAS ou dans un monde AWI
    stas.buffer.write(bridge.currentWorld ? `.(${bridge.user}) ` : "Ok\n");
    renderer.render();
    const line = await input.readLine(makeEcho(stas.buffer));
    if (line === null) break;
    await bridge.handleLine(line);
    renderer.render();
  }
  input.stop();
  renderer.stop();
}

/* -------------------------------------------------------------------- */
const args = process.argv.slice(2);
if (args.includes("--serve")) {
  serve();
} else {
  interactive(args.filter((a) => !a.startsWith("--"))).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
