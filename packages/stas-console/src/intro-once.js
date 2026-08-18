/*
 *  STAS console — bannière « une fois par boot ».
 *  --------------------------------------------------------------------
 *  La première invocation interactive de STAS depuis le démarrage de la
 *  machine affiche la bannière de intro.js ; les suivantes l'omettent.
 *  Mémoire : un fichier marqueur daté dans le répertoire temporaire de
 *  l'utilisateur. Après un redémarrage, le marqueur prédate le boot
 *  (now - os.uptime()) -> la bannière revient, comme au premier jour.
 *
 *  (Une simple variable d'environnement ne survivrait pas au retour du
 *  process ; le marqueur daté est la version minimale qui marche.)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir, uptime } from "node:os";
import { join } from "node:path";

/**
 * Doit-on montrer la bannière ? true => oui, et le marqueur est posé.
 * @param {object} [opts] injectable pour les tests
 *   file    : chemin du marqueur (défaut : <tmpdir>/stas-intro.json)
 *   now     : horloge (défaut : Date.now())
 *   uptime  : uptime en secondes (défaut : os.uptime())
 */
export function shouldShowIntro(opts = {}) {
  const file = opts.file ?? join(tmpdir(), "stas-intro.json");
  const now = opts.now ?? Date.now();
  const bootMs = now - (opts.uptime ?? uptime()) * 1000;

  let last = 0;
  try {
    last = parseInt(JSON.parse(readFileSync(file, "utf8")).t, 10) || 0;
  } catch {
    /* absent ou corrompu -> jamais montré */
  }
  if (last >= bootMs) return false; // déjà affichée depuis ce boot

  try {
    writeFileSync(file, JSON.stringify({ t: now }), "utf8");
  } catch {
    /* temp en lecture seule : montrer quand même la bannière */
  }
  return true;
}
