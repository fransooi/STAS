# STAS — Guide de structure (handoff)

> Document destiné à **une nouvelle session** : tout ce qu'il faut pour reprendre
> le développement sans contexte préalable. Écrit en français (comme les
> commentaires du code). Voir aussi `IMPLEMENTATION-STATUS.md` (état détaillé
> face à la carte de référence STOS) et `README.md` / `README.en.md`.

---

## 1. Le projet en une page

**STOS BASIC** (François Lionet, Maison-Alfort 1988, Atari ST) réécrit en
JavaScript pur, **zéro dépendance**, avec **deux cibles jumelles** :

- **console** — terminal ANSI 24 bits ;
- **browser** — canvas HTML, intégrable en `<iframe>` (AWI / AOZ Studio).

Le cœur ne sait **jamais** où il s'affiche : toute sortie texte passe par
`AsciiBuffer` (le remplaçant du TRAP #3 → `FENETRE.S` → VDI), toute entrée passe
par des *providers* injectés. Le vocabulaire STOS est **tokenisé fidèlement**
(table copiée de `BASIC.S` L525-L694) ; les handlers d'instructions
réimplémentent les traps.

---

## 2. Sources de vérité — à lire AVANT de coder

Ne jamais deviner une sémantique : tout est dans les sources originales.

| Chemin | Contenu |
| --- | --- |
| `C:\STOS\STOSBasic\*.S` | **Code source 68000 original** (1987-1989) |
| `C:\STOS\STOSBasic\BASIC.S` | Tokenizer, tables (`ttrappe`, tokens), interpréteur, handlers de tokens |
| `C:\STOS\STOSBasic\FENETRE.S` | Le trap fenêtres (#3) : `initwind`, `afftour`, `tbords`, structures, chargement des jeux `*.CRx` |
| `C:\STOS\STOSBasic\SPRITES.S`, `SPRITLIB.S` | Sprites, animation, collisions |
| `C:\STOS\STOSBasic\MUSIC.S`, `MUSICGB.S` | Musique / PSG |
| `C:\STOS\STOSBasic\FLOAT.S`, `DFLOAT.S` | Soft-float 68000 (conversion float→ascii !) |
| `C:\STOS\STOSBasic\MOUSE.S`, `STOSRAM.S`, `STOS_DAT.S`, `RUN.S`… | Le reste |
| `C:\STOS\STOS_User_Guide.txt` | Manuel utilisateur (meilleure OCR) |
| `C:\STOS\19555469-STOS-Manual.txt` | Manuel + **carte de référence complète** (lignes **15560-16061**) |
| `C:\STOS\Atari_ST_-_Hardware_Specification.txt` | Hardware : mémoire vidéo (plans entrelacés §3.1), palette 9 bits, modes |
| `C:\STOS\STOSHDD\STOS\8X8.CR0 / 8X8.CR1 / 8X16.CR2` | **Polices réelles** des fenêtres (binaire) |

### Méthode qui marche
1. `grep` le label dans `BASIC.S` (ex. `^windopen:`, `^using1:`, `^polygone:`).
2. Lire le handler → noter l'ordre des paramètres et les bornes d'erreur.
3. Si c'est un trap VDI, déduire l'algorithme (arc, remplissage…) côté STAS.
4. Écrire le test AVANT/AUTOURL de l'implémentation.

---

## 3. Format des jeux de caractères `*.CRx` (décodé)

```
offset 0 : 4 octets de « code »     (FENETRE.S fait addq.l #4,a6 pour le sauter)
offset 4 : chrxsize  (word BE)      octets par ligne de glyphe
offset 6 : chrysize  (word BE)      nombre de lignes
offset 8 : glyphes, chrysize*chrxsize octets chacun, MSB = pixel gauche
```

`8X8.CR0` : en-tête `06 07 19 63`, `chrxsize=1`, `chrysize=8` → glyphe `c` à
`8 + c*8`. Les codes **192-253** sont les **cadres de fenêtre** ; `tbords`
(FENETRE.S) donne 15 bordures de 8 glyphes dans l'ordre :
**coin HG, bord haut, coin HD, bord gauche, bord droit, coin BG, bord bas,
coin BD**. La traduction code → Unicode est déjà dans `windows.js`.

---

## 4. Arborescence du dépôt

```
STAS/
  package.json              scripts npm (serve, test)
  install.bat / install.sh  installe la commande `stas`
  STAS.bat                  lanceur Windows (console / --web / serve / test)
  stas.ini.example          modèle de config INI
  docs.html                 documentation servie par le serveur web
  README.md (FR) / README.en.md (EN)
  IMPLEMENTATION-STATUS.md  état vs la carte de référence (210/131…)
  ARCHITECTURE.md           CE document
  HAXE/                     vide — prévu pour le portage/bridge Haxe
  examples/                 hello, sinus, sinus-anim, sinus-gfx, devine,
                            carres, demo-gfx, star-link-demo
  test/                     node:test (zéro dépendance)

  packages/
    stas-core/              LE CŒUR (agnostique)
      index.js              exports publics (@stas/core)
      src/
        tokens.js           T, SUB, FSUB + KEYWORDS (copie BASIC.S) + tables inverses
        tokenizer.js        source → tokens
        program.js          lignes numérotées + detokenize (LIST)
        values.js           INT/FLOAT/STR ; fmtNum, fmtValue, fmtFixed (FIX)
        errors.js           les 88 messages bilingues (merreur)
        instructions.js     INSTRUCTIONS / EXT_INSTRUCTIONS / FUNC_TABLE /
                            EXTFUNC_TABLE + tous les handlers
        interpreter.js      boucle, structures, évaluateur Pratt, INPUT$,
                            ON ERROR/RESUME, VARPTR + arène variables
        ascii-buffer.js     AsciiBuffer = le nouveau TRAP #3 (cellules,
                            vue/fenêtre, curseur, scroll, attributs texte)
        memory.js           adressage 32 bits (banques/écrans/RAM), Memory
        windows.js          FENETRE.S : BORDERS_ST, STOS_GLYPH, WindowManager
        pixel-screen.js     écran 320x200 (colors + touched)
        ascii-converter.js  pixels → caractères (quadrants)
        config.js           parseIni, parseRes
        stas.js             façade Stas (io, feedLine/run/execDirect/reset)
    stas-console/           cible terminal
      bin/stas.js           point d'entrée
      src/main.js           args + INI [console] + branchement io
      src/input.js          clavier brut (readLine, inkey, inputChars)
      src/ansi-renderer.js  rendu ANSI 24 bits
      src/intro-once.js     bannière une fois par boot
    stas-web/               cible navigateur
      index.html            page hôte (canvas + stdin)
      serve.js              serveur statique (racine STAS)
      bin/launch.js         construit l'URL + ouvre le navigateur (launchUrl)
      src/main.js           paramètres URL + INI [web] + renderers
      src/input.js          clavier DOM + injection postMessage
      src/canvas-renderer.js / pixel-renderer.js / aalib-renderer.js
      src/postmessage-api.js API iframe (voir README §iframe)
      vendor/               aalib.js éventuel
    stas-world/             « l'autre côté » : pont AWI (itération 2)
      src/protocol.js       protocole WorldSTAS (messages)
      src/world.js          mondes, navigation
      src/shell.js          shell hôte (!commande)
      src/storage.js        LocalStasConnector (mockup du ConnectorStas AWI)
      bin/stas-world.js     entrée console
    stas-sprites/           éditeur de sprites ASCII (SPRITE.ASC)
      src/{sprite,tools,history,bank,charset,fonts,save}.js
      bin/stas-sprites.js   CLI
      web/                  éditeur canvas
```

---

## 5. Le cœur — pipeline et responsabilités

```
source.bas → tokenizer → Program → Interpreter → AsciiBuffer → renderer
                                          ↓
                                   instructions.js (handlers)
                                   memory.js / windows.js / pixel-screen.js
```

- **tokens.js** — `T` (codes $80-$FF), `SUB` (sous-codes du préfixe $A0),
  `FSUB` (préfixe $B8), `KEYWORDS` (texte → code). ⚠️ `T` et `FSUB` sont deux
  **espaces de noms distincts** mais des **entiers** : un même nombre peut
  exister dans les deux (voir §13).
- **interpreter.js** — `runProgram`/`runDirect`/`execLine`/`execStatement`.
  Les structures sont dispatchées dans le `switch` ; tout le reste va dans les
  tables de `instructions.js`.
- **instructions.js** — quatre tables :
  - `INSTRUCTIONS` : clés = codes `T` (instructions de base $80-$B7, + `MODE`) ;
  - `EXT_INSTRUCTIONS` : clés = `SUB` (préfixe $A0) ;
  - `FUNC_TABLE` : clés = codes `T` de fonctions ($B9-$E9) ;
  - `EXTFUNC_TABLE` : clés = `FSUB` (préfixe $B8).
- **ascii-buffer.js** — `cells[i] = {ch, fg, bg, ul}` ; `view` (fenêtre active),
  `curInverse`, `curUnder`, `curShade`, `curWriting`, `translate` (borders=st).
- **memory.js** — adressage 32 bits : bit31=0, bit30=LOGIC, bit29=PHYSIC,
  bits28-25=banque(1-15), bits24-0=offset ; banque 0 sans drapeau = RAM plate
  1 Mo. Écran `compatible` (plans ST entrelacés) ou `native` (1 octet/pixel).
- **windows.js** — `WindowManager` : `WINDOPEN/WINDOW/QWINDOW/WINDMOV/WINDEL/
  WINDON/TITLE/BORDER/CLW/SCROLL` ; `textRect()` = zone intérieure à la bordure.

---

## 6. Les deux cibles (console & web)

### Contrat `io` (tous les *providers* injectés par l'adaptateur)
```
buffer       AsciiBuffer              (obligatoire)
readLine     async (echo) => string   INPUT / mode direct
inputChars   async (n) => string      INPUT$(n) sans écho
inkey        () => string             INKEY$
now          () => ms                 TIMER, TIME$/DATE$
rnd          () => [0,1)
sleep        async (ms)               WAIT
tick         async (it)               respiration / rendu
scancode     () => number
onSystem     () => void               SYSTEM
flush        () => void
sendCommand  async (cmd, params) => Answer     connecteur AWI (SAVE/LOAD/…)
userName     string
memMode      "compatible" | "native"  (défaut compatible)
borderMode   "unicode" | "st"         (défaut unicode)
windows      WindowManager
mem          Memory
banks        Map<n, {kind,size,data}>
logic/physic PixelScreen | null ; gfxActive ; autoback ; ink
mode/clip/lineStyle/mark/paint/pattern        (graphisme V2)
sprites / spriteVersion
```

### Console
`bin/stas.js` → `main(argv)` : `parseArgv` (fichier, `run`, `--edit`, `--web`,
`--renderer`, `--mem`, `--borders`, `--config`, `--user`) ; INI section
`[console]` (`screen`, `resize`, `user`, `mem`, `borders`) ; branche
`ConsoleInput` + `AnsiRenderer`.

### Web
`index.html` → `src/main.js` : paramètres **URL prioritaires** sur l'INI
`[web]` (`run`, `renderer`, `res`/`text`/`gfx`, `mem`, `borders`, `config`) ;
renderers `canvas` (défaut), `pixel`/`atari`, `aalib` ; `WebInput` ;
`postmessage-api.js` pour l'iframe (protocole dans le README).

---

## 7. Le « jeu de traps » STOS → STAS

| STOS (1988) | STAS |
| --- | --- |
| TRAP #3 → FENETRE.S → VDI → écran | `AsciiBuffer` + `windows.js` → renderer |
| TRAP #13 BIOS → Bconin | `io.readLine` / `io.inkey` / `io.inputChars` |
| Tokens BASIC.S L525-L694 | `tokens.js` |
| Table `merreur` | `errors.js` (88 messages) |
| Soft-float FLOAT.S/DFLOAT.S | `values.js` (JS numbers, big-endian IEEE pour VARPTR) |
| Banques mémoire | `memory.js` + `START`/`LENGTH` |
| Jeux `*.CRx` | `windows.js` (`BORDERS_ST` → Unicode) |

---

## 8. Réglages (CLI / URL / INI)

| Réglage | Console | Web | INI |
| --- | --- | --- | --- |
| mémoire écran | `--mem=compatible\|native` | `?mem=` | `[console]` / `[web] mem` |
| bordures fenêtres | `--borders=unicode\|st` | `?borders=` | `[console]` / `[web] borders` |
| renderer | — | `?renderer=canvas\|pixel\|atari\|aalib` | `[web] renderer` |
| résolution | `[console] screen=WxH`, `resize=fixed\|follow` | `?res=/?text=/?gfx=` | `[web] res/text/gfx` |
| fichier au démarrage | argument, `run` | `?run=` | `[web] run` |
| config | `--config=f.ini` | `?config=f.ini` | — |
| utilisateur | `--user=` | `?user=` | `[console] user` |

---

## 9. Décisions sémantiques (déjà tranchées)

- `TRUE`=1 ; `^` associatif **à gauche** (`2^3^2=64`) ; `AND/OR/XOR` bit à bit ;
  `NOT` booléen ; `7/2→3.5` mais `8/2→4`.
- Variables **sensibles à la casse**, mots-clés non.
- `LEN(a$)` = longueur de **chaîne** ; `LENGTH(b)` = longueur de **banque**.
- `DEG`/`RAD` : instruction seule = bascule le mode ; `DEG(x)`/`RAD(x)` = conversion.
- `INPUT$(n)` : résolu **par instruction** avant l'évaluateur synchrone → marche
  dans toute expression ; une branche `IF` non prise n'est **jamais** lue.
- Fenêtres : coordonnées texte **relatives à la fenêtre active** ; bordure = zone
  intérieure.
- `USING` : port fidèle de `ssprint`/`using1`/`using50` ; `~` = 1 caractère,
  chiffres `#` de droite à gauche, `;` écrit un espace, `^` copie/fabrique
  `E+000` ; **une seule expression formatée par USING**.
- Angles des arcs : **dixièmes de degré** (0-3600).
- `SET LINE` : paramètres source = `style,width,begin,end`.
- Réglages non pertinents → avertissement console, jamais d'erreur.

---

## 10. Tests

```sh
node --test test/            # tout
node --test test/core.test.mjs
npm test
```

Aides dans `test/core.test.mjs` : `run(src, opts)` → texte du buffer ;
`out(text)` → lignes non vides ; `runOut` ; `expectError(src, code)`.
Adresses/parité : les tests utilisent des `Stas` indépendants par test.

**Pièges** : le test « fonctions non implémentées » doit choisir un token
réellement absent (sinon il passe au vert puis casse quand on implémente le
token). Vérifier `git status` : ne jamais commiter `examples/star-link-demo.txt`
(doublon de `star-link-demo.bas`).

---

## 11. Commandes utiles

```sh
install.bat                    # installe la commande `stas`
stas                           # console interactive
stas examples:hello.bas        # exécute une démo
stas --web                     # serveur + navigateur
stas test
node packages/stas-core/...    # le cœur s'importe directement (ESM relatif)
```

---

## 12. État actuel & suite

Voir `IMPLEMENTATION-STATUS.md` pour le détail chiffré (dernier connu :
**210 implémentés / 131 restants**). Fait : langage (maths/chaînes/système),
erreurs (`ON ERROR`/`RESUME`/`ERRN`/`ERRL`), mémoire (banques, `PEEK`/`POKE`,
`VARPTR`, plans ST), fenêtres texte, attributs texte, graphisme V2 (primitives).

**Reste, par ordre suggéré :**
1. **Couleurs/palette** — `COLOUR`, `PALETTE`, `GET PALETTE`, `FADE`, `SHIFT`
   (vérifier le format 9 bits et les modes dans le Hardware Spec).
2. **Effets écran** — `APPEAR`, `ZOOM`, `REDUCE`, `PACK`, `UNPACK`, copie de zone.
3. **Sprites** — brancher `stas-sprites` au runtime (`SPRITE`, `MOVE`, `ANIM`, …).
4. **Musique** — `MUSIC`, `VOICE`, `VOLUME`, `TEMPO`, `ENVEL`, `PLAY` audible.
5. **Menus**, **souris/joystick**, **fichiers/dossiers**, **éditeur**
   (`AUTO`, `RENUM`, `SEARCH`, `CHANGE`, …), **imprimante**.
6. **Permanent error 20** : `BGRAB`, `CALL`, `TRAP`, `AREG`, `DREG`, `PSG`.

**Approximations assumées à documenter/polir :** `WRITING 2|3` (OR/XOR sur la
cellule), `SHADE` (flag sans rendu), `SET PATTERN` (mémorisé, non rendu),
`VARPTR` sur tableaux (non supporté), chaîne de valeur des floats dans `USING`
(pas `DFLOAT.S`), bordure `st` traduite à l'affichage (renderers à étendre si
besoin).

---

## 13. Pièges connus (leçons apprises) ⚠️

1. **Collisions de clés `T` / `FSUB`** : `FUNC_TABLE` est indexée par **nombre**.
   `T.SCRN` = `0xBA` = `FSUB.DIVX` : mettre `DIVX` dans `FUNC_TABLE` **écrase
   `SCRN`**. Chaque token va dans **sa** table (`T.*` → `FUNC_TABLE`/`INSTRUCTIONS`,
   `FSUB.*` → `EXTFUNC_TABLE`, `SUB.*` → `EXT_INSTRUCTIONS`).
2. **Instructions `ON|OFF`** : consommer **ON ET OFF** (sinon `ON` reste dans le
   flux et se fait exécuter comme `ON n GOTO` → « Syntax error » absurde).
3. **`USING`** : en `us15`, l'assembleur **restaure `a1`** (fin de partie
   entière) ; sans ça, `"###.##";3.14159` donne `3.00`.
4. **Fichiers `.CRx`** : l'en-tête fait 8 octets (`4 code + chrxsize + chrysize`),
   pas 4.
5. Ne pas sur-lire un fichier binaire dans le terminal (sortie énorme) : borner
   le dump.
6. `MODE` redimensionne le buffer texte **sauf** si `lockTextRes` (`?text=`/`?res=`).

---

## 14. « L'autre côté » : AWI / stas-world

- **stas-world** est le pont console vers AWI (itération 2) : `protocol.js`
  (WorldSTAS), `world.js` (mondes/navigation), `shell.js` (shell hôte),
  `storage.js` (**`LocalStasConnector`** = mockup local du futur `ConnectorStas`
  AWI : comptes, sécurité, stockage Volt.A).
- **Contrat de messages** (calqué sur `awi.connectors.editor`) :
  `sendCommand("stas:save"|"stas:load"|"stas:bsave"|"stas:bload", params)` →
  `Answer { success, error, data, message, info }`, `data.stosCode` = numéro
  d'erreur STOS. Le BASIC ne voit aucune différence.
- **Web/iframe** : `packages/stas-web/src/postmessage-api.js` +
  README §iframe (`target:"stas"` entrant, `source:"stas"` sortant).
- **HAXE** : `STAS/HAXE/` est vide (destiné au portage/bridge Haxe) ; le runtime
  AWI Haxe/HL vit dans `C:\development\awi-runtime`.
