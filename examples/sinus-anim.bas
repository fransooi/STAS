10 ' Vague sur fond noir : sinus + cosinus, projection en profondeur
20 ' (echos sombres decalles), balle qui tombe et rebondit sur la vague.
30 ' Meme programme pour la console ascii-art et les renderers web.
40 MODE 0
50 PAPER 15
60 PEN 0
70 DEG
80 P=0
90 BX=40
100 BY=10
110 V=0
120 CLS
130 FOR X=0 TO 319
140 S=110+INT(50*SIN(X*360/320+P))
150 C=110+INT(50*COS(X*360/320+P))
160 PLOT X,S+16,12:PLOT X,S+17,12
170 PLOT X,S+8,14:PLOT X,S+9,14
180 PLOT X,C+8,11:PLOT X,C+9,11
190 PLOT X,S-1,6:PLOT X,S,6:PLOT X,S+1,6
200 PLOT X,C-1,3:PLOT X,C,3:PLOT X,C+1,3
210 NEXT X
220 BAR BX-3,BY-3 TO BX+3,BY+3,1
230 V=V+1
240 BY=BY+V
250 W=110+INT(50*SIN(BX*360/320+P))
260 IF BY>=W-4 THEN BY=W-4:V=0-INT(V/2)
270 IF ABS(V)<2 AND BY>W-8 THEN BY=10:V=0
280 BX=BX+2
290 IF BX>316 THEN BX=4
300 LOCATE 1,24
310 PRINT "STAS vague 3D + balle - touche Q pour quitter"
320 K$=INKEY$
330 IF K$="q" THEN END
340 IF K$="Q" THEN END
350 P=P+6
360 WAIT 2
370 GOTO 120
