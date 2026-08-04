/*
 *  STAS world — le pont entre la console STAS et les mondes AWI.
 *  --------------------------------------------------------------------
 *  Iteration 2 de "STAS - la console prend vie" :
 *    ENTER STAS -> la console n'est plus seulement un editeur BASIC,
 *    c'est AWI AVEC LE MONDE STAS. On y parle aux mondes, on passe la
 *    porte Legal-Fractal, on delegue des taches.
 *
 *  Regles de dispatch — deterministes, PAS de fallback silencieux :
 *    !cmd            -> shell hote (toutes les commandes DOS/shell)
 *    .texte          -> parole au monde courant (ou au systeme)
 *    enter <monde>   -> porte Legal-Fractal puis entree dans le monde
 *    leave|exit      -> retour a STAS
 *    worlds          -> liste des mondes connus
 *    tout le reste   -> BASIC (feedLine / execDirect de stas-core)
 *
 *  RUN, LIST, NEW, DEL existent en BASIC ET en DOS : c'est pourquoi le
 *  shell est explicite ("!") plutot qu'un fallback devinant l'intention.
 *
 *  WorldSTAS (awi.worlds.WorldStas) y accede de deux facons :
 *    - spawn "stas-world --serve" et parler le protocole JSON lignes ;
 *    - import { WorldBridge } from "@stas/world" cote JS.
 *  --------------------------------------------------------------------
 */

import { runShell } from "./shell.js";
import { out } from "./protocol.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 *  Grammaire de rendu — alignee sur les personas AWI existantes
 *  (ConnectorConfiguration.hx L162-185) + les deux extensions de
 *  l'iteration 2 : la barre de progression .[==] et la voix du monde
 *  .>>>oo>>> . A valider/formaliser cote Haxe.
 */
export const PROMPTS = {
  info: ".(oo) ",           // AWI existant
  question: ".(?°) ",       // AWI existant
  ok: ".(ok) ",             // AWI existant
  error: ".(**) ",          // AWI existant
  progress: ".[==] ",       // extension iteration 2
  progressDone: ".[===] ",  // extension iteration 2
  world: ".>>>oo>>> ",      // extension iteration 2 (voix du monde)
  worldWork: ".>>>==>>> ",  // extension iteration 2 (monde au travail)
};

export class WorldBridge {
  /**
   * @param {object} [opts]
   * @param {import("../../stas-core/index.js").Stas} [opts.stas]
   *        interpreteur BASIC (optionnel — mode monde pur sans lui)
   * @param {string} [opts.user]       nom de persona utilisateur
   * @param {number} [opts.authDelay]  ms de la simulation telephone (0 = instantane)
   * @param {(world:string) => Promise<boolean>|boolean} [opts.authProvider]
   *        vraie porte Legal-Fractal ; defaut = simulation accordee
   * @param {string[]} [opts.worlds]   mondes connus
   */
  constructor(opts = {}) {
    this.stas = opts.stas ?? null;
    this.user = opts.user ?? "fransooa";
    this.authDelay = opts.authDelay ?? 600;
    this.authProvider = opts.authProvider ?? null;
    this.worlds = opts.worlds ?? ["network", "system/device-linux/network"];
    this.currentWorld = null;
    this.listeners = { output: [], message: [] };
  }

  /* -- evenements ---------------------------------------------------- */
  on(ev, fn) {
    (this.listeners[ev] ??= []).push(fn);
    return this;
  }
  emitOutput(text) {
    for (const f of this.listeners.output) f(text);
  }
  /** Messages protocole a destination de WorldSTAS. */
  emitMessage(m) {
    for (const f of this.listeners.message) f(m);
  }
  say(type, text) {
    this.emitOutput((PROMPTS[type] ?? "") + text + "\n");
  }
  /** Un hote WorldSTAS est-il branche ? (sinon on simule ses reponses) */
  get hosted() {
    return this.listeners.message.length > 0;
  }

  /* -- la ligne tapee ------------------------------------------------ */
  /** @returns {Promise<string>} le type de traitement */
  async handleLine(line) {
    const t = (line ?? "").trim();
    if (!t) return "empty";
    if (t.startsWith("!")) return this.shell(t.slice(1).trim());
    if (t.startsWith(".")) return this.worldSay(t.slice(1).trim());
    if (/^enter\b/i.test(t)) return this.enter(t.replace(/^enter\b\s*/i, "").trim());
    if (/^(leave|exit|quit)$/i.test(t)) return this.leave();
    if (/^worlds$/i.test(t)) {
      this.say("info", "Mondes connus : " + this.worlds.join(", "));
      return "worlds";
    }
    return this.basic(t);
  }

  /* -- 1. shell hote -------------------------------------------------- */
  async shell(cmd) {
    if (!cmd) {
      this.say("error", "Usage : !commande  (ex. !dir, !ipconfig, !ls -la)");
      return "shell";
    }
    const { code } = await runShell(cmd, {
      onLine: (l, stream) => {
        this.emitOutput(l + "\n");
        this.emitMessage(out("shell:output", { text: l, stream }));
      },
    });
    if (code !== 0) this.say("error", `exit code ${code}`);
    return "shell";
  }

  /* -- 2. parole au monde --------------------------------------------- */
  worldSay(text) {
    if (!text) return "world";
    if (!this.currentWorld) {
      this.say("info", "Pas de monde actif — enter <monde> d'abord. " +
        "(systeme : la parole est notee, sans effet.)");
      return "world";
    }
    this.emitMessage(out("world:say", { world: this.currentWorld, text }));
    if (!this.hosted) {
      // faute d'hote AWI, STAS fait echo — un vrai WorldSTAS repondrait
      // via { type:"world:say" } et prendrait sa place.
      this.emitOutput(PROMPTS.world + `(sans hote) "${text}" — note.\n`);
    }
    return "world";
  }

  /* -- 3. entrer dans un monde (porte Legal-Fractal) ------------------- */
  async enter(world) {
    if (this.currentWorld) {
      this.say("error", `Deja dans ${this.currentWorld} — leave pour sortir.`);
      return "enter";
    }
    if (!world) {
      this.say("question", "Entrer dans quel monde ? " + this.worlds.join(" | "));
      return "enter";
    }
    this.emitMessage(out("auth:request", {
      world,
      message: "Please pass authorisation using your phone.",
    }));
    this.say("progress", "system/legal-fractal Please pass authorisation using your phone.");

    const granted = this.authProvider
      ? await this.authProvider(world)
      : (this.authDelay > 0 && (await sleep(this.authDelay)), true);

    if (!granted) {
      this.say("error", "system/legal-fractal access denied.");
      return "enter";
    }
    this.say("progressDone", "system/legal-fractal waiting... granted.");
    this.currentWorld = world;
    this.emitOutput(PROMPTS.progressDone + world + "\n");
    this.emitMessage(out("world:enter", { world }));
    if (!this.hosted) {
      // un vrai monde AWI enverrait { type:"world:say", text:"Welcome..." }
      this.emitOutput(PROMPTS.world + `Welcome to the ${world}!\n`);
    }
    return "enter";
  }

  leave() {
    if (!this.currentWorld) {
      this.say("info", "Aucun monde actif — deja dans STAS.");
      return "leave";
    }
    const w = this.currentWorld;
    this.currentWorld = null;
    this.emitMessage(out("world:leave", { world: w }));
    this.say("ok", `back to STAS (quitte ${w}).`);
    return "leave";
  }

  /* -- 4. BASIC -------------------------------------------------------- */
  async basic(t) {
    if (!this.stas) {
      this.say("error", "Pas d'interpreteur BASIC dans ce mode.");
      return "basic";
    }
    const kind = this.stas.feedLine(t);
    if (kind === "direct") {
      try {
        await this.stas.execDirect(t);
      } catch (e) {
        this.emitOutput((e?.message ?? String(e)) + "\n");
      }
    }
    return kind;
  }

  /* -- messages entrants de WorldSTAS (mode --serve) ------------------- */
  handleMessage(m) {
    switch (m?.type) {
      case "auth:granted":
        this.say("progressDone", `${m.world ?? "legal-fractal"} granted.`);
        break;
      case "auth:denied":
        this.say("error", `${m.world ?? "legal-fractal"} denied : ${m.reason ?? "-"}`);
        break;
      case "world:say":
        this.emitOutput(PROMPTS.world + (m.text ?? "") + "\n");
        break;
      case "world:work":
        this.emitOutput(PROMPTS.worldWork + (m.text ?? "") + "\n");
        break;
    }
  }
}
