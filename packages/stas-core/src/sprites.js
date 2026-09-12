/*
 *  STAS — moteur de sprites (port de SPRITES.S)
 *  --------------------------------------------------------------------
 *  STOS affiche ses sprites en composant : décor → buffer de fenêtre →
 *  écran, avec un moteur d'animation/déplacement piloté par la VBL. Ici,
 *  comme pour FADE/SHIFT, le moteur avance sur le « tick » de
 *  l'interpréteur (1 cran = 1 trame = 20 ms) ; le rendu, lui, passe par la
 *  composition ASCII de `cellAt()` (les sprites sont des surfaces de
 *  cellules {ch, fg, bg}).
 *
 *  Modèle de SPRITES.S reproduit ici :
 *    - 15 sprites utilisateur (1..15) ;
 *    - PRIORITY OFF (défaut) : plus le numéro est petit, plus le sprite est
 *      devant ; PRIORITY ON : Y croissant = derrière, le plus grand Y devant,
 *      ex-æquo départagés par le plus petit numéro devant ;
 *    - chaque sprite a un état MOVE X / MOVE Y et une animation, qui
 *      « attendent » MOVE ON / ANIM ON (bits $8000/$8001 chez STOS) ;
 *    - FREEZE suspend, ON reprend, OFF arrête ; UPDATE OFF suspend seulement
 *      l'affichage.
 *
 *  L'état vit dans `io.spr` ; les surfaces viennent de `io.spriteBank`
 *  (objet { sprites: [surface…] }, image n = sprites[n-1]).
 *  --------------------------------------------------------------------
 */

import { ERR } from "./errors.js";
import { T } from "./tokens.js";
import { INT } from "./values.js";

export const MAX_SPRITE = 15;
const FRAME_MS = 20;   // 1 trame VBL

// ---------------------------------------------------------------------------
//  État
// ---------------------------------------------------------------------------

export function spriteState(io) {
  if (!io.spr) {
    io.spr = {
      slots: new Array(MAX_SPRITE + 1).fill(null),
      priority: false,      // PRIORITY ON/OFF (défaut OFF)
      update: true,         // UPDATE ON/OFF (défaut ON)
      synchro: true,        // SYNCHRO ON/OFF (défaut ON)
      limit: null,          // LIMIT SPRITE {x1,y1,x2,y2}
      zones: new Array(129).fill(null),   // 1..128
      last: null,
    };
  }
  return io.spr;
}

function slot(io, n, create = false) {
  const st = spriteState(io);
  if (n < 1 || n > MAX_SPRITE) return null;
  if (!st.slots[n] && create) {
    st.slots[n] = { active: false, x: 0, y: 0, image: 0, mx: null, my: null, anim: null };
  }
  return st.slots[n];
}

function imageAt(io, n) {
  const b = io.spriteBank;
  if (!b || !b.sprites || n < 1) return null;
  return b.sprites[n - 1] ?? null;
}

/** Dimensions d'une surface (Sprite de @stas/sprites, ou objet {w,h}). */
function surfW(s) { return s.w ?? s.width; }
function surfH(s) { return s.h ?? s.height; }

/** Ordre de dessin (bas → haut) des sprites actifs (SPRITES.S `priocalc`). */
function drawOrder(io, st) {
  const order = [];
  for (let n = 1; n <= MAX_SPRITE; n++) {
    const s = st.slots[n];
    if (s && s.active && s.image) order.push(n);
  }
  if (!st.priority) {
    order.sort((a, b) => b - a);            // plus petit numéro = devant
  } else {
    order.sort((a, b) => {                  // plus grand Y = devant
      const ya = st.slots[a].y, yb = st.slots[b].y;
      if (ya !== yb) return ya - yb;
      return b - a;                          // ex-æquo : plus petit devant
    });
  }
  return order;
}

/** Reconstruit `io.sprites` (plan composé par cellAt) et invalide le rendu. */
export function refreshSprites(io) {
  const st = spriteState(io);
  const list = [];
  for (const n of drawOrder(io, st)) {
    const s = st.slots[n];
    const surf = imageAt(io, s.image);
    if (!surf) continue;
    list.push({
      x: s.x - (surf.hx ?? 0),
      y: s.y - (surf.hy ?? 0),
      surface: surf,
      clip: st.limit,
      n,
    });
  }
  io.sprites = list;
  io.spriteVersion = (io.spriteVersion | 0) + 1;
}

/** Comme refreshSprites, mais respecte UPDATE OFF (fidèle à `actualise`). */
export function requestRefresh(io) {
  const st = spriteState(io);
  if (st.update) refreshSprites(io);
}

// ---------------------------------------------------------------------------
//  Analyse des chaînes MOVE / ANIM
// ---------------------------------------------------------------------------

/** « [pos](vit,dir,nb)…[Epos][L] » → { start, seq, cond, loop }. */
function parseMoveSeq(it, s) {
  const txt = String(s);
  const groups = [...txt.matchAll(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)];
  if (!groups.length) it.err(ERR.MOVE_ERR);
  const seq = [];
  for (const g of groups) {
    const speed = parseInt(g[1], 10);
    const step = parseInt(g[2], 10);
    const count = parseInt(g[3], 10);
    if (speed < 0 || speed > 32767 || count < 0 || count > 32767) it.err(ERR.MOVE_ERR);
    seq.push({ speed, step, count });
  }
  const head = txt.slice(0, groups[0].index).trim();
  let start = null;
  if (head) {
    const m = head.match(/-?\d+/);
    if (!m) it.err(ERR.MOVE_ERR);
    start = parseInt(m[0], 10);
  }
  const tail = txt.slice(groups[groups.length - 1].index + groups[groups.length - 1][0].length);
  const e = tail.match(/E\s*(-?\d+)/i);
  const cond = e ? parseInt(e[1], 10) : null;
  const loop = /L/i.test(tail);
  return { start, seq, cond, loop };
}

/** « (image,délai)…[L] » → { seq, loop }. */
function parseAnimSeq(it, s) {
  const txt = String(s);
  const groups = [...txt.matchAll(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)];
  if (!groups.length) it.err(ERR.ANIM_ERR);
  const seq = [];
  for (const g of groups) {
    const image = parseInt(g[1], 10);
    const delay = parseInt(g[2], 10);
    if (image < 0 || delay < 0) it.err(ERR.ANIM_ERR);
    seq.push({ image, delay });
  }
  const tail = txt.slice(groups[groups.length - 1].index + groups[groups.length - 1][0].length);
  return { seq, loop: /L/i.test(tail) };
}

// ---------------------------------------------------------------------------
//  Moteur (avance au tick)
// ---------------------------------------------------------------------------

function stepAxis(s, ms, axis) {
  if (!ms || !ms.on || ms.freeze || !ms.seq.length) return false;
  ms.counter--;
  if (ms.counter > 0) return false;
  const trip = ms.seq[ms.idx];
  s[axis] += trip.step;
  if (trip.count > 0) ms.left--;
  let advance = trip.count > 0 && ms.left <= 0;
  if (ms.cond != null) {
    if ((trip.step > 0 && s[axis] >= ms.cond) || (trip.step < 0 && s[axis] <= ms.cond)) advance = true;
  }
  if (advance) {
    ms.idx++;
    if (ms.idx >= ms.seq.length) {
      if (ms.loop) ms.idx = 0;
      else { ms.on = false; return true; }
    }
    ms.left = ms.seq[ms.idx].count;
    ms.counter = Math.max(1, ms.seq[ms.idx].speed);
  } else {
    ms.counter = Math.max(1, trip.speed);
  }
  return true;
}

function stepAnim(s) {
  const a = s.anim;
  if (!a || !a.on || a.freeze || !a.seq.length) return false;
  a.counter--;
  if (a.counter > 0) return false;
  s.image = a.seq[a.idx].image;
  a.idx++;
  if (a.idx >= a.seq.length) {
    if (a.loop) a.idx = 0;
    else { a.on = false; a.idx = a.seq.length - 1; }
  }
  a.counter = Math.max(1, a.seq[a.idx]?.delay ?? 1);
  return true;
}

/** Un cran de moteur pour tous les sprites. */
export function stepSprites(io) {
  const st = spriteState(io);
  let changed = false, order = false;
  for (let n = 1; n <= MAX_SPRITE; n++) {
    const s = st.slots[n];
    if (!s || !s.active) continue;
    const oldY = s.y;
    if (stepAxis(s, s.mx, "x")) changed = true;
    if (stepAxis(s, s.my, "y")) changed = true;
    if (stepAnim(s)) changed = true;
    if (s.y !== oldY && st.priority) order = true;
  }
  void order;
  return changed;
}

/**
 * Avance le moteur selon le temps écoulé (1 trame = 20 ms). Appelée par
 * Interpreter.tick() et pendant WAIT, comme pour FADE/SHIFT.
 */
export function pumpSprites(io) {
  const st = io.spr;
  if (!st) return false;
  const now = io.now ? io.now() : Date.now();
  const dt = st.last == null ? 0 : Math.max(0, now - st.last);
  st.last = now;
  if (!st.synchro) return false;
  let frames = Math.floor(dt / FRAME_MS);
  if (frames <= 0) return false;
  if (frames > 200) frames = 200;
  let changed = false;
  for (let f = 0; f < frames; f++) changed = stepSprites(io) || changed;
  if (changed && st.update) refreshSprites(io);
  return changed;
}

// ---------------------------------------------------------------------------
//  Aides de parsing
// ---------------------------------------------------------------------------

/** ON / OFF / FREEZE (les trois formes de SPRITES.S `onoff`). */
function onoff(it) {
  const t = it.peek();
  if (t && t.code === T.ON) { it.next(); return "on"; }
  if (t && t.code === T.OFF) { it.next(); return "off"; }
  if (t && t.code === T.FREEZE) { it.next(); return "freeze"; }
  return null;
}

/** Numéro de sprite optionnel (1..15), 0 si absent. */
function optSprite(it, errCode) {
  if (it.atEos()) return 0;
  const v = it.toInt(it.evalExpr());
  if (v < 1 || v > MAX_SPRITE) it.err(errCode);
  return v;
}

// ---------------------------------------------------------------------------
//  Instructions
// ---------------------------------------------------------------------------

/** SPRITE n,x,y[,p] / SPRITE ON|OFF [n] */
function doSprite(it) {
  const st = spriteState(it.io);
  const mode = onoff(it);
  if (mode) {
    const n = optSprite(it, ERR.SPRITE_ERR);
    for (let i = 1; i <= MAX_SPRITE; i++) {
      if (n && i !== n) continue;
      const s = st.slots[i];
      if (s) s.active = mode === "on";
    }
    refreshSprites(it.io);
    return;
  }
  const n = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  let p = 0;
  if (it.eatRaw(",")) p = it.toInt(it.evalExpr());
  if (n < 1 || n > MAX_SPRITE) it.err(ERR.SPRITE_ERR);
  if (p !== 0 && !imageAt(it.io, p)) it.err(ERR.SPRITE_ERR);
  const s = slot(it.io, n, true);
  s.active = true;
  s.x = x;
  s.y = y;
  s.image = p;
  requestRefresh(it.io);
}

/** UPDATE / UPDATE ON / UPDATE OFF */
function doUpdate(it) {
  const st = spriteState(it.io);
  const mode = onoff(it);
  if (mode === "freeze") it.err(ERR.SYNTAX);
  if (!mode) { refreshSprites(it.io); return; }   // UPDATE nu = actualise
  st.update = mode === "on";
  if (st.update) refreshSprites(it.io);
}

/** REDRAW — redessine tous les sprites en l'état. */
function doRedraw(it) {
  refreshSprites(it.io);
}

/** MOVE ON|OFF|FREEZE [n] */
function doMoveOnOff(it) {
  const mode = onoff(it);
  if (!mode) it.err(ERR.MOVE_ERR);
  const n = optSprite(it, ERR.MOVE_ERR);
  const st = spriteState(it.io);
  for (let i = 1; i <= MAX_SPRITE; i++) {
    if (n && i !== n) continue;
    const s = st.slots[i];
    if (!s) continue;
    for (const ms of [s.mx, s.my]) {
      if (!ms) continue;
      if (mode === "off") ms.on = false;
      else if (mode === "freeze") ms.freeze = true;
      else { ms.freeze = false; ms.on = true; }
    }
  }
}

/** MOVE X n,a$ / MOVE Y n,a$ */
function doMoveAxis(it, axis) {
  const n = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const str = it.toStr(it.evalExpr());
  if (n < 1 || n > MAX_SPRITE) it.err(ERR.MOVE_ERR);
  const p = parseMoveSeq(it, str);
  const s = slot(it.io, n, true);
  if (p.start != null) s[axis] = p.start;
  const ms = {
    seq: p.seq,
    cond: p.cond,
    loop: p.loop,
    idx: 0,
    left: p.seq[0].count,
    counter: Math.max(1, p.seq[0].speed),
    on: false,          // comme le STOS : le mouvement attend MOVE ON
    freeze: false,
  };
  if (axis === "x") s.mx = ms; else s.my = ms;
}

/** ANIM ON|OFF|FREEZE [n] / ANIM n,a$ */
function doAnim(it) {
  const st = spriteState(it.io);
  const mode = onoff(it);
  if (mode) {
    const n = optSprite(it, ERR.ANIM_ERR);
    for (let i = 1; i <= MAX_SPRITE; i++) {
      if (n && i !== n) continue;
      const s = st.slots[i];
      if (!s || !s.anim) continue;
      if (mode === "off") s.anim.on = false;
      else if (mode === "freeze") s.anim.freeze = true;
      else { s.anim.freeze = false; s.anim.on = true; }
    }
    return;
  }
  const n = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const str = it.toStr(it.evalExpr());
  if (n < 1 || n > MAX_SPRITE) it.err(ERR.ANIM_ERR);
  const p = parseAnimSeq(it, str);
  const s = slot(it.io, n, true);
  s.anim = {
    seq: p.seq,
    loop: p.loop,
    idx: 0,
    counter: Math.max(1, p.seq[0].delay),
    on: false,          // le STOS : l'animation attend ANIM ON
    freeze: false,
  };
}

/** FREEZE — gèle MOVE et ANIM de tous les sprites. */
function doFreeze(it) {
  const st = spriteState(it.io);
  for (let i = 1; i <= MAX_SPRITE; i++) {
    const s = st.slots[i];
    if (!s) continue;
    if (s.mx) s.mx.freeze = true;
    if (s.my) s.my.freeze = true;
    if (s.anim) s.anim.freeze = true;
  }
}

/** UNFREEZE — remet MOVE et ANIM en marche. */
function doUnfreeze(it) {
  const st = spriteState(it.io);
  for (let i = 1; i <= MAX_SPRITE; i++) {
    const s = st.slots[i];
    if (!s) continue;
    for (const ms of [s.mx, s.my]) if (ms) { ms.freeze = false; ms.on = true; }
    if (s.anim) { s.anim.freeze = false; s.anim.on = true; }
  }
}

/** OFF — arrête tout et retire les sprites. */
function doOff(it) {
  const st = spriteState(it.io);
  for (let i = 1; i <= MAX_SPRITE; i++) {
    const s = st.slots[i];
    if (!s) continue;
    s.active = false;
    if (s.mx) s.mx.on = false;
    if (s.my) s.my.on = false;
    if (s.anim) s.anim.on = false;
  }
  refreshSprites(it.io);
}

/** PRIORITY ON/OFF */
function doPriority(it) {
  const mode = onoff(it);
  if (!mode || mode === "freeze") it.err(ERR.SYNTAX);
  spriteState(it.io).priority = mode === "on";
  requestRefresh(it.io);
}

/** LIMIT SPRITE x1,y1 TO x2,y2 / LIMIT SPRITE */
function doLimitSprite(it) {
  const st = spriteState(it.io);
  if (it.atEos()) {
    st.limit = null;
    requestRefresh(it.io);
    return;
  }
  const x1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y1 = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const x2 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  if (x1 < 0 || x1 >= x2 || y1 < 0 || y1 >= y2) it.err(ERR.FON_CALL);
  st.limit = { x1, y1, x2, y2 };
  requestRefresh(it.io);
}

/** SYNCHRO / SYNCHRO ON / SYNCHRO OFF */
function doSynchro(it) {
  const st = spriteState(it.io);
  const mode = onoff(it);
  if (mode === "freeze") it.err(ERR.SYNTAX);
  if (!mode) {                       // SYNCHRO nu : exécute un cran
    stepSprites(it.io);
    requestRefresh(it.io);
    return;
  }
  st.synchro = mode === "on";
}

// --- fonctions --------------------------------------------------------------

/** XSPRITE(n) / YSPRITE(n) — position du point chaud (SPRITES.S `posprite`). */
function posSpriteFunc(it, axis) {
  const n = it.toInt(it.args(1, 1)[0]);
  if (n < 0 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  const s = slot(it.io, n);
  return INT(s ? s[axis] | 0 : 0);
}

/** MOVEON(n) — 0 si arrêté, sinon état X (mot bas) et Y (mot haut). */
function funcMovon(it) {
  const n = it.toInt(it.args(1, 1)[0]);
  if (n < 1 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  const s = slot(it.io, n);
  const half = (ms) => {
    if (!ms || !ms.on) return 0;
    const idx = Math.min(ms.idx, 0xfff);
    const left = Math.max(0, ms.left) & 0xfff;
    return ((idx << 12) | left) & 0xffff;
  };
  const x = s ? half(s.mx) : 0;
  const y = s ? half(s.my) : 0;
  return INT(((y << 16) | x) | 0);
}

/** COLLIDE(n,tx,ty) — masque de collision avec les autres sprites. */
function funcCollide(it) {
  const a = it.args(3, 3).map((v) => it.toInt(v));
  const [n, tx, ty] = a;
  if (n < 0 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  if (tx < 0 || tx >= 320 || ty < 0 || ty >= 200) it.err(ERR.FON_CALL);
  const st = spriteState(it.io);
  const s = slot(it.io, n);
  if (!s) return INT(0);
  let mask = 0;
  for (let i = 1; i <= MAX_SPRITE; i++) {
    if (i === n) continue;
    const o = st.slots[i];
    if (!o || !o.active) continue;
    if (Math.abs(o.x - s.x) <= tx && Math.abs(o.y - s.y) <= ty) mask |= 1 << i;
  }
  return INT(mask | 0);
}

/** DETECT(n) — couleur du décor sous le point chaud, -1 hors écran. */
function funcDetect(it) {
  const n = it.toInt(it.args(1, 1)[0]);
  if (n < 0 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  const s = slot(it.io, n);
  if (!s) return INT(-1);
  const x = s.x | 0, y = s.y | 0;
  if (x < 0 || x >= 320 || y < 0 || y >= 200) return INT(-1);
  const decor = it.io.logic;
  if (!decor) return INT(-1);
  return INT(decor.colors[y * 320 + x]);
}

// --- zones ------------------------------------------------------------------

/** SET ZONE z,x1,y1 TO x2,y2 */
function doSetZone(it) {
  const z = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const x1 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y1 = it.toInt(it.evalExpr());
  if (!it.eat(T.TO)) it.err(ERR.SYNTAX);
  const x2 = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y2 = it.toInt(it.evalExpr());
  if (z < 1 || z > 128 || x1 < 0 || x1 >= x2 || y1 < 0 || y1 >= y2) it.err(ERR.FON_CALL);
  spriteState(it.io).zones[z] = { x1, y1, x2, y2 };
}

/** RESET ZONE [z] */
function doResetZone(it) {
  const st = spriteState(it.io);
  if (it.atEos()) {
    st.zones.fill(null);
    return;
  }
  const z = it.toInt(it.evalExpr());
  if (z < 1 || z > 128) it.err(ERR.FON_CALL);
  st.zones[z] = null;
}

/** ZONE(n) — 1re zone contenant le point chaud du sprite, ou 0. */
function funcZone(it) {
  const n = it.toInt(it.args(1, 1)[0]);
  if (n < 0 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  const s = slot(it.io, n);
  if (!s) return INT(0);
  const st = spriteState(it.io);
  for (let z = 1; z <= 128; z++) {
    const q = st.zones[z];
    if (!q) continue;
    if (s.x >= q.x1 && s.x <= q.x2 && s.y >= q.y1 && s.y <= q.y2) return INT(z);
  }
  return INT(0);
}

// --- PUT / GET SPRITE (adaptation ASCII) ------------------------------------

/** PUT SPRITE n — estampe l'image dans le calque texte, puis retire le sprite. */
function doPutSprite(it) {
  const n = it.toInt(it.evalExpr());
  if (n < 1 || n > MAX_SPRITE) it.err(ERR.FON_CALL);
  const s = slot(it.io, n);
  if (s && s.image) {
    const surf = imageAt(it.io, s.image);
    const buf = it.io.buffer;
    if (surf) {
      const w = surfW(surf);
      const h = surfH(surf);
      for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
          const c = surf.cells[cy * w + cx];
          if (!c || c.ch === " ") continue;   // masque : transparent
          buf.put(s.x + cx, s.y + cy, c.ch, c.fg, c.bg);
        }
      }
    }
    s.active = false;
  }
  refreshSprites(it.io);
}

/** GET SPRITE x,y,n[,transparent] — capture le calque texte dans l'image n. */
function doGetSprite(it) {
  const x = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const y = it.toInt(it.evalExpr());
  it.expectRaw(",");
  const n = it.toInt(it.evalExpr());
  if (it.eatRaw(",")) it.toInt(it.evalExpr());   // couleur transparente (ignorée)
  const surf = imageAt(it.io, n);
  if (!surf) it.err(ERR.FON_CALL);
  const buf = it.io.buffer;
  const w = surfW(surf);
  const h = surfH(surf);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const c = buf.get(x + cx, y + cy);
      const cell = surf.cells[cy * w + cx];
      if (cell && c) { cell.ch = c.ch; cell.fg = c.fg; cell.bg = c.bg; }
    }
  }
  surf.hx = 0;
  surf.hy = 0;
  refreshSprites(it.io);
}

// ---------------------------------------------------------------------------

export const SPRITE_HANDLERS = {
  sprite: doSprite,
  update: doUpdate,
  redraw: doRedraw,
  moveOnOff: doMoveOnOff,
  moveX: (it) => doMoveAxis(it, "x"),
  moveY: (it) => doMoveAxis(it, "y"),
  anim: doAnim,
  freeze: doFreeze,
  unfreeze: doUnfreeze,
  off: doOff,
  priority: doPriority,
  limitSprite: doLimitSprite,
  synchro: doSynchro,
  xsprite: (it) => posSpriteFunc(it, "x"),
  ysprite: (it) => posSpriteFunc(it, "y"),
  movon: funcMovon,
  collide: funcCollide,
  detect: funcDetect,
  setZone: doSetZone,
  resetZone: doResetZone,
  zone: funcZone,
  putSprite: doPutSprite,
  getSprite: doGetSprite,
};
