/*
 *  STAS — la palette STOS (16 mots ST de 9 bits, format `0000 0RGB 0RGB 0RGB`)
 *  --------------------------------------------------------------------
 *  Port de BASIC.S (`color`/`colorf`/`s`/`fde`/`colshift`) et de SPRITES.S
 *  (`fade`/`shifter`/`shifton`). Le STOS anime sa palette par INTERRUPTIONS :
 *  FADE et SHIFT rendent la main tout de suite et la palette se modifie
 *  ensuite, un cran toutes les `speed` trames (1 trame = 1/50 s = 20 ms).
 *
 *  Ici, faute d'interruption, la même horloge est avancée par `pumpAnims()`,
 *  appelée par le « tick » de l'interpréteur (toutes les 1024 instructions et
 *  pendant WAIT) : le résultat est identique pour un programme BASIC.
 *
 *  L'état vit dans `io.anim` : { shift: …, fade: … }.
 *  --------------------------------------------------------------------
 */

import { stPaletteToRgb } from "./ascii-buffer.js";

/** Horloge hôte (ms) — repli sur Date.now si l'adaptateur n'en fournit pas. */
function nowMs(io) {
  return io.now ? io.now() : Date.now();
}

/** Écrit un mot ST dans la palette (io.paletteST, + io.palette RGB, + version). */
export function setPaletteWord(io, i, word) {
  io.paletteST[i] = word & 0xffff;
  io.palette[i] = stPaletteToRgb(word & 0x777);
  io.paletteVersion = (io.paletteVersion | 0) + 1;
}

/** Lit un mot de palette comme le matériel : masqué à $777 (`colorf`). */
export function getPaletteWord(io, i) {
  return io.paletteST[i] & 0x777;
}

// --- SHIFT : rotation de la plage [début..fin] de registres -----------------
//  BASIC.S `colshift` + SPRITES.S `shifton`/`shifter` : chaque cran fait
//  reg[i] = reg[i-1] et reg[début] = ancien reg[fin] (rotation à droite).

export function shiftEnd(io) {
  return io.mode === 0 ? 15 : 3;   // lowres : 16 registres ; sinon 4
}

export function startShift(io, speed, start) {
  const end = shiftEnd(io);
  start = Math.max(0, Math.min(start | 0, end));
  io.anim.shift = {
    start,
    end,
    speed: speed | 0,
    acc: 0,
    last: null,
  };
}

export function stopShift(io) {
  io.anim.shift = null;
}

/** Un cran de rotation (SPRITES.S `shifter`). */
export function stepShift(io) {
  const s = io.anim.shift;
  if (!s) return false;
  const last = getPaletteWord(io, s.end);
  for (let i = s.end; i > s.start; i--) {
    setPaletteWord(io, i, getPaletteWord(io, i - 1));
  }
  setPaletteWord(io, s.start, last);
  return true;
}

// --- FADE : fondu de 16 mots vers une cible, ±1 par composante --------------

/**
 * @param target  number[16] — mots $RGB cibles (déjà masqués $777)
 * @param mask    word — quelles entrées bougent (bit i = couleur i)
 */
export function startFade(io, speed, target, mask) {
  // SPRITES.S `fade` : un fondu de TOUTES les couleurs arrête le shifter.
  if ((mask & 0xffff) === 0xffff) stopShift(io);
  io.anim.fade = {
    speed: speed | 0,
    acc: 0,
    last: null,
    target: target.map((w) => w & 0x777),
    mask: mask & 0xffff,
  };
}

/** Un pas de fondu : chaque composante R/G/B bouge de ±1 vers la cible. */
function fadeStepWord(cur, tgt) {
  let out = 0;
  for (let sh = 8; sh >= 0; sh -= 4) {
    const c = (cur >> sh) & 7;
    const t = (tgt >> sh) & 7;
    const n = c < t ? c + 1 : c > t ? c - 1 : c;
    out |= n << sh;
  }
  return out;
}

/** Un pas de fondu ; renvoie false quand tout est arrivé (l'anim s'arrête). */
export function stepFade(io) {
  const f = io.anim.fade;
  if (!f) return false;
  let moving = false;
  for (let i = 0; i < 16; i++) {
    if (!((f.mask >> i) & 1)) continue;
    const cur = getPaletteWord(io, i);
    const tgt = f.target[i];
    if (cur === tgt) continue;
    const next = fadeStepWord(cur, tgt);
    setPaletteWord(io, i, next);
    if (next !== tgt) moving = true;
  }
  if (!moving) {
    io.anim.fade = null;
    return true;
  }
  return true;
}

/**
 * Avance toutes les animations selon le temps réel écoulé (1 trame = 20 ms).
 * Appelée par Interpreter.tick() et pendant WAIT. Renvoie true si quelque
 * chose a bougé (l'appelant redessine de toute façon).
 */
export function pumpAnims(io) {
  const a = io.anim;
  if (!a) return false;
  const now = nowMs(io);
  let changed = false;
  for (const key of ["shift", "fade"]) {
    const st = a[key];
    if (!st) continue;
    const dt = st.last == null ? 0 : Math.max(0, now - st.last);
    st.last = now;
    st.acc += dt;
    const period = Math.max(1, st.speed) * 20;
    let guard = 0;
    while (st.acc >= period && guard++ < 1000) {
      st.acc -= period;
      if (key === "shift") stepShift(io);
      else stepFade(io);
      changed = true;
      if (!a[key]) break;
    }
  }
  return changed;
}
