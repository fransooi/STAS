# @stas/sprites — éditeur de sprites ASCII

Port ASCII de `SPRITE.ASC` (François Lionet, © Jawx/Mandarin 1987), le
*Sprites Designer* du STOS BASIC. Là où l'original dessinait des **pixels**
(bitplanes 68000, banques mémoire, code machine `call 15`), celui-ci dessine
des **caractères** : chaque cellule est `{ch, fg, bg}` — un glyphe Unicode,
une encre, un papier.

Le cœur est **agnostique** (zéro import Node) : la console et le navigateur
le réutilisent tel quel. WorldSTAS peut donc y accéder directement.

```js
import { Sprite, SpriteBank, tools } from "@stas/sprites";
```

## Démarrage

```sh
# Console — génère une banque de démo, l'écrit et l'affiche en ANSI
node packages/stas-sprites/bin/stas-sprites.js demo demo.stasprite
node packages/stas-sprites/bin/stas-sprites.js render demo.stasprite
node packages/stas-sprites/bin/stas-sprites.js info demo.stasprite

# Navigateur — l'éditeur interactif canvas
node packages/stas-web/serve.js        # sert tout le dépôt
# → http://localhost:8080/packages/stas-sprites/web/
```

## Les outils (transposition pixel → caractère)

| STOS 1987 | ASCII | Note |
|---|---|---|
| Plot | `plot` | pose le glyphe courant |
| Draw | `line` | Bresenham |
| Box / Filled box | `box` / `fillBox` | |
| Circle / Filled | `circle` / `fillCircle` | point milieu |
| Ellipse / Filled | `ellipse` / `fillEllipse` | |
| Paint | `floodFill` | région de même caractère |
| Clear | `clearSprite` | espaces |
| Flip-H / Flip-V | `flipH` / `flipV` | **sans asm 68000** |
| Rotate | `rotate` | 90°, carré uniquement (comme l'original) |
| Reduce | `reduce` | recadre sur le contenu |
| Undo | `History` | pile multi-niveaux |
| Scroll | `scroll` | les flèches, avec enroulement |

Reportés en v2 : Zoom, Blocs, éditeur d'animation complet, éditeur RGB fin.

## Couleurs : par caractère

Chaque cellule porte **sa propre** encre (`fg`) et **son propre** papier
(`bg`), indices 0–15 dans la palette STOS (`SPRITE_PALETTE`, identique à
celle de `stas-core`). Il n'y a pas de couleur « globale » au sprite — la
palette est partagée au niveau de la *banque*, comme le `PAL(16)` unique de
l'original.

## Unicode par pages

L'encre est un caractère, pas une couleur. Pour aller loin dans la police,
Unicode est découpé en **pages de 256 points de code** (`page = cp >> 8`),
feuilletables — y compris les plans astraux (emoji, page `0x1F6`…). Chaque
cellule stocke le glyphe en Unicode natif.

```js
import { pageGlyphs, NAMED_PAGES, QUICK_GLYPHS } from "@stas/sprites";
pageGlyphs(0x25)[0x88].ch;  // "█"  (U+2588, page Filet/Blocs/Formes)
pageGlyphs(0x1f6)[0].ch;    // "😀" (plan astral)
```

La **police** ne change que le *rendu* (grille, aperçu, export raster),
jamais la donnée. Catalogue dans `src/fonts.js` (VT323 par défaut).

## Banque, animation & sauvegarde — UN seul fichier

Une `SpriteBank` regroupe tous les sprites + la palette + la police +
l'animation (`{loop, frames:[{sprite, delay}]}`). Tout est sérialisé dans un
**seul** fichier JSON `.stasprite` (round-trip complet, couleurs par cellule
conservées). Chargement par **drag-and-drop** côté web, ou `fs` en console.

Trois exports (`makeExport`) :

- **JSON** (`.stasprite`) — format natif, banque complète.
- **TXT** (`.txt`) — les caractères seuls.
- **ANSI** (`.ans`) — rendu 24 bits pour terminal.

## Architecture

```
packages/stas-sprites/
  index.js            exports publics
  src/
    sprite.js         grille {ch,fg,bg} + hot spot (agnostique)
    tools.js          les opérations de dessin
    history.js        pile undo/redo
    bank.js           banque multi-sprites + animation
    charset.js        pages Unicode
    fonts.js          catalogue de polices de rendu
    save.js           JSON / TXT / ANSI
  bin/stas-sprites.js entrée console
  web/                éditeur canvas (grille, aperçu, banque, drag-drop)
```

## Tests

```sh
node --test test/sprites.test.mjs   # 33 tests : grille, outils, pages, banque, exports
```
