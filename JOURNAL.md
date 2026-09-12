# Journal de bord — STAS

Chronologie factuelle du portage, tirée de l'historique Git (commits datés et
publics). Sert aussi de *show notes* pour le podcast : un épisode = un
incrément = un ou plusieurs commits.

Chaque entrée : *date — hash — sujet — ce qu'on a appris du STOS d'origine.*

## 2026-08

- **2026-08-02** `f9e9792` — *first commit.*
- **2026-08-04** `2e193f7` — *Interpréteur STAS initial.*
- **2026-08-18** `df908c0` — *Installateur, connecteur de stockage, renderer pixel.*

## 2026-09-12 — la journée du retour aux sources

- `2e193f7`→ : math, chaînes, système (`HSIN`/`HCOS`/…, `MATCH`, `FLIP$`,
  `INPUT$`, `USING`, `DEG`/`RAD` **instruction ET fonction**).
- `4a2ffe3` — `ON ERROR GOTO`, `RESUME`, `BREAK` : **`ERRN`/`ERRL`** en direct.
- `b03c286` — mémoire émulée : **banques**, `PEEK`/`POKE`, `VARPTR`, plans ST.
  Révélation : un écran ST de 32 Ko en 4 plans entrelacés par **mots de 16 bits**.
- `a4b5187` — `PRINT USING` **porté fidèlement** depuis `BASIC.S` (le `~`,
  le `;`, les chiffres consommés de droite à gauche).
- `1346066` — fenêtres texte (bordures 192-253, coordonnées **relatives**).
- `5472f96` — attributs texte, `SCRN`, conversions texte/graphique.
- `3638891` — primitives graphiques V2 (arcs, polygones, `CLIP`, `SET LINE`).
- `7d5d6e3` — guide d'architecture pour les sessions suivantes.
- `bb8918b` — `COLOUR`/`PALETTE` : format **9 bits** `0000 0RGB 0RGB 0RGB` ;
  l'instruction stocke le mot brut, la fonction masque `$777`.
- `351cec9` — `GET PALETTE`, `SHIFT`, `FADE`. Découverte : ce sont des
  **animations d'interruption** — ici rejouées sur le *tick* (1 trame = 20 ms).
- `ca4037d` — `APPEAR`. L'astuce : un **pas copremier avec 64000** qui fait
  apparaître les pixels un à un ; les effets 73–80 sont **pairs** (image
  partielle).
- `f2eb078` — `PACK`/`UNPACK` : le **PICTURE COMPACTOR** (`COMPACT.S`), RLE à
  deux étages, en-tête `$06071963` (l'anniversaire de l'auteur, dans le code
  depuis 1987).
- `a6a2925` — `ZOOM`, `REDUCE`, `SCREEN COPY` de zone, `GR WRITING 1..4`.
  `REDUCE` : table `tab_x` = « premier pixel source de chaque case ».
- `bccd0b2` — **moteur de sprites** (`SPRITES.S`) : priorités (`PRIORITY ON` =
  plus grand Y devant), `MOVE`/`ANIM` en attente de `MOVE ON`/`ANIM ON`,
  `UPDATE OFF` qui fige l'affichage sans arrêter le moteur, zones, collisions.
  Vérification au passage : `MOUVEX`/`MOUVEY` sont bien le `MOVE X`/`MOVE Y`
  **des sprites**, pas la souris (`BASIC.S:767-772`).

## Fil rouge

> « Le STOS avait des bugs. On va tout de même pas les porter. »
> Chaque fois qu'un choix d'origine est ambigu, on relit la source 68000 — et
> on garde la décision, pas le défaut.
