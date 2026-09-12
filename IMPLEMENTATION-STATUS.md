# STAS — Implementation status vs the STOS reference card

**Source of truth:** `19555469-STOS-Manual.txt`, *STOS Basic reference card*,
lines **15560–16061** (the complete instruction & function list).

**Compared against:**
- `packages/stas-core/src/tokens.js` — the token table (BASIC.S L525–L694)
- `packages/stas-core/src/instructions.js` — `INSTRUCTIONS`, `EXT_INSTRUCTIONS`,
  `FUNC_TABLE`, `EXTFUNC_TABLE`
- `packages/stas-core/src/interpreter.js` — inline dispatch of the structure
  keywords (`execStatement`, `parsePrimary`)

**Method:** every keyword form tokenized by `KEYWORDS` is classified as
*implemented* (a handler exists) or *not*. A tokenized-but-unhandled keyword
raises STOS error **20** (`Function not implemented`), per
`interpreter.js` L352/L359/L777.

---

## 1. Headline

| Category | Count |
| --- | ---: |
| Distinct tokenized keyword forms | **341** |
| Implemented (handler present) | **216** |
| Tokenized, **not** implemented → error 20 | **125** |
| Manual entries **not tokenized at all** | **2** |

Of the 210 "implemented" forms, 7 are pure structural markers (`TO`, `STEP`,
`THEN`, `NEXT`, `WEND`, `UNTIL`, `ELSE`), leaving **≈ 203 distinct STOS
features that actually run today**.

> Iterations 1–8 landed: the count moved from 124 → **216** implemented
> (217 → 125 missing).

**The token table is *almost* complete:** only **`PACK`** and **`UNPACK`**
(screen pack/unpack) from the reference card have no token. Everything else is
at least recognized — the difference between STAS and STOS is in the dispatch
tables, not the tokenizer.

---

## 2. Implemented today (210 forms)

**Control flow & structures**
`GOTO`, `GOSUB`, `RETURN`, `POP`, `FOR…TO…STEP…NEXT`, `WHILE…WEND`,
`REPEAT…UNTIL`, `IF…THEN…ELSE`, `ON n GOTO|GOSUB`, `DIM`, `DATA`, `READ`,
`RESTORE`, `REM` / `'`, `LET`, `:` chaining, assignment (incl. arrays),
`LOGIC=` / `PHYSIC=` system variables.

**Direct commands**
`RUN [n]`, `LIST` (all ranges), `NEW`, `DELETE`, `SAVE` / `SAVE AS`, `LOAD`,
`CLEAR`, `ENGLISH`, `FRANCAIS`, `SYSTEM` (host hook), `END`, `STOP`,
`ERROR n`, `BREAK` (as error 17).

**Text & display**
`PRINT` / `?` (`;`, `,` 14-col tabs, `TAB(n)`), `CLS`, `LOCATE`, `PEN`, `PAPER`,
`INK`, `HOME`, `CUP` / `CDOWN` / `CLEFT` / `CRIGHT`, `INC` / `DEC`, `CENTRE`,
`FLASH` / `KEY` / `CLICK` ON|OFF, `HIDE` / `SHOW` (no-ops).

**Input**
`INPUT`, `LINE INPUT`, `INKEY$`, `WAIT KEY`, `WAIT n`, `WAIT VBL`, `SCANCODE`.

**Math**
`ABS INT SGN SQR SIN COS TAN ATN ASIN ACOS HSIN HCOS HTAN EXP LN LOG PI MIN
MAX RND TIMER` and the operators `^ * / MOD + - AND OR XOR NOT`, comparisons,
`TRUE` / `FALSE`. `DEG` / `RAD` are **both** instruction and function (mode
switch alone, conversion with an argument), as in STOS. `FIX n` sets the
printed precision of reals.

**Arrays, strings & system**
`MATCH` (closest match in a sorted 1-D array), `SORT a(0)`, `SWAP x,y`,
`FLIP$`, `INPUT$(n)`, `USING format$;…` (fields `~ # + - . ; ^`, ported
from BASIC.S), `FREE`,
`TIME$`, `DATE$` (readable and assignable), `LANGUAGE`.

**Graphics V2**
`ARC`, `EARC`, `EPIE`, `PIE` (angles in tenths of a degree, 0-3600), `POLYGON`
(filled), `POLYLINE`, `POLYMARK`, `POINT(x,y)`, `CLIP`, `SET LINE`
(mask/thickness), `SET MARK`, `SET PAINT`, `SET PATTERN`, `DIVX`/`DIVY`.

**Text attributes & conversions**
`SCRN(x,y)`, `XCURS`/`YCURS`, `XTEXT`/`YTEXT`/`XGRAPHIC`/`YGRAPHIC`,
`CURS ON|OFF`, `SET CURS top,base`, `INVERSE ON|OFF`, `UNDER ON|OFF`,
`SHADE ON|OFF`, `WRITING 1|2|3`, `SQUARE w,h,x,y[,border]`, `SCROLL` (zone).

**Text windows**
`WINDOPEN n,x,y,tx,ty[,border][,charset]`, `WINDOW`, `QWINDOW`, `WINDMOV`,
`WINDEL`, `WINDON`, `TITLE`, `BORDER`, `CLW`, `SCROLL UP|DOWN|ON|OFF`.
Text coordinates are relative to the active window; borders come from the
original `tbords` table (`borders=unicode|st`). `XCURS`/`YCURS` report the
relative cursor.

**Error handling**
`ON ERROR GOTO line` (`0` disables), `RESUME`, `RESUME NEXT`, `RESUME n`,
`ERRN`, `ERRL` (real values), `BREAK ON|OFF`.

**Memory**
`RESERVE AS SCREEN|DATASCREEN|WORK|DATA|SET n[,length]`, `ERASE n`, `START(n)`,
`LENGTH(n)` (bank length), `PEEK`/`POKE` (byte), `DEEK`/`DOKE` (word),
`LEEK`/`LOKE` (long), `COPY`, `FILL`, `HUNT`, `VARPTR` (variable arena),
`BCOPY`, `BLOAD`/`BSAVE` (storage connector), `BCHG`/`BCLR`/`BSET`/`BTST`,
`ROL`/`ROR`, `ACCLOAD`/`ACCNEW`/`ACCNB`. Emulated banks and 32-bit encoded
addresses; screens exposed as the ST planar layout (`mem=compatible`,
default) or one byte per pixel (`mem=native`).

**Strings**
`CHR$ ASC LEN LEFT$ RIGHT$ MID$ STR$ VAL SPACE$ STRING$ INSTR UPPER$ LOWER$
HEX$ BIN$`.

**Graphics & screens**
`MODE 0/1/2`, `PLOT`, `LINE`, `DRAW` (numeric + turtle), `BOX`, `BAR`, `RBOX`,
`RBAR`, `CIRCLE`, `ELLIPSE`, `PAINT`, `SCREEN SWAP`, `SCREEN COPY`,
`AUTOBACK`, `RESERVE AS SCREEN|WORK|DATA|DATASCREEN n`, `START(n)`.
`PLAY` is accepted but **silent**.

---

## 3. Remaining work (131 tokenized forms → error 20)

Grouped by subsystem, not by token table, so it maps to actual work items.

### 3.1 Error handling & language completeness
✅ **Done (iteration 2).** `ON ERROR GOTO`, `RESUME` / `RESUME NEXT` / `RESUME n`,
real `ERRN`/`ERRL`, and `BREAK ON|OFF`.
Still open: `DEF FN name(…)` / `FN name(…)`.

### 3.2 Memory / low-level layer
✅ **Done (iteration 3).** Emulated banks (`RESERVE AS …`, `ERASE`, `START(b)`,
`LENGTH(b)`), encoded 32-bit addresses, both screen models (`mem=compatible`
default / `mem=native`), the `PEEK`/`POKE` family, `COPY`, `FILL`, `HUNT`,
`VARPTR` (variable arena), `BCOPY`, `BLOAD`/`BSAVE` (via the storage
connector), the accessories `ACCLOAD`/`ACCNEW`/`ACCNB` (accepted; no
multi-program support), and the bit/rotate ops
`BCHG`/`BCLR`/`BSET`/`BTST`/`ROL`/`ROR`.
Still at error 20 by design: `BGRAB` (needs program slots) and the bare-metal
instructions `CALL`/`TRAP`/`AREG`/`DREG`/`PSG`.

### 3.3 String & math leftovers
✅ **Done (iteration 1).** `HSIN HCOS HTAN ASIN ACOS`, `MATCH`, `FLIP$`,
`INPUT$`, `SWAP`, `FIX`, `USING`, `FREE`, `TIME$`, `DATE$`, `LANGUAGE`, plus
`SORT` (and `DEG`/`RAD` dual instruction/function).
Still open: `CURRENT` (not in the reference card), and the graphics
`SCREEN$(scrn,x1,y1 TO x2,y2)` / `SCREEN$(scrn,x,y)=a$` (see §3.6).

### 3.4 Text / console (`AsciiBuffer`)
✅ **Done (iteration 5).** `SCRN(x,y)`, `XCURS`/`YCURS`, the
`XTEXT`/`YTEXT`/`XGRAPHIC`/`YGRAPHIC` conversions, `CURS ON|OFF`,
`SET CURS`, `INVERSE`, `UNDER`, `SHADE`, `WRITING 1|2|3`, `SQUARE`, and the
`SCROLL` zone. Two documented approximations: `WRITING 2|3` (OR/XOR) is
emulated on the character cell, and `SHADE` sets a flag with no visual effect
in ASCII.

### 3.5 Windows
✅ **Done (iteration 4).** `WINDOPEN`, `WINDOW`, `QWINDOW`, `WINDMOV`,
`WINDEL`, `WINDON`, `TITLE`, `BORDER`, `CLW`, `SCROLL UP|DOWN|ON|OFF`, with
text coordinates **relative to the active window** and the original border
table (`FENETRE.S` `tbords`, codes 192-253, `borders=unicode|st`).
Still open: named scroll zones (`SCROLL x1,y1 TO x2,y2`), per-window cursor
styles (`SET CURS`, `CURS`), `INVERSE`/`SHADE`/`UNDER`/`WRITING`, `SQUARE`,
`SCRN`, the `*TEXT`/`*GRAPHIC` conversions (see §3.4).

### 3.6 Graphics V2
✅ **Primitives done (iteration 6).** `ARC`, `EARC`, `EPIE`, `PIE`,
`POLYGON` (filled), `POLYLINE`, `POLYMARK`, `POINT(x,y)`, `CLIP`, `SET LINE`
(mask + thickness), `SET MARK`, `SET PAINT`, `SET PATTERN`, `DIVX`, `DIVY`.
Angles are in **tenths of a degree** (0-3600), faithful to `BASIC.S`.
✅ **Palette done (iterations 7–8).** `COLOUR i,$RGB` (statement) and
`COLOUR(i)` (function, masked `$777`), `PALETTE` (list; empty entries are
skipped, values outside `$777` → error 13), `GET PALETTE(n)` (a bank screen's
palette at offset 32000), and the two interrupt animations `SHIFT`/`SHIFT OFF`
(palette-register rotation) and `FADE` (to black / `TO bank` / colour list).
The live palette is read by both console and canvas renderers. Faithful to
`BASIC.S` (`color`/`colorf`/`s`/`fde`/`colshift`) and `SPRITES.S`
(`fade`/`shifter`/`shifton`), Hardware Spec §3.2 (9-bit nibble-aligned words).

✅ **`APPEAR` (iteration 8).** Faithful to `SPRITES.S` (`appear:` + the
80-entry `tappear` table): the source screen is copied to PHYSIC one pixel at
a time, stepping by a stride coprime with 64000 so the image materialises over
~30 rendered frames. Effects 73–80 use even strides and stop early (partial
image), exactly as the original.

Still open: screen effects (`ZOOM`, `REDUCE`, `PACK`, `UNPACK`, `SCREEN` area
copy) and `GRWRITING`.

### 3.7 Sprites & animation
- `SPRITE n,x,y,p`, `UPDATE`, `FREEZE`, `OFF`, `MOVE ON|OFF|X|Y`, `MOVEON`
- `ANIM`, `ANIM FREEZE`, `UNFREEZE`
- `GET SPRITE`, `PUT SPRITE`, `REDRAW`, `PRIORITY`, `LIMIT SPRITE`
- `ZONE`, `SET ZONE`, `RESET ZONE`, `DETECT`, `COLLIDE`
- `X SPRITE`, `Y SPRITE`
- `SYNCHRO O/N/OFF`

> Note: `packages/stas-sprites` already exists — an ASCII **editor** (grid,
> tools, bank, animation, save) — but it is not yet wired to the interpreter as
> a runtime sprite engine. That wiring is the actual gap here.

### 3.8 Sound & music
- `BELL`, `BOOM`, `SHOOT`, `NOISE`
- `MUSIC`, `MUSIC ON|OFF|FREEZE`, `VOICE`, `VOLUME`, `TEMPO`, `TRANSPOSE`,
  `ENVEL`, `PVOICE`
- `PLAY` → make audible (host audio connector)

### 3.9 Mouse & joystick
- `XMOUSE`, `YMOUSE`, `MOUSE KEY`, `CHANGE MOUSE`, `LIMIT MOUSE`
- `FIRE`, `JOY`, `JUP`, `JDOWN`, `JLEFT`, `JRIGHT`
- `HIDE` / `SHOW` → real pointer instead of no-op

### 3.10 Menus
- `MENU ON|OFF|FREEZE`, `MENU$(x,y)`, `MENUS$(…)`
- `MNBAR`, `MNSELECT`, `ON MENU GOTO|OFF|ON`

### 3.11 File I/O & directories
- Channels: `OPEN IN|OUT|R`, `CLOSE`, `PRINT #`, `INPUT #`, `LINE INPUT #`,
  `GET`, `PUT`, `FIELD … AS`
- Tests: `LOF`, `EOF`, `POF`, `PORT`, `INPUT$(#ch,n)`
- Directories: `DIR`, `DIR/W`, `DIR FIRST$`, `DIR NEXT$`, `DFREE`, `DRIVE`,
  `DRIVE$`, `DRVMAP`, `PREVIOUS`, `FILESELECTOR$`
- `KILL`, `RENAME`, `MKDIR`, `RMDIR`
- `FLOAD`, `FSAVE`, `MERGE`
  *(SAVE/LOAD already work through the connector)*

### 3.12 Editor / direct commands
- `AUTO`, `RENUM`, `CHANGE`, `SEARCH`, `GRAB`, `MERGE`, `MULTI`, `FULL`,
  `UNNEW`, `CONT`, `RESET`, `ENV`, `HEXA`, `LOWER`, `UPPER`
- `LISTBANK`, `LLIST`, `LDIR`, `LPRINT`, `HARDCOPY`, `WINDCOPY`, `COPY`
- Keyboard: `KEYLIST`, `KEY SPEED`, `CLEAR KEY`, `PUTKEY`, `FREQUENCY`

### 3.13 Printer
- `LPRINT`, `LLIST`, `LDIR`, `LISTBANK`, `HARDCOPY`, `WINDCOPY` (screen dump)

---

## 4. Manual entries with no token

- `PACK scr,bnk`
- `UNPACK bnk,scr`

These are the only reference-card commands the tokenizer does not recognize;
they currently fall through as a syntax error rather than error 20.

---

## 5. Partial implementations / known deviations

These features *run* but do not match the manual exactly:

- **`DEG` / `RAD`** now behave both ways, as in STOS: alone they switch the
  trigonometric mode, with an argument they convert the angle.
- **`USING`** is a faithful port of the 1987 routine (`ssprint`/`using1`/
  `using50` in `BASIC.S`): string fields are `~` (one character each, a space
  once the string is exhausted), digits `#` are consumed right-to-left for the
  integer part, `;` emits a space, and `^` copies the value's exponent or
  fabricates `E+000`. As in the original, **one expression is formatted per
  `USING`**; the rest of the list prints normally.
- **`INPUT$(n)`** is resolved once per statement *before* the synchronous
  evaluator runs (each occurrence is read and substituted in place), so it now
  works inside any expression. A branch of `IF` that is not taken is never
  read — the scan stops at `:`, `ELSE` and `THEN`.
- **`LENGTH`** was repointed from string length to **bank** length; `LEN(a$)`
  remains the string length (faithful to the reference card).
- **Screen memory** exposes the Atari ST planar layout by default
  (`mem=compatible`); `mem=native` gives the simpler one-byte-per-pixel view.
- **`VARPTR`** allocates each variable in the flat RAM: integers as 4 bytes,
  reals as 8-byte big-endian IEEE doubles, strings with the 2-byte length
  before the first character (`DEEK(VARPTR(A$)-2)`). Writes through the
  address update the variable (arena sync).
- **`ERRN` / `ERRL`** always return 0 — they need the error state once
  `ON ERROR` exists.
- **`COLOUR` / `PALETTE`** act on the 16 hardware palette registers (9-bit
  `$RGB`, nibble-aligned). The default palette is the Atari GEM/TOS one
  (0 = white … 15 = black), matching *"STOS outputs white text on a black
  background"*. In medium res the hardware shows only the first 4 entries and
  in mono the palette is bypassed, but all 16 registers are kept — exactly as
  `BASIC.S`. Palette 0's border role in multi-plane modes is not drawn by the
  console/canvas renderers.
- **`FADE` / `SHIFT`** are interrupt-driven in the STOS; here they run on the
  interpreter's *tick* (every 1024 statements and during `WAIT`), advancing the
  palette one step every `speed` frames (1 frame = 20 ms). The observable
  result for a BASIC program is the same.
- **`PLAY`** parses its arguments but produces no sound.
- **`FLASH` / `KEY` / `CLICK` ON|OFF** and **`HIDE` / `SHOW`** are no-ops.
- **`IF … THEN … ELSE`** single-line only (no multi-line blocks) — by design.
- **`CLS`** supports the base form only; `CLS ser`, `CLS ser,col` and the
  rectangular `CLS ser,col,x1,y1 TO x2,y2` variants are absent.
- **`INPUT`** does not support the `"text",delay` timeout form.
- **`DATA`** containing a raw keyword (`data wend`) can confuse the structure
  scan.
- **`LIST`** detokenizer cosmetic glues (`T mod 3` → `Tmod`).
- **`SAVE` / `LOAD`** exist through the storage connector; the file-selector
  variants (`FLOAD`/`FSAVE`) do not.

---

## 6. Suggested order of attack

Ranked by value ÷ effort, assuming the console/canvas target:

0. ✅ **Done (iteration 3)** — memory layer (§3.2).
1. ✅ **Done (iteration 1)** — cheap language completeness: `HSIN HCOS HTAN
   ASIN ACOS`, `MATCH`, `FLIP$`, `INPUT$`, `SWAP`, `FIX`, `USING`, `FREE`,
   `TIME$`, `DATE$`, `LANGUAGE`, `SORT`, `DEG`/`RAD` dual.
2. ✅ **Done (iteration 2)** — error handling: `ON ERROR GOTO` + `RESUME*`,
   real `ERRN`/`ERRL`, `BREAK ON|OFF` toggle. (`DEF FN` still open.)
3. ✅ **Done (iteration 5)** — text/console fidelity: `SCRN`, cursor and
   coordinate conversions, `INVERSE`/`UNDER`/`SHADE`/`WRITING`, `SQUARE`.
4. ◑ **Primitives + palette done (iterations 6–8)** — Graphics V2: arcs/pies,
   `POLYGON`/`POLYLINE`/`POLYMARK`, `POINT`, `CLIP`, `SET LINE`/`MARK`/`PAINT`,
   `DIVX`/`DIVY`, `COLOUR`/`PALETTE`/`GET PALETTE`/`SHIFT`/`FADE`, `APPEAR`.
   (Screen effects still open.)
5. ✅ **Done (iteration 4)** — text windows (borders, relative coordinates,
   activation).
6. **Sprite runtime** — wire `stas-sprites` to `SPRITE`/`MOVE`/`ANIM`/
   `PUT`/`GET`/`ZONE`/`COLLIDE`.
7. **Sound** — a host audio connector (console + browser) for
   `PLAY`/`BELL`/`MUSIC`/`VOICE`/`VOLUME`.
8. **Menus** — `MENU` system.
9. **Mouse/joystick hosts** — browser + console providers.
10. **File I/O & directories** — likely rides on the AWI `ConnectorStas`.
11. **Editor direct commands** — `AUTO`, `RENUM`, `SEARCH`, `CHANGE`, `GRAB`,
    `MERGE`, `HEXA`, `LOWER`/`UPPER`.
12. **Printer** — `LPRINT`/`HARDCOPY`/`WINDCOPY`.
13. **Permanent error 20 (by design):** `CALL`, `TRAP`, `AREG`, `DREG`, `PSG`
    — no meaning without a 68000.

---

*Generated from the source tables; counts verified against a script that diffs
`KEYWORDS` against the four dispatch maps.*
