/*
 *  STAS world — protocole.
 *  --------------------------------------------------------------------
 *  Le vocabulaire de messages entre STAS (console locale, JS) et
 *  WorldSTAS (awi.worlds.WorldStas, cote Haxe).
 *
 *  Meme base que l'API postMessage de stas-web (ready / output /
 *  input:request / done / error), etendue avec les trois evenements
 *  de l'iteration 2 : le shell hote, la porte Legal-Fractal, et la
 *  navigation entre mondes.
 *
 *  STAS -> WorldSTAS :
 *    { source:"stas-world", type:"ready" }
 *    { type:"output", text }              ecran BASIC (texte brut)
 *    { type:"input:request" }
 *    { type:"done" }  |  { type:"error", message, code }
 *    { type:"shell:output", text, stream }   stream: "out" | "err"
 *    { type:"auth:request", world, message } porte Legal-Fractal
 *    { type:"world:enter", world }           demande d'entrer
 *    { type:"world:leave", world }           retour a STAS
 *    { type:"world:say", world, text }       parole utilisateur au monde
 *
 *  WorldSTAS -> STAS :
 *    { target:"stas-world", type:"run", source? }
 *    { target:"stas-world", type:"line", text }      (ligne console)
 *    { target:"stas-world", type:"input", text }
 *    { target:"stas-world", type:"stop" }
 *    { target:"stas-world", type:"auth:granted", world }
 *    { target:"stas-world", type:"auth:denied", world, reason? }
 *    { target:"stas-world", type:"world:say", world, text }
 *  --------------------------------------------------------------------
 */

export const SOURCE = "stas-world";
export const TARGET = "stas-world";

/** Message STAS -> WorldSTAS. */
export function out(type, data = {}) {
  return { source: SOURCE, type, ...data };
}

/** Message WorldSTAS -> STAS (pour forger des commandes cote tests/Haxe). */
export function inn(type, data = {}) {
  return { target: TARGET, type, ...data };
}

export function isForStasWorld(m) {
  return m != null && m.target === TARGET;
}
