/*
 *  STAS web — mini serveur statique (zéro dépendance).
 *  Sert tout le dépôt depuis la racine STAS/ pour que l'importmap
 *  "../stas-core/index.js" fonctionne sans bundler.
 *
 *      npm run serve   →  http://localhost:8080/
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)); // STAS/
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bas": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  console.log("[stas] " + req.method + " " + req.url);
  // "/" redirige vers le dossier de l'app : l'URL du document devient
  // /packages/stas-web/, sinon les chemins relatifs de l'importmap
  // ("../stas-core") et du <script src="./src/main.js"> se résoudraient
  // depuis "/" → 404. (Une réécriture interne cassait la base URL.)
  if (p === "/" || p === "") {
    // préserve la query (?run=...) au travers de la redirection
    const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const loc = "/packages/stas-web/" + q;
    console.log("[stas] 302 -> " + loc);
    res.writeHead(302, { Location: loc });
    res.end();
    return;
  }
  const safe = normalize(p);
  if (safe.split(sep).includes("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  // un dossier sert son index.html
  const file =
    safe.endsWith(sep) || safe.endsWith("/") ? safe + "index.html" : safe;
  try {
    const data = await readFile(join(ROOT, file));
    // extname(file) et NON extname(safe) : pour une URL de dossier
    // (".../stas-web/"), safe n'a pas d'extension → octet-stream → le
    // navigateur télécharge la page au lieu de l'afficher (bug vu en live).
    const mime = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    console.log("[stas] 200 " + safe + "  (" + mime + ")");
    res.end(data);
  } catch {
    console.log("[stas] 404 " + safe + "  (file=" + file + ")");
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — " + safe);
  }
}).listen(PORT, () => {
  console.log("STAS web → http://localhost:" + PORT + "/");
  console.log("[stas] ROOT = " + ROOT);
});
