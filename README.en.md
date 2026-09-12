# STAS — STOS ASCII System

The **STOS BASIC** by François Lionet (Maison-Alfort, 1988, Atari ST) reborn in pure ASCII.
Same language, same instructions, same bilingual errors — but all display goes through a
**character-cell buffer** instead of the STOS VDI traps. Two twin targets:

- **console** — truecolor ANSI terminal (Windows Terminal, iTerm, xterm...)
- **browser** — HTML canvas in VT323 font, embeddable in an **iframe**
  (designed for AWI-HAXE / AOZ Studio)

The core is pure JavaScript, zero dependency, 100% platform-agnostic: it never knows
where it is being displayed.

```basic
10 print "Hello, world!"
20 for i=1 to 5
30 print "turn ";i
40 next i
run
```

---

## Table of contents

- [Quick start](#quick-start)
- [The stas command](#the-stas-command)
- [Architecture](#architecture)
- [Language V1](#language-v1)
- [Renderers](#renderers)
- [Text and graphic resolutions](#text-and-graphic-resolutions)
- [Console output](#console-output)
- [Running in the browser](#running-in-the-browser)
- [INI configuration](#ini-configuration)
- [iframe integration](#iframe-integration)
- [URL examples](#url-examples)
- [License](#license)

> Version française : [README.md](README.md)

---

## Quick start

After cloning, run the installer: it checks Node.js (≥ 18, aborts otherwise),
installs the `stas` command (PATH on Windows, wrapper on macOS/Linux) and
validates with the test suite.

```sh
# Windows (PowerShell, cmd or double-click)
install.bat

# macOS / Linux
./install.sh
```

Then, from any folder, in a **new** terminal:

```sh
stas                        # interactive STAS> console
stas examples:hello.bas     # run a demo
stas --web                  # server + browser
stas help                   # full help
```

The first `stas` invocation after the machine boots shows the welcome banner
(François Lionet signature); subsequent ones go straight to the `STAS>` prompt —
like STOS, which only introduced itself once.

No `npm install` is needed: everything is native ESM, relative imports work
directly. Without the installer, the commands remain available directly:

```sh
# Interactive console
node packages/stas-console/bin/stas.js

# Run a program
node packages/stas-console/bin/stas.js examples/sinus.bas

# Web version
node packages/stas-web/serve.js        # -> http://localhost:8080/packages/stas-web/

# tests (node:test, zero dependency)
npm test
```

Node ≥ 18 required.

---

## The stas command

| Command | Effect |
| --- | --- |
| `stas` | interactive `STAS>` console |
| `stas file.bas` | run the program in the console |
| `stas examples:name.bas` | run a demo from the `examples/` folder |
| `stas run file.bas` | same, explicit verb |
| `stas --edit file.bas` | edit mode: NEW + LOAD + LIST 0-100 |
| `stas file.bas --edit` | same, `--edit` after the file |
| `stas --web` | web server + browser opened automatically |
| `stas --web --edit f.bas` | edit in the browser |
| `stas serve` | web server without browser |
| `stas test` | test suite |
| `stas help` | help |

Ctrl-C during a RUN = Break (error 17), with the line number, like the STOS
STOP. Installation (PATH or wrapper) is idempotent and cleans up previous
installations (moved or copied folder).

---

## Architecture — the new trap set

The original STOS stacked its own traps (`FENETRE.S`, `SPRITES.S`, `FLOAT.S`,
`MUSIC.S`) on top of the system traps (GEMDOS, VDI, BIOS, XBIOS). STAS replaces
the whole stack with two injections:

```
source.bas → tokenizer → stas-core → AsciiBuffer → stas-web or stas-console → renderer
```

| STOS (1988)                        | STAS                                    |
| ---------------------------------- | --------------------------------------- |
| TRAP #3 → FENETRE.S → VDI → screen | `AsciiBuffer` → ANSI / canvas renderer  |
| TRAP #13 BIOS → Bconin (keyboard)  | injected `readLine` / `inkey` provider  |
| tokenized text zone in memory      | `Program` — sorted lines, JS tokens     |
| bilingual `merreur` table          | `errors.js` — the 88 original messages  |
| token tables BASIC.S L525-694      | `tokens.js` — faithful copy, $80-$FF    |

The monorepo:

```
packages/
  stas-core/        the core, platform-agnostic
    src/errors.js        88 bilingual errors (merreur table)
    src/tokens.js        token table (BASIC.S L525-L694)
    src/tokenizer.js     line tokenization
    src/ascii-buffer.js  THE new TRAP #3
    src/program.js       numbered lines + LIST detokenization
    src/values.js        values {integer, float, string}
    src/interpreter.js   execution loop + Pratt evaluator
    src/instructions.js  instruction and function tables
    src/intro.js         welcome banner (once per boot)
    src/stas.js          facade (feedLine / run / execDirect)
  stas-web/         index.html + canvas + keyboard + postMessage + serve.js
  stas-console/     bin/stas.js + ANSI renderer + raw keyboard
                    + intro-once.js (banner once per boot)
  stas-world/       AWI bridge (iteration 2) — host shell, Legal-Fractal,
                    world navigation, WorldSTAS protocol,
                    storage (mockup of the AWI connector)
examples/           hello, sinus, sinus-anim, sinus-gfx, devine, carres,
                    demo-gfx, star-link-demo
test/               node --test
```

---

## Language V1

**Structures**: `GOTO`, `GOSUB`/`RETURN`/`POP`, `FOR`/`TO`/`STEP`/`NEXT`,
`WHILE`/`WEND`, `REPEAT`/`UNTIL`, `IF`/`THEN`/`ELSE` (one-line form,
`IF x THEN 100` accepted), `ON n GOTO|GOSUB`, `ON ERROR GOTO`/`RESUME`/
`RESUME NEXT`, `DIM`, `DATA`/`READ`/`RESTORE [n]`, `REM` / `'`, `:` to chain
statements.

**Display**: `PRINT` / `?` (`;` no newline, `,` 14-column tabs, `TAB(n)`),
`CLS`, `LOCATE x,y` (0-based), `PEN n`, `PAPER n`, `HOME`,
`CUP`/`CDOWN`/`CLEFT`/`CRIGHT`, `INC`/`DEC`.

**Input**: `INPUT ["text";] v[,v2...]`, `LINE INPUT`, `INKEY$` (non-blocking).

**Math functions**: `ABS INT SQR SGN SIN COS TAN ATN ASIN ACOS HSIN HCOS HTAN
EXP LN LOG PI MIN MAX RND` — `LOG` is base 10 like STOS. `FIX n` sets the
printed precision of reals (1..15 decimals, ≥16 = normal, negative =
exponential).

**String functions**: `CHR$ ASC LEN LEFT$ RIGHT$ MID$ STR$ VAL SPACE$
STRING$ INSTR UPPER$ LOWER$ HEX$ BIN$ FLIP$`, plus `INPUT$(n)` (read n
characters without echo) and `USING` formatted output (fields `~ # + - . ; ^`).

**Arrays & system**: `MATCH` (closest match in a sorted 1-D array), `SORT a(0)`
(sort a 1-D array), `SWAP x,y` (exchange two variables), `FREE`, `TIME$`,
`DATE$`, `LANGUAGE`, `ERRN`/`ERRL` (last error), `TIMER` (50 Hz counter),
`TRUE`/`FALSE`.

**Direct commands**: `RUN [n]`, `LIST` (ranges: `LIST n`, `LIST n,m`,
`LIST n-m`, `LIST n-`, `LIST -m`), `NEW`, `DEL`/`DELETE`, `SAVE`, `SAVE AS`,
`LOAD`, `CLEAR`, `WAIT n` (n × 20 ms), `END`, `STOP`, `ERROR n`,
`ENGLISH`/`FRANCAIS`.

### SAVE / LOAD — the storage connector

`SAVE` and `LOAD` do not touch the disk directly: they go through a connector
(`stas:save` / `stas:load`) using the AWI message format — `Answer
{ success, error, data, message }` response like `EdHttp`. The console plugs
a local mockup (`LocalStasConnector` in `stas-world`); later the AWI
`ConnectorStas` will take over (accounts, security, Volt.A storage) without
the BASIC seeing any difference.

- `save "file.bas"` — saves the program in memory
- `save` alone — reuses the current file (or asks for a name)
- `save as "file.bas"` — forces a new name
- `load "file.bas"` — replaces the program in memory
- the `examples:` prefix targets the `examples/` folder of the installation,
  whatever the current directory: `load "examples:hello.bas"`
- STOS error 48 ("File not found") if missing, 20 ("Function not
  implemented") if no connector is plugged

### Graphics V1

`MODE 0/1/2` (320×200 logic + physic screens, `SCREEN SWAP`/`SCREEN COPY`,
`AUTOBACK`), `PLOT`, `LINE`, `DRAW` (numeric form `x1,y1 TO x2,y2` and turtle
form `DRAW "r10 d20"`), `BOX`, `BAR`, `RBOX`, `RBAR` (rounded corners),
`CIRCLE`, `ELLIPSE`, `PAINT`, `INK n` (gfx ink color, text keeps its `PEN`),
`CENTRE`, `RESERVE AS SCREEN n` + `START(n)`, `LOGIC=`/`PHYSIC=` assignment.
`PLAY` is accepted but silent; `FLASH`/`KEY`/`CLICK` `ON|OFF`, `HIDE` and
`SHOW` are no-ops.

### Memory — banks, PEEK / POKE

`RESERVE AS SCREEN|DATASCREEN|WORK|DATA|SET n[,length]`, `ERASE n`, `START(n)`
(bank base address) and `LENGTH(n)` (bank length — note `LEN(a$)` is the
string length, per the STOS reference card).

Memory instructions address a 32-bit space whose high bits carry flags:

| bits | meaning |
| ---- | ------- |
| 31 | always 0 (addresses stay positive) |
| 30 | LOGIC screen |
| 29 | PHYSIC screen |
| 28..25 | bank number (1–15) |
| 24..0 | offset |

`PEEK`/`POKE` (byte), `DEEK`/`DOKE` (word, even address), `LEEK`/`LOKE`
(long, even address), `COPY start,finish TO dest`, `FILL start TO finish,lw`,
`HUNT(start TO end,a$)`, `BCOPY src TO dst`, `BLOAD`/`BSAVE` (binary blocks
through the storage connector). `BCHG`/`BCLR`/`BSET`/`BTST` and `ROL`/`ROR`
act on variables. `VARPTR(variable)` gives a variable's address in the flat
RAM (4-byte integer, 8-byte big-endian IEEE double, or string with its
2-byte length just before the first character). An address with no flag and
bank 0 falls in a flat 1 MB RAM.

Screen memory has two representations, picked by `mem=compatible` (default)
or `mem=native`:

- **compatible** — the real Atari ST layout: 4 bitplanes interleaved by
  16-bit words (320×200, 32000 bytes, 160 bytes per line), so 1988 programs
  that poke the screen behave unchanged;
- **native** — one byte per pixel (palette index), 64000 bytes.

Set with `--mem=` on the console, `?mem=` or `[web] mem=` in the browser,
`[console] mem=` in an INI file.

### Semantic decisions (V1)

- `TRUE` is **1**, comparisons return 0/1
- `DEG`/`RAD` are both an instruction and a function, like STOS: used alone
  they switch the trigonometric mode; `DEG(x)`/`RAD(x)` convert the angle
  (radians ↔ degrees)
- `^` is **left-associative** — `2^3^2 = 64`, a STOS quirk kept as is
- `AND OR XOR` = bitwise on signed 32 bits; `NOT` is boolean
- `7/2 → 3.5` but `8/2 → 4`: integer division when exact
- keywords case-insensitive and listed lowercase; **variables are
  case-sensitive**, full names, `$` suffix = string
- typing a line number alone deletes the line (faithful to the STOS editor)
- errors display "Syntax error in line 10" / "Erreur de syntaxe en ligne 10"
  per `ENGLISH`/`FRANCAIS`; at startup the language follows the machine's
  (French on a French machine), like the welcome banner

### Known V1 limitations

- `IF ... THEN ... ELSE` on a single line (no multi-line blocks)
- a `DATA` containing a raw keyword (`data wend`) can confuse the structure
  scan — STOS stored DATA as raw text, to be revisited
- no `DEF FN`, no sprite rotation (STOS did not have it either!)
- the detokenizer sometimes glues `T mod 3` into `Tmod` in LIST (cosmetic)

The rest of the STOS vocabulary (sprites, music, windows, data banks...) is
**faithfully tokenized** but returns error 20 — the token table is complete,
the ground is ready.

---

## Renderers

The same STAS program can be displayed in several ways. The renderer is
chosen with the `renderer` URL parameter or in the `[web]` section of an INI
file.

| Renderer | Value | Description |
| -------- | ----- | ----------- |
| `CanvasRenderer` | `canvas` (default) | Each cell of the text grid is rendered as a color block or a glyph. Balanced between text readability and graphic look. |
| `AalibRenderer` | `aalib` | Converts the 320×200 graphic plane to ASCII art. Requires `vendor/aalib.js`. |
| `PixelRenderer` | `pixel` or `atari` | Copies the 320×200 graphic buffer pixel by pixel into a canvas, scaled without smoothing. Closest to the Atari ST look. |
| ANSI console | — | Used by the Node.js adapter. Graphic buffer converted to block characters and 24-bit ANSI colors. |

### Transparency and fake black

To solve transparency issues, notably in the AALib renderer, STAS can use a
transparent color. The original STOS sprite editor offered a similar option
when importing images.

- Pure black `(0,0,0)` plays the role of the transparent color.
- Displayable black is mapped to `(0,0,1)`, imperceptible to the human eye
  but distinct for the engine.
- Thus palette images keep their original colors and gain a transparent
  color.

---

## Text and graphic resolutions

STAS distinguishes two resolutions, which can be identical or decoupled:

- **Text buffer**: the character grid that `PRINT`, `LOCATE`, `CLS` operate on.
- **Graphic renderer**: the grid used to convert the 320×200 image to
  characters or pixels.

| Parameter | Example | Meaning |
| --------- | ------- | ------- |
| `res=WxH` | `res=160x50` | Common resolution for text and graphics. |
| `text=WxH` | `text=80x25` | Locks the text buffer grid; `MODE` no longer resizes it. |
| `gfx=WxH` | `gfx=160x50` | Sets the AALib renderer conversion grid, independent from text. |

Values must be divisors of 320×200 (e.g. 80×25, 160×50). Without indication,
full STOS fidelity: `MODE` picks the grid.

> **Compatibility:** `gfx=` only makes sense for `renderer=aalib`. The
> `canvas` and `pixel` renderers follow the text resolution or the native
> 320×200. An invalid combination is ignored with a warning in the browser
> console.

---

## Console output

Console output cannot display bitmap graphics, but it works in ascii-art.
The 320×200 graphic buffer is converted to quadrant block characters and
colored with 24-bit ANSI sequences. This allows animations in a modern
terminal, like the animated sine demo.

```sh
node packages/stas-console/bin/stas.js examples/sinus-anim.bas
```

By default the console render area is not resized when the terminal window
changes size. This behavior can be made optional through a configuration
parameter, to preserve the visual coherence of programs.

---

## Running in the browser

The development server included in `stas-web` serves the whole `STAS/`
folder as root and redirects `/` to `/packages/stas-web/`. Paths therefore
do not include the `/STAS/` segment in the URL.

```sh
# From the STOS/ root
npm run serve
# or directly
node STAS/packages/stas-web/serve.js
```

The server listens on `http://localhost:8080` by default.

### URL parameters

| Parameter | Value / example | Description |
| --------- | --------------- | ----------- |
| `run` | `examples/sinus-anim.bas` | Program to load and run at startup. |
| `renderer` | `canvas`, `aalib`, `pixel`, `atari` | Renderer choice. |
| `res` | `80x25`, `160x50` | Common text and gfx resolution. |
| `text` | `80x25` | Text buffer resolution (locked). |
| `gfx` | `160x50` | AALib conversion resolution. |
| `config` | `stas.ini` | INI file to load. URL parameters take precedence. |

### Important entry points

- `http://localhost:8080/docs.html` — this documentation.
- `http://localhost:8080/packages/stas-web/index.html` — main web app.
- `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=pixel` — demo with the native renderer.

---

## INI configuration

A simple INI file centralizes the settings. The `[web]` section accepts the
`renderer`, `res`, `text`, `gfx` and `run` keys.

```ini
; stas.ini
[web]
renderer=pixel
res=80x25
run=examples/sinus-anim.bas
```

Loading from the URL:

```
http://localhost:8080/packages/stas-web/index.html?config=stas.ini
```

Parameters passed in the URL override the INI file.

---

## iframe integration

The web app can be embedded in an `<iframe>` and controlled from the parent
page via a `postMessage` API. This allows integrating STAS into a site, a
code editor, a wiki or any other framework.

### Parent → iframe messages (`target: "stas"`)

| Type | Data | Effect |
| ---- | ---- | ------ |
| `run` | `source?`, `id?` | Loads and runs the program. |
| `load` | `source?`, `id?` | Loads without running. |
| `play` | `id?` | (Re)starts or resumes execution. |
| `pause` | `id?` | Suspends execution. |
| `resume` | `id?` | Resumes after pause. |
| `stop` | `id?` | Interrupts current execution. |
| `reset` | `id?` | Stops and fully resets. |
| `input` | `text`, `id?` | Sends a line answering a prompt. |

### iframe → parent messages (`source: "stas"`)

| Type | Data | Meaning |
| ---- | ---- | ------- |
| `ready` | — | The engine is ready. |
| `loaded` | `id?` | Source loaded. |
| `done` | `id?` | Execution finished normally. |
| `stopped` | `id?` | Stop requested or BREAK. |
| `error` | `message`, `code` | Runtime error. |
| `input:request` | — | The engine awaits an input line. |
| `output` | `text` | Final text content of the buffer. |

### Integration example

```html
<!-- Host page -->
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

  // Run a program after a few seconds
  setTimeout(() => {
    stasCommand('run', { source: '10 PRINT "HELLO"\n20 END' });
  }, 2000);
</script>
```

The `target: 'stas'` field is mandatory for the iframe to recognize the
message. Outgoing messages carry `source: 'stas'`. The optional `id` field
correlates acknowledgments with the commands sent.

---

## URL examples

| URL | Effect |
| --- | ----- |
| `http://localhost:8080/docs.html` | This documentation. |
| `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=pixel` | Wave demo in native renderer. |
| `http://localhost:8080/packages/stas-web/index.html?run=examples/sinus-anim.bas&renderer=aalib&res=160x50` | High resolution ASCII-art version. |
| `http://localhost:8080/packages/stas-web/index.html?config=stas.ini` | Loads the INI configuration. |

### Sample STOS program

```basic
10 rem Simple animated sine
20 for x=0 to 319 step 4
30   y=100+80*sin(x/40)
40   plot x,y
50 next x
60 wait 50
70 goto 20
```

Whatever the target (browser or terminal), the language stays the same.
Only the renderer changes, and a program can be moved from one platform to
the other without modification.

---

## License

MIT (see `LICENSE`) — STOS BASIC © François Lionet. Originally hand-written,
without AI, on the soft keyboard of the Atari 520 ST; this one is written
with a little help, on a real keyboard.
