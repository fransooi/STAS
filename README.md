# STAS — STOS ASCII System

Le **STOS BASIC** de François Lionet (Maison-Alfort, 1988, Atari ST) renaît en pur ASCII.
Même langue, mêmes instructions, mêmes erreurs bilingues — mais tout l'affichage passe par
un **buffer de cellules de caractères** au lieu des traps VDI du STOS. Deux cibles jumelles :

- **console** — terminal ANSI truecolor (Windows Terminal, iTerm, xterm...)
- **navigateur** — canvas HTML en police VT323, intégrable en **iframe**
  (pensé pour AWI-HAXE / AOZ Studio)

Le cœur est du JavaScript pur, zéro dépendance, 100 % indépendant de la plateforme : il ne sait
jamais où il s'affiche.

```basic
10 print "Salut, le monde !"
20 for i=1 to 5
30 print "tour ";i
40 next i
run
```

---

## Table des matières

- [Démarrage rapide](#démarrage-rapide)
- [La commande stas](#la-commande-stas)
- [Architecture](#architecture)
- [Langue V1](#langue-v1)
- [Les renderers](#les-renderers)
- [Résolutions texte et graphique](#résolutions-texte-et-graphique)
- [Sortie console](#sortie-console)
- [Fonctionnement dans le navigateur](#fonctionnement-dans-le-navigateur)
- [Configuration INI](#configuration-ini)
- [Intégration iframe](#intégration-iframe)
- [Exemples d'URL](#exemples-durl)
- [Licence](#licence)

> English version: [README.en.md](README.en.md)

---

## Démarrage rapide

Après le clone, lance l'installateur : il vérifie Node.js (≥ 18, aborte sinon),
installe la commande `stas` (PATH sous Windows, wrapper sous macOS/Linux)
et valide par la suite de tests.

```sh
# Windows (PowerShell, cmd ou double-clic)
install.bat

# macOS / Linux
./install.sh
```

Puis, depuis n'importe quel dossier, dans un **nouveau** terminal :

```sh
stas                        # console interactive STAS>
stas examples:hello.bas     # exécuter une démo
stas --web                  # serveur + navigateur
stas help                   # l'aide complète
```

La première invocation de `stas` après le démarrage de la machine affiche
la bannière d'accueil (signature François Lionet) ; les suivantes passent
directement à l'invite `STAS>` — comme le STOS qui ne se présentait qu'une
fois.

Aucune installation `npm` n'est nécessaire : tout est en ESM natif, les
imports relatifs fonctionnent directement. Sans l'installateur, les
commandes restent accessibles directement :

```sh
# Console interactive
node packages/stas-console/bin/stas.js

# Exécuter un programme
node packages/stas-console/bin/stas.js examples/sinus.bas

# Version web
node packages/stas-web/serve.js        # → http://localhost:8080/packages/stas-web/

# tests (node:test, zéro dépendance)
npm test
```

Node ≥ 18 requis.

---

## La commande stas

| Commande | Effet |
| --- | --- |
| `stas` | console interactive `STAS>` |
| `stas fichier.bas` | exécute le programme en console |
| `stas examples:nom.bas` | exécute une démo du dossier `examples/` |
| `stas run fichier.bas` | idem, verbe explicite |
| `stas --edit fichier.bas` | édition : NEW + LOAD + LIST 0-100 |
| `stas fichier.bas --edit` | idem, `--edit` après le fichier |
| `stas --web` | serveur web + navigateur ouvert automatiquement |
| `stas --web --edit f.bas` | édition dans le navigateur |
| `stas serve` | serveur web sans navigateur |
| `stas test` | suite de tests |
| `stas help` | aide |

Ctrl-C pendant un RUN = Break (erreur 17), avec le numéro de ligne, comme
le STOP du STOS. L'installation (PATH ou wrapper) est idempotente et
nettoie les installations précédentes (dossier déplacé ou copié).

---

## Architecture — le nouveau jeu de traps

Le STOS original empilait ses traps maison (`FENETRE.S`, `SPRITES.S`, `FLOAT.S`, `MUSIC.S`)
au-dessus des traps du système (GEMDOS, VDI, BIOS, XBIOS). STAS remplace toute la pile par
deux injections :

```
source.bas → tokenizer → stas-core → AsciiBuffer → stas-web ou stas-console → renderer
```

| STOS (1988)                        | STAS                                    |
| ---------------------------------- | --------------------------------------- |
| TRAP #3 → FENETRE.S → VDI → écran  | `AsciiBuffer` → renderer ANSI / canvas  |
| TRAP #13 BIOS → Bconin (clavier)   | provider `readLine` / `inkey` injecté   |
| zone texte tokenisée en mémoire    | `Program` — lignes triées, tokens JS    |
| table `merreur` bilingue EN/FR     | `errors.js` — les 88 messages d'origine   |
| tables de tokens BASIC.S L525-694  | `tokens.js` — copie fidèle, codes $80-$FF |

Le monorepo :

```
packages/
  stas-core/        le cœur, plateforme-agnostique
    src/errors.js        88 erreurs bilingues (table merreur)
    src/tokens.js        table des tokens (BASIC.S L525-L694)
    src/tokenizer.js     mise en tokens d'une ligne
    src/ascii-buffer.js  LE nouveau TRAP #3
    src/program.js       lignes numérotées + détokenisation LIST
    src/values.js        valeurs {entier, réel, chaîne}
    src/interpreter.js   boucle d'exécution + évaluateur Pratt
    src/instructions.js  tables d'instructions et de fonctions
    src/intro.js         bannière d'accueil (une fois par boot)
    src/stas.js          façade (feedLine / run / execDirect)
  stas-web/         index.html + canvas + clavier + postMessage + serve.js
  stas-console/     bin/stas.js + renderer ANSI + clavier brut
                    + intro-once.js (bannière une fois par boot)
  stas-world/       pont AWI (itération 2) — shell hôte, Legal-Fractal,
                    navigation entre mondes, protocole WorldSTAS,
                    stockage (mockup du connecteur AWI)
examples/           hello, sinus, sinus-anim, sinus-gfx, devine, carres,
                    demo-gfx, star-link-demo
test/               node --test
```

---

## Langue V1

**Structures** : `GOTO`, `GOSUB`/`RETURN`/`POP`, `FOR`/`TO`/`STEP`/`NEXT`,
`WHILE`/`WEND`, `REPEAT`/`UNTIL`, `IF`/`THEN`/`ELSE` (forme une-ligne,
`IF x THEN 100` accepté), `ON n GOTO|GOSUB`, `ON ERROR GOTO`/`RESUME`/
`RESUME NEXT`, `DIM`, `DATA`/`READ`/`RESTORE [n]`, `REM` / `'`, `:` pour
enchaîner.

**Affichage** : `PRINT` / `?` (`;` sans saut de ligne, `,` taquets de 14
colonnes, `TAB(n)`), `CLS`, `LOCATE x,y` (0-based), `PEN n`, `PAPER n`, `HOME`,
`CUP`/`CDOWN`/`CLEFT`/`CRIGHT`, `INC`/`DEC`. Attributs texte : `INVERSE`,
`UNDER`, `SHADE`, `WRITING 1|2|3`, `CURS`, `SET CURS`, `SQUARE`, `SCRN(x,y)`,
et les conversions `XTEXT`/`YTEXT`/`XGRAPHIC`/`YGRAPHIC`.

**Entrées** : `INPUT ["texte";] v[,v2...]`, `LINE INPUT`, `INKEY$` (non
bloquant).

**Fonctions maths** : `ABS INT SQR SGN SIN COS TAN ATN ASIN ACOS HSIN HCOS
HTAN EXP LN LOG PI MIN MAX RND` — `LOG` = base 10 comme le STOS. `FIX n` règle
la précision d'affichage des réels (1..15 décimales, ≥16 = normale, négatif =
exponentielle).

**Fonctions chaînes** : `CHR$ ASC LEN LEFT$ RIGHT$ MID$ STR$ VAL SPACE$
STRING$ INSTR UPPER$ LOWER$ HEX$ BIN$ FLIP$`, plus `INPUT$(n)` (lit n
caractères sans écho) et le formatage `USING` (champs `~ # + - . ; ^`).

**Tableaux & système** : `MATCH` (plus proche valeur dans un tableau trié 1-D),
`SORT a(0)` (trie un tableau 1-D), `SWAP x,y` (échange deux variables),
`FREE`, `TIME$`, `DATE$`, `LANGUAGE`, `ERRN`/`ERRL` (dernière erreur),
`TIMER` (compteur 50 Hz), `TRUE`/`FALSE`.

**Commandes directes** : `RUN [n]`, `LIST` (bornes : `LIST n`, `LIST n,m`,
`LIST n-m`, `LIST n-`, `LIST -m`), `NEW`, `DEL`/`DELETE`, `SAVE`, `SAVE AS`,
`LOAD`, `CLEAR`, `WAIT n` (n × 20 ms), `END`, `STOP`, `ERROR n`,
`ENGLISH`/`FRANCAIS`.

### SAVE / LOAD — le connecteur de stockage

`SAVE` et `LOAD` ne touchent pas au disque directement : ils passent par un
connecteur (`stas:save` / `stas:load`) au format des messages AWI — réponse
`Answer { success, error, data, message }` comme `EdHttp`. La console
branche un mockup local (`LocalStasConnector` dans `stas-world`) ; plus
tard, le `ConnectorStas` d'AWI prendra la main (comptes, sécurité, stockage
Volt.A) sans que le BASIC n'y voie une différence.

- `save "fichier.bas"` — sauvegarde le programme en mémoire
- `save` seul — réutilise le fichier courant (ou demande le nom)
- `save as "fichier.bas"` — force un nouveau nom
- `load "fichier.bas"` — remplace le programme en mémoire
- le préfixe `examples:` désigne le dossier `examples/` de l'installation,
  quel que soit le répertoire courant : `load "examples:hello.bas"`
- erreur STOS 48 (« File not found ») si introuvable, 20 (« Function not
  implemented ») si aucun connecteur n'est branché

### Graphisme V1

`MODE 0/1/2` (écrans 320×200 logic + physic, `SCREEN SWAP`/`SCREEN COPY`,
`AUTOBACK`), `PLOT`, `LINE`, `DRAW` (forme numérique `x1,y1 TO x2,y2` et
forme tortue `DRAW "r10 d20"`), `BOX`, `BAR`, `RBOX`, `RBAR` (coins
arrondis), `CIRCLE`, `ELLIPSE`, `PAINT`, `INK n` (couleur de tracé gfx, le
texte garde son `PEN`), `CENTRE`, `RESERVE AS SCREEN n` + `START(n)`,
affectation `LOGIC=`/`PHYSIC=`. V2 adds `ARC`/`EARC`/`EPIE`/`PIE` (angles
en dixièmes de degré, 0–3600), `POLYGON`/`POLYLINE`/`POLYMARK`,
`POINT(x,y)`, `CLIP`, `SET LINE`/`SET MARK`/`SET PAINT`/`SET PATTERN`, and
`DIVX`/`DIVY`. `PLAY` est accepté mais silencieux ;
`FLASH`/`KEY`/`CLICK` `ON|OFF`, `HIDE`, `SHOW` sont des no-ops.

### Mémoire — banques, PEEK / POKE

`RESERVE AS SCREEN|DATASCREEN|WORK|DATA|SET n[,longueur]`, `ERASE n`,
`START(n)` (adresse de base de la banque) et `LENGTH(n)` (longueur de la
banque — attention, `LEN(a$)` est la longueur de chaîne, comme le dit la
carte de référence du STOS).

Les instructions mémoire adressent un espace 32 bits dont les bits hauts
portent des drapeaux :

| bits | sens |
| ---- | --- |
| 31 | toujours 0 (les adresses restent positives) |
| 30 | écran LOGIC |
| 29 | écran PHYSIC |
| 28..25 | numéro de banque (1–15) |
| 24..0 | décalage |

`PEEK`/`POKE` (octet), `DEEK`/`DOKE` (mot, adresse paire), `LEEK`/`LOKE`
(mot long, adresse paire), `COPY start,finish TO dest`,
`FILL start TO finish,lw`, `HUNT(start TO end,a$)`, `BCOPY src TO dst`,
`BLOAD`/`BSAVE` (blocs binaires via le connecteur de stockage).
`BCHG`/`BCLR`/`BSET`/`BTST` et `ROL`/`ROR` agissent sur des variables.
`VARPTR(variable)` donne l'adresse d'une variable dans la RAM plate (entier
sur 4 octets, réel IEEE double gros-boutiste sur 8 octets, ou chaîne dont la
longueur sur 2 octets précède le premier caractère). Une adresse sans
drapeau et de banque 0 tombe dans une RAM plate de 1 Mo.

La mémoire écran a deux représentations, choisies par `mem=compatible`
(défaut) ou `mem=native` :

- **compatible** — le format Atari ST réel : 4 plans entrelacés par mots de
  16 bits (320×200, 32000 octets, 160 octets par ligne), pour que les
  programmes de 1988 qui poken l'écran fonctionnent tels quels ;
- **native** — un octet par pixel (indice palette), 64000 octets.

Réglable par `--mem=` en console, `?mem=` ou `[web] mem=` dans le
navigateur, `[console] mem=` dans un fichier INI.

### Fenêtres texte

`WINDOPEN n,x,y,tx,ty[,bordure][,jeu]` crée une fenêtre texte (bordure 1–15,
défaut 1) ; `WINDOW n[,m…]` et `QWINDOW n` l'activent, `WINDEL n` la détruit,
`WINDMOVE x,y` la déplace, `BORDER n` redessine la bordure, `TITLE a$` centre
un titre sur la bordure haute, `CLW` efface la zone texte, `SCROLL UP|DOWN`
la fait défiler, et `WINDON` renvoie le numéro de la fenêtre active (0 = plein
écran).

Les coordonnées texte (`LOCATE`, `PRINT`, `CUP`…) sont **relatives à la zone
texte de la fenêtre active** — donc à l'intérieur de la bordure.

Les bordures viennent de la table d'origine `tbords` (`FENETRE.S`), dont les
codes 192–253 sont les glyphes de la police STOS décodés depuis `8X8.CR0`.
`borders=unicode` (défaut) les dessine en caractères Unicode ; `borders=st`
stocke les codes réels (traduits à l'affichage). Réglable par `--borders=`,
`?borders=` ou les sections INI.

### Décisions sémantiques (V1)

- `TRUE` vaut **1**, comparaisons rendent 0/1
- `DEG`/`RAD` sont à la fois instruction et fonction, comme le STOS : utilisés
  seuls ils changent le mode trigonométrique ; `DEG(x)`/`RAD(x)` convertissent
  l'angle (radians ↔ degrés)
- `^` associatif **à gauche** — `2^3^2 = 64`, bizarrerie du STOS conservée
- `AND OR XOR` = bit à bit sur 32 bits signés ; `NOT` booléen
- `7/2 → 3.5` mais `8/2 → 4` : division entière quand c'est exact
- mots-clés insensibles à la casse et listés en minuscules ; **variables
  sensibles à la casse**, noms complets, suffixe `$` = chaîne
- taper un numéro seul supprime la ligne (fidèle à l'éditeur du STOS)
- erreurs affichées « Syntax error in line 10 » / « Erreur de syntaxe en
  ligne 10 » selon `ENGLISH`/`FRANCAIS` ; au démarrage, la langue suit
  celle de la machine (français sur une machine française), comme le
  texte d'accueil signé François Lionet

### Limites connues de la V1

- `IF ... THEN ... ELSE` sur une seule ligne (pas de blocs multi-lignes)
- un `DATA` contenant un mot-clé brut (`data wend`) peut troubler le scan
  des structures — le STOS stockait les DATA en texte brut, à revoir
- pas de `DEF FN`, pas de rotation de sprites (le STOS n'en avait pas non
  plus !)
- le détokeniseur colle parfois `T mod 3` en `Tmod` au LIST (cosmétique)

Le reste du vocabulaire STOS (sprites, musique, fenêtres, banques de
données...) est **tokenisé fidèlement** mais renvoie l'erreur 20 — la table
des tokens est complète, le terrain est prêt.

---

## Les renderers

Un même programme STAS peut être affiché de plusieurs manières. Le choix du renderer se
fait par le paramètre d'URL `renderer` ou dans la section `[web]` d'un fichier INI.

| Renderer | Valeur | Description |
| -------- | ------ | ----------- |
| `CanvasRenderer` | `canvas` (défaut) | Chaque cellule de la grille texte est rendue comme un bloc de couleur ou un glyphe. Équilibré entre lisibilité du texte et aspect graphique. |
| `AalibRenderer` | `aalib` | Convertit le plan graphique 320×200 en art ASCII. Nécessite `vendor/aalib.js`. |
| `PixelRenderer` | `pixel` ou `atari` | Copie le buffer graphique 320×200 pixel par pixel dans un canvas, avec mise à l'échelle sans lissage. Aspect le plus proche de l'Atari ST. |
| Console ANSI | — | Utilisé par l'adaptateur Node.js. Buffer graphique converti en caractères de blocs et couleurs ANSI 24 bits. |

### Transparence et faux-noir

Pour résoudre les problèmes de transparence, notamment dans le renderer AALib, STAS peut
utiliser une couleur transparente. L'éditeur de sprites du STOS original proposait une
option similaire lors de l'importation.

- Le noir pur `(0,0,0)` joue le rôle de couleur transparente.
- Le noir affichable est cartographié vers `(0,0,1)`, imperceptible à l'œil humain mais distinct pour le moteur.
- Ainsi, les images avec palette conservent leurs couleurs originales et disposent d'une couleur transparente.

---

## Résolutions texte et graphique

STAS distingue deux résolutions qui peuvent être identiques ou découplées :

- **Buffer texte** : la grille de caractères sur laquelle opèrent `PRINT`, `LOCATE`, `CLS`.
- **Renderer graphique** : la grille utilisée pour convertir l'image 320×200 en caractères ou pixels.

| Paramètre | Exemple | Signification |
| ----------- | ------- | --------------- |
| `res=WxH` | `res=160x50` | Résolution commune texte et graphique. |
| `text=WxH` | `text=80x25` | Verrouille la grille du buffer texte ; `MODE` ne la redimensionne plus. |
| `gfx=WxH` | `gfx=160x50` | Définit la grille de conversion du renderer AALib, indépendamment du texte. |

Les valeurs doivent être des diviseurs de 320×200 (par exemple 80×25, 160×50). Sans
indication, la fidélité STOS est totale : `MODE` choisit la grille.

> **Compatibilité :** `gfx=` n'a de sens que pour `renderer=aalib`. Les renderers `canvas`
> et `pixel` suivent la résolution texte ou la résolution native 320×200. Une combinaison
> invalide est ignorée avec un avertissement dans la console du navigateur.

---

## Sortie console

La sortie console ne peut pas afficher de graphique bitmap, mais elle travaille en ascii-art.
Le buffer graphique 320×200 est converti en caractères de blocs quadrants et colorisé avec
des séquences ANSI 24 bits. Cette approche permet de gérer des animations dans un terminal
moderne, comme la démo du sinus animé.

```sh
node packages/stas-console/bin/stas.js examples/sinus-anim.bas
```

Par défaut, la zone de render console n'est pas retaillée automatiquement lorsque la fenêtre
du terminal change de taille. Ce comportement peut être rendu optionnel via un paramètre de
configuration, afin de préserver la cohérence visuelle des programmes.

---

## Fonctionnement dans le navigateur

Le serveur de développement inclus dans le package `stas-web` sert l'ensemble du dossier
`STAS/` comme racine et redirige `/` vers `/packages/stas-web/`. Les chemins ne reprennent
pas le segment `/STAS/` dans l'URL.

```sh
# Depuis la racine STOS/
npm run serve
# ou directement
node STAS/packages/stas-web/serve.js
```

Le serveur écoute par défaut sur `http://localhost:8080`.

### Paramètres d'URL

| Paramètre | Valeurs / exemple | Description |
| --------- | ----------------- | ----------- |
| `run` | `examples/sinus-anim.bas` | Chemin du programme à charger et exécuter au démarrage. |
| `renderer` | `canvas`, `aalib`, `pixel`, `atari` | Choix du renderer. |
| `res` | `80x25`, `160x50` | Résolution commune texte et gfx. |
| `text` | `80x25` | Résolution du buffer texte (verrouillée). |
| `gfx` | `160x50` | Résolution de conversion AALib. |
| `config` | `stas.ini` | Fichier INI à charger. Les paramètres d'URL restent prioritaires. |

### Points d'entrée importants

- `http://localhost:8080/docs.html` — cette documentation.
- `http://localhost:8080/packages/stas-web/index.html` — application web principale.
- `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=pixel` — démo avec le renderer natif.

---

## Configuration INI

Un fichier INI simple permet de centraliser les réglages. La section `[web]` accepte les
clés `renderer`, `res`, `text`, `gfx` et `run`.

```ini
; stas.ini
[web]
renderer=pixel
res=80x25
run=examples/sinus-anim.bas
```

Chargement depuis l'URL :

```
http://localhost:8080/packages/stas-web/index.html?config=stas.ini
```

Les paramètres passés dans l'URL écrasent ceux du fichier INI.

---

## Intégration iframe

L'application web peut être embarquée dans une balise `<iframe>` et contrôlée depuis la page
parente via une API `postMessage`. Cela permet d'intégrer STAS dans un site, un éditeur de
code, un wiki ou un autre framework.

### Messages parent → iframe (`target: "stas"`)

| Type | Données | Effet |
| ---- | ------- | ----- |
| `run` | `source?`, `id?` | Charge et exécute le programme. |
| `load` | `source?`, `id?` | Charge sans exécuter. |
| `play` | `id?` | (Re)lance ou reprend l'exécution. |
| `pause` | `id?` | Suspend l'exécution. |
| `resume` | `id?` | Reprend après pause. |
| `stop` | `id?` | Interrompt l'exécution courante. |
| `reset` | `id?` | Stop et réinitialise complètement. |
| `input` | `text`, `id?` | Envoie une ligne en réponse à une saisie. |

### Messages iframe → parent (`source: "stas"`)

| Type | Données | Sens |
| ---- | ------- | ---- |
| `ready` | — | Le moteur est prêt. |
| `loaded` | `id?` | Source chargée. |
| `done` | `id?` | Exécution terminée normalement. |
| `stopped` | `id?` | Arrêt demandé ou BREAK. |
| `error` | `message`, `code` | Erreur d'exécution. |
| `input:request` | — | L'engine attend une ligne de saisie. |
| `output` | `text` | Contenu texte final du buffer. |

### Exemple d'intégration

```html
<!-- Page hôte -->
<iframe id="stasFrame"
        src="http://localhost:8080/packages/stas-web/index.html"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin">
</iframe>

<script>
  const iframe = document.getElementById('stasFrame');

  function stasCommand(type, payload = {}) {
    iframe.contentWindow.postMessage(
      { target: 'stas', type, ...payload },
      '*'
    );
  }

  window.addEventListener('message', (e) => {
    if (e.data?.source !== 'stas') return;
    console.log('STAS:', e.data.type, e.data);
  });

  // Lancer un programme après quelques secondes
  setTimeout(() => {
    stasCommand('run', { source: '10 PRINT "HELLO"\n20 END' });
  }, 2000);
</script>
```

Le champ `target: 'stas'` est obligatoire pour que l'iframe reconnaisse le message. Les
messages sortants portent `source: 'stas'`. Le champ optionnel `id` permet de corréler les
accusés de réception avec les commandes envoyées.

---

## Exemples d'URL

| URL | Effet |
| --- | ----- |
| `http://localhost:8080/docs.html` | Cette documentation. |
| `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=pixel` | Démo vague en renderer natif. |
| `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=aalib&res=160x50` | Version ASCII-art haute résolution. |
| `http://localhost:8080/packages/stas-web/index.html?config=stas.ini` | Charge la configuration INI. |

### Exemple de programme STOS

```basic
10 rem Sinus animé simple
20 for x=0 to 319 step 4
30   y=100+80*sin(x/40)
40   plot x,y
50 next x
60 wait 50
70 goto 20
```

Quelle que soit la cible (navigateur ou terminal), le langage reste le même. Seul le
renderer change, et le programme peut être déplacé d'une plateforme à l'autre sans
modification.

---

## Licence

MIT (voir `LICENSE`) — STOS BASIC © François Lionet. Écrit à la main, sans IA, sur le
clavier mou de l'Atari 520 ST ; celui-ci est écrit avec un peu d'aide, sur un vrai clavier.
