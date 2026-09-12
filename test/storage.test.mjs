/*
 *  STAS — tests du connecteur stockage mockup (stas-world/src/storage.js)
 *  Contrat de messages AWI : commande "stas:save"/"stas:load",
 *  réponse Answer { success, error, data, message, info }.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalStasConnector,
  answerOk,
  answerError,
} from "../packages/stas-world/src/storage.js";

test("answers : formes awi.base.Answer", () => {
  const ok = answerOk({ path: "a.bas" });
  assert.equal(ok.success, true);
  assert.equal(ok.error, false);
  assert.equal(ok.message, "");
  const ko = answerError("stas:file-not-found", { stosCode: 48 });
  assert.equal(ko.success, false);
  assert.equal(ko.error, true);
  assert.equal(ko.data.stosCode, 48);
});

test("connector : routage stas:save/stas:load -> command_save/command_load", async () => {
  const c = new LocalStasConnector({ user: "loic", root: tmpdir() });
  // sans path -> command_save répond bad-file-name (prouve le routage)
  const a = await c.sendMessage("stas:save", { source: "10 print 1" });
  assert.equal(a.success, false);
  assert.equal(a.message, "stas:bad-file-name");
  assert.equal(a.data.stosCode, 53);
  const b = await c.sendMessage("stas:load", {});
  assert.equal(b.success, false);
  assert.equal(b.data.stosCode, 53);
});

test("connector : roundtrip fichier + chemin relatif au root", async () => {
  const root = mkdtempSync(join(tmpdir(), "stas-storage-"));
  try {
    const c = new LocalStasConnector({ user: "loic", root });
    const saved = await c.sendMessage("stas:save", {
      path: "demo.bas",
      source: '10 print "hello"\n20 print "bye"',
    });
    assert.equal(saved.success, true);
    assert.equal(saved.data.path, join(root, "demo.bas"));
    assert.match(readFileSync(join(root, "demo.bas"), "utf8"), /print "hello"/);

    const loaded = await c.sendMessage("stas:load", { path: "demo.bas" });
    assert.equal(loaded.success, true);
    assert.match(loaded.data.source, /hello/);
    assert.equal(loaded.data.path, join(root, "demo.bas"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("connector : fichier introuvable -> stosCode 48", async () => {
  const c = new LocalStasConnector({ root: tmpdir() });
  const a = await c.sendMessage("stas:load", { path: join(tmpdir(), "stas-nope-{}.bas") });
  assert.equal(a.success, false);
  assert.equal(a.data.stosCode, 48);
  assert.equal(a.message, "stas:file-not-found");
});

test("connector : examples: remappe sur le dossier examples de l'installation", async () => {
  // root = répertoire quelconque (comme un cwd loin de STAS) : examples:
  // doit quand même résoudre vers l'installation, comme STAS.bat.
  const elsewhere = mkdtempSync(join(tmpdir(), "stas-elsewhere-"));
  try {
    const c = new LocalStasConnector({ root: elsewhere });
    assert.equal(
      c.resolvePath("examples:hello.bas"),
      join(c.stasRoot, "examples", "hello.bas")
    );
    const a = await c.sendMessage("stas:load", { path: "examples:hello.bas" });
    assert.equal(a.success, true, `échec : ${a.message}`);
    assert.match(a.data.path, /[\\/]examples[\\/]hello\.bas$/);
    assert.ok(a.data.source.length > 0, "la source ne doit pas être vide");
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("connector : commande inconnue -> awi:command-not-found", async () => {
  const c = new LocalStasConnector({});
  const a = await c.sendMessage("stas:teleport", {});
  assert.equal(a.success, false);
  assert.equal(a.message, "awi:command-not-found");
});

test("connector : stas:bsave/stas:bload roundtrip binaire", async () => {
  const root = mkdtempSync(join(tmpdir(), "stas-bin-"));
  try {
    const c = new LocalStasConnector({ root });
    const b = await c.sendMessage("stas:bsave", {
      path: "blk.bin",
      data: [0, 1, 127, 255],
    });
    assert.equal(b.success, true);
    assert.equal(b.data.bytes, 4);
    assert.deepEqual([...readFileSync(join(root, "blk.bin"))], [0, 1, 127, 255]);

    const l = await c.sendMessage("stas:bload", { path: "blk.bin" });
    assert.equal(l.success, true);
    assert.deepEqual(l.data.data, [0, 1, 127, 255]);

    const missing = await c.sendMessage("stas:bload", { path: "nope.bin" });
    assert.equal(missing.data.stosCode, 48);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("connector : BSAVE/BLOAD de bout en bout (Stas + LocalStasConnector)", async () => {
  const { Stas } = await import("../packages/stas-core/index.js");
  const root = mkdtempSync(join(tmpdir(), "stas-bin-e2e-"));
  try {
    const c = new LocalStasConnector({ root });
    const stas = new Stas({ sendCommand: (cmd, p) => c.sendMessage(cmd, p) });
    stas.loadSource([
      "10 poke 2000,11:poke 2001,22",
      '20 bsave "blk.bin",2000 to 2001',
      "30 poke 2000,0:poke 2001,0",
      '40 bload "blk.bin",2000',
      "50 print peek(2000);peek(2001)",
    ]);
    await stas.run();
    assert.ok(stas.buffer.toText().includes("1122"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("connector : enveloppe reply façon EdHttp { id, responseTo, parameters }", async () => {
  const c = new LocalStasConnector({});
  const msg = { id: "m1", command: "stas:save", parameters: { path: "x" } };
  const env = c.reply({ saved: true }, msg);
  assert.equal(env.responseTo, "stas:save");
  assert.deepEqual(env.parameters, { saved: true });
  assert.ok(typeof env.id === "string" && env.id.length > 0);
});

test("connector : core Stas + LocalStasConnector de bout en bout", async () => {
  const { Stas } = await import("../packages/stas-core/index.js");
  const root = mkdtempSync(join(tmpdir(), "stas-e2e-"));
  try {
    const c = new LocalStasConnector({ user: "loic", root });
    const stas = new Stas({ sendCommand: (cmd, p) => c.sendMessage(cmd, p) });
    stas.feedLine('10 print "bonjour"');
    await stas.execDirect('save "e2e.bas"');
    assert.equal(stas.io.currentPath, join(root, "e2e.bas"));

    await stas.execDirect("new");
    assert.ok(stas.program.isEmpty);
    await stas.execDirect('load "e2e.bas"');
    assert.equal(stas.program.lines.length, 1);
    await stas.execDirect("run");
    assert.ok(stas.buffer.toText().includes("bonjour"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
