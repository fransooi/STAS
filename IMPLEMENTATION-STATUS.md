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
| Implemented (handler present) | **142** |
| Tokenized, **not** implemented → error 20 | **199** |
| Manual entries **not tokenized at all** | **2** |

Of the 142 "implemented" forms, 7 are pure structural markers (`TO`, `STEP`,
`THEN`, `NEXT`, `WEND`, `UNTIL`, `ELSE`), leaving **≈ 135 distinct STOS
features that actually run today**.

> Iteration 1 (§3.3 "cheap wins") landed: the count moved from 124 → **142**
implemented (217 → 199 missing).

**The token table is *almost* complete:** only **`PACK`** and **`UNPACK`**
(screen pack/unpack) from the reference card have no token. Everything else is
at least recognized — the difference between STAS and STOS is in the dispatch
tables, not the tokenizer.

---

## 2. Implemented today (142 forms)

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
`FLIP$`, `INPUT$(n)`, `USING format$;…` (fields `! # + - . ; ^`), `FREE`,
`TIME$`, `DATE$` (readable and assignable), `LANGUAGE`.

**Strings**
`CHR$ ASC LEN LEFT$ RIGHT$ MID$ STR$ VAL SPACE$ STRING$ INSTR UPPER$ LOWER$
HEX$ BIN$`.

**Graphics & screens**
`MODE 0/1/2`, `PLOT`, `LINE`, `DRAW` (numeric + turtle), `BOX`, `BAR`, `RBOX`,
`RBAR`, `CIRCLE`, `ELLIPSE`, `PAINT`, `SCREEN SWAP`, `SCREEN COPY`,
`AUTOBACK`, `RESERVE AS SCREEN|WORK|DATA|DATASCREEN n`, `START(n)`.
`PLAY` is accepted but **silent**.

---

## 3. Remaining work (199 tokenized forms → error 20)

Grouped by subsystem, not by token table, so it maps to actual work items.

### 3.1 Error handling & language completeness
- `ON ERROR GOTO line`, `RESUME`, `RESUME NEXT` *(and `RESUME n`)*
- `DEF FN name(…)` / `FN name(…)`
- `ERN`/`ERRL`: currently **stubs returning 0** (`instructions.js` L922-923)
- `BREAK ON|OFF`: the token currently *raises* break error 17; the Ctrl-C
  toggle of the manual is not implemented

### 3.2 Memory / low-level layer
- `PEEK`, `DEEK`, `LEEK`, `POKE`, `DOKE`, `LOKE`
- `COPY`, `FILL`, `HUNT`, `VARPTR`
- `BCHG`, `BCLR`, `BSET`, `BTST`, `ROL`, `ROR`
- Bank/accessory: `BLOAD`, `BSAVE`, `BGRAB`, `BCOPY`, `ACCLOAD`, `ACCNEW`, `ACCNB`
- Bare-metal, likely permanent error 20: `CALL`, `TRAP`, `AREG`, `DREG`, `PSG`

### 3.3 String & math leftovers
✅ **Done (iteration 1).** `HSIN HCOS HTAN ASIN ACOS`, `MATCH`, `FLIP$`,
`INPUT$`, `SWAP`, `FIX`, `USING`, `FREE`, `TIME$`, `DATE$`, `LANGUAGE`, plus
`SORT` (and `DEG`/`RAD` dual instruction/function).
Still open: `CURRENT` (not in the reference card), and the graphics
`SCREEN$(scrn,x1,y1 TO x2,y2)` / `SCREEN$(scrn,x,y)=a$` (see §3.6).

### 3.4 Text / console (`AsciiBuffer`)
- `SCRN(x,y)`
- `XCURS`, `YCURS`, `XTEXT`, `YTEXT`, `XGRAPHIC`, `YGRAPHIC`
- `CURS` (CURSOR ON/OFF), `SET CURS top,base`
- `INVERSE ON|OFF`, `SHADE ON|OFF`, `UNDER ON|OFF`, `WRITING effect`
- `SQUARE w,h,x,y,border`

### 3.5 Windows
- `WINDOPEN`, `WINDOW`, `QWINDOW`, `WINDEL`, `WINDMOV`, `WINDON`
- `TITLE`, `BORDER`, `CLW`
- `SCROLL DOWN`, `SCROLL UP`, `SCROLL ON|OFF`, scroll zones

### 3.6 Graphics V2
- Primitives: `ARC`, `EARC`, `EPIE`, `PIE`, `POLYGON`, `POLYLINE`, `POLYMARK`
- `POINT(x,y)`
- `CLIP`
- Styles: `SET LINE`, `SET MARK`, `SET PATTERN`, `SET PAINT`, `GRWRITING`
- `DIVX`, `DIVY`
- Colour: `COLOUR index,$RGB` / `COLOUR(index)`, `PALETTE`, `GET PALETTE`,
  `FADE`, `SHIFT`
- Screens: `APPEAR`, `ZOOM`, `REDUCE`, `PACK`, `UNPACK` *(last two not even
  tokenized)*, `SCREEN` area copy

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
- **`USING`** implements the documented field characters (`! # + - . ; ^`) as
  a best-effort reading of the OCR'd manual; unusual combinations may differ
  from the 1988 original.
- **`INPUT$(n)`** is resolved once per statement *before* the synchronous
  evaluator runs (each occurrence is read and substituted in place), so it now
  works inside any expression. A branch of `IF` that is not taken is never
  read — the scan stops at `:`, `ELSE` and `THEN`.
- **`ERRN` / `ERRL`** always return 0 — they need the error state once
  `ON ERROR` exists.
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

1. ✅ **Done (iteration 1)** — cheap language completeness: `HSIN HCOS HTAN
   ASIN ACOS`, `MATCH`, `FLIP$`, `INPUT$`, `SWAP`, `FIX`, `USING`, `FREE`,
   `TIME$`, `DATE$`, `LANGUAGE`, `SORT`, `DEG`/`RAD` dual.
2. **Error handling** — `ON ERROR GOTO` + `RESUME*`, then make `ERRN`/`ERRL`
   real; `BREAK ON|OFF` toggle.
3. **Text/console fidelity** — `SCRN`, `XCURS`/`YCURS`, `*TEXT`/`*GRAPHIC`
   conversions, `INVERSE`, `SHADE`, `UNDER`, `SQUARE`.
4. **Graphics V2 primitives & styles** — `ARC`/`EARC`/`EPIE`/`PIE`,
   `POLYGON`/`POLYLINE`/`POLYMARK`, `POINT`, `CLIP`, `SET LINE`/`MARK`/
   `PATTERN`, `DIVX`/`DIVY`, colour/palette commands.
5. **Windows + scroll zones** — the last big block of text-side behaviour.
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
