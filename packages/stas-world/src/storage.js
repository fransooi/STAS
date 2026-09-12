/*
 *  STAS world — stockage local, mockup du connecteur AWI "stas".
 *  --------------------------------------------------------------------
 *  Contrat calqué sur awi.connectors.editor (awi-runtime) :
 *
 *    sendMessage(command, parameters) -> Promise<Answer>
 *      command    "stas:save" | "stas:load" — forme "connecteur:commande"
 *                 routée comme EdNetwork.dispatchMessage vers command_save
 *      parameters { path, source?, userName? } — côté AWI, userName est
 *                 injecté par le connecteur d'authentification
 *                 (EdHttp.onMessage → validateAndCacheToken)
 *
 *    Answer (awi.base.Answer.hx, champ pour champ) :
 *      { success:boolean, error:boolean, data:object, message:string, info:{} }
 *      data.stosCode traduit une défaillance en erreur STOS
 *      (48 fichier introuvable, 53 mauvais nom, 16 entrée/sortie)
 *
 *    Enveloppe transport (EdHttp.reply) pour HTTP/WebSocket plus tard :
 *      { id, responseTo: command, parameters: data }
 *
 *  Phase 3 : ConnectorStas.hx exposera les mêmes commandes et branchera
 *  PocketBase + LegalFractal à la place du système de fichiers local.
 *  --------------------------------------------------------------------
 */

import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Racine de l'installation STAS (calculée depuis ce fichier, pas le cwd). */
const STAS_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)), "..", "..", ".."
);

/** Answer réussie (awi.base.Answer). */
export function answerOk(data = {}) {
  return { success: true, error: false, data, message: "", info: {} };
}

/** Answer en échec (awi.base.Answer) — message + data.stosCode. */
export function answerError(message, data = {}) {
  return { success: false, error: true, data, message, info: {} };
}

/** Pseudo-UUID — même forme que Message.generateUUID. */
function generateUUID() {
  const chars = "0123456789abcdef";
  let uid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uid += "-";
    else if (i === 14) uid += "4";
    else uid += chars.charAt(Math.floor(Math.random() * 16));
  }
  return uid;
}

// Erreurs STOS utilisées (table merreur de BASIC.S)
const STOS_FILE_NOT_FOUND = 48;
const STOS_BAD_FILE_NAME = 53;
const STOS_IN_OUT = 16;

export class LocalStasConnector {
  /**
   * @param {object} opts
   *   user     : nom d'utilisateur (dummy — réservé Volt.A)
   *   root     : dossier de résolution des chemins relatifs (défaut : cwd)
   *   stasRoot : racine de l'installation STAS pour le préfixe "examples:"
   *              (défaut : calculée depuis l'emplacement de ce module —
   *               le même remappage que STAS.bat, valable depuis n'importe
   *               quel répertoire)
   */
  constructor({ user = "user", root = process.cwd(), stasRoot = STAS_ROOT } = {}) {
    this.className = "LocalStasConnector";
    this.token = "stas";
    this.handle = "local";
    this.user = user;
    this.root = root;
    this.stasRoot = stasRoot;
    this.lastMessage = null;
  }

  /** Point d'entrée façon EdHttp.onMessage(message) -> Answer. */
  async onMessage(message) {
    this.lastMessage = message;
    try {
      return await this.dispatchMessage(message);
    } catch (e) {
      const reason = e?.message ?? String(e);
      return answerError("stas:storage-error", {
        stosCode: STOS_IN_OUT,
        error: reason,
      });
    }
  }

  /** Routage façon EdNetwork.dispatchMessage : "stas:save" → command_save. */
  async dispatchMessage(message) {
    const command = String(message?.command ?? "");
    const colon = command.indexOf(":");
    const name = colon > 0 ? command.slice(colon + 1) : command;
    const handler = this["command_" + name];
    if (typeof handler !== "function") {
      return answerError("awi:command-not-found", { command });
    }
    const parameters = { ...(message.parameters ?? {}) };
    if (parameters.userName == null) parameters.userName = this.user;
    return handler.call(this, parameters, message);
  }

  /** L'API que branche stas.io.sendCommand. */
  async sendMessage(command, parameters = {}) {
    const message = {
      id: generateUUID(),
      sender: "stas",
      target: this.token,
      token: this.token,
      command,
      parameters,
      timestamp: Date.now(),
    };
    return this.onMessage(message);
  }

  /** Enveloppe réponse façon EdHttp.reply (transport HTTP/WebSocket). */
  reply(parameters, message = null) {
    const msg = message ?? this.lastMessage;
    return { id: generateUUID(), responseTo: msg?.command ?? "", parameters };
  }

  /**
   * Chemin absolu. Préfixe "examples:" -> dossier examples de
   * l'installation STAS (comme STAS.bat) ; autres chemins relatifs -> root.
   */
  resolvePath(path) {
    const p = String(path);
    const m = p.match(/^examples:(.*)$/i);
    if (m) return resolve(this.stasRoot, "examples", m[1]);
    return isAbsolute(p) ? p : resolve(this.root, p);
  }

  /** stas:save — écrit la source sur disque. */
  async command_save({ path, source, userName }) {
    if (!path || !String(path).trim()) {
      return answerError("stas:bad-file-name", { stosCode: STOS_BAD_FILE_NAME });
    }
    const full = this.resolvePath(String(path));
    const text = String(source ?? "");
    writeFileSync(
      full,
      text === "" || text.endsWith("\n") ? text : text + "\n",
      "utf8"
    );
    return answerOk({
      path: full,
      userName,
      bytes: Buffer.byteLength(text, "utf8"),
    });
  }

  /** stas:load — lit une source .bas. */
  async command_load({ path, userName }) {
    if (!path || !String(path).trim()) {
      return answerError("stas:bad-file-name", { stosCode: STOS_BAD_FILE_NAME });
    }
    const full = this.resolvePath(String(path));
    let source;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      return answerError("stas:file-not-found", {
        stosCode: STOS_FILE_NOT_FOUND,
        path: full,
      });
    }
    return answerOk({ path: full, userName, source });
  }

  /** stas:bsave — écrit un bloc mémoire binaire (tableau d'octets). */
  async command_bsave({ path, data, userName }) {
    if (!path || !String(path).trim()) {
      return answerError("stas:bad-file-name", { stosCode: STOS_BAD_FILE_NAME });
    }
    const full = this.resolvePath(String(path));
    const buf = Buffer.from(Array.isArray(data) ? data : []);
    writeFileSync(full, buf);
    return answerOk({ path: full, userName, bytes: buf.length });
  }

  /** stas:bload — lit un bloc mémoire binaire. */
  async command_bload({ path, userName }) {
    if (!path || !String(path).trim()) {
      return answerError("stas:bad-file-name", { stosCode: STOS_BAD_FILE_NAME });
    }
    const full = this.resolvePath(String(path));
    let buf;
    try {
      buf = readFileSync(full);
    } catch {
      return answerError("stas:file-not-found", {
        stosCode: STOS_FILE_NOT_FOUND,
        path: full,
      });
    }
    return answerOk({ path: full, userName, data: Array.from(buf) });
  }
}
