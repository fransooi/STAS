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
  PixelScreen,
  convertScreen,
  stPaletteToRgb,
  rgbToStPalette,
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

test("list : bornes n / n,m / n-m / n- / -m", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 a", "20 b", "30 c", "40 d"]);
  const listed = async (cmd) => {
    stas.buffer.clear();
    await stas.execDirect(cmd);
    return stas.buffer.toText().split("\n").filter((l) => l.trim());
  };
  assert.deepEqual(await listed("list"), ["10 a", "20 b", "30 c", "40 d"]);
  assert.deepEqual(await listed("list 20"), ["20 b"]);
  assert.deepEqual(await listed("list 20,40"), ["20 b", "30 c", "40 d"]);
  assert.deepEqual(await listed("list 20-30"), ["20 b", "30 c"]);
  assert.deepEqual(await listed("list 20-"), ["20 b", "30 c", "40 d"]);
  assert.deepEqual(await listed("list -20"), ["10 a", "20 b"]);
});

// ---------------------------------------------------------------------------
//  SAVE / LOAD (connecteur mockup — même contrat que ConnectorStas d'AWI)
// ---------------------------------------------------------------------------

/** Connecteur en mémoire : mêmes commandes/réponses que LocalStasConnector. */
function memoryConnector() {
  const files = new Map();
  const calls = [];
  return {
    files,
    calls,
    async sendMessage(command, parameters) {
      calls.push({ command, parameters });
      if (command === "stas:save") {
        files.set(parameters.path, parameters.source);
        return { success: true, error: false, data: { path: parameters.path }, message: "", info: {} };
      }
      if (command === "stas:load") {
        if (!files.has(parameters.path)) {
          return { success: false, error: true, data: { stosCode: 48 }, message: "stas:file-not-found", info: {} };
        }
        return {
          success: true, error: false,
          data: { path: parameters.path, source: files.get(parameters.path) },
          message: "", info: {},
        };
      }
      return { success: false, error: true, data: {}, message: "awi:command-not-found", info: {} };
    },
  };
}

test("save/load : passent par le connecteur (io.sendCommand)", async () => {
  const { sendMessage, files, calls } = memoryConnector();
  const stas = new Stas({ sendCommand: sendMessage, userName: "loic" });
  stas.feedLine('10 print "hello"');
  await stas.execDirect('save "demo.bas"');
  assert.equal(calls[0].command, "stas:save");
  assert.equal(calls[0].parameters.userName, "loic");
  assert.match(files.get("demo.bas"), /print "hello"/);
  assert.equal(stas.io.currentPath, "demo.bas");
  assert.ok(stas.buffer.toText().includes("demo.bas"));

  // save sans nom réutilise le fichier courant
  stas.feedLine('20 print "bye"');
  await stas.execDirect("save");
  assert.match(files.get("demo.bas"), /bye/);

  // save as force un nouveau nom
  await stas.execDirect('save as "copy.bas"');
  assert.ok(files.has("copy.bas"));
  assert.equal(stas.io.currentPath, "copy.bas");

  // new oublie le fichier courant
  await stas.execDirect("new");
  assert.equal(stas.io.currentPath, null);

  // load remplace le programme en mémoire
  await stas.execDirect('load "demo.bas"');
  assert.equal(stas.program.lines.length, 2);
  assert.equal(stas.io.currentPath, "demo.bas");
});

test("save sans nom ni fichier courant demande le chemin", async () => {
  const { sendMessage, files } = memoryConnector();
  const stas = new Stas({
    sendCommand: sendMessage,
    readLine: async () => "typed.bas",
  });
  stas.feedLine("10 print 1");
  await stas.execDirect("save");
  assert.ok(files.has("typed.bas"));
  assert.equal(stas.io.currentPath, "typed.bas");
});

test("load introuvable = erreur 48 ; sans connecteur = erreur 20", async () => {
  const { sendMessage } = memoryConnector();
  const stas = new Stas({ sendCommand: sendMessage });
  await assert.rejects(
    stas.execDirect('load "nope.bas"'),
    (e) => e.code === ERR.FILE_NOT_FOUND,
  );
  const stas2 = new Stas({});
  await assert.rejects(
    stas2.execDirect('save "x.bas"'),
    (e) => e.code === ERR.NOT_IMPL,
  );
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
  await expectError(["10 call 0"], ERR.NOT_IMPL);
  await expectError(["10 print fkey"], ERR.NOT_IMPL);
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

// ---------------------------------------------------------------------------
//  Vocabulaire star-link-demo : INK / RBOX / CENTRE / DRAW numérique /
//  RESERVE AS SCREEN + START / LOGIC= / PLAY / no-ops écran
// ---------------------------------------------------------------------------

test("ink : couleur de tracé gfx sans toucher le PEN texte", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 mode 0",
    "20 pen 5 : ink 2",
    "30 plot 10,10",
  ]);
  await stas.run();
  assert.equal(stas.io.logic.get(10, 10), 2);   // tracé à l'INK
  assert.equal(stas.buffer.curPen, 5);           // le texte garde son PEN
});

test("ink avant mode : l'encre survit au MODE", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 ink 3", "20 mode 0", "30 plot 5,5"]);
  await stas.run();
  assert.equal(stas.io.logic.get(5, 5), 3);
});

test("rbox : coins arrondis, arêtes droites, centre intact", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 mode 0", "20 ink 4", "30 rbox 10,10 to 30,20"]);
  await stas.run();
  const p = stas.io.logic;
  assert.equal(p.get(20, 10), 4);              // milieu arête haute
  assert.equal(p.get(20, 20), 4);              // milieu arête basse
  assert.equal(p.get(10, 15), 4);              // milieu bord gauche
  assert.equal(p.get(20, 15), 15);             // centre intact = papier
  const corner = p.get(10, 10);                // coin brut : non dessiné
  assert.notEqual(corner, 4);                  // (arrondi, pas d'angle vif)
});

test("centre : écrit centré sur la ligne courante", async () => {
  const stas = new Stas({ width: 21 });
  await stas.execDirect('centre "ABC"');
  const text = stas.buffer.toText();
  assert.ok(text.includes("ABC"));
  // colonne de départ = (21-3)/2 = 9 → 9 espaces avant ABC
  assert.ok(/ {9}ABC/.test(text));
});

test("draw numérique : x1,y1 to x2,y2 (+ forme TO relative)", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 mode 0",
    "20 draw 5,5 to 15,5",
    "30 draw to 5,15",       // repart du curseur gfx (15,5) -> diagonale
  ]);
  await stas.run();
  const p = stas.io.logic;
  for (let x = 5; x <= 15; x++) assert.equal(p.get(x, 5), 0, `pixel ${x},5`);
  for (let i = 0; i <= 10; i++) {                // (15,5) -> (5,15)
    assert.equal(p.get(15 - i, 5 + i), 0, `pixel ${15 - i},${5 + i}`);
  }
  assert.equal(p.gx, 5); assert.equal(p.gy, 15);   // curseur graphique
});

test("draw chaîne tortue : inchangé, conflit résolu par le type", async () => {
  const stas = new Stas({});
  stas.loadSource(['10 mode 0', '20 draw "c1 r5"']);
  await stas.run();
  const p = stas.io.logic;
  assert.equal(p.get(5, 0), 1);   // tracé de 5 vers la droite, encre 1
});

test("reserve as screen + start(n) : banque réservée puis adresse", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 reserve as screen 5",
    "20 logic=start(5)",
    '30 print logic',
  ]);
  await stas.run();
  assert.ok(/\d/.test(stas.buffer.toText()));
  assert.equal(stas.io.banks.get(5).kind, "screen");
});

test("start(n) sans reserve = erreur 44", async () => {
  await expectError(["10 mode 0", "20 a=start(7)"], ERR.BANK_NOT_RES);
});

test("play / flash / key / hide / click : acceptés sans effet", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 play 1,12,10",
    "20 flash off : key off : click off",
    "30 hide",
  ]);
  await stas.run();
  assert.ok(true);   // aucune erreur levée = vocabulaire accepté
});

// ---------------------------------------------------------------------------
//  Compléments §3.3 : trig/hyperbolique, matcher, FIX/USING, TIME$/DATE$, …
// ---------------------------------------------------------------------------

/** Stas avec providers personnalisés (inputChars, now). */
async function runCustom(src, io = {}) {
  const stas = new Stas({ langue: io.langue ?? 0 });
  Object.assign(stas.io, io);
  stas.loadSource(Array.isArray(src) ? src.join("\n") : src);
  await stas.run();
  return stas.buffer.toText();
}

test("trig : hyperboliques et ASIN/ACOS", async () => {
  assert.deepEqual(await runOut([
    "10 print hsin(0);hcos(0);htan(0)",
    "20 print asin(0.5)",
    "30 print acos(0.5)",
  ]), ["010", "0.523598776", "1.04719755"]);
});

test("ASIN hors domaine = erreur 13", async () => {
  await expectError(["10 print asin(2)"], ERR.FON_CALL);
  await expectError(["10 print acos(-2)"], ERR.FON_CALL);
});

test("DEG/RAD : fonction = conversion, instruction = mode", async () => {
  assert.deepEqual(await runOut([
    "10 print deg(pi)",
    "20 print rad(180)",
    "30 print rad(deg(90))",
  ]), ["180", "3.14159265", "90"]);
  assert.deepEqual(await runOut([
    "10 deg",
    "20 print sin(30)",
    "30 rad",
    "40 print cos(0)",
  ]), ["0.5", "1"]);
});

test("FLIP$ inverse la chaîne", async () => {
  assert.deepEqual(await runOut(['10 print flip$("stos")']), ["sots"]);
});

test("FREE et LANGUAGE", async () => {
  assert.deepEqual(await runOut(["10 print free>0", "20 print language"]), ["1", "0"]);
  assert.deepEqual(await runOut(["10 print language"], { langue: 1 }), ["1"]);
});

test("TIME$/DATE$ : lecture hôte et affectation", async () => {
  const fixed = new Date(1988, 5, 28, 10, 50, 0).getTime();
  const lines = out(await runCustom(["10 print time$", "20 print date$"], {
    now: () => fixed,
  }));
  assert.deepEqual(lines, ["10:50:00", "28/06/1988"]);
  assert.deepEqual(await runOut([
    '10 time$="01:02:03":date$="28/06/88"',
    "20 print time$;date$",
  ]), ["01:02:0328/06/88"]);
});

test("SWAP : variables et éléments de tableau", async () => {
  assert.deepEqual(await runOut([
    '10 a=1:b=100:a$="left":b$="right"',
    "20 swap a,b:swap(a$,b$)",
    "30 print a;b;a$;b$",
  ]), ["1001rightleft"]);
  assert.deepEqual(await runOut([
    "10 dim t(2):t(0)=1:t(1)=2:t(2)=3",
    "20 swap t(0),t(2)",
    "30 print t(0);t(1);t(2)",
  ]), ["321"]);
  await expectError(['10 a=1:b$="x"', "20 swap a,b$"], ERR.TYPE_MISMATCH);
});

test("FIX : précision d'affichage des réels", async () => {
  assert.deepEqual(await runOut([
    "10 fix(2):print pi",
    "20 fix(0):print pi",
    "30 fix(16):print pi",
    "40 fix(-4):print pi",
  ]), ["3.14", "3.14159265", "3.14159265", "3.1416E0"]);
});

test("SORT et MATCH : tableau trié 1-D", async () => {
  assert.deepEqual(await runOut([
    '10 dim a$(2):a$(0)="c":a$(1)="a":a$(2)="b"',
    "20 sort a$(0)",
    "30 print a$(0);a$(1);a$(2)",
    '40 print match(a$(0),"b")',
    '50 print match(a$(0),"bb")',
    '60 print match(a$(0),"z")',
  ]), ["abc", "1", "-2", "-3"]);
  assert.deepEqual(await runOut([
    "10 dim n(3):n(0)=30:n(1)=10:n(2)=20:n(3)=40",
    "20 sort n(0)",
    "30 print n(0);n(1);n(2);n(3)",
  ]), ["10203040"]);
  await expectError(['10 dim a$(1)', "20 print match(a$(0),1)"], ERR.TYPE_MISMATCH);
});

test("USING : format de BASIC.S (~ # + - . ; ^)", async () => {
  assert.deepEqual(await runOut([
    '10 print using "###.##";3.14159',
    '20 print using "x=###";42',
    '30 print using "+##";10',
    '40 print using "-##";-10',
    '50 print using "1st:~ 2nd:~ 3rd:~";"Basic"',
    '60 print using "#;###";3.1415926',
  ]), ["  3.14", "x= 42", "+10", "-10", "1st:B 2nd:a 3rd:s", "3 141"]);
});

test("USING : exposant (^)", async () => {
  assert.deepEqual(await runOut([
    '10 fix(-4):print using "#.^^^";12345.618',
  ]), ["1.E+4"]);
});

test("USING : forme instruction autonome", async () => {
  assert.deepEqual(await runOut(['10 using "###";7']), ["  7"]);
});

test("INPUT$ : lecture, dans une expression, branches non prises", async () => {
  const stas = new Stas({});
  const reads = [];
  const feed = "abcdefghij";
  let pos = 0;
  stas.io.inputChars = async (n) => {
    reads.push(n);
    const s = feed.slice(pos, pos + n);
    pos += n;
    return s;
  };
  stas.loadSource([
    "10 x$=input$(3)",
    "20 print x$",
    '30 print input$(2)+"!"',
    "40 if 0 then y$=input$(5)",
    '50 print "done"',
  ]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["abc", "de!", "done"]);
  assert.deepEqual(reads, [3, 2]); // la branche IF non prise n'a rien lu
});

test("INPUT$ : relu à chaque itération", async () => {
  const stas = new Stas({});
  let calls = 0;
  stas.io.inputChars = async (n) => {
    calls++;
    return "X".repeat(n);
  };
  stas.loadSource(["10 for k=1 to 3", "20 print input$(1);", "30 next k"]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["XXX"]);
  assert.equal(calls, 3);
});

// ---------------------------------------------------------------------------
//  §3.1 — ON ERROR GOTO / RESUME / ERRN / ERRL / BREAK ON|OFF
// ---------------------------------------------------------------------------

test("ON ERROR GOTO : capture, ERRN/ERRL et RESUME NEXT", async () => {
  assert.deepEqual(await runOut([
    "10 on error goto 100",
    "20 print 1/0",
    '30 print "apres"',
    "40 end",
    '100 print "erreur";errn;"ligne";errl',
    "110 resume next",
  ]), ["erreur46ligne20", "apres"]);
});

test("RESUME : rejoue l'instruction fautive", async () => {
  assert.deepEqual(await runOut([
    "10 on error goto 100",
    "20 a=0:b=5",
    "30 print b/a",
    '40 print "fini"',
    "50 end",
    "100 a=1",
    "110 resume",
  ]), ["5", "fini"]);
});

test("RESUME n : repart d'une ligne", async () => {
  assert.deepEqual(await runOut([
    "10 on error goto 100",
    "20 print 1/0",
    '30 print "jamais"',
    '40 print "cible"',
    "50 end",
    "100 resume 40",
  ]), ["cible"]);
});

test("RESUME sans erreur = erreur 38", async () => {
  await expectError(["10 resume"], ERR.RES_NO_ERR);
});

test("erreur dans le gestionnaire : non rattrapée", async () => {
  await expectError([
    "10 on error goto 100",
    "20 print 1/0",
    "100 print 1/0",
  ], ERR.DIV_ZERO);
});

test("ON ERROR GOTO 0 : désactive le gestionnaire", async () => {
  await expectError([
    "10 on error goto 100",
    "20 on error goto 0",
    "30 print 1/0",
    '100 print "handler"',
  ], ERR.DIV_ZERO);
});

test("BREAK ON/OFF : pilote l'interruption Ctrl-C", async () => {
  const stas = new Stas({});
  await stas.execDirect("break off");
  assert.equal(stas.interp.breakEnabled, false);
  stas.requestBreak();
  assert.equal(stas.interp.breakRequested, false);
  await stas.execDirect("break on");
  assert.equal(stas.interp.breakEnabled, true);
  stas.requestBreak();
  assert.equal(stas.interp.breakRequested, true);
});

// ---------------------------------------------------------------------------
//  §3.2 — mémoire : banques adressées, PEEK/POKE, bits
// ---------------------------------------------------------------------------

test("banques : RESERVE, LENGTH, START, PEEK/POKE", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 reserve as data 5,100",
    "20 print length(5)",
    "30 poke start(5),65",
    "40 poke start(5)+1,66",
    "50 print peek(start(5));chr$(peek(start(5)+1))",
  ]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["256", "65B"]);
  assert.equal(stas.io.banks.get(5).kind, "data");
  assert.equal(stas.io.banks.get(5).size, 256);
});

test("banques : règles d'erreur", async () => {
  await expectError(["10 print start(5)"], ERR.BANK_NOT_RES);        // 44
  await expectError(["10 reserve as screen 5", "20 reserve as screen 5"], ERR.BANK_RES); // 41
  await expectError(["10 reserve as screen 15"], ERR.BANK15_MENU);    // 81
  // LENGTH d'une banque absente = 0 (pas une erreur)
  assert.deepEqual(await runOut(["10 print length(9)"]), ["0"]);
});

test("PEEK/POKE/DEEK/DOKE/LEEK/LOKE/COPY/FILL", async () => {
  assert.deepEqual(await runOut([
    "10 poke 1000,123",
    "20 print peek(1000)",
    "30 doke 1000,65535",
    "40 print deek(1000)",
    "50 loke 1000,-1",
    "60 print leek(1000)",
    "70 poke 1000,7:poke 1001,8:copy 1000,1001 to 1100",
    "80 print peek(1100);peek(1101)",
    "90 fill 1200 to 1207,$01020304",
    "100 print peek(1200);peek(1201);peek(1202);peek(1203)",
  ]), ["123", "65535", "-1", "78", "1234"]);
});

test("DEEK/LEEK : adresse impaire = erreur 32", async () => {
  await expectError(["10 print deek(1001)"], ERR.ADDR_ERROR);
  await expectError(["10 print leek(1003)"], ERR.ADDR_ERROR);
});

test("HUNT : trouve une chaîne en mémoire", async () => {
  assert.deepEqual(await runOut([
    "10 poke 4000,72:poke 4001,73:poke 4002,33",
    '20 print hunt(4000 to 4003,"HI")',
    '30 print hunt(4000 to 4003,"ZZ")',
  ]), ["4000", "0"]);
});

test("bits (BSET/BCLR/BCHG/BTST) et rotations (ROL/ROR)", async () => {
  assert.deepEqual(await runOut([
    "10 a=0:bset a,3:print a",
    "20 print btst(a,3);btst(a,2)",
    "30 bclr a,3:print a",
    "40 b=1:bchg b,0:print b",
    "50 x=1:rol x,1:print x",
    "60 y=2:ror y,1:print y",
  ]), ["8", "10", "0", "0", "2", "1"]);
});

test("mémoire écran : compatible (plans ST) par défaut", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 paper 0", "20 mode 0", "30 poke physic,255", "40 print peek(physic)"]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["255"]);
  assert.equal(stas.io.physic.colors[0], 1); // plan 0, pixels 0..7
  assert.equal(stas.io.physic.colors[7], 1);
  assert.equal(stas.io.physic.colors[8], 0); // octet suivant = autre groupe
});

test("mémoire écran : native (1 octet/pixel) via memMode", async () => {
  const stas = new Stas({ memMode: "native" });
  stas.loadSource(["10 mode 0", "20 poke physic+100,9", "30 print peek(physic+100)"]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["9"]);
  assert.equal(stas.io.physic.colors[100], 9);
});

test("VARPTR : variables vues comme de la mémoire", async () => {
  assert.deepEqual(await runOut([
    "10 loke varptr(A),1000",
    "20 print A",
    '30 s$="HI":p=varptr(s$)',
    "40 print peek(p);peek(p+1);deek(p-2)",
    "50 b=$01020304:p2=varptr(b):print peek(p2)",
    "60 b=$05060708:print peek(p2)",
    "70 f=2.5:print deek(varptr(f))",
  ]), ["1000", "72732", "1", "5", "16388"]);
});

test("BCOPY : copie de banque à banque", async () => {
  assert.deepEqual(await runOut([
    "10 reserve as data 5,256",
    "20 reserve as data 6,256",
    "30 poke start(5),77",
    "40 bcopy 5 to 6",
    "50 print peek(start(6))",
  ]), ["77"]);
});

test("BSAVE/BLOAD : bloc mémoire via le connecteur", async () => {
  const files = new Map();
  const stas = new Stas({});
  const no = { success: false, error: true, data: {}, message: "no", info: {} };
  stas.io.sendCommand = async (command, params) => {
    if (command === "stas:bsave") {
      files.set(params.path, params.data);
      return { success: true, error: false, data: {}, message: "", info: {} };
    }
    if (command === "stas:bload") {
      if (!files.has(params.path)) {
        return { success: false, error: true, data: { stosCode: 48 }, message: "", info: {} };
      }
      return { success: true, error: false, data: { data: files.get(params.path) }, message: "", info: {} };
    }
    return no;
  };
  stas.loadSource([
    "10 poke 500,9:poke 501,8:poke 502,7",
    '20 bsave "blk.bin",500 to 502',
    "30 poke 500,0:poke 501,0:poke 502,0",
    '40 bload "blk.bin",500',
    "50 print peek(500);peek(501);peek(502)",
  ]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["987"]);
  assert.deepEqual(files.get("blk.bin"), [9, 8, 7]);
});

test("accessoires : ACCLOAD/ACCNEW/ACCNB acceptés", async () => {
  assert.deepEqual(await runOut([
    '10 accload "x.acc"',
    "20 accnew",
    "30 print accnb",
  ]), ["0"]);
});

// ---------------------------------------------------------------------------
//  Fenêtres texte (FENETRE.S)
// ---------------------------------------------------------------------------

test("fenêtres : WINDOPEN, bordure et coordonnées relatives", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 windopen 1,10,5,10,5,1",
    '20 locate 0,0:print "A"',
    '30 locate 1,1:print "B"',
  ]);
  await stas.run();
  assert.equal(stas.buffer.get(10, 5).ch, "┌");
  assert.equal(stas.buffer.get(19, 5).ch, "┐");
  assert.equal(stas.buffer.get(10, 9).ch, "└");
  assert.equal(stas.buffer.get(19, 9).ch, "┘");
  assert.equal(stas.buffer.get(11, 5).ch, "─");
  assert.equal(stas.buffer.get(11, 6).ch, "A"); // zone texte relative
  assert.equal(stas.buffer.get(12, 7).ch, "B");
});

test("fenêtres : WINDON suit la fenêtre active", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 windopen 2,0,0,20,10,1",
    "20 print windon",
    "30 windopen 3,30,0,20,10,1",
    "40 print windon",
  ]);
  await stas.run();
  assert.equal(stas.buffer.get(1, 1).ch, "2");
  assert.equal(stas.buffer.get(31, 1).ch, "3");
  assert.deepEqual([...stas.io.windows.byNum.keys()], [2, 3]);
});

test("fenêtres : WINDEL détruit la fenêtre", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 windopen 2,0,0,20,10,1", "20 windel 2"]);
  await stas.run();
  assert.equal(stas.io.windows.byNum.size, 0);
});

test("fenêtres : CLW efface la zone texte, garde la bordure", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 windopen 1,5,5,12,6,1",
    '20 print "HELLO"',
    "30 clw",
  ]);
  await stas.run();
  assert.equal(stas.buffer.get(6, 6).ch, " ");
  assert.equal(stas.buffer.get(5, 5).ch, "┌");
});

test("fenêtres : TITLE centré sur la bordure haute", async () => {
  const stas = new Stas({});
  stas.loadSource(['10 windopen 1,0,0,11,5,1', '20 title "HI"']);
  await stas.run();
  assert.equal(stas.buffer.get(4, 0).ch, "H");
  assert.equal(stas.buffer.get(5, 0).ch, "I");
});

test("fenêtres : borders=st stocke les codes réels, affiche l'Unicode", async () => {
  const stas = new Stas({ borderMode: "st" });
  stas.loadSource(["10 windopen 1,0,0,10,5,1"]);
  await stas.run();
  assert.equal(stas.buffer.get(0, 0).ch, String.fromCharCode(192));
  assert.equal(stas.buffer.get(9, 4).ch, String.fromCharCode(199));
  assert.ok(stas.buffer.toText().startsWith("┌"));
});

test("fenêtres : erreurs 69 / 70 / 71 / 76", async () => {
  await expectError(
    ["10 windopen 1,0,0,10,5,1", "20 windopen 1,0,0,10,5,1"], ERR.WIND_OPEN);
  await expectError(["10 windel 3"], ERR.WIND_NOT_OPEN);
  await expectError(["10 windopen 0,0,0,10,5,1"], ERR.SYS_WIND);
  await expectError(["10 windopen 1,0,0,1,1,1"], ERR.WIND_SMALL);
});

// ---------------------------------------------------------------------------
//  §3.4 — attributs texte & conversions
// ---------------------------------------------------------------------------

test("INVERSE : échange encre et papier des nouveaux caractères", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 paper 0:pen 7", "20 inverse on", '30 print "A"']);
  await stas.run();
  const c = stas.buffer.get(0, 0);
  assert.equal(c.ch, "A");
  assert.equal(c.fg, 0);
  assert.equal(c.bg, 7);
});

test("UNDER : marque les cellules soulignées", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 under on", '20 print "A"']);
  await stas.run();
  assert.equal(stas.buffer.get(0, 0).ul, true);
});

test("WRITING : 1 remplacement, 2 OR, 3 XOR", async () => {
  const stas = new Stas({});
  stas.loadSource([
    '10 print "AB"',
    '20 locate 0,0:writing 2:print " "',   // OR : l'espace n'efface pas
    '30 locate 0,0:writing 3:print "Z"',   // XOR : 'A' -> espace
  ]);
  await stas.run();
  assert.equal(stas.buffer.get(0, 0).ch, " ");
  assert.equal(stas.buffer.get(1, 0).ch, "B");
});

test("SCRN : lit un caractère (relatif à la fenêtre)", async () => {
  assert.deepEqual(await runOut(['10 print "HELLO"', "20 print scrn(1,0)"]), ["HELLO", "E"]);
});

test("XTEXT / XGRAPHIC : conversions texte <-> graphique", async () => {
  assert.deepEqual(await runOut([
    "10 print xgraphic(10)",
    "20 print xtext(40)",
  ]), ["40", "10"]);
});

test("SQUARE : rectangle au curseur", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 locate 2,1", "20 square 5,3,0,0"]);
  await stas.run();
  assert.equal(stas.buffer.get(2, 1).ch, "┌");
  assert.equal(stas.buffer.get(6, 1).ch, "┐");
  assert.equal(stas.buffer.get(2, 3).ch, "└");
  assert.equal(stas.buffer.get(6, 3).ch, "┘");
});

test("SCROLL UP : remonte le contenu", async () => {
  const stas = new Stas({});
  stas.loadSource(['10 print "A"', '20 print "B"', "30 scroll up"]);
  await stas.run();
  assert.equal(stas.buffer.get(0, 0).ch, "B");
});

test("CURS OFF : masque le curseur", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 curs off"]);
  await stas.run();
  assert.equal(stas.buffer.cursorVisible, false);
});

// ---------------------------------------------------------------------------
//  §3.6 — graphisme V2
// ---------------------------------------------------------------------------

test("POINT : couleur d'un pixel", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 paper 0", "20 mode 0", "30 plot 10,10,5",
    "40 print point(10,10)", "50 print point(0,0)",
  ]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["5", "0"]);
});

test("CLIP : limite le tracé", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 paper 0", "20 mode 0", "30 clip 0,0 to 9,9",
    "40 plot 5,5,3", "50 plot 20,20,3",
  ]);
  await stas.run();
  assert.equal(stas.io.logic.get(5, 5), 3);
  assert.equal(stas.io.logic.get(20, 20), 0);
});

test("SET LINE : épaisseur", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 paper 0", "20 mode 0", "30 ink 1",
    "40 set line $ffff,3,0,0", "50 line 10,10 to 10,20",
  ]);
  await stas.run();
  assert.equal(stas.io.logic.get(10, 15), 1);
  assert.equal(stas.io.logic.get(11, 15), 1);
  assert.equal(stas.io.logic.get(9, 15), 1);
});

test("POLYLINE / POLYGON / POLYMARK", async () => {
  const stas = new Stas({});
  stas.loadSource([
    "10 paper 0", "20 mode 0", "30 ink 2",
    "40 polyline 0,0 to 10,0 to 10,10",
    "50 polygon 20,0 to 30,0 to 30,10",
    "60 set mark 1,0",
    "70 polymark 40,5;45,5",
  ]);
  await stas.run();
  assert.equal(stas.io.logic.get(5, 0), 2);
  assert.equal(stas.io.logic.get(10, 5), 2);
  assert.equal(stas.io.logic.get(25, 5), 2);
  assert.equal(stas.io.logic.get(40, 5), 2);
});

test("DIVX / DIVY selon MODE", async () => {
  assert.deepEqual(await runOut(["10 mode 0", "20 print divx;divy"]), ["22"]);
  assert.deepEqual(await runOut(["10 mode 1", "20 print divx;divy"]), ["12"]);
  assert.deepEqual(await runOut(["10 mode 2", "20 print divx;divy"]), ["11"]);
});

test("ARC : angles 0..3600, hors bornes = erreur 13", async () => {
  await expectError(["10 mode 0", "20 arc 100,100,50,0,3700"], ERR.FON_CALL);
  const stas = new Stas({});
  stas.loadSource(["10 paper 0", "20 mode 0", "30 ink 1", "40 arc 100,100,50,0,1800"]);
  await stas.run();
  assert.equal(stas.io.logic.get(150, 100), 1);
  assert.equal(stas.io.logic.get(100, 50), 1);
});

// ---------------------------------------------------------------------------
//  Palette ($RGB 9 bits : COLOUR / PALETTE / COLOUR())
// ---------------------------------------------------------------------------

test("palette : défaut = 16 couleurs GEM (0=blanc, 15=noir)", () => {
  const stas = new Stas({});
  assert.equal(stas.palette.length, 16);
  assert.deepEqual(stas.palette[0], [255, 255, 255]);
  assert.deepEqual(stas.palette[15], [0, 0, 0]);
  assert.equal(stas.io.paletteST[1], 0x700); // rouge
  assert.equal(stas.io.paletteST[2], 0x070); // vert
});

test("COLOUR : l'instruction règle l'entrée, la fonction la relit", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 colour 5,$770", "20 print colour(5)"]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["1904"]); // $770 = 1904
  assert.equal(stas.io.paletteST[5], 0x770);
  assert.deepEqual(stas.palette[5], [255, 255, 0]); // jaune
});

test("COLOUR : mot brut 16 bits, mais la fonction masque $777", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 colour 5,$fff", "20 print colour(5)"]);
  await stas.run();
  assert.deepEqual(out(stas.buffer.toText()), ["1911"]); // $777
  assert.equal(stas.io.paletteST[5], 0xfff); // mot brut conservé (BASIC.S `color`)
});

test("COLOUR : index/valeur hors bornes = erreur 13", async () => {
  await expectError(["10 colour 16,$700"], ERR.FON_CALL);
  await expectError(["10 colour -1,$700"], ERR.FON_CALL);
  await expectError(["10 colour 0,$10000"], ERR.FON_CALL);
  await expectError(["10 print colour(16)"], ERR.FON_CALL);
});

test("PALETTE : règle la liste, une entrée vide reste inchangée", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 palette ,$700,$070"]);
  await stas.run();
  assert.equal(stas.io.paletteST[0], 0x777); // blanc GEM sauté
  assert.equal(stas.io.paletteST[1], 0x700);
  assert.equal(stas.io.paletteST[2], 0x070);
});

test("PALETTE : entrée vide au milieu (comme la boucle `s` de BASIC.S)", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 palette $000,$000,,$700"]);
  await stas.run();
  assert.equal(stas.io.paletteST[0], 0x000);
  assert.equal(stas.io.paletteST[1], 0x000);
  assert.equal(stas.io.paletteST[2], 0x070); // vert GEM, sauté
  assert.equal(stas.io.paletteST[3], 0x700);
});

test("PALETTE : 16 entrées en lowres puis arrêt", async () => {
  const stas = new Stas({});
  stas.loadSource(["10 palette 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"]);
  await stas.run();
  assert.ok(stas.io.paletteST.every((w) => w === 0));
});

test("PALETTE : valeur hors $777 = erreur 13", async () => {
  await expectError(["10 palette $1000"], ERR.FON_CALL);
});

test("palette : conversion 9 bits <-> RGB réversible", () => {
  for (let r = 0; r < 8; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 8; b++) {
        const w = (r << 8) | (g << 4) | b;
        assert.equal(rgbToStPalette(stPaletteToRgb(w)), w, `w=$${w.toString(16)}`);
      }
    }
  }
});
