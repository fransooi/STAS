/*
 *  Tests @stas/world — dispatch, shell hote, porte Legal-Fractal,
 *  navigation entre mondes, protocole.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Stas } from "../packages/stas-core/index.js";
import { WorldBridge, PROMPTS } from "../packages/stas-world/src/world.js";
import { runShell } from "../packages/stas-world/src/shell.js";
import {
  out,
  inn,
  isForStasWorld,
} from "../packages/stas-world/src/protocol.js";

function makeBridge(opts = {}) {
  const stas = new Stas({ width: 80, height: 25 });
  const bridge = new WorldBridge({ stas, authDelay: 0, ...opts });
  const chunks = [];
  bridge.on("output", (t) => chunks.push(t));
  const text = () => chunks.join("") + "\n" + stas.buffer.toText();
  return { stas, bridge, text };
}

test("protocole : formes des messages", () => {
  assert.deepEqual(out("ready"), { source: "stas-world", type: "ready" });
  assert.deepEqual(inn("line", { text: "x" }), {
    target: "stas-world",
    type: "line",
    text: "x",
  });
  assert.equal(isForStasWorld(inn("stop")), true);
  assert.equal(isForStasWorld({ target: "autre" }), false);
  assert.equal(isForStasWorld(null), false);
});

test("shell hote : !echo passe au systeme", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine("!echo hello-dos");
  assert.match(text(), /hello-dos/);
});

test("runShell : code de sortie remonte", async () => {
  const { code } = await runShell("echo ok");
  assert.equal(code, 0);
});

test("BASIC : la ligne sans prefixe va a l'interpreteur", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine("print 6*7");
  assert.match(text(), /42/);
});

test("enter : porte Legal-Fractal puis entree dans le monde", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine("enter network");
  assert.match(text(), /legal-fractal/);
  assert.match(text(), /granted/);
  assert.match(text(), />>>oo>>>/);          // voix du monde
  assert.equal(bridge.currentWorld, "network");
});

test("enter : authProvider qui refuse bloque l'entree", async () => {
  const { bridge } = makeBridge({ authProvider: () => false });
  await bridge.handleLine("enter network");
  assert.equal(bridge.currentWorld, null);
});

test("leave : retour a STAS", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine("enter network");
  await bridge.handleLine("leave");
  assert.equal(bridge.currentWorld, null);
  assert.match(text(), /back to STAS/);
});

test(".texte : parole au monde courant seulement", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine(".bonjour");        // pas de monde -> info
  assert.match(text(), /enter <monde>/);
  await bridge.handleLine("enter network");
  await bridge.handleLine(".did it work?");  // monde actif -> echo simule
  assert.match(text(), /did it work\?/);
});

test("worlds : liste des mondes connus", async () => {
  const { bridge, text } = makeBridge();
  await bridge.handleLine("worlds");
  assert.match(text(), /network/);
});

test("heberge : les messages de WorldSTAS sont rendus", async () => {
  const { bridge, text } = makeBridge();
  bridge.on("message", () => {});             // un hote est branche
  await bridge.handleLine("enter network");   // plus de simulation locale
  assert.doesNotMatch(text(), /Welcome/);
  bridge.handleMessage({ type: "world:say", text: "Welcome to the network world!" });
  assert.match(text(), /Welcome to the network world!/);
});

test("PROMPTS : la grammaire .() .[] .>>> est stable", () => {
  assert.equal(PROMPTS.info, ".(oo) ");
  assert.equal(PROMPTS.progress, ".[==] ");
  assert.equal(PROMPTS.world, ".>>>oo>>> ");
});
