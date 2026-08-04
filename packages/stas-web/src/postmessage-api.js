/*
 *  STAS web — API postMessage (connecteur iframe v0).
 *  --------------------------------------------------------------------
 *  Intègre STAS en iframe dans AWI-HAXE / AOZ Studio. Le connecteur côté
 *  hôte (Awi) enveloppe ces messages en méthodes play()/pause()/stop()/
 *  reset()/sendMessage()/request().
 *
 *  Tout message peut porter un `id` ; les accusés renvoient le même `id`,
 *  ce qui sert de mécanisme request/response (corrélation).
 *
 *  Parent → iframe  (target:"stas") :
 *    run    { source?, id? }   charge (si source) + exécute depuis le début
 *    load   { source?, id? }   charge SANS exécuter
 *    play   { id? }            reprend si en pause, sinon (re)lance
 *    pause  { id? }            suspend l'exécution (écran figé)
 *    resume { id? }            reprend après pause
 *    stop   { id? }            interrompt l'exécution courante
 *    reset  { id? }            stop + efface programme / écran / variables
 *    input  { text, id? }      réponse à un input:request
 *    prefs  { prefs, id? }     (réservé V1+)
 *
 *  iframe → parent  (source:"stas") :
 *    ready                        l'engine est prêt
 *    loaded   { id? }             ack de load
 *    paused   { id? }             ack de pause
 *    resumed  { id? }             ack de resume / play-reprise
 *    output   { id?, text }       écran en texte brut (fin de run)
 *    done     { id? }             run terminé normalement
 *    stopped  { id? }             run interrompu (stop / BREAK / STOP)
 *    reset    { id? }             ack de reset (écran vide)
 *    input:request                l'engine attend une ligne (→ input)
 *    error    { id?, message, code }
 *  --------------------------------------------------------------------
 */

const BREAK = 17; // ERR.BREAK / ERR.STOP : arrêt volontaire, pas une « erreur »

export function initPostMessage(stas, input, { onScreen, onReset } = {}) {
  const send = (type, data = {}) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "stas", type, ...data }, "*");
    }
  };

  // signale les INPUT au parent (qui répond via "input")
  const baseReadLine = stas.io.readLine;
  stas.io.readLine = async (echo) => {
    send("input:request");
    return baseReadLine(echo);
  };

  // --- cycle de vie : un seul run à la fois ------------------------------
  let runInProgress = false;
  let externalStop = null; // null | "stop" | "reset"
  let runId = null;

  async function executeRun(id) {
    runId = id ?? null;
    runInProgress = true;
    externalStop = null;
    try {
      await stas.run();
      onScreen?.();
      send("output", { id: runId, text: stas.buffer.toText() });
      send("done", { id: runId });
    } catch (err) {
      if (externalStop === "reset") {
        stas.resetState();
        onReset?.();
        send("reset", { id: runId });
      } else if (externalStop === "stop" || err.code === BREAK) {
        send("stopped", { id: runId });
      } else {
        send("error", {
          id: runId,
          message: err.message,
          code: err.code ?? -1,
        });
      }
    } finally {
      runInProgress = false;
      externalStop = null;
      runId = null;
    }
  }

  const busy = (id) => send("error", { id, message: "already running", code: -1 });

  window.addEventListener("message", async (e) => {
    const m = e.data;
    if (!m || m.target !== "stas") return;
    const id = m.id;
    switch (m.type) {
      case "load":
        if (typeof m.source === "string") {
          stas.loadSource(m.source, { merge: false });
        }
        send("loaded", { id });
        break;
      case "run":
        if (runInProgress) return busy(id);
        if (typeof m.source === "string") {
          stas.loadSource(m.source, { merge: false });
        }
        await executeRun(id);
        break;
      case "play":
        if (stas.paused) {
          stas.resume();
          send("resumed", { id });
        } else if (runInProgress) {
          busy(id);
        } else {
          await executeRun(id);
        }
        break;
      case "resume":
        stas.resume();
        send("resumed", { id });
        break;
      case "pause":
        if (runInProgress) stas.pause(); // pauser à l'arrêt = no-op
        send("paused", { id });
        break;
      case "stop":
        if (runInProgress) {
          externalStop = "stop";
          stas.requestBreak();
        } else {
          send("stopped", { id });
        }
        break;
      case "reset":
        if (runInProgress) {
          externalStop = "reset";
          stas.requestBreak();
        } else {
          stas.resetState();
          onReset?.();
          send("reset", { id });
        }
        break;
      case "input":
        input.inject(String(m.text ?? ""));
        break;
      case "prefs":
        // réservé : mode d'affichage ASCII, polices de sprites, zooms...
        break;
    }
  });

  send("ready");
  return { send };
}
