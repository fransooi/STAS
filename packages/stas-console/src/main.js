/*
 *  STAS console — point d'entrée.
 *  --------------------------------------------------------------------
 *  Modes :
 *    stas fichier.bas [--config=fichier.ini]        → charge et exécute
 *    stas --edit fichier.bas [--config=...]          → éditeur console STAS>
 *    stas [--config=fichier.ini]                     → REPL interactif STAS>
 *
 *  Config INI (section [console]) :
 *    screen=WxH      zone de rendu FIXE (10..320 x 5..200). Le terminal
 *                    peut être retaillé : la zone ne bouge pas, seul le
 *                    rendu est repeint. MODE non plus ne la change plus.
 *                    Sans screen= : le buffer prend la taille du terminal
 *                    au démarrage (80x25 minimum STOS).
 *    resize=fixed    (défaut) un retaillage du terminal ne change PAS la
 *                    zone de rendu — on repeint juste (efface le reflow).
 *    resize=follow   le buffer suit la taille du terminal (ignoré si
 *                    screen= est fixé).
 *    user=nom        nom d'utilisateur (dummy, réservé Volt.A).
 *    mem=compatible  modèle mémoire des écrans : "compatible" (format Atari
 *                    ST, plans entrelacés, défaut) ou "native" (1 octet/pixel).
 *                    Aussi disponible en ligne de commande : --mem=…
 *    borders=unicode bordures de fenêtre : "unicode" (défaut) ou "st" (codes
 *                    réels de la police STOS 192-253, traduits à l'affichage).
 *                    Aussi en ligne de commande : --borders=…
 *
 *  Sans --config= : un fichier <même-nom>.ini à côté du .bas est chargé
 *  automatiquement s'il existe (config par démo, comme ?config= côté web).
 *  --------------------------------------------------------------------
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  Stas, StosError, makeEcho, parseIni, parseRes, ERR, introText, detokenize,
} from "../../stas-core/index.js";
import { LocalStasConnector } from "../../stas-world/src/storage.js";
import { AnsiRenderer } from "./ansi-renderer.js";
import { ConsoleInput } from "./input.js";
import { shouldShowIntro } from "./intro-once.js";

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

/** Taille du terminal, bornée au minimum STOS (marge -1 : pas de scroll). */
const fitCols = () => Math.max(80, (process.stdout.columns || 80) - 1);
const fitRows = () => Math.max(25, (process.stdout.rows || 25) - 1);

/** Arguments : fichier positionnel, --edit, --config, --user. */
function parseArgv(argv) {
  let file = null;
  let editFile = null;
  let editFlag = false; // --edit sans valeur : s'applique au fichier positionnel
  let config = null;
  let user = null;
  let mem = null;
  let borders = null;
  let skipNext = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (skipNext) { skipNext = false; continue; }

    if (a === "--web") {
      // mode web géré par le batch ; ici on ignore silencieusement
      continue;
    }
    if (a === "--edit") {
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        editFile = next; // --edit fichier.bas
        skipNext = true;
      } else {
        editFlag = true; // fichier.bas --edit  /  --edit seul
      }
      continue;
    }
    if (a.startsWith("--edit=")) {
      editFile = a.slice("--edit=".length);
      continue;
    }
    if (a === "--user") {
      user = argv[i + 1] ?? "user";
      if (user) { skipNext = true; }
      continue;
    }
    if (a.startsWith("--user=")) {
      user = a.slice("--user=".length);
      continue;
    }
    if (a === "--config") {
      config = argv[i + 1] ?? null;
      if (config) { skipNext = true; }
      continue;
    }
    if (a.startsWith("--config=")) {
      config = a.slice("--config=".length);
      continue;
    }
    if (a === "--mem") {
      mem = argv[i + 1] ?? null;
      if (mem) { skipNext = true; }
      continue;
    }
    if (a.startsWith("--mem=")) {
      mem = a.slice("--mem=".length);
      continue;
    }
    if (a === "--borders") {
      borders = argv[i + 1] ?? null;
      if (borders) { skipNext = true; }
      continue;
    }
    if (a.startsWith("--borders=")) {
      borders = a.slice("--borders=".length);
      continue;
    }
    if (a.startsWith("--")) {
      console.error(`[stas] option inconnue : ${a}`);
      continue;
    }
    if (file === null) file = a;
  }

  // --edit derriere ou sans valeur : le fichier positionnel passe en edition
  if (editFlag && !editFile && file) {
    editFile = file;
    file = null;
  }

  return { file, editFile, config, user, mem, borders };
}

/** Charge l'INI : --config= sinon <même-nom>.ini à côté du .bas. */
function loadConfig(configPath, basFile) {
  let path = configPath;
  if (!path && basFile && /\.bas$/i.test(basFile)) {
    const side = basFile.replace(/\.bas$/i, "") + ".ini";
    if (existsSync(side)) path = side;
  }
  if (!path) return {};
  try {
    const ini = parseIni(readFileSync(path, "utf8"));
    console.log(`[stas] config : ${path}`);
    return ini.console || {};
  } catch (e) {
    console.error(`[stas] config ${path} illisible : ${e.message}`);
    return {};
  }
}

export async function main(argv) {
  const { file, editFile, config, user: cliUser, mem: cliMem,
    borders: cliBorders } = parseArgv(argv);
  const basFile = file || editFile;
  const cfg = loadConfig(config, basFile);
  const user = cliUser || cfg.user || "user";

  // Mode mémoire des écrans : "compatible" (format Atari ST, défaut) ou
  // "native" (un octet par pixel). Voir packages/stas-core/src/memory.js.
  const memRaw = cliMem || cfg.mem || "compatible";
  if (memRaw !== "compatible" && memRaw !== "native") {
    console.warn(`[stas] mem=${memRaw} ignore (compatible ou native)`);
  }
  const memMode = memRaw === "native" ? "native" : "compatible";

  // Bordures de fenêtre : "unicode" (défaut) ou "st" (codes réels 192-253).
  const bordersRaw = cliBorders || cfg.borders || "unicode";
  if (bordersRaw !== "unicode" && bordersRaw !== "st") {
    console.warn(`[stas] borders=${bordersRaw} ignore (unicode ou st)`);
  }
  const borderMode = bordersRaw === "st" ? "st" : "unicode";

  // --- zone de rendu : screen= (fixe) sinon taille du terminal ----------
  let width = fitCols();
  let height = fitRows();
  let fixed = false;
  if (cfg.screen) {
    const res = parseRes(cfg.screen);
    if (res) {
      width = res.cols;
      height = res.rows;
      fixed = true;
      if (320 % res.cols !== 0 || 200 % res.rows !== 0) {
        console.warn(
          `[stas] screen=${cfg.screen} : pas diviseur de 320x200 -> blocs tronques`
        );
      }
    } else {
      console.warn(
        `[stas] screen=${cfg.screen} ignore (format WxH, 10..320 x 5..200)`
      );
    }
  }
  let follow = false;
  if (cfg.resize && cfg.resize !== "fixed" && cfg.resize !== "follow") {
    console.warn(`[stas] resize=${cfg.resize} ignore (fixed ou follow)`);
  }
  if (cfg.resize === "follow") {
    if (fixed) console.warn("[stas] resize=follow ignore : screen= est fixe");
    else follow = true;
  }

  const langue = machineLangue();
  const stas = new Stas({ width, height, langue, memMode, borderMode });
  if (fixed) stas.io.lockTextRes = true; // zone fixe : MODE ne la defait pas

  // Connecteur stockage — mockup local du ConnectorStas d'AWI (phase 3).
  // Même contrat de messages : SAVE/LOAD partent du cœur par stas:save /
  // stas:load et aboutissent ici tant qu'AWI n'a pas pris la main.
  const storage = new LocalStasConnector({ user });
  stas.io.sendCommand = (command, parameters) =>
    storage.sendMessage(command, parameters);
  stas.io.userName = user;

  const renderer = new AnsiRenderer(stas);
  const input = new ConsoleInput(stas);
  input.onDirty = () => renderer.render();
  stas.io.onScreen = () => renderer.start();

  // Retaillage du terminal : par defaut la zone de rendu NE CHANGE PAS —
  // on repeint a positions absolues (efface les artefacts de reflow).
  process.stdout.on("resize", () => {
    if (follow) stas.buffer.resize(fitCols(), fitRows());
    if (renderer._started) renderer.start();
    renderer.render(true);
  });

  // branchement des traps STAS sur le terminal
  stas.io.readLine = (echo) => input.readLine(echo);
  stas.io.inputChars = (n) => input.inputChars(n);
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

  if (file && !editFile) {
    // --- mode execution fichier ------------------------------------------
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

  // --- mode interactif (REPL ou editeur) --------------------------------
  renderer.start();

  if (editFile) {
    // Mode edition = NEW interne + LOAD via le connecteur + LIST, comme
    // si l'on avait tape new / load "..." / list a l'invite. Le connecteur
    // gere le prefixe examples: et les chemins relatifs au repertoire
    // courant ; fichier introuvable = nouvelle creation (programme vide).
    const answer = await storage.sendMessage("stas:load", { path: editFile });
    if (answer.success) {
      stas.loadSource(answer.data.source, { merge: false }); // NEW + LOAD
      stas.io.currentPath = answer.data.path; // SAVE seul reutilise ce fichier
    } else if (answer.data?.stosCode !== 48) {
      stas.buffer.write(`Erreur de chargement : ${answer.message}\n`);
      input.stop();
      renderer.stop();
      process.exit(1);
    } else {
      stas.io.currentPath = resolve(editFile); // introuvable : a creer
    }
    if (!stas.program.isEmpty) {
      // LIST 0-100 : montrer le debut, pas 150 lignes d'un coup.
      // Un indice si le programme continue apres la fenetre.
      const shown = stas.program.lines.filter((l) => l.num <= 100);
      stas.buffer.write(
        shown.map((l) => `${l.num} ${detokenize(l.tokens)}`).join("\n") + "\n"
      );
      const rest = stas.program.lines.length - shown.length;
      if (rest > 0) {
        stas.buffer.write(
          `\n(${rest} lignes suivantes - list 100- pour voir la suite)\n\n`
        );
      }
    }
  } else {
    // stas seul : bannière d'accueil — une seule fois par boot de la
    // machine (marqueur daté, voir intro-once.js). QUIT puis relance :
    // direct STAS>, comme le STOS qui ne se présentait qu'une fois.
    if (shouldShowIntro()) stas.buffer.write(introText(langue));
  }

  for (;;) {
    stas.buffer.write("STAS>");
    renderer.render();
    const line = await input.readLine(makeEcho(stas.buffer));
    if (line === null) break; // fin d'entree (pipe)

    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    // Commandes editeur prioritaires
    if (upper === "EXIT" || upper === "QUIT") {
      break;
    }

    // LIST / NEW / SAVE / SAVE AS / LOAD : gérés par le cœur (stas-core),
    // les fichiers passent par le connecteur (io.sendCommand).

    const kind = stas.feedLine(line);
    if (kind === "direct") {
      try {
        await stas.execDirect(line);
      } catch (e) {
        if (e instanceof StosError) {
          if (e.code === ERR.BREAK) {
            stas.buffer.write(`STAS> Break at line ${e.line}\n`);
          } else {
            stas.buffer.write(e.message + "\n");
          }
        } else {
          throw e;
        }
      }
    }
    renderer.render();
  }

  input.stop();
  renderer.stop();
}
