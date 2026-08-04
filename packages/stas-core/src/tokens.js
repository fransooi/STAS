/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Table des tokens — fidèle à BASIC.S L525-L694.
 *
 *  Codage STOS (octets) → représentation STAS (JS) :
 *    - instruction simple $80-$B7      → { code }
 *    - fonction simple    $B9-$E9      → { code }
 *    - instruction étendue $A0 + sub   → { code: 0xA0, sub }
 *    - fonction étendue   $B8 + sub    → { code: 0xB8, sub }
 *    - variable                        → { code: 0xFA, name }
 *    - constante binaire  $FB          → { code: 0xFB, value }
 *    - constante chaîne   $FC          → { code: 0xFC, value }
 *    - constante hexa     $FD          → { code: 0xFD, value }
 *    - constante entière  $FE          → { code: 0xFE, value }
 *    - constante float    $FF          → { code: 0xFF, value }
 *    - ASCII brut ( ) , ; : etc.       → { code: charCode }
 *  --------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Codes symboliques
// ---------------------------------------------------------------------------
export const T = {
  // --- Structure de contrôle ($80-$9F)
  TO: 0x80, STEP: 0x81, NEXT: 0x82, WEND: 0x83, UNTIL: 0x84, DIM: 0x85,
  POKE: 0x86, DOKE: 0x87, LOKE: 0x88, READ: 0x89, REM: 0x8a, RETURN: 0x8b,
  POP: 0x8c, RESUME_NEXT: 0x8d, RESUME: 0x8e, ON_ERROR: 0x8f,
  SCREEN_COPY: 0x90, SWAP: 0x91, PLOT: 0x92, PIE: 0x93, DRAW: 0x94,
  POLYLINE: 0x95, POLYMARK: 0x96, LINE: 0x97,
  GOTO: 0x98, GOSUB: 0x99, THEN: 0x9a, ELSE: 0x9b, RESTORE: 0x9c,
  FOR: 0x9d, WHILE: 0x9e, REPEAT: 0x9f,
  // --- Instructions ($A0-$B7)
  PRINT: 0xa1, IF: 0xa2, UPDATE: 0xa3, SPRITE: 0xa4, FREEZE: 0xa5,
  OFF: 0xa6, ON: 0xa7, EXT_INST: 0xa8, LOCATE: 0xa9, PAPER: 0xaa,
  PEN: 0xab, HOME: 0xac, DOT_B: 0xad, DOT_W: 0xae, DOT_L: 0xaf,
  CUP: 0xb0, CDOWN: 0xb1, CLEFT: 0xb2, CRIGHT: 0xb3, CLS: 0xb4,
  INC: 0xb5, DEC: 0xb6, SCREEN_SWAP: 0xb7,
  // --- Fonctions simples ($B9-$E9)
  PSG: 0xb9, SCRN: 0xba, DREG: 0xbb, AREG: 0xbc, POINT: 0xbd,
  DRIVES: 0xbe, DIRS: 0xbf,
  ABS: 0xc1, COLOUR: 0xc2, FKEY: 0xc3, SIN: 0xc4, COS: 0xc5,
  DRIVE: 0xc6, TIMER: 0xc7, LOGIC: 0xc8, FN: 0xc9, NOT: 0xca,
  RND: 0xcb, VAL: 0xcc, ASC: 0xcd, CHR: 0xce, INKEY: 0xcf,
  SCANCODE: 0xd0, MID: 0xd1, RIGHT: 0xd2, LEFT: 0xd3, LENGTH: 0xd4,
  START: 0xd5, LEN: 0xd6, PI: 0xd7, PEEK: 0xd8, DEEK: 0xd9,
  LEEK: 0xda, ZONE: 0xdb, XSPRITE: 0xdc, YSPRITE: 0xdd,
  XMOUSE: 0xde, YMOUSE: 0xdf, MOUSEKEY: 0xe0, PHYSIC: 0xe1,
  BACK: 0xe2, LOG: 0xe3, POF: 0xe4, MODE: 0xe5, TIMES: 0xe6,
  DATES: 0xe7, SCREENS: 0xe8, DEFAULT: 0xe9,
  // --- Opérateurs ($EA-$F9) — ordre = priorité croissante
  XOR: 0xeb, OR: 0xec, AND: 0xed,
  DIFF: 0xee, INFEG: 0xef, SUPEG: 0xf0, EGAL: 0xf1, INF: 0xf2, SUP: 0xf3,
  PLUS: 0xf4, MOINS: 0xf5, MOD: 0xf6, MULT: 0xf7, DIV: 0xf8, PUISS: 0xf9,
  // --- Constantes / variables
  VARIABLE: 0xfa, BINAIRE: 0xfb, ALPHA: 0xfc, HEXA: 0xfd,
  ENTIER: 0xfe, FLOAT: 0xff,
  // --- Préfixes
  ETENDU: 0xa0,    // préfixe instructions étendues
  EXT_FUNC: 0xb8,  // préfixe fonctions étendues
};

// ---------------------------------------------------------------------------
// Instructions étendues : sous-codes du préfixe $A0
// ---------------------------------------------------------------------------
export const SUB = {
  // Commandes directes ($00-$1F)
  LISTBANK: 0x00, LLISTBANK: 0x01, FOLLOW: 0x02, FREQUENCY: 0x03,
  CONT: 0x04, CHANGE: 0x05, SEARCH: 0x06, DELETE: 0x07, MERGE: 0x08,
  AUTO: 0x09, NEW: 0x0a, UNNEW: 0x0b, FLOAD: 0x0c, FSAVE: 0x0d,
  RESET: 0x0e, SYSTEM: 0x0f, ENV: 0x10, RENUM: 0x11, MULTI: 0x12,
  FULL: 0x13, GRAB: 0x14, LIST: 0x15, LLIST: 0x16, HEXA: 0x17,
  ACCLOAD: 0x19, ACCNEW: 0x1a, LOWER: 0x1b, UPPER: 0x1c,
  ENGLISH: 0x1d, FRANCAIS: 0x1e,
  // Instructions étendues ($70-$FF)
  DIRW: 0x70, FADE: 0x71, BCOPY: 0x72, SQUARE: 0x73, PREVIOUS: 0x74,
  TRANSPOSE: 0x75, SHIFT: 0x76, WAITKEY: 0x77, DIR: 0x78, LDIR: 0x79,
  BLOAD: 0x7a, BSAVE: 0x7b, QWINDOW: 0x7c, ASSET: 0x7d, CHARCOPY: 0x7e,
  UNDER: 0x7f, MENUS: 0x80, MENU: 0x81, TITLE: 0x82, BORDER: 0x83,
  HARDCOPY: 0x84, WINDCOPY: 0x85, REDRAW: 0x86, CENTRE: 0x87,
  TEMPO: 0x88, VOLUME: 0x89, ENVEL: 0x8a, BOOM: 0x8b, SHOOT: 0x8c,
  BELL: 0x8d, PLAY: 0x8e, NOISE: 0x8f, VOICE: 0x90, MUSIC: 0x91,
  BOX: 0x92, RBOX: 0x93, BAR: 0x94, RBAR: 0x95, APPEAR: 0x96,
  BCLR: 0x97, BSET: 0x98, ROL: 0x99, ROR: 0x9a, CURS: 0x9b,
  CLW: 0x9c, BCHG: 0x9d, CALL: 0x9e, TRAP: 0x9f,
  RUN: 0xa1, CLEARKEY: 0xa2, LINEINPUT: 0xa3, INPUT: 0xa4,
  CLEAR: 0xa5, DATA: 0xa6, END: 0xa7, ERASE: 0xa8, RESERVE: 0xa9,
  AS_DATASCREEN: 0xaa, AS_WORK: 0xab, AS_SCREEN: 0xac, AS_DATA: 0xad,
  COPY: 0xae, DEF: 0xaf, HIDE: 0xb0, SHOW: 0xb1, CHGMOUSE: 0xb2,
  LIMOUSE: 0xb3, MOUVEX: 0xb4, MOUVEY: 0xb5, FIX: 0xb6, BGRAB: 0xb7,
  FILL: 0xb9, KEYLIST: 0xba, KEYSPEED: 0xbb, MOVE: 0xbc, ANIM: 0xbd,
  UNFREEZE: 0xbe, SETZONE: 0xbf, RESZONE: 0xc0, LIMSPRITE: 0xc1,
  PRIORITY: 0xc2, REDUCE: 0xc3, PUTSPRITE: 0xc4, GETSPRITE: 0xc5,
  LOAD: 0xc6, SAVE: 0xc7, PALETTE: 0xc8, SYNCHRO: 0xc9, ERROR: 0xca,
  BREAK: 0xcb, LET: 0xcc, KEY: 0xcd, OPENIN: 0xce, OPENOUT: 0xcf,
  OPEN: 0xd0, CLOSE: 0xd1, FIELD: 0xd2, AS: 0xd3, PUTKEY: 0xd4,
  GETPALETTE: 0xd5, KILL: 0xd6, RENAME: 0xd7, RMDIR: 0xd8,
  MKDIR: 0xd9, STOP: 0xda, WAITVBL: 0xdb, SORT: 0xdc, GET: 0xdd,
  FLASH: 0xde, USING: 0xdf, LPRINT: 0xe0, AUTOBACK: 0xe1,
  SETLINE: 0xe2, SETWRITE: 0xe3, SETMARK: 0xe4, SETPAINT: 0xe5,
  SETPATTERN: 0xe7, CLIP: 0xe8, ARC: 0xe9, POLYGON: 0xea,
  CIRCLE: 0xeb, EARC: 0xec, EPIE: 0xed, ELLIPSE: 0xee, WRITING: 0xef,
  PAINT: 0xf0, INK: 0xf1, WAIT: 0xf2, CLICK: 0xf3, PUT: 0xf4,
  ZOOM: 0xf5, SETCURS: 0xf6, SCROLLDN: 0xf7, SCROLLUP: 0xf8,
  SCROLL: 0xf9, INVERSE: 0xfa, SHADE: 0xfb, WINDOPEN: 0xfc,
  WINDOW: 0xfd, WINDMOV: 0xfe, WINDEL: 0xff,
};

// ---------------------------------------------------------------------------
// Fonctions étendues : sous-codes du préfixe $B8 ($80-$C7)
// ---------------------------------------------------------------------------
export const FSUB = {
  HSIN: 0x80, HCOS: 0x81, HTAN: 0x82, ASIN: 0x83, ACOS: 0x84,
  ATAN: 0x85, UPPERF: 0x86, LOWERF: 0x87, CURRENT: 0x88, MATCH: 0x89,
  ERRN: 0x8a, ERRL: 0x8b, VARPTR: 0x8c, INPUTN: 0x8d, FLIP: 0x8e,
  FREE: 0x8f, STR: 0x90, HEXF: 0x91, BINF: 0x92, STRING: 0x93,
  SPACE: 0x94, INSTR: 0x95, MAX: 0x96, MIN: 0x97, LOF: 0x98,
  EOF: 0x99, DIRFIRST: 0x9a, DIRNEXT: 0x9b, BTST: 0x9c, COLLIDE: 0x9d,
  ACCNB: 0x9e, LANGUAGE: 0x9f, HUNT: 0xa1, TRUE: 0xa2, FALSE: 0xa3,
  XCURS: 0xa4, YCURS: 0xa5, JUP: 0xa6, JLEFT: 0xa7, JRIGHT: 0xa8,
  JDOWN: 0xa9, FIRE: 0xaa, JOY: 0xab, MOVON: 0xac, ICON: 0xad,
  TAB: 0xae, EXP: 0xaf, CHARLEN: 0xb0, MNBAR: 0xb1, MNSELECT: 0xb2,
  WINDON: 0xb3, XTEXT: 0xb4, YTEXT: 0xb5, XGRAPHIC: 0xb6, YGRAPHIC: 0xb7,
  SQR: 0xb9, DIVX: 0xba, DIVY: 0xbb, LN: 0xbc, TAN: 0xbd,
  DRVMAP: 0xbe, FSELECTOR: 0xbf, DFREE: 0xc0, SGN: 0xc1, PORT: 0xc2,
  PVOICE: 0xc3, INT: 0xc4, DETECT: 0xc5, DEG: 0xc6, RAD: 0xc7,
};

// ---------------------------------------------------------------------------
// TABLE DU TOKENISEUR — [texte, code, sub?]
// Copie complète des tables de BASIC.S L525-L694.
// Le tokeniseur trie par longueur décroissante (plus long d'abord).
// ---------------------------------------------------------------------------
export const KEYWORDS = [
  // ===== Commandes $80-$B7 =====
  ["to", T.TO], ["step", T.STEP], ["next", T.NEXT], ["wend", T.WEND],
  ["until", T.UNTIL], ["dim", T.DIM], ["poke", T.POKE], ["doke", T.DOKE],
  ["loke", T.LOKE], ["read", T.READ], ["rem", T.REM], ["'", T.REM],
  ["return", T.RETURN], ["pop", T.POP], ["resume next", T.RESUME_NEXT],
  ["resume", T.RESUME], ["on error", T.ON_ERROR],
  ["screen copy", T.SCREEN_COPY], ["swap", T.SWAP], ["plot", T.PLOT],
  ["pie", T.PIE], ["draw", T.DRAW], ["polyline", T.POLYLINE],
  ["polymark", T.POLYMARK], ["line", T.LINE],
  ["goto", T.GOTO], ["gosub", T.GOSUB], ["then", T.THEN], ["else", T.ELSE],
  ["restore", T.RESTORE], ["for", T.FOR], ["while", T.WHILE],
  ["repeat", T.REPEAT],
  ["print", T.PRINT], ["?", T.PRINT], ["if", T.IF], ["update", T.UPDATE],
  ["sprite", T.SPRITE], ["freeze", T.FREEZE], ["off", T.OFF], ["on", T.ON],
  ["locate", T.LOCATE], ["paper", T.PAPER], ["pen", T.PEN], ["home", T.HOME],
  ["cup", T.CUP], ["cdown", T.CDOWN], ["cleft", T.CLEFT], ["cright", T.CRIGHT],
  ["cls", T.CLS], ["inc", T.INC], ["dec", T.DEC], ["screen swap", T.SCREEN_SWAP],

  // ===== Fonctions simples $B9-$E9 =====
  ["psg", T.PSG], ["scrn", T.SCRN], ["dreg", T.DREG], ["areg", T.AREG],
  ["point", T.POINT], ["drive$", T.DRIVES], ["dir$", T.DIRS],
  ["abs", T.ABS], ["colour", T.COLOUR], ["fkey", T.FKEY], ["sin", T.SIN],
  ["cos", T.COS], ["drive", T.DRIVE], ["timer", T.TIMER], ["logic", T.LOGIC],
  ["fn", T.FN], ["not", T.NOT], ["rnd", T.RND], ["val", T.VAL],
  ["asc", T.ASC], ["chr$", T.CHR], ["inkey$", T.INKEY],
  ["scancode", T.SCANCODE], ["mid$", T.MID], ["right$", T.RIGHT],
  ["left$", T.LEFT], ["length", T.LENGTH], ["start", T.START],
  ["len", T.LEN], ["pi", T.PI], ["peek", T.PEEK], ["deek", T.DEEK],
  ["leek", T.LEEK], ["zone", T.ZONE], ["x sprite", T.XSPRITE],
  ["y sprite", T.YSPRITE], ["x mouse", T.XMOUSE], ["y mouse", T.YMOUSE],
  ["mouse key", T.MOUSEKEY], ["physic", T.PHYSIC], ["back", T.BACK],
  ["log", T.LOG], ["pof", T.POF], ["mode", T.MODE], ["time$", T.TIMES],
  ["date$", T.DATES], ["screen$", T.SCREENS], ["default", T.DEFAULT],

  // ===== Opérateurs =====
  ["xor", T.XOR], ["or", T.OR], ["and", T.AND], ["mod", T.MOD],
  ["<>", T.DIFF], ["><", T.DIFF], ["<=", T.INFEG], ["=<", T.INFEG],
  [">=", T.SUPEG], ["=>", T.SUPEG], ["=", T.EGAL], ["<", T.INF],
  [">", T.SUP], ["+", T.PLUS], ["-", T.MOINS], ["*", T.MULT],
  ["/", T.DIV], ["^", T.PUISS],

  // ===== Fonctions étendues (préfixe $B8) =====
  ["hsin", T.EXT_FUNC, FSUB.HSIN], ["hcos", T.EXT_FUNC, FSUB.HCOS],
  ["htan", T.EXT_FUNC, FSUB.HTAN], ["asin", T.EXT_FUNC, FSUB.ASIN],
  ["acos", T.EXT_FUNC, FSUB.ACOS], ["atan", T.EXT_FUNC, FSUB.ATAN],
  ["upper$", T.EXT_FUNC, FSUB.UPPERF], ["lower$", T.EXT_FUNC, FSUB.LOWERF],
  ["current", T.EXT_FUNC, FSUB.CURRENT], ["match", T.EXT_FUNC, FSUB.MATCH],
  ["errn", T.EXT_FUNC, FSUB.ERRN], ["errl", T.EXT_FUNC, FSUB.ERRL],
  ["varptr", T.EXT_FUNC, FSUB.VARPTR], ["input$", T.EXT_FUNC, FSUB.INPUTN],
  ["flip$", T.EXT_FUNC, FSUB.FLIP], ["free", T.EXT_FUNC, FSUB.FREE],
  ["str$", T.EXT_FUNC, FSUB.STR], ["hex$", T.EXT_FUNC, FSUB.HEXF],
  ["bin$", T.EXT_FUNC, FSUB.BINF], ["string$", T.EXT_FUNC, FSUB.STRING],
  ["space$", T.EXT_FUNC, FSUB.SPACE], ["instr", T.EXT_FUNC, FSUB.INSTR],
  ["max", T.EXT_FUNC, FSUB.MAX], ["min", T.EXT_FUNC, FSUB.MIN],
  ["lof", T.EXT_FUNC, FSUB.LOF], ["eof", T.EXT_FUNC, FSUB.EOF],
  ["dir first$", T.EXT_FUNC, FSUB.DIRFIRST],
  ["dir next$", T.EXT_FUNC, FSUB.DIRNEXT],
  ["btst", T.EXT_FUNC, FSUB.BTST], ["collide", T.EXT_FUNC, FSUB.COLLIDE],
  ["accnb", T.EXT_FUNC, FSUB.ACCNB], ["language", T.EXT_FUNC, FSUB.LANGUAGE],
  ["hunt", T.EXT_FUNC, FSUB.HUNT], ["true", T.EXT_FUNC, FSUB.TRUE],
  ["false", T.EXT_FUNC, FSUB.FALSE], ["xcurs", T.EXT_FUNC, FSUB.XCURS],
  ["ycurs", T.EXT_FUNC, FSUB.YCURS], ["jup", T.EXT_FUNC, FSUB.JUP],
  ["jleft", T.EXT_FUNC, FSUB.JLEFT], ["jright", T.EXT_FUNC, FSUB.JRIGHT],
  ["jdown", T.EXT_FUNC, FSUB.JDOWN], ["fire", T.EXT_FUNC, FSUB.FIRE],
  ["joy", T.EXT_FUNC, FSUB.JOY], ["movon", T.EXT_FUNC, FSUB.MOVON],
  ["icon$", T.EXT_FUNC, FSUB.ICON], ["tab", T.EXT_FUNC, FSUB.TAB],
  ["exp", T.EXT_FUNC, FSUB.EXP], ["charlen", T.EXT_FUNC, FSUB.CHARLEN],
  ["mnbar", T.EXT_FUNC, FSUB.MNBAR], ["mnselect", T.EXT_FUNC, FSUB.MNSELECT],
  ["windon", T.EXT_FUNC, FSUB.WINDON], ["xtext", T.EXT_FUNC, FSUB.XTEXT],
  ["ytext", T.EXT_FUNC, FSUB.YTEXT], ["xgraphic", T.EXT_FUNC, FSUB.XGRAPHIC],
  ["ygraphic", T.EXT_FUNC, FSUB.YGRAPHIC], ["sqr", T.EXT_FUNC, FSUB.SQR],
  ["divx", T.EXT_FUNC, FSUB.DIVX], ["divy", T.EXT_FUNC, FSUB.DIVY],
  ["ln", T.EXT_FUNC, FSUB.LN], ["tan", T.EXT_FUNC, FSUB.TAN],
  ["drvmap", T.EXT_FUNC, FSUB.DRVMAP],
  ["file select$", T.EXT_FUNC, FSUB.FSELECTOR],
  ["dfree", T.EXT_FUNC, FSUB.DFREE], ["sgn", T.EXT_FUNC, FSUB.SGN],
  ["port", T.EXT_FUNC, FSUB.PORT], ["pvoice", T.EXT_FUNC, FSUB.PVOICE],
  ["int", T.EXT_FUNC, FSUB.INT], ["detect", T.EXT_FUNC, FSUB.DETECT],
  ["deg", T.EXT_FUNC, FSUB.DEG], ["rad", T.EXT_FUNC, FSUB.RAD],

  // ===== Instructions étendues (préfixe $A0) =====
  ["dir/w", T.ETENDU, SUB.DIRW], ["fade", T.ETENDU, SUB.FADE],
  ["bcopy", T.ETENDU, SUB.BCOPY], ["square", T.ETENDU, SUB.SQUARE],
  ["previous", T.ETENDU, SUB.PREVIOUS], ["transpose", T.ETENDU, SUB.TRANSPOSE],
  ["shift", T.ETENDU, SUB.SHIFT], ["wait key", T.ETENDU, SUB.WAITKEY],
  ["dir", T.ETENDU, SUB.DIR], ["ldir", T.ETENDU, SUB.LDIR],
  ["bload", T.ETENDU, SUB.BLOAD], ["bsave", T.ETENDU, SUB.BSAVE],
  ["qwindow", T.ETENDU, SUB.QWINDOW], ["as set", T.ETENDU, SUB.ASSET],
  ["charcopy", T.ETENDU, SUB.CHARCOPY], ["under", T.ETENDU, SUB.UNDER],
  ["menu$", T.ETENDU, SUB.MENUS], ["menu", T.ETENDU, SUB.MENU],
  ["title", T.ETENDU, SUB.TITLE], ["border", T.ETENDU, SUB.BORDER],
  ["hardcopy", T.ETENDU, SUB.HARDCOPY], ["windcopy", T.ETENDU, SUB.WINDCOPY],
  ["redraw", T.ETENDU, SUB.REDRAW], ["centre", T.ETENDU, SUB.CENTRE],
  ["tempo", T.ETENDU, SUB.TEMPO], ["volume", T.ETENDU, SUB.VOLUME],
  ["envel", T.ETENDU, SUB.ENVEL], ["boom", T.ETENDU, SUB.BOOM],
  ["shoot", T.ETENDU, SUB.SHOOT], ["bell", T.ETENDU, SUB.BELL],
  ["play", T.ETENDU, SUB.PLAY], ["noise", T.ETENDU, SUB.NOISE],
  ["voice", T.ETENDU, SUB.VOICE], ["music", T.ETENDU, SUB.MUSIC],
  ["box", T.ETENDU, SUB.BOX], ["rbox", T.ETENDU, SUB.RBOX],
  ["bar", T.ETENDU, SUB.BAR], ["rbar", T.ETENDU, SUB.RBAR],
  ["appear", T.ETENDU, SUB.APPEAR], ["bclr", T.ETENDU, SUB.BCLR],
  ["bset", T.ETENDU, SUB.BSET], ["rol", T.ETENDU, SUB.ROL],
  ["ror", T.ETENDU, SUB.ROR], ["curs", T.ETENDU, SUB.CURS],
  ["clw", T.ETENDU, SUB.CLW], ["bchg", T.ETENDU, SUB.BCHG],
  ["call", T.ETENDU, SUB.CALL], ["trap", T.ETENDU, SUB.TRAP],
  ["run", T.ETENDU, SUB.RUN], ["clear key", T.ETENDU, SUB.CLEARKEY],
  ["line input", T.ETENDU, SUB.LINEINPUT], ["input", T.ETENDU, SUB.INPUT],
  ["clear", T.ETENDU, SUB.CLEAR], ["data", T.ETENDU, SUB.DATA],
  ["end", T.ETENDU, SUB.END], ["erase", T.ETENDU, SUB.ERASE],
  ["reserve", T.ETENDU, SUB.RESERVE],
  ["as datascreen", T.ETENDU, SUB.AS_DATASCREEN],
  ["as work", T.ETENDU, SUB.AS_WORK], ["as screen", T.ETENDU, SUB.AS_SCREEN],
  ["as data", T.ETENDU, SUB.AS_DATA], ["copy", T.ETENDU, SUB.COPY],
  ["def", T.ETENDU, SUB.DEF], ["hide", T.ETENDU, SUB.HIDE],
  ["show", T.ETENDU, SUB.SHOW], ["change mouse", T.ETENDU, SUB.CHGMOUSE],
  ["limit mouse", T.ETENDU, SUB.LIMOUSE], ["move x", T.ETENDU, SUB.MOUVEX],
  ["move y", T.ETENDU, SUB.MOUVEY], ["fix", T.ETENDU, SUB.FIX],
  ["bgrab", T.ETENDU, SUB.BGRAB], ["fill", T.ETENDU, SUB.FILL],
  ["key list", T.ETENDU, SUB.KEYLIST], ["key speed", T.ETENDU, SUB.KEYSPEED],
  ["move", T.ETENDU, SUB.MOVE], ["anim", T.ETENDU, SUB.ANIM],
  ["unfreeze", T.ETENDU, SUB.UNFREEZE], ["set zone", T.ETENDU, SUB.SETZONE],
  ["reset zone", T.ETENDU, SUB.RESZONE],
  ["limit sprite", T.ETENDU, SUB.LIMSPRITE],
  ["priority", T.ETENDU, SUB.PRIORITY], ["reduce", T.ETENDU, SUB.REDUCE],
  ["put sprite", T.ETENDU, SUB.PUTSPRITE],
  ["get sprite", T.ETENDU, SUB.GETSPRITE], ["load", T.ETENDU, SUB.LOAD],
  ["save", T.ETENDU, SUB.SAVE], ["palette", T.ETENDU, SUB.PALETTE],
  ["synchro", T.ETENDU, SUB.SYNCHRO], ["error", T.ETENDU, SUB.ERROR],
  ["break", T.ETENDU, SUB.BREAK], ["let", T.ETENDU, SUB.LET],
  ["key", T.ETENDU, SUB.KEY], ["open in", T.ETENDU, SUB.OPENIN],
  ["open out", T.ETENDU, SUB.OPENOUT], ["open", T.ETENDU, SUB.OPEN],
  ["close", T.ETENDU, SUB.CLOSE], ["field", T.ETENDU, SUB.FIELD],
  ["as", T.ETENDU, SUB.AS], ["put key", T.ETENDU, SUB.PUTKEY],
  ["get palette", T.ETENDU, SUB.GETPALETTE], ["kill", T.ETENDU, SUB.KILL],
  ["rename", T.ETENDU, SUB.RENAME], ["rm dir", T.ETENDU, SUB.RMDIR],
  ["mk dir", T.ETENDU, SUB.MKDIR], ["stop", T.ETENDU, SUB.STOP],
  ["wait vbl", T.ETENDU, SUB.WAITVBL], ["sort", T.ETENDU, SUB.SORT],
  ["get", T.ETENDU, SUB.GET], ["flash", T.ETENDU, SUB.FLASH],
  ["using", T.ETENDU, SUB.USING], ["lprint", T.ETENDU, SUB.LPRINT],
  ["auto back", T.ETENDU, SUB.AUTOBACK], ["autoback", T.ETENDU, SUB.AUTOBACK], ["set line", T.ETENDU, SUB.SETLINE],
  ["gr writing", T.ETENDU, SUB.SETWRITE], ["set mark", T.ETENDU, SUB.SETMARK],
  ["set paint", T.ETENDU, SUB.SETPAINT],
  ["set pattern", T.ETENDU, SUB.SETPATTERN], ["clip", T.ETENDU, SUB.CLIP],
  ["arc", T.ETENDU, SUB.ARC], ["polygon", T.ETENDU, SUB.POLYGON],
  ["circle", T.ETENDU, SUB.CIRCLE], ["earc", T.ETENDU, SUB.EARC],
  ["epie", T.ETENDU, SUB.EPIE], ["ellipse", T.ETENDU, SUB.ELLIPSE],
  ["writing", T.ETENDU, SUB.WRITING], ["paint", T.ETENDU, SUB.PAINT],
  ["ink", T.ETENDU, SUB.INK], ["wait", T.ETENDU, SUB.WAIT],
  ["click", T.ETENDU, SUB.CLICK], ["put", T.ETENDU, SUB.PUT],
  ["zoom", T.ETENDU, SUB.ZOOM], ["set curs", T.ETENDU, SUB.SETCURS],
  ["scroll down", T.ETENDU, SUB.SCROLLDN], ["scroll up", T.ETENDU, SUB.SCROLLUP],
  ["scroll", T.ETENDU, SUB.SCROLL], ["inverse", T.ETENDU, SUB.INVERSE],
  ["shade", T.ETENDU, SUB.SHADE], ["windopen", T.ETENDU, SUB.WINDOPEN],
  ["window", T.ETENDU, SUB.WINDOW], ["windmove", T.ETENDU, SUB.WINDMOV],
  ["windel", T.ETENDU, SUB.WINDEL],

  // ===== Commandes directes (préfixe $A0, sub < $20) =====
  ["listbank", T.ETENDU, SUB.LISTBANK], ["llistbank", T.ETENDU, SUB.LLISTBANK],
  ["follow", T.ETENDU, SUB.FOLLOW], ["frequency", T.ETENDU, SUB.FREQUENCY],
  ["cont", T.ETENDU, SUB.CONT], ["change", T.ETENDU, SUB.CHANGE],
  ["search", T.ETENDU, SUB.SEARCH], ["delete", T.ETENDU, SUB.DELETE],
  ["merge", T.ETENDU, SUB.MERGE], ["auto", T.ETENDU, SUB.AUTO],
  ["new", T.ETENDU, SUB.NEW], ["unnew", T.ETENDU, SUB.UNNEW],
  ["fload", T.ETENDU, SUB.FLOAD], ["fsave", T.ETENDU, SUB.FSAVE],
  ["reset", T.ETENDU, SUB.RESET], ["system", T.ETENDU, SUB.SYSTEM],
  ["env", T.ETENDU, SUB.ENV], ["renum", T.ETENDU, SUB.RENUM],
  ["multi", T.ETENDU, SUB.MULTI], ["full", T.ETENDU, SUB.FULL],
  ["grab", T.ETENDU, SUB.GRAB], ["list", T.ETENDU, SUB.LIST],
  ["llist", T.ETENDU, SUB.LLIST], ["hexa", T.ETENDU, SUB.HEXA],
  ["accload", T.ETENDU, SUB.ACCLOAD], ["accnew", T.ETENDU, SUB.ACCNEW],
  ["lower", T.ETENDU, SUB.LOWER], ["upper", T.ETENDU, SUB.UPPER],
  ["english", T.ETENDU, SUB.ENGLISH], ["francais", T.ETENDU, SUB.FRANCAIS],
];

// Table triée une seule fois : mots-clés les plus longs d'abord.
export const KEYWORDS_SORTED = [...KEYWORDS].sort((a, b) => b[0].length - a[0].length);

// ---------------------------------------------------------------------------
// Tables inverses pour le LIST (détokenisation)
// ---------------------------------------------------------------------------
export const CODE_TO_TEXT = new Map();   // code → texte canonique
export const EXT_TO_TEXT = new Map();    // "A0:xx" → texte
export const FEXT_TO_TEXT = new Map();   // "B8:xx" → texte

for (const [text, code, sub] of KEYWORDS) {
  if (text === "'" || text === "?") continue; // formes alternatives
  if (text === "><" || text === "=<" || text === "=>") continue;
  if (sub !== undefined) {
    const map = code === T.ETENDU ? EXT_TO_TEXT : FEXT_TO_TEXT;
    const key = `${code.toString(16)}:${sub.toString(16)}`;
    if (!map.has(key)) map.set(key, text);
  } else if (!CODE_TO_TEXT.has(code)) {
    CODE_TO_TEXT.set(code, text);
  }
}

/** Texte canonique d'un token (pour LIST) */
export function tokenText(tok) {
  if (tok.sub !== undefined) {
    const map = tok.code === T.ETENDU ? EXT_TO_TEXT : FEXT_TO_TEXT;
    return map.get(`${tok.code.toString(16)}:${tok.sub.toString(16)}`) ?? "?";
  }
  switch (tok.code) {
    case T.VARIABLE: return tok.name;
    case T.ALPHA: return `"${tok.value}"`;
    case T.ENTIER: return String(tok.value);
    case T.FLOAT: return String(tok.value);
    case T.HEXA: return "$" + tok.value.toString(16).toUpperCase();
    case T.BINAIRE: return "%" + tok.value.toString(2);
    default: {
      const t = CODE_TO_TEXT.get(tok.code);
      if (t) return t;
      if (tok.code < 0x80) return String.fromCharCode(tok.code);
      return "?";
    }
  }
}
