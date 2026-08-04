/*
 *  STAS web — point d'entrée : canvas + clavier + REPL + postMessage.
 */

import { Stas, StosError, makeEcho, introText } from "@stas/core";
import { CanvasRenderer } from "./canvas-renderer.js";
import { AalibRenderer } from "./aalib-renderer.js";
import { WebInput } from "./input.js";
import { initPostMessage } from "./postmessage-api.js";

// La langue de la machine : francais si le navigateur est en francais.
const langue = (navigator.language || "en").toLowerCase().startsWith("fr")
  ? 1
  : 0;

// --- réglages de résolution (?res= / ?text= / ?gfx=) ---------------------
// Deux résolutions indépendantes :
//   ?text=WxH : la grille du BUFFER TEXTE (verrouillée : MODE ne la
//               redimensionne plus, sinon le MODE 0 des programmes 1988
//               déferait le réglage) ;
//   ?gfx=WxH  : la grille du RENDERER ascii-art (renderer aalib seulement,
//               qui sait la découpler du texte) ;
//   ?res=WxH  : raccourci = les deux à la même résolution.
// Sans paramètre : fidélité STOS totale (MODE choisit la grille).
const _params = new URLSearchParams(location.search);
function parseRes(s, name) {
  const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(s || "");
  if (!m) {
    console.warn(`[stas-web] ?${name}=${s} ignoré (format WxH attendu)`);
    return null;
  }
  const cols = +m[1];
  const rows = +m[2];
  if (cols < 10 || cols > 320 || rows < 5 || rows > 200) {
    console.warn(
      `[stas-web] ?${name}=${s} ignoré (10..320 colonnes, 5..200 lignes)`
    );
    return null;
  }
  if (320 % cols !== 0 || 200 % rows !== 0) {
    console.warn(
      `[stas-web] ?${name}=${s} : pas diviseur de 320x200 -> blocs fractionnaires`
    );
  }
  return { cols, rows };
}
const _get = (k) => _params.get(k);
const _resParam = _get("res") ? parseRes(_get("res"), "res") : null;
const _textRes =
  _resParam ?? (_get("text") ? parseRes(_get("text"), "text") : null);
const _gfxRes =
  _resParam ?? (_get("gfx") ? parseRes(_get("gfx"), "gfx") : null);
if (_resParam && (_get("text") || _get("gfx"))) {
  console.warn("[stas-web] ?res= prioritaire sur ?text=/?gfx=");
}

const stas = new Stas({
  width: _textRes ? _textRes.cols : 80,
  height: _textRes ? _textRes.rows : 25,
  langue,
});
// Résolution texte explicite -> MODE ne doit pas la défaire.
if (_textRes) stas.io.lockTextRes = true;

const canvas = document.getElementById("screen");
// ?renderer=aalib : benchmark aalib.js (sinon renderer historique).
const _wantAalib = _params.get("renderer") === "aalib";
if (_wantAalib && !globalThis.aalib) {
  console.warn(
    "[stas-web] ?renderer=aalib mais vendor/aalib.js absent -> CanvasRenderer"
  );
}
const _aalibOk = _wantAalib && globalThis.aalib;
// Masque legacy : le renderer historique compose 1 glyphe gfx par cellule
// texte (cellAt) ; une grille gfx différente du texte n'y a pas de sens.
if (!_aalibOk && _gfxRes &&
    (!_textRes || _textRes.cols !== _gfxRes.cols || _textRes.rows !== _gfxRes.rows)) {
  console.warn(
    "[stas-web] ?gfx= ignoré : le renderer canvas suit la grille texte " +
      "(?renderer=aalib pour découpler les deux résolutions)"
  );
}
const renderer = _aalibOk
  ? new AalibRenderer(stas, canvas, { gfx: _gfxRes })
  : new CanvasRenderer(stas, canvas);
const input = new WebInput(stas);
input.onDirty = () => renderer.render();
stas.io.onScreen = () => {
  renderer.setSize();
  renderer.render(true);
};

stas.io.readLine = (echo) => input.readLine(echo);
stas.io.inkey = () => input.inkey();
stas.io.flush = () => renderer.render(true);
stas.io.tick = async () => renderer.render();
stas.io.sleep = (ms) =>
  new Promise((r) => {
    renderer.render(true);
    setTimeout(r, ms);
  });

initPostMessage(stas, input, {
  onScreen: () => renderer.render(true),
  onReset: () => renderer.render(true),
});

// la webfont arrive après le premier rendu : repeindre quand elle est là
if (document.fonts?.ready) {
  document.fonts.ready.then(() => renderer.render(true));
}

async function repl() {
  stas.buffer.write(introText(langue));
  for (;;) {
    stas.buffer.write("Ok\n");
    renderer.render(true);
    const line = await input.readLine(makeEcho(stas.buffer));
    if (line === null) break;
    const kind = stas.feedLine(line);
    if (kind === "direct") {
      try {
        await stas.execDirect(line);
      } catch (e) {
        if (e instanceof StosError) stas.buffer.write(e.message + "\n");
        else throw e;
      }
    }
    renderer.render(true);
  }
}

// --- lancement : ?run= charge + exécute un .bas, sinon REPL interactif -----
const _runPath = _params.get("run");
if (_runPath) {
  const _url = _runPath.startsWith("/") ? _runPath : "/" + _runPath;
  console.log("[stas-web] ?run= -> fetch " + _url);
  stas.buffer.write("STAS — chargement " + _url + "\n");
  renderer.render(true);
  try {
    const _res = await fetch(_url);
    if (!_res.ok) throw new Error("HTTP " + _res.status);
    const _src = await _res.text();
    stas.loadSource(_src, { merge: false });
    await stas.run();
    renderer.render(true); // écran final figé (REPL non relancé)
  } catch (e) {
    console.error("[stas-web] ?run= erreur :", e);
    const _m =
      e instanceof StosError
        ? e.message
        : "?run=" + _url + " : " + (e && e.message ? e.message : String(e));
    stas.buffer.write(_m + "\n");
    renderer.render(true);
  }
} else {
  console.log("[stas-web] boot REPL");
  repl();
}
