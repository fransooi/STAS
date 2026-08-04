/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Erreurs BASIC — fidèle à la table "merreur" de BASIC.S (L870-L1046)
 *  Messages bilingues EN/FR exactement comme dans le STOS d'origine.
 *  --------------------------------------------------------------------
 */

// Codes d'erreur STOS (numéros officiels de la table merreur)
export const ERR = {
  NOT_DONE:        0,   // erreurs éditeur
  BAD_FILE:        1,
  OUT_MEM_EDIT:    2,
  NO_LINE:         3,
  LINE_EXISTS:     4,
  SEARCH_FAILED:   5,
  LINE_TOO_LONG:   6,
  CANT_CONT:       7,
  OUT_MEM:         8,   // erreurs fatales
  FOLLOW_LONG:     9,
  PRT_NOT_READY:  10,
  CANT_RENUM:     11,
  SYNTAX:         12,   // erreurs normales
  FON_CALL:       13,
  ILL_DIRECT:     14,
  ILL_PROG:       15,
  IN_OUT:         16,
  BREAK:          17,
  STOP:           17,   // même message "Break"/"Stop"
  NO_ARRAY:       18,
  TYPE_MISMATCH:  19,
  NOT_IMPL:       20,
  OVERFLOW:       21,
  FOR_NO_NEXT:    22,
  NEXT_NO_FOR:    23,
  WHILE_NO_WEND:  24,
  WEND_NO_WHILE:  25,
  REP_NO_UNTIL:   26,
  UNTIL_NO_REP:   27,
  ARRAY_DIM:      28,
  UNDEF_LINE:     29,
  STRING_LONG:    30,
  BUS_ERROR:      31,
  ADDR_ERROR:     32,
  NO_DATA_LINE:   33,
  NO_MORE_DATA:   34,
  TOO_MANY_GOSUB: 35,
  RET_NO_GOSUB:   36,
  POP_NO_GOSUB:   37,
  RES_NO_ERR:     38,
  FN_NOT_DEF:     39,
  FN_CALL:        40,
  BANK_RES:       41,
  BANK_NOT_SCR:   42,
  BAD_SCR_ADDR:   43,
  BANK_NOT_RES:   44,
  RES_NOT_ALLOW:  45,
  DIV_ZERO:       46,
  NEGATIVE:       47,
  FILE_NOT_FOUND: 48,
  DRIVE_NOT_RDY:  49,
  DISK_PROT:      50,
  DISK_FULL:      51,
  DISK_ERROR:     52,
  BAD_FILE_NAME:  53,
  BAD_TIME:       54,
  BAD_DATE:       55,
  SPRITE_ERR:     56,
  MOVE_ERR:       57,
  ANIM_ERR:       58,
  FILE_NOT_OPEN:  59,
  FILE_TYPE:      60,
  INPUT_LONG:     61,
  FILE_OPEN:      62,
  FILE_CLOSED:    63,
  END_OF_FILE:    64,
  INPUT_LONG2:    65,
  FIELD_LONG:     66,
  FLASH_ERR:      67,
  WIND_RANGE:     68,
  WIND_OPEN:      69,
  WIND_NOT_OPEN:  70,
  WIND_SMALL:     71,
  WIND_LARGE:     72,
  CHAR_NOT_DEF:   73,
  TEXT_BUF_FULL:  74,
  MUSIC_NOT_DEF:  75,
  SYS_WIND:       76,
  SYS_CHAR:       77,
  CHAR_NOT_FOUND: 78,
  MENU_NOT_DEF:   79,
  BANK15_RES:     80,
  BANK15_MENU:    81,
  ILLEGAL_INST:   82,
  DRIVE_NO_CONN:  83,
  EXT_NOT_PRES:   84,
  SUBSCRIPT:      85,
  SCROLL_NOT_DEF: 86,
  NOT_SCR_BLOC:   87,
  GFX_MODE:       88,   // extension STAS : instruction graphique hors mode graphique
};

// Table bilingue [en, fr] — textes originaux de BASIC.S
const MESSAGES = [
  ["Not done",                          "Non effectué"],                     // 0
  ["Bad file format",                   "Mauvais format de fichier"],        // 1
  ["Out of memory",                     "Mémoire pleine"],                   // 2
  ["This line does not exist",          "Cette ligne n'existe pas"],         // 3
  ["This line already exists",          "Cette ligne existe déjà"],          // 4
  ["Search failed",                     "La recherche a échoué"],            // 5
  ["Line too long",                     "Ligne trop longue"],                // 6
  ["Can't continue",                    "Impossible de continuer"],          // 7
  ["Out of memory",                     "Mémoire pleine"],                   // 8
  ["Follow too long",                   "Follow trop long"],                 // 9
  ["Printer not ready",                 "L'imprimante n'est pas prête"],     // 10
  ["Can't renum",                       "Renumérotation impossible"],        // 11
  ["Syntax error",                      "Erreur de syntaxe"],                // 12
  ["Illegal function call",             "Appel illégal de fonction"],        // 13
  ["Illegal direct mode",               "Instruction interdite en mode direct"],    // 14
  ["Direct command used",               "Instruction interdite en mode programme"], // 15
  ["In/Out error",                      "Erreur d'entrée/sortie"],           // 16
  ["Break",                             "Stop"],                             // 17
  ["Non declared array",                "Tableau non déclaré"],              // 18
  ["Type mismatch",                     "Types de variable incompatibles"],  // 19
  ["Function not implemented",          "Fonction non implémentée"],         // 20
  ["Overflow error",                    "Dépassement de capacité"],          // 21
  ["For without next",                  "For sans next"],                    // 22
  ["Next without for",                  "Next sans for"],                    // 23
  ["While without wend",                "While sans wend"],                  // 24
  ["Wend without while",                "Wend sans while"],                  // 25
  ["Repeat without until",              "Repeat sans until"],                // 26
  ["Until without repeat",              "Until sans repeat"],                // 27
  ["Array already dimensioned",         "Tableau déjà défini"],              // 28
  ["Undefined line number",             "Numéro de ligne non défini"],       // 29
  ["String too long",                   "Chaîne trop longue"],               // 30
  ["Bus error",                         "Erreur de bus"],                    // 31
  ["Address error",                     "Erreur d'adresse"],                 // 32
  ["No data on this line",              "Pas de 'data' sur cette ligne"],    // 33
  ["No more data",                      "Plus de donnée"],                   // 34
  ["Too many gosubs",                   "Trop de gosubs"],                   // 35
  ["Return without gosub",              "Return sans gosub"],                // 36
  ["Pop without gosub",                 "Pop sans gosub"],                   // 37
  ["Resume without error",              "Resume sans erreur"],               // 38
  ["User function not defined",         "Fonction utilisateur non définie"], // 39
  ["Illegal user-function call",        "Mauvais appel de fonction utilisateur"], // 40
  ["Memory bank already reserved",      "Banque mémoire déjà réservée"],     // 41
  ["Memory bank not defined as screen", "Banque mémoire non écran"],         // 42
  ["Bad screen address",                "Mauvaise adresse d'écran"],         // 43
  ["Memory bank not reserved",          "Banque mémoire non réservée"],      // 44
  ["Resolution not allowed",            "Résolution non autorisée"],         // 45
  ["Division by zero",                  "Division par zéro"],                // 46
  ["Illegal negative operand",          "Opérande négatif"],                 // 47
  ["File not found",                    "Fichier introuvable"],              // 48
  ["Drive not ready",                   "Lecteur pas prêt"],                 // 49
  ["Disc is write protected",           "Disquette protégée"],               // 50
  ["Disc full",                         "Disquette pleine"],                 // 51
  ["Disc error",                        "Erreur disquette"],                 // 52
  ["Bad file name",                     "Mauvais nom de fichier"],           // 53
  ["Bad time",                          "Mauvaise heure"],                   // 54
  ["Bad date",                          "Mauvaise date"],                    // 55
  ["Sprite error",                      "Erreur de sprite"],                 // 56
  ["Movement declaration error",        "Mauvais appel de MOVE"],            // 57
  ["Animation declaration error",       "Mauvais appel d'ANIM"],             // 58
  ["File not open",                     "Fichier non ouvert"],               // 59
  ["File type mismatch",                "Mélange de types de fichiers"],     // 60
  ["Input string too long",             "Chaîne en entrée trop longue"],     // 61
  ["File already open",                 "Fichier déjà ouvert"],              // 62
  ["File already closed",               "Fichier déjà fermé"],               // 63
  ["End of file",                       "Fin de fichier"],                   // 64
  ["Input string too long",             "Chaîne en entrée trop longue"],     // 65
  ["Field too long",                    "Champ trop long"],                  // 66
  ["Flash declaration error",           "Mauvais appel de FLASH"],           // 67
  ["Window parameter out of range",     "Paramètre de fenêtre trop grand"],  // 68
  ["Window already opened",             "Fenêtre déjà ouverte"],             // 69
  ["Window not opened",                 "Fenêtre non ouverte"],              // 70
  ["Window too small",                  "Fenêtre trop petite"],              // 71
  ["Window too large",                  "Fenêtre trop grande"],              // 72
  ["Character set not defined",         "Jeux de caractères non défini"],    // 73
  ["No more text buffer space",         "Buffer texte plein"],               // 74
  ["Music not defined",                 "Musique non définie"],              // 75
  ["System window called",              "Appel d'une fenêtre système"],      // 76
  ["System character set called",       "Appel d'un jeu de caractères système"], // 77
  ["Character set not found",           "Jeu de caractères introuvable"],    // 78
  ["Menu not defined",                  "Menu non défini"],                  // 79
  ["Bank 15 already reserved",          "La banque 15 est déjà réservée"],   // 80
  ["Bank 15 is reserved for menus",     "La banque 15 est réservée pour les menus"], // 81
  ["Illegal instruction",               "Instruction illégale"],             // 82
  ["Drive not connected",               "Lecteur non connecté"],             // 83
  ["Extension not present",             "Extension non chargée"],            // 84
  ["Subscript out of range",            "Indice trop grand"],                // 85
  ["Scrolling not defined",             "Scrolling non défini"],             // 86
  ["String is not a screen bloc",       "La chaîne n'est pas un bloc écran"], // 87
  ["Graphics mode not active",          "Mode graphique non actif"],          // 88 (STAS)
];

/**
 * Exception BASIC STOS.
 * @param {number} code   Numéro d'erreur STOS (table merreur)
 * @param {number} line   Numéro de ligne où l'erreur s'est produite
 * @param {number} langue 0=EN, 1=FR (comme la variable "langue" de STOS)
 */
export class StosError extends Error {
  constructor(code, line = 0, langue = 0) {
    const [en, fr] = MESSAGES[code] ?? ["Unknown error", "Erreur inconnue"];
    const msg = langue === 1 ? fr : en;
    super(line > 0 ? msg + inlineSuffix(langue) + line : msg);
    this.code = code;
    this.line = line;
    this.langue = langue;
    this.stosMessage = msg;
  }
}

/** " in line " / " en ligne " — BASIC.S L1046 */
export function inlineSuffix(langue) {
  return langue === 1 ? " en ligne " : " in line ";
}
