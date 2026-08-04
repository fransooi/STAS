/*
 *  STAS — STOS ASCII System
 *  --------------------------------------------------------------------
 *  Texte d'accueil — affiché quand STAS démarre sans programme.
 *  Par Francois Lionet. Bilingue : la langue suit celle de la machine.
 *  --------------------------------------------------------------------
 */

export const INTRO_FR = `-----------------------------------------
STAS - LA CONSOLE PREND VIE
Par Francois Lionet (c) 2026
Open-Source - Licence MIT.
-----------------------------------------

Vous vous souvenez des premiers temps de l'ordinateur?
Quand le DOS etait... SIMPLE.
SIMPLE>?

Oui... avant. encore avant. Oui la... vers les annees 82.
Le debut. Pas beaucoup d'instructions, hardware stable, stockage lent
mais fonctionnel.

Taper un chiffre dans la console, dans le CLI. Ca fait rien aujourd'hui.
Est-ce que ca marchait alors?
---
PS C:\\development\\runtime> 12
12
PS C:\\development\\runtime> 302
302
PS C:\\development\\runtime> 12 Print "Hello"
At line:1 char:4
+ 12 Print "Hello"
+    ~~~~~
Unexpected token 'Print' in expression or statement.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken

PS C:\\development\\runtime>
---

ET SI CA MARCHAIT?

ET SI JE POUVAIS TAPER STAS RUN ?

ET QUE CA MARCHAIT DANS CETTE CONSOLE>?

STAS RUN.

A vous. Je vous aide. Tapez:

10 Print "Hello STAS"
STAS RUN <RETURN>
`;

export const INTRO_EN = `-----------------------------------------
STAS - THE CONSOLE COMES ALIVE
By Francois Lionet (c) 2026
Open-Source - MIT License.
-----------------------------------------

Remember the early days of the computer?
When DOS was... SIMPLE.
SIMPLE>?

Yes... before. Even before. Yes, right there... around '82.
The beginning. Not many instructions, stable hardware, slow storage
but functional.

Type a number in the console, in the CLI. It does nothing today.
Did it work back then?
---
PS C:\\development\\runtime> 12
12
PS C:\\development\\runtime> 302
302
PS C:\\development\\runtime> 12 Print "Hello"
At line:1 char:4
+ 12 Print "Hello"
+    ~~~~~
Unexpected token 'Print' in expression or statement.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken

PS C:\\development\\runtime>
---

WHAT IF IT WORKED?

WHAT IF I COULD TYPE STAS RUN?

AND IT WORKED IN THIS CONSOLE?

STAS RUN.

Your turn. I'll help you. Type:

10 Print "Hello STAS"
STAS RUN <RETURN>
`;

/** Texte d'accueil selon la langue (0=EN, 1=FR — comme la variable "langue" du STOS) */
export function introText(langue) {
  return langue === 1 ? INTRO_FR : INTRO_EN;
}
