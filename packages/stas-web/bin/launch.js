/*
 *  STAS web — lanceur local.
 *  --------------------------------------------------------------------
 *  Usage interne depuis STAS.bat :
 *    node packages/stas-web/bin/launch.js [run|edit] [fichier|--edit f] ...
 *
 *  Demarre le serveur de developpement, ATTEND qu'il reponde, puis ouvre
 *  le navigateur avec les parametres URL correspondants :
 *    verbe "run" (ou fichier seul)  -> ?run=...   (execution immediate)
 *    verbe "edit" ou --edit f       -> ?edit=...  (chargement + REPL)
 *  Le processus reste actif tant que le serveur tourne (Ctrl-C pour tout
 *  arreter).
 *  --------------------------------------------------------------------
 */

import { spawn, exec } from "node:child_process";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { join, relative, isAbsolute, resolve } from "node:path";

// bin/ -> stas-web -> packages -> racine STAS
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
// meme regle de port que serve.js (l'enfant herite de l'environnement)
const PORT = Number(process.env.PORT || 8080);

function parseArgs(argv) {
  const out = {
    verb: null, file: null, edit: null, run: null,
    renderer: null, user: null, config: null, mem: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--web") continue;
    // verbe STAS.bat ("run" / "edit") — pas un fichier
    if ((a === "run" || a === "edit") && !out.verb && !out.file) {
      out.verb = a;
      continue;
    }
    if (a === "--edit") {
      out.edit = argv[i + 1] ?? null;
      if (out.edit) i++;
      continue;
    }
    if (a === "--run") {
      out.run = argv[i + 1] ?? null;
      if (out.run) i++;
      continue;
    }
    if (a.startsWith("--edit=")) {
      out.edit = a.slice(a.indexOf("=") + 1);
      continue;
    }
    if (a.startsWith("--run=")) {
      out.run = a.slice(a.indexOf("=") + 1);
      continue;
    }
    if (a === "--user") {
      out.user = argv[i + 1] ?? null;
      if (out.user) i++;
      continue;
    }
    if (a.startsWith("--user=")) {
      out.user = a.slice(a.indexOf("=") + 1);
      continue;
    }
    if (a === "--config") {
      out.config = argv[i + 1] ?? null;
      if (out.config) i++;
      continue;
    }
    if (a.startsWith("--config=")) {
      out.config = a.slice(a.indexOf("=") + 1);
      continue;
    }
    if (a === "--renderer") {
      out.renderer = argv[i + 1] ?? null;
      if (out.renderer) i++;
      continue;
    }
    if (a.startsWith("--renderer=")) {
      out.renderer = a.slice(a.indexOf("=") + 1);
      continue;
    }
    if (a === "--mem") {
      out.mem = argv[i + 1] ?? null;
      if (out.mem) i++;
      continue;
    }
    if (a.startsWith("--mem=")) {
      out.mem = a.slice(a.indexOf("=") + 1);
      continue;
    }
    // Argument positionnel = le fichier (run= ou edit= selon le contexte)
    if (!out.file && !out.edit && !out.run && !a.startsWith("--")) {
      out.file = a;
    }
  }
  return out;
}

/**
 * Chemin d'URL servi par serve.js (docroot = racine STAS).
 *  - "examples:xxx"     -> "/examples/xxx"
 *  - chemin absolu sous la racine STAS -> relatif a la racine
 *  - autre chemin       -> servi tel quel sous la racine
 */
function toUrlPath(p) {
  let s = String(p).replace(/\\/g, "/");
  if (/^examples:/i.test(s)) {
    s = s.replace(/^examples:/i, "examples/");
  } else if (isAbsolute(resolve(p))) {
    const rel = relative(ROOT, resolve(p)).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..")) s = rel; // sous la racine : servi tel quel
    // hors racine : le serveur ne peut pas le servir — on garde tel quel
    // (l'URL affichera le chemin, le fetch echouera proprement)
  }
  return "/" + s.replace(/^\/+/, "");
}

/** Wait until the server responds (any HTTP status < 500). */
function waitServer(base, timeoutMs) {
  const t0 = Date.now();
  return new Promise((done) => {
    const ping = async () => {
      try {
        const r = await fetch(base + "/", { redirect: "follow" });
        if (r.status < 500) return done(true);
      } catch { /* not ready yet */ }
      if (Date.now() - t0 > timeoutMs) return done(false);
      setTimeout(ping, 150);
    };
    ping();
  });
}

/**
 * Ouvre le navigateur par defaut, en LOGGANT la commande exacte.
 * Methode standard via child_process + commande native de l'OS :
 *   Windows : cmd /c start "" "url"  (start est une commande INTERNE de
 *             cmd.exe — impossible a spawner directement ; le titre vide
 *             "" est obligatoire, sinon start prend l'URL pour un titre)
 *   macOS   : open "url"
 *   Linux   : xdg-open "url"
 * Repli Windows : rundll32 url.dll,FileProtocolHandler (ShellExecute direct,
 * si cmd est indisponible). PAS d'explorer.exe : en contexte spawn il ouvre
 * l'Explorateur de fichiers (constate en live).
 */
/**
 * Opens the default browser - fire and forget, NO promise.
 *   Windows: start "" "url"  (exec goes through cmd.exe; the empty title ""
 *             is mandatory and the URL must be quoted: it contains
 *             ? and & that cmd would otherwise split)
 *   macOS  : open "url"
 *   Linux  : xdg-open "url"
 * A failure to open is LOGGED, never fatal: the server keeps running.
 */
function openBrowser(url) {
  const cmd =
    platform() === "win32" ? `start "" "${url}"`
    : platform() === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  console.log(`[stas-web] opening browser: ${cmd}`);
  exec(cmd, (error) => {
    if (error) {
      console.error(`[stas-web] could not open (${error.message})`);
      console.error(`[stas-web] open manually: ${url}`);
    }
  });
}

/** Construit l'URL du navigateur pour ces arguments (pur, testable). */
export function launchUrl(argv) {
  const args = parseArgs(argv);
  // run= (execution) ou edit= (edition) : le verbe STAS.bat decide, sinon
  // --edit force l'edition, sinon un fichier seul s'execute (comme la
  // console). --run force l'execution explicite.
  const runMode = args.verb ? args.verb === "run" : !args.edit;
  const target = args.run ?? args.edit ?? args.file;

  const query = new URLSearchParams();
  if (target) query.set(runMode ? "run" : "edit", toUrlPath(target));
  if (args.user) query.set("user", args.user);
  if (args.config) query.set("config", args.config);
  if (args.mem) query.set("mem", args.mem);
  // Lance via STAS.bat (--web) : le renderer par defaut est pixel, le plus
  // fidele a l'affichage STOS original ; --renderer= garde la priorite.
  query.set("renderer", args.renderer ?? "pixel");

  return `http://localhost:${PORT}/packages/stas-web/index.html${
    query.toString() ? "?" + query.toString() : ""
  }`;
}

/** Demarre le serveur puis ouvre le navigateur sur l'URL construite. */
function start(argv) {
  const url = launchUrl(argv);
  console.log(`[stas-web] ${url}`);

  // Demarrage du serveur (ROOT correct : racine STAS, pas packages/)
  const server = spawn(
    process.execPath,
    [join(ROOT, "packages", "stas-web", "serve.js")],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    }
  );
  server.on("error", (e) => {
    console.error("[stas-web] could not start the server:", e.message);
    process.exit(1);
  });
  server.on("close", (code) => {
    process.exit(code ?? 0);
  });

  // Browser: opened when the server responds. An opening failure must
  // NEVER stop the launcher - the server keeps running.
  (async () => {
    const base = `http://localhost:${PORT}`;
    try {
      if (!(await waitServer(base, 15000))) {
        console.error("[stas-web] server not responding yet - open manually:");
        console.error("  " + url);
        return;
      }
      openBrowser(url);
    } catch (e) {
      console.error("[stas-web] opening cancelled:", e.message);
      console.error("[stas-web] open manually: " + url);
    }
  })();
}

// Execute directement (STAS.bat) ? Le garde rend ce fichier importable
// sans effet de bord (tests de launchUrl).
const _self = fileURLToPath(import.meta.url);
const _main =
  process.argv[1] &&
  (platform() === "win32"
    ? resolve(process.argv[1]).toLowerCase() === _self.toLowerCase()
    : resolve(process.argv[1]) === _self);

if (_main) {
  const argv = process.argv.slice(2);
  // --open-test : NE DEMARRE PAS le serveur — tente seulement l'ouverture
  // du navigateur. C'est l'outil de diagnostic a lancer depuis SA PROPRE
  // console :
  //   node .../launch.js --open-test
  //   node .../launch.js --open-test "http://localhost:8080"
  if (argv.includes("--open-test")) {
    const explicit = argv.find(
      (a) => !a.startsWith("--") && /^https?:\/\//i.test(a)
    );
    const testUrl =
      explicit || `http://localhost:${PORT}/packages/stas-web/index.html`;
    console.log(`[stas-web] open test: ${testUrl}`);
    console.log(`[stas-web] url construite: ${launchUrl(argv)}`);
    openBrowser(testUrl);
    setTimeout(() => process.exit(0), 2000); // give exec time to act
  } else {
    start(argv);
  }
}
