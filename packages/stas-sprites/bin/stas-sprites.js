#!/usr/bin/env node
/*
 *  stas-sprites — l'entree console de l'editeur de sprites ASCII.
 *  --------------------------------------------------------------------
 *  Port de SPRITE.ASC (François Lionet, 1987) : une banque de sprites
 *  ASCII (grilles de caracteres {ch, fg, bg}) partageant UNE palette et
 *  une police, sauvee en UN fichier .stasprite (JSON natif). Cette ligne
 *  de commande manipule ces banques sans interface graphique :
 *
 *    stas-sprites demo [fichier]      dessine une banque de demo + rendu
 *    stas-sprites render <fichier>    affiche une banque en ANSI
 *    stas-sprites new <w> <h>         cree une banque avec un sprite vide
 *    stas-sprites convert <in> <out>  exporte en .txt / .ans / .stasprite
 *    stas-sprites info <fichier>      resume le contenu d'une banque
 *  --------------------------------------------------------------------
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";

import { SpriteBank } from "../src/bank.js";
import * as tools from "../src/tools.js";
import { bankToAnsi, makeExport, loadBank } from "../src/save.js";

/* ==================================================================== *
 *  Petits utilitaires                                                   *
 * ==================================================================== */

/** Message d'erreur clair sur stderr puis sortie en echec. */
function fail(msg) {
  console.error("stas-sprites : " + msg);
  process.exit(1);
}

/** Ecrit une banque en JSON natif et confirme l'ecriture. */
function writeBank(bank, file) {
  try {
    writeFileSync(file, bank.serialize(true));
  } catch (e) {
    fail(`impossible d'ecrire « ${file} » : ${e.message}`);
  }
  console.log(`→ ${file} écrit (${bank.count} sprite${bank.count > 1 ? "s" : ""})`);
}

/** Charge une banque depuis le disque (fichier absent / JSON invalide). */
function readBank(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    fail(`impossible de lire « ${file} » : ${e.message}`);
  }
  try {
    return loadBank(text);
  } catch (e) {
    fail(`« ${file} » n'est pas une banque de sprites valide : ${e.message}`);
  }
}

/** Valeur d'un drapeau « --nom valeur » dans une liste d'arguments. */
function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

/* ==================================================================== *
 *  La banque de demonstration                                           *
 * ==================================================================== */

/**
 * Dessine une petite banque de demo : un visage souriant (cercle + plot +
 * segment), une fleche (segments) et une balle (cercle + remplissage par
 * flood-fill). Attention : floodFill ne termine que si l'encre CHANGE le
 * caractere cible — on remplit donc l'interieur d'un contour avec un
 * caractere different de l'espace.
 */
function buildDemo() {
  const bank = new SpriteBank();

  /* --- le visage souriant (16×16) : cercle creux + traits --- */
  const smiley = bank.get(bank.newSprite(16, 16, "smiley"));
  smiley.hx = 8;
  smiley.hy = 8;
  tools.circle(smiley, 8, 8, 7, { ch: "*", fg: 3 }); // contour jaune
  tools.plot(smiley, 5, 6, { ch: "o", fg: 0 }); // œil gauche
  tools.plot(smiley, 10, 6, { ch: "o", fg: 0 }); // œil droit
  tools.plot(smiley, 5, 10, { ch: "\\", fg: 0 }); // sourire (coin gauche)
  tools.line(smiley, 6, 11, 9, 11, { ch: "_", fg: 0 }); // sourire (bas)
  tools.plot(smiley, 10, 10, { ch: "/", fg: 0 }); // sourire (coin droit)

  /* --- la fleche (16×16) : segments --- */
  const fleche = bank.get(bank.newSprite(16, 16, "fleche"));
  fleche.hx = 0;
  fleche.hy = 8;
  tools.line(fleche, 1, 8, 12, 8, { ch: "=", fg: 2 }); // hampe verte
  tools.line(fleche, 10, 5, 14, 8, { ch: "\\", fg: 2 }); // pointe haute
  tools.line(fleche, 10, 11, 14, 8, { ch: "/", fg: 2 }); // pointe basse
  tools.plot(fleche, 14, 8, { ch: ">", fg: 2 }); // pointe

  /* --- la balle (12×12) : contour cyan + interieur au flood-fill --- */
  const balle = bank.get(bank.newSprite(12, 12, "balle"));
  balle.hx = 6;
  balle.hy = 6;
  tools.circle(balle, 6, 6, 5, { ch: "*", fg: 6 }); // bord cyan
  tools.floodFill(balle, 6, 6, { ch: "o", fg: 6 }); // remplit l'interieur
  tools.plot(balle, 4, 4, { ch: ".", fg: 0 }); // reflet blanc

  bank.ensureAnimation(10); // les 3 sprites en boucle
  return bank;
}

/* ==================================================================== *
 *  Les commandes                                                        *
 * ==================================================================== */

/* --- demo [fichier.stasprite] --- */
function cmdDemo(args) {
  const file = args[0] ?? "demo.stasprite";
  const bank = buildDemo();
  try {
    writeFileSync(file, bank.serialize(true));
  } catch (e) {
    fail(`impossible d'ecrire « ${file} » : ${e.message}`);
  }
  process.stdout.write(bankToAnsi(bank) + "\n");
  console.log(`→ ${file} écrit (${bank.count} sprites)`);
}

/* --- render <fichier.stasprite> --- */
function cmdRender(args) {
  const file = args[0];
  if (!file) fail("render attend un fichier : render <fichier.stasprite>");
  const bank = readBank(file);
  process.stdout.write(bankToAnsi(bank) + "\n");
}

/* --- new <w> <h> [--out fichier] --- */
function cmdNew(args) {
  const w = parseInt(args[0], 10);
  const h = parseInt(args[1], 10);
  if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) {
    fail("new attend une largeur et une hauteur entières : new <w> <h>");
  }
  const out = flagValue(args, "--out") ?? "nouveau.stasprite";
  const bank = new SpriteBank();
  bank.newSprite(w, h, `Sprite ${w}x${h}`);
  writeBank(bank, out);
}

/* --- convert <entree> <sortie> --- */
function cmdConvert(args) {
  const input = args[0];
  const output = args[1];
  if (!input || !output) {
    fail("convert attend une entrée et une sortie : convert <entree> <sortie>");
  }
  const bank = readBank(input);
  // le format se lit dans l'extension de sortie (.txt / .ans / sinon json)
  const ext = extname(output).toLowerCase();
  const kind = ext === ".txt" ? "txt" : ext === ".ans" ? "ansi" : "json";
  const base = basename(output).replace(/\.[^.]+$/, "");
  const exportable = makeExport(bank, kind, base);
  try {
    writeFileSync(output, exportable.text);
  } catch (e) {
    fail(`impossible d'ecrire « ${output} » : ${e.message}`);
  }
  console.log(`→ ${output} écrit (${kind}, ${bank.count} sprite${bank.count > 1 ? "s" : ""})`);
}

/* --- info <fichier.stasprite> --- */
function cmdInfo(args) {
  const file = args[0];
  if (!file) fail("info attend un fichier : info <fichier.stasprite>");
  const bank = readBank(file);
  const lines = [];
  lines.push(`Banque    : ${file}`);
  lines.push(`Police    : ${bank.font}`);
  lines.push(`Sprites   : ${bank.count}`);
  bank.sprites.forEach((s, i) => {
    lines.push(
      `  [${i}] ${s.name || "sprite"} — ${s.w}×${s.h}, ` +
        `point chaud (${s.hx},${s.hy}), ${s.countNonEmpty()} cellule${s.countNonEmpty() > 1 ? "s" : ""}`
    );
  });
  const frames = bank.animation?.frames?.length ?? 0;
  lines.push(`Animation : ${frames} frame${frames > 1 ? "s" : ""}${bank.animation?.loop ? " (boucle)" : ""}`);
  console.log(lines.join("\n"));
}

/* --- help --- */
function usage() {
  console.log(`stas-sprites — l'éditeur de sprites ASCII de STAS.

Usage : stas-sprites <commande> [arguments]

Commandes :
  demo [fichier.stasprite]         dessine une banque de démo, l'enregistre
                                   et l'affiche en ANSI (défaut demo.stasprite)
  render <fichier.stasprite>       affiche une banque en ANSI sur le terminal
  new <w> <h> [--out fichier]      crée une banque avec un sprite vide w×h
  convert <entree> <sortie>        convertit une banque d'après l'extension de
                                   sortie (.txt → texte, .ans → ANSI, sinon JSON)
  info <fichier.stasprite>         résume le contenu d'une banque
  help                             affiche cette aide

Exemples :
  stas-sprites demo
  stas-sprites render demo.stasprite
  stas-sprites new 32 32 --out curseur.stasprite
  stas-sprites convert demo.stasprite demo.ans`);
}

/* ==================================================================== *
 *  Point d'entree : lecture de process.argv, dispatch a la main         *
 * ==================================================================== */

const argv = process.argv.slice(2);
const commande = argv[0] ?? "help";
const reste = argv.slice(1);

switch (commande) {
  case "help":
  case "--help":
  case "-h":
    usage();
    break;
  case "demo":
    cmdDemo(reste);
    break;
  case "render":
    cmdRender(reste);
    break;
  case "new":
    cmdNew(reste);
    break;
  case "convert":
    cmdConvert(reste);
    break;
  case "info":
    cmdInfo(reste);
    break;
  default:
    console.error(`stas-sprites : commande inconnue « ${commande} »\n`);
    usage();
    process.exit(1);
}
