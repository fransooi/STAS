# @stas/world — la console STAS comme porte d'entree des mondes AWI

Iteration 2 de « STAS — la console prend vie » : `ENTER STAS` ne donne plus
seulement l'editeur BASIC, mais **AWI AVEC LE MONDE STAS**. Sous une seule
invite, trois couches :

1. **BASIC** — tout `stas-core` (PRINT, RUN, LIST, FOR...)
2. **Shell hote** — « dans STAS on a toutes les commandes DOS accessible » :
   `!dir`, `!ipconfig`, `!ls -la` s'executent *localement* (machine de la
   console, pas le serveur AWI)
3. **Mondes AWI** — `enter <monde>` passe la porte **Legal-Fractal**, puis la
   console parle au monde avec la grammaire des personas AWI

## Demarrage

```sh
node packages/stas-world/bin/stas-world.js           # console interactive
node packages/stas-world/bin/stas-world.js prog.bas  # execute un programme
node packages/stas-world/bin/stas-world.js --serve   # protocole JSON lignes
```

## La console

```
Ok
print 6*7
42
Ok
!echo hello        <- shell hote (cmd.exe / bin/sh selon la machine)
hello
Ok
worlds             <- mondes connus
.(oo) Mondes connus : network, system/device-linux/network
Ok
enter network      <- porte Legal-Fractal
.[==] system/legal-fractal Please pass authorisation using your phone.
.[===] system/legal-fractal waiting... granted.
.[===] network
.>>>oo>>> Welcome to the network world!
.(fransooa) did DHCP work?   <- parole au monde courant
```

L'invite change selon le contexte : `Ok` dans STAS, `.(<persona>) ` dans un
monde. `leave` / `exit` ramene a STAS.

### Regle de dispatch — deterministe, pas de devinette

| ligne            | destination                              |
| ---------------- | ---------------------------------------- |
| `!cmd`           | shell hote                               |
| `.texte`         | parole au monde courant (ou info systeme)|
| `enter <monde>`  | porte Legal-Fractal + entree             |
| `leave` / `exit` | sortie du monde                          |
| `worlds`         | liste des mondes                         |
| tout le reste    | BASIC (`feedLine` / `execDirect`)        |

`RUN`, `LIST`, `NEW`, `DEL` existent en BASIC **et** en DOS — le shell est
donc explicite (`!`) plutot qu'un fallback silencieux qui avalerait ces
commandes.

## WorldSTAS (`awi.worlds.WorldStas`) y accede de deux facons

**1. Processus + protocole JSON lignes** (recommande cote Haxe) :

```sh
stas-world --serve     # un message JSON par ligne, dans les deux sens
```

```
STAS -> WorldSTAS : ready | output{text} | input:request | done | error
                    shell:output{text,stream} | auth:request{world}
                    world:enter{world} | world:leave{world}
WorldSTAS -> STAS : run{source} | line{text} | input{text} | stop
                    auth:granted{world} | auth:denied{world,reason}
                    world:say{text} | world:work{text}
```

Les noms reprennent l'API postMessage de `stas-web` (meme contrat, autre
transport). Voir `src/protocol.js`.

**2. Import direct cote JS** :

```js
import { WorldBridge } from "@stas/world";

const bridge = new WorldBridge({
  stas,
  authProvider: (world) => legalFractal.ask(world),  // vraie porte
});
bridge.on("output",  (t) => display.write(t));
bridge.on("message", (m) => worldStas.send(m));
await bridge.handleLine(line);
```

Sans hote branche, STAS simule les reponses du monde (auth accordee, accueil)
pour rester demo-able ; des qu'un listener `message` existe, la simulation
s'efface et WorldSTAS prend la main.

## Stockage — mockup du connecteur AWI (phase 3)

`SAVE` / `LOAD` du BASIC passent par un connecteur, pas par le systeme de
fichiers directement :

```js
import { LocalStasConnector } from "@stas/world";

const storage = new LocalStasConnector({ user: "loic" });
stas.io.sendCommand = (command, parameters) => storage.sendMessage(command, parameters);
stas.io.userName = "loic";
```

Contrat calque sur `awi.connectors.editor` (EdHttp / EdNetwork / Answer) :

- commande `"stas:save"` / `"stas:load"` — forme `connecteur:commande`,
  routee vers `command_save` / `command_load` comme `dispatchMessage`
- parametres `{ path, source?, userName? }`
- reponse `Answer { success, error, data, message, info }` ;
  `data.stosCode` traduit un echec en erreur STOS (48, 53, 16)
- le prefixe `examples:` designe le dossier `examples/` de
  l'installation STAS (remappage calcule depuis le module, valable depuis
  n'importe quel repertoire courant — comme `STAS.bat`) ; les autres
  chemins relatifs partent du repertoire courant
- enveloppe transport `{ id, responseTo, parameters }` (EdHttp.reply) prete
  pour HTTP/WebSocket

Quand `ConnectorStas.hx` existera cote AWI, il suffira de remplacer
`LocalStasConnector` par un client qui parle au meme contrat — le BASIC
(ni le coeur STAS) n'y verront aucune difference.

## Grammaire de rendu

Alignee sur les personas AWI existantes (`ConnectorConfiguration.hx`
L162-185 : `.(oo)`, `.(?°)`, `.(ok)`, `.(**)`) + deux extensions de
l'iteration 2, **a formaliser cote Haxe** :

- `.[==] ` / `.[===] ` — canal systeme avec barre de progression
- `.>>>oo>>> ` / `.>>>==>>> ` — voix du monde entre / monde au travail

## Limites (V0)

- Legal-Fractal est simule par defaut (delai + granted) — brancher le vrai
  `ConnectorLegalFractal_Proxy` via `authProvider` ou les messages
  `auth:granted` / `auth:denied`
- les mondes connus sont une liste locale ; pas encore de decouverte via AWI
- pas de memoire de conversation cote STAS (les souvenirs vivent dans
  `awi.souvenirs`, cote monde)

## Licence

MIT — STOS BASIC (c) Francois Lionet.
