/*
 *  STAS world — shell hote.
 *  --------------------------------------------------------------------
 *  "dans STAS on a toutes les commandes DOS accessible" (iteration 2).
 *
 *  La commande s'execute LOCALEMENT — sur la machine de la console,
 *  pas sur le serveur AWI. Sortie capturee ligne par ligne, stdout
 *  et stderr separés.
 *  --------------------------------------------------------------------
 */

import { spawn } from "node:child_process";

/**
 * Execute une commande du shell hote.
 * @param {string} command       ligne complete ("dir /w", "ls -la", ...)
 * @param {object} [opts]
 * @param {(line:string, stream:"out"|"err") => void} [opts.onLine]
 * @param {string} [opts.cwd]
 * @returns {Promise<{code:number}>}
 */
export function runShell(command, { onLine = () => {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,              // cmd.exe sous Windows, /bin/sh sinon
      cwd,
      windowsHide: true,
    });
    const bufs = { out: "", err: "" };
    const onData = (stream) => (chunk) => {
      bufs[stream] += chunk.toString("utf8");
      let i;
      while ((i = bufs[stream].indexOf("\n")) >= 0) {
        onLine(bufs[stream].slice(0, i).replace(/\r$/, ""), stream);
        bufs[stream] = bufs[stream].slice(i + 1);
      }
    };
    child.stdout.on("data", onData("out"));
    child.stderr.on("data", onData("err"));
    child.on("error", (e) => {
      onLine(String(e.message), "err");
      resolve({ code: 1 });
    });
    child.on("close", (code) => {
      for (const s of ["out", "err"]) if (bufs[s]) onLine(bufs[s], s);
      resolve({ code: code ?? 1 });
    });
  });
}
