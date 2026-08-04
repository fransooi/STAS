10 ' Sinusoide sur le plan pixels 320x200 (MODE 0) : fond vert, courbe blanche.
20 ' Exemple statique STAS - l'ecran reste fige une fois le dessin fini.
30 MODE 0
40 PAPER 2
50 CLS
60 PEN 0
70 DEG
80 FOR X=0 TO 319
90 Y=100+INT(80*SIN(X*360/320))
100 PLOT X,Y-3:PLOT X,Y-2:PLOT X,Y-1:PLOT X,Y:PLOT X,Y+1:PLOT X,Y+2:PLOT X,Y+3
110 NEXT X
120 LOCATE 1,24
130 PRINT "STAS GFX - une sinusoide en pixels ASCII"
