/*
 *  STAS web — point d'entrée : canvas + clavier + REPL + postMessage.
 */

import { Stas, StosError, makeEcho, introText, parseIni, parseRes } from "@stas/core";
import { CanvasRenderer } from "./canvas-renderer.js";
import { AalibRenderer } from "./aalib-renderer.js";
import { PixelRenderer } from "./pixel-renderer.js";
import { WebInput } from "./input.js";
import { initPostMessage } from "./postmessage-api.js";

// La langue de la machine : francais si le navigateur est en francais.
const langue = (navigator.language || "en").toLowerCase().startsWith("fr")
  ? 1
  : 0;

// --- réglages : ?config= + paramètres d'URL ------------------------------
// Un fichier INI (section [web]) peut porter tous les réglages ; les
// paramètres d'URL restent prioritaires. Deux résolutions indépendantes :
//   text=WxH : la grille du BUFFER TEXTE (verrouillée : MODE ne la
//              redimensionne plus, sinon le MODE 0 des programmes 1988
//              déferait le réglage) ;
//   gfx=WxH  : la grille du RENDERER ascii-art (renderer aalib seulement,
//              qui sait la découpler du texte) ;
//   res=WxH  : raccourci = les deux à la même résolution.
// Sans réglage : fidélité STOS totale (MODE choisit la grille).
const _params = new URLSearchParams(location.search);
let _cfg = {};
const _configPath = _params.get("config");
if (_configPath) {
  try {
    const _r = await fetch(_configPath);
    if (!_r.ok) throw new Error("HTTP " + _r.status);
    _cfg = parseIni(await _r.text()).web || {};
  } catch (e) {
    console.warn(`[stas-web] ?config=${_configPath} illisible : ${e.message}`);
  }
}
// URL d'abord, INI ensuite, défauts enfin.
const _opt = (k) => _params.get(k) ?? _cfg[k] ?? null;
function readRes(name) {
  const s = _opt(name);
  if (!s) return null;
  const r = parseRes(s);
  if (!r) {
    console.warn(`[stas-web] ${name}=${s} ignoré (format WxH, 10..320 x 5..200)`);
    return null;
  }
  if (320 % r.cols !== 0 || 200 % r.rows !== 0) {
    console.warn(
      `[stas-web] ${name}=${s} : pas diviseur de 320x200 -> blocs fractionnaires`
    );
  }
  return r;
}
const _resParam = readRes("res");
const _textRes = _resParam ?? readRes("text");
const _gfxRes = _resParam ?? readRes("gfx");
if (_resParam && (_opt("text") || _opt("gfx"))) {
  console.warn("[stas-web] res= prioritaire sur text=/gfx=");
}

const stas = new Stas({
  width: _textRes ? _textRes.cols : 80,
  height: _textRes ? _textRes.rows : 25,
  langue,
  memMode: _opt("mem") === "native" ? "native" : "compatible",
});
if (_opt("mem") && _opt("mem") !== "compatible" && _opt("mem") !== "native") {
  console.warn(`[stas-web] mem=${_opt("mem")} ignoré (compatible ou native)`);
}
// Résolution texte explicite -> MODE ne doit pas la défaire.
if (_textRes) stas.io.lockTextRes = true;

const canvas = document.getElementById("screen");
// renderer= : aalib (benchmark ascii-art) | pixel/atari (copie pixels
// native) | defaut = renderer historique canvas.
const _rendererName = _opt("renderer");
const _wantAalib = _rendererName === "aalib";
const _wantPixel = _rendererName === "pixel" || _rendererName === "atari";
if (_wantAalib && !globalThis.aalib) {
  console.warn(
    "[stas-web] ?renderer=aalib mais vendor/aalib.js absent -> CanvasRenderer"
  );
}
const _aalibOk = _wantAalib && globalThis.aalib;
// Masque legacy : seuls les renderers qui découplent la grille ascii du
// texte (aalib) donnent un sens à ?gfx= ; le renderer canvas compose 1
// glyphe gfx par cellule texte (cellAt) et le renderer pixel est toujours
// en 320x200 natif.
if (!_aalibOk && _gfxRes &&
    (!_textRes || _textRes.cols !== _gfxRes.cols || _textRes.rows !== _gfxRes.rows)) {
  console.warn(
    "[stas-web] ?gfx= ignoré : ce renderer suit la grille texte " +
      "(?renderer=aalib pour découpler les deux résolutions)"
  );
}
const renderer = _aalibOk
  ? new AalibRenderer(stas, canvas, { gfx: _gfxRes })
  : _wantPixel
    ? new PixelRenderer(stas, canvas)
    : new CanvasRenderer(stas, canvas);
const input = new WebInput(stas);
input.onDirty = () => renderer.render();
stas.io.onScreen = () => {
  renderer.setSize();
  renderer.render(true);
};

stas.io.readLine = (echo) => input.readLine(echo);
stas.io.inputChars = (n) => input.inputChars(n);
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
    stas.buffer.write("STAS>"); // pas de \n : le curseur reste à droite du >
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

// --- lancement : run=, edit=, ou REPL interactif ------------------------
const _runPath = _opt("run");
const _editPath = _opt("edit");
const _userName = _opt("user");

if (_runPath) {
  const _url = _runPath.startsWith("/") ? _runPath : "/" + _runPath;
  console.log("[stas-web] run= -> fetch " + _url);
  stas.buffer.write("STAS — chargement " + _url + "\n");
  renderer.render(true);
  try {
    const _res = await fetch(_url);
    if (!_res.ok) throw new Error("HTTP " + _res.status);
    const _src = await _res.text();
    stas.loadSource(_src, { merge: false });
    await stas.run();
    renderer.render(true); // ecran final fige (REPL non relance)
  } catch (e) {
    console.error("[stas-web] run= erreur :", e);
    const _m =
      e instanceof StosError
        ? e.message
        : "run=" + _url + " : " + (e && e.message ? e.message : String(e));
    stas.buffer.write(_m + "\n");
    renderer.render(true);
  }
} else if (_editPath) {
  const _url = _editPath.startsWith("/") ? _editPath : "/" + _editPath;
  console.log("[stas-web] edit= -> fetch " + _url);
  stas.buffer.write("STAS — edition " + _url + "\n");
  if (_userName) stas.buffer.write("Utilisateur: " + _userName + "\n");
  renderer.render(true);
  (async () => {
    try {
      const _res = await fetch(_url);
      if (!_res.ok) throw new Error("HTTP " + _res.status);
      const _src = await _res.text();
      stas.loadSource(_src, { merge: false });
      if (!stas.program.isEmpty) {
        stas.buffer.write(stas.program.toSource() + "\n");
      } else {
        stas.buffer.write("(vide)\n");
      }
    } catch (e) {
      console.error("[stas-web] edit= erreur :", e);
      stas.buffer.write("Erreur de chargement : " + (e.message || e) + "\n");
    }
    renderer.render(true);
    repl();
  })();
} else {
  console.log("[stas-web] boot REPL");
  repl();
}
