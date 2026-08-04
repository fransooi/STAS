10 ' Sinusoide animee sur le plan pixels 320x200 (MODE 0).
20 ' La courbe defile ; la touche Q (ou q) arrete le programme.
30 MODE 0
40 PAPER 2
50 PEN 0
60 DEG
70 P=0
80 CLS
90 FOR X=0 TO 319
100 Y=100+INT(80*SIN(X*360/320+P))
110 PLOT X,Y-3:PLOT X,Y-2:PLOT X,Y-1:PLOT X,Y:PLOT X,Y+1:PLOT X,Y+2:PLOT X,Y+3
120 NEXT X
130 LOCATE 1,24
140 PRINT "STAS GFX anime - touche Q pour quitter"
150 K$=INKEY$
160 IF K$="q" THEN END
170 IF K$="Q" THEN END
180 P=P+6
190 WAIT 2
200 GOTO 80
