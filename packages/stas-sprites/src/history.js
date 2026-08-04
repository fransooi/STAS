/*
 *  STAS sprites — pile d'annulation (UNDO / REDO).
 *  --------------------------------------------------------------------
 *  Générique sur l'état : l'éditeur y pousse des CLONES du sprite.
 *  Modèle "pile d'états" : l'état initial est poussé au démarrage
 *  (pointeur 0), chaque opération commitée pousse un nouvel état.
 *  --------------------------------------------------------------------
 */

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.stack = [];
    this.pointer = -1;
  }

  /** Pousse un état (tronque la branche redo éventuelle). */
  push(state) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(state);
    while (this.stack.length > this.limit) this.stack.shift();
    this.pointer = this.stack.length - 1;
  }

  get canUndo() {
    return this.pointer > 0;
  }

  get canRedo() {
    return this.pointer < this.stack.length - 1;
  }

  /** Retourne l'état précédent (ou null). */
  undo() {
    if (!this.canUndo) return null;
    this.pointer--;
    return this.stack[this.pointer];
  }

  /** Retourne l'état suivant (ou null). */
  redo() {
    if (!this.canRedo) return null;
    this.pointer++;
    return this.stack[this.pointer];
  }

  current() {
    return this.stack[this.pointer] ?? null;
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
  }
}
