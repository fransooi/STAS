/*
 *  STAS — tests du cœur (node:test, zéro dépendance)
 *  Lance : node --test test/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Stas,
  tokenize,
  detokenize,
  Program,
  T,
  SUB,
  StosError,
  ERR,
  INTRO_FR,
  INTRO_EN,
  PixelScreen,
  convertScreen,
} from "../packages/stas-core/index.js";

// ---------------------------------------------------------------------------
//  Aides
// ---------------------------------------------------------------------------

async function run(src, opts = {}) {
  const stas = new Stas({
    langue: opts.langue ?? 0,
    readLine: opts.readLine,
    inkey: opts.inkey,
  });
  stas.loadSource(Array.isArray(src) ? src.join("\n") : src);
  await stas.run(opts.from ?? null);
  return stas.buffer.toText();
}

/** Lignes non vides du rendu */
function out(text) {
  return text.split("\n").filter((l) => l.length > 0);
}

async function runOut(src, opts) {
  return out(await run(src, opts));
}

async function expectError(src, code, opts = {}) {
  try {
    await run(src, opts);
  } catch (e) {
    assert.ok(e instanceof StosError, `attendu StosError, reçu ${e}`);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail(`erreur ${code} attendue, aucune erreur levée`);
}

// ---------------------------------------------------------------------------
//  Tokeniseur
// ---------------------------------------------------------------------------

test("tokeniseur : PRINT chaîne", () => {
  const t = tokenize('print "salut"');
  assert.equal(t[0].code, T.PRINT);
  assert.equal(t[1].code, T.ALPHA);
  assert.equal(t[1].value, "salut");
});

test("tokeniseur : frontière des mots-clés (format ≠ for+mat)", () => {
  const t = tokenize("format=1");
  assert.equal(t[0].code, T.VARIABLE);
  assert.equal(t[0].name, "format");
});

test("tokeniseur : variable avec suffixe $", () => {
  const t = tokenize('nom$="francois"');
  assert.equal(t[0].code, T.VARIABLE);
  assert.equal(t[0].name, "nom$");
});

test("tokeniseur : hexa, binaire, réel", () => {
  const t = tokenize("a=$ff+%101+1.5");
  assert.equal(t[2].code, T.HEXA);
  assert.equal(t[2].value, 255);
  assert.equal(t[4].code, T.BINAIRE);
  assert.equal(t[4].value, 5);
  assert.equal(t[6].code, T.FLOAT);
  assert.equal(t[6].value, 1.5);
});

test("tokeniseur : REM avale la ligne", () => {
  const t = tokenize("rem ceci reste brut : print");
  assert.equal(t.length, 1);
  assert.equal(t[0].code, T.REM);
  assert.equal(t[0].text, " ceci reste brut : print");
});

test("tokeniseur : apostrophe = REM", () => {
  const t = tokenize("' un commentaire");
  assert.equal(t[0].code, T.REM);
});

test("tokeniseur : mots-clés multiples avec espaces", () => {
  assert.equal(tokenize("screen  copy")[0].code, T.SCREEN_COPY);
  const t2 = tokenize("line input a$");
  assert.equal(t2[0].code, T.ETENDU);
  assert.equal(t2[0].sub, SUB.LINEINPUT);
});

test("tokeniseur : insensible à la casse, ? = print", () => {
  const t = tokenize('PRINT Goto');
  assert.equal(t[0].code, T.PRINT);
  assert.equal(t[1].code, T.GOTO);
  assert.equal(tokenize('? "x"')[0].code, T.PRINT);
});

test("tokeniseur : chaîne non fermée = erreur 12", () => {
  assert.throws(() => tokenize('print "ouvert'), (e) => e.code === ERR.SYNTAX);
});

// ---------------------------------------------------------------------------
//  Programme / éditeur
// ---------------------------------------------------------------------------

test("programme : tri, remplacement, suppression", () => {
  const p = new Program();
  p.setLine(20, tokenize("print 2"));
  p.setLine(10, tokenize("print 1"));
  assert.deepEqual(p.lines.map((l) => l.num), [10, 20]);
  p.setLine(10, tokenize("print 100"));
  assert.equal(detokenize(p.lines[0].tokens), "print 100");
  assert.ok(p.deleteLine(10));
  assert.ok(!p.deleteLine(10));
});

test("programme : detokenize lisible", () => {
  assert.equal(detokenize(tokenize("for a=1 to 10")), "for a=1 to 10");
  assert.equal(detokenize(tokenize('print "a";b')), 'print "a";b');
  assert.equal(detokenize(tokenize("x=rnd(5)+1")), "x=rnd(5)+1");
  assert.equal(detokenize(tokenize("print -5")), "print -5");
  assert.equal(detokenize(tokenize("a=-5")), "a=-5");
});

test("programme : chargement d'un source (numéro seul = suppression)", () => {
  const p = new Program();
  p.load('10 print "a"\r\n20 goto 10\r\n\r\n30');
  assert.deepEqual(p.lines.map((l) => l.num), [10, 20]);
});

// ---------------------------------------------------------------------------
//  Arithmétique et priorités
// ---------------------------------------------------------------------------

test("arith : priorités STOS, ^ associatif à gauche", async () => {
  assert.deepEqual(await runOut([
    "10 print 2+3*4",
    "20 print 2^3^2",
    "30 print 10 mod 3",
    "40 print 7/2",
    "50 print 8/2",
  ]), ["14", "64", "1", "3.5", "4"]);
});

test("arith : bit à bit et NOT", async () => {
  assert.deepEqual(await runOut([
    "10 print 12 and 10",
    "20 print 12 or 1",
    "30 print 5 xor 3",
    "40 print not 0",
    "50 print not 7",
  ]), ["8", "13", "6", "1", "0"]);
});

test("arith : division par zéro = erreur 46", async () => {
  await expectError(["10 print 1/0"], ERR.DIV_ZERO);
});

test("arith : types incompatibles = erreur 19", async () => {
  await expectError(['10 print "a"+1'], ERR.TYPE_MISMATCH);
});

test("chaînes : concaténation et comparaisons", async () => {
  assert.deepEqual(await runOut([
    '10 print "ma"+"ison"',
    '20 print "a"<"b"',
    '30 print "abc"="abc"',
  ]), ["maison", "1", "1"]);
});

// ---------------------------------------------------------------------------
//  Structures de contrôle
// ---------------------------------------------------------------------------

test("for/next : pas positif et négatif", async () => {
  assert.deepEqual(await runOut([
    "10 for i=1 to 3",
    "20 print i;",
    "30 next i",
    "40 print",
    "50 for j=5 to 1 step -2",
    "60 print j;",
    "70 next j",
  ]), ["123", "531"]);
});

test("while/wend et repeat/until", async () => {
  assert.deepEqual(await runOut([
    "10 x=0",
    "20 while x<3",
    "30 x=x+1",
    "40 wend",
    "50 print x",
    "60 repeat",
    "70 x=x-1",
    "80 until x=0",
    "90 print x",
  ]), ["3", "0"]);
});

test("gosub/return", async () => {
  assert.deepEqual(await runOut([
    "10 gosub 100",
    "20 end",
    '100 print "cent":return',
  ]), ["cent"]);
});

test("on gosub choisit la bonne cible", async () => {
  assert.deepEqual(await runOut([
    "10 on 2 gosub 100,200",
    "20 end",
    '100 print "cent":return',
    '200 print "deux":return',
  ]), ["deux"]);
});

test("pop abandonne le retour du gosub", async () => {
  assert.deepEqual(await runOut([
    "10 gosub 100",
    '20 print "retour":end',
    '100 pop:print "sans retour":end',
  ]), ["sans retour"]);
});

test("return sans gosub = erreur 36", async () => {
  await expectError(["10 return"], ERR.RET_NO_GOSUB);
});

test("if/then/else : forme complète et goto numérique", async () => {
  assert.deepEqual(await runOut([
    '10 if 1=1 then print "oui" else print "non"',
    '20 if 1=2 then print "invisible" else print "sinon"',
    "30 if 5>3 then 50",
    '40 print "rate"',
    '50 print "gagne"',
  ]), ["oui", "sinon", "gagne"]);
});

test("goto vers ligne inexistante = erreur 29", async () => {
  await expectError(["10 goto 999"], ERR.UNDEF_LINE);
});

test("imbrications for/while", async () => {
  assert.deepEqual(await runOut([
    "10 s=0",
    "20 for i=1 to 3",
    "30 j=0",
    "40 while j<i",
    "50 j=j+1:s=s+1",
    "60 wend",
    "70 next i",
    "80 print s",
  ]), ["6"]);
});

// ---------------------------------------------------------------------------
//  Variables et tableaux
// ---------------------------------------------------------------------------

test("variables : défauts, sensibilité à la casse", async () => {
  assert.deepEqual(await runOut([
    "10 print a",
    '20 print b$;"|"',
    "30 X=1:x=2",
    "40 print X;x",
  ]), ["0", "|", "12"]);
});

test("tableaux : dim obligatoire, bornes, redim", async () => {
  await expectError(["10 t(0)=1"], ERR.NO_ARRAY);                // 18
  await expectError(["10 dim t(2)", "20 t(5)=1"], ERR.SUBSCRIPT); // 85
  await expectError(["10 dim t(2)", "20 dim t(3)"], ERR.ARRAY_DIM); // 28
});

test("tableaux : multi-dimensions et chaînes", async () => {
  assert.deepEqual(await runOut([
    "10 dim m(1,1)",
    "20 m(0,0)=1:m(0,1)=2:m(1,0)=3:m(1,1)=4",
    "30 print m(0,0);m(0,1);m(1,0);m(1,1)",
    '40 dim s$(2):s$(0)="a":s$(2)="c"',
    "50 print s$(0);s$(1);s$(2)",
  ]), ["1234", "ac"]);
});

// ---------------------------------------------------------------------------
//  DATA / READ / RESTORE
// ---------------------------------------------------------------------------

test("data/read/restore", async () => {
  assert.deepEqual(await runOut([
    "10 data 10,20,30",
    "20 read a:read b",
    "30 restore",
    "40 read c",
    "50 print a;b;c",
    '60 data "stos","basic"',
    "70 restore 60",
    "80 read x$,y$",
    "90 print x$;y$",
  ]), ["102010", "stosbasic"]);
});

test("read : plus de donnée = erreur 34", async () => {
  await expectError(["10 read a"], ERR.NO_MORE_DATA);
});

// ---------------------------------------------------------------------------
//  Fonctions
// ---------------------------------------------------------------------------

test("fonctions chaînes", async () => {
  assert.deepEqual(await runOut([
    '10 print left$("lionet",3);right$("lionet",3);mid$("maison-alfort",8,6)',
    '20 print len("abcd");asc("A");chr$(66)',
    '30 print upper$("stos");lower$("BASIC")',
    '40 print instr("abcdef","cd");instr("abcdef","zz")',
    '50 print string$(3,"ab");space$(2);"|"',
    '60 print str$(1.5);val("42");val("n42")',
  ]), [
    "lionetalfort",
    "465B",
    "STOSbasic",
    "30",
    "ababab  |",
    "1.5420",
  ]);
});

test("fonctions maths", async () => {
  assert.deepEqual(await runOut([
    "10 print abs(-5);int(-1.5);sgn(-9);sgn(0)",
    "20 print sqr(16);min(3,7);max(3,7)",
    "30 deg",
    "40 print sin(30)",
    "50 rad",
    "60 print cos(0)",
    "70 print hex$(255);bin$(5)",
  ]), ["5-2-10", "437", "0.5", "1", "FF101"]);
});

test("rnd : entier dans [0,n-1]", async () => {
  const lines = await runOut([
    "10 for i=1 to 50",
    "20 r=rnd(10)",
    '30 if r<0 then print "bas"',
    '40 if r>9 then print "haut"',
    "50 next i",
    '60 print "ok"',
  ]);
  assert.deepEqual(lines, ["ok"]);
});

test("pi et timer", async () => {
  const lines = await runOut(["10 print pi", "20 print timer>=0"]);
  assert.match(lines[0], /^3\.14159/);
  assert.equal(lines[1], "1");
});

// ---------------------------------------------------------------------------
//  Affichage
// ---------------------------------------------------------------------------

test("print : tabulations , et suppression de saut de ligne", async () => {
  const text = await run(['10 print "a","b"', '20 print "c";', '30 print "d"']);
  assert.match(text, /^a\s{13}b\n/);
  assert.ok(text.includes("cd\n"));
});

test("locate écrit à la bonne cellule", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 locate 5,2", '20 print "*"']);
  await stas.run();
  assert.equal(stas.buffer.get(5, 2).ch, "*");
});

test("inc / dec", async () => {
  assert.deepEqual(await runOut(["10 a=5:inc a:dec a,2", "20 print a"]), ["4"]);
});

// ---------------------------------------------------------------------------
//  Mode direct
// ---------------------------------------------------------------------------

test("mode direct : feedLine, list, new", async () => {
  const stas = new Stas({});
  assert.equal(stas.feedLine("10 print 1"), "stored");
  assert.equal(stas.feedLine("20 print 2"), "stored");
  assert.equal(stas.feedLine("10"), "deleted");
  assert.equal(stas.feedLine(""), "empty");
  await stas.execDirect("list");
  assert.ok(stas.buffer.toText().includes("20 print 2"));
  assert.equal(stas.feedLine("print 2+2"), "direct");
  await stas.execDirect("print 2+2");
  assert.ok(stas.buffer.toText().includes("4"));
  await stas.execDirect("new");
  assert.ok(stas.program.isEmpty);
});

test("goto interdit en mode direct = erreur 14", async () => {
  const stas = new Stas({});
  stas.feedLine("10 print 1");
  await assert.rejects(
    stas.execDirect("goto 10"),
    (e) => e.code === ERR.ILL_DIRECT,
  );
});

test("commande directe en programme = erreur 15", async () => {
  await expectError(["10 list"], ERR.ILL_PROG);
});

// ---------------------------------------------------------------------------
//  Entrées
// ---------------------------------------------------------------------------

test("input : numérique et chaîne", async () => {
  const lines = await runOut(
    ['10 input "age et nom ? ";n,p$', '20 print p$;" a ";n;" ans"'],
    { readLine: async () => "42,francois" },
  );
  assert.deepEqual(lines, ["age et nom ? francois a 42 ans"]);
});

test("input : mauvaise saisie puis bonne", async () => {
  const vals = ["pouet", "7"];
  const lines = await runOut(["10 input n", "20 print n*2"], {
    readLine: async () => vals.shift(),
  });
  assert.ok(lines.some((l) => l.includes("Redo from start")));
  assert.ok(lines.some((l) => l.includes("14")));
});

test("line input : la virgule reste dans la chaîne", async () => {
  const lines = await runOut(['10 line input "texte: ";a$', "20 print a$"], {
    readLine: async () => "un,deux",
  });
  assert.ok(lines.some((l) => l.includes("un,deux")));
});

test("inkey$ : non bloquant", async () => {
  const keys = ["a"];
  const lines = await runOut(
    [
      "10 a$=inkey$",
      '20 if a$="" then print "vide" else print a$',
      "30 a$=inkey$",
      '40 if a$="" then print "vide" else print a$',
    ],
    { inkey: () => keys.shift() ?? "" },
  );
  assert.deepEqual(lines, ["a", "vide"]);
});

// ---------------------------------------------------------------------------
//  Erreurs
// ---------------------------------------------------------------------------

test("erreurs : message avec numéro de ligne, bilingue", async () => {
  const e = await expectError(["10 print 1/0"], ERR.DIV_ZERO);
  assert.equal(e.message, "Division by zero in line 10");
  const e2 = await expectError(["10 print 1/0"], ERR.DIV_ZERO, { langue: 1 });
  assert.equal(e2.message, "Division par zéro en ligne 10");
});

test("stop = erreur 17, end = arrêt propre", async () => {
  await expectError(["10 stop"], ERR.STOP);
  assert.deepEqual(
    await runOut(['10 print "avant"', "20 end", '30 print "apres"']),
    ["avant"],
  );
});

test("error n déclenche l'erreur n", async () => {
  await expectError(["10 error 46"], ERR.DIV_ZERO);
});

test("next/wend/until orphelins = erreurs 23/25/27", async () => {
  await expectError(["10 next"], ERR.NEXT_NO_FOR);
  await expectError(["10 wend"], ERR.WEND_NO_WHILE);
  await expectError(["10 until 1"], ERR.UNTIL_NO_REP);
});

test("fonctions/instructions non implémentées = erreur 20", async () => {
  await expectError(["10 poke 0,1"], ERR.NOT_IMPL);
  await expectError(["10 print peek(0)"], ERR.NOT_IMPL);
});

test("intro FR/EN : titres et consigne STAS RUN", () => {
  assert.ok(INTRO_FR.includes("LA CONSOLE PREND VIE"));
  assert.ok(INTRO_EN.includes("THE CONSOLE COMES ALIVE"));
  assert.ok(INTRO_FR.includes("STAS RUN"));
  assert.ok(INTRO_EN.includes("STAS RUN"));
});

test('"STAS RUN" à l\'invite exécute le programme', async () => {
  const stas = new Stas({});
  assert.equal(stas.feedLine('10 Print "Hello STAS"'), "stored");
  assert.equal(stas.feedLine("STAS RUN"), "direct");
  await stas.execDirect("STAS RUN");
  assert.ok(stas.buffer.toText().includes("Hello STAS"));
});

// ---------------------------------------------------------------------------
//  Mode graphique (STAS) : vrais plans pixels 320x200,
//  composition texte (fond) -> ascii du physique -> sprites (dessus)
// ---------------------------------------------------------------------------

test("gfx : MODE 0 crée les plans 320x200 et redimensionne le texte", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,40,20"]);
  await stas.run();
  assert.equal(stas.buffer.width, 40);
  assert.equal(stas.buffer.height, 20);
  assert.ok(stas.gfx, "gfx doit exister après MODE");
  assert.equal(stas.gfx.width, 320);
  assert.equal(stas.gfx.height, 200);
  assert.equal(stas.physic.width, 320);
});

test("gfx : MODE 1 = hires ascii 160x50", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 1"]);
  await stas.run();
  assert.equal(stas.buffer.width, 160);
  assert.equal(stas.buffer.height, 50);
  assert.equal(stas.gfx.width, 320);
});

test("gfx : lockTextRes fige la grille texte face à MODE", async () => {
  const stas = new Stas({ width: 160, height: 50 });
  stas.io.lockTextRes = true;                 // réglage adaptateur (?text=/?res=)
  stas.loadSource(["10 MODE 0", "20 PEN 2", "30 PLOT 5,6"]);
  await stas.run();
  assert.equal(stas.buffer.width, 160);       // MODE 0 n'a pas repris la main
  assert.equal(stas.buffer.height, 50);
  assert.equal(stas.gfx.width, 320);          // les plans pixels sont bien là
  assert.equal(stas.gfx.get(5, 6), 2);
});

test("gfx : résolution non diviseur de 320x200 = erreur 45", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,77,25"]);
  await assert.rejects(stas.run(), (e) => e.code === ERR.RES_NOT_ALLOW);
});

test("gfx : PLOT pose le pixel (couleur + opaque)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,10", "20 PEN 2", "30 PLOT 5,6", "40 PLOT 7,8,3"]);
  await stas.run();
  assert.equal(stas.gfx.get(5, 6), 2);
  assert.equal(stas.gfx.isTouched(5, 6), 1);
  assert.equal(stas.gfx.get(7, 8), 3);
  assert.equal(stas.gfx.get(0, 0), 15);        // fond = PAPER par défaut
  // PLOT ne touche pas au plan texte
  assert.equal(stas.buffer.get(5, 6).ch, " ");
});

test("gfx : PLOT sans MODE = erreur 88", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 PLOT 1,1"]);
  await assert.rejects(stas.run(), (e) => e.code === ERR.GFX_MODE);
});

test("gfx : cellAt pose le gfx AU-DESSUS du texte (transparent si rien)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,10", "20 PEN 2", "30 PLOT 5,6"]);
  await stas.run();
  const g = stas.cellAt(0, 0);              // bloc contenant (5,6)
  assert.equal(g.ch, "▘");
  assert.equal(g.fg, 2);
  assert.equal(g.bg, 15);                   // le papier texte transparaît
  stas.buffer.put(0, 0, "X", 7, 0);         // texte dessous : masqué par le gfx
  const c = stas.cellAt(0, 0);
  assert.equal(c.ch, "▘");
  assert.equal(c.fg, 2);
  assert.equal(stas.cellAt(5, 5).ch, " ");  // ni gfx ni texte
});

test("gfx : bloc entièrement dessiné = cellule opaque (cache le texte)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0", "20 BAR 0,0 TO 3,7,2"]);
  await stas.run();
  stas.buffer.put(0, 0, "A", 0, 15);
  const c = stas.cellAt(0, 0);
  assert.equal(c.ch, " ");
  assert.equal(c.bg, 2);
});

test("gfx : sans MODE, cellAt renvoie la cellule texte telle quelle", () => {
  const stas = new Stas({});
  stas.buffer.put(3, 3, " ", 0, 4);
  assert.equal(stas.cellAt(3, 3).bg, 4);
});

// ---------------------------------------------------------------------------
//  Connecteur iframe v0 : pause / resume / resetState
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("connecteur : resetState remet la machine à nu", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,10,5", "20 PEN 3", "30 PLOT 2,2"]);
  await stas.run();
  assert.ok(stas.gfx, "gfx présent après MODE");
  stas.resetState();
  assert.equal(stas.program.isEmpty, true);
  assert.equal(stas.gfx, null);
  assert.equal(stas.interp.vars.size, 0);
  assert.equal(stas.buffer.toText().trim(), "");
  assert.equal(stas.paused, false);
  const c = stas.cellAt(2, 2);
  assert.equal(c.ch, " ");
  assert.equal(c.bg, 15);
});

test("connecteur : pause à l'arrêt = no-op, resume renvoie false", () => {
  const stas = new Stas({});
  assert.equal(stas.paused, false);
  stas.pause();
  assert.equal(stas.paused, false);
  assert.equal(stas.resume(), false);
});

test("connecteur : pause fige, resume relance l'exécution", async () => {
  let ticks = 0;
  const tick = async () => {
    ticks++;
    await wait(0);
  };
  const stas = new Stas({ tick });
  stas.loadSource(["10 while 1", "20 x=x+1", "30 wend"]);
  const p = stas.run();
  await wait(120); // l'exécution tourne
  stas.pause();
  await wait(40); // le fige s'installe
  const c1 = ticks;
  assert.ok(c1 > 0, "l'exécution a tourné avant pause");
  await wait(120);
  const c2 = ticks;
  assert.equal(c2, c1, "pendant pause, plus aucun tick");
  assert.equal(stas.paused, true);
  stas.resume();
  await wait(120);
  const c3 = ticks;
  assert.ok(c3 > c2, "après resume, l'exécution repart");
  stas.requestBreak();
  await p.catch(() => {});
  assert.equal(stas.paused, false);
});

test("connecteur : stop pendant pause interrompt proprement", async () => {
  let ticks = 0;
  const tick = async () => {
    ticks++;
    await wait(0);
  };
  const stas = new Stas({ tick });
  stas.loadSource(["10 while 1", "20 x=x+1", "30 wend"]);
  const p = stas.run();
  await wait(120);
  stas.pause();
  await wait(40);
  assert.equal(stas.paused, true);
  const c1 = ticks;
  stas.requestBreak();
  await assert.rejects(p, (e) => e.code === ERR.BREAK);
  assert.equal(stas.paused, false, "le stop nettoie l'état pause");
  await wait(60);
  assert.equal(ticks, c1, "plus rien ne tourne après stop");
});

// ---------------------------------------------------------------------------
//  Primitives graphiques : LINE / BOX / BAR / CIRCLE / ELLIPSE / PAINT /
//  DRAW — rasterisation dans les plans 320x200 (le converter projette).
// ---------------------------------------------------------------------------

const P = (s, x, y) => s.gfx.get(x, y);

test("gfx : LINE trace un segment horizontal (Bresenham)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,10", "20 PEN 2", "30 LINE 2,3 TO 7,3"]);
  await stas.run();
  for (let x = 2; x <= 7; x++) assert.equal(P(stas, x, 3), 2);
  assert.equal(P(stas, 1, 3), 15);
  assert.equal(P(stas, 8, 3), 15);
  assert.equal(P(stas, 2, 4), 15);
  assert.equal(stas.gfx.gx, 7);
  assert.equal(stas.gfx.gy, 3);
});

test("gfx : LINE trace une diagonale avec couleur explicite", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,10,10", "20 LINE 0,0 TO 4,4,3"]);
  await stas.run();
  for (let i = 0; i <= 4; i++) assert.equal(P(stas, i, i), 3);
  assert.equal(P(stas, 1, 0), 15);
});

test("gfx : LINE TO relatif démarre au curseur graphique", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,10,10", "20 PLOT 2,2", "30 LINE TO 5,2"]);
  await stas.run();
  for (let x = 2; x <= 5; x++) assert.equal(P(stas, x, 2), 0); // PEN défaut = 0
  assert.equal(P(stas, 1, 2), 15);
});

test("gfx : BAR remplit, BOX ne fait que le contour", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 MODE 0,16,10",
    "20 PEN 4", "30 BAR 1,1 TO 3,3",
    "40 PEN 3", "50 BOX 6,6 TO 8,8",
  ]);
  await stas.run();
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) assert.equal(P(stas, x, y), 4);
  assert.equal(P(stas, 0, 0), 15);
  assert.equal(P(stas, 6, 6), 3);
  assert.equal(P(stas, 7, 6), 3);
  assert.equal(P(stas, 8, 8), 3);
  assert.equal(P(stas, 7, 7), 15, "intérieur BOX vide");
});

test("gfx : CIRCLE pose les 4 cardinaux, centre vide", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,20", "20 PEN 2", "30 CIRCLE 10,10,3"]);
  await stas.run();
  assert.equal(P(stas, 10, 7), 2);
  assert.equal(P(stas, 10, 13), 2);
  assert.equal(P(stas, 7, 10), 2);
  assert.equal(P(stas, 13, 10), 2);
  assert.equal(P(stas, 10, 10), 15);
});

test("gfx : ELLIPSE rx!=ry", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,20", "20 PEN 5", "30 ELLIPSE 10,10,4,2"]);
  await stas.run();
  assert.equal(P(stas, 14, 10), 5);
  assert.equal(P(stas, 6, 10), 5);
  assert.equal(P(stas, 10, 12), 5);
  assert.equal(P(stas, 10, 8), 5);
});

test("gfx : PAINT remplit une région bornée par un contour", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 MODE 0,10,10",
    "20 PEN 2", "30 BOX 1,1 TO 5,5",
    "40 PEN 4", "50 PAINT 3,3",
  ]);
  await stas.run();
  assert.equal(P(stas, 3, 3), 4);
  assert.equal(P(stas, 2, 2), 4);
  assert.equal(P(stas, 4, 4), 4);
  assert.equal(P(stas, 1, 1), 2, "contour intact");
  assert.equal(P(stas, 0, 0), 15, "extérieur intact");
  assert.equal(P(stas, 6, 6), 15);
});

test("gfx : DRAW interprète une chaîne tortue (R/D)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,20", "20 PEN 2", '30 DRAW "R3 D3"']);
  await stas.run();
  for (let x = 0; x <= 3; x++) assert.equal(P(stas, x, 0), 2);
  for (let y = 0; y <= 3; y++) assert.equal(P(stas, 3, y), 2);
  assert.equal(P(stas, 1, 1), 15);
  assert.equal(stas.gfx.gx, 3);
  assert.equal(stas.gfx.gy, 3);
});

test("gfx : DRAW C change la couleur en cours de chaîne", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,20,20", "20 PEN 2", '30 DRAW "R2 C3 R2"']);
  await stas.run();
  assert.equal(P(stas, 0, 0), 2);
  assert.equal(P(stas, 1, 0), 2);
  assert.equal(P(stas, 3, 0), 3);
  assert.equal(P(stas, 4, 0), 3);
});

test("gfx : primitives hors MODE = erreur 88", async () => {
  const srcs = [
    ["10 LINE 0,0 TO 1,1"],
    ["10 BOX 0,0 TO 1,1"],
    ["10 BAR 0,0 TO 1,1"],
    ["10 CIRCLE 5,5,2"],
    ["10 ELLIPSE 5,5,2,1"],
    ["10 PAINT 0,0"],
    ['10 DRAW "R1"'],
  ];
  for (const s of srcs) {
    const stas = new Stas({});
    stas.loadSource(s);
    await assert.rejects(stas.run(), (e) => e.code === ERR.GFX_MODE);
  }
});

test("gfx : couleur hors 0..15 et rayon négatif = erreur", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0,10,10", "20 LINE 0,0 TO 1,1,99"]);
  await assert.rejects(stas.run(), (e) => e.code === ERR.FON_CALL);
  const stas2 = new Stas({});
  stas2.loadSource(["10 MODE 0,10,10", "20 CIRCLE 5,5,-1"]);
  await assert.rejects(stas2.run(), (e) => e.code === ERR.FON_CALL);
});

// ---------------------------------------------------------------------------
//  Écrans PHYSIC/LOGIC : AUTOBACK / SCREEN SWAP / SCREEN COPY
// ---------------------------------------------------------------------------

test("écrans : AUTOBACK OFF trace seulement dans le logique", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0", "20 AUTOBACK OFF", "30 PLOT 10,10,3"]);
  await stas.run();
  assert.equal(stas.logic.get(10, 10), 3);
  assert.equal(stas.physic.get(10, 10), 15);
  assert.equal(stas.physic.isTouched(10, 10), 0);
});

test("écrans : SCREEN SWAP échange physic et logic", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 MODE 0", "20 AUTOBACK OFF", "30 PLOT 10,10,3", "40 SCREEN SWAP",
  ]);
  await stas.run();
  assert.equal(stas.physic.get(10, 10), 3);
  assert.equal(stas.logic.get(10, 10), 15);
});

test("écrans : SCREEN COPY LOGIC TO PHYSIC", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 MODE 0", "20 AUTOBACK OFF", "30 PLOT 10,10,3",
    "40 SCREEN COPY LOGIC TO PHYSIC",
  ]);
  await stas.run();
  assert.equal(stas.physic.get(10, 10), 3);
  assert.equal(stas.logic.get(10, 10), 3);
});

test("écrans : SCREEN COPY seul = logic vers physic", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 MODE 0", "20 AUTOBACK OFF", "30 PLOT 4,4,1", "40 SCREEN COPY"]);
  await stas.run();
  assert.equal(stas.physic.get(4, 4), 1);
});

test("écrans : SCREEN SWAP sans MODE = erreur 88", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 SCREEN SWAP"]);
  await assert.rejects(stas.run(), (e) => e.code === ERR.GFX_MODE);
});

// ---------------------------------------------------------------------------
//  Converter graphique -> ascii (cœur)
// ---------------------------------------------------------------------------

test("converter : ligne fine continue et coin connecté", () => {
  const s = new PixelScreen();
  for (let x = 0; x < 16; x++) s.set(x, 1, 3);      // horizontale 1 px
  for (let y = 0; y < 16; y++) s.set(0, y, 3);      // verticale 1 px : coin
  const cells = convertScreen(s, 80, 25);
  assert.equal(cells[0].ch, "▛");                   // coin connecté
  assert.equal(cells[1].ch, "▀");                   // ligne continue
  assert.equal(cells[2].ch, "▀");
  assert.equal(cells[0].bg, null);
});

test("converter : bloc uniforme -> cellule pleine, pixel isolé -> glyphe transparent", () => {
  const s = new PixelScreen();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) s.set(x, y, 2);
  let cells = convertScreen(s, 80, 25);
  assert.equal(cells[0].bg, 2);
  assert.equal(cells[0].ch, " ");
  assert.equal(cells[1].bg, null);            // bloc voisin transparent
  const s2 = new PixelScreen();
  s2.set(0, 0, 1);
  cells = convertScreen(s2, 80, 25);
  assert.equal(cells[0].ch, "▘");
  assert.equal(cells[0].fg, 1);
  assert.equal(cells[0].bg, null);
});

// ---------------------------------------------------------------------------
//  WAIT KEY (STAS V1) : instruction bloquante qui consomme la touche.
// ---------------------------------------------------------------------------

test("WAIT KEY : bloque puis consomme la touche", async () => {
  const q = ["a"];
  const stas = new Stas({ inkey: () => q.shift() ?? "", sleep: () => {} });
  stas.loadSource([
    "10 WAIT KEY",
    "20 a$=inkey$",
    '30 if a$="" then print "mangee" else print "pas mangee"',
  ]);
  await stas.run();
  assert.ok(stas.buffer.toText().includes("mangee"));
});

test("WAIT KEY : attend tant qu'aucune touche (polling)", async () => {
  let calls = 0;
  const stas = new Stas({
    inkey: () => { calls++; return calls >= 3 ? "x" : ""; },
    sleep: () => {},
  });
  stas.loadSource(["10 WAIT KEY", '20 print "ok"']);
  await stas.run();
  assert.ok(calls >= 3, "a pollé plusieurs fois avant la touche");
  assert.ok(stas.buffer.toText().includes("ok"));
});
