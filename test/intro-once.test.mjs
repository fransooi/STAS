/*
 *  intro-once : bannière « une fois par boot » — cycle du marqueur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldShowIntro } from "../packages/stas-console/src/intro-once.js";

const NOW = 1_700_000_000_000;      // horloge fixe
const UPTIME = 3600;                // machine allumée depuis 1 h

test("première fois (pas de marqueur) : bannière + marqueur posé", () => {
  const dir = mkdtempSync(join(tmpdir(), "stas-intro-"));
  try {
    const f = join(dir, "marker.json");
    assert.equal(shouldShowIntro({ file: f, now: NOW, uptime: UPTIME }), true);
    const m = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(m.t, NOW);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deuxième fois (même boot) : plus de bannière", () => {
  const dir = mkdtempSync(join(tmpdir(), "stas-intro-"));
  try {
    const f = join(dir, "marker.json");
    shouldShowIntro({ file: f, now: NOW, uptime: UPTIME });
    assert.equal(
      shouldShowIntro({ file: f, now: NOW + 60_000, uptime: UPTIME + 60 }),
      false
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("après un reboot : la bannière revient", () => {
  const dir = mkdtempSync(join(tmpdir(), "stas-intro-"));
  try {
    const f = join(dir, "marker.json");
    shouldShowIntro({ file: f, now: NOW, uptime: UPTIME });
    // reboot : l'horloge avance peu, mais l'uptime retombe près de zéro
    // -> bootMs saute après le ancien marqueur
    assert.equal(
      shouldShowIntro({ file: f, now: NOW + 120_000, uptime: 30 }),
      true
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("marqueur corrompu : bannière (et marqueur réparé)", () => {
  const dir = mkdtempSync(join(tmpdir(), "stas-intro-"));
  try {
    const f = join(dir, "marker.json");
    writeFileSync(f, "{not json", "utf8");
    assert.equal(shouldShowIntro({ file: f, now: NOW, uptime: UPTIME }), true);
    const m = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(m.t, NOW);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
